/* claude.js — browser client for the Claude advisor chat.
   Calls the Anthropic Messages API directly with the user's own API key
   (stored in localStorage, sent only to api.anthropic.com). */

const ClaudeAdvisor = (() => {
  const API_URL = 'https://api.anthropic.com/v1/messages';
  let history = [];   // [{role, content}] — in-memory only

  const PERSONA = `You are a personal financial advisor inside a private, self-hosted finance dashboard. The user has imported their real cash-flow data (from an Empower export); an aggregated summary of it is provided below as JSON. Everything you say should be grounded in these numbers — quote specific figures, months, merchants, and categories rather than speaking generically.

Your style: direct, warm, numerate. Lead with the answer, then the reasoning. Give concrete, prioritized actions with dollar impact estimates. When the data can't answer something (e.g. account balances, net worth, tax details — this dataset is cash flow only), say so and ask for what you'd need.

You are not a licensed financial professional and this is educational guidance, not individualized investment, tax, or legal advice; note this briefly when recommendations are consequential (once per conversation is enough — don't repeat it in every message).`;

  function contextBlock() {
    return PERSONA + '\n\nFINANCIAL DATA SUMMARY (JSON):\n' + JSON.stringify(Insights.advisorContext());
  }

  function reset() { history = []; }
  function getHistory() { return history; }

  /* Send one user turn; streams text deltas back. */
  async function send(userText, { onDelta, onDone, onError }) {
    const { apiKey, model } = Store.state.settings;
    if (!apiKey) { onError('Add your Anthropic API key in Settings to enable the advisor.'); return; }

    history.push({ role: 'user', content: userText });

    const body = {
      model: model || 'claude-opus-5',
      max_tokens: 16000,
      stream: true,
      system: [{
        type: 'text',
        text: contextBlock(),
        cache_control: { type: 'ephemeral' },   // stable prefix: persona + data summary
      }],
      messages: history,
    };
    const headers = {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    };
    // Server-side refusal fallbacks (Opus 5 / Fable 5): route to a sibling model
    // instead of surfacing a bare refusal.
    if (/^claude-(opus|fable)-5/.test(body.model)) {
      headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
      body.fallbacks = 'default';
    }

    let assistantText = '';
    try {
      const res = await fetch(API_URL, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!res.ok) {
        let msg = `API error (HTTP ${res.status})`;
        try {
          const err = await res.json();
          if (err?.error?.message) msg = err.error.message;
        } catch (e) { /* non-JSON error body */ }
        history.pop();
        onError(msg);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '', stopReason = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let ev;
          try { ev = JSON.parse(line.slice(6)); } catch (e) { continue; }
          if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
            assistantText += ev.delta.text;
            onDelta(ev.delta.text);
          } else if (ev.type === 'message_delta' && ev.delta?.stop_reason) {
            stopReason = ev.delta.stop_reason;
          } else if (ev.type === 'error') {
            throw new Error(ev.error?.message || 'stream error');
          }
        }
      }

      if (stopReason === 'refusal' && !assistantText) {
        history.pop();
        onError('The model declined to answer that request. Try rephrasing your question.');
        return;
      }
      history.push({ role: 'assistant', content: assistantText || '(no response)' });
      onDone(assistantText);
    } catch (e) {
      history.pop();
      onError(e.message === 'Failed to fetch'
        ? 'Could not reach api.anthropic.com. Check your network connection.'
        : 'Request failed: ' + e.message);
    }
  }

  return { send, reset, getHistory };
})();
