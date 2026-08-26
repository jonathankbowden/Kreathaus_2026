/* app.js — view rendering and UI wiring for Kreathaus Money. */

(() => {
  const $ = sel => document.querySelector(sel);
  const fmt = Charts.fmtMoney;

  let activeView = 'dashboard';
  let txnQuery = '', txnCategory = 'all', txnLimit = 300;

  // ---- tiny DOM helpers (labels from CSV are untrusted → textContent only) ----
  function h(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function card(title, sub) {
    const c = h('div', 'card');
    if (title) c.appendChild(h('h2', null, title));
    if (sub) c.appendChild(h('p', 'sub', sub));
    return c;
  }

  // Stable category → color assignment (by all-time spend order, so range
  // filters never repaint a surviving series).
  const SERIES_VARS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)',
    'var(--series-5)', 'var(--series-6)', 'var(--series-7)', 'var(--series-8)'];
  let colorMap = new Map();
  function assignColors() {
    colorMap = new Map();
    const totals = new Map();
    for (const t of Store.state.transactions) {
      if (t.amount >= 0 || Store.isTransfer(t)) continue;
      totals.set(t.category, (totals.get(t.category) || 0) + -t.amount);
    }
    [...totals.entries()].sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .forEach(([cat], i) => colorMap.set(cat, SERIES_VARS[i]));
  }
  const catColor = cat => colorMap.get(cat) || 'var(--baseline)';

  // ---- toast ----
  let toastTimer = null;
  function toast(msg) {
    let t = $('#toast');
    if (!t) {
      t = h('div'); t.id = 'toast';
      t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--ink);color:var(--page);padding:10px 18px;border-radius:10px;z-index:200;font-weight:550;box-shadow:var(--shadow)';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.style.display = 'none'; }, 3200);
  }

  // ==================== views ====================

  function render() {
    Charts.hideTip();
    const hasData = Store.state.transactions.length > 0;
    $('#empty-state').hidden = hasData;
    $('#view').hidden = !hasData;
    $('#filterbar').style.visibility = hasData ? 'visible' : 'hidden';
    $('#demo-badge').hidden = !Store.state.settings.demo;
    if (!hasData) return;
    assignColors();
    syncAccountPicker();
    const view = $('#view');
    view.replaceChildren();
    ({ dashboard: renderDashboard, spending: renderSpending, recurring: renderRecurring,
       budgets: renderBudgets, transactions: renderTransactions, advisor: renderAdvisor }[activeView])(view);
  }

  function syncAccountPicker() {
    const sel = $('#account-picker');
    const cur = Store.state.account;
    sel.replaceChildren();
    const all = h('option', null, 'All accounts'); all.value = 'all'; sel.appendChild(all);
    for (const a of Store.accounts()) {
      const o = h('option', null, a); o.value = a; sel.appendChild(o);
    }
    sel.value = [...sel.options].some(o => o.value === cur) ? cur : 'all';
    Store.state.account = sel.value;
  }

  // ---- stat tile ----
  function statTile(label, value, { delta, deltaClass, spark, hero } = {}) {
    const c = h('div', 'card');
    c.appendChild(h('div', 'stat-label', label));
    c.appendChild(h('div', 'stat-value' + (hero ? ' hero' : ''), value));
    const foot = h('div', 'stat-foot');
    foot.appendChild(h('div', 'stat-delta' + (deltaClass ? ' ' + deltaClass : ''), delta || ''));
    if (spark && spark.length > 1) {
      const s = Charts.sparkline(spark.slice(-12), 'var(--series-1)', 'var(--baseline)');
      if (s) foot.appendChild(s);
    }
    c.appendChild(foot);
    return c;
  }

  function renderDashboard(view) {
    const cash = Store.monthlyCashFlow();
    const income = cash.reduce((a, r) => a + r.income, 0);
    const spending = cash.reduce((a, r) => a + r.spending, 0);
    const net = income - spending;
    const rate = income > 0 ? net / income : 0;

    const kpis = h('div', 'grid kpi-row');
    kpis.append(
      statTile('Income', fmt(income), { spark: cash.map(r => r.income), delta: periodLabel() }),
      statTile('Spending', fmt(spending), { spark: cash.map(r => r.spending), delta: periodLabel() }),
      statTile('Net saved', fmt(net), {
        delta: net >= 0 ? 'cash-flow positive' : 'spending exceeds income',
        deltaClass: net >= 0 ? 'up' : 'down',
        spark: cash.map(r => r.net),
      }),
      statTile('Savings rate', Math.round(rate * 100) + '%', {
        delta: 'guideline: 20%+', deltaClass: rate >= 0.2 ? 'up' : rate < 0 ? 'down' : '',
      }),
    );
    view.appendChild(kpis);

    const flow = card('Cash flow', 'Income vs. spending by month (transfers excluded)');
    const flowHost = h('div'); flow.appendChild(flowHost); view.appendChild(flow);
    flow.classList.add('section-gap');

    const cols = h('div', 'grid two-col section-gap');
    const netCard = card('Net by month', 'What you kept (or overspent) each month');
    const netHost = h('div'); netCard.appendChild(netHost);
    const catCard = card('Top spending categories', periodLabel());
    const catHost = h('div'); catCard.appendChild(catHost);
    cols.append(netCard, catCard); view.appendChild(cols);

    const insCard = card('Advisor insights', 'Computed locally from your data — ask Claude about any of them in the Advisor tab');
    insCard.classList.add('section-gap');
    renderInsightList(insCard, Insights.generate().slice(0, 4));
    view.appendChild(insCard);

    // charts after layout so clientWidth is real
    requestAnimationFrame(() => {
      Charts.groupedColumns(flowHost, cash.map(r => r.month), [
        { name: 'Income', color: 'var(--series-1)', values: cash.map(r => r.income) },
        { name: 'Spending', color: 'var(--series-2)', values: cash.map(r => r.spending) },
      ]);
      Charts.divergingColumns(netHost, cash.map(r => r.month), cash.map(r => r.net),
        { posColor: 'var(--series-1)', negColor: 'var(--div-neg)' });
      const cats = Store.spendingByCategory().slice(0, 6);
      Charts.hBars(catHost, cats.map(c => ({ label: c.category, value: c.total, sub: c.count + ' transactions' })),
        { ramp: ['var(--seq-650)', 'var(--seq-550)', 'var(--seq-450)', 'var(--seq-350)', 'var(--seq-250)'] });
    });
  }

  function renderSpending(view) {
    const cats = Store.spendingByCategory();
    const months = Store.monthsInRange();

    const stackCard = card('Spending over time', 'Top categories by month; the rest fold into Other');
    const stackHost = h('div'); stackCard.appendChild(stackHost); view.appendChild(stackCard);

    const cols = h('div', 'grid two-col section-gap');

    const tableCard = card('All categories', periodLabel());
    const wrap = h('div', 'table-wrap');
    const table = h('table', 'data');
    const thead = h('thead'); const hr = h('tr');
    for (const [txt, cls] of [['Category', ''], ['Total', 'num'], ['Avg / mo', 'num'], ['Share', 'num']]) {
      const th = h('th', cls, txt); hr.appendChild(th);
    }
    thead.appendChild(hr); table.appendChild(thead);
    const tbody = h('tbody');
    const totalSpend = cats.reduce((a, c) => a + c.total, 0);
    for (const c of cats) {
      const tr = h('tr');
      const nameTd = h('td');
      const sw = h('span'); sw.style.cssText = `display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:8px;background:${catColor(c.category)}`;
      nameTd.append(sw, document.createTextNode(c.category));
      tr.appendChild(nameTd);
      tr.appendChild(h('td', 'num', fmt(c.total)));
      tr.appendChild(h('td', 'num', fmt(c.total / Math.max(months.length, 1))));
      tr.appendChild(h('td', 'num', totalSpend ? Math.round(c.total / totalSpend * 100) + '%' : '—'));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody); wrap.appendChild(table); tableCard.appendChild(wrap);

    const merchCard = card('Top merchants', 'Where the money actually goes');
    const merchHost = h('div'); merchCard.appendChild(merchHost);

    cols.append(tableCard, merchCard); view.appendChild(cols);

    requestAnimationFrame(() => {
      const top = cats.slice(0, 6);
      const series = top.map(c => ({
        name: c.category, color: catColor(c.category),
        values: months.map(m => c.byMonth.get(m) || 0),
      }));
      const rest = cats.slice(6);
      if (rest.length) {
        series.push({
          name: 'Other', color: 'var(--baseline)',
          values: months.map(m => rest.reduce((a, c) => a + (c.byMonth.get(m) || 0), 0)),
        });
      }
      Charts.stackedColumns(stackHost, months, series);
      Charts.hBars(merchHost, Store.topMerchants(10).map(m => ({
        label: Insights.titleCase(m.merchant), value: m.total, sub: m.count + ' transactions',
      })), { ramp: ['var(--seq-650)', 'var(--seq-550)', 'var(--seq-450)', 'var(--seq-350)', 'var(--seq-250)'] });
    });
  }

  function renderRecurring(view) {
    const rec = Store.recurring();
    const monthly = rec.reduce((a, r) => a + r.monthlyCost, 0);

    const subs = rec.filter(r => r.isSubscription);
    const subTotal = subs.reduce((a, r) => a + r.monthlyCost, 0);
    const kpis = h('div', 'grid kpi-row');
    kpis.append(
      statTile('Recurring / month', fmt(monthly), { delta: rec.length + ' active charges · ' + fmt(monthly * 12) + '/yr' }),
      statTile('Subscriptions', fmt(subTotal) + '/mo', { delta: subs.length + ' fixed-price services you could cancel' }),
      statTile('Price increases', String(rec.filter(r => r.priceIncreased).length), {
        delta: 'fixed charges now above their average', deltaClass: rec.some(r => r.priceIncreased) ? 'down' : '',
      }),
    );
    view.appendChild(kpis);

    const c = card('Detected recurring charges', 'Merchants with a regular cadence and stable amounts, across your full history');
    c.classList.add('section-gap');
    if (!rec.length) {
      c.appendChild(h('p', 'sub', 'Nothing detected yet — recurring detection needs at least 3 charges from the same merchant.'));
    } else {
      const wrap = h('div', 'table-wrap');
      const table = h('table', 'data');
      const thead = h('thead'); const hr = h('tr');
      for (const [txt, cls] of [['Merchant', ''], ['Category', ''], ['Cadence', ''], ['Last charge', 'num'], ['Avg', 'num'], ['≈ Monthly', 'num'], ['Last seen', 'num']]) {
        hr.appendChild(h('th', cls, txt));
      }
      thead.appendChild(hr); table.appendChild(thead);
      const tbody = h('tbody');
      for (const r of rec) {
        const tr = h('tr');
        tr.appendChild(h('td', null, Insights.titleCase(r.merchant)));
        const catTd = h('td'); catTd.appendChild(h('span', 'chip', r.category)); tr.appendChild(catTd);
        tr.appendChild(h('td', null, r.cadence + (r.isSubscription ? ' · subscription' : '')));
        const lastTd = h('td', 'num', fmt(r.lastAmount) + ' ');
        if (r.priceIncreased) lastTd.appendChild(h('span', 'chip rise', '↑ raised'));
        tr.appendChild(lastTd);
        tr.appendChild(h('td', 'num', fmt(r.avgAmount)));
        tr.appendChild(h('td', 'num', fmt(r.monthlyCost)));
        tr.appendChild(h('td', 'num', r.lastDate));
        tbody.appendChild(tr);
      }
      table.appendChild(tbody); wrap.appendChild(table); c.appendChild(wrap);
    }
    view.appendChild(c);
  }

  function renderBudgets(view) {
    const budgets = Store.state.settings.budgets;
    const now = new Date();
    const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const cats = Store.spendingByCategory();
    const spentIn = cat => {
      const c = cats.find(x => x.category === cat);
      return c ? (c.byMonth.get(curMonth) || 0) : 0;
    };

    const c = card('Monthly budgets', `Tracking ${Insights.monthName(curMonth)} — set a limit per category`);
    const budgeted = Object.keys(budgets).filter(k => budgets[k] > 0).sort();
    if (!budgeted.length) c.appendChild(h('p', 'sub', 'No budgets yet. Add one below — start with your top two or three discretionary categories.'));

    for (const cat of budgeted) {
      const limit = budgets[cat];
      const spent = spentIn(cat);
      const row = h('div', 'budget-row');
      const name = h('div'); name.textContent = cat; row.appendChild(name);
      const input = h('input');
      input.type = 'number'; input.min = '0'; input.step = '10'; input.value = limit;
      input.addEventListener('change', () => {
        const v = parseFloat(input.value);
        if (!v || v <= 0) delete budgets[cat]; else budgets[cat] = v;
        Store.persist(); render();
      });
      row.appendChild(input);
      const meterHost = h('div', 'meter-host'); row.appendChild(meterHost);
      Charts.meter(meterHost, spent, limit, { ramp: 'var(--series-1)', warn: 'var(--status-warning)', danger: 'var(--status-critical)' });
      const left = limit - spent;
      row.appendChild(h('div', 'budget-status', left >= 0 ? `${fmt(spent)} spent · ${fmt(left)} left` : `${fmt(spent)} spent · ${fmt(-left)} over`));
      c.appendChild(row);
    }

    // add-budget row
    const add = h('div', 'txn-controls section-gap');
    const sel = h('select');
    sel.appendChild(h('option', null, 'Choose category…')).value = '';
    for (const cat of cats.map(x => x.category).filter(x => !budgeted.includes(x))) {
      const o = h('option', null, cat); o.value = cat; sel.appendChild(o);
    }
    const amt = h('input'); amt.type = 'number'; amt.placeholder = 'Monthly limit'; amt.min = '0';
    amt.style.cssText = 'border:1px solid var(--border);border-radius:9px;padding:7px 10px;background:var(--surface);width:140px';
    const btn = h('button', 'btn primary', 'Add budget');
    btn.addEventListener('click', () => {
      const v = parseFloat(amt.value);
      if (!sel.value || !v || v <= 0) { toast('Pick a category and a positive limit'); return; }
      budgets[sel.value] = v;
      Store.persist(); render();
    });
    add.append(sel, amt, btn);
    c.appendChild(add);
    view.appendChild(c);
  }

  function renderTransactions(view) {
    const c = card('Transactions', null);
    const controls = h('div', 'txn-controls');
    const search = h('input'); search.type = 'search'; search.placeholder = 'Search description, category, account…'; search.value = txnQuery;
    search.addEventListener('input', () => { txnQuery = search.value; txnLimit = 300; refreshTable(); });
    const catSel = h('select');
    const allO = h('option', null, 'All categories'); allO.value = 'all'; catSel.appendChild(allO);
    for (const cat of Store.categories()) { const o = h('option', null, cat); o.value = cat; catSel.appendChild(o); }
    catSel.value = txnCategory;
    if (catSel.value !== txnCategory) { txnCategory = 'all'; catSel.value = 'all'; }
    catSel.addEventListener('change', () => { txnCategory = catSel.value; txnLimit = 300; refreshTable(); });
    controls.append(search, catSel);
    c.appendChild(controls);
    const holder = h('div');
    c.appendChild(holder);
    view.appendChild(c);

    function refreshTable() {
      holder.replaceChildren();
      const q = txnQuery.trim().toLowerCase();
      const rows = Store.filtered({ includeTransfers: true })
        .filter(t => txnCategory === 'all' || t.category === txnCategory)
        .filter(t => !q || t.description.toLowerCase().includes(q) || t.category.toLowerCase().includes(q) || t.account.toLowerCase().includes(q))
        .sort((a, b) => a.date < b.date ? 1 : -1);

      const spendSum = rows.filter(t => t.amount < 0 && !Store.isTransfer(t)).reduce((a, t) => a + t.amount, 0);
      holder.appendChild(h('p', 'sub', `${rows.length.toLocaleString()} transactions · ${fmt(-spendSum)} spending in view`));

      const wrap = h('div', 'table-wrap');
      const table = h('table', 'data');
      const thead = h('thead'); const hr = h('tr');
      for (const [txt, cls] of [['Date', ''], ['Description', ''], ['Category', ''], ['Account', ''], ['Amount', 'num']]) {
        hr.appendChild(h('th', cls, txt));
      }
      thead.appendChild(hr); table.appendChild(thead);
      const tbody = h('tbody');
      for (const t of rows.slice(0, txnLimit)) {
        const tr = h('tr', Store.isTransfer(t) ? 'transfer' : null);
        tr.appendChild(h('td', 'num', t.date));
        tr.appendChild(h('td', null, t.description));
        const catTd = h('td'); catTd.appendChild(h('span', 'chip', t.category + (Store.isTransfer(t) ? ' · transfer' : ''))); tr.appendChild(catTd);
        tr.appendChild(h('td', null, t.account));
        tr.appendChild(h('td', 'num' + (t.amount > 0 ? ' amt-pos' : ''), fmt(t.amount)));
        tbody.appendChild(tr);
      }
      table.appendChild(tbody); wrap.appendChild(table); holder.appendChild(wrap);
      if (rows.length > txnLimit) {
        const more = h('button', 'btn ghost section-gap', `Show more (${(rows.length - txnLimit).toLocaleString()} remaining)`);
        more.addEventListener('click', () => { txnLimit += 500; refreshTable(); });
        holder.appendChild(more);
      }
    }
    refreshTable();
  }

  function renderInsightList(host, insights) {
    if (!insights.length) { host.appendChild(h('p', 'sub', 'Not enough data yet for insights — import a few months of history.')); return; }
    const icons = { good: '✓', warning: '!', serious: '!', info: 'i' };
    for (const ins of insights) {
      const row = h('div', 'insight');
      row.appendChild(h('div', 'insight-icon ' + ins.severity, icons[ins.severity]));
      const body = h('div');
      body.appendChild(h('h3', null, ins.title));
      body.appendChild(h('p', null, ins.body));
      row.appendChild(body);
      host.appendChild(row);
    }
  }

  // ---- advisor ----
  function renderAdvisor(view) {
    const cols = h('div', 'grid two-col');

    const insCard = card('Local insights', 'Computed in your browser, no API needed');
    renderInsightList(insCard, Insights.generate());
    cols.appendChild(insCard);

    const chat = card('Ask Claude', null);
    chat.classList.add('chat-card');
    const hasKey = !!Store.state.settings.apiKey;

    const sugg = h('div', 'suggestions');
    for (const s of ['How am I doing overall?', 'Where can I cut $300/month?', 'Review my subscriptions', 'Propose a budget for next month']) {
      const b = h('button', null, s);
      b.addEventListener('click', () => { input.value = s; sendMsg(); });
      sugg.appendChild(b);
    }
    chat.appendChild(sugg);

    const log = h('div', 'chat-log');
    // replay in-memory history
    for (const m of ClaudeAdvisor.getHistory()) {
      const div = h('div', 'msg ' + (m.role === 'user' ? 'user' : 'assistant'));
      if (m.role === 'assistant') renderMarkdownInto(div, m.content); else div.textContent = m.content;
      log.appendChild(div);
    }
    if (!ClaudeAdvisor.getHistory().length) {
      const wel = h('div', 'msg assistant');
      wel.textContent = hasKey
        ? 'I\'ve got your cash-flow summary loaded. Ask me anything about your money — or tap a suggestion above.'
        : 'Add your Anthropic API key in Settings (⚙, top right) to enable the advisor chat. The local insights on the left work without it.';
      log.appendChild(wel);
    }
    chat.appendChild(log);

    const form = h('div', 'chat-form');
    const input = h('textarea');
    input.placeholder = hasKey ? 'Ask your advisor…' : 'Add an API key in Settings first';
    input.disabled = !hasKey;
    input.rows = 1;
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
    });
    const send = h('button', 'btn primary', 'Send');
    send.disabled = !hasKey;
    send.addEventListener('click', sendMsg);
    form.append(input, send);
    chat.appendChild(form);

    const hintRow = h('div', 'chat-hint');
    hintRow.textContent = 'Sends aggregated totals for the selected range to the Anthropic API — not raw account numbers. Educational guidance, not licensed financial advice. ';
    const resetBtn = h('button', 'btn ghost', 'Reset conversation');
    resetBtn.style.cssText = 'font-size:12.5px;padding:2px 10px;margin-left:6px';
    resetBtn.addEventListener('click', () => { ClaudeAdvisor.reset(); render(); });
    hintRow.appendChild(resetBtn);
    chat.appendChild(hintRow);

    cols.appendChild(chat);
    view.appendChild(cols);

    let busy = false;
    function sendMsg() {
      const text = input.value.trim();
      if (!text || busy) return;
      busy = true; send.disabled = true; input.value = '';
      const u = h('div', 'msg user', text);
      log.appendChild(u);
      const a = h('div', 'msg assistant', '…');
      log.appendChild(a);
      log.scrollTop = log.scrollHeight;
      let acc = '';
      ClaudeAdvisor.send(text, {
        onDelta: d => {
          acc += d;
          a.textContent = acc;
          log.scrollTop = log.scrollHeight;
        },
        onDone: full => {
          renderMarkdownInto(a, full);
          log.scrollTop = log.scrollHeight;
          busy = false; send.disabled = false; input.focus();
        },
        onError: msg => {
          a.remove();
          log.appendChild(h('div', 'msg error', msg));
          busy = false; send.disabled = false;
        },
      });
    }
  }

  /* Minimal markdown → DOM. Escapes everything first; supports headings,
     bold, code, and bullet/numbered lists. */
  function renderMarkdownInto(el, text) {
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const inline = s => esc(s)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
    const lines = String(text).split('\n');
    let html = '', list = null;
    const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
    for (const raw of lines) {
      const line = raw.trimEnd();
      const mUl = line.match(/^\s*[-*]\s+(.*)/);
      const mOl = line.match(/^\s*\d+[.)]\s+(.*)/);
      const mH = line.match(/^#{1,4}\s+(.*)/);
      if (mUl) { if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul'; } html += '<li>' + inline(mUl[1]) + '</li>'; }
      else if (mOl) { if (list !== 'ol') { closeList(); html += '<ol>'; list = 'ol'; } html += '<li>' + inline(mOl[1]) + '</li>'; }
      else if (mH) { closeList(); html += '<h4>' + inline(mH[1]) + '</h4>'; }
      else if (!line.trim()) { closeList(); }
      else { closeList(); html += '<p>' + inline(line) + '</p>'; }
    }
    closeList();
    el.innerHTML = html;
  }

  // ==================== import / settings / wiring ====================

  async function importFiles(files) {
    let added = 0, skipped = 0, bad = 0;
    for (const f of files) {
      const text = await f.text();
      const { transactions, skipped: sk, format } = CSV.parse(text);
      if (format === 'unrecognized') { bad++; continue; }
      skipped += sk;
      added += Store.addTransactions(transactions, { demo: false });
    }
    if (bad && !added) { toast('Could not find transaction columns in that file — expected Date + Amount headers.'); return; }
    ClaudeAdvisor.reset();
    toast(`Imported ${added.toLocaleString()} new transactions` + (skipped ? ` (${skipped} rows skipped)` : ''));
    render();
  }

  function openSettings() {
    $('#set-apikey').value = Store.state.settings.apiKey;
    $('#set-model').value = Store.state.settings.model || 'claude-opus-5';
    const list = $('#set-exclusions');
    list.replaceChildren();
    const excluded = new Set(Store.state.settings.excludedCategories);
    for (const cat of Store.categories()) {
      const label = h('label');
      const cb = h('input'); cb.type = 'checkbox'; cb.value = cat; cb.checked = excluded.has(cat);
      label.append(cb, document.createTextNode(cat));
      list.appendChild(label);
    }
    if (!Store.categories().length) list.appendChild(h('p', 'hint', 'Import data first to manage categories.'));
    $('#settings-dialog').showModal();
  }

  function saveSettings() {
    const excluded = [...$('#set-exclusions').querySelectorAll('input:checked')].map(cb => cb.value);
    Store.saveSettings({
      apiKey: $('#set-apikey').value.trim(),
      model: $('#set-model').value,
      excludedCategories: excluded,
    });
    ClaudeAdvisor.reset();
    render();
  }

  function periodLabel() {
    return { '3m': 'last 3 months', '6m': 'last 6 months', '12m': 'last 12 months', ytd: 'year to date', all: 'all time' }[Store.state.range];
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify({ transactions: Store.state.transactions, budgets: Store.state.settings.budgets }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'kreathaus-money-export.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function wire() {
    $('#tabs').addEventListener('click', e => {
      const b = e.target.closest('.tab');
      if (!b) return;
      activeView = b.dataset.view;
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === b));
      render();
    });
    $('#range-picker').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      Store.state.range = b.dataset.range;
      document.querySelectorAll('#range-picker button').forEach(x => x.classList.toggle('active', x === b));
      render();
    });
    $('#account-picker').addEventListener('change', e => { Store.state.account = e.target.value; render(); });

    const fileInput = $('#file-input');
    $('#btn-import').addEventListener('click', () => fileInput.click());
    $('#btn-import-2').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => { if (fileInput.files.length) { importFiles([...fileInput.files]); fileInput.value = ''; } });

    $('#btn-demo').addEventListener('click', () => {
      Store.addTransactions(Demo.generate(), { demo: true });
      ClaudeAdvisor.reset();
      toast('Demo data loaded — replace it any time via Settings → Delete all data');
      render();
    });

    const dz = $('#drop-zone');
    for (const ev of ['dragover', 'dragenter']) dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('dragover'); });
    for (const ev of ['dragleave', 'drop']) dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('dragover'); });
    dz.addEventListener('drop', e => {
      const files = [...e.dataTransfer.files].filter(f => /\.csv$/i.test(f.name) || f.type.includes('csv') || f.type === 'text/plain');
      if (files.length) importFiles(files); else toast('Drop a .csv file');
    });

    $('#btn-settings').addEventListener('click', openSettings);
    $('#btn-save-settings').addEventListener('click', saveSettings);
    $('#btn-export').addEventListener('click', exportJSON);
    $('#btn-clear').addEventListener('click', () => {
      if (confirm('Delete all imported transactions, budgets, and category settings from this browser?')) {
        Store.clearAll();
        ClaudeAdvisor.reset();
        $('#settings-dialog').close();
        render();
      }
    });

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(render, 200);
    });
  }

  Store.load();
  wire();
  render();
})();
