// Tezkor qidiruv oynasi (Ctrl+K): yozilgan harflar sariq bilan belgilanadi.
import { S, h, replaceKids, api, debounce, highlight, storageGet, storageSet } from './core.js';
import { sfx } from './look.js';
import { icon, avatar, rolePill, skinImg } from './ui.js';

let dialog = null;

// So'nggi qidirilgan o'yinchilar: faqat shu brauzerda, har bir xodim uchun alohida.
const RECENT_SLOTS = 5;
const recentKey = () => `uzp_recent_${S.me.id}`;
function readRecent() {
  try {
    const list = JSON.parse(storageGet(recentKey()) || '[]');
    return Array.isArray(list) ? list.filter(p => /^\d{15,25}$/.test(String(p?.id))).slice(0, RECENT_SLOTS) : [];
  } catch {
    return [];
  }
}
function rememberPlayer(p) {
  const entry = { id: p.id, nickname: p.nickname, skinName: p.skinName || null, skinUuid: p.skinUuid || null };
  storageSet(recentKey(), JSON.stringify([entry, ...readRecent().filter(x => x.id !== p.id)].slice(0, RECENT_SLOTS)));
}

const PAGES = () => [
  ['#/', 'home', 'Bosh sahifa'],
  ['#/players', 'players', "O'yinchilar"],
  ['#/staff', 'staff', 'Xodimlar'],
  ['#/restricted', 'ban', 'Cheklanganlar'],
  ['#/tickets', 'folder', 'Chiptalar Tarixi'],
  ['#/logs', 'logs', 'Audit'],
  ['#/manage', 'settings', 'Boshqaruv'],
  ['#/chat', 'chat', 'Chat'],
  ['#/settings', 'palette', "Ko'rinish"]
];

export function openPalette() {
  if (dialog) return;
  let items = [];
  let active = 0;
  let token = 0;
  let query = '';
  let knownPlayers = new Map();
  const results = h('div', { class: 'palette-results', role: 'listbox' });
  const close = () => {
    if (!dialog) return;
        const el = dialog;
    dialog = null;
    el.close();
    el.remove();
  };
  const paint = () => {
    results.querySelectorAll('.palette-row').forEach((el, i) => {
      el.classList.toggle('active', i === active);
      if (i === active) el.scrollIntoView({ block: 'nearest' });
    });
  };
  const go = href => {
    if (knownPlayers.has(href)) rememberPlayer(knownPlayers.get(href));
    close();
    location.hash = href.replace(/^#/, '');
  };
  const row = (href, content, side) => {
    const index = items.length;
    items.push(href);
    return h('a', { class: 'palette-row', href, role: 'option', onclick: e => { e.preventDefault(); go(href); }, onmouseenter: () => { if (active !== index) { active = index; paint(); } } }, content, side);
  };
  function renderPages() {
    items = [];
    active = 0;
    const recent = readRecent();
    knownPlayers = new Map(recent.map(p => [`#/players/${p.id}`, p]));
    replaceKids(results,
      recent.length ? [
        h('div', { class: 'palette-section with-action' }, h('span', null, "So'nggi qidiruvlar"), h('button', { class: 'palette-clear', type: 'button', onclick: () => { storageSet(recentKey(), '[]'); renderPages(); input.focus(); } }, 'Tozalash')),
        h('div', { class: 'palette-recent' },
          recent.map(p => row(`#/players/${p.id}`, [h('span', { class: 'palette-skin' }, skinImg(p, 'bust', 64)), h('span', { class: 'recent-name' }, p.nickname)])),
          Array.from({ length: RECENT_SLOTS - recent.length }, () => h('span', { class: 'recent-empty', 'aria-hidden': 'true' })))
      ] : null,
      h('div', { class: 'palette-section' }, 'Sahifalar'),
      PAGES().map(([href, name, text]) => row(href, [h('span', { class: 'palette-ico' }, icon(name)), h('span', { class: 'palette-name' }, text)])),
      S.me.kits.length ? [h('div', { class: 'palette-section' }, 'Kitlar'), S.me.kits.map(k => row(`#/kits/${k.kit}`, [h('img', { class: 'palette-kit', src: `/img/kits/${k.kit}.png`, alt: '', width: 24, height: 24 }), h('span', { class: 'palette-name' }, k.name)]))] : null);
    paint();
  }
  const search = debounce(async value => {
    query = value;
    if (!value) { token++; renderPages(); return; }
    const run = ++token;
    const data = await api(`/api/search?q=${encodeURIComponent(value)}`).catch(() => null);
    if (run !== token || !data) return;
    items = [];
    active = 0;
    knownPlayers = new Map(data.players.map(p => [`#/players/${p.id}`, p]));
    const players = data.players.map(p => row(`#/players/${p.id}`, [h('span', { class: 'palette-skin' }, skinImg(p, 'bust', 64)), h('span', { class: 'palette-name' }, highlight(p.nickname, query))], h('span', { class: 'palette-rank' }, `#${p.place}`)));
    const staff = data.staff.map(m => row(`#/staff/${m.id}`, [avatar(m.avatar, m.name, 34), h('span', { class: 'palette-name' }, highlight(m.name, query))], rolePill(m.role, m.roleColor, true)));
    const pages = PAGES().filter(([, , text]) => text.toLowerCase().includes(value.toLowerCase())).map(([href, name, text]) => row(href, [h('span', { class: 'palette-ico' }, icon(name)), h('span', { class: 'palette-name' }, highlight(text, query))]));
    replaceKids(results,
      players.length ? [h('div', { class: 'palette-section' }, `O'yinchilar · ${data.playersTotal}`), players] : null,
      staff.length ? [h('div', { class: 'palette-section' }, `Xodimlar · ${staff.length}`), staff] : null,
      pages.length ? [h('div', { class: 'palette-section' }, 'Sahifalar'), pages] : null,
      !players.length && !staff.length && !pages.length ? h('div', { class: 'palette-empty' }, icon('search'), h('span', null, 'Hech narsa topilmadi')) : null);
    paint();
  }, 130);
  const input = h('input', { class: 'palette-input', type: 'search', placeholder: "O'yinchi, xodim yoki sahifa…", 'aria-label': 'Qidirish', autocomplete: 'off', oninput: e => search(e.target.value.trim()), onkeydown: e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (items.length) { active = (active + 1) % items.length; paint(); } }
    if (e.key === 'ArrowUp') { e.preventDefault(); if (items.length) { active = (active - 1 + items.length) % items.length; paint(); } }
    if (e.key === 'Enter') { e.preventDefault(); if (items[active]) go(items[active]); }
  } });
  dialog = h('dialog', { class: 'palette', 'aria-label': 'Qidirish' },
    h('div', { class: 'palette-head' }, icon('search', 'ico palette-search'), input, h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Yopish', onclick: close }, icon('close'))),
    results,
    h('div', { class: 'palette-foot' }, h('span', null, h('kbd', null, '↵'), ' ochish'), h('span', null, h('kbd', null, '↑↓'), ' tanlash'), h('span', null, h('kbd', null, 'Esc'), ' yopish')));
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
  dialog.addEventListener('click', e => { if (e.target === dialog) close(); });
  document.body.append(dialog);
  dialog.showModal();
    renderPages();
  input.focus();
}
