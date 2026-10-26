import type { financialSnapshot } from '@houseworthit/calculations';

const money = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
const percent = (amount: number | null) => amount === null ? '—' : `${amount.toFixed(1)}%`;

export default function FinancialPicture({ snapshot, onEditFinances }: {
  snapshot: ReturnType<typeof financialSnapshot>;
  onEditFinances: () => void;
}) {
  return <section className="financial-picture" aria-labelledby="financial-picture-title">
    <div className="financial-heading">
      <div><span className="eyebrow">BEYOND THE MONTHLY PAYMENT</span><h3 id="financial-picture-title">Your financial picture.</h3></div>
      <button type="button" className="text-button" onClick={onEditFinances}>{snapshot.monthlyBreathingRoom === null ? 'Add your monthly budget' : 'Edit your finances'} ↗</button>
    </div>
    <div className="financial-grid">
      <article className="financial-card" data-metric="ltv">
        <h4>Estimated loan-to-value <span>LTV</span></h4>
        <strong>{percent(snapshot.estimatedLtv)}</strong>
        <p>The share of your home price financed by the mortgage.</p>
      </article>
      <article className="financial-card" data-metric="housing-ratio">
        <h4>Housing ratio <span>GROSS INCOME</span></h4>
        <strong>{percent(snapshot.housingRatio)}</strong>
        <p>{snapshot.housingRatio === null ? 'Add annual income to see this ratio.' : 'Housing payment as a share of income before taxes. Excludes maintenance.'}</p>
      </article>
      <article className={`financial-card${snapshot.cashAfterClosing < 0 ? ' financial-shortfall' : ''}`} data-metric="cash-after-closing">
        <h4>Cash after closing <span>PURCHASE SAVINGS</span></h4>
        <strong>{money(snapshot.cashAfterClosing)}</strong>
        <p>{snapshot.cashAfterClosing < 0 ? 'Savings shortfall after the down payment and estimated closing costs.' : 'Purchase savings left after the down payment and estimated closing costs.'}</p>
      </article>
      <article className={`financial-card${snapshot.monthlyBreathingRoom !== null && snapshot.monthlyBreathingRoom < 0 ? ' financial-shortfall' : ''}`} data-metric="breathing-room">
        <h4>Monthly breathing room <span>TAKE-HOME PAY</span></h4>
        <strong>{snapshot.monthlyBreathingRoom === null ? '—' : money(snapshot.monthlyBreathingRoom)}</strong>
        <p>{snapshot.monthlyBreathingRoom === null ? 'Add take-home pay and living expenses to complete your monthly budget.' : snapshot.monthlyBreathingRoom < 0 ? 'Monthly shortfall after home costs, maintenance, debts and living expenses.' : 'Left each month after home costs, maintenance, debts and living expenses.'}</p>
      </article>
    </div>
    <details className="financial-method">
      <summary>How these numbers work</summary>
      <dl>
        <div><dt>Estimated LTV</dt><dd>Loan amount ÷ home price. This planning estimate uses the purchase price; an appraisal and lender rules can change the value used for your loan. <a href="https://www.consumerfinance.gov/ask-cfpb/what-is-a-loan-to-value-ratio-and-how-does-it-relate-to-my-costs-en-121/" target="_blank" rel="noreferrer">About LTV ↗</a></dd></div>
        <div><dt>Housing ratio & DTI</dt><dd>Housing includes principal, interest, property taxes, home insurance, HOA and estimated PMI. The housing ratio divides this payment by gross monthly income; DTI also includes the other debt payments you enter. Maintenance is excluded from both ratios.</dd></div>
        <div><dt>Cash after closing</dt><dd>Purchase savings minus the down payment and estimated closing costs. A negative result is a savings shortfall. Prepaid adjustments, credits, moving costs and emergency reserves are not included.</dd></div>
        <div><dt>Monthly breathing room</dt><dd>Monthly take-home pay minus the full home cost shown above, other debt payments and your living expenses. Include utilities and other regular spending in living expenses, without counting current rent, the home costs shown here or debt payments again.</dd></div>
      </dl>
    </details>
  </section>;
}
