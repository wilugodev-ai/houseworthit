export type Scenario = {
  price: number; downPercent: number; rate: number; years: number;
  taxPercent: number; insurance: number; hoa: number; maintenancePercent: number;
  pmiPercent: number; closingPercent: number;
};
export const defaults: Scenario = { price: 425000, downPercent: 20, rate: 6.5, years: 30, taxPercent: 1.1, insurance: 150, hoa: 0, maintenancePercent: 1, pmiPercent: 0.5, closingPercent: 3 };
export const bounds: Record<keyof Scenario, [number, number]> = {
  price: [10000, 10000000], downPercent: [0, 100], rate: [0, 25], years: [1, 40],
  taxPercent: [0, 10], insurance: [0, 10000], hoa: [0, 10000],
  maintenancePercent: [0, 10], pmiPercent: [0, 5], closingPercent: [0, 15]
};
export function validateScenario(input: unknown): Scenario {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('A scenario object is required.');
  const result = {} as Scenario;
  for (const key of Object.keys(bounds) as (keyof Scenario)[]) {
    const value = (input as Record<string, unknown>)[key];
    const [min, max] = bounds[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (key === 'years' && !Number.isInteger(value))) throw new Error(`Invalid ${key}: expected ${min}–${max}${key === 'years' ? ' whole years' : ''}.`);
    result[key] = value;
  }
  return result;
}
export function estimate(input: Scenario) {
  const s = validateScenario(input);
  const downPayment = s.price * s.downPercent / 100;
  const principal = s.price - downPayment;
  const months = s.years * 12;
  const rate = s.rate / 1200;
  const mortgage = principal === 0 ? 0 : rate === 0 ? principal / months : principal * rate / (1 - Math.pow(1 + rate, -months));
  const tax = s.price * s.taxPercent / 1200;
  const maintenance = s.price * s.maintenancePercent / 1200;
  const pmi = s.downPercent < 20 ? principal * s.pmiPercent / 1200 : 0;
  const closingCosts = s.price * s.closingPercent / 100;
  return { mortgage, tax, insurance: s.insurance, hoa: s.hoa, maintenance, pmi,
    monthly: mortgage + tax + s.insurance + s.hoa + maintenance + pmi,
    downPayment, principal, closingCosts, cashToClose: downPayment + closingCosts,
    totalInterest: Math.max(0, mortgage * months - principal) };
}

export function buyingPower(input: Scenario, annualIncome: number, monthlyDebts: number, savings: number) {
  const s = validateScenario(input);
  for (const value of [annualIncome, monthlyDebts, savings]) if (!Number.isFinite(value) || value < 0) throw new Error('Finances must be nonnegative finite numbers.');
  const gross = annualIncome / 12;
  const housingBudget = Math.max(0, Math.min(gross * 0.28, gross * 0.36 - monthlyDebts));
  const fits = (price: number) => { const r = estimate({ ...s, price }); return r.monthly - r.maintenance <= housingBudget && r.cashToClose <= savings; };
  if (!fits(10000) || annualIncome === 0) return { price: 0, housingBudget, capped: false };
  let low = 10000; let high = 10000000;
  for (let i = 0; i < 60; i++) { const mid = (low + high) / 2; if (fits(mid)) low = mid; else high = mid; }
  return { price: Math.floor(low), housingBudget, capped: fits(10000000) };
}

export type HouseholdFinances = {
  annualIncome: number;
  monthlyDebts: number;
  purchaseSavings: number;
  monthlyTakeHome?: number | null;
  monthlyLivingExpenses?: number | null;
};

export function financialSnapshot(input: Scenario, finances: HouseholdFinances) {
  const { annualIncome, monthlyDebts, purchaseSavings, monthlyTakeHome = null, monthlyLivingExpenses = null } = finances;
  for (const value of [annualIncome, monthlyDebts, purchaseSavings]) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Finances must be nonnegative finite numbers.');
  }
  for (const value of [monthlyTakeHome, monthlyLivingExpenses]) {
    if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) throw new Error('Monthly budget amounts must be nonnegative finite numbers or omitted.');
  }
  const costs = estimate(input);
  const grossMonthly = annualIncome / 12;
  const housingPayment = costs.mortgage + costs.tax + costs.insurance + costs.hoa + costs.pmi;

  return {
    estimatedLtv: costs.principal / input.price * 100,
    housingRatio: grossMonthly > 0 ? housingPayment / grossMonthly * 100 : null,
    debtToIncome: grossMonthly > 0 ? (housingPayment + monthlyDebts) / grossMonthly * 100 : null,
    cashAfterClosing: purchaseSavings - costs.cashToClose,
    monthlyBreathingRoom: monthlyTakeHome !== null && monthlyLivingExpenses !== null
      ? monthlyTakeHome - costs.monthly - monthlyDebts - monthlyLivingExpenses
      : null,
  };
}
