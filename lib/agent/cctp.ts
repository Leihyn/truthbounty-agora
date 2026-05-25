// Circle CCTP V2 bridge — the agent's capital lives on Arc and moves to the
// execution chain (Polygon Amoy for Azuro/Polymarket, Base Sepolia for Overtime)
// as native USDC via burn-and-mint. This is the load-bearing Circle integration.
//
// Flow (V2):
//   1. approve USDC -> TokenMessengerV2 (source = Arc)
//   2. depositForBurn(...)                                   [source tx]
//   3. poll Circle Iris for the attestation                 [off-chain]
//   4. receiveMessage(message, attestation) on destination  [dest tx -> USDC minted]
//
// Domains and contract addresses are env-driven: Arc is a newer CCTP domain, so
// we read its domain id + contracts from config rather than hardcoding a guess.

import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  pad,
  parseAbi,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// Circle CCTP V2 domain ids (stable across networks). Arc comes from env.
export const CCTP_DOMAIN = {
  ethereum: 0,
  avalanche: 1,
  optimism: 2,
  arbitrum: 3,
  base: 6,
  polygon: 7,
  arc: Number(process.env.ARC_CCTP_DOMAIN ?? -1), // set from Circle docs/Arc CLI
} as const;

export type ChainKey = 'arc' | 'polygon' | 'base';

interface ChainCfg {
  rpcUrl: string;
  domain: number;
  usdc: Address;
  tokenMessenger: Address;     // TokenMessengerV2
  messageTransmitter: Address; // MessageTransmitterV2
}

function cfg(chain: ChainKey): ChainCfg {
  const U = (s: string) => (process.env[s] ?? '') as string;
  const map: Record<ChainKey, ChainCfg> = {
    arc: {
      rpcUrl: U('ARC_RPC_URL'),
      domain: CCTP_DOMAIN.arc,
      usdc: U('ARC_USDC') as Address,
      tokenMessenger: U('ARC_TOKEN_MESSENGER') as Address,
      messageTransmitter: U('ARC_MESSAGE_TRANSMITTER') as Address,
    },
    polygon: {
      rpcUrl: U('POLYGON_AMOY_RPC_URL'),
      domain: CCTP_DOMAIN.polygon,
      usdc: U('POLYGON_AMOY_USDC') as Address,
      tokenMessenger: U('POLYGON_AMOY_TOKEN_MESSENGER') as Address,
      messageTransmitter: U('POLYGON_AMOY_MESSAGE_TRANSMITTER') as Address,
    },
    base: {
      rpcUrl: U('BASE_SEPOLIA_RPC_URL'),
      domain: CCTP_DOMAIN.base,
      usdc: U('BASE_SEPOLIA_USDC') as Address,
      tokenMessenger: U('BASE_SEPOLIA_TOKEN_MESSENGER') as Address,
      messageTransmitter: U('BASE_SEPOLIA_MESSAGE_TRANSMITTER') as Address,
    },
  };
  return map[chain];
}

const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
]);

// CCTP V2 TokenMessenger.depositForBurn
const TOKEN_MESSENGER_ABI = parseAbi([
  'function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold)',
]);

const MESSAGE_TRANSMITTER_ABI = parseAbi([
  'function receiveMessage(bytes message, bytes attestation) returns (bool)',
]);

const IRIS_BASE =
  process.env.CCTP_IRIS_URL || 'https://iris-api-sandbox.circle.com'; // sandbox = testnet

function clients(chain: ChainKey) {
  const c = cfg(chain);
  const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as Hex);
  const transport = http(c.rpcUrl);
  return {
    c,
    account,
    pub: createPublicClient({ transport }),
    wallet: createWalletClient({ account, transport }),
  };
}

export interface BridgeResult {
  burnTxHash: Hex;
  mintTxHash: Hex;
  amount: bigint;
  from: ChainKey;
  to: ChainKey;
}

/**
 * Bridge `amount` (6-decimal USDC base units) from Arc to a destination chain.
 * Returns both tx hashes — these are the on-chain proof we show in the demo.
 */
export async function bridgeUsdc(
  from: ChainKey,
  to: ChainKey,
  amount: bigint,
  recipient?: Address,
): Promise<BridgeResult> {
  const src = clients(from);
  const dst = clients(to);
  const mintRecipient = pad((recipient ?? src.account.address) as Hex, { size: 32 });
  const destinationCaller = pad('0x0000000000000000000000000000000000000000', { size: 32 }); // anyone may relay

  // 1. approve
  const allowance = (await src.pub.readContract({
    address: src.c.usdc,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [src.account.address, src.c.tokenMessenger],
  })) as bigint;
  if (allowance < amount) {
    const approveTx = await src.wallet.writeContract({
      address: src.c.usdc,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [src.c.tokenMessenger, amount],
      chain: null,
    });
    await src.pub.waitForTransactionReceipt({ hash: approveTx });
  }

  // 2. depositForBurn — minFinalityThreshold 1000 = fast (V2), maxFee 0 for testnet
  const burnTxHash = await src.wallet.writeContract({
    address: src.c.tokenMessenger,
    abi: TOKEN_MESSENGER_ABI,
    functionName: 'depositForBurn',
    args: [amount, dst.c.domain, mintRecipient, src.c.usdc, destinationCaller, BigInt(0), 1000],
    chain: null,
  });
  await src.pub.waitForTransactionReceipt({ hash: burnTxHash });

  // 3. attestation
  const { message, attestation } = await pollAttestation(src.c.domain, burnTxHash);

  // 4. receiveMessage on destination -> USDC minted
  const mintTxHash = await dst.wallet.writeContract({
    address: dst.c.messageTransmitter,
    abi: MESSAGE_TRANSMITTER_ABI,
    functionName: 'receiveMessage',
    args: [message, attestation],
    chain: null,
  });
  await dst.pub.waitForTransactionReceipt({ hash: mintTxHash });

  return { burnTxHash, mintTxHash, amount, from, to };
}

/** Poll Circle Iris until the burn message is attested (V2: ~30s fast finality). */
export async function pollAttestation(
  sourceDomain: number,
  txHash: Hex,
  timeoutMs = 120_000,
): Promise<{ message: Hex; attestation: Hex }> {
  const url = `${IRIS_BASE}/v2/messages/${sourceDomain}?transactionHash=${txHash}`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await fetch(url);
    if (r.ok) {
      const j = await r.json();
      const m = j?.messages?.[0];
      if (m && m.status === 'complete' && m.attestation && m.attestation !== 'PENDING') {
        return { message: m.message as Hex, attestation: m.attestation as Hex };
      }
    }
    await new Promise((res) => setTimeout(res, 4000));
  }
  throw new Error(`CCTP attestation timed out for ${txHash}`);
}
