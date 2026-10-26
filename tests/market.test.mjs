import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseObservation, isStale } from '../apps/web/app/lib/market.ts';

const now = new Date('2026-10-26T12:00:00Z');
test('market parser reads the labeled observation and preserves its publication date', () => {
  assert.deepEqual(parseObservation('<p>2026-10-22: <span class="series-meta-observation-value">7.32</span></p>', now), { date: '2026-10-22', value: 7.32 });
});

test('market parser rejects unavailable, unrelated, invalid, and future data', () => {
  for (const html of [
    '<html>Service unavailable 503</html>',
    '<p>2026-10-22: <span class="other">7.32</span></p>',
    '2026-10-22: <span class="series-meta-observation-value">.</span>',
    '2026-02-30: <span class="series-meta-observation-value">4.96</span>',
    '2099-10-22: <span class="series-meta-observation-value">4.96</span>',
    '2026-10-22: <span class="series-meta-observation-value">100</span>',
  ]) assert.throws(() => parseObservation(html, now));
});

test('staleness respects daily and weekly publication schedules', () => {
  const observation = { date: '2026-10-19', value: 5 };
  assert.equal(isStale(observation, 'DGS10', now), true);
  assert.equal(isStale(observation, 'MORTGAGE30US', now), false);
  assert.equal(isStale({ ...observation, date: '2026-10-22' }, 'DGS10', now), false);
});
