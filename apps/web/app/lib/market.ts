export type MarketId = 'MORTGAGE30US' | 'DGS10';
export type Observation = { date: string; value: number };
export type MarketSeries = {
  id: MarketId;
  name: string;
  source: string;
  sourceUrl: string;
  frequency: string;
  observation: Observation | null;
  stale: boolean;
};

// Read only the explicitly labeled latest observation, never arbitrary numbers
// in page scripts, historical tables, or an error page.
export function parseObservation(html: string, now = new Date()): Observation {
  const match = html.match(/(\d{4}-\d{2}-\d{2}):\s*<span\s+class=["']series-meta-observation-value["']\s*>\s*(-?\d+(?:\.\d+)?)\s*<\/span>/);
  if (!match) throw new Error('The source did not contain a valid latest observation.');
  const date = match[1];
  const time = Date.parse(`${date}T00:00:00Z`);
  const value = Number(match[2]);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== date || time > now.getTime() + 86400000 || !Number.isFinite(value) || value < 0 || value > 25) {
    throw new Error('The published observation is outside supported bounds.');
  }
  return { date, value };
}

export function isStale(observation: Observation, id: MarketId, now = new Date()) {
  const ageDays = (now.getTime() - Date.parse(`${observation.date}T00:00:00Z`)) / 86400000;
  return ageDays > (id === 'MORTGAGE30US' ? 10 : 5);
}
