/* csv.js — tolerant transaction-CSV parser.
   Primary target: Empower (Personal Capital) exports
   ("Date","Account","Description","Category","Tags","Amount"),
   but also maps Mint / Monarch / bank exports via header synonyms. */

const CSV = (() => {

  // ---- low-level tokenizer (quotes, escaped quotes, newlines in fields) ----
  function tokenize(text) {
    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field); field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  // ---- header mapping ----
  const SYNONYMS = {
    date:        ['date', 'transaction date', 'posted date', 'post date', 'trans date'],
    description: ['description', 'merchant', 'name', 'payee', 'original description', 'memo/description'],
    amount:      ['amount', 'amount (usd)', 'transaction amount'],
    debit:       ['debit', 'withdrawal', 'money out', 'outflow'],
    credit:      ['credit', 'deposit', 'money in', 'inflow'],
    category:    ['category', 'category name'],
    account:     ['account', 'account name', 'account number'],
    tags:        ['tags', 'labels', 'tag'],
    type:        ['transaction type', 'type', 'debit/credit'],
    notes:       ['notes', 'memo'],
  };

  function norm(s) { return String(s || '').trim().toLowerCase().replace(/^﻿/, ''); }

  function mapHeader(cells) {
    const map = {};
    cells.forEach((cell, i) => {
      const n = norm(cell);
      for (const key of Object.keys(SYNONYMS)) {
        if (map[key] === undefined && SYNONYMS[key].includes(n)) map[key] = i;
      }
    });
    return map;
  }

  function isHeaderRow(cells) {
    const m = mapHeader(cells);
    return m.date !== undefined && (m.amount !== undefined || m.debit !== undefined || m.credit !== undefined);
  }

  // ---- value parsing ----
  function parseDate(s) {
    s = String(s || '').trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);            // 2026-08-14
    if (m) return iso(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);            // 8/14/2026 or 08/14/26
    if (m) { let y = +m[3]; if (y < 100) y += 2000; return iso(y, +m[1], +m[2]); }
    m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);                // 08-14-2026
    if (m) return iso(+m[3], +m[1], +m[2]);
    const d = new Date(s);                                       // "Aug 14, 2026"
    if (!isNaN(d)) return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
    return null;
  }
  function iso(y, mo, d) {
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  function parseAmount(s) {
    if (s === null || s === undefined) return null;
    let t = String(s).trim();
    if (!t) return null;
    let negative = false;
    if (/^\(.*\)$/.test(t)) { negative = true; t = t.slice(1, -1); }
    t = t.replace(/[$,\s]/g, '');
    if (t.startsWith('-')) { negative = !negative ? true : negative; t = t.slice(1); }
    else if (t.startsWith('+')) t = t.slice(1);
    const v = parseFloat(t);
    if (isNaN(v)) return null;
    return negative ? -v : v;
  }

  // Stable id from the fields that define identity (also the dedupe key).
  function txnKey(t) { return [t.date, t.amount.toFixed(2), norm(t.description), norm(t.account)].join('|'); }
  function hash(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  /* Parse one file's text. Returns {transactions, skipped, format}.
     Sign convention out: expenses negative, income positive. */
  function parse(text) {
    const rows = tokenize(text);
    let headerIdx = -1, map = null;
    for (let i = 0; i < Math.min(rows.length, 8); i++) {
      if (isHeaderRow(rows[i])) { headerIdx = i; map = mapHeader(rows[i]); break; }
    }
    if (headerIdx === -1) return { transactions: [], skipped: rows.length, format: 'unrecognized' };

    const out = [];
    let skipped = 0;
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      if (r.length === 1 && !r[0].trim()) continue;
      const date = parseDate(r[map.date]);
      let amount = null;
      if (map.amount !== undefined) amount = parseAmount(r[map.amount]);
      if (amount === null && (map.debit !== undefined || map.credit !== undefined)) {
        const d = map.debit !== undefined ? parseAmount(r[map.debit]) : null;
        const c = map.credit !== undefined ? parseAmount(r[map.credit]) : null;
        if (d !== null && d !== 0) amount = -Math.abs(d);
        else if (c !== null) amount = Math.abs(c);
      }
      if (!date || amount === null) { skipped++; continue; }

      // Mint-style "Transaction Type" column: amounts are unsigned, type carries sign
      if (map.type !== undefined && map.amount !== undefined) {
        const ty = norm(r[map.type]);
        if (ty === 'debit' || ty === 'withdrawal') amount = -Math.abs(amount);
        else if (ty === 'credit' || ty === 'deposit') amount = Math.abs(amount);
      }

      const t = {
        date,
        month: date.slice(0, 7),
        description: String(r[map.description] ?? '').trim() || '(no description)',
        category: String(map.category !== undefined ? r[map.category] : '').trim() || 'Uncategorized',
        account: String(map.account !== undefined ? r[map.account] : '').trim() || 'Imported',
        tags: String(map.tags !== undefined ? r[map.tags] : '').trim(),
        amount: Math.round(amount * 100) / 100,
      };
      t.id = hash(txnKey(t)) + '-' + hash(t.description + t.category);
      out.push(t);
    }
    const format = map.tags !== undefined && map.account !== undefined ? 'empower' : 'generic';
    return { transactions: out, skipped, format };
  }

  return { parse, txnKey };
})();
