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

const short = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

export default function Home() {
  const [book, setBook] = useState(1000);
  const [loading, setLoading] = useState(false);
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Load the latest recorded cycle on mount, so the page is meaningful without
  // a server key. "Run agent cycle" triggers a fresh live run when one is set.
  useEffect(() => {
    fetch('/cycle-live.json')
      .then((r) => r.json())
      .then(setCycle)
      .catch(() => {});
  }, []);

  async function run() {
    setLoading(true);
    setErr(null);
    setCycle(null);
    try {
      const r = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bookUsd: book }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'cycle failed');
      setCycle(j);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const copies = cycle?.decisions.filter((d) => d.action === 'copy') ?? [];
  const skips = cycle?.decisions.filter((d) => d.action === 'skip') ?? [];

  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '48px 24px' }}>
      <h1 style={{ fontSize: 26, marginBottom: 4 }}>
        TruthBounty <span style={{ color: '#8b5cf6' }}>Agora</span>
      </h1>
      <p style={{ color: '#9a9ab0', marginTop: 0, lineHeight: 1.5 }}>
        An autonomous agent that copies the <em>provably</em> best prediction-market traders.
        Reputation from TruthBounty; a USDC book on Arc; real bets bridged via Circle CCTP.
      </p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '24px 0' }}>
        <label style={{ color: '#9a9ab0' }}>Book (USDC on Arc)</label>
        <input
          type="number"
          value={book}
          onChange={(e) => setBook(Number(e.target.value))}
          style={{ width: 110, padding: '8px 10px', background: '#15151f', color: '#e6e6f0', border: '1px solid #2a2a3a', borderRadius: 8 }}
        />
        <button
          onClick={run}
          disabled={loading}
          style={{ padding: '9px 18px', background: loading ? '#3a3a4a' : '#8b5cf6', color: 'white', border: 'none', borderRadius: 8, cursor: loading ? 'default' : 'pointer', fontWeight: 600 }}
        >
          {loading ? 'Agent thinking…' : 'Run agent cycle'}
        </button>
      </div>

      {err && <div style={{ color: '#f87171', padding: 12, background: '#1f1414', borderRadius: 8 }}>{err}</div>}

      {cycle?.arcProofs && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: '#9a9ab0', margin: '0 0 18px' }}>
          <span style={{ color: '#34d399' }}>● Live on Arc:</span>
          <a style={{ color: '#8b5cf6' }} href={`${cycle.arcProofs.explorer}/tx/${cycle.arcProofs.cctpSettlement}`} target="_blank" rel="noreferrer">CCTP settlement ↗</a>
          <a style={{ color: '#8b5cf6' }} href={`${cycle.arcProofs.explorer}/address/${cycle.arcProofs.cycleRegistry}`} target="_blank" rel="noreferrer">CycleRegistry ↗</a>
          <a style={{ color: '#8b5cf6' }} href={`${cycle.arcProofs.explorer}/tx/${cycle.arcProofs.cycleAttestation}`} target="_blank" rel="noreferrer">cycle attestation ↗</a>
        </div>
      )}

      {cycle && (
        <>
          <section style={{ background: '#13131c', border: '1px solid #232333', borderRadius: 12, padding: 18, marginBottom: 18 }}>
            <div style={{ color: '#8b5cf6', fontSize: 12, letterSpacing: 1, marginBottom: 6 }}>AGENT THESIS · {cycle.model}</div>
            <div style={{ lineHeight: 1.6 }}>{cycle.thesis}</div>
            <div style={{ color: '#9a9ab0', marginTop: 10, fontSize: 13 }}>
              Allocated <b style={{ color: '#34d399' }}>${cycle.allocatedUsd.toFixed(2)}</b> across {copies.length} positions · {skips.length} skipped
            </div>
          </section>

          {copies.map((d, i) => (
            <DecisionRow key={`c${i}`} d={d} kind="copy" />
          ))}
          {skips.map((d, i) => (
            <DecisionRow key={`s${i}`} d={d} kind="skip" />
          ))}
        </>
      )}
    </main>
  );
}

function DecisionRow({ d, kind }: { d: Decision; kind: 'copy' | 'skip' }) {
  const isCopy = kind === 'copy';
  return (
    <div style={{ display: 'flex', gap: 12, padding: 14, marginBottom: 8, background: '#101019', border: `1px solid ${isCopy ? '#1e3a2e' : '#23232f'}`, borderRadius: 10 }}>
      <div style={{ width: 56, flexShrink: 0, color: isCopy ? '#34d399' : '#6b6b80', fontWeight: 700, fontSize: 13 }}>
        {isCopy ? `COPY` : 'SKIP'}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13 }}>
          <span style={{ color: '#e6e6f0' }}>{short(d.trader)}</span>
          <span style={{ color: '#6b6b80' }}> · {d.venue}</span>
          {isCopy && d.sizeUsd ? <span style={{ color: '#34d399' }}> · ${d.sizeUsd.toFixed(2)}</span> : null}
          <span style={{ color: '#6b6b80' }}> · conf {(d.confidence * 100).toFixed(0)}%</span>
        </div>
        <div style={{ color: '#9a9ab0', fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>{d.reasoning}</div>
      </div>
    </div>
  );
}
