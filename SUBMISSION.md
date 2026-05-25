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
Submission repo:  https://github.com/Leihyn/truthbounty-agora
Reputation engine (live product): https://truthbounty.xyz
Demo video: <youtube unlisted>
```

---

## Judging-axis one-liners (paste into the relevant fields)

**Agentic sophistication (30%)** — An LLM decision loop drives every allocation with logged reasoning (real cycle in `samples/cycle-live-2026-05-25.json`). On the live board it *caught a data artifact*: seven accounts pinned at edge exactly 0.450 (a flat 95% win rate) across sample sizes from 7K to 86K bets, which it discounted as a scoring ceiling and refused to copy — anchoring instead on high-volume sharps with statistically credible, varied edge. Then it did the hardest thing an agent can: it **deployed zero and reserved the full book**, because every market on its only executable venue had already settled. The AI decides who, where, how much, and *whether to act at all* — not a script.

**Traction (30%)** — Built on the live TruthBounty product (truthbounty.xyz): existing community, prior prediction-markets hackathon placement, 12+ platform integrations. This submission puts an autonomous agent on top of that proven reputation engine and executes real USDC transactions on Arc. Existing brand = distribution; live Arc txns = proof.

**Circle tool usage (20%)** — Proven, not checkbox. **CCTP V2:** a real `depositForBurn` on Arc Testnet (tx `0xead3dba2…3001eae`, Circle attestation `status: complete` — see `samples/cctp-settlement-proof.json`). **Native USDC gas:** that transaction cost ~0.0037 USDC in gas — Arc's gas token *is* USDC, so the agent holds only USDC, never a volatile native token. **Gateway:** on-chain GatewayWallet/GatewayMinter on Arc + per-intelligence USDC nanopayments via EIP-3009.

**Innovation (20%)** — A reputation-weighted, self-funding autonomous market participant: it pays for the intelligence it consumes and must earn more than it spends. Reputation is cross-platform (Polymarket, Azuro, Overtime, PancakeSwap); execution settles in dollars on Arc.

---

## Honest scope notes (so claims hold up under scrutiny)

- **Execution is Azuro-only, by design.** The agent's book is on Arc Testnet; CCTP only bridges testnet→testnet, so the only prediction market reachable for a real bridged bet is Azuro (Polygon Amoy). Polymarket/Overtime/PancakeSwap are **reputation signal** (their live markets + leaderboards feed TruthScore). We do not claim real bets on those venues.
- **Sample cycle** in `samples/cycle-live-2026-05-24.json` was produced by a Claude model over live TruthBounty data; the deployed agent reproduces it via the Anthropic API on a loop.
- **Azuro V3 execution** uses `Relayer.betFor` with a bettor EIP-712 signature + an oracle co-signature from Azuro's Live API (integration points documented in `.env.example`).
