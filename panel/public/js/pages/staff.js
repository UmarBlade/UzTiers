// Xodimlar ro'yxati va xodim profili.
import { S, h, replaceKids, api, send, fmtDate, fmtDateTime, fmtAgo, fmtNum, storageGet, storageSet, tashkentNow, TIERS, KIT_ICON, KIT_NAMES } from '../core.js';
import { sfx } from '../look.js';
import { catBar, roleIcon, ROLE_ICONS, icon, card, empty, select, searchBar, segmented, avatar, person, rolePill, roleChips, kitIcon, trophy, tile, chartCard, tierBars, heatMap, hoursChart, eventList, historyNote, openDialog, staffRoleDialog, handleActionError, toast, typeIcon } from '../ui.js';
import { highlight } from '../core.js';

const STAT_COLUMNS = [
  ['tests', 'sword', 'Testlar (oddiy va yutilgan yuqori testlar)'],
  ['high', 'trophy', 'Yuqori testlar'],
  ['tiers', 'swap', "Daraja o'zgartirishlar"],
  ['restricts', 'ban', 'Cheklovlar'],
  ['mutes', 'muted', 'Mutelar'],
  ['actions', 'chart', 'Jami amallar']
];
const WEEK_DAYS = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];

function statCell(m, key, toneIcon) {
  const value = (key === 'tests' ? m.count : m.stats?.[key]) || 0;
  return h('span', { class: `stat-cell${value ? ' on' : ''}`, title: toneIcon[2] }, fmtNum(value));
}

export async function pageStaff(ctx) {
  const state = { period: ctx.query.get('period') || 'month', kit: ctx.query.get('kit') || '', from: ctx.query.get('from') || '', to: ctx.query.get('to') || '' };
  let roleFilter = '';
  let text = '';
  let activity = '';
  let norma = Math.max(Number(storageGet('uzp_norma')) || 0, 0);
  let d = null;
  let token = 0;
  document.title = 'Xodimlar · UzTiers Panel';
  const periodNames = { week: '7 kun', '30d': '30 kun', month: 'Bu oy', all: 'Jami', custom: 'Sana' };

  const listBox = h('div');
  const countBox = h('span', { class: 'count-pill' });
  const sideBox = h('div', { class: 'side-row' });
  const noteBox = h('p', { class: 'note' });
  const dateBox = h('span', { class: 'date-range' });
  const roleBox = h('div');
  let roleSignature = '';

  function renderRoleBar() {
    const counts = new Map();
    for (const m of d.staff) counts.set(m.role, (counts.get(m.role) || 0) + 1);
    const present = d.roles.filter(r => counts.has(r));
    const signature = JSON.stringify([d.staff.length, present.map(r => counts.get(r))]);
    if (signature === roleSignature) return;
    roleSignature = signature;
    if (roleFilter && !present.includes(roleFilter)) roleFilter = '';
    replaceKids(roleBox, catBar([
      { value: '', text: 'Hammasi', icon: 'staff', count: d.staff.length },
      ...present.map(r => ({ value: r, text: r, icon: ROLE_ICONS[r], count: counts.get(r) }))
    ], roleFilter, value => { roleFilter = value; renderList(); }, { compact: true, label: 'Rol' }));
  }

  function renderList() {
    const rows = d.staff.filter(m => {
      if (roleFilter && m.role !== roleFilter) return false;
      if (text && !m.name.toLowerCase().includes(text) && m.id !== text) return false;
      if (activity === 'active' && !m.count) return false;
      if (activity === 'inactive' && m.count) return false;
      if (activity === 'below' && !(norma > 0 && (m.count || 0) < norma)) return false;
      return true;
    });
    countBox.textContent = `${rows.length} kishi`;
    if (!rows.length) { replaceKids(listBox, empty('Hech kim topilmadi.', 'staff')); return; }
    // Har bir rol alohida guruh bo'lib ko'rinadi.
    let lastRole = null;
    const groupHead = m => {
      if (roleFilter || m.role === lastRole) return null;
      lastRole = m.role;
      return h('div', { class: 'staff-group' }, roleIcon(m.role), h('span', null, m.role), h('span', { class: 'staff-group-count' }, rows.filter(x => x.role === m.role).length));
    };
    replaceKids(listBox, h('div', { class: 'staff-table' },
      h('div', { class: 'staff-head' },
        h('span', null, 'Xodim'),
        h('span', null, 'Rol'),
        STAT_COLUMNS.map(col => h('span', { class: 'stat-head', title: col[2] }, icon(col[1]), h('span', { class: 'sr-only' }, col[2]))),
        h('span', null, 'Kitlar')),
      rows.map(m => [groupHead(m), h('a', { class: 'staff-row', href: `#/staff/${m.id}` },
        h('span', { class: 'staff-who' },
          h('span', { class: 'avatar-wrap' }, avatar(m.avatar, m.name, 44), m.online ? h('span', { class: 'online-dot', title: 'Onlayn' }) : null),
          h('span', { class: 'person-text' },
            h('span', { class: 'staff-name' }, highlight(m.name, text)),
            m.since ? h('span', { class: 'person-sub' }, `${fmtDate(m.since)} dan`) : null,
            norma > 0 && (m.count || 0) < norma ? h('span', { class: 'person-sub warn' }, `Normadan past: ${m.count || 0} / ${norma}`) : null)),
        h('span', null, rolePill(m.role, m.roleColor)),
        STAT_COLUMNS.map(col => statCell(m, col[0], col)),
        h('span', { class: 'staff-kits' }, m.kits.map(x => kitIcon(x))))])));
  }
  function renderSide() {
    const rankRow = (m, i) => h('a', { href: `#/staff/${m.id}`, class: 'rank-row' },
      i < 3 ? trophy(['amber', 'silver', 'bronze'][i], 'small') : h('span', { class: 'rank-tag' }, i + 1),
      avatar(m.avatar, m.name, 34),
      h('span', { class: 'grow rank-name' }, m.name),
      h('b', { class: 'rank-count' }, m.count));
    const removedRow = m => h('a', { href: `#/staff/${m.id}`, class: 'rank-row' }, avatar(m.avatar, m.name, 34), h('span', { class: 'grow rank-name' }, m.name), h('b', { class: 'rank-count' }, m.count));
    replaceKids(sideBox,
      d.weekTop ? h('a', { class: 'week-star', href: `#/staff/${d.weekTop.id}` },
        trophy('amber', 'week-trophy'),
        h('span', { class: 'week-text' },
          h('span', { class: 'eyebrow' }, 'Haftaning eng faoli'),
          h('span', { class: 'week-person' }, avatar(d.weekTop.avatar, d.weekTop.name, 42), h('b', null, d.weekTop.name)),
          h('span', { class: 'week-count' }, h('b', null, d.weekTop.count), ' ta test'))) : null,
      card('Eng faol testerlar', periodNames[state.period], d.top.length ? h('div', { class: 'rank-list' }, d.top.map(rankRow)) : empty("Bu davrda test yo'q.", 'sword')),
      card('Olib tashlangan testerlar', "hozir xodim emas, lekin testi bor", d.removed.length ? h('div', { class: 'rank-list' }, d.removed.map(removedRow)) : empty("Bunday testerlar yo'q.", 'staff')));
  }
  async function load() {
    const run = ++token;
    const params = new URLSearchParams({ period: state.period });
    if (state.kit) params.set('kit', state.kit);
    if (state.period === 'custom') { if (state.from) params.set('from', state.from); if (state.to) params.set('to', state.to); }
    const data = await api(`/api/staff?${params}`);
    if (run !== token || !data) return;
    d = data;
    history.replaceState(null, '', `#/staff?${params}`);
    noteBox.textContent = historyNote(d.historySince);
    replaceKids(dateBox, state.period === 'custom' ? [
      h('label', { class: 'sr-only', for: 'staff-from' }, 'Boshlanish sanasi'),
      h('input', { id: 'staff-from', class: 'field', type: 'date', value: state.from, onchange: e => { state.from = e.target.value; load(); } }),
      h('label', { class: 'sr-only', for: 'staff-to' }, 'Tugash sanasi'),
      h('input', { id: 'staff-to', class: 'field', type: 'date', value: state.to, onchange: e => { state.to = e.target.value; load(); } })
    ] : null);
    renderRoleBar();
    renderList();
    renderSide();
  }
  await load();
  return [
    h('div', { class: 'page-head' },
      h('div', { class: 'grow' }, h('h1', null, 'Xodimlar'), h('div', { class: 'sub' }, 'Rollar, testlar va amallar statistikasi.')),
      searchBar({ id: 'staff-search', placeholder: 'Xodim qidirish…', cls: 'wide', oninput: value => { text = value.toLowerCase(); renderList(); } })),
    roleBox,
    h('div', { class: 'controls' },
      segmented(Object.entries(periodNames), state.period, value => { state.period = value; load(); }, { label: 'Davr' }),
      dateBox,
      S.me.kits.length > 1 ? select('staff-kit', 'Kit', [['', 'Barcha kitlar'], ...S.me.kits.map(k => [k.kit, k.name])], state.kit, e => { state.kit = e.target.value; load(); }) : null,
      select('staff-activity', 'Faollik', [['', 'Hammasi'], ['active', 'Testi borlar'], ['inactive', "Testi yo'qlar"], ['below', 'Normadan pastlar']], '', e => { activity = e.target.value; renderList(); }),
      h('label', { class: 'norma' }, 'Norma',
        h('input', { class: 'field', type: 'number', min: 0, max: 9999, value: norma || '', placeholder: '0', oninput: e => { norma = Math.max(Number(e.target.value) || 0, 0); storageSet('uzp_norma', norma); renderList(); } }))),
    noteBox,
    h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', { class: 'big' }, 'Hozirgi tarkib'), countBox), listBox),
    sideBox
  ];
}

// ---------- xodim profili ----------
function workLine(profile) {
  if (!profile.workDays?.length && !profile.workFrom) return null;
  const days = profile.workDays?.length ? profile.workDays.map(i => WEEK_DAYS[i]).join(', ') : 'Har kuni';
  const hours = profile.workFrom && profile.workTo ? `${profile.workFrom} – ${profile.workTo}` : '';
  return `${days}${hours ? ` · ${hours}` : ''}`;
}
function isWorkingNow(profile) {
  const now = tashkentNow();
  if (profile.workDays?.length && !profile.workDays.includes(now.day)) return false;
  if (!profile.workFrom || !profile.workTo) return Boolean(profile.workDays?.length);
  const toMin = value => { const [a, b] = value.split(':').map(Number); return a * 60 + b; };
  const from = toMin(profile.workFrom);
  const to = toMin(profile.workTo);
  return from <= to ? now.minutes >= from && now.minutes < to : now.minutes >= from || now.minutes < to;
}
function editProfileDialog(d) {
  const profile = d.profile;
  const selected = new Set(profile.workDays);
  const dayButtons = WEEK_DAYS.map((name, i) => {
    const btn = h('button', { class: 'day-chip', type: 'button', 'aria-pressed': String(selected.has(i)), onclick: () => {
      if (selected.has(i)) selected.delete(i); else selected.add(i);
      btn.setAttribute('aria-pressed', String(selected.has(i)));
          } }, name);
    return btn;
  });
  openDialog({
    title: 'Profilni tahrirlash',
    wide: true,
    body: h('div', { class: 'stack small-gap' },
      h('div', { class: 'dialog-row' }, h('span', null, 'Ish kunlari'), h('div', { class: 'day-chips' }, dayButtons))),
    fields: [
      { name: 'status', label: 'Holat (masalan: bugun kechqurun onlayn)', value: profile.status, max: 80 },
      { name: 'bio', label: "O'zingiz haqingizda", type: 'textarea', value: profile.bio, max: 400 },
      { name: 'workFrom', label: 'Ish boshlanishi (Toshkent vaqti)', type: 'time', value: profile.workFrom },
      { name: 'workTo', label: 'Ish tugashi', type: 'time', value: profile.workTo }
    ],
    submitLabel: 'Saqlash',
    onSubmit: async v => {
      await send('PATCH', '/api/profile', { ...v, workDays: [...selected] });
      return { message: 'Profil saqlandi.' };
    }
  });
}
function achievementsSection(list) {
  const earned = list.filter(a => a.earned);
  const next = list.filter(a => !a.earned).sort((a, b) => (b.value / b.need) - (a.value / a.need)).slice(0, 3);
  return card('Yutuqlar', `${earned.length} / ${list.length}`,
    earned.length ? h('div', { class: 'badges' }, earned.map(a => h('div', { class: `badge-card tb-${a.trophy}`, title: a.text },
      trophy(a.trophy, 'badge-trophy'),
      h('b', null, a.title),
      h('small', null, a.text)))) : empty("Hali yutuq yo'q. Birinchi 10 ta testdan keyin ochiladi.", 'trophy'),
    next.length ? h('div', { class: 'next-badges' }, h('div', { class: 'note' }, 'Keyingi yutuqlar:'), next.map(a => h('div', { class: 'next-badge' },
      h('span', { class: 'next-title' }, a.title),
      h('span', { class: 'next-track' }, h('i', { vars: { width: `${Math.min(a.value / a.need * 100, 100)}%` } })),
      h('span', { class: 'note' }, `${a.value} / ${a.need}`)))) : null);
}

export async function pageStaffProfile(ctx) {
  const d = await api(`/api/staff/${ctx.params[0]}`);
  if (!d) return ctx.notFound('Xodim topilmadi.');
  document.title = `${d.name} · UzTiers Panel`;
  const profile = d.profile || {};
  const work = workLine(profile);
  const working = work && isWorkingNow(profile);
  const roleKits = d.kits.filter(k => k.roleControl);
  const hero = h('section', { class: 'hero-card' },
    h('div', { class: 'hero-inner' },
      h('span', { class: 'staff-avatar' }, avatar(d.avatar, d.name, 112), d.online ? h('span', { class: 'online-dot big', title: 'Onlayn' }) : null),
      h('div', { class: 'grow' },
        h('h1', { class: 'hero-name' }, d.name),
        h('div', { class: 'profile-meta' },
          d.role ? rolePill(d.role, d.roleColor) : h('span', { class: 'badge dot-off' }, 'Hozir xodim emas'),
          d.inPanel ? h('span', { class: 'badge dot-good live' }, 'Hozir panelda') : (profile.lastSeen ? h('span', { class: 'meta-item' }, icon('eye'), `Panelda: ${fmtAgo(profile.lastSeen)}`) : null),
          d.since ? h('span', { class: 'meta-item' }, icon('calendar'), `${fmtDate(d.since)} dan`) : null,
          d.nickname ? h('a', { class: 'meta-item link', href: `#/players/${d.id}` }, icon('players'), d.nickname) : null),
        profile.status ? h('div', { class: 'staff-status' }, icon('flame'), h('span', null, profile.status)) : null,
        profile.bio ? h('p', { class: 'staff-bio' }, profile.bio) : null,
        work ? h('div', { class: 'work-line' }, icon('clock'), h('span', null, work), h('span', { class: `work-state${working ? ' on' : ''}` }, working ? 'Hozir ish vaqti' : 'Ish vaqtidan tashqari')) : null,
        h('div', { class: 'head-actions' },
          d.canEdit ? h('button', { class: 'btn small primary', type: 'button', onclick: () => editProfileDialog(d) }, icon('pencil'), 'Profilni tahrirlash') : null,
          roleKits.length ? h('button', { class: 'btn small primary', type: 'button', onclick: () => staffRoleDialog(d.name, roleKits, d.id) }, icon('badge'), 'Rollarni boshqarish') : null,
          d.canDm ? h('a', { class: 'btn small', href: `#/chat/dm/${d.id}` }, icon('chat'), 'Shaxsiy xabar') : null))));
  const servers = card('Serverlar va rollar', null, h('div', { class: 'server-list' }, d.kits.filter(k => k.role || k.total).map(k => h('div', { class: `server-row` },
    h('div', { class: 'server-head' },
      h('span', { class: 'person' }, kitIcon(k.kit, k.name), h('span', { class: 'person-text' }, h('span', { class: 'person-name' }, k.name), k.role ? h('span', { class: 'person-sub' }, k.role) : null)),
      h('span', { class: 'event-time' }, `${k.monthly} / ${k.total} test`)),
    roleChips(k.roles)))));
  const given = TIERS.map(tier => ({ tier, count: d.tiersGiven.find(t => t.tier === tier)?.count || 0 }));
  return [
    h('a', { class: 'back', href: '#/staff' }, '← Xodimlar'),
    hero,
    h('div', { class: 'tiles' },
      tile('Jami testlar', d.total, `bu oy ${fmtNum(d.monthly)}`, 'sword'),
      tile('Yuqori testlar', d.stats.high, null, 'trophy'),
      tile("Daraja o'zgarishlari", d.stats.tiers, null, 'swap'),
      tile('Cheklovlar', d.stats.restricts, null, 'ban'),
      tile('Mutelar', d.stats.mutes, null, 'muted'),
      tile('Jami amallar', d.stats.actions, null, 'chart')),
    achievementsSection(d.achievements),
    h('div', { class: 'columns' },
      h('div', { class: 'stack' },
        chartCard('Kunlik testlar', d.perDay, { actor: d.id }, "Bu davrda test yo'q."),
        card('Faollik', 'oxirgi 12 hafta', heatMap(d.heat) || empty("Faollik yo'q.", 'chart'),
          d.hours?.some(Boolean) ? h('div', { class: 'hours-wrap' }, h('div', { class: 'note' }, 'Kunning qaysi soatlarida faol (Toshkent vaqti):'), hoursChart(d.hours), h('div', { class: 'chart-x' }, h('span', null, '00:00'), h('span', null, '12:00'), h('span', null, '23:00'))) : null),
        card("So'nggi harakatlar", h('a', { class: 'hint link', href: `#/logs?actor=${d.id}` }, 'Barcha loglar', icon('open')), eventList(d.recent, historyNote(d.historySince)))),
      h('div', { class: 'stack' },
        card('Bergan darajalar', null, given.some(g => g.count) ? tierBars(given) : empty(historyNote(d.historySince), 'swap')),
        servers))
  ];
}
