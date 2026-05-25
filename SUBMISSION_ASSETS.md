# Submission assets, paste-ready

## YouTube (unlisted)

**Title**
```
TruthBounty Agora: the prediction-market agent that knows when NOT to bet · Arc × Circle
```

**Description**
```
Prediction markets did billions in volume last year. Almost everyone loses. The few who actually win? You can't find them, and you can't copy them.

TruthBounty already scores every trader across platforms with an anti-gamed reputation engine (TruthScore). TruthBounty Agora is the autonomous agent that acts on it: it reads TruthScores + live markets, reasons in the open about who to copy and how much to risk, and runs a USDC book on Arc, settling cross-chain via Circle CCTP, paying gas in USDC, and paying for its own intelligence in USDC nanopayments.

In this cycle it does the hardest thing an agent can: it catches a data artifact (7 accounts faking a flat 95% win rate), anchors on the genuinely credible sharps, and then REFUSES to deploy, because every market on its only executable venue had already settled. It decides whether to act at all.

Everything on-chain is real and verifiable on Arc Testnet:
• CCTP settlement: 0xead3dba28afb79f71c5470545af4eb82cf4f7eb1a888b0de26c8815fa3001eae
• CycleRegistry (deployed): 0x68C36965fEA665fB53Fb0590aCcD4E99B64c49FB
• Cycle attestation: 0x4cb504509e892c92e942e2183b3a8ef6115b937ee34734564f06616f64dfe087

Live dashboard: https://truthbounty-agora.vercel.app
Code: https://github.com/Leihyn/truthbounty-agora
Reputation engine: https://truthbounty.xyz

Chapters:
0:00 The problem
0:15 The agent reasons (catches the 95% artifact)
1:40 Settles on Arc, CCTP, USDC-native gas
2:30 A market participant disciplined enough to wait

Built for the Agora Agents Hackathon (Canteen × Circle). RFB #2 + #6.
Stack: Arc · Circle CCTP / Gateway / Contracts · USDC · TruthBounty reputation engine · Claude.
```

**Tags:** `Arc, Circle, USDC, CCTP, prediction markets, AI agent, copy trading, Polymarket, autonomous agent, hackathon`

---

## arc-canteen update-product

> `arc-canteen login` first, then `arc-canteen update-product`

```
Shipped TruthBounty Agora, an autonomous prediction-market agent that settles a USDC book on Arc. It reads TruthScore reputation + live markets, reasons over who to copy (with logged traces), and settles cross-chain via Circle CCTP.

Live on Arc Testnet today:
- Real CCTP settlement (tx 0xead3dba2…3001eae, Circle attestation complete)
- CycleRegistry deployed (0x68C3…49FB), attests each cycle's reasoning-trace hash + outcome on-chain; gas paid in USDC
- 3 real cycle attestations so far

Live dashboard: https://truthbounty-agora.vercel.app
Repo: https://github.com/Leihyn/truthbounty-agora
Video: <youtube url>
```

---

## arc-canteen update-traction

> `arc-canteen update-traction`

```
Distribution: built on the live TruthBounty product (truthbounty.xyz), an existing community across socials, a prior 2nd-place finish at a prediction-markets hackathon, and 12+ platform integrations. This submission puts an autonomous agent on top of that proven reputation engine.

Agent activity (this event window, all verifiable on Arc Testnet):
- Deployed a CycleRegistry contract on Arc
- 3 real on-chain cycle attestations + 1 real CCTP settlement
- Live, clickable dashboard with the on-chain proofs surfaced as trust signals

What we're building for: retail can't tell skilled prediction-market traders from lucky ones, and can't act on it. We make reputation legible and let an agent act on it, settling in dollars on Arc.

Honest note: agent is early, traction is the existing TruthBounty brand as distribution plus the agent's own real on-chain activity during the window, not large user volume yet.
```

---

## Form quick-fill
- **Project:** TruthBounty Agora
- **GitHub:** https://github.com/Leihyn/truthbounty-agora
- **Live:** https://truthbounty-agora.vercel.app
- **Video:** <youtube url>
- **Short/long desc + judging one-liners:** see `SUBMISSION.md`
