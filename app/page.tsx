'use client';

import { useState, useEffect } from 'react';

interface Decision {
  action: 'copy' | 'skip';
  trader: string;
  venue: string;
  marketId?: string;
  outcome?: string;
  sizeUsd?: number;
  confidence: number;
  reasoning: string;
}
interface ArcProofs {
  cctpSettlement: string;
  cycleRegistry: string;
  cycleAttestation: string;
  explorer: string;
}
interface Cycle {
  cycleId: string;
  model: string;
  thesis: string;
  decisions: Decision[];
  allocatedUsd: number;
  arcProofs?: ArcProofs;
}

const short = (a: string) => (a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
const txShort = (h: string) => `${h.slice(0, 8)}…${h.slice(-4)}`;

export default function Home() {
  const [book, setBook] = useState(1000);
  const [loading, setLoading] = useState(false);
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Load the latest recorded cycle on mount, so the page is meaningful without
  // a server key. "RUN CYCLE" triggers a fresh live run when one is configured.
  useEffect(() => {
    fetch('/cycle-live.json')
      .then((r) => r.json())
      .then(setCycle)
      .catch(() => {});
  }, []);

  async function run() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bookUsd: book }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'cycle failed');
      // Carry the proof strip forward, and surface the FRESH attestation tx this
      // run just wrote to Arc — so a live run produces a new clickable proof.
      setCycle({
        ...j,
        arcProofs: cycle?.arcProofs
          ? { ...cycle.arcProofs, cycleAttestation: j.attestTxHash || cycle.arcProofs.cycleAttestation }
          : j.arcProofs,
      });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const copies = cycle?.decisions.filter((d) => d.action === 'copy') ?? [];
  const skips = cycle?.decisions.filter((d) => d.action === 'skip') ?? [];
  const p = cycle?.arcProofs;

  return (
    <main className="wrap">
      <header className="statusbar">
        <div className="brand">
          TRUTHBOUNTY <span className="amber">AGORA</span>
        </div>
        <div className="status">
          <span className="dot" aria-hidden /> LIVE · ARC TESTNET · CHAIN 5042002
        </div>
      </header>

      <p className="lede">
        An autonomous agent that copies the <em>provably</em>-best prediction-market traders.
        Reputation from TruthBounty · a USDC book on Arc · settled via Circle CCTP.
      </p>

      <div className="cmd">
        <span className="prompt">$</span>
        <span className="cmd-text">run cycle --book</span>
        <input
          className="input"
          type="number"
          aria-label="Book size in USDC on Arc"
          value={book}
          onChange={(e) => setBook(Number(e.target.value))}
        />
        <button className="btn" onClick={run} disabled={loading}>
          {loading ? 'AGENT THINKING…' : 'RUN CYCLE'}
        </button>
      </div>

      {err && <div className="error">! {err}</div>}

      {p && (
        <div className="trust">
          <span className="trust-label">✓ VERIFIED ON ARC</span>
          <a className="trust-item" href={`${p.explorer}/tx/${p.cctpSettlement}`} target="_blank" rel="noreferrer">
            CCTP SETTLEMENT <code>{txShort(p.cctpSettlement)}</code> ↗
          </a>
          <a className="trust-item" href={`${p.explorer}/address/${p.cycleRegistry}`} target="_blank" rel="noreferrer">
            CYCLEREGISTRY <code>{txShort(p.cycleRegistry)}</code> ↗
          </a>
          <a className="trust-item" href={`${p.explorer}/tx/${p.cycleAttestation}`} target="_blank" rel="noreferrer">
            ATTESTATION <code>{txShort(p.cycleAttestation)}</code> ↗
          </a>
        </div>
      )}

      {!cycle && !err && (
        <div className="empty">
          LOADING LATEST CYCLE<span className="cursor" />
        </div>
      )}

      {cycle && (
        <>
          <section className="panel">
            <div className="panel-head">
              <span className="label">
                AGENT THESIS<span className="cursor" />
              </span>
              <span className="badge">{cycle.model}</span>
            </div>
            <p className="thesis">{cycle.thesis}</p>
          </section>

          <div className="metrics">
            <div className="metric">
              <div className="m-label">ALLOCATED</div>
              <div className={`m-value ${cycle.allocatedUsd > 0 ? 'green' : ''}`}>
                ${cycle.allocatedUsd.toFixed(0)}
              </div>
            </div>
            <div className="metric">
              <div className="m-label">POSITIONS</div>
              <div className="m-value green">{copies.length}</div>
            </div>
            <div className="metric">
              <div className="m-label">EVALUATED</div>
              <div className="m-value">{cycle.decisions.length}</div>
            </div>
            <div className="metric">
              <div className="m-label">SKIPPED</div>
              <div className="m-value amber">{skips.length}</div>
            </div>
          </div>

          <div className="feed-head">DECISION FEED</div>
          <div className="feed">
            {[...copies, ...skips].map((d, i) => (
              <DecisionRow key={`${d.action}-${i}`} d={d} index={i} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}

function DecisionRow({ d, index }: { d: Decision; index: number }) {
  const isCopy = d.action === 'copy';
  return (
    <div className={`row ${isCopy ? 'copy' : 'skip'}`} style={{ ['--i' as string]: index } as React.CSSProperties}>
      <div className="action">{isCopy ? 'COPY' : 'SKIP'}</div>
      <div>
        <div className="row-meta">
          <code className="trader">{short(d.trader)}</code>
          <span className="tag">{d.venue}</span>
          {isCopy && d.sizeUsd ? <span className="size">${d.sizeUsd.toFixed(2)}</span> : null}
          <span className="conf">CONF {(d.confidence * 100).toFixed(0)}%</span>
        </div>
        <div className="reasoning">{d.reasoning}</div>
      </div>
    </div>
  );
}
