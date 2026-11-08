// Qo'ng'iroq: yangi chiptalar, shaxsiy xabarlar, cheklovlar va rol o'zgarishlari.
import { h, replaceKids, api, send, fmtAgo, KIT_NAMES } from './core.js';
import { sfx } from './look.js';
import { icon, avatar, tierChip, kitIcon, typeIcon, empty } from './ui.js';

let button = null;
let badge = null;
let panel = null;
let lastCount = null;

function describe(n) {
  const target = n.target?.name || "O'yinchi";
  switch (n.kind) {
    case 'ticket': return [h('b', null, n.nickname || "O'yinchi"), ' uchun oddiy test chiptasi ochildi'];
    case 'ticket_high': return [h('b', null, n.nickname || "O'yinchi"), ' yuqori test chiptasini ochdi', n.targetTier ? [': ', tierChip(n.targetTier)] : ''];
    case 'dm': return [h('b', null, n.actor?.name || 'Xodim'), ` sizga ${n.count > 1 ? `${n.count} ta ` : ''}xabar yozdi`];
    case 'restrict': return [h('b', null, target), ' cheklandi', n.newValue ? ` (${n.newValue})` : ''];
    case 'unrestrict': return [h('b', null, target), ' cheklovi olib tashlandi'];
    case 'staff_add': return [h('b', null, target), ` ga ${n.newValue} roli berildi`];
    case 'staff_remove': return [h('b', null, target), ` dan ${n.oldValue} roli olindi`];
    case 'application': return [`${n.kit ? `${KIT_NAMES[n.kit]}: ` : ''}tester arizasi ${n.newValue === 'ochiq' ? 'ochildi' : 'yopildi'}`];
    default: return [n.kind];
  }
}
function itemIcon(n) {
  if (n.kind === 'dm') return avatar(n.actor?.avatar, n.actor?.name, 36);
  if (n.kind === 'ticket' || n.kind === 'ticket_high') return h('span', { class: 'type-ico' }, icon(n.kind === 'ticket_high' ? 'trophy' : 'sword'));
  return typeIcon(n.kind);
}
function close() {
  if (!panel) return;
  panel.remove();
  panel = null;
  button?.setAttribute('aria-expanded', 'false');
}
async function open() {
  if (panel) { close(); return; }
  button.setAttribute('aria-expanded', 'true');
  panel = h('div', { class: 'bell-panel', role: 'dialog', 'aria-label': 'Bildirishnomalar' }, h('div', { class: 'bell-head' }, h('b', null, 'Bildirishnomalar')), h('div', { class: 'bell-list' }, h('div', { class: 'note bell-empty' }, 'Yuklanmoqda…')));
  button.parentElement.append(panel);
  const mine = panel;
  const data = await api('/api/notifications').catch(() => null);
  if (panel !== mine || !data) return;
  const list = panel.querySelector('.bell-list');
  replaceKids(list, data.items.length ? data.items.map(n => h('a', { class: `bell-item${n.at > data.readAt ? ' unread' : ''}`, href: n.href, onclick: close },
    itemIcon(n),
    h('span', { class: 'bell-text' },
      h('span', { class: 'bell-line' }, describe(n)),
      n.preview ? h('span', { class: 'bell-preview' }, n.preview) : null,
      n.note ? h('span', { class: 'bell-preview' }, n.note) : null,
      h('time', null, fmtAgo(n.at))),
    n.kit ? kitIcon(n.kit) : null)) : empty('Hozircha yangilik yo\'q.', 'bell'));
  send('POST', '/api/notifications/read', {}).then(() => updateBell(0, true)).catch(() => {});
}
export function buildBell() {
  badge = h('span', { class: 'count-dot bell-count', hidden: true });
  button = h('button', { class: 'top-btn', type: 'button', 'aria-label': 'Bildirishnomalar', title: 'Bildirishnomalar', 'aria-expanded': 'false', onclick: open }, icon('m-bell'), badge);
  document.addEventListener('pointerdown', e => {
    if (panel && !panel.contains(e.target) && !button.contains(e.target)) close();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  return h('div', { class: 'bell-wrap' }, button);
}
export function updateBell(count, silent = false) {
  if (!badge) return;
  badge.hidden = !count;
  badge.textContent = count > 99 ? '99+' : String(count);
  if (lastCount !== null && count > lastCount && !silent) {
    sfx('bell');
  }
  lastCount = count;
}
