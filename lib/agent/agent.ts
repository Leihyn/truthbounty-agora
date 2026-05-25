// The agent decision loop.
//
// This is the 30%-weighted "agentic sophistication" axis: the AI genuinely
// decides who to copy, on which venue, and how much to risk — and explains
// itself. We force a tool call so the output is structured JSON we can hand
// straight to the execution adapters, while still capturing free-text reasoning.

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import type {
  AgentContext,
  AgentCycleResult,
  AgentDecision,
  ScoredTrader,
  Venue,
} from './types';

const MODEL = process.env.AGENT_MODEL || 'claude-opus-4-7';

const SYSTEM_PROMPT = `You are the TruthBounty Agora agent: an autonomous capital allocator for prediction markets.

You run a USDC book that settles on Arc (Circle's stablecoin L1). Each cycle you receive:
- A reputation-ranked list of traders (TruthScore 0-1300, anti-gamed via Wilson lower-bound for binary markets and conservative ROI for odds markets). Higher = more PROVEN edge, not luck.
- Live markets you can take positions in across venues (azuro, overtime, polymarket).
- Your current book size, free capital, open positions, and risk caps.

Your job: decide which high-reputation traders to MIRROR into which live markets, and size each position in USDC.

EXECUTION VENUE: you may only PLACE positions on Azuro (settled via CCTP from your Arc book). Polymarket, Overtime and PancakeSwap are REPUTATION SIGNAL ONLY — use a trader's proven edge there to judge WHO has skill, then express that conviction in the most analogous live Azuro market. Never emit a copy on a non-Azuro venue.

Hard rules:
- Never allocate to a trader below the minimum TruthScore floor.
- Respect maxPerTraderPct and maxPerVenuePct against the total book.
- Prefer traders whose track record was earned on the SAME market TYPE as the target market (binary win-rate skill does not transfer to odds-ROI skill).
- Diversify across venues and categories; do not dump the whole book into one market.
- Size by conviction AND by the trader's edge and sample size — a Diamond trader with 500 resolved bets warrants more than a barely-eligible one.
- It is correct to SKIP. Returning few or no positions in a thin/overpriced board is a valid, often superior decision.

For every trader you evaluate (copy OR skip), give one concrete sentence of reasoning grounded in the numbers you were given. Open with a one-paragraph thesis on the board this cycle.`;

const DECISION_TOOL: Anthropic.Tool = {
  name: 'submit_allocations',
  description:
    'Submit the agent\'s allocation decisions for this cycle. Include every trader you evaluated, marking each copy or skip.',
  input_schema: {
    type: 'object',
    properties: {
      thesis: {
        type: 'string',
        description: 'One-paragraph read of the board this cycle: where the edge is, what you are avoiding, and why.',
      },
      decisions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['copy', 'skip'] },
            trader: { type: 'string', description: 'trader address' },
            venue: { type: 'string', enum: ['azuro', 'overtime', 'polymarket', 'pancakeswap'] },
            marketId: { type: 'string', description: 'required when action=copy' },
            outcome: { type: 'string', description: 'which side, required when action=copy' },
            sizeUsd: { type: 'number', description: 'USDC notional from the book; 0 when skipping' },
            confidence: { type: 'number', description: '0..1 conviction' },
            reasoning: { type: 'string', description: 'one sentence, grounded in the numbers' },
          },
          required: ['action', 'trader', 'venue', 'confidence', 'reasoning'],
        },
      },
    },
    required: ['thesis', 'decisions'],
  },
};

function renderContext(ctx: AgentContext): string {
  const traders = ctx.traders
    .map(
      (t) =>
        `- ${t.address} | ${t.platform} | TruthScore ${t.truthScore} (${t.tier})` +
        (t.edge != null ? ` | edge ${(t.edge * 100).toFixed(1)}%` : '') +
        (t.sampleSize != null ? ` | n=${t.sampleSize}` : '') +
        (t.category ? ` | ${t.category}` : '') +
        (t.recentPnlUsd != null ? ` | recentPnL $${t.recentPnlUsd.toFixed(0)}` : ''),
    )
    .join('\n');

  const markets = ctx.markets
    .map(
      (m) =>
        `- [${m.venue}] ${m.marketId} "${m.question}" | outcomes ${m.outcomes
          .map((o, i) => `${o}@${(m.prices[i] ?? 0).toFixed(2)}`)
          .join(', ')}` +
        (m.liquidityUsd != null ? ` | liq $${m.liquidityUsd.toFixed(0)}` : '') +
        (m.closesAt ? ` | closes ${m.closesAt}` : ''),
    )
    .join('\n');

  const positions = ctx.openPositions.length
    ? ctx.openPositions
        .map((p) => `- ${p.trader} ${p.venue}/${p.marketId} ${p.outcome} $${p.sizeUsd}`)
        .join('\n')
    : '(none)';

  return `BOOK: $${ctx.bookUsd} total, $${ctx.freeUsd} free this cycle.
RISK CAPS: max ${(ctx.maxPerTraderPct * 100).toFixed(0)}% per trader, ${(
    ctx.maxPerVenuePct * 100
  ).toFixed(0)}% per venue. Minimum TruthScore floor: ${ctx.minTruthScore}.

REPUTATION-RANKED TRADERS:
${traders || '(none eligible)'}

LIVE MARKETS:
${markets || '(none)'}

OPEN POSITIONS:
${positions}`;
}

/** Run one decision cycle. Returns structured decisions + the agent's reasoning. */
export async function runAgentCycle(ctx: AgentContext): Promise<AgentCycleResult> {
  const cycleId = `cycle_${Date.now()}`;
  const startedAt = new Date().toISOString();
  const prompt = renderContext(ctx);

  // Inference step. Normally the Anthropic API — but if AGENT_COMPLETION_FILE is
  // set, read the structured completion from disk instead (bring-your-own-model /
  // offline eval). The rest of the pipeline — guardrails, sizing, accounting — is
  // identical either way, so the model is a swappable component.
  let raw: { thesis: string; decisions: AgentDecision[] };
  let modelLabel = MODEL;
  const injected = process.env.AGENT_COMPLETION_FILE;
  if (injected) {
    raw = JSON.parse(readFileSync(injected, 'utf8'));
    modelLabel = process.env.AGENT_MODEL_LABEL || `${MODEL} (injected completion)`;
  } else {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: [
        // Cache the static system prompt — it's identical every cycle.
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      tools: [DECISION_TOOL],
      tool_choice: { type: 'tool', name: 'submit_allocations' },
      messages: [{ role: 'user', content: prompt }],
    });
    const toolUse = resp.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );
    if (!toolUse) throw new Error('agent returned no allocation tool call');
    raw = toolUse.input as { thesis: string; decisions: AgentDecision[] };
  }
  const decisions = enforceGuardrails(raw.decisions ?? [], ctx);
  const allocatedUsd = decisions
    .filter((d) => d.action === 'copy')
    .reduce((s, d) => s + (d.sizeUsd ?? 0), 0);

  return {
    cycleId,
    startedAt,
    model: modelLabel,
    thesis: raw.thesis ?? '',
    decisions,
    allocatedUsd,
    costUsd: 0, // set by the x402 layer when it charges per intelligence call
  };
}

/**
 * Deterministic backstop. The LLM is told the rules, but we never trust a model
 * to enforce a financial cap — clamp sizes and drop ineligible copies in code.
 */
export function enforceGuardrails(
  decisions: AgentDecision[],
  ctx: AgentContext,
): AgentDecision[] {
  const traderById = new Map<string, ScoredTrader>(
    ctx.traders.map((t) => [t.address.toLowerCase(), t]),
  );
  const perTraderCap = ctx.bookUsd * ctx.maxPerTraderPct;
  const perVenueCap = ctx.bookUsd * ctx.maxPerVenuePct;
  const venueSpent: Record<string, number> = {};
  let freeRemaining = ctx.freeUsd;

  return decisions.map((d) => {
    if (d.action !== 'copy') return { ...d, sizeUsd: 0 };

    const t = traderById.get(d.trader.toLowerCase());
    if (!t || t.truthScore < ctx.minTruthScore || !d.marketId) {
      return {
        ...d,
        action: 'skip',
        sizeUsd: 0,
        reasoning: `[guardrail] dropped: ${
          !t ? 'unknown trader' : t.truthScore < ctx.minTruthScore ? 'below TruthScore floor' : 'no market'
        }. ${d.reasoning}`,
      };
    }

    const venue = d.venue as Venue;
    const spentOnVenue = venueSpent[venue] ?? 0;
    let size = Math.max(0, d.sizeUsd ?? 0);
    size = Math.min(size, perTraderCap, perVenueCap - spentOnVenue, freeRemaining);

    if (size <= 0) {
      return { ...d, action: 'skip', sizeUsd: 0, reasoning: `[guardrail] no capacity left. ${d.reasoning}` };
    }

    venueSpent[venue] = spentOnVenue + size;
    freeRemaining -= size;
    return { ...d, sizeUsd: Number(size.toFixed(2)) };
  });
}
