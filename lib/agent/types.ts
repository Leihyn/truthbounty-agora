// Agent decision contract.
//
// The agent reads reputation (TruthScores) + live venue state, then emits a set
// of AgentDecisions. Each decision is what gets handed to an execution adapter
// (Azuro / Overtime / Polymarket). Every decision carries its own `reasoning`
// string because "the AI decided this, and here's why" is the product — not a
// log line we bolt on afterward.

export type Venue = 'azuro' | 'overtime' | 'polymarket' | 'pancakeswap';

export type DecisionAction = 'copy' | 'skip';

/** One scored trader as the agent sees them (normalized from unified-leaderboard). */
export interface ScoredTrader {
  address: string;
  platform: string;       // the venue this track record was earned on
  truthScore: number;     // 0–1300
  tier: string;           // Bronze | Silver | Gold | Platinum | Diamond
  category?: string;      // sports | crypto | politics | ...
  edge?: number;          // proven edge (>=0) if available
  sampleSize?: number;    // # resolved bets behind the score
  recentPnlUsd?: number;  // recent performance if available
}

/** A live market the agent could take a position in, pulled from a venue route. */
export interface MarketSnapshot {
  venue: Venue;
  marketId: string;
  question: string;       // human-readable
  outcomes: string[];     // e.g. ["Yes", "No"]
  prices: number[];       // implied probabilities per outcome, 0..1
  closesAt?: string;      // ISO
  liquidityUsd?: number;
}

/** What the agent has to allocate, and the guardrails it must respect. */
export interface AgentContext {
  bookUsd: number;            // total USDC the agent controls on Arc
  freeUsd: number;            // unallocated USDC available this cycle
  maxPerTraderPct: number;    // diversification cap (e.g. 0.15)
  maxPerVenuePct: number;     // per-venue cap
  minTruthScore: number;      // hard floor to even consider a trader
  traders: ScoredTrader[];
  markets: MarketSnapshot[];
  openPositions: AgentPosition[];
}

export interface AgentDecision {
  action: DecisionAction;
  trader: string;             // address being copied (or skipped)
  venue: Venue;
  marketId?: string;          // required when action === 'copy'
  outcome?: string;           // which side
  sizeUsd?: number;           // USDC notional (from the Arc book)
  confidence: number;         // 0..1, the agent's own conviction
  reasoning: string;          // WHY — surfaced in the UI and the demo
}

export interface AgentPosition {
  trader: string;
  venue: Venue;
  marketId: string;
  outcome: string;
  sizeUsd: number;
  openedAt: string;
  txHash?: string;            // execution proof on the destination chain
  bridgeTxHash?: string;      // CCTP leg proof from Arc
}

/** The full output of one agent cycle — decisions + the meta-reasoning. */
export interface AgentCycleResult {
  cycleId: string;
  startedAt: string;
  model: string;
  thesis: string;             // the agent's top-level read of the board this cycle
  decisions: AgentDecision[];
  allocatedUsd: number;
  costUsd: number;            // what the agent paid for intelligence (x402 nanopayments)
}
