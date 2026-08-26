/* insights.js — deterministic financial-advisor findings computed locally,
   plus the compact summary that becomes the Claude advisor's context. */

const Insights = (() => {

  const fmt = n => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const pct = n => Math.round(n * 100) + '%';

  /* Returns [{severity: 'good'|'warning'|'serious'|'info', title, body}] */
  function generate() {
    const out = [];
    const cash = Store.monthlyCashFlow();
    if (cash.length === 0) return out;

    // Only judge complete months: drop the current partial month when it's the last row.
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const complete = cash.filter(r => r.month !== thisMonth);
    const recent = complete.slice(-3);

    // --- savings rate ---
    if (recent.length) {
      const inc = recent.reduce((a, r) => a + r.income, 0);
      const net = recent.reduce((a, r) => a + r.net, 0);
      if (inc > 0) {
        const rate = net / inc;
        if (rate >= 0.2) out.push({ severity: 'good', title: `Savings rate ${pct(rate)}`, body: `Over the last ${recent.length} complete month(s) you kept ${fmt(net)} of ${fmt(inc)} income. That clears the 20% guideline — consider automating the surplus into investments.` });
        else if (rate >= 0) out.push({ severity: 'warning', title: `Savings rate ${pct(rate)}`, body: `You kept ${fmt(net)} of ${fmt(inc)} income over the last ${recent.length} complete month(s). The common guideline is 20%; closing the gap means finding about ${fmt(inc * 0.2 - net)} more per period.` });
        else out.push({ severity: 'serious', title: 'Spending exceeds income', body: `Over the last ${recent.length} complete month(s) you spent ${fmt(-net)} more than you earned. Prioritize identifying which categories below are driving the overrun.` });
      }
    }

    // --- category spikes: last complete month vs prior 3-month average ---
    if (complete.length >= 2) {
      const lastM = complete[complete.length - 1].month;
      const priorMs = complete.slice(-4, -1).map(r => r.month);
      for (const c of Store.spendingByCategory()) {
        const last = c.byMonth.get(lastM) || 0;
        const prior = priorMs.map(m => c.byMonth.get(m) || 0);
        if (!priorMs.length) break;
        const avg = prior.reduce((a, b) => a + b, 0) / priorMs.length;
        if (last > 75 && avg > 0 && last > avg * 1.4 && last - avg > 100) {
          out.push({ severity: 'warning', title: `${c.category} spiked in ${monthName(lastM)}`, body: `${fmt(last)} vs a ${fmt(avg)} average over the prior ${priorMs.length} month(s) — up ${pct(last / avg - 1)}. Worth a look at the transactions to see if it's one-off or a new normal.` });
        }
      }
    }

    // --- subscriptions ---
    const rec = Store.recurring();
    if (rec.length) {
      const total = rec.reduce((a, r) => a + r.monthlyCost, 0);
      const subs = rec.filter(r => r.isSubscription);
      const subTotal = subs.reduce((a, r) => a + r.monthlyCost, 0);
      const subsPart = subs.length
        ? ` Of that, ${fmt(subTotal)}/mo (${fmt(subTotal * 12)}/yr) is ${subs.length} cancelable subscription(s) — auditing those is the easiest raise you'll ever get.`
        : '';
      out.push({ severity: 'info', title: `${rec.length} recurring charges ≈ ${fmt(total)}/mo`, body: `Bills, memberships, and regular spending patterns detected across your history (see the Recurring tab).${subsPart}` });
      for (const r of rec.filter(r => r.priceIncreased).slice(0, 3)) {
        out.push({ severity: 'warning', title: `${titleCase(r.merchant)} price increase`, body: `Latest charge ${fmt(r.lastAmount)} vs its ${fmt(r.avgAmount)} historical average. Providers count on nobody noticing — this might be worth renegotiating or canceling.` });
      }
    }

    // --- concentration ---
    const merchants = Store.topMerchants(3);
    const spendTotal = cash.reduce((a, r) => a + r.spending, 0);
    if (merchants.length && spendTotal > 0 && merchants[0].total / spendTotal > 0.18) {
      out.push({ severity: 'info', title: `${titleCase(merchants[0].merchant)} is ${pct(merchants[0].total / spendTotal)} of spending`, body: `${fmt(merchants[0].total)} across ${merchants[0].count} transactions in this period. A single merchant this dominant is usually the highest-leverage place to optimize.` });
    }

    // --- 50/30/20 ---
    const nws = Store.needsWantsSavings();
    if (nws.income > 0) {
      const w = nws.wants / nws.income;
      if (w > 0.3) out.push({ severity: 'warning', title: `Wants at ${pct(w)} of income`, body: `The 50/30/20 rule suggests keeping discretionary spending near 30%. Yours is ${fmt(nws.wants)} against ${fmt(nws.income)} income — about ${fmt(nws.wants - nws.income * 0.3)} over the guideline.` });
      else out.push({ severity: 'good', title: `Discretionary spending at ${pct(w)}`, body: `Wants are within the 30% guideline (needs ${pct(nws.needs / nws.income)}, savings ${pct(nws.savings / nws.income)}).` });
    }

    // --- budgets ---
    const budgets = Store.state.settings.budgets;
    const lastCompleteM = complete.length ? complete[complete.length - 1].month : null;
    if (lastCompleteM) {
      for (const [cat, limit] of Object.entries(budgets)) {
        if (!limit) continue;
        const c = Store.spendingByCategory().find(x => x.category === cat);
        const spent = c ? (c.byMonth.get(lastCompleteM) || 0) : 0;
        if (spent > limit) out.push({ severity: 'serious', title: `Over budget: ${cat}`, body: `${fmt(spent)} spent in ${monthName(lastCompleteM)} against a ${fmt(limit)} budget (${pct(spent / limit - 1)} over).` });
      }
    }

    const order = { serious: 0, warning: 1, good: 2, info: 3 };
    return out.sort((a, b) => order[a.severity] - order[b.severity]);
  }

  function monthName(m) {
    const [y, mo] = m.split('-').map(Number);
    return new Date(y, mo - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
  }
  function titleCase(s) {
    return String(s).toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }

  /* Compact aggregate summary sent to the Claude advisor as context.
     Aggregates only — individual transactions are limited to the 15 largest. */
  function advisorContext() {
    const cash = Store.monthlyCashFlow();
    const cats = Store.spendingByCategory().slice(0, 20).map(c => ({
      category: c.category,
      total: round2(c.total),
      monthly: Object.fromEntries([...c.byMonth.entries()].map(([m, v]) => [m, round2(v)])),
    }));
    const rec = Store.recurring().map(r => ({
      merchant: r.merchant, cadence: r.cadence, avg: round2(r.avgAmount),
      last: round2(r.lastAmount), monthlyCost: round2(r.monthlyCost),
      priceIncreased: r.priceIncreased, isSubscription: r.isSubscription,
    }));
    const biggest = Store.filtered()
      .filter(t => t.amount < 0)
      .sort((a, b) => a.amount - b.amount)
      .slice(0, 15)
      .map(t => ({ date: t.date, description: t.description, category: t.category, amount: round2(t.amount) }));
    const nws = Store.needsWantsSavings();
    return {
      asOf: new Date().toISOString().slice(0, 10),
      range: Store.state.range,
      accounts: Store.accounts(),
      monthlyCashFlow: cash.map(r => ({ month: r.month, income: round2(r.income), spending: round2(r.spending), net: round2(r.net) })),
      spendingByCategory: cats,
      incomeByCategory: Store.incomeByCategory().map(c => ({ category: c.category, total: round2(c.total) })),
      topMerchants: Store.topMerchants(10).map(m => ({ merchant: m.merchant, total: round2(m.total), count: m.count })),
      recurringCharges: rec,
      largestExpenses: biggest,
      needsWantsSavings: { needs: round2(nws.needs), wants: round2(nws.wants), savings: round2(nws.savings), income: round2(nws.income) },
      budgets: Store.state.settings.budgets,
      localInsights: generate().map(i => ({ severity: i.severity, title: i.title })),
    };
  }
  function round2(n) { return Math.round(n * 100) / 100; }

  return { generate, advisorContext, monthName, titleCase, fmt, pct };
})();
