// Kit (server) sahifalari: umumiy ko'rinish (diagrammalar) va navbat.
import { h, replaceKids, api, runAction, can, fmtDate, fmtDuration, fmtAgo, fmtNum, KIT_ICON } from '../core.js';
import { icon, card, empty, avatar, personChip, skinImg, tierChip, tierClass, trophy, openDialog, actionBtn, toast, handleActionError, segmented, eventLook, typeIcon } from '../ui.js';
import { areaChart, sparkline, meter, tierColumns, periodSummary, dayLabel } from '../charts.js';
import { liveTicketCard } from './tickets.js';

// Kit sahifalarining umumiy sarlavhasi: nom, izoh, holat belgilari va tugmalar.
export function kitHead({ title, desc, badges = [], actions = [], back = null }) {
  return h('div', { class: 'page-head kit-page-head' },
    back ? h('a', { class: 'head-back icon-btn', href: back, 'aria-label': 'Orqaga', title: 'Orqaga' }, icon('m-chevron-left')) : null,
    h('div', { class: 'grow' },
      h('div', { class: 'head-title' }, h('h1', null, title), badges),
      desc ? h('div', { class: 'sub' }, desc) : null),
    actions.length ? h('div', { class: 'head-buttons' }, actions) : null);
}
export const statePill = (on, onText, offText) => h('span', { class: `state-pill ${on ? 'on' : 'off'}` }, h('i'), on ? onText : offText);

function statCard(label, value, chart, hint = null) {
  return h('div', { class: 'stat-card' },
    h('p', { class: 'stat-label' }, label),
    h('div', { class: 'stat-row' },
      h('div', { class: 'stat-copy' }, h('p', { class: 'stat-value' }, typeof value === 'number' ? fmtNum(value) : value), hint ? h('p', { class: 'stat-hint' }, hint) : null),
      h('div', { class: `stat-chart${chart?.classList?.contains('meter') ? ' is-meter' : ''}` }, chart)));
}
const weeklySums = (series, weeks) => Array.from({ length: weeks }, (_, i) => series.slice(series.length - (weeks - i) * 7, series.length - (weeks - i - 1) * 7).reduce((n, r) => n + r.count, 0));

// Katta diagramma kartasi: davr tanlash va oldingi davr bilan solishtirish.
export function trendCard(series, { title = 'Testlar', unit = 'test', periods = [[7, '7 kun'], [14, '14 kun'], [30, '30 kun'], [90, '90 kun']], initial = 30 } = {}) {
  let days = initial;
  let compare = false;
  const summaryBox = h('div', { class: 'trend-summary' });
  const legendBox = h('div', { class: 'trend-legend' });
  const chartBox = h('div', { class: 'trend-canvas' });
  const compareBtn = h('button', { class: 'chart-compare', type: 'button', 'aria-pressed': 'false', onclick: () => { compare = !compare; compareBtn.setAttribute('aria-pressed', String(compare)); render(); } }, icon('swap'), 'Solishtirish');
  function render() {
    const sum = periodSummary(series, days);
    const deltaCls = sum.delta === null ? '' : sum.delta > 0 ? ' up' : sum.delta < 0 ? ' down' : '';
    replaceKids(summaryBox,
      h('div', { class: 'trend-metric' }, h('span', { class: 'trend-value' }, fmtNum(sum.total)), h('span', { class: 'trend-unit' }, unit)),
      h('div', { class: 'trend-meta' },
        h('span', { class: 'trend-period' }, title),
        sum.delta !== null ? h('span', { class: `trend-delta${deltaCls}`, title: `Oldingi ${days} kunda: ${fmtNum(sum.before)}` }, `${sum.delta > 0 ? '+' : ''}${sum.delta}%`) : null,
        sum.current.length ? h('span', { class: 'note' }, `${dayLabel(sum.current[0].date)} — ${dayLabel(sum.current.at(-1).date)}`) : null));
    replaceKids(legendBox,
      h('span', { class: 'legend-item' }, h('i', { class: 'legend-swatch current' }), 'Shu davr'),
      compare && sum.previous ? h('span', { class: 'legend-item' }, h('i', { class: 'legend-swatch previous' }), 'Oldingi davr') : null);
    replaceKids(chartBox, areaChart(sum.current, { compare: compare ? sum.previous : null, unit }));
  }
  render();
  return h('section', { class: 'trend-card' },
    h('div', { class: 'trend-head' }, summaryBox,
      h('div', { class: 'trend-controls' }, compareBtn, segmented(periods, days, value => { days = value; render(); }, { small: true, label: 'Davr' }))),
    legendBox,
    chartBox);
}

// So'nggi voqealar bloklari (mytiers "feed").
function feedRow(e) {
  const [, , label] = eventLook(e.type);
  const who = e.target || e.actor;
  const tier = /^(HT|LT)[1-5]$/.test(e.newValue || '') ? e.newValue : null;
  const meta = e.type === 'test' || e.type === 'high_win' || e.type === 'high_loss'
    ? `${label}${e.actor ? ` · ${e.actor.name}` : ''}`
    : `${label}${e.newValue && !tier ? `: ${e.newValue}` : ''}${e.oldValue && e.type === 'staff_remove' ? `: ${e.oldValue}` : ''}${e.actor && e.target ? ` · ${e.actor.name}` : ''}`;
  const href = e.targetId ? `#/players/${e.targetId}` : (e.actorId ? `#/staff/${e.actorId}` : null);
  return h(href ? 'a' : 'div', { class: 'feed-row', href },
    who?.avatar ? avatar(who.avatar, who.name, 30) : typeIcon(e.type, 'small'),
    h('span', { class: 'feed-text' }, h('span', { class: 'feed-name' }, who?.name || 'Tizim'), h('span', { class: 'feed-meta' }, meta)),
    h('span', { class: 'feed-aside' },
      tier ? h('span', { class: `feed-badge ${e.type === 'high_loss' ? 'bad' : 'tier'}` }, e.type === 'high_loss' ? 'Yiqildi' : tier) : null,
      h('time', { class: 'feed-time', title: fmtDate(e.createdAt) }, fmtAgo(e.createdAt))));
}
function feedBlock(title, rows, emptyText, iconName, href) {
  return h('section', { class: 'feed-block' },
    h('div', { class: 'feed-head' }, h('h2', null, title), href ? h('a', { class: 'hint link', href }, 'Hammasi', icon('open')) : null),
    h('div', { class: 'feed-body' }, rows.length ? h('div', { class: 'feed-list' }, rows.map(feedRow)) : empty(emptyText, iconName)));
}

function topTesters(rows) {
  return h('section', { class: 'insight-block' },
    h('div', { class: 'insight-head' }, h('h2', null, 'Eng faol testerlar'), h('span', { class: 'insight-meta' }, 'bu oy')),
    h('div', { class: 'insight-body' }, rows.length
      ? h('ol', { class: 'top-cards' }, rows.map((t, i) => h('li', null, h('a', { class: 'top-card', href: `#/staff/${t.id}` },
          i < 3 ? trophy(['amber', 'silver', 'bronze'][i], 'tiny') : h('span', { class: 'top-rank' }, i + 1),
          avatar(t.avatar, t.name, 26),
          h('span', { class: 'top-name' }, t.name),
          h('span', { class: 'top-value' }, `${fmtNum(t.month)} test`)))))
      : empty("Bu oy hali test yo'q.", 'sword')));
}

export async function pageKit(ctx) {
  const slug = ctx.params[0];
  const d = await api(`/api/kits/${slug}`);
  if (!d) return ctx.notFound('Kit topilmadi yoki sizda ruxsat yo\'q.');
  document.title = `${d.name} · UzTiers Panel`;
  const series = d.series?.length ? d.series : d.perDay;
  const start = d.tests.total - series.slice(-60).reduce((n, r) => n + r.count, 0);
  let running = Math.max(start, 0);
  const cumulative = series.slice(-60).map(r => (running += r.count));
  const liveBox = h('div');
  const renderLive = list => replaceKids(liveBox, list.length ? h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', { class: 'with-dot' }, h('span', { class: 'live-dot' }), 'Jonli chiptalar'), h('a', { class: 'hint link', href: `#/tickets?kit=${slug}` }, 'Tarix', icon('open'))),
    h('div', { class: 'live-grid' }, list.map(liveTicketCard))) : null);
  renderLive(d.live);
  ctx.every(15000, async () => { const fresh = await api(`/api/kits/${slug}`); if (fresh) renderLive(fresh.live); });
  const applicationBtn = can('setApplication', slug) ? actionBtn(d.applicationOpen ? 'Arizani yopish' : 'Arizani ochish', () => openDialog({
    title: d.applicationOpen ? 'Tester arizasini yopish' : 'Tester arizasini ochish',
    description: `${d.name} serverida ariza xabari ham yangilanadi.`,
    submitLabel: 'Tasdiqlash',
    onSubmit: () => runAction('setApplication', { kit: slug, open: !d.applicationOpen })
  }), '', 'doc') : null;
  const distribution = [...d.distribution].reverse();
  return [
    h('section', { class: 'tl-hero' },
      h('img', { class: 'tl-avatar', src: KIT_ICON(slug), alt: '', width: 44, height: 44, draggable: 'false' }),
      h('div', { class: 'grow' },
        h('h1', null, d.name),
        h('div', { class: 'sub' }, `${d.guildName || 'Discord server'}${d.members !== null ? ` · ${fmtNum(d.members)} a'zo` : ''}`)),
      h('div', { class: 'tl-hero-side' },
        statePill(d.queue.open, 'Navbat ochiq', 'Navbat yopiq'),
        statePill(d.applicationOpen, 'Ariza ochiq', 'Ariza yopiq'),
        applicationBtn)),
    h('div', { class: 'stat-grid' },
      statCard('Bugun', d.tests.today, sparkline(series.slice(-14).map(r => r.count)), 'test'),
      statCard('7 kun', d.tests.week, sparkline(weeklySums(series, 8)), 'test'),
      statCard('Bu oy', d.tests.month, sparkline(series.slice(-30).map(r => r.count)), 'test'),
      statCard('Jami', d.tests.total, sparkline(cumulative), 'test'),
      statCard("Darajali o'yinchilar", d.tiered, meter(d.members ? d.tiered / d.members : 0, "A'zolar ichidagi ulushi"), d.members ? `${Math.round(d.tiered / d.members * 100)}%` : null),
      statCard('Navbat', `${d.queue.players.length}/${d.queueLimit}`, meter(d.queue.players.length / (d.queueLimit || 20), "Navbat to'lishi"), `${d.queue.testers.length} tester`)),
    trendCard(series, { title: 'Testlar' }),
    h('div', { class: 'insight-grid' },
      topTesters(d.top),
      h('section', { class: 'insight-block' },
        h('div', { class: 'insight-head' }, h('h2', null, 'Darajalar taqsimoti'), h('span', { class: 'insight-meta' }, `${fmtNum(d.tiered)} o'yinchi`)),
        h('div', { class: 'insight-body' }, tierColumns(distribution, tierClass)))),
    liveBox,
    h('div', { class: 'feed-grid' },
      feedBlock("So'nggi testlar", d.feeds?.tests || [], "Testlar hali yo'q", 'sword', `#/logs?kit=${slug}&group=tests`),
      feedBlock('Jazolar', d.feeds?.punish || [], "Jazolar hali yo'q", 'ban', `#/logs?kit=${slug}&group=punish`),
      feedBlock("Xodimlar o'zgarishi", d.feeds?.staff || [], "O'zgarishlar hali yo'q", 'badge', `#/logs?kit=${slug}&group=staff`))
  ];
}

// ---------- navbat ----------
function playersCard(q, slug, limit, refresh) {
  const act = async (name, body) => {
    try {
      const result = await runAction(name, { kit: slug, ...body });
      if (result.message && name !== 'queueMove') toast(result.message);
      refresh();
    } catch (err) { handleActionError(err); }
  };
  const canMove = can('queueMove', slug);
  const canRemove = can('queueRemove', slug);
  return h('section', { class: 'card queue-col' },
    h('div', { class: 'card-head' }, h('h2', null, "O'yinchilar"), h('span', { class: 'count-pill' }, `${q.players.length}/${limit}`)),
    q.players.length ? h('div', { class: 'queue-list' }, q.players.map((p, i) => h('div', { class: 'queue-row' },
      h('span', { class: 'rank-tag' }, i + 1),
      h('a', { href: `#/players/${p.id}`, class: 'queue-player' }, h('span', { class: 'queue-skin' }, skinImg(p, 'bust', 96)), h('b', null, p.nick)),
      h('span', { class: 'queue-meta' }, icon('tag'), p.server || '—'),
      h('span', { class: 'queue-meta' }, icon('clock'), p.since ? fmtDuration(Date.now() - p.since) : '—'),
      canMove || canRemove ? h('span', { class: 'row-actions' },
        canMove ? [
          h('button', { class: 'icon-btn', type: 'button', disabled: i === 0, 'aria-label': `${p.nick} ni yuqoriga`, title: 'Yuqoriga', onclick: () => act('queueMove', { targetId: p.id, direction: -1 }) }, icon('up')),
          h('button', { class: 'icon-btn', type: 'button', disabled: i === q.players.length - 1, 'aria-label': `${p.nick} ni pastga`, title: 'Pastga', onclick: () => act('queueMove', { targetId: p.id, direction: 1 }) }, icon('down'))
        ] : null,
        canRemove ? h('button', { class: 'icon-btn danger', type: 'button', 'aria-label': `${p.nick} ni navbatdan olib tashlash`, title: 'Olib tashlash', onclick: () => openDialog({
          title: 'Navbatdan olib tashlash',
          description: `${p.nick} navbatdan olib tashlanadi.`,
          submitLabel: 'Olib tashlash',
          danger: true,
          onSubmit: () => runAction('queueRemove', { kit: slug, targetId: p.id })
        }) }, icon('close')) : null) : null)))
      : empty(q.open ? "Navbat bo'sh" : 'Navbat yopiq', 'list', q.open ? "O'yinchilar Discord'dagi navbat xabari orqali qo'shiladi." : 'Tester /start buyrug\'ini yozganda navbat ochiladi.'));
}
function testersCard(q, slug) {
  return h('section', { class: 'card queue-col' },
    h('div', { class: 'card-head' }, h('h2', null, 'Testerlar'), h('span', { class: 'count-pill' }, q.testers.length)),
    q.testers.length ? h('div', { class: 'queue-list' }, q.testers.map(t => h('div', { class: 'queue-row' },
      h('a', { class: 'queue-player', href: `#/staff/${t.id}` }, avatar(t.avatar, t.name, 34), h('b', null, t.name)),
      q.active.some(a => a.testerId === t.id) ? h('span', { class: 'mini-chip' }, icon('sword'), 'Test olmoqda') : h('span', { class: 'note' }, 'Bo\'sh'),
      can('kickTester', slug) ? h('button', { class: 'icon-btn danger', type: 'button', 'aria-label': `${t.name} ni navbatdan chiqarish`, title: 'Navbatdan chiqarish', onclick: () => openDialog({
        title: 'Testerni chiqarish',
        description: `${t.name} navbatdan chiqariladi. Tester qolmasa, navbat yopiladi.`,
        submitLabel: 'Chiqarish',
        danger: true,
        onSubmit: () => runAction('kickTester', { kit: slug, targetId: t.id })
      }) }, icon('close')) : null)))
      : empty("Onlayn tester yo'q", 'staff', 'Testerlar Discord\'da /start yozganda shu yerda ko\'rinadi.'));
}
function activeCard(q) {
  if (!q.active.length) return null;
  return card('Hozirgi testlar', `${q.active.length} ta`, h('div', { class: 'queue-list' }, q.active.map(a => h('div', { class: 'queue-row' },
    h('span', { class: 'person' }, avatar(a.testerAvatar, a.testerName, 30), h('span', { class: 'person-text' }, h('span', { class: 'person-name' }, a.testerName), h('span', { class: 'person-sub' }, 'tester'))),
    icon('chevron', 'ico arrow'),
    h('a', { class: 'queue-player', href: `#/players/${a.playerId}` }, h('b', null, a.playerName || a.mcName || "O'yinchi")),
    a.ticketId ? h('a', { class: 'btn small', href: `#/tickets/${a.ticketId}` }, icon('chat'), 'Chipta') : null))));
}

export async function pageKitQueue(ctx) {
  const slug = ctx.params[0];
  const first = await api(`/api/kits/${slug}`);
  if (!first) return ctx.notFound('Kit topilmadi yoki sizda ruxsat yo\'q.');
  document.title = `Navbat · ${first.name}`;
  const box = h('div', { class: 'stack' });
  const headBox = h('div');
  function render(d) {
    const q = d.queue;
    replaceKids(headBox, kitHead({
      title: 'Navbat',
      badges: [statePill(q.open, 'Ochiq', 'Yopiq')],
      desc: `${q.open ? 'Yangi o\'yinchilar qabul qilinmoqda' : 'Yangi o\'yinchilar qabul qilinmaydi'} · ${q.testers.length} tester · ${q.players.length}/${d.queueLimit} o'yinchi · jonli yangilanadi`,
      actions: [
        q.open && can('queueClose', slug) ? actionBtn('Navbatni yopish', () => openDialog({
          title: 'Navbatni yopish',
          description: "Navbat yopiladi va undagi o'yinchilar ro'yxati tozalanadi.",
          submitLabel: 'Yopish',
          danger: true,
          onSubmit: () => runAction('queueClose', { kit: slug }),
          onDone: result => { if (result?.message) toast(result.message); refresh(); }
        }), 'danger', 'lock') : null,
        h('a', { class: 'btn small', href: `#/kits/${slug}/panels/queue` }, icon('pencil'), 'Navbat xabari')
      ].filter(Boolean)
    }));
    replaceKids(box,
      !q.open ? h('div', { class: 'info-banner' }, icon('lock'), h('span', { class: 'grow' }, h('b', null, 'Navbat yopiq.'), ' Testerlar Discord\'da /start buyrug\'ini yozganda u ochiladi va o\'yinchilar navbat xabari orqali qo\'shiladi.')) : null,
      h('div', { class: 'queue-grid' }, testersCard(q, slug), playersCard(q, slug, d.queueLimit, refresh)),
      activeCard(q));
  }
  async function refresh() {
    const d = await api(`/api/kits/${slug}`);
    if (d) render(d);
  }
  render(first);
  ctx.every(8000, refresh);
  return [headBox, box];
}
