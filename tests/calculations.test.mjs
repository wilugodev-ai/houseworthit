import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buyingPower, defaults, estimate, financialSnapshot, scenarioCsv, validateScenario } from '../packages/calculations/dist/index.js';
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

const snapshotHome = { ...defaults, price: 120000, downPercent: 20, rate: 0, years: 10, taxPercent: 1, insurance: 100, hoa: 50, maintenancePercent: 1, closingPercent: 3 };
const snapshotFinances = { annualIncome: 60000, monthlyDebts: 200, purchaseSavings: 30000, monthlyTakeHome: 4000, monthlyLivingExpenses: 1200 };

test('financial snapshot separates gross-income ratios from the take-home budget', () => {
  const result = financialSnapshot(snapshotHome, snapshotFinances);
  assert.equal(result.estimatedLtv, 80);
  assert.equal(result.housingRatio, 21);
  assert.equal(result.debtToIncome, 25);
  assert.equal(result.cashAfterClosing, 2400);
  assert.equal(result.monthlyBreathingRoom, 1450);
});

test('financial snapshot preserves cash and monthly shortfalls', () => {
  const result = financialSnapshot(snapshotHome, { ...snapshotFinances, purchaseSavings: 20000, monthlyTakeHome: 1000, monthlyLivingExpenses: 100 });
  assert.equal(result.cashAfterClosing, -7600);
  assert.equal(result.monthlyBreathingRoom, -450);
});

test('closing cost allowance changes cash needed without changing the monthly home budget', () => {
  const home = { ...snapshotHome, closingPercent: 5 };
  const costs = estimate(home);
  assert.equal(costs.downPayment, 24000);
  assert.equal(costs.closingCosts, 6000);
  assert.equal(costs.cashToClose, 30000);
  const result = financialSnapshot(home, snapshotFinances);
  assert.equal(result.cashAfterClosing, 0);
  assert.equal(result.monthlyBreathingRoom, 1450);
});

test('missing budget figures do not invent disposable income, while zero is a valid entry', () => {
  assert.equal(financialSnapshot(snapshotHome, { ...snapshotFinances, monthlyTakeHome: null }).monthlyBreathingRoom, null);
  assert.equal(financialSnapshot(snapshotHome, { ...snapshotFinances, monthlyLivingExpenses: undefined }).monthlyBreathingRoom, null);
  assert.equal(financialSnapshot(snapshotHome, { ...snapshotFinances, monthlyTakeHome: 0, monthlyLivingExpenses: 0 }).monthlyBreathingRoom, -1350);
});

test('zero income and all-cash purchases have meaningful snapshot values', () => {
  const result = financialSnapshot({ ...snapshotHome, downPercent: 100 }, { ...snapshotFinances, annualIncome: 0 });
  assert.equal(result.estimatedLtv, 0);
  assert.equal(result.housingRatio, null);
  assert.equal(result.debtToIncome, null);
  assert.equal(financialSnapshot({ ...snapshotHome, downPercent: 0 }, snapshotFinances).estimatedLtv, 100);
});

test('financial snapshot rejects invalid household and optional budget amounts', () => {
  for (const key of ['annualIncome', 'monthlyDebts', 'purchaseSavings', 'monthlyTakeHome', 'monthlyLivingExpenses']) {
    for (const value of [-1, NaN, Infinity, '4000']) assert.throws(() => financialSnapshot(snapshotHome, { ...snapshotFinances, [key]: value }));
  }
});

test('CSV export includes Excel encoding, quoted fields, numeric results and assumptions', () => {
  const csv = scenarioCsv(snapshotHome, snapshotFinances);
  assert.ok(csv.startsWith('\uFEFF"Section","Metric","Value","Unit","Notes"\r\n'));
  assert.ok(csv.endsWith('\r\n'));
  assert.ok(csv.includes('"Home price","120000.00","USD"'));
  assert.ok(csv.includes('"Loan term","10","years"'));
  assert.ok(csv.includes('"Estimated closing costs","3600.00","USD"'));
  assert.ok(csv.includes('"Estimated LTV","80.00","%"'));
  assert.ok(csv.includes('"Monthly breathing room","1450.00","USD/month"'));
  assert.ok(csv.includes('"Estimate limitations","Planning estimate, not a lender quote or credit decision.","",""\r\n'));
});

test('CSV export distinguishes missing budget amounts from zero', () => {
  const missing = scenarioCsv(snapshotHome, { ...snapshotFinances, monthlyTakeHome: null });
  assert.ok(missing.includes('"Monthly take-home pay","","USD/month","Not entered."'));
  assert.ok(missing.includes('"Monthly breathing room","","USD/month","Enter take-home pay and living expenses to calculate."'));
  const zero = scenarioCsv(snapshotHome, { ...snapshotFinances, monthlyTakeHome: 0, monthlyLivingExpenses: 0 });
  assert.ok(zero.includes('"Monthly take-home pay","0.00","USD/month"'));
  assert.ok(zero.includes('"Monthly breathing room","-1350.00","USD/month"'));
});

test('CSV export preserves shortfalls as signed numeric values', () => {
  const csv = scenarioCsv(snapshotHome, { ...snapshotFinances, purchaseSavings: 20000, monthlyTakeHome: 1000, monthlyLivingExpenses: 100 });
  assert.ok(csv.includes('"Cash after closing","-7600.00","USD"'));
  assert.ok(csv.includes('"Monthly breathing room","-450.00","USD/month"'));
});
