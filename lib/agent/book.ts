// The agent's USDC book. Capital lives on Arc (Circle's stablecoin L1, where gas
// is natively USDC); working balances also sit on the execution chains after a
// CCTP bridge. The agent never holds a volatile native gas token anywhere — on
// the execution chains, Circle's Paymaster lets it pay gas in USDC too.
//
// This reads the real on-chain balances so the decision loop allocates against
// what the agent actually controls, not a hardcoded number.

import { createPublicClient, http, parseAbi, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const ERC20 = parseAbi(['function balanceOf(address) view returns (uint256)']);

interface ChainBalance {
  chain: 'arc' | 'polygon' | 'base';
  usdc: Address;
  rpcUrl?: string;
}

const CHAINS: ChainBalance[] = [
  { chain: 'arc', usdc: process.env.ARC_USDC as Address, rpcUrl: process.env.ARC_RPC_URL },
  { chain: 'polygon', usdc: process.env.POLYGON_AMOY_USDC as Address, rpcUrl: process.env.POLYGON_AMOY_RPC_URL },
  { chain: 'base', usdc: process.env.BASE_SEPOLIA_USDC as Address, rpcUrl: process.env.BASE_SEPOLIA_RPC_URL },
];

export interface BookState {
  address: Address;
  byChain: Record<string, number>; // USDC per chain
  totalUsd: number;
  gasToken: 'USDC'; // the agent holds only USDC — Arc native + Paymaster elsewhere
}

function agentAddress(): Address {
  return privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as Hex).address;
}

/** Read the agent's USDC balance across Arc + execution chains. */
export async function getBook(): Promise<BookState> {
  const address = agentAddress();
  const byChain: Record<string, number> = {};

  await Promise.all(
    CHAINS.map(async (c) => {
      if (!c.rpcUrl || !c.usdc) return;
      try {
        const pub = createPublicClient({ transport: http(c.rpcUrl) });
        const bal = (await pub.readContract({
          address: c.usdc,
          abi: ERC20,
          functionName: 'balanceOf',
          args: [address],
        })) as bigint;
        byChain[c.chain] = Number(bal) / 1e6;
      } catch {
        /* chain unreachable this cycle — omit */
      }
    }),
  );

  const totalUsd = Object.values(byChain).reduce((s, v) => s + v, 0);
  return { address, byChain, totalUsd, gasToken: 'USDC' };
}
