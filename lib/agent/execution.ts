// Execution adapters: turn an AgentDecision into a real on-chain position on the
// destination venue, after CCTP has delivered USDC there.
//
// One interface, multiple venues. The agent routes each decision to the adapter
// for its venue. Azuro (Polygon Amoy) is the can't-fail backbone; Overtime (Base)
// and Polymarket (CLOB) are gated stretches that implement the same interface.

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  parseUnits,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bridgeUsdc, type ChainKey } from './cctp';
import type { AgentDecision, Venue } from './types';

export interface ExecutionResult {
  decision: AgentDecision;
  bridgeTxHash?: Hex; // CCTP leg from Arc
  betTxHash?: Hex;    // the bet on the destination venue
  status: 'placed' | 'skipped' | 'failed';
  error?: string;
}

export interface ExecutionAdapter {
  venue: Venue;
  chain: ChainKey;
  /** Place a copy bet for `decision` using `sizeUsd` USDC already (or to be) on `chain`. */
  place(decision: AgentDecision): Promise<ExecutionResult>;
}

const VENUE_CHAIN: Record<Venue, ChainKey> = {
  azuro: 'polygon',
  polymarket: 'polygon',
  overtime: 'base',
  pancakeswap: 'polygon', // fallback only; not in the pitch
};

function walletFor(chain: ChainKey) {
  const rpc =
    chain === 'polygon'
      ? process.env.POLYGON_AMOY_RPC_URL
      : process.env.BASE_SEPOLIA_RPC_URL;
  const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as Hex);
  const transport = http(rpc);
  return {
    account,
    pub: createPublicClient({ transport }),
    wallet: createWalletClient({ account, transport }),
  };
}

// ---------------------------------------------------------------------------
// Azuro V3 (Polygon Amoy, v3.0.13) — peer-to-pool, signed-order model.
// V3 has NO ProxyFront. A bet is Relayer.betFor(OrderData[]) where each order
// carries a bettorSignature (signed by the agent) AND an oracleSignature + odds
// supplied by Azuro's Live Betting API. So placing a bet is: (1) CCTP USDC to
// Amoy, (2) request odds+oracle co-signature from the Live API, (3) sign the
// bettor order, (4) Relayer.betFor on-chain. Two external integration points are
// marked TODO: the Live API request/response shape and the EIP-712 domain.
// ---------------------------------------------------------------------------
const AZURO_RELAYER_ABI = parseAbi([
  'function betFor((address betOwner, (uint256 gameId, uint256 conditionId, uint8 conditionKind, uint64[] odds, uint128[] outcomes, uint128 potentialLossLimit, uint8 winningOutcomesCount)[] conditionDatas, uint8 betType, address oracle, bytes clientBetData, bytes bettorSignature, bytes oracleSignature)[] orders)',
]);

interface AzuroLiveQuote {
  gameId: bigint;
  conditionId: bigint;
  odds: bigint[];        // 1e12-scaled
  outcomes: bigint[];
  oracle: Address;
  oracleSignature: Hex;
  clientBetData: Hex;
}

export class AzuroAdapter implements ExecutionAdapter {
  venue: Venue = 'azuro';
  chain: ChainKey = 'polygon';

  async place(decision: AgentDecision): Promise<ExecutionResult> {
    if (decision.action !== 'copy' || !decision.sizeUsd || !decision.marketId) {
      return { decision, status: 'skipped' };
    }
    try {
      // 1. CCTP: move the position's USDC Arc -> Polygon Amoy. (On testnet the
      //    Azuro bet token differs from CCTP USDC — see AZURO_BET_TOKEN; the
      //    bridge leg proves Arc settlement, the bet uses the venue's token.)
      const amount = parseUnits(decision.sizeUsd.toString(), 6);
      const bridge = await bridgeUsdc('arc', 'polygon', amount);

      // 2. Ask Azuro's Live API for current odds + the oracle co-signature.
      const quote = await requestAzuroLiveQuote(decision.marketId, decision.outcome!);

      // 3. Sign the bettor side of the order (EIP-712).
      const { account, wallet, pub } = walletFor('polygon');
      const bettorSignature = await signAzuroOrder(account.address, quote, amount);

      // 4. Submit via the Relayer.
      const order = {
        betOwner: account.address,
        conditionDatas: [
          {
            gameId: quote.gameId,
            conditionId: quote.conditionId,
            conditionKind: 0, // prematch
            odds: quote.odds,
            outcomes: quote.outcomes,
            potentialLossLimit: amount,
            winningOutcomesCount: 1,
          },
        ],
        betType: 0, // ordinary
        oracle: quote.oracle,
        clientBetData: quote.clientBetData,
        bettorSignature,
        oracleSignature: quote.oracleSignature,
      } as const;

      const betTxHash = await wallet.writeContract({
        address: process.env.AZURO_RELAYER as Address,
        abi: AZURO_RELAYER_ABI,
        functionName: 'betFor',
        args: [[order]],
        account,
        chain: null,
      });
      await pub.waitForTransactionReceipt({ hash: betTxHash });

      return { decision, bridgeTxHash: bridge.mintTxHash, betTxHash, status: 'placed' };
    } catch (e) {
      return { decision, status: 'failed', error: (e as Error).message };
    }
  }
}

// INTEGRATION POINT 1: Azuro Live Betting API. POST the selection, get back live
// odds + the oracle's signature authorizing them. Shape per gem.azuro.org Live API.
async function requestAzuroLiveQuote(marketId: string, _outcome: string): Promise<AzuroLiveQuote> {
  const base = process.env.AZURO_LIVE_API_URL;
  if (!base) throw new Error('AZURO_LIVE_API_URL not set — Live API supplies odds + oracleSignature');
  const [conditionId, outcomeId] = marketId.split(':');
  const r = await fetch(`${base}/orders/odds`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ conditionId, outcomeId }),
  });
  if (!r.ok) throw new Error(`Azuro Live API ${r.status}`);
  const j = await r.json();
  return {
    gameId: BigInt(j.gameId),
    conditionId: BigInt(conditionId),
    odds: (j.odds as string[]).map(BigInt),
    outcomes: (j.outcomes as string[]).map(BigInt),
    oracle: j.oracle as Address,
    oracleSignature: j.oracleSignature as Hex,
    clientBetData: (j.clientBetData ?? '0x') as Hex,
  };
}

// INTEGRATION POINT 2: bettor EIP-712 signature over the order. Domain/types per
// Azuro V3 Relayer (gem.azuro.org bet-functions). Filled once the domain is read
// from the deployed Relayer (name/version/chainId/verifyingContract).
async function signAzuroOrder(
  _bettor: Address,
  _quote: AzuroLiveQuote,
  _amount: bigint,
): Promise<Hex> {
  // const sig = await wallet.signTypedData({ domain, types, primaryType: 'Order', message });
  throw new Error('signAzuroOrder: EIP-712 domain/types pending from Azuro V3 Relayer spec');
}

// Overtime (Base) and Polymarket (CLOB) adapters land in tasks #6 and #7 and
// implement ExecutionAdapter the same way (bridge -> place). Registry below lets
// the router pick by venue without the agent caring which chain it lands on.
const ADAPTERS: Partial<Record<Venue, ExecutionAdapter>> = {
  azuro: new AzuroAdapter(),
};

export function adapterFor(venue: Venue): ExecutionAdapter | undefined {
  return ADAPTERS[venue];
}

export async function executeDecisions(decisions: AgentDecision[]): Promise<ExecutionResult[]> {
  const out: ExecutionResult[] = [];
  for (const d of decisions) {
    if (d.action !== 'copy') {
      out.push({ decision: d, status: 'skipped' });
      continue;
    }
    const adapter = adapterFor(d.venue);
    if (!adapter) {
      out.push({ decision: d, status: 'failed', error: `no adapter for ${d.venue}` });
      continue;
    }
    out.push(await adapter.place(d));
  }
  return out;
}

export { VENUE_CHAIN };
