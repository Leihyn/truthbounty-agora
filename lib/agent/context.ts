// Assembles the agent's input from data TruthBounty already serves:
//   - reputation from /api/unified-leaderboard (Supabase trader_scores)
//   - live markets from the per-venue routes (/api/azuro, /api/overtime, ...)
//
// Everything here is tolerant: field names drift across the venue routes, so we
// map defensively and fall back rather than throw mid-cycle.

import { getScoreTier } from '../truthscore';
import type { AgentContext, MarketSnapshot, ScoredTrader, Venue } from './types';

const EXECUTION_VENUES: Venue[] = ['azuro', 'overtime', 'polymarket'];

function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeTrader(row: any): ScoredTrader | null {
  const address = row.address ?? row.wallet ?? row.trader ?? row.user;
  const truthScore = num(row.truth_score ?? row.truthScore ?? row.score);
  if (!address || truthScore == null) return null;
  // TruthBounty's unified-leaderboard returns `platforms: string[]`; older
  // shapes use a scalar `platform`. Take the first.
  const platform =
    (Array.isArray(row.platforms) ? row.platforms[0] : row.platform ?? row.venue ?? 'unknown') ||
    'unknown';
  // No explicit `edge` field on the live API; derive from win rate (odds-ROI
  // edge isn't exposed, so win-rate edge is a usable proxy for ranking).
  const winRate = num(row.winRate ?? row.win_rate);
  const edge = num(row.edge) ?? (winRate != null ? Math.max(0, winRate / 100 - 0.5) : undefined);
  return {
    address: String(address),
    platform: String(platform).toLowerCase(),
    truthScore,
    tier: typeof row.tier === 'string' ? row.tier : getScoreTier(truthScore),
    category: row.category ?? undefined,
    edge,
    sampleSize: num(row.sample_size ?? row.sampleSize ?? row.totalBets ?? row.total_bets ?? row.trades),
    recentPnlUsd: num(row.recent_pnl_usd ?? row.pnl_usd ?? row.pnl),
  };
}

function normalizeMarket(venue: Venue, row: any): MarketSnapshot | null {
  const marketId = row.conditionId ?? row.id ?? row.marketId ?? row.gameId;
  const question = row.title ?? row.question ?? row.name ?? row.market;
  if (!marketId || !question) return null;

  let outcomes: string[];
  let prices: number[];
  // Azuro/structured shape: outcomes: [{ id, name, odds }]
  if (Array.isArray(row.outcomes) && row.outcomes[0] && typeof row.outcomes[0] === 'object') {
    outcomes = row.outcomes.map((o: any) => String(o.name ?? o.outcome ?? o.id));
    prices = row.outcomes.map((o: any) => {
      const odds = num(o.odds);
      return odds && odds > 0 ? 1 / odds : num(o.price) ?? 0; // decimal odds -> implied prob
    });
  } else {
    let raw = row.outcomes ?? row.tokens?.map((t: any) => t.outcome) ?? ['Yes', 'No'];
    let rawP = row.prices ?? row.outcomePrices ?? row.tokens?.map((t: any) => num(t.price) ?? 0) ?? [];
    if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch {} }
    if (typeof rawP === 'string') { try { rawP = JSON.parse(rawP); } catch {} }
    outcomes = (raw as any[]).map(String);
    prices = (rawP as any[]).map((p) => num(p) ?? 0);
  }

  const startsAt = num(row.startsAt);
  return {
    venue,
    marketId: String(marketId),
    question: String(question),
    outcomes,
    prices,
    closesAt:
      row.closesAt ?? row.endDate ?? row.end_date ?? (startsAt ? new Date(startsAt * 1000).toISOString() : undefined),
    liquidityUsd: num(row.liquidity ?? row.liquidityUsd ?? row.volume),
  };
}

async function fetchJson(url: string): Promise<any> {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}

function asArray(j: any): any[] {
  return Array.isArray(j) ? j : j?.data ?? j?.results ?? j?.markets ?? j?.traders ?? j?.leaderboard ?? [];
}

export interface BuildOpts {
  baseUrl: string;
  bookUsd: number;
  freeUsd?: number;
  minTruthScore?: number;
  maxPerTraderPct?: number;
  maxPerVenuePct?: number;
  topTraders?: number;
  marketsPerVenue?: number;
}

export async function buildAgentContext(opts: BuildOpts): Promise<AgentContext> {
  const {
    baseUrl,
    bookUsd,
    freeUsd = bookUsd,
    minTruthScore = 650, // ~Gold floor: only copy proven edge
    maxPerTraderPct = 0.15,
    maxPerVenuePct = 0.5,
    topTraders = 25,
    marketsPerVenue = 8,
  } = opts;

  const lb = await fetchJson(`${baseUrl}/api/unified-leaderboard?limit=${topTraders}`).catch(() => null);
  const traders = asArray(lb)
    .map(normalizeTrader)
    .filter((t): t is ScoredTrader => !!t && t.truthScore >= minTruthScore)
    .slice(0, topTraders);

  const marketLists = await Promise.all(
    EXECUTION_VENUES.map(async (v) => {
      try {
        const j = await fetchJson(`${baseUrl}/api/${v}`);
        return asArray(j)
          .map((row) => normalizeMarket(v, row))
          .filter((m): m is MarketSnapshot => !!m)
          .slice(0, marketsPerVenue);
      } catch {
        return [];
      }
    }),
  );

  return {
    bookUsd,
    freeUsd,
    minTruthScore,
    maxPerTraderPct,
    maxPerVenuePct,
    traders,
    markets: marketLists.flat(),
    openPositions: [], // wired to the on-chain book in the settlement layer
  };
}
