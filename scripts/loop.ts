// Autonomous loop. Runs a decision cycle on an interval, attesting each one to
// Arc — continuous, unattended agency (not a one-shot). Real recurring Arc
// settlements accrue over the event window.
//
//   ANTHROPIC_API_KEY=... TRUTHBOUNTY_API_URL=https://www.truthbounty.xyz \
//   LOOP_INTERVAL_S=900 npm run agent:loop
//
// With AGENT_COMPLETION_FILE set, runs offline (bring-your-own-model).

import { buildAgentContext } from '../lib/agent/context';
import { runAgentCycle } from '../lib/agent/agent';
import { attestCycle } from '../lib/agent/attest';

const INTERVAL = Number(process.env.LOOP_INTERVAL_S || 900) * 1000;
const BASE = process.env.TRUTHBOUNTY_API_URL || 'http://localhost:3000';
const BOOK = Number(process.env.BOOK_USD || 1000);

async function cycle(n: number) {
  const ts = new Date().toISOString();
  try {
    const ctx = await buildAgentContext({ baseUrl: BASE, bookUsd: BOOK });
    const res = await runAgentCycle(ctx);
    const copies = res.decisions.filter((d) => d.action === 'copy').length;
    const tx = await attestCycle(res, ctx.bookUsd);
    console.log(
      `[${ts}] cycle ${n}: ${ctx.traders.length} traders, ${ctx.markets.length} markets -> ` +
        `$${res.allocatedUsd.toFixed(2)} across ${copies} copies` +
        (tx ? ` | attested on Arc ${tx}` : ' | (attest skipped: no chain env)'),
    );
  } catch (e) {
    console.error(`[${ts}] cycle ${n} failed:`, (e as Error).message);
  }
}

(async () => {
  console.log(`> agent loop every ${INTERVAL / 1000}s against ${BASE}`);
  let n = 0;
  await cycle(++n);
  setInterval(() => cycle(++n), INTERVAL);
})();
