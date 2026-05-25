# TruthBounty Agora

An autonomous agent that copies the *provably* best prediction-market traders, runs a USDC book on Arc, and settles every position through Circle's stack.

## The problem

Prediction markets cleared billions in volume around the 2024 US election, and they're now a multi-billion-dollar asset class spanning Polymarket, Azuro, Overtime, and a dozen more venues. But the traders who actually have *edge* are invisible. A trader with a 94% win rate over 500 resolved bets looks identical, on-chain, to someone who got lucky twice. There's no portable, anti-gamed track record — and even if you knew who was good, you'd have to watch their wallets 24/7 across five chains to act on it.

[TruthBounty](https://truthbounty.xyz) already solved the first half: it scores every trader across platforms with a statistically rigorous, anti-gamed reputation engine (TruthScore). **TruthBounty Agora is the agent that acts on it** — the second half.

## What it does

Each cycle, the agent:

1. **Reads reputation** — pulls TruthScores + live markets from TruthBounty's deployed API (Polymarket, Azuro, Overtime, PancakeSwap as signal).
2. **Reasons, in the open** — an LLM decides which proven traders to mirror, into which live market, at what size and risk — and writes down *why*. Every decision carries a reasoning trace.
3. **Settles on Arc** — its USDC book lives on Arc (Circle's stablecoin L1). It bridges via **CCTP** to place a real on-chain bet on **Azuro** (Polygon Amoy), pays gas in USDC via **Paymaster**, and pays for its own intelligence in USDC nanopayments via **Gateway**.

A self-funding market participant: it earns more than it spends, or it doesn't trade.

## How it works

| Layer | On/off-chain | Detail |
|---|---|---|
| Reputation | off-chain | TruthScore: Wilson lower-bound (binary) / conservative ROI (odds), anti-gaming caps. `lib/truthscore.ts` |
| Decision | off-chain | Claude with a forced `submit_allocations` tool call → `{thesis, decisions[]}`. `lib/agent/agent.ts` |
| Guardrails | off-chain | Deterministic clamp on per-trader / per-venue caps. We never trust the model to enforce a financial limit. `enforceGuardrails()` |
| Settlement | **on-chain (Arc)** | USDC book + USDC-denominated gas (Circle Paymaster) |
| Bridge | **on-chain (CCTP V2)** | `depositForBurn` on Arc → Iris attestation → `receiveMessage` on Polygon Amoy. `lib/agent/cctp.ts` |
| Execution | **on-chain (Azuro)** | `Relayer.betFor(OrderData[])` with bettor EIP-712 sig + Azuro Live API oracle co-sign. `lib/agent/execution.ts` |
| Intelligence payments | **on-chain (Gateway)** | USDC nanopayment per intelligence call |

### Why Azuro is the only execution venue

The agent's book is on **Arc Testnet** (CCTP domain 26). CCTP only bridges testnet→testnet, so a venue is reachable for a real bridged bet only if it has a testnet deployment on a CCTP testnet chain. **Azuro (Polygon Amoy) is the only prediction market that qualifies** — Polymarket and Overtime are mainnet-only, PancakeSwap is on BNB (no CCTP). So those three are *reputation signal*; Azuro is *execution*.

## Quick start

```bash
cp .env.example .env.local   # fill ANTHROPIC_API_KEY + a funded Amoy/Arc testnet key
npm install

# Headless: run one decision cycle against live TruthBounty reputation
TRUTHBOUNTY_API_URL=https://truthbounty.xyz ANTHROPIC_API_KEY=sk-... npm run agent:cycle

# Or the dashboard (the live "agent thinking" view)
npm run dev   # http://localhost:3000
```

The decision loop runs with just `ANTHROPIC_API_KEY`. Live bridged execution additionally needs a funded testnet wallet, RPC URLs, and the Azuro Live API URL (see `.env.example`).

## Circle integration (proven, not checkbox)

- **CCTP V2** — burn-and-mint USDC Arc → Polygon Amoy. **Live proof:** real `depositForBurn` on Arc Testnet [`0xead3dba2…3001eae`](https://testnet.arcscan.app/tx/0xead3dba28afb79f71c5470545af4eb82cf4f7eb1a888b0de26c8815fa3001eae), Circle attestation `status: complete`. See `samples/cctp-settlement-proof.json`.
- **Native USDC gas** — that burn cost ~0.0037 **USDC** in gas (Arc's native gas token is USDC; balance 20.0 → 18.9963). The agent holds and spends only USDC.
- **Gateway** — on-chain GatewayWallet/GatewayMinter on Arc + USDC nanopayments (EIP-3009) per intelligence call.
- **Contracts** — our `CycleRegistry` deployed on Arc ([`0x68C3…49FB`](https://testnet.arcscan.app/address/0x68C36965fEA665fB53Fb0590aCcD4E99B64c49FB)). Every decision cycle attests its reasoning-trace hash + allocation outcome on-chain — the trace as a verifiable artifact (Arc Research #01), and a real recurring Arc settlement per cycle (e.g. `0x4cb50450…`). `scripts/loop.ts` runs this autonomously on an interval.
- **USYC (honest caveat)** — the agent's natural home for *reserved* capital is USYC (idle-capital yield on Arc). It's wired as intent but blocked on Circle's institutional allowlist (testnet USYC needs an approval ticket; mainnet needs non-US institutional KYC). Today it reserves in USDC on Arc; it routes to USYC once allowlisted. See `samples/arc-onchain-proof.json`.

## Troubleshooting

**`signAzuroOrder: EIP-712 domain/types pending`** — the bettor signature needs Azuro V3's Relayer EIP-712 domain (name/version/chainId/verifyingContract). Fill it from the deployed Relayer.

**`AZURO_LIVE_API_URL not set`** — Azuro V3 odds + the oracle co-signature come from Azuro's Live Betting API. Set the URL (and key) in `.env.local`.

**`CCTP attestation timed out`** — Iris sandbox can lag; the poll retries for 120s. Confirm `CCTP_IRIS_URL` points at the sandbox for testnet.

**Agent returns all skips** — that's a valid decision in a thin/overpriced board. Lower `minTruthScore` or widen the market set if you want more activity.
