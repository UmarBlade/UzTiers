// Diagrammalar (mytiers uslubi): silliq chiziq va to'lqinsimon soya, oldingi davr bilan solishtirish, kichik trend chiziqlari.
// Hammasi oddiy SVG; ranglar style.css dagi o'zgaruvchilardan olinadi.
import { h, fmtNum } from './core.js';

const NS = 'http://www.w3.org/2000/svg';
let gradientId = 0;
function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, v);
  for (const kid of kids) if (kid) el.append(kid);
  return el;
}

// Monoton kubik egri chiziq: nuqtalar orasida silliq, lekin noldan pastga tushmaydi.
function smoothPath(points) {
  if (!points.length) return '';
  if (points.length === 1) return `M${points[0][0]},${points[0][1]}`;
  const n = points.length;
  const dx = [];
  const slope = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(points[i + 1][0] - points[i][0]);
    slope.push((points[i + 1][1] - points[i][1]) / (dx[i] || 1));
  }
  const tangent = [slope[0]];
  for (let i = 1; i < n - 1; i++) tangent.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  tangent.push(slope[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) { tangent[i] = 0; tangent[i + 1] = 0; continue; }
    const a = tangent[i] / slope[i];
    const b = tangent[i + 1] / slope[i];
    const len = a * a + b * b;
    if (len > 9) {
      const t = 3 / Math.sqrt(len);
      tangent[i] = t * a * slope[i];
      tangent[i + 1] = t * b * slope[i];
    }
  }
  let d = `M${points[0][0].toFixed(2)},${points[0][1].toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const c = dx[i] / 3;
    d += ` C${(x0 + c).toFixed(2)},${(y0 + tangent[i] * c).toFixed(2)} ${(x1 - c).toFixed(2)},${(y1 - tangent[i + 1] * c).toFixed(2)} ${x1.toFixed(2)},${y1.toFixed(2)}`;
  }
  return d;
}
function niceMax(value) {
  if (value <= 4) return 4;
  const power = Math.pow(10, Math.floor(Math.log10(value)));
  for (const step of [1, 2, 2.5, 5, 10]) if (value <= step * power) return step * power;
  return 10 * power;
}
const MONTHS = ['yan', 'fev', 'mar', 'apr', 'may', 'iyun', 'iyul', 'avg', 'sen', 'okt', 'noy', 'dek'];
export function dayLabel(iso, long = false) {
  const [y, m, d] = iso.split('-').map(Number);
  return long ? `${d}-${MONTHS[m - 1]} ${y}` : `${d} ${MONTHS[m - 1]}`;
}

// Katta diagramma. rows: [{ date, count }], compare: oldingi davrning shuncha kuni (ixtiyoriy).
export function areaChart(rows, { compare = null, height = 228, unit = 'test', emptyText = "Bu davrda ma'lumot yo'q." } = {}) {
  const box = h('div', { class: 'area-chart' });
  if (!rows.length || (rows.every(r => !r.count) && !(compare || []).some(r => r.count))) {
    box.append(h('div', { class: 'area-empty' }, emptyText));
  }
  const W = 1000;
  const H = height;
  const pad = { top: 14, bottom: 6 };
  const values = rows.map(r => r.count);
  const prev = compare ? compare.map(r => r.count) : [];
  const top = niceMax(Math.max(1, ...values, ...prev));
  const x = i => (rows.length === 1 ? W / 2 : (i / (rows.length - 1)) * W);
  const y = v => pad.top + (1 - v / top) * (H - pad.top - pad.bottom);
  const id = `ac${++gradientId}`;
  const linePts = values.map((v, i) => [x(i), y(v)]);
  const line = smoothPath(linePts);
  const area = `${line} L${W},${H} L0,${H} Z`;
  const svg = s('svg', { class: 'area-svg', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' },
    s('defs', {}, s('linearGradient', { id, x1: '0', y1: '0', x2: '0', y2: '1' },
      s('stop', { offset: '0%', class: 'area-stop-top' }),
      s('stop', { offset: '100%', class: 'area-stop-bottom' }))),
    ...[0, .5, 1].map(f => s('line', { class: 'area-grid', x1: 0, x2: W, y1: y(top * f), y2: y(top * f), 'vector-effect': 'non-scaling-stroke' })),
    compare && prev.length ? s('path', { class: 'area-prev', d: smoothPath(prev.map((v, i) => [x(Math.min(i, rows.length - 1)), y(v)])), 'vector-effect': 'non-scaling-stroke' }) : null,
    s('path', { class: 'area-fill', d: area, fill: `url(#${id})` }),
    s('path', { class: 'area-line', d: line, 'vector-effect': 'non-scaling-stroke' }));
  const yLabels = h('div', { class: 'area-y', 'aria-hidden': 'true' }, [top, top / 2, 0].map(v => h('span', { vars: { top: `${(y(v) / H) * 100}%` } }, fmtNum(Math.round(v)))));
  const tickCount = Math.min(rows.length, 6);
  const ticks = [...new Set(Array.from({ length: tickCount }, (_, i) => Math.round(i * (rows.length - 1) / Math.max(tickCount - 1, 1))))];
  const xLabels = h('div', { class: 'area-x', 'aria-hidden': 'true' }, ticks.map(i => h('span', { vars: { left: `${(x(i) / W) * 100}%` } }, dayLabel(rows[i].date))));
  const cross = h('div', { class: 'area-cross', hidden: true });
  const dot = h('div', { class: 'area-dot', hidden: true });
  const tip = h('div', { class: 'area-tip', hidden: true });
  const plot = h('div', { class: 'area-plot', vars: { height: `${H}px` } }, svg, yLabels, cross, dot, tip);
  const show = clientX => {
    const rect = plot.getBoundingClientRect();
    if (!rect.width || !rows.length) return;
    const i = Math.max(0, Math.min(rows.length - 1, Math.round(((clientX - rect.left) / rect.width) * (rows.length - 1))));
    const px = (x(i) / W) * rect.width;
    const py = (y(values[i]) / H) * rect.height;
    cross.hidden = false; dot.hidden = false; tip.hidden = false;
    cross.style.setProperty('left', `${px}px`);
    dot.style.setProperty('left', `${px}px`);
    dot.style.setProperty('top', `${py}px`);
    tip.textContent = '';
    tip.append(h('span', { class: 'area-tip-accent' }), h('span', { class: 'area-tip-body' },
      h('b', null, `${fmtNum(values[i])} ${unit}`),
      compare && prev[i] !== undefined ? h('small', { class: 'area-tip-prev' }, `oldin: ${fmtNum(prev[i])}`) : null,
      h('small', null, dayLabel(rows[i].date, true))));
    tip.style.setProperty('left', `${Math.min(Math.max(px, 70), rect.width - 70)}px`);
    tip.style.setProperty('top', `${Math.max(py - 12, 8)}px`);
  };
  const hide = () => { cross.hidden = true; dot.hidden = true; tip.hidden = true; };
  plot.addEventListener('pointermove', e => show(e.clientX));
  plot.addEventListener('pointerdown', e => show(e.clientX));
  plot.addEventListener('pointerleave', hide);
  const table = h('table', { class: 'sr-only' }, h('caption', null, 'Kunlik qiymatlar'),
    h('tbody', null, rows.map(r => h('tr', null, h('td', null, r.date), h('td', null, r.count)))));
  box.append(plot, xLabels, table);
  return box;
}

// Kichik trend chizig'i (statistika kartalari uchun).
export function sparkline(values, { cls = '' } = {}) {
  const W = 128;
  const H = 56;
  const top = Math.max(1, ...values);
  const pts = values.map((v, i) => [values.length === 1 ? W / 2 : (i / (values.length - 1)) * W, 6 + (1 - v / top) * (H - 10)]);
  const line = smoothPath(pts);
  const id = `sp${++gradientId}`;
  return s('svg', { class: `spark${cls ? ` ${cls}` : ''}`, viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' },
    s('defs', {}, s('linearGradient', { id, x1: '0', y1: '0', x2: '0', y2: '1' }, s('stop', { offset: '0%', class: 'spark-stop-top' }), s('stop', { offset: '100%', class: 'spark-stop-bottom' }))),
    s('path', { class: 'spark-fill', d: `${line} L${W},${H} L0,${H} Z`, fill: `url(#${id})` }),
    s('path', { class: 'spark-line', d: line, 'vector-effect': 'non-scaling-stroke' }));
}

// Ulush ko'rsatkichi: 0..1 oralig'idagi qiymat, 12 ta bo'lakda.
export function meter(ratio, label) {
  const filled = Math.round(Math.max(0, Math.min(1, ratio || 0)) * 12);
  return h('div', { class: 'meter', role: 'img', 'aria-label': label }, Array.from({ length: 12 }, (_, i) => h('i', { class: i < filled ? 'on' : null, vars: { '--i': String(i) } })));
}

// Daraja taqsimoti: ustunlar, rangi daraja rangida.
export function tierColumns(rows, tierClass) {
  const max = Math.max(1, ...rows.map(r => r.count));
  return h('div', { class: 'tier-cols' }, rows.map((r, i) => h('div', { class: `tier-col ${tierClass(r.tier)}`, title: `${r.tier}: ${r.count}` },
    h('span', { class: 'tier-col-value' }, fmtNum(r.count)),
    h('span', { class: 'tier-col-track' }, h('i', { class: r.count ? null : 'zero', vars: { height: `${(r.count / max) * 100}%`, '--d': `${i * 40}ms` } })),
    h('span', { class: 'tier-col-label' }, r.tier))));
}

// Davrdagi jami va oldingi davrga nisbatan o'zgarish (foizda).
export function periodSummary(series, days) {
  const current = series.slice(-days);
  const previous = series.slice(-days * 2, -days);
  const total = current.reduce((n, r) => n + r.count, 0);
  const before = previous.reduce((n, r) => n + r.count, 0);
  const delta = previous.length === days && before > 0 ? Math.round(((total - before) / before) * 100) : (total > 0 && previous.length === days ? 100 : null);
  return { current, previous: previous.length === days ? previous : null, total, before, delta };
}
