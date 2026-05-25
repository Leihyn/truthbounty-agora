// Headless agent cycle — run one decision pass and print the reasoning.
//   TRUTHBOUNTY_API_URL=https://truthbounty.xyz ANTHROPIC_API_KEY=... pnpm agent:cycle
// Relative imports (no @ alias) so this runs cleanly under tsx.

import { buildAgentContext } from '../lib/agent/context';
import { runAgentCycle } from '../lib/agent/agent';
import { attestCycle } from '../lib/agent/attest';

async function main() {
  const baseUrl = process.env.TRUTHBOUNTY_API_URL || 'http://localhost:3000';
  const bookUsd = Number(process.env.BOOK_USD || 1000);

  console.log(`> building context from ${baseUrl} (book $${bookUsd})`);
  const ctx = await buildAgentContext({ baseUrl, bookUsd });
  console.log(`> ${ctx.traders.length} eligible traders, ${ctx.markets.length} live markets\n`);

  const res = await runAgentCycle(ctx);
  console.log('THESIS:', res.thesis, '\n');
  for (const d of res.decisions) {
    const tag = d.action === 'copy' ? 'COPY' : 'skip';
    console.log(
      `[${tag}] ${d.venue.padEnd(10)} ${d.trader} $${(d.sizeUsd ?? 0).toFixed(2)} ` +
        `conf=${(d.confidence * 100).toFixed(0)}%  — ${d.reasoning}`,
    );
  }
  const tx = await attestCycle(res, ctx.bookUsd);
  console.log(
    `\n> allocated $${res.allocatedUsd.toFixed(2)} (${res.model})` +
      (tx ? `\n> attested on Arc: ${tx}` : ''),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
