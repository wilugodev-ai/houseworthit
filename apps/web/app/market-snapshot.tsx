'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MarketSeries } from './lib/market';

const fallback: MarketSeries[] = [
  { id: 'MORTGAGE30US', name: '30-year fixed mortgage average', source: 'Freddie Mac PMMS via FRED', sourceUrl: 'https://fred.stlouisfed.org/series/MORTGAGE30US', frequency: 'Weekly', observation: null, stale: false },
  { id: 'DGS10', name: '10-year U.S. Treasury yield', source: 'Federal Reserve H.15 via FRED', sourceUrl: 'https://fred.stlouisfed.org/series/DGS10', frequency: 'Daily on business days', observation: null, stale: false },
];

function observationDate(date: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

export default function MarketSnapshot({ onUseRate }: { onUseRate: (rate: number) => void }) {
  const [series, setSeries] = useState<MarketSeries[]>(fallback);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/market', { cache: 'no-store', signal });
      if (!response.ok) throw new Error('Market data is temporarily unavailable.');
      const data = await response.json();
      if (!Array.isArray(data.series) || data.series.length !== 2) throw new Error('Market data is temporarily unavailable.');
      setSeries(data.series);
    } catch (failure) {
      if (signal?.aborted) return;
      setSeries(fallback);
      setError('Market data is temporarily unavailable. Follow the source links to check published rates.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return (
    <section className="market-snapshot" aria-labelledby="market-title">
      <div className="market-intro">
        <span className="eyebrow">A LITTLE MARKET CONTEXT</span>
        <h3 id="market-title">Rates to keep in view.</h3>
        <p>Latest published U.S. benchmarks.<br/>Not real-time quotes or loan offers.</p>
        <button className="text-button" disabled={loading} onClick={() => void load()}>{loading ? 'Checking sources…' : 'Reload snapshot ↻'}</button>
      </div>
      {series.map(item => (
        <article className="market-series" key={item.id}>
          <h4>{item.name}</h4>
          <strong>{loading ? '—' : item.observation ? `${item.observation.value.toFixed(2)}%` : 'Unavailable'}</strong>
          <span className="market-date">{!loading && item.observation ? <>As of <time dateTime={item.observation.date}>{observationDate(item.observation.date)}</time>{item.stale && ' · Older publication'}</> : loading ? 'Retrieving published observation' : 'No verified observation returned'}</span>
          <a href={item.sourceUrl} target="_blank" rel="noreferrer">{item.source} ↗</a>
          <small>{item.frequency} · Sources checked at most hourly</small>
          {item.id === 'MORTGAGE30US' && item.observation && !loading && !item.stale && <button className="market-use-rate" onClick={() => onUseRate(item.observation!.value)}>Use this rate in calculator ↗</button>}
        </article>
      ))}
      <div className="market-explainer">
        <p><strong>Interest rate vs. APR:</strong> This mortgage benchmark is an average interest rate. APR also includes points and certain loan fees. Your actual rate and APR depend on your loan and lender. <a href="https://www.consumerfinance.gov/ask-cfpb/what-is-the-difference-between-a-mortgage-interest-rate-and-an-apr-en-135/" target="_blank" rel="noreferrer">Learn the difference ↗</a></p>
        <p>The Treasury figure is the 10-year constant-maturity yield, not a bond price or a mortgage rate. The series have different publication schedules. Mortgage data © Freddie Mac, provided as is via FRED.</p>
        <span className="market-status" role="status">{error || (!loading && series.some(item => !item.observation) ? 'Some published data could not be retrieved. Available observations are shown with their dates.' : '')}</span>
      </div>
    </section>
  );
}
