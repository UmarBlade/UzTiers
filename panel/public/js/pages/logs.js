// Audit jurnali: turlari, kit, kim bajargan, kimga, matn va sana bo'yicha.
import { S, h, replaceKids, api, debounce, fmtNum } from '../core.js';
import { empty, searchBar, select, pager, eventRow, segmented } from '../ui.js';

const GROUPS = {
  tests: ['Natijalar', 'sword'],
  tiers: ['Darajalar', 'swap'],
  punish: ['Jazolar', 'ban'],
  cooldowns: ['Cooldownlar', 'clock'],
  staff: ['Xodimlar', 'badge'],
  players: ["O'yinchilar", 'players'],
  queue: ['Navbat', 'list'],
  settings: ['Sozlamalar', 'settings'],
  logins: ['Kirishlar', 'key']
};

export async function pageLogs(ctx) {
  const get = name => ctx.query.get(name) || '';
  const filters = { group: get('group'), kit: get('kit'), actor: get('actor'), target: get('target'), q: get('q'), source: get('source'), from: get('from'), to: get('to') };
  let page = Number(get('page')) || 1;
  let token = 0;
  document.title = 'Audit · UzTiers Panel';
  const listBox = h('div');
  const subline = h('div', { class: 'sub' });

  async function load({ scroll = false } = {}) {
    const run = ++token;
    const params = new URLSearchParams({ page });
    for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
    const d = await api(`/api/logs?${params}`);
    if (run !== token || !d) return;
    page = d.page;
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
    if (page > 1) p.set('page', page);
    history.replaceState(null, '', `#/logs${p.toString() ? `?${p}` : ''}`);
    subline.textContent = `${fmtNum(d.total)} ta yozuv · natijalar, xodimlar, jazolar, sozlamalar va kirishlar`;
    replaceKids(listBox, d.items.length
      ? [h('div', { class: 'events' }, d.items.map(e => eventRow(e, { full: true, q: filters.q }))),
         pager(d.page, d.pages, next => { page = next; load({ scroll: true }); })]
      : empty("Bu filtrlar bo'yicha yozuv topilmadi", 'logs', "Filtrlarni o'zgartirib ko'ring yoki qidiruvni tozalang."));
    if (scroll) window.scrollTo(0, 0);
  }
  const set = (name, value) => { filters[name] = value; page = 1; load(); };
  const groupChips = segmented([
    ['', 'Hammasi', 'folder'],
    ...S.me.options.logGroups.filter(g => GROUPS[g]).map(g => [g, GROUPS[g][0], GROUPS[g][1]])
  ], filters.group, value => set('group', value), { label: 'Yozuv turi' });
  const textInput = (id, label, name, placeholder) => [
    h('label', { class: 'sr-only', for: id }, label),
    h('input', { id, class: 'field', type: 'search', value: filters[name], placeholder, onchange: e => set(name, e.target.value.trim()) })
  ];
  await load();
  return [
    h('div', { class: 'page-head' },
      h('div', { class: 'grow' }, h('h1', null, 'Audit jurnali'), subline)),
    h('div', { class: 'audit-tabs' }, groupChips),
    h('div', { class: 'controls audit-filters' },
      S.me.kits.length > 1 ? select('log-kit', 'Kit', [['', 'Barcha kitlar'], ...S.me.kits.map(k => [k.kit, k.name])], filters.kit, e => set('kit', e.target.value)) : null,
      select('log-source', 'Manba', [['', 'Barcha manbalar'], ['bot', 'Bot'], ['panel', 'Panel'], ['discord', 'Discord tarixi']], filters.source, e => set('source', e.target.value)),
      textInput('log-actor', 'Kim bajargan', 'actor', 'Kim bajargan: nik yoki ID'),
      textInput('log-target', 'Kimga', 'target', 'Kimga: nik yoki ID'),
      h('label', { class: 'sr-only', for: 'log-from' }, 'Boshlanish sanasi'),
      h('input', { id: 'log-from', class: 'field', type: 'date', value: filters.from, onchange: e => set('from', e.target.value) }),
      h('label', { class: 'sr-only', for: 'log-to' }, 'Tugash sanasi'),
      h('input', { id: 'log-to', class: 'field', type: 'date', value: filters.to, onchange: e => set('to', e.target.value) }),
      searchBar({ id: 'logs-search', placeholder: "Nik, ID yoki sabab…", value: filters.q, cls: 'grow', oninput: debounce(value => set('q', value), 280) })),
    h('section', { class: 'card' }, listBox)
  ];
}
