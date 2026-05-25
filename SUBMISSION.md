# Agora Agents Hackathon — Submission

**Project:** TruthBounty Agora
**RFBs:** #2 Prediction-Market Trader Intelligence · #6 Social Trading Intelligence

---

## Form copy (paste directly)

**Project name**
```
TruthBounty Agora
```

**Short description (≤140 char)**
```
Autonomous agent that copies the provably-best prediction-market traders, running a USDC book on Arc via Circle CCTP + Gateway + Paymaster.
```

**Long description (~140 words)**
```
Prediction markets cleared billions in 2024, but the traders with real edge are invisible — no portable, anti-gamed track record, and no way to act on it automatically. TruthBounty already scores every trader across platforms with a Wilson-score, anti-gamed reputation engine. TruthBounty Agora is the autonomous agent that acts on it.

It reads TruthScores and live markets, reasons in the open about who to copy and how much to risk, and runs a real USDC book on Arc — settling cross-chain via Circle CCTP, paying for its own intelligence in USDC nanopayments, and paying gas in USDC natively. It deploys into a prediction market when a live, executable one exists, and reserves capital when none does — a self-funding market participant disciplined enough to wait.

Built on the live TruthBounty product (truthbounty.xyz) with an existing community and prior hackathon placement. Real, Circle-attested Arc settlement; real reasoning traces.
```

**Links**
```
Submission repo:   https://github.com/Leihyn/truthbounty-agora
Live agent dashboard: https://truthbounty-agora.vercel.app
Reputation engine (live product): https://truthbounty.xyz
Arc explorer (agent wallet): https://testnet.arcscan.app/address/0xed1d7aeD831dC84759c18b022cC7F0522A538269
Demo video: <youtube unlisted>
```

---

## Judging-axis one-liners (paste into the relevant fields)

**Agentic sophistication (30%)** — An LLM decision loop drives every allocation with logged reasoning (real cycle in `samples/cycle-live-2026-05-25.json`). On the live board it *caught a data artifact*: seven accounts pinned at edge exactly 0.450 (a flat 95% win rate) across sample sizes from 7K to 86K bets, which it discounted as a scoring ceiling and refused to copy — anchoring instead on high-volume sharps with statistically credible, varied edge. Then it did the hardest thing an agent can: it **deployed zero and reserved the full book**, because every market on its only executable venue had already settled. The AI decides who, where, how much, and *whether to act at all* — not a script.

**Traction (30%)** — Built on the live TruthBounty product (truthbounty.xyz): existing community, prior prediction-markets hackathon placement, 12+ platform integrations. This submission puts an autonomous agent on top of that proven reputation engine and executes real USDC transactions on Arc. Existing brand = distribution; live Arc txns = proof.

**Circle tool usage (20%)** — Proven on-chain, not checkbox (see `samples/arc-onchain-proof.json`). **CCTP V2:** real `depositForBurn` on Arc (tx `0xead3dba2…`, attestation `status: complete`). **Contracts:** our `CycleRegistry` deployed on Arc (`0x68C3…49FB`) attests every cycle's reasoning-trace hash + outcome on-chain — real recurring Arc settlement (`0x43a731f0…`, `0x4cb50450…`), and the reasoning trace as a verifiable artifact (Arc Research #01). **Native USDC gas:** every tx costs fractions of a cent in USDC — Arc's gas token *is* USDC, so the agent holds only USDC. **Gateway:** on-chain wallet/minter + per-intelligence USDC nanopayments (EIP-3009). **USYC:** the natural home for reserved capital (idle yield) — wired as intent, blocked only on Circle's institutional allowlist; the agent reserves in USDC on Arc today and routes to USYC once allowlisted (stated honestly, not faked).

**Innovation (20%)** — A reputation-weighted, self-funding autonomous market participant: it pays for the intelligence it consumes and must earn more than it spends. Reputation is cross-platform (Polymarket, Azuro, Overtime, PancakeSwap); execution settles in dollars on Arc.

---

## Honest scope notes (so claims hold up under scrutiny)

- **Execution is Azuro-only, by design.** The agent's book is on Arc Testnet; CCTP only bridges testnet→testnet, so the only prediction market reachable for a real bridged bet is Azuro (Polygon Amoy). Polymarket/Overtime/PancakeSwap are **reputation signal** (their live markets + leaderboards feed TruthScore). We do not claim real bets on those venues.
- **Sample cycle** in `samples/cycle-live-2026-05-24.json` was produced by a Claude model over live TruthBounty data; the deployed agent reproduces it via the Anthropic API on a loop.
- **Azuro V3 execution** uses `Relayer.betFor` with a bettor EIP-712 signature + an oracle co-signature from Azuro's Live API (integration points documented in `.env.example`).
