import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buyingPower, defaults, estimate, validateScenario } from '../packages/calculations/dist/index.js';
test('amortization matches a known 30-year mortgage', () => {
  const result = estimate({ ...defaults, price: 375000, downPercent: 20, rate: 6 });
  assert.ok(Math.abs(result.mortgage - 1798.6516) < 0.01);
  assert.equal(result.cashToClose, 86250);
  assert.equal(result.pmi, 0);
  assert.equal(result.monthly, result.mortgage + result.tax + result.insurance + result.hoa + result.maintenance + result.pmi);
});
test('zero interest and cash purchases remain finite', () => {
  assert.equal(estimate({ ...defaults, rate: 0 }).mortgage, 340000 / 360);
  const cash = estimate({ ...defaults, downPercent: 100 });
  assert.equal(cash.mortgage, 0);
  assert.equal(cash.totalInterest, 0);
  assert.ok(cash.monthly > 0);
});
test('PMI applies below 20 percent down and updates with principal', () => {
  assert.equal(estimate({ ...defaults, downPercent: 10 }).pmi, 382500 * 0.005 / 12);
  assert.equal(estimate({ ...defaults, downPercent: 20 }).pmi, 0);
});
test('untrusted input rejects missing, nonfinite, out-of-range and fractional-year values', () => {
  for (const value of [null, [], {}, { ...defaults, rate: NaN }, { ...defaults, price: Infinity }, { ...defaults, downPercent: 101 }, { ...defaults, years: 2.5 }, { ...defaults, rate: '6.5' }, { ...defaults, hoa: -1 }]) assert.throws(() => validateScenario(value));
});
test('income-based price obeys housing, debt, and available cash limits', () => {
  const power = buyingPower(defaults, 110000, 400, 100000);
  const result = estimate({ ...defaults, price: power.price });
  assert.ok(result.monthly - result.maintenance <= 110000 / 12 * .28);
  assert.ok(result.monthly - result.maintenance + 400 <= 110000 / 12 * .36);
  assert.ok(result.cashToClose <= 100000);
  assert.ok(buyingPower(defaults, 55000, 400, 100000).price < power.price);
  assert.ok(buyingPower(defaults, 110000, 2000, 100000).price < power.price);
  assert.ok(buyingPower(defaults, 110000, 400, 20000).price < power.price);
  assert.equal(buyingPower(defaults, 0, 0, 100000).price, 0);
  assert.equal(buyingPower(defaults, 100000, 0, 0).price, 0);
});
