/* store.js — app state, persistence, and every derived aggregate the views need.
   All data lives in localStorage; nothing leaves the browser unless the user
   sends a summary to the Claude advisor. */

const Store = (() => {
  const TXN_KEY = 'kh_money_txns_v1';
  const SET_KEY = 'kh_money_settings_v1';

  const state = {
    transactions: [],   // sorted ascending by date
    settings: {
      apiKey: '',
      model: 'claude-opus-5',
      excludedCategories: [],   // treated as transfers: out of cash flow
      budgets: {},              // category -> monthly dollars
      demo: false,
    },
    range: '6m',        // '3m' | '6m' | '12m' | 'ytd' | 'all'
    account: 'all',
  };

  // Categories that are money moving between your own accounts, not cash flow.
  const TRANSFER_RE = /transfer|credit card payment|cc payment|payment to|loan payment|investment purchase|401k|brokerage buy|cash management/i;

  // Rough needs/wants map for the 50/30/20 lens. Anything unmatched counts as "wants".
  const NEEDS_RE = /grocer|utilit|rent|mortgage|insurance|healthcare|health|medical|pharmac|gas|fuel|electric|water|internet|phone|telecom|childcare|tuition|loan|debt|transit|commut/i;
  const SAVINGS_RE = /saving|invest|retirement|401k|ira|brokerage/i;
  const INCOME_RE = /income|paycheck|salary|interest|dividend|refund|reimburse|bonus/i;

  function load() {
    try {
      const t = JSON.parse(localStorage.getItem(TXN_KEY) || '[]');
      if (Array.isArray(t)) state.transactions = t;
    } catch (e) { /* corrupted store: start clean */ }
    try {
      const s = JSON.parse(localStorage.getItem(SET_KEY) || '{}');
      Object.assign(state.settings, s);
    } catch (e) { /* keep defaults */ }
  }
  function persist() {
    localStorage.setItem(TXN_KEY, JSON.stringify(state.transactions));
    localStorage.setItem(SET_KEY, JSON.stringify(state.settings));
  }
  function saveSettings(patch) { Object.assign(state.settings, patch); persist(); }

  /* Merge new transactions; dedupe on identity key. Returns count added. */
  function addTransactions(txns, { demo = false } = {}) {
    const seen = new Set(state.transactions.map(t => CSV.txnKey(t)));
    let added = 0;
    for (const t of txns) {
      const k = CSV.txnKey(t);
      if (seen.has(k)) continue;
      seen.add(k);
      state.transactions.push(t);
      added++;
    }
    state.transactions.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    state.settings.demo = demo;
    // Auto-exclude transfer-looking categories the first time we see them.
    const known = new Set(state.settings.excludedCategories);
    for (const t of state.transactions) {
      if (TRANSFER_RE.test(t.category) && !known.has(t.category)) {
        known.add(t.category);
      }
    }
    state.settings.excludedCategories = [...known];
    persist();
    return added;
  }
  function clearAll() {
    state.transactions = [];
    state.settings.demo = false;
    state.settings.budgets = {};
    state.settings.excludedCategories = [];
    persist();
  }

  // ---- filtering ----
  function isTransfer(t) { return state.settings.excludedCategories.includes(t.category); }

  function rangeStart(rangeKey) {
    const months = allMonths();
    if (!months.length) return '0000-00';
    const last = months[months.length - 1];
    if (rangeKey === 'all') return '0000-00';
    if (rangeKey === 'ytd') return last.slice(0, 4) + '-01';
    const n = { '3m': 3, '6m': 6, '12m': 12 }[rangeKey] || 6;
    const [y, m] = last.split('-').map(Number);
    const d = new Date(y, m - 1 - (n - 1), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function filtered({ includeTransfers = false } = {}) {
    const start = rangeStart(state.range);
    return state.transactions.filter(t =>
      t.month >= start &&
      (state.account === 'all' || t.account === state.account) &&
      (includeTransfers || !isTransfer(t)));
  }

  function allMonths() {
    const s = new Set(state.transactions.map(t => t.month));
    return [...s].sort();
  }
  function accounts() {
    const s = new Set(state.transactions.map(t => t.account));
    return [...s].sort();
  }
  function categories() {
    const s = new Set(state.transactions.map(t => t.category));
    return [...s].sort();
  }

  // ---- aggregates (all computed over filtered txns, transfers excluded) ----
  function monthsInRange() {
    const start = rangeStart(state.range);
    return allMonths().filter(m => m >= start);
  }

  /* Per-month income / spending / net. */
  function monthlyCashFlow() {
    const months = monthsInRange();
    const rows = months.map(m => ({ month: m, income: 0, spending: 0, net: 0 }));
    const idx = new Map(months.map((m, i) => [m, i]));
    for (const t of filtered()) {
      const r = rows[idx.get(t.month)];
      if (!r) continue;
      if (t.amount >= 0) r.income += t.amount; else r.spending += -t.amount;
    }
    rows.forEach(r => { r.net = r.income - r.spending; });
    return rows;
  }

  /* category -> {total, byMonth: Map} for spending only. */
  function spendingByCategory() {
    const map = new Map();
    for (const t of filtered()) {
      if (t.amount >= 0) continue;
      let e = map.get(t.category);
      if (!e) { e = { category: t.category, total: 0, byMonth: new Map(), count: 0 }; map.set(t.category, e); }
      e.total += -t.amount;
      e.count++;
      e.byMonth.set(t.month, (e.byMonth.get(t.month) || 0) + -t.amount);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }

  function incomeByCategory() {
    const map = new Map();
    for (const t of filtered()) {
      if (t.amount < 0) continue;
      map.set(t.category, (map.get(t.category) || 0) + t.amount);
    }
    return [...map.entries()].map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
  }

  function topMerchants(limit = 12) {
    const map = new Map();
    for (const t of filtered()) {
      if (t.amount >= 0) continue;
      const name = normalizeMerchant(t.description);
      let e = map.get(name);
      if (!e) { e = { merchant: name, total: 0, count: 0 }; map.set(name, e); }
      e.total += -t.amount; e.count++;
    }
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, limit);
  }

  function normalizeMerchant(desc) {
    return String(desc)
      .replace(/\d{3,}/g, '')          // store numbers, confirmation codes
      .replace(/[#*]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim().toUpperCase().slice(0, 40) || '(UNKNOWN)';
  }

  /* Recurring detection over ALL non-transfer expenses (not range-limited, so
     cadence can be established), grouped by normalized merchant. */
  function recurring() {
    const groups = new Map();
    for (const t of state.transactions) {
      if (t.amount >= 0 || isTransfer(t)) continue;
      const key = normalizeMerchant(t.description);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
    const out = [];
    for (const [merchant, txns] of groups) {
      if (txns.length < 3) continue;
      txns.sort((a, b) => a.date < b.date ? -1 : 1);
      const gaps = [];
      for (let i = 1; i < txns.length; i++) {
        gaps.push((new Date(txns[i].date) - new Date(txns[i - 1].date)) / 86400000);
      }
      const medGap = median(gaps);
      let cadence = null;
      if (medGap >= 5 && medGap <= 9) cadence = 'weekly';
      else if (medGap >= 12 && medGap <= 17) cadence = 'biweekly';
      else if (medGap >= 26 && medGap <= 35) cadence = 'monthly';
      else if (medGap >= 80 && medGap <= 100) cadence = 'quarterly';
      else if (medGap >= 330 && medGap <= 400) cadence = 'yearly';
      if (!cadence) continue;
      const amounts = txns.map(t => -t.amount);
      const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const sd = Math.sqrt(amounts.reduce((a, b) => a + (b - avg) ** 2, 0) / amounts.length);
      const cv = avg > 0 ? sd / avg : 1;
      if (cv > 0.35) continue;   // amounts too irregular to call recurring
      const perMonth = { weekly: avg * 52 / 12, biweekly: avg * 26 / 12, monthly: avg, quarterly: avg / 3, yearly: avg / 12 }[cadence];
      const last = txns[txns.length - 1];
      const lastAmount = -last.amount;
      // A fixed-price service (Netflix, gym, ISP): near-identical amounts and a
      // discretionary category. Variable spending patterns (groceries, gas)
      // are still recurring, but not cancelable subscriptions.
      const isSubscription = cv <= 0.12 && classifyCategory(last.category) === 'wants';
      out.push({
        merchant, cadence, count: txns.length,
        avgAmount: avg, lastAmount, lastDate: last.date,
        monthlyCost: perMonth,
        category: last.category,
        isSubscription,
        // only flag a "price increase" where the amount is normally fixed
        priceIncreased: cv <= 0.12 && lastAmount > avg * 1.05 && lastAmount - avg > 1,
      });
    }
    return out.sort((a, b) => b.monthlyCost - a.monthlyCost);
  }

  function median(arr) {
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  /* 50/30/20 lens over the filtered range. */
  function needsWantsSavings() {
    let needs = 0, wants = 0, savings = 0, income = 0;
    for (const t of state.transactions) {
      const start = rangeStart(state.range);
      if (t.month < start) continue;
      if (state.account !== 'all' && t.account !== state.account) continue;
      if (t.amount >= 0) { if (!isTransfer(t)) income += t.amount; continue; }
      if (SAVINGS_RE.test(t.category)) { savings += -t.amount; continue; }
      if (isTransfer(t)) continue;
      if (NEEDS_RE.test(t.category)) needs += -t.amount; else wants += -t.amount;
    }
    const leftover = Math.max(0, income - needs - wants - savings);
    savings += leftover;   // unspent income counts toward savings
    return { needs, wants, savings, income };
  }

  function classifyCategory(cat) {
    if (INCOME_RE.test(cat)) return 'income';
    if (SAVINGS_RE.test(cat)) return 'savings';
    if (NEEDS_RE.test(cat)) return 'needs';
    return 'wants';
  }

  return {
    state, load, persist, saveSettings, addTransactions, clearAll,
    filtered, allMonths, monthsInRange, accounts, categories, isTransfer,
    monthlyCashFlow, spendingByCategory, incomeByCategory, topMerchants,
    recurring, needsWantsSavings, classifyCategory, normalizeMerchant,
  };
})();
