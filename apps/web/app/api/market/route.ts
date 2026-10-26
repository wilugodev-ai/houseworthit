import { isStale, parseObservation, type MarketSeries } from '../../lib/market';

export const dynamic = 'force-dynamic';

const sources = [
  { id: 'MORTGAGE30US', name: '30-year fixed mortgage average', source: 'Freddie Mac PMMS via FRED', sourceUrl: 'https://fred.stlouisfed.org/series/MORTGAGE30US', frequency: 'Weekly' },
  { id: 'DGS10', name: '10-year U.S. Treasury yield', source: 'Federal Reserve H.15 via FRED', sourceUrl: 'https://fred.stlouisfed.org/series/DGS10', frequency: 'Daily on business days' },
] as const;

export async function GET() {
  const series = await Promise.all(sources.map(async (source): Promise<MarketSeries> => {
    try {
      const response = await fetch(source.sourceUrl, {
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(10000),
        headers: { Accept: 'text/html' },
      });
      if (!response.ok) throw new Error('Source unavailable');
      const observation = parseObservation(await response.text());
      return { ...source, observation, stale: isStale(observation, source.id) };
    } catch {
      return { ...source, observation: null, stale: false };
    }
  }));
  return Response.json({ series }, { headers: { 'Cache-Control': 'no-store' } });
}
