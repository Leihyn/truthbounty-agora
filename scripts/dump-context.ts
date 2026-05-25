// Build the agent's real context from live data and write it to disk, so an
// external model (or a human) can produce the completion offline.
import { buildAgentContext } from '../lib/agent/context';
import { writeFileSync } from 'fs';

(async () => {
  const ctx = await buildAgentContext({
    baseUrl: process.env.TRUTHBOUNTY_API_URL || 'http://localhost:3000',
    bookUsd: Number(process.env.BOOK_USD || 1000),
  });
  const out = process.env.CONTEXT_OUT || '/tmp/agora-context.json';
  writeFileSync(out, JSON.stringify(ctx, null, 2));
  console.log(`traders=${ctx.traders.length} markets=${ctx.markets.length} -> ${out}`);
})();
