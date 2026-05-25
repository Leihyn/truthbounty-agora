/**
 * TruthScore v3.0 - Unified Scoring System for Prediction Market Traders
 *
 * Measures trader skill using statistically conservative estimates.
 * Sample-size uncertainty is handled entirely by the edge estimators
 * (Wilson score for binary, conservative ROI for odds), NOT by a
 * separate confidence multiplier. This avoids the double-penalty
 * problem where small samples were penalized twice.
 *
 * Core Formula: TruthScore = min(1300, edge × 13000) × scaleMultiplier
 *
 * Both binary and odds markets use the same edge multiplier (13000)
 * so scores are directly comparable across platforms.
 *
 * References:
 * - Wilson, E.B. (1927). "Probable Inference, the Law of Succession"
 * - Agresti & Coull (1998). "Approximate is Better than 'Exact'"
 *
 * @module truthscore
 * @version 3.0.0
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

export const TRUTHSCORE_CONFIG = {
  // Minimum requirements for eligibility
  MIN_BETS_BINARY: 30,        // Binary markets (50/50)
  MIN_BETS_ODDS: 20,          // Odds-based markets

  // Sample size dampener: scores scale linearly from 0% at MIN_BETS to 100% at FULL_SCORE_BETS.
  // Prevents lucky streak attacks (30/30 wins → Diamond) while being less harsh
  // than the v3.0 dampener (which required 100 bets for full score).
  FULL_SCORE_BETS_BINARY: 50,  // Full score at 50+ bets for binary (was 100)
  FULL_SCORE_BETS_ODDS: 40,    // Full score at 40+ trades for odds (was 75)
  MIN_VOLUME_ODDS: 1000,       // Minimum volume for odds markets (assumes USD-equivalent)

  // Wilson Score z-value (1.96 = 95% confidence interval)
  WILSON_Z: 1.96,

  // Score architecture (two-component design):
  //
  //   totalScore = skillScore + scaleBonus   (capped at MAX_SCORE)
  //
  // skillScore — pure edge via log curve, range 0–MAX_SKILL_SCORE (1100)
  //   formula: MAX_SKILL_SCORE × (1 − e^(−edge / EDGE_THRESHOLD))
  //
  //   v3.1 calibration (EDGE_THRESHOLD=0.08):
  //   2%  edge → 242   (Silver)     — slight proven advantage
  //   5%  edge → 503   (Platinum)   — strong edge, sustained
  //   8%  edge → 686   (Diamond)    — elite performer
  //   12% edge → 838   (Diamond)    — exceptional
  //   20% edge → 990   (Legendary)  — world-class
  //
  // scaleBonus — additive 0–200 from volume/PnL, but CAPPED within current tier.
  //   Scale bonus can push score to the top of the current skill tier, but NOT
  //   into a higher tier. This prevents high-volume mediocre traders from
  //   reaching Diamond/Legendary on volume alone.
  //
  MAX_SCORE: 1300,
  MAX_TOTAL_SCORE: 1300,      // Alias for MAX_SCORE (used by external files)
  MAX_SKILL_SCORE: 1100,      // Skill-only ceiling (log curve target)
  EDGE_THRESHOLD: 0.08,       // Default fallback (used when no platform-specific threshold)

  // v3.1 Data-calibrated per-platform edge thresholds.
  // Each threshold is set so that the 95th percentile trader on that platform
  // reaches Diamond (~800 pts). This guarantees top ~5% = Diamond on every
  // platform regardless of how different the edge distributions are.
  //
  // Formula: threshold = edge_p95 / -ln(1 - 800/1100)
  // Calibrated from real leaderboard data on 2026-04-05.

  // Scale bonus (additive, 0–200, tier-capped)
  MAX_SCALE_BONUS: 200,
  SCALE_BONUS_RATE: 67,       // pts per decade of volume above base
  ODDS_SCALE_BONUS_BASE: 100000,   // $100K floor for odds volume
  BINARY_SCALE_BONUS_BASE: 1000,   // $1K floor for binary PnL

  // Confidence curve (informational — reported but NOT multiplied into score)
  CONFIDENCE_SCALE: 200,

  // ROI confidence for odds markets
  ROI_VARIANCE_ESTIMATE: 0.25,
  ROI_Z_SCORE: 1.5,
} as const;

// ============================================================================
// TYPES
// ============================================================================

export type MarketType = 'binary' | 'odds';

export interface TruthScoreInput {
  // For binary markets
  wins?: number;
  losses?: number;
  totalBets?: number;

  // For odds-based markets
  pnl?: number;
  volume?: number;
  trades?: number;

  // For scale multiplier
  pnlUsd?: number;     // Binary: USD-equivalent PnL for scale multiplier
  volumeUsd?: number;  // Odds: USD volume (if different from volume field)

  // Platform identification
  platform: string;

  // Recency tracking (preserved for API compat, not used in scoring)
  lastTradeAt?: Date | string | number;

  // Per-platform overrides
  varianceEstimate?: number;  // Override default ROI_VARIANCE_ESTIMATE
  minBetsOverride?: number;   // Override default minimum bets threshold
}

export interface TruthScoreResult {
  score: number;             // Base score before scale multiplier (0-1300)
  totalScore: number;        // Final score after scale multiplier (0-1300)
  eligible: boolean;

  // Breakdown components
  edge: number;              // Proven edge percentage (always >= 0)
  edgePoints: number;        // Points from edge (0-1300)
  confidence: number;        // Sample-size confidence (informational, 0-100%)
  recencyBonus: number;      // Always 0 (kept for API compat)
  scaleMultiplier: number;   // PnL multiplier (binary) or volume multiplier (odds)

  // Negative edge detection
  hasNegativeEdge?: boolean; // True when raw edge is negative (anti-skill signal)
  rawEdge?: number;          // Unclipped edge (can be negative)

  // Raw metrics
  rawWinRate?: number;       // Actual win rate (binary only)
  provenWinRate?: number;    // Wilson-adjusted win rate (binary only)
  rawROI?: number;           // Actual ROI percentage (odds only)
  provenROI?: number;        // Conservative ROI percentage (odds only)

  // Brier Score (odds markets with resolved outcomes)
  brierScore?: number;       // Mean Brier score (0=perfect, 1=worst). Lower is better.
  brierAdvantage?: number;   // Market Brier - User Brier. Positive = beat the market.

  // Meta
  marketType: MarketType;
  sampleSize: number;
  lastTradeAt?: Date;
  reason?: string;
}

export interface ScoreBreakdown {
  skill: string;
  confidence: string;
  recency: string;
  explanation: string;
}

// ============================================================================
// PLATFORM CLASSIFICATION
// ============================================================================

/**
 * Binary markets have fixed 50/50 odds (up/down, yes/no at even money).
 * Win rate is the correct metric.
 */
const BINARY_PLATFORMS = [
  'pancakeswap',
  'speedmarkets',
  'speed markets',
  'thales',
] as const;

/**
 * Odds-based markets have variable odds/probabilities.
 * ROI is the correct metric because win rate is meaningless
 * (betting on -500 favorites wins 80%+ but loses money).
 */
const ODDS_PLATFORMS = [
  'polymarket',
  'overtime',
  'azuro',
  'sxbet',
  'sx bet',
  'limitless',
  'drift',
  'manifold',
  'kalshi',
  'metaculus',
  'gnosis',
  'omen',
] as const;

/**
 * Per-platform ROI variance estimates.
 *
 * These are approximate and should be calibrated with real data when available.
 * Sports markets (Azuro, Overtime, SX Bet) have lower variance because outcomes
 * are more predictable (standard odds). Event prediction markets (Polymarket)
 * have higher variance due to novel/unique events.
 *
 * TODO: Calibrate from historical platform data (compute actual stddev of
 * per-trade ROI across a sample of traders per platform).
 */
const PLATFORM_VARIANCE: Record<string, number> = {
  'azuro': 0.10,
  'overtime': 0.10,
  'sxbet': 0.10,
  'sx bet': 0.10,
  'polymarket': 0.25,
  'limitless': 0.20,
};

/**
 * Data-calibrated per-platform edge thresholds.
 *
 * Each value is set so that the 95th-percentile trader on that platform
 * maps to Diamond tier (~800 pts out of 1100 max skill).
 *
 * Binary markets have much tighter edge distributions (PancakeSwap p95 = 4.6%)
 * than odds markets (Polymarket p95 = 47.7%), so they need very different
 * thresholds. Using a single global threshold produces wildly uneven
 * distributions across platforms.
 *
 * Calibrated from real leaderboard data (2026-04-05).
 * Re-calibrate periodically as trader populations shift.
 */
const PLATFORM_EDGE_THRESHOLD: Record<string, number> = {
  // Binary markets — tight edges, low thresholds
  'pancakeswap': 0.035,
  'speedmarkets': 0.19,
  'speed markets': 0.19,
  'thales': 0.10,
  // Odds markets — wider edges, higher thresholds
  'polymarket': 0.37,
  'azuro': 0.25,
  'overtime': 0.14,
  'sxbet': 0.20,
  'sx bet': 0.20,
  'limitless': 0.20,
  'drift': 0.20,
  'manifold': 0.20,
  'kalshi': 0.25,
  'metaculus': 0.15,
  'gnosis': 0.20,
  'omen': 0.20,
};

/**
 * Get calibrated edge threshold for a platform
 */
export function getPlatformEdgeThreshold(platform: string): number {
  const normalized = platform.toLowerCase();
  return PLATFORM_EDGE_THRESHOLD[normalized] ?? TRUTHSCORE_CONFIG.EDGE_THRESHOLD;
}

/**
 * Get variance estimate for a platform
 */
export function getPlatformVariance(platform: string): number {
  const normalized = platform.toLowerCase();
  return PLATFORM_VARIANCE[normalized] ?? TRUTHSCORE_CONFIG.ROI_VARIANCE_ESTIMATE;
}

/**
 * Determine market type from platform name
 */
export function getMarketType(platform: string): MarketType {
  const normalized = platform.toLowerCase().replace(/[^a-z]/g, '');

  for (const binary of BINARY_PLATFORMS) {
    if (normalized.includes(binary.replace(/[^a-z]/g, ''))) {
      return 'binary';
    }
  }

  return 'odds';
}

// ============================================================================
// WILSON SCORE IMPLEMENTATION
// ============================================================================

/**
 * Wilson Score Lower Bound
 *
 * Conservative estimate of the true win rate given observed data.
 * This IS the confidence adjustment for binary markets — small samples
 * get heavily penalized, large samples converge to the true rate.
 *
 * Examples:
 * - 3/3 wins   → 0.438 (not 1.0!)
 * - 60/100     → 0.502
 * - 600/1000   → 0.569
 *
 * Formula: (p + z²/2n - z√(p(1-p)/n + z²/4n²)) / (1 + z²/n)
 */
export function wilsonScoreLower(
  wins: number,
  total: number,
  z: number = TRUTHSCORE_CONFIG.WILSON_Z
): number {
  if (total === 0) return 0;
  if (wins < 0 || wins > total) return 0;

  const p = wins / total;
  const denominator = 1 + (z * z) / total;
  const center = p + (z * z) / (2 * total);
  const spread = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);

  return Math.max(0, (center - spread) / denominator);
}

// ============================================================================
// CONFIDENCE (INFORMATIONAL)
// ============================================================================

/**
 * Calculate confidence level based on sample size (informational only).
 *
 * NOT multiplied into the score — Wilson and conservative ROI already
 * handle sample-size uncertainty. This is reported for display purposes.
 *
 * Formula: confidence = 1 - e^(-n/scale)
 *
 * Examples (scale=200):
 * - 30 bets  → 14%
 * - 100 bets → 39%
 * - 200 bets → 63%
 * - 500 bets → 92%
 * - 1000 bets → 99%
 */
export function calculateConfidence(sampleSize: number): number {
  if (sampleSize <= 0) return 0;
  return 1 - Math.exp(-sampleSize / TRUTHSCORE_CONFIG.CONFIDENCE_SCALE);
}

// ============================================================================
// ROI CONFIDENCE BOUNDS
// ============================================================================

/**
 * Calculate conservative ROI with confidence bounds
 *
 * This IS the confidence adjustment for odds markets — small samples
 * get a large stdError penalty, large samples converge to the true ROI.
 *
 * Conservative ROI = Observed ROI - z × √(variance / trades)
 *
 * Examples (variance=0.25, z=1.5):
 * - 10% ROI, 50 trades  → -0.6% (not proven yet)
 * - 10% ROI, 200 trades → 4.7%  (building evidence)
 * - 10% ROI, 500 trades → 6.6%  (strong evidence)
 */
export function calculateConservativeROI(
  pnl: number,
  volume: number,
  trades: number,
  varianceEstimate?: number
): number {
  if (volume <= 0 || trades <= 0) return 0;

  const roi = pnl / volume;
  const { ROI_Z_SCORE } = TRUTHSCORE_CONFIG;
  const variance = varianceEstimate ?? TRUTHSCORE_CONFIG.ROI_VARIANCE_ESTIMATE;
  const stdError = Math.sqrt(variance / trades);

  return roi - (ROI_Z_SCORE * stdError);
}

// ============================================================================
// BRIER SCORE
// ============================================================================

/**
 * A resolved prediction with the trader's probability estimate and the outcome.
 *
 * Example: trader bought YES at $0.65 → probability = 0.65, outcome = 1 (if YES won)
 */
export interface ResolvedPrediction {
  probability: number;     // Trader's implied probability (0–1), e.g. buy price
  outcome: number;         // 1 = YES resolved, 0 = NO resolved
  marketProbability?: number; // Market consensus probability at time of trade (for advantage calc)
}

/**
 * Brier Score — standard calibration metric for probabilistic forecasts.
 *
 * Formula: mean( (probability - outcome)^2 )
 *
 * Range: 0 (perfect) to 1 (worst possible).
 * A coin-flip baseline (always predict 0.5) scores 0.25.
 *
 * Examples:
 * - Predict 0.9 on events that happen 90% of the time → ~0.09 (excellent)
 * - Predict 0.5 on everything → 0.25 (no skill)
 * - Predict 0.9 on events that happen 10% of the time → ~0.81 (terrible)
 */
export function calculateBrierScore(predictions: ResolvedPrediction[]): number {
  if (predictions.length === 0) return 0;
  const sumSquaredError = predictions.reduce(
    (sum, p) => sum + (p.probability - p.outcome) ** 2,
    0
  );
  return sumSquaredError / predictions.length;
}

/**
 * Brier Advantage — how much the trader beats the market consensus.
 *
 * Formula: mean( (marketProb - outcome)^2 ) - mean( (traderProb - outcome)^2 )
 *
 * Positive = trader is better calibrated than the market.
 * Zero = no edge over market odds.
 * Negative = market was better calibrated.
 */
export function calculateBrierAdvantage(predictions: ResolvedPrediction[]): number {
  const withMarket = predictions.filter(p => p.marketProbability !== undefined);
  if (withMarket.length === 0) return 0;

  const traderBrier = withMarket.reduce(
    (sum, p) => sum + (p.probability - p.outcome) ** 2,
    0
  ) / withMarket.length;

  const marketBrier = withMarket.reduce(
    (sum, p) => sum + ((p.marketProbability! - p.outcome) ** 2),
    0
  ) / withMarket.length;

  return marketBrier - traderBrier;
}

/**
 * Brier Score tier label for display.
 */
export function getBrierTier(brierScore: number): string {
  if (brierScore <= 0.10) return 'Elite';
  if (brierScore <= 0.15) return 'Excellent';
  if (brierScore <= 0.20) return 'Good';
  if (brierScore <= 0.25) return 'Average';
  return 'Poor';
}

/**
 * Format Brier score for display (3 decimal places).
 */
export function formatBrierScore(brierScore: number): string {
  return brierScore.toFixed(3);
}

// ============================================================================
// SCALE MULTIPLIER CALCULATIONS
// ============================================================================

/**
 * PnL-based scale bonus for binary markets (additive, 0–200 pts).
 *
 * Binary skill scores use only win rate — PnL has no influence there.
 * This bonus is the first and only time profit matters for binary traders.
 *
 * Formula: min(200, 67 × log10(pnlUsd / 1000))
 * $1K → 0,  $10K → 67,  $100K → 134,  $1M → 200 (max)
 */
export function calculateBinaryScaleBonus(pnlUsd: number): number {
  const { BINARY_SCALE_BONUS_BASE, SCALE_BONUS_RATE, MAX_SCALE_BONUS } = TRUTHSCORE_CONFIG;
  if (pnlUsd <= BINARY_SCALE_BONUS_BASE) return 0;
  return Math.min(MAX_SCALE_BONUS, Math.round(SCALE_BONUS_RATE * Math.log10(pnlUsd / BINARY_SCALE_BONUS_BASE)));
}

/**
 * Volume-based scale bonus for odds markets (additive, 0–200 pts).
 *
 * Odds skill scores already encode PnL via ROI. Volume adds a
 * "proven at scale" signal — 4% ROI on $234M is more credible than
 * 4% ROI on $1M. Can't be gamed because wash trading dilutes ROI.
 *
 * Formula: min(200, 67 × log10(volume / 100000))
 * $100K → 0,  $1M → 67,  $10M → 133,  $100M → 200 (max)
 */
export function calculateOddsScaleBonus(volumeUsd: number): number {
  const { ODDS_SCALE_BONUS_BASE, SCALE_BONUS_RATE, MAX_SCALE_BONUS } = TRUTHSCORE_CONFIG;
  if (volumeUsd <= ODDS_SCALE_BONUS_BASE) return 0;
  return Math.min(MAX_SCALE_BONUS, Math.round(SCALE_BONUS_RATE * Math.log10(volumeUsd / ODDS_SCALE_BONUS_BASE)));
}

// ============================================================================
// TIER-CAPPED SCALE BONUS
// ============================================================================

/**
 * Tier thresholds for scale bonus capping.
 * Scale bonus can push score to the top of the current skill tier but NOT
 * into a higher tier. This prevents high-volume mediocre traders from
 * reaching Diamond/Legendary on volume alone.
 */
const TIER_CEILINGS = [150, 300, 500, 800, 1000, 1300]; // Silver, Gold, Platinum, Diamond, Legendary, max

function applyTierCappedScaleBonus(skillScore: number, scaleBonus: number, maxScore: number): number {
  if (scaleBonus <= 0) return Math.min(maxScore, skillScore);

  // Find which tier the skill score alone falls into
  let tierCeiling = maxScore;
  for (const ceiling of TIER_CEILINGS) {
    if (skillScore < ceiling) {
      tierCeiling = ceiling;
      break;
    }
  }

  // Scale bonus can push to the top of the current tier, not beyond
  // Exception: if skill score already qualifies for Legendary (1000+), allow full bonus
  if (skillScore >= 1000) {
    return Math.min(maxScore, skillScore + scaleBonus);
  }

  return Math.min(tierCeiling - 1, skillScore + scaleBonus);
}

// ============================================================================
// MAIN SCORING FUNCTIONS
// ============================================================================

/**
 * Calculate TruthScore for Binary Markets
 *
 * Formula:
 * 1. provenWinRate = wilsonScoreLower(wins, total) — already penalizes small samples
 * 2. edge = max(0, provenWinRate - 0.5)
 * 3. score = min(1300, edge × 13000)
 * 4. totalScore = min(1300, score × scaleMultiplier)
 *
 * No separate confidence multiplier — Wilson handles sample-size uncertainty.
 *
 * Examples:
 * - 55% on 100 bets  → Wilson ≈ 0.452, edge = 0, score = 0 (not proven)
 * - 60% on 200 bets  → Wilson ≈ 0.530, edge = 3%, score = 390
 * - 60% on 500 bets  → Wilson ≈ 0.558, edge = 5.8%, score = 754
 * - 65% on 200 bets  → Wilson ≈ 0.583, edge = 8.3%, score = 1079
 * - 70% on 100 bets  → Wilson ≈ 0.604, edge = 10.4%, score = 1300 (capped)
 */
export function scoreBinaryTrader(
  wins: number,
  total: number,
  platform: string,
  lastTradeAt?: Date | string | number,
  pnlUsd?: number,
  minBetsOverride?: number
): TruthScoreResult {
  const { MIN_BETS_BINARY } = TRUTHSCORE_CONFIG;
  const minBets = minBetsOverride ?? MIN_BETS_BINARY;

  if (total < minBets) {
    return {
      score: 0,
      totalScore: 0,
      eligible: false,
      edge: 0,
      edgePoints: 0,
      confidence: 0,
      recencyBonus: 0,
      scaleMultiplier: 1.0,
      rawWinRate: total > 0 ? wins / total : 0,
      provenWinRate: 0,
      marketType: 'binary',
      sampleSize: total,
      lastTradeAt: lastTradeAt ? new Date(lastTradeAt) : undefined,
      reason: `Need ${minBets}+ bets (have ${total})`,
    };
  }

  const rawWinRate = wins / total;
  const provenWinRate = wilsonScoreLower(wins, total);

  // Edge = how much above 50% (coin flip baseline)
  const rawEdge = provenWinRate - 0.5;
  const edge = Math.max(0, rawEdge);
  const edgePercent = edge * 100;

  // Skill score: log curve of proven edge (0–MAX_SKILL_SCORE)
  // Uses platform-calibrated threshold so top ~5% of each platform reaches Diamond
  const { MAX_SCORE, MAX_SKILL_SCORE, FULL_SCORE_BETS_BINARY } = TRUTHSCORE_CONFIG;
  const edgeThreshold = getPlatformEdgeThreshold(platform);
  const rawEdgePoints = Math.round(MAX_SKILL_SCORE * (1 - Math.exp(-edge / edgeThreshold)));

  // Sample size dampener: linear ramp from MIN_BETS to FULL_SCORE_BETS.
  // Prevents lucky streak attacks (30/30 → Diamond). Wilson penalizes small
  // samples but not enough — 30/30 still yields 88.6% lower bound.
  // This adds a second layer: 30 bets → 30% of score, 100+ bets → 100%.
  const dampener = Math.min(1, total / FULL_SCORE_BETS_BINARY);
  const edgePoints = Math.round(rawEdgePoints * dampener);

  // Confidence is informational only — not in the formula
  const confidence = calculateConfidence(total);
  const confidencePercent = Math.round(confidence * 100);

  const baseScore = edgePoints;

  // Scale bonus: additive 0–200 pts from PnL, capped within current tier
  const scaleBonus = pnlUsd !== undefined ? calculateBinaryScaleBonus(pnlUsd) : 0;
  // Scale bonus is additive, no tier cap. Per-platform calibrated thresholds
  // already prevent volume from inflating scores beyond skill.
  const totalScore = Math.min(MAX_SCORE, baseScore + scaleBonus);
  const scaleMultiplier = baseScore > 0 ? Math.round((totalScore / baseScore) * 100) / 100 : 1;

  return {
    score: baseScore,
    totalScore,
    eligible: true,
    edge: Math.round(edgePercent * 10) / 10,
    edgePoints,
    confidence: confidencePercent,
    recencyBonus: 0,
    scaleMultiplier: Math.round(scaleMultiplier * 100) / 100,
    hasNegativeEdge: rawEdge < 0,
    rawEdge: Math.round(rawEdge * 1000) / 10,
    rawWinRate: Math.round(rawWinRate * 1000) / 10,
    provenWinRate: Math.round(provenWinRate * 1000) / 10,
    marketType: 'binary',
    sampleSize: total,
    lastTradeAt: lastTradeAt ? new Date(lastTradeAt) : undefined,
  };
}

/**
 * Calculate TruthScore for Odds-Based Markets
 *
 * Formula:
 * 1. rawROI = pnl / volume
 * 2. provenROI = rawROI - z × √(variance / trades) — already penalizes small samples
 * 3. edge = max(0, provenROI)
 * 4. score = min(1300, edge × 13000)
 * 5. totalScore = min(1300, score × scaleMultiplier)
 *
 * No separate confidence multiplier — conservative ROI handles sample-size.
 *
 * Examples (variance=0.25):
 * - 10% ROI, 50 trades   → conservative = -0.6%, score = 0 (not proven)
 * - 10% ROI, 200 trades  → conservative = 4.7%, score = 611
 * - 20% ROI, 100 trades  → conservative = 12.5%, score = 1300 (capped)
 *
 * Examples (variance=0.10, sports):
 * - 10% ROI, 100 trades  → conservative = 5.3%, score = 689
 * - 5% ROI, 200 trades   → conservative = 1.7%, score = 221
 */
export function scoreOddsTrader(
  pnl: number,
  volume: number,
  trades: number,
  platform: string,
  lastTradeAt?: Date | string | number,
  volumeUsd?: number,
  varianceEstimate?: number,
  minBetsOverride?: number
): TruthScoreResult {
  const { MIN_BETS_ODDS, MIN_VOLUME_ODDS } = TRUTHSCORE_CONFIG;
  const minBets = minBetsOverride ?? MIN_BETS_ODDS;

  // Eligibility: need minimum trades OR $1M+ volume (high volume = sufficient data
  // even with few "markets traded", since each market may contain hundreds of trades)
  const HIGH_VOLUME_OVERRIDE = 1_000_000;
  const hasEnoughTrades = trades >= minBets;
  const hasHighVolume = volume >= HIGH_VOLUME_OVERRIDE && trades >= 1;

  if (!hasEnoughTrades && !hasHighVolume) {
    return {
      score: 0,
      totalScore: 0,
      eligible: false,
      edge: 0,
      edgePoints: 0,
      confidence: 0,
      recencyBonus: 0,
      scaleMultiplier: 1.0,
      rawROI: volume > 0 ? (pnl / volume) * 100 : 0,
      provenROI: 0,
      marketType: 'odds',
      sampleSize: trades,
      lastTradeAt: lastTradeAt ? new Date(lastTradeAt) : undefined,
      reason: `Need ${minBets}+ trades or $1M+ volume (have ${trades} trades, $${Math.round(volume).toLocaleString()} vol)`,
    };
  }

  // Volume check — assumes USD-equivalent (platform endpoints convert before calling)
  if (volume < MIN_VOLUME_ODDS) {
    return {
      score: 0,
      totalScore: 0,
      eligible: false,
      edge: 0,
      edgePoints: 0,
      confidence: 0,
      recencyBonus: 0,
      scaleMultiplier: 1.0,
      rawROI: volume > 0 ? (pnl / volume) * 100 : 0,
      provenROI: 0,
      marketType: 'odds',
      sampleSize: trades,
      lastTradeAt: lastTradeAt ? new Date(lastTradeAt) : undefined,
      reason: `Need $${MIN_VOLUME_ODDS}+ volume (have $${Math.round(volume)})`,
    };
  }

  const rawROI = pnl / volume;
  const provenROI = calculateConservativeROI(pnl, volume, trades, varianceEstimate);

  // Edge = positive proven ROI
  const rawEdge = provenROI;
  const edge = Math.max(0, rawEdge);
  const edgePercent = edge * 100;

  // Skill score: log curve of proven edge (0–MAX_SKILL_SCORE)
  // Uses platform-calibrated threshold so top ~5% of each platform reaches Diamond
  const { MAX_SCORE, MAX_SKILL_SCORE, FULL_SCORE_BETS_ODDS } = TRUTHSCORE_CONFIG;
  const edgeThreshold = getPlatformEdgeThreshold(platform);
  const rawEdgePoints = Math.round(MAX_SKILL_SCORE * (1 - Math.exp(-edge / edgeThreshold)));

  // Sample size dampener (same as binary — prevents small-sample gaming)
  const dampener = Math.min(1, trades / FULL_SCORE_BETS_ODDS);
  const edgePoints = Math.round(rawEdgePoints * dampener);

  // Confidence is informational only
  const confidence = calculateConfidence(trades);
  const confidencePercent = Math.round(confidence * 100);

  const baseScore = edgePoints;

  // Scale bonus: additive 0–200 pts from volume, capped within current tier
  const effectiveVolume = volumeUsd !== undefined ? volumeUsd : volume;
  const scaleBonus = calculateOddsScaleBonus(effectiveVolume);
  // Scale bonus is additive, no tier cap. Per-platform calibrated thresholds
  // already prevent volume from inflating scores beyond skill.
  const totalScore = Math.min(MAX_SCORE, baseScore + scaleBonus);
  const scaleMultiplier = baseScore > 0 ? Math.round((totalScore / baseScore) * 100) / 100 : 1;

  return {
    score: baseScore,
    totalScore,
    eligible: true,
    edge: Math.round(edgePercent * 10) / 10,
    edgePoints,
    confidence: confidencePercent,
    recencyBonus: 0,
    scaleMultiplier: Math.round(scaleMultiplier * 100) / 100,
    hasNegativeEdge: rawEdge < 0,
    rawEdge: Math.round(rawEdge * 1000) / 10,
    rawROI: Math.round(rawROI * 1000) / 10,
    provenROI: Math.round(provenROI * 1000) / 10,
    marketType: 'odds',
    sampleSize: trades,
    lastTradeAt: lastTradeAt ? new Date(lastTradeAt) : undefined,
  };
}

// ============================================================================
// UNIFIED INTERFACE
// ============================================================================

/**
 * Calculate TruthScore - Unified Entry Point
 *
 * Automatically detects market type and routes to appropriate scorer.
 */
export function calculateTruthScore(input: TruthScoreInput): TruthScoreResult {
  const marketType = getMarketType(input.platform);

  if (marketType === 'binary') {
    const wins = input.wins ?? 0;
    const total = input.totalBets ?? (wins + (input.losses ?? 0));
    return scoreBinaryTrader(wins, total, input.platform, input.lastTradeAt, input.pnlUsd, input.minBetsOverride);
  }

  // Odds-based — use per-platform variance if not explicitly provided
  const pnl = input.pnl ?? 0;
  const volume = input.volume ?? 0;
  const trades = input.trades ?? input.totalBets ?? 0;
  const variance = input.varianceEstimate ?? getPlatformVariance(input.platform);

  return scoreOddsTrader(pnl, volume, trades, input.platform, input.lastTradeAt, input.volumeUsd ?? input.volume, variance, input.minBetsOverride);
}

// ============================================================================
// DISPLAY HELPERS
// ============================================================================

/**
 * Get human-readable breakdown of score
 */
export function getScoreBreakdown(result: TruthScoreResult): ScoreBreakdown {
  if (!result.eligible) {
    return {
      skill: 'Not eligible',
      confidence: 'N/A',
      recency: 'N/A',
      explanation: result.reason || 'Insufficient data',
    };
  }

  const edgeDescription = result.marketType === 'binary'
    ? `${result.edge}% above coin flip`
    : `${result.edge}% ROI`;

  let skillLevel: string;
  if (result.edge >= 10) skillLevel = 'Elite';
  else if (result.edge >= 7) skillLevel = 'Excellent';
  else if (result.edge >= 5) skillLevel = 'Strong';
  else if (result.edge >= 3) skillLevel = 'Good';
  else if (result.edge >= 1) skillLevel = 'Slight edge';
  else skillLevel = 'No proven edge';

  let confidenceLevel: string;
  if (result.confidence >= 90) confidenceLevel = 'Very high';
  else if (result.confidence >= 70) confidenceLevel = 'High';
  else if (result.confidence >= 40) confidenceLevel = 'Moderate';
  else if (result.confidence >= 15) confidenceLevel = 'Low';
  else confidenceLevel = 'Very low';

  return {
    skill: `${skillLevel} (${edgeDescription})`,
    confidence: `${confidenceLevel} (${result.confidence}%, ${result.sampleSize} ${result.marketType === 'binary' ? 'bets' : 'trades'})`,
    recency: 'N/A',
    explanation: `${skillLevel} performer with ${confidenceLevel.toLowerCase()} confidence.`,
  };
}

/**
 * Get tier name from score
 *
 * v3.1 thresholds (lowered to match EDGE_THRESHOLD=0.08 curve):
 * - Legendary: 1000+  (~top 2% — sustained elite edge at scale)
 * - Diamond:   800-999 (~top 7% — proven high skill, large sample)
 * - Platinum:  500-799 (~top 15% — strong edge with confidence)
 * - Gold:      300-499 (~top 27% — demonstrated above-average skill)
 * - Silver:    150-299 (~top 45% — some evidence of edge)
 * - Bronze:    0-149   (~bottom 55% — not yet proven)
 */
export function getScoreTier(score: number): string {
  if (score >= 1000) return 'Legendary';
  if (score >= 800) return 'Diamond';
  if (score >= 500) return 'Platinum';
  if (score >= 300) return 'Gold';
  if (score >= 150) return 'Silver';
  return 'Bronze';
}

/**
 * Get tier color class
 */
export function getScoreTierColor(score: number): string {
  if (score >= 1000) return 'text-yellow-400';
  if (score >= 800) return 'text-cyan-400';
  if (score >= 500) return 'text-purple-400';
  if (score >= 300) return 'text-yellow-500';
  if (score >= 150) return 'text-gray-400';
  return 'text-amber-600';
}
