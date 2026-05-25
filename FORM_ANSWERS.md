# Agora Agents Submission, form answers (paste-ready)

> Video: use **https://youtu.be/7YF9nR6xPms** (verified accessible). The other link
> (FxQS5IgnlBQ) returns 404 / is private, judges could not watch it. Either paste the
> verified link or set FxQS5IgnlBQ to Unlisted in YouTube Studio first.

## Short fields
- **Project Name:** TruthBounty Agora
- **GitHub Handle:** leihyn
- **Discord Handle:** @leihynn
- **Telegram Handle:** @leihyn
- **Twitter / X:** https://x.com/faruukku
- **Team Members:** 1 (Solo), Onatola Faruq
- **Project Source Code:** https://github.com/Leihyn/truthbounty-agora
- **Project Live:** https://truthbounty-agora.vercel.app
- **Project Video Demo:** https://youtu.be/7YF9nR6xPms
- **Arc OSS:** Yes, I would love to apply for Arc OSS. I can commit to keeping my code open source.

---

## Problem Statement

Prediction markets are now a multi-billion-dollar arena, but the traders who actually have edge are invisible. On-chain, someone who is 94% right over 500 resolved bets looks identical to someone who got lucky twice. There is no portable, anti-gamed track record, and even if you knew who was good, you would have to watch their wallets around the clock across several chains to act on it. So copy-traders mirror leaders blindly, unable to tell skill from luck or to notice when a strategy degrades. This matters because markets are how a society prices truth, and "who is actually good" is the most valuable and least legible signal in them. Make it legible and let an agent act on it, and you get a market participant that is faster and more disciplined than a human staring at screens.

---

## Project Description

TruthBounty Agora is an autonomous agent that copies the provably-best prediction-market traders and settles a USDC book on Arc. It builds on TruthBounty, a live reputation engine that scores every trader across 12+ platforms with an anti-gamed TruthScore (Wilson lower-bound for binary markets, conservative ROI for odds markets).

Each cycle the agent: (1) pulls TruthScores and live markets from TruthBounty's API; (2) reasons with an LLM about who to copy, how much to risk, and whether to act, emitting a structured decision with a written rationale; (3) clamps position sizes with deterministic guardrails (we never trust the model to enforce a financial cap); (4) settles on Arc: it bridges via Circle CCTP, pays gas in USDC, pays for its own intelligence in USDC nanopayments, and attests each cycle's reasoning-trace hash on-chain via a CycleRegistry contract we deployed.

On the live board it caught a data artifact (seven accounts pinned at a flat 95% win rate across very different sample sizes), discounted them, anchored on a credible sharp (72% over 153,000 bets), then refused to deploy because its only executable venue had stale markets, reserving the full book. It decides whether to act at all.

Tech: Next.js + TypeScript dashboard, Claude (Anthropic) for reasoning, viem + Foundry for Arc, Circle CCTP / Gateway / Contracts / USDC, Supabase. Every on-chain action is verifiable on testnet.arcscan.app.

---

## Traction

TruthBounty, the reputation engine this is built on, is a live product (truthbounty.xyz) with an existing community across socials, a prior 2nd-place finish at a prediction-markets hackathon, and 12+ platform integrations. That is the distribution.

The agent layer is new this hackathon and is already real: a live, clickable dashboard, plus real Circle-attested activity on Arc during the event window. It deployed a CycleRegistry contract on Arc and recorded 4 on-chain cycle attestations and a real CCTP settlement, all verifiable on testnet.arcscan.app.

Honest note: the agent itself is early, so its traction today is the existing TruthBounty brand as distribution plus the agent's own real on-chain activity, not large end-user volume yet.

---

## Arc OSS, why choose us / what primitives

We expose reusable primitives the circlefin/arc-* samples do not: (1) CycleRegistry.sol, a small on-chain attestation contract that records an agent's reasoning-trace hash plus allocation outcome per cycle, turning the reasoning trace into a verifiable on-chain artifact (a direct implementation of Arc Research #01). (2) A clean lib/agent layer: an LLM decision loop with forced-tool structured output, deterministic financial guardrails (enforceGuardrails), and a bring-your-own-model path (AGENT_COMPLETION_FILE) so the pipeline runs offline or with any model. (3) A server-side CCTP V2 bridge module (cctp.ts) and an x402 / EIP-3009 USDC nanopayment helper (payments.ts) any agent can drop in. (4) An ExecutionAdapter interface any venue can implement. Together these are the missing "agent that settles on Arc" scaffolding: reputation in, reasoning logged on-chain, USDC settled via CCTP, gas in USDC. We will keep it open source and document each primitive.

---

## Circle / Arc Feedback

What worked: USDC as the native gas token on Arc is excellent for agents; not having to source a volatile gas token removed a whole class of failures. CCTP V2 on Arc testnet (domain 26) worked first try with the deterministic V2 contract addresses, and the Iris sandbox attestation completed in seconds. The single best DX touch was the arc-canteen CLI shipping the Arc and Circle docs plus the circlefin sample repos as pre-bundled agent context (arc-canteen context sync); it let a coding agent build against Arc immediately. A public RPC with no token (rpc.testnet.arc.network) was great too.

Where to improve: (1) USYC is gated behind an institutional allowlist ticket even on testnet, which blocks the most natural agent use case, parking idle capital in yield between trades. A permissionless testnet USYC faucet would unlock a lot of adaptive-portfolio and risk-off agent designs. (2) Gateway docs are thin on the actual on-chain nanopayment flow versus the GatewayWallet / GatewayMinter contracts; a minimal end-to-end server-side example (sign, settle, verify) would help. (3) Because CCTP only bridges testnet to testnet, an agent whose treasury is on Arc testnet can only reach venues that also have testnet deployments, but most real prediction-market venues (Polymarket, Overtime) are mainnet-only. Clearer guidance on the intended "settle on Arc, execute elsewhere" topology would save teams a rearchitect. (4) The Memo contract is listed in the contract-addresses page without an ABI or function signature, so we deployed our own attestation contract instead; documenting Memo's interface would save that step.

---

## General Feedback

The RFB and Research sections were unusually good prompts; they read like real product seeds, not filler, and the "these are not tracks, surprise us" framing was freeing. Async judging, submit-early-and-often, and using the arc-canteen CLI as the submission and traction rail is a great model. One improvement: the testnet-only constraint combined with mainnet-only venues created real tension for the "agents that trade on existing venues" RFBs (perps, prediction markets); a short note in each RFB on the intended execution topology, and which venues actually have testnets, would save teams from mid-build rearchitecting. Two weeks was tight but fair. Thanks for running it.
