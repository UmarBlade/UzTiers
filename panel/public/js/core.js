// Umumiy yordamchilar: DOM, server bilan aloqa, sanalar, ruxsatlar.
// Barcha matnlar textContent orqali qo'yiladi, HTML sifatida o'qilmaydi.
export const S = { me: null, roles: null, refreshPage: () => {}, showLogin: () => {} };

export const DAY_MS = 24 * 60 * 60 * 1000;
export const ROLE_ORDER = ['Tasdiqlangan Tester', 'Tester Tasdiqluvchi', 'Senior Tester', 'Moderator', 'Administrator', 'Manager', 'Network Admin', 'OWNER'];
export const TIERS = ['HT1', 'LT1', 'HT2', 'LT2', 'HT3', 'LT3', 'HT4', 'LT4', 'HT5', 'LT5'];
export const TIER_STEPS = [...TIERS].reverse();
export const TIER_VALUES = { LT5: 1, HT5: 2, LT4: 3, HT4: 4, LT3: 6, HT3: 10, LT2: 20, HT2: 30, LT1: 45, HT1: 60 };
export const KIT_NAMES = { axe: 'Axe', mace: 'Mace', nethpot: 'NethPot', potion: 'Potion', smp: 'SMP', sword: 'Sword', uhc: 'UHC', vanilla: 'Vanilla' };
export const KIT_ICON = kit => `/img/kits/${kit}.png`;

const SVG_NS = 'http://www.w3.org/2000/svg';

export function addKids(el, kids) {
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid.nodeType ? kid : String(kid));
  }
}
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'vars') for (const [name, v] of Object.entries(value)) el.style.setProperty(name, v);
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'value') el.value = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  addKids(el, kids);
  return el;
}
export function replaceKids(el, ...kids) {
  el.textContent = '';
  addKids(el, kids);
}
export function svgPath(d, cls = 'ico') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}

// Yozilgan harflarga mos qismini sariq bilan belgilaydi.
export function highlight(text, query) {
  const value = String(text ?? '');
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [value];
  const lower = value.toLowerCase();
  const out = [];
  let from = 0;
  for (;;) {
    const at = lower.indexOf(q, from);
    if (at < 0) break;
    if (at > from) out.push(value.slice(from, at));
    out.push(h('mark', { class: 'hl' }, value.slice(at, at + q.length)));
    from = at + q.length;
  }
  if (from < value.length) out.push(value.slice(from));
  return out;
}

export function debounce(fn, ms) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ---------- server bilan aloqa ----------
export class AuthError extends Error {
  constructor(code) { super(code); this.code = code; }
}
export async function api(path) {
  const res = await fetch(path, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
  if (res.status === 401) throw new AuthError('expired');
  if (res.status === 403) throw new AuthError('no_access');
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Server xatosi (${res.status})`);
  return res.json();
}
export async function send(method, path, body) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body || {})
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new AuthError('expired');
  if (!res.ok) throw new Error(data.message || "Amal bajarilmadi. Qaytadan urinib ko'ring.");
  return data;
}
export const runAction = (name, body) => send('POST', `/api/actions/${name}`, body);
export const can = (name, kit) => Boolean(S.me?.permissions?.[name]?.includes(kit));
export const allowedKits = name => S.me.kits.filter(k => can(name, k.kit));
export const rankOfRole = role => ROLE_ORDER.indexOf(role);

// ---------- sana va son ----------
const dateParts = ts => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ts));
  return Object.fromEntries(parts.map(p => [p.type, p.value]));
};
export function fmtDate(ts) {
  if (!ts) return '—';
  const p = dateParts(ts);
  return `${p.day}.${p.month}.${p.year}`;
}
export function fmtDateTime(ts) {
  if (!ts) return '—';
  const p = dateParts(ts);
  return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`;
}
export function fmtTime(ts) {
  const p = dateParts(ts);
  return `${p.hour}:${p.minute}`;
}
export function fmtDuration(ms) {
  if (ms < 60000) return 'bir daqiqadan kam';
  const days = Math.floor(ms / DAY_MS);
  const hours = Math.floor(ms % DAY_MS / 3600000);
  const minutes = Math.floor(ms % 3600000 / 60000);
  if (days) return hours ? `${days} kun ${hours} soat` : `${days} kun`;
  if (hours) return minutes ? `${hours} soat ${minutes} daqiqa` : `${hours} soat`;
  return `${minutes} daqiqa`;
}
export function fmtAgo(ts) {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  if (diff < 60000) return 'hozirgina';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} daqiqa oldin`;
  if (diff < DAY_MS) return `${Math.floor(diff / 3600000)} soat oldin`;
  if (diff < 7 * DAY_MS) return `${Math.floor(diff / DAY_MS)} kun oldin`;
  return fmtDate(ts);
}
export const fmtNum = n => Number(n || 0).toLocaleString('en-US').replace(/,/g, ' ');
export function greeting() {
  const hour = Number(dateParts(Date.now()).hour);
  if (hour < 5) return 'Xayrli tun';
  if (hour < 12) return 'Xayrli tong';
  if (hour < 18) return 'Xayrli kun';
  return 'Xayrli kech';
}
// Toshkent vaqtida hafta kuni (0 dushanba ... 6 yakshanba) va daqiqa.
export function tashkentNow() {
  const now = new Date(Date.now() + 5 * 3600000);
  return { day: (now.getUTCDay() + 6) % 7, minutes: now.getUTCHours() * 60 + now.getUTCMinutes() };
}
export function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
export function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* saqlanmasa ham ishlayveradi */ }
}
