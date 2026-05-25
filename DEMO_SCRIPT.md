# Demo Script — TruthBounty Agora (≤3:00)

Crisis-first. The money shot is the agent *catching a data artifact* and then *refusing to deploy into stale markets* — judgment, live — paired with a real, Circle-attested settlement on Arc. Built around the actual cycle in `samples/cycle-live-2026-05-25.json` and the real tx in `samples/cctp-settlement-proof.json`.

## Before recording
- `npm run dev`, dashboard at localhost:3000, book ~$19 (matches the funded wallet).
- Two explorer tabs ready: Arc tx `0xead3dba2…3001eae` on testnet.arcscan.app, and the Circle attestation (`status: complete`).
- The live cycle reproduces with `AGENT_COMPLETION_FILE=… npm run agent:cycle` (or with `ANTHROPIC_API_KEY` set, fully autonomously — identical output path).

## The hook (0:00–0:15)
> "Prediction markets did billions in volume last year. Almost everyone loses. The few who actually win? You can't find them, you can't copy them, and even if you could — you'd have to trust them with your money."

**[Do: dashboard idle, click "Run agent cycle"]**

## The agent thinks — money shot (0:15–1:40)
> "TruthBounty already scores every trader across platforms. This agent reasons over that live, right now."

**[Do: thesis streams in. Slow down here.]**

> "First, it gets skeptical. Seven of the top accounts show a win rate pinned at *exactly* ninety-five percent — across totally different sample sizes, from seven thousand bets to eighty-six thousand. The agent flags that as a scoring artifact, not skill, and throws the whole cluster out."

**[Do: highlight the skip rows discounting the 0.450 cluster]**

> "It anchors instead on the sharp it can actually trust — a trader with twenty-two percent edge over a hundred-and-fifty-three thousand resolved bets, sixteen million in profit."

> "And then it does the most important thing an autonomous agent can do: it refuses to act. The only venue it can settle on from Arc has markets that closed five months ago. Betting into a settled market burns money — so it reserves the entire book and flags that it needs a live market first. It decides *not* to trade."

**[Do: show allocated $0 / reserved $19 + the thesis line about discipline]**

## It settles on Arc, in dollars (1:40–2:30)
> "When it does deploy, here's the rail — and it's already live. The agent's money sits on Arc, Circle's stablecoin chain, as USDC. It moves cross-chain with Circle's CCTP."

**[Do: Arc explorer — the real depositForBurn tx `0xead3dba2…`, status success]**

> "This is a real burn on Arc, attested by Circle — status complete. The gas? Three-tenths of a cent, paid in USDC, because on Arc the gas token *is* the dollar. The agent never touches a volatile token. It even pays for its own intelligence in USDC nanopayments — it earns more than it spends, or it doesn't trade."

**[Do: show Circle attestation status: complete + the gas-in-USDC balance delta]**

## The close (2:30–3:00)
> "A reputation engine that already knows who's good. An autonomous agent that acts on it — and knows when *not* to. Settling in dollars on Arc. Built on the live TruthBounty product. That's a real market participant — disciplined enough to wait."

**[Do: dashboard reasoning feed + the Arc explorer side by side]**

## If things go wrong
- API/key issue → run the BYO-model path (`AGENT_COMPLETION_FILE=samples/…`) — identical output, no key.
- Want to show a placed bet → requires a live Azuro market; the honest cut is the disciplined skip + the real CCTP settlement above.
