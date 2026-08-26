/* charts.js — SVG chart components. No libraries.
   Specs: columns ≤24px with 4px rounded data-ends (square at baseline),
   2px surface gaps between touching marks, hairline solid gridlines,
   crosshair/mark tooltips, legend for ≥2 series, text in text tokens. */

const Charts = (() => {
  const NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs = {}) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  }
  function div(cls) { const d = document.createElement('div'); if (cls) d.className = cls; return d; }

  const fmtMoney = n => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const fmtCompact = n => {
    const a = Math.abs(n), s = n < 0 ? '-' : '';
    if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (a >= 1e3) return s + '$' + (a / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return s + '$' + Math.round(a);
  };
  const monthShort = m => {
    const [y, mo] = m.split('-').map(Number);
    return new Date(y, mo - 1, 1).toLocaleString('en-US', { month: 'short' });
  };

  // ---- shared tooltip ----
  let tipEl = null;
  function tooltip() {
    if (!tipEl) { tipEl = div('chart-tooltip'); tipEl.setAttribute('role', 'status'); document.body.appendChild(tipEl); }
    return tipEl;
  }
  function showTip(clientX, clientY, title, rows) {
    const tip = tooltip();
    tip.replaceChildren();
    const h = div('tip-title'); h.textContent = title; tip.appendChild(h);
    for (const r of rows) {
      const line = div('tip-row');
      const key = div('tip-key'); key.style.background = r.color || 'transparent';
      const val = div('tip-val'); val.textContent = r.value;
      const lab = div('tip-lab'); lab.textContent = r.label;
      line.append(key, val, lab);
      tip.appendChild(line);
    }
    tip.style.display = 'block';
    const pad = 14, w = tip.offsetWidth, hgt = tip.offsetHeight;
    let x = clientX + pad, y = clientY - hgt - pad;
    if (x + w > window.innerWidth - 8) x = clientX - w - pad;
    if (y < 8) y = clientY + pad;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }
  function hideTip() { if (tipEl) tipEl.style.display = 'none'; }

  function niceTicks(maxVal, count = 4) {
    if (maxVal <= 0) return [0, 1];
    const rough = maxVal / count;
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= rough) || 10 * mag;
    const ticks = [];
    for (let v = 0; v <= maxVal + step * 0.001; v += step) ticks.push(v);
    if (ticks[ticks.length - 1] < maxVal) ticks.push(ticks[ticks.length - 1] + step);
    return ticks;
  }

  // Column with rounded top (data end), square baseline. h >= 0.
  function columnPath(x, yTop, w, h, up = true) {
    const r = Math.min(4, w / 2, h);
    if (h <= 0.5) return `M${x},${yTop} h${w} v0 h${-w} Z`;
    if (up) return `M${x},${yTop + h} v${-(h - r)} q0,${-r} ${r},${-r} h${w - 2 * r} q${r},0 ${r},${r} v${h - r} Z`;
    return `M${x},${yTop} v${h - r} q0,${r} ${r},${r} h${w - 2 * r} q${r},0 ${r},${-r} v${-(h - r)} Z`;
  }

  function legend(host, series) {
    if (series.length < 2) return;
    const box = div('chart-legend');
    for (const s of series) {
      const item = div('legend-item');
      const sw = div('legend-swatch'); sw.style.background = s.color;
      const t = document.createElement('span'); t.textContent = s.name;
      item.append(sw, t);
      box.appendChild(item);
    }
    host.appendChild(box);
  }

  /* Shared frame: axes, gridlines, month labels. Returns geometry helpers. */
  function frame(host, months, maxVal, minVal = 0) {
    const W = Math.max(320, host.clientWidth || 640);
    const H = 240, padL = 52, padR = 12, padT = 12, padB = 26;
    const iw = W - padL - padR, ih = H - padT - padB;
    const ticksUp = niceTicks(Math.max(maxVal, 1));
    const ticksDown = minVal < 0 ? niceTicks(-minVal).slice(1).map(v => -v) : [];
    const top = ticksUp[ticksUp.length - 1];
    const bottom = ticksDown.length ? ticksDown[ticksDown.length - 1] : 0;
    const yOf = v => padT + (top - v) / (top - bottom) * ih;
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img' });

    for (const v of [...ticksUp, ...ticksDown]) {
      const y = yOf(v);
      svg.appendChild(svgEl('line', { x1: padL, x2: W - padR, y1: y, y2: y, class: v === 0 ? 'axis-baseline' : 'gridline' }));
      const t = svgEl('text', { x: padL - 8, y: y + 4, 'text-anchor': 'end', class: 'axis-label' });
      t.textContent = fmtCompact(v);
      svg.appendChild(t);
    }
    const band = iw / Math.max(months.length, 1);
    const labelEvery = Math.ceil(months.length / Math.floor(iw / 46));
    months.forEach((m, i) => {
      if (i % labelEvery !== 0) return;
      const t = svgEl('text', { x: padL + band * i + band / 2, y: H - 8, 'text-anchor': 'middle', class: 'axis-label' });
      t.textContent = monthShort(m) + (m.endsWith('-01') ? ` '${m.slice(2, 4)}` : '');
      svg.appendChild(t);
    });
    return { svg, W, H, padL, padR, padT, padB, iw, ih, band, yOf, y0: yOf(0) };
  }

  /* Hover overlay: crosshair band + one tooltip listing every series at that X. */
  function addHover(g, host, months, rowsAt, titleAt) {
    const wash = svgEl('rect', { y: g.padT, height: g.ih, class: 'hover-wash', width: g.band, x: 0, opacity: 0 });
    g.svg.insertBefore(wash, g.svg.firstChild);
    const hit = svgEl('rect', { x: g.padL, y: 0, width: g.iw, height: g.H, fill: 'transparent' });
    hit.style.touchAction = 'none';
    hit.addEventListener('pointermove', ev => {
      const rect = g.svg.getBoundingClientRect();
      const sx = (ev.clientX - rect.left) * (g.W / rect.width);
      let i = Math.floor((sx - g.padL) / g.band);
      i = Math.max(0, Math.min(months.length - 1, i));
      wash.setAttribute('x', g.padL + i * g.band);
      wash.setAttribute('opacity', 1);
      showTip(ev.clientX, ev.clientY, titleAt(i), rowsAt(i));
    });
    hit.addEventListener('pointerleave', () => { wash.setAttribute('opacity', 0); hideTip(); });
    g.svg.appendChild(hit);
    host.appendChild(g.svg);
  }

  /* Grouped columns — e.g. income vs spending per month. series: [{name,color,values}] */
  function groupedColumns(host, months, series) {
    host.replaceChildren();
    if (!months.length) return empty(host);
    const maxVal = Math.max(...series.flatMap(s => s.values), 0);
    const g = frame(host, months, maxVal);
    const n = series.length;
    const colW = Math.min(24, (g.band - 8 - 2 * (n - 1)) / n);
    series.forEach((s, si) => {
      s.values.forEach((v, i) => {
        const groupW = colW * n + 2 * (n - 1);
        const x = g.padL + i * g.band + (g.band - groupW) / 2 + si * (colW + 2);
        const h = g.y0 - g.yOf(v);
        const p = svgEl('path', { d: columnPath(x, g.yOf(v), colW, h), fill: s.color });
        g.svg.appendChild(p);
      });
    });
    addHover(g, host, months,
      i => series.map(s => ({ color: s.color, value: fmtMoney(s.values[i]), label: s.name })),
      i => Insights.monthName(months[i]));
    legend(host, series);
  }

  /* Diverging columns around zero — net cash flow. Positive blue, negative red. */
  function divergingColumns(host, months, values, { posColor, negColor }) {
    host.replaceChildren();
    if (!months.length) return empty(host);
    const maxVal = Math.max(...values, 0), minVal = Math.min(...values, 0);
    const g = frame(host, months, maxVal, minVal);
    const colW = Math.min(24, g.band - 10);
    values.forEach((v, i) => {
      const x = g.padL + i * g.band + (g.band - colW) / 2;
      const h = Math.abs(g.yOf(v) - g.y0);
      const p = v >= 0
        ? svgEl('path', { d: columnPath(x, g.yOf(v), colW, h, true), fill: posColor })
        : svgEl('path', { d: columnPath(x, g.y0, colW, h, false), fill: negColor });
      g.svg.appendChild(p);
    });
    addHover(g, host, months,
      i => [{ color: values[i] >= 0 ? posColor : negColor, value: fmtMoney(values[i]), label: 'Net' }],
      i => Insights.monthName(months[i]));
  }

  /* Stacked columns — top categories over time. series: [{name,color,values}] */
  function stackedColumns(host, months, series) {
    host.replaceChildren();
    if (!months.length || !series.length) return empty(host);
    const totals = months.map((_, i) => series.reduce((a, s) => a + s.values[i], 0));
    const g = frame(host, months, Math.max(...totals, 0));
    const colW = Math.min(24, g.band - 10);
    months.forEach((m, i) => {
      let yBase = g.y0;
      const x = g.padL + i * g.band + (g.band - colW) / 2;
      series.forEach((s, si) => {
        const v = s.values[i];
        if (v <= 0) return;
        const hFull = g.y0 - g.yOf(v);
        const h = Math.max(0, hFull - 2);              // 2px surface gap between segments
        const yTop = yBase - hFull;
        const isTop = series.slice(si + 1).every(s2 => s2.values[i] <= 0);
        const p = isTop
          ? svgEl('path', { d: columnPath(x, yTop, colW, h, true), fill: s.color })
          : svgEl('rect', { x, y: yTop, width: colW, height: h, fill: s.color });
        g.svg.appendChild(p);
        yBase = yTop;
      });
    });
    addHover(g, host, months,
      i => series.map(s => ({ color: s.color, value: fmtMoney(s.values[i]), label: s.name }))
        .filter(r => r.value !== '$0').reverse()
        .concat([{ color: 'transparent', value: fmtMoney(totals[i]), label: 'Total' }]),
      i => Insights.monthName(months[i]));
    legend(host, series);
  }

  /* Horizontal bars, sequential single hue — category magnitude. items: [{label, value}] */
  function hBars(host, items, { ramp }) {
    host.replaceChildren();
    if (!items.length) return empty(host);
    const max = Math.max(...items.map(d => d.value));
    const rowH = 34, labelW = 168, valueW = 76;
    const W = Math.max(320, host.clientWidth || 640);
    const barArea = W - labelW - valueW;
    const H = items.length * rowH;
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img' });
    items.forEach((d, i) => {
      const y = i * rowH + (rowH - 20) / 2;
      const w = Math.max(2, d.value / max * barArea);
      const t = Math.min(1, d.value / max);
      const color = ramp[Math.min(ramp.length - 1, Math.round((1 - t) * (ramp.length - 1)))];
      const lab = svgEl('text', { x: labelW - 10, y: y + 14, 'text-anchor': 'end', class: 'bar-label' });
      lab.textContent = d.label.length > 24 ? d.label.slice(0, 23) + '…' : d.label;
      svg.appendChild(lab);
      // horizontal bar: rounded data-end on the right, square at baseline (left)
      const r = Math.min(4, w / 2);
      const p = svgEl('path', { d: `M${labelW},${y} h${w - r} q${r},0 ${r},${r} v${20 - 2 * r} q0,${r} ${-r},${r} h${-(w - r)} Z`, fill: color });
      svg.appendChild(p);
      const val = svgEl('text', { x: labelW + w + 8, y: y + 14, class: 'bar-value' });
      val.textContent = fmtCompact(d.value);
      svg.appendChild(val);
      const hit = svgEl('rect', { x: 0, y: i * rowH, width: W, height: rowH, fill: 'transparent' });
      hit.addEventListener('pointermove', ev => showTip(ev.clientX, ev.clientY, d.label, [{ color, value: fmtMoney(d.value), label: d.sub || '' }]));
      hit.addEventListener('pointerleave', hideTip);
      svg.appendChild(hit);
    });
    host.appendChild(svg);
  }

  /* Meter — budget usage. Fill severity steps; track = lighter step of same ramp. */
  function meter(host, value, max, { ramp, warn, danger }) {
    host.replaceChildren();
    const pctv = max > 0 ? value / max : 0;
    const bar = div('meter-track');
    const fill = div('meter-fill');
    fill.style.width = Math.min(100, pctv * 100) + '%';
    fill.style.background = pctv > 1 ? danger : pctv > 0.85 ? warn : ramp;
    bar.appendChild(fill);
    host.appendChild(bar);
  }

  /* 12-point sparkline for stat tiles. */
  function sparkline(values, accent, dim) {
    const W = 96, H = 28, n = values.length;
    if (n < 2) return null;
    const min = Math.min(...values), max = Math.max(...values);
    const y = v => max === min ? H / 2 : 3 + (max - v) / (max - min) * (H - 6);
    const x = i => (i / (n - 1)) * (W - 4) + 2;
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'sparkline' });
    const dAll = values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
    svg.appendChild(svgEl('path', { d: dAll, fill: 'none', stroke: dim, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    const i0 = n - 2;
    svg.appendChild(svgEl('path', { d: `M${x(i0)},${y(values[i0])} L${x(n - 1)},${y(values[n - 1])}`, fill: 'none', stroke: accent, 'stroke-width': 2, 'stroke-linecap': 'round' }));
    svg.appendChild(svgEl('circle', { cx: x(n - 1), cy: y(values[n - 1]), r: 4, fill: accent, class: 'spark-dot' }));
    return svg;
  }

  function empty(host) {
    const d = div('chart-empty');
    d.textContent = 'No data in this range';
    host.appendChild(d);
  }

  return { groupedColumns, divergingColumns, stackedColumns, hBars, meter, sparkline, fmtMoney, fmtCompact, hideTip };
})();
