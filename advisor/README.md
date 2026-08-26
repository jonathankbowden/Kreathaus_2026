# Kreathaus Money

A private, self-hosted take on Monarch Money: import your cash flow from an
Empower (Personal Capital) CSV export and get dashboards, subscription
tracking, budgets, and a Claude-powered personal financial advisor.

No build step, no backend, no account. All data lives in your browser's
localStorage. The only network call the app ever makes is the advisor chat,
which sends aggregated totals (never account numbers) to `api.anthropic.com`
with your own API key.

## Run it

Serve the repo and open `/advisor/`:

```bash
npx serve .
# → http://localhost:3000/advisor/
```

(Any static host works — the app is plain HTML/CSS/JS.)

## Get your data in

1. Sign in to the Empower Personal Dashboard on the web.
2. Open **Banking → Transactions** and set a generous date range — a year or
   more gives the advisor the best picture.
3. Click the **CSV download** icon above the transaction list.
4. Drag the downloaded `transactions.csv` onto the app (or use **Import CSV**).

Re-importing overlapping exports is safe — duplicates are detected and
skipped. Mint, Monarch, and most bank CSV formats also work: the parser maps
common header names and Debit/Credit column pairs automatically.

Categories that look like transfers between your own accounts (credit-card
payments, brokerage transfers, …) are auto-excluded from income/spending math;
adjust the list under **Settings → Transfers & exclusions**.

No Empower account? **Explore with demo data** loads 14 months of realistic
sample transactions.

## The advisor

Two layers:

- **Local insights** — computed in your browser, no API needed: savings rate
  vs. the 20% guideline, category spikes vs. trailing average, recurring
  charges and subscription creep (including price-increase detection),
  merchant concentration, 50/30/20 breakdown, and budget overruns.
- **Ask Claude** — a chat grounded in your actual numbers. Add an Anthropic
  API key (console.anthropic.com) under **Settings**; the app streams
  responses from the Claude API directly from the browser. Default model is
  Claude Opus 5, with server-side refusal fallbacks enabled; Sonnet 5 and
  Haiku 4.5 are available for lower cost. Each chat turn sends the persona
  plus a compact JSON summary (monthly cash flow, category totals, recurring
  charges, largest expenses) as a cached system prompt.

This is educational guidance, not licensed financial advice — the advisor
persona says as much.

## Files

| File | Role |
|---|---|
| `index.html` / `app.css` | App shell and theme (light + dark, system-driven) |
| `js/csv.js` | Tolerant CSV parser + header mapping + dedupe keys |
| `js/store.js` | State, localStorage persistence, aggregates, recurring detection |
| `js/insights.js` | Local insight rules + the advisor's context summary |
| `js/charts.js` | Hand-rolled SVG charts (columns, stacks, bars, meters, sparklines) |
| `js/claude.js` | Streaming Claude API client (browser fetch, SSE) |
| `js/demo.js` | Seeded demo dataset |
| `js/app.js` | Views and UI wiring |
