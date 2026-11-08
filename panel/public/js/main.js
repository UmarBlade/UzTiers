// Panel qobig'i (mytiers uslubi): yon panel, yuqori panel, yo'l ko'rsatkich, marshrutlar va kirish oynasi.
import { S, h, replaceKids, api, AuthError, storageGet, storageSet, fmtDateTime, KIT_ICON, KIT_NAMES } from './core.js';
import { applyLook } from './look.js';
import { icon, avatar, setToastBox } from './ui.js';
import { openPalette } from './palette.js';
import { buildBell, updateBell } from './bell.js';
import { pageHome } from './pages/home.js';
import { pageKit, pageKitQueue } from './pages/kit.js';
import { pageKitSettings, pageKitCooldowns, pageKitServers, pageKitCategories } from './pages/kitconfig.js';
import { pageKitPanels, pageKitPanel, pageKitModals, pageKitModal } from './pages/editor.js';
import { pageManage } from './pages/manage.js';
import { pagePlayers, pagePlayer } from './pages/players.js';
import { pageStaff, pageStaffProfile } from './pages/staff.js';
import { pageRestricted } from './pages/restricted.js';
import { pageTickets, pageTicket } from './pages/tickets.js';
import { pageLogs } from './pages/logs.js';
import { pageChat } from './pages/chat.js';
import { pageSettings } from './pages/settings.js';

const root = document.getElementById('app');
let shellEl = null;
let contentEl = null;
let footEl = null;
let chatBadge = null;
let ticketBadge = null;
let onlineBox = null;
let crumbsBox = null;
let topTrack = null;
let topIndicator = null;
let tabsSignature = '';
let profilePill = null;
let profileMenu = null;
let navLinks = [];
const kitRows = new Map();
const openedKits = new Set();
let currentRun = 0;
let timers = [];

// Bo'limlar: [guruh, nom, manzil]. Yo'l ko'rsatkich va yuqori yorliqlar shundan olinadi.
const SECTIONS = {
  home: ['Umumiy', 'Bosh sahifa', '#/'],
  players: ['Umumiy', "O'yinchilar", '#/players'],
  staff: ['Umumiy', 'Xodimlar', '#/staff'],
  chat: ['Umumiy', 'Chat', '#/chat'],
  logs: ['Umumiy', 'Audit', '#/logs'],
  restricted: ['Nazorat', 'Cheklanganlar', '#/restricted'],
  tickets: ['Nazorat', 'Chiptalar Tarixi', '#/tickets'],
  settings: ['Boshqa', "Ko'rinish", '#/settings'],
  manage: ['Boshqa', 'Boshqaruv', '#/manage'],
  kit: ['Kitlar', '', '']
};
const MAIN_TABS = [
  ['home', '#/', 'm-home', 'Bosh sahifa'],
  ['players', '#/players', 'm-people', "O'yinchilar"],
  ['staff', '#/staff', 'm-groups', 'Xodimlar'],
  ['chat', '#/chat', 'm-chat', 'Chat'],
  ['logs', '#/logs', 'm-audit', 'Audit'],
  ['manage', '#/manage', 'm-settings', 'Boshqaruv']
];
// Har bir kitning ichki bo'limlari: yon paneldagi daraxt va kit sahifasidagi yuqori yorliqlar.
const KIT_PAGE_LIST = [
  ['overview', '', 'm-dashboard', "Ko'rinish"],
  ['queue', '/queue', 'm-list', 'Navbat'],
  ['tickets', null, 'm-ticket', 'Chiptalar'],
  ['panels', '/panels', 'm-panels', 'Panellar'],
  ['modals', '/modals', 'm-modal', 'Oynalar'],
  ['categories', '/categories', 'm-folder', 'Kategoriyalar'],
  ['cooldowns', '/cooldowns', 'm-timer', 'Cooldownlar'],
  ['servers', '/servers', 'm-dns', 'Serverlar'],
  ['settings', '/settings', 'm-settings', 'Sozlamalar']
];
const kitHref = (kit, key, path) => (key === 'tickets' ? `#/tickets?kit=${kit}` : key === 'players' ? `#/players?kit=${kit}` : key === 'logs' ? `#/logs?kit=${kit}` : `#/kits/${kit}${path || ''}`);
const kitPages = kit => KIT_PAGE_LIST.map(([key, path, ico, text]) => [key, kitHref(kit, key, path), ico, text]);
// Kit sahifasidagi yuqori yorliqlar: ba'zilari "Ko'proq" menyusida.
const KIT_TABS = ['overview', 'more', 'panels', 'tickets', 'queue', 'settings'];
const KIT_MORE = [['cooldowns', 'm-timer', 'Cooldownlar'], ['servers', 'm-dns', 'Serverlar'], ['categories', 'm-folder', 'Kategoriyalar'], ['modals', 'm-modal', 'Oynalar'], ['players', 'm-people', "O'yinchilar"], ['logs', 'm-audit', 'Audit']];
const KIT_SUB_LABELS = Object.fromEntries([...KIT_PAGE_LIST.map(([k, , , t]) => [k, t]), ['players', "O'yinchilar"], ['logs', 'Audit']]);
const KIT_SUB_SECTIONS = new Set(['players', 'tickets', 'logs']);
const kitName = kit => S.me?.kits.find(k => k.kit === kit)?.name || KIT_NAMES[kit] || kit;

function notFound(text) {
  document.title = 'Topilmadi · UzTiers Panel';
  return [h('div', { class: 'page-head' }, h('div', { class: 'grow' }, h('h1', null, 'Topilmadi'), h('div', { class: 'sub' }, text))), h('a', { class: 'back', href: '#/' }, '← Bosh sahifa')];
}

const ROUTES = [
  [/^\/$/, pageHome, 'home'],
  [/^\/players$/, pagePlayers, 'players'],
  [/^\/players\/(\d+)$/, pagePlayer, 'players'],
  [/^\/staff$/, pageStaff, 'staff'],
  [/^\/staff\/(\d+)$/, pageStaffProfile, 'staff'],
  [/^\/restricted$/, pageRestricted, 'restricted'],
  [/^\/tickets$/, pageTickets, 'tickets'],
  [/^\/tickets\/(\d+)$/, pageTicket, 'tickets'],
  [/^\/kits\/([a-z]+)$/, pageKit, 'kit'],
  [/^\/kits\/([a-z]+)\/queue$/, pageKitQueue, 'kit'],
  [/^\/kits\/([a-z]+)\/panels$/, pageKitPanels, 'kit'],
  [/^\/kits\/([a-z]+)\/panels\/([a-zA-Z0-9]+)$/, pageKitPanel, 'kit'],
  [/^\/kits\/([a-z]+)\/modals$/, pageKitModals, 'kit'],
  [/^\/kits\/([a-z]+)\/modals\/([a-zA-Z]+)$/, pageKitModal, 'kit'],
  [/^\/kits\/([a-z]+)\/categories$/, pageKitCategories, 'kit'],
  [/^\/kits\/([a-z]+)\/cooldowns$/, pageKitCooldowns, 'kit'],
  [/^\/kits\/([a-z]+)\/servers$/, pageKitServers, 'kit'],
  [/^\/kits\/([a-z]+)\/settings$/, pageKitSettings, 'kit'],
  [/^\/logs$/, pageLogs, 'logs'],
  [/^\/chat$/, pageChat, 'chat'],
  [/^\/chat\/dm\/(\d+)$/, pageChat, 'chat'],
  [/^\/settings$/, pageSettings, 'settings'],
  [/^\/manage$/, pageManage, 'manage']
];

// ---------- belgilash: qaysi bo'lim ochiq ----------
// kitSub: kit ichidagi bo'lim (overview, queue, panels ...) yoki ?kit= bilan ochilgan players, tickets, logs.
function markNav({ section, kitCtx, kitSub }) {
  // Boshqa kitga o'tilganda oldingisi yig'iladi; qo'lda ochilganlar keyingi o'tishgacha turadi.
  if (kitSub) { openedKits.clear(); openedKits.add(kitCtx); }
  for (const link of navLinks) {
    const active = !kitSub && link.dataset.nav === section;
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  }
  for (const [kit, row] of kitRows) {
    const here = kit === kitCtx && Boolean(kitSub);
    if (here) openedKits.add(kit);
    row.row.classList.toggle('open', openedKits.has(kit));
    row.link.classList.toggle('is-current', here);
    for (const sub of row.subs) {
      if (here && sub.dataset.key === kitSub) sub.setAttribute('aria-current', 'page'); else sub.removeAttribute('aria-current');
    }
  }
  // Ochiq bo'lim yon panelda ko'rinmay qolsa, unga yumshoq aylantiriladi.
  const activeEl = shellEl.querySelector('.sidebar [aria-current="page"]');
  if (activeEl) activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function renderCrumbs({ section, kitCtx, kitSub, isDetail, missing }) {
  const home = h('a', { class: 'crumb-home', href: '#/', 'aria-label': 'Bosh sahifa' }, icon('m-home'));
  const sep = () => h('span', { class: 'crumb-sep', 'aria-hidden': 'true' }, '/');
  if (missing) { replaceKids(crumbsBox, home, h('span', { class: 'crumb-current' }, 'Topilmadi')); return; }
  const info = SECTIONS[section];
  const title = document.title.split(' · ')[0];
  let parent;
  let current;
  if (kitSub === 'overview') {
    parent = h('span', { class: 'crumb-parent' }, 'Kitlar');
    current = kitName(kitCtx);
  } else if (kitSub) {
    parent = h('a', { class: 'crumb-parent', href: `#/kits/${kitCtx}` }, kitName(kitCtx));
    current = KIT_SUB_LABELS[kitSub] || info[1];
  } else if (isDetail) {
    parent = h('a', { class: 'crumb-parent', href: info[2] }, info[1]);
    current = title;
  } else {
    parent = h('span', { class: 'crumb-parent' }, info[0]);
    current = info[1];
  }
  replaceKids(crumbsBox, home, parent, sep(), h('span', { class: 'crumb-current', 'aria-current': 'page' }, current));
}

// Yuqori yorliqlar: kit ichida kit bo'limlari ("Ko'proq" menyusi bilan), boshqa joyda asosiy bo'limlar.
let moreMenu = null;
function closeMoreMenu() {
  moreMenu?.remove();
  moreMenu = null;
}
function moreButton(kit) {
  const wrap = h('div', { class: 'top-more-wrap' });
  const btn = h('button', {
    class: 'top-tab top-more',
    type: 'button',
    'data-key': 'more',
    'aria-haspopup': 'menu',
    onmouseenter: e => moveIndicator(e.currentTarget),
    onfocus: e => moveIndicator(e.currentTarget),
    onclick: () => {
      if (moreMenu) { closeMoreMenu(); return; }
      moreMenu = h('div', { class: 'top-menu', role: 'menu' }, KIT_MORE.map(([key, ico, text]) => h('a', { class: 'menu-item', role: 'menuitem', href: kitHref(kit, key, `/${key}`), onclick: closeMoreMenu }, icon(ico), text)));
      wrap.append(moreMenu);
    }
  }, icon('m-folder'), h('span', null, "Ko'proq"), icon('m-expand', 'ico top-more-caret'));
  wrap.append(btn);
  return wrap;
}
function renderTabs({ section, kitCtx, kitSub }) {
  const inKit = Boolean(kitSub);
  const signature = inKit ? `kit:${kitCtx}` : 'main';
  closeMoreMenu();
  if (signature !== tabsSignature) {
    tabsSignature = signature;
    const tabLink = ([key, href, ico, text]) => h('a', { class: 'top-tab', href, 'data-key': key, onmouseenter: e => moveIndicator(e.currentTarget), onfocus: e => moveIndicator(e.currentTarget) }, icon(ico), h('span', null, text));
    const pages = kitPages(kitCtx);
    const tabs = inKit ? KIT_TABS.map(key => (key === 'more' ? moreButton(kitCtx) : tabLink(pages.find(p => p[0] === key)))) : MAIN_TABS.map(tabLink);
    replaceKids(topTrack, topIndicator, tabs);
  }
  const active = inKit ? (KIT_MORE.some(m => m[0] === kitSub) ? 'more' : kitSub) : section;
  for (const tab of topTrack.querySelectorAll('.top-tab')) {
    if (tab.dataset.key === active) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current');
  }
}
function moveIndicator(tab) {
  const box = tab.getBoundingClientRect();
  const track = topTrack.getBoundingClientRect();
  topIndicator.style.setProperty('left', `${box.left - track.left}px`);
  topIndicator.style.setProperty('width', `${box.width}px`);
  topIndicator.classList.add('on');
}

async function route() {
  const run = ++currentRun;
  timers.forEach(clearInterval);
  timers = [];
  const raw = location.hash.replace(/^#/, '') || '/';
  const [pathname, search] = raw.split('?');
  const query = new URLSearchParams(search || '');
  let matched = null;
  let params = [];
  for (const [re, fn, section] of ROUTES) {
    const m = re.exec(pathname);
    if (m) { matched = { fn, section }; params = m.slice(1); break; }
  }
  const section = matched?.section || '';
  const kitCtx = section === 'kit' ? params[0] : (query.get('kit') || '');
  const isDetail = section === 'kit' ? params.length > 1 : params.length > 0 && section !== 'chat';
  // ?kit= bilan ochilgan ro'yxatlar (o'yinchilar, chiptalar, audit) ham shu kit ichida hisoblanadi.
  const kitSub = section === 'kit' ? (pathname.split('/')[3] || 'overview') : (kitCtx && KIT_SUB_SECTIONS.has(section) && !isDetail ? section : '');
  const place = { section, params, kitCtx, kitSub, isDetail, missing: !matched };
  markNav(place);
  renderTabs(place);
  shellEl.classList.remove('menu-open');
  closeProfileMenu();
  document.querySelectorAll('.lightbox').forEach(el => el.remove());
  if (!matched) {
    replaceKids(contentEl, notFound("Bunday sahifa yo'q."));
    renderCrumbs(place);
    return;
  }
  const isSamePage = contentEl.dataset.page === pathname;
  if (!isSamePage) {
    contentEl.classList.remove('entering');
    replaceKids(contentEl, h('div', { class: 'skeleton-page', 'aria-label': 'Yuklanmoqda' }, h('div', { class: 'skeleton title' }), h('div', { class: 'skeleton-row' }, [1, 2, 3, 4].map(() => h('div', { class: 'skeleton tile-box' }))), h('div', { class: 'skeleton block' })));
  }
  contentEl.dataset.page = pathname;
  const ctx = {
    params,
    query,
    notFound,
    onChatRead: () => pingLoop(),
    every(ms, fn) {
      const id = setInterval(() => {
        if (run !== currentRun || document.hidden) return;
        Promise.resolve().then(fn).catch(handleError);
      }, ms);
      timers.push(id);
    }
  };
  S.refreshPage = () => { if (run === currentRun) route(); };
  try {
    const nodes = await matched.fn(ctx);
    if (run !== currentRun) return;
    replaceKids(contentEl, nodes);
    renderCrumbs(place);
    // Yangi sahifa bo'laklari ketma-ket yumshoq ko'tarilib chiqadi (style.css: .entering).
    if (!isSamePage) {
      void contentEl.offsetWidth;
      contentEl.classList.add('entering');
      window.scrollTo(0, 0);
    }
  } catch (err) {
    if (run === currentRun) handleError(err);
  }
}

function handleError(err) {
  if (err instanceof AuthError) {
    showLogin(err.code === 'no_access' ? 'no_access' : null);
    return;
  }
  console.error(err);
  replaceKids(contentEl, h('div', { class: 'error-box' }, "Ma'lumotni yuklab bo'lmadi. Sahifani yangilab ko'ring."));
}

function showLogin(errorCode) {
  timers.forEach(clearInterval);
  timers = [];
  currentRun++;
  const messages = {
    no_access: "Bu akkauntda panelga kirish huquqi yo'q. Panel faqat Administrator va undan yuqori rollar uchun.",
    denied: 'Kirish bekor qilindi.',
    failed: "Kirishda xatolik bo'ldi. Qaytadan urinib ko'ring."
  };
  document.title = 'Kirish · UzTiers Panel';
  replaceKids(root, h('main', { class: 'login' }, h('div', { class: 'login-card' },
    h('div', { class: 'login-brand' }, h('img', { src: '/img/emblem.webp', alt: '', width: 28, height: 28, draggable: 'false' }), h('span', null, 'UzTiers')),
    h('h1', null, 'Xush kelibsiz'),
    h('p', null, 'Boshqaruv paneliga kiring'),
    messages[errorCode] ? h('div', { class: 'login-error', role: 'alert' }, messages[errorCode]) : null,
    h('a', { class: 'btn primary login-btn', href: '/auth/discord' }, icon('m-discord'), 'Discord orqali kirish'),
    h('p', { class: 'login-note' }, 'Panel faqat Administrator va undan yuqori rollar uchun.'))));
}
S.showLogin = showLogin;

function updateChatBadge(latest, dmUnread) {
  if (!chatBadge) return;
  const read = Number(storageGet('uzp_chat_read')) || 0;
  const inGeneral = location.hash === '#/chat';
  const unread = (latest > read && !inGeneral) || dmUnread > 0;
  chatBadge.hidden = !unread;
  chatBadge.textContent = dmUnread > 0 ? String(dmUnread) : '';
  chatBadge.classList.toggle('with-number', dmUnread > 0);
}
async function pingLoop() {
  try {
    const ping = await api('/api/ping');
    if (!ping) return;
    updateChatBadge(ping.latestChatId, ping.dmUnread);
    updateBell(ping.notifUnread);
    if (ticketBadge) {
      ticketBadge.hidden = !ping.liveTickets;
      ticketBadge.textContent = ping.liveTickets;
    }
    if (onlineBox) {
      replaceKids(onlineBox, icon('m-groups'), h('span', null, ping.online.length), h('span', { class: 'live-dot' }));
      onlineBox.title = `Panelda: ${ping.online.map(o => o.name).join(', ')}`;
      onlineBox.setAttribute('aria-label', `${ping.online.length} kishi panelda`);
    }
    for (const [kit, open] of Object.entries(ping.queues || {})) {
      const row = kitRows.get(kit);
      if (!row) continue;
      row.status.hidden = false;
      row.status.classList.toggle('on', open);
      row.status.title = open ? 'Navbat ochiq' : 'Navbat yopiq';
    }
  } catch (err) {
    if (err instanceof AuthError) showLogin(err.code === 'no_access' ? 'no_access' : null);
  }
}

async function logout() {
  await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => null);
  location.href = '/';
}

// ---------- profil menyusi ----------
function closeProfileMenu() {
  if (!profileMenu) return;
  profileMenu.remove();
  profileMenu = null;
  profilePill?.setAttribute('aria-expanded', 'false');
}
function toggleProfileMenu() {
  if (profileMenu) { closeProfileMenu(); return; }
  const me = S.me;
  profileMenu = h('div', { class: 'profile-menu', role: 'menu' },
    h('div', { class: 'menu-head' }, avatar(me.avatar, me.name, 32), h('span', { class: 'menu-head-text' }, h('span', { class: 'menu-name' }, me.name), h('span', { class: 'menu-sub' }, me.role || 'Xodim'))),
    h('div', { class: 'menu-sep' }),
    h('a', { class: 'menu-item', href: `#/staff/${me.id}`, role: 'menuitem', onclick: closeProfileMenu }, icon('m-person'), 'Profilim'),
    h('a', { class: 'menu-item', href: '#/settings', role: 'menuitem', onclick: closeProfileMenu }, icon('m-palette'), "Ko'rinish"),
    h('div', { class: 'menu-sep' }),
    h('button', { class: 'menu-item danger', type: 'button', role: 'menuitem', onclick: logout }, icon('m-logout'), 'Chiqish'));
  footEl.append(profileMenu);
  profilePill.setAttribute('aria-expanded', 'true');
}

// ---------- yon panel ----------
function readClosedGroups() {
  try { return new Set(JSON.parse(storageGet('uzp_nav_closed') || '[]')); } catch { return new Set(); }
}
function navGroup(id, title, children, closedGroups) {
  const group = h('div', { class: `nav-group${closedGroups.has(id) ? ' closed' : ''}` });
  const toggle = h('button', {
    class: 'nav-title',
    type: 'button',
    'aria-expanded': String(!closedGroups.has(id)),
    onclick: () => {
      const closed = group.classList.toggle('closed');
      toggle.setAttribute('aria-expanded', String(!closed));
      if (closed) closedGroups.add(id); else closedGroups.delete(id);
      storageSet('uzp_nav_closed', JSON.stringify([...closedGroups]));
    }
  }, h('span', null, title), icon('m-expand'));
  group.append(toggle, h('div', { class: 'nav-list', role: 'list' }, children));
  return group;
}
function navItem(nav, href, ico, text, extra) {
  const link = h('a', { class: 'nav-link', href, 'data-nav': nav, 'data-label': text }, icon(ico), h('span', { class: 'nav-text' }, text), extra);
  navLinks.push(link);
  return link;
}
function kitRow(k) {
  const status = h('span', { class: 'kit-status', hidden: true });
  const link = h('a', { class: 'nav-link kit-link', href: `#/kits/${k.kit}`, 'data-label': k.name },
    h('span', { class: 'kit-ava' }, h('img', { src: KIT_ICON(k.kit), alt: '', width: 28, height: 28, draggable: 'false' }), status),
    h('span', { class: 'nav-text' }, k.name));
  const subs = kitPages(k.kit).map(([key, href, ico, text]) => h('a', { class: 'kit-sub', href, 'data-key': key }, icon(ico), h('span', null, text)));
  const row = h('div', { class: 'kit-row' },
    link,
    h('button', {
      class: 'kit-chevron',
      type: 'button',
      'aria-label': `${k.name}: bo'limlar`,
      onclick: () => {
        const open = row.classList.toggle('open');
        if (open) openedKits.add(k.kit); else openedKits.delete(k.kit);
      }
    }, icon('m-expand')),
    h('div', { class: 'kit-children' }, subs));
  kitRows.set(k.kit, { row, link, status, subs });
  return row;
}
// Yig'ilgan panelda ikonkaning ustiga kelganda nomi chiqadi.
function syncCollapsedTitles() {
  const collapsed = shellEl.classList.contains('sb-collapsed');
  for (const el of shellEl.querySelectorAll('.sidebar .nav-link')) {
    if (collapsed) el.title = el.dataset.label; else el.removeAttribute('title');
  }
}
// Oldingi kirish vaqti: shu brauzerda, 30 daqiqadan uzoq tanaffusdan keyin yangilanadi.
function previousVisit(id) {
  const lastKey = `uzp_visit_${id}`;
  const prevKey = `uzp_visit_prev_${id}`;
  const last = Number(storageGet(lastKey)) || 0;
  if (Date.now() - last > 30 * 60000) {
    storageSet(prevKey, String(last));
    storageSet(lastKey, String(Date.now()));
    return last;
  }
  storageSet(lastKey, String(Date.now()));
  return Number(storageGet(prevKey)) || 0;
}

function buildShell() {
  const me = S.me;
  navLinks = [];
  kitRows.clear();
  const closedGroups = readClosedGroups();
  chatBadge = h('span', { class: 'nav-badge', hidden: true, title: 'Yangi xabarlar' });
  ticketBadge = h('span', { class: 'nav-count', hidden: true, title: 'Jonli chiptalar' });
  const groups = [
    navGroup('main', 'Umumiy', [
      navItem('home', '#/', 'm-home', 'Bosh sahifa'),
      navItem('players', '#/players', 'm-people', "O'yinchilar"),
      navItem('staff', '#/staff', 'm-groups', 'Xodimlar'),
      navItem('chat', '#/chat', 'm-chat', 'Chat', chatBadge),
      navItem('logs', '#/logs', 'm-audit', 'Audit')
    ], closedGroups),
    navGroup('control', 'Nazorat', [
      navItem('restricted', '#/restricted', 'm-block', 'Cheklanganlar'),
      navItem('tickets', '#/tickets', 'm-ticket', 'Chiptalar Tarixi', ticketBadge)
    ], closedGroups),
    navGroup('kits', me.kits.length === 1 ? 'Sizning kitingiz' : 'Kitlar', me.kits.map(kitRow), closedGroups)
  ];

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openPalette();
    }
    if (e.key === 'Escape') closeProfileMenu();
  });
  document.addEventListener('pointerdown', e => {
    if (profileMenu && !profileMenu.contains(e.target) && !profilePill.contains(e.target)) closeProfileMenu();
    if (moreMenu && !moreMenu.parentElement?.contains(e.target)) closeMoreMenu();
  });

  const visit = previousVisit(me.id);
  profilePill = h('button', { class: 'profile-pill', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', title: me.name, onclick: toggleProfileMenu },
    avatar(me.avatar, me.name, 28),
    h('span', { class: 'pp-text' }, h('span', { class: 'pp-name' }, me.name), h('span', { class: 'pp-sub' }, me.role || 'Xodim')),
    h('span', { class: 'pp-chevron' }, icon('m-expand')));
  footEl = h('div', { class: 'sb-foot' },
    navGroup('other', 'Boshqa', [navItem('manage', '#/manage', 'm-settings', 'Boshqaruv'), navItem('settings', '#/settings', 'm-palette', "Ko'rinish")], closedGroups),
    profilePill);

  onlineBox = h('span', { class: 'online-count', role: 'status' });
  const toastBox = h('div', { class: 'toasts', 'aria-live': 'polite' });
  setToastBox(toastBox);
  contentEl = h('main', { class: 'content', id: 'content' });
  crumbsBox = h('nav', { class: 'crumbs', 'aria-label': "Yo'l" });
  topIndicator = h('span', { class: 'top-indicator', 'aria-hidden': 'true' });
  topTrack = h('div', { class: 'top-track', onmouseleave: () => topIndicator.classList.remove('on') }, topIndicator);
  tabsSignature = '';

  shellEl = h('div', { class: `shell${storageGet('uzp_sb') === '1' ? ' sb-collapsed' : ''}` },
    h('aside', { class: 'sidebar', 'aria-label': 'Asosiy menyu' },
      h('div', { class: 'sb-head' },
        h('a', { class: 'brand', href: '#/', 'aria-label': 'UzTiers bosh sahifa' }, h('img', { class: 'brand-emblem', src: '/img/emblem.webp', alt: '', width: 24, height: 24, draggable: 'false' }), h('span', { class: 'brand-title' }, 'UzTiers')),
        h('button', {
          class: 'sb-toggle',
          type: 'button',
          'aria-label': "Yon panelni yig'ish",
          title: "Yon panelni yig'ish",
          onclick: () => {
            const collapsed = shellEl.classList.toggle('sb-collapsed');
            storageSet('uzp_sb', collapsed ? '1' : '0');
            syncCollapsedTitles();
            closeProfileMenu();
          }
        }, icon('m-chevron-left'))),
      h('div', { class: 'sb-welcome' },
        h('div', { class: 'sb-line' }),
        h('p', { class: 'sb-welcome-title' }, `Xush kelibsiz, ${me.name}`),
        h('p', { class: 'sb-welcome-meta' }, visit ? `Oxirgi kirish: ${fmtDateTime(visit)}` : 'Panelga birinchi kirishingiz'),
        h('div', { class: 'sb-line' })),
      h('nav', { class: 'nav-scroll', 'aria-label': "Bo'limlar" }, groups),
      footEl),
    h('div', { class: 'backdrop', onclick: () => shellEl.classList.remove('menu-open') }),
    h('div', { class: 'main' },
      h('header', { class: 'topbar' },
        h('div', { class: 'topbar-inner' },
          h('button', { class: 'menu-btn', type: 'button', 'aria-label': 'Menyuni ochish', onclick: () => shellEl.classList.toggle('menu-open') }, icon('m-menu')),
          crumbsBox,
          h('nav', { class: 'top-nav', 'aria-label': 'Tezkor bo\'limlar' }, topTrack),
          h('div', { class: 'top-end' },
            h('button', { class: 'top-search', type: 'button', onclick: openPalette, 'aria-label': "O'yinchi qidirish", title: 'Qidirish (Ctrl+K)' }, icon('m-search'), h('span', null, "O'yinchi qidirish"), h('kbd', null, 'Ctrl K')),
            onlineBox,
            buildBell()))),
      contentEl),
    toastBox);
  replaceKids(root, shellEl);
  syncCollapsedTitles();
}

async function boot() {
  applyLook();
  const urlError = new URLSearchParams(location.search).get('error');
  if (urlError) history.replaceState(null, '', location.pathname + location.hash);
  try {
    S.me = await api('/api/me');
  } catch (err) {
    if (err instanceof AuthError) { showLogin(urlError || (err.code === 'no_access' ? 'no_access' : null)); return; }
    replaceKids(root, h('main', { class: 'login' }, h('div', { class: 'login-card' }, h('h1', null, 'Panel javob bermadi'), h('p', null, 'Birozdan keyin sahifani yangilang.'))));
    return;
  }
  buildShell();
  window.addEventListener('hashchange', route);
  await route();
  pingLoop();
  setInterval(() => { if (!document.hidden) pingLoop(); }, 20000);
}

boot();
