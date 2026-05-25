// POST /api/agent/run — run one agent decision cycle.
//
// Reads reputation + live markets, asks the agent to allocate, persists the
// cycle (thesis + every decision's reasoning) so the dashboard and the demo can
// replay exactly what the AI decided and why. Execution adapters consume the
// returned `decisions`.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildAgentContext } from '@/lib/agent/context';
import { runAgentCycle } from '@/lib/agent/agent';
import { charge, totalCost, Intelligence, type PaymentReceipt } from '@/lib/agent/payments';
import { getBook } from '@/lib/agent/book';
import { attestCycle } from '@/lib/agent/attest';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    // Prefer the agent's REAL on-chain USDC book; fall back to a requested size.
    let bookUsd = Number(body.bookUsd ?? 1000);
    try {
      const book = await getBook();
      if (book.totalUsd > 0) bookUsd = book.totalUsd;
    } catch {
      /* no key/RPC this run — use requested size */
    }
    const baseUrl =
      process.env.TRUTHBOUNTY_API_URL || process.env.NEXT_PUBLIC_BASE_URL || new URL(req.url).origin;

    const ctx = await buildAgentContext({ baseUrl, bookUsd, freeUsd: body.freeUsd });
    const result = await runAgentCycle(ctx);

    // The agent pays for its own intelligence in USDC nanopayments via Gateway:
    // one decision cycle + one TruthScore query per trader it scored. Best-effort
    // so a keyless decision run still returns (costUsd just stays 0).
    let receipts: PaymentReceipt[] = [];
    try {
      receipts = [
        await charge(Intelligence.CYCLE_DECISION),
        ...(await Promise.all(ctx.traders.map(() => charge(Intelligence.TRUTHSCORE_QUERY)))),
      ];
      result.costUsd = totalCost(receipts);
    } catch (e) {
      console.warn('intelligence charge skipped:', (e as Error).message);
    }

    // Attest the cycle on Arc (CycleRegistry) — reasoning-trace hash + outcome.
    let attestTxHash: string | undefined;
    try {
      attestTxHash = await attestCycle(result, bookUsd);
    } catch (e) {
      console.warn('cycle attest skipped:', (e as Error).message);
    }

    // Best-effort persistence — never fail the cycle on a logging hiccup.
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      );
      await supabase.from('agent_cycles').insert({
        cycle_id: result.cycleId,
        started_at: result.startedAt,
        model: result.model,
        thesis: result.thesis,
        decisions: result.decisions,
        allocated_usd: result.allocatedUsd,
        cost_usd: result.costUsd,
      });
    } catch (e) {
      console.warn('agent_cycles insert skipped:', (e as Error).message);
    }

    return NextResponse.json({ ...result, receipts, attestTxHash });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
