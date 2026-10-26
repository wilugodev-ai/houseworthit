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

export default function MarketSnapshot() {
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
    <section className="market-snapshot" aria-label="Mortgage and Treasury benchmarks" aria-busy={loading}>
      {series.map(item => {
        const value = !loading && item.observation ? item.observation.value.toFixed(2) : null;
        const publication = loading ? 'Checking published observation' : item.observation
          ? `As of ${observationDate(item.observation.date)}${item.stale ? ' · Older publication' : ''}`
          : 'Published observation unavailable';
        const context = item.id === 'MORTGAGE30US'
          ? 'Average interest rate, not APR. Mortgage data © Freddie Mac, provided as is via FRED.'
          : '10-year constant-maturity yield, not a bond price.';
        const description = `${item.name}: ${value ? `${value}%` : '—'}. ${publication}. ${item.source}. ${context} Published benchmark, not a real-time quote or loan offer.`;

        return (
          <a className="market-series" key={item.id} href={item.sourceUrl} target="_blank" rel="noreferrer" title={description} aria-label={`${description} Open source in a new tab.`}>
            <span className="market-symbol">{item.id === 'MORTGAGE30US' ? 'Mortgage 30Y' : 'US Treasury 10Y'}</span>
            <strong>{value || '—'}{value && <span className="market-percent">%</span>}</strong>
          </a>
        );
      })}
      <span className="market-status" role="status">{error || (!loading && series.some(item => !item.observation) ? 'Some published data could not be retrieved. Available observations are shown with their dates.' : '')}</span>
    </section>
  );
}
