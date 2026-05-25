// On-chain attestation of each decision cycle, on Arc. Records a hash of the
// agent's reasoning thesis plus the allocation outcome to the CycleRegistry
// contract — so the reasoning trace becomes a verifiable on-chain artifact
// (Arc Research #01) and every autonomous cycle is a real Arc settlement.
//
// Permissionless and cheap (gas in USDC). Best-effort: a keyless/RPC-less run
// just skips it.

import { createWalletClient, http, keccak256, parseAbi, stringToBytes, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { AgentCycleResult } from './types';

const ABI = parseAbi([
  'function attest(bytes32 thesisHash, uint256 allocatedUsdcE6, uint256 reservedUsdcE6, uint256 copies, uint256 skips, string model) returns (uint256)',
]);

const e6 = (usd: number) => BigInt(Math.max(0, Math.round(usd * 1e6)));

export async function attestCycle(result: AgentCycleResult, bookUsd: number): Promise<Hex | undefined> {
  const reg = process.env.ARC_CYCLE_REGISTRY as Address | undefined;
  if (!reg || !process.env.AGENT_PRIVATE_KEY || !process.env.ARC_RPC_URL) return undefined;

  const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as Hex);
  const wallet = createWalletClient({ account, transport: http(process.env.ARC_RPC_URL) });

  const copies = result.decisions.filter((d) => d.action === 'copy').length;
  const skips = result.decisions.filter((d) => d.action === 'skip').length;
  const reserved = Math.max(0, bookUsd - result.allocatedUsd);

  return wallet.writeContract({
    address: reg,
    abi: ABI,
    functionName: 'attest',
    args: [
      keccak256(stringToBytes(result.thesis)),
      e6(result.allocatedUsd),
      e6(reserved),
      BigInt(copies),
      BigInt(skips),
      result.model,
    ],
    account,
    chain: null,
  });
}
