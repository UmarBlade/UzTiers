// Bosh sahifa (mytiers uslubi): salomlashish, tarmoq statistikasi, kitlar ro'yxati, diagramma, yangiliklar va voqealar.
import { S, h, replaceKids, api, send, greeting, fmtDate, fmtAgo, fmtNum, KIT_ICON, KIT_NAMES } from '../core.js';
import { icon, card, eventList, historyNote, avatar, rolePill, trophy, empty, openDialog, handleActionError, toast } from '../ui.js';
import { sparkline, meter } from '../charts.js';
import { trendCard, statePill } from './kit.js';
import { liveTicketCard } from './tickets.js';

function statCard(label, value, chart, hint) {
  return h('div', { class: 'stat-card' },
    h('p', { class: 'stat-label' }, label),
    h('div', { class: 'stat-row' },
      h('div', { class: 'stat-copy' }, h('p', { class: 'stat-value' }, fmtNum(value)), hint ? h('p', { class: 'stat-hint' }, hint) : null),
      h('div', { class: `stat-chart${chart?.classList?.contains('meter') ? ' is-meter' : ''}` }, chart)));
}

function kitList(kits) {
  return h('section', { class: 'card' },
    h('div', { class: 'card-head stacked' }, h('h2', null, 'Kitlar'), h('span', { class: 'hint' }, 'UzTiers Discord serverlari')),
    h('div', { class: 'tl-list' }, kits.map(k => h('a', { class: 'tl-card', href: `#/kits/${k.kit}` },
      h('span', { class: 'tl-card-ava' }, h('img', { src: KIT_ICON(k.kit), alt: '', width: 38, height: 38, draggable: 'false' }), h('span', { class: `kit-status${k.open ? ' on' : ''}` })),
      h('span', { class: 'tl-card-copy' },
        h('span', { class: 'tl-card-title' }, k.name),
        h('span', { class: 'tl-card-meta' },
          h('span', null, k.open ? `Navbat ochiq · ${k.queue} kishi` : 'Navbat yopiq'),
          h('span', { class: 'dot-sep' }, '·'),
          h('span', null, `${fmtNum(k.month)} test bu oy`),
          h('span', { class: 'dot-sep' }, '·'),
          h('span', null, `${fmtNum(k.tiered)} darajali`))),
      h('span', { class: 'tl-card-chevron' }, icon('chevron'))))));
}

function weekStar(top) {
  if (!top) return card('Haftaning eng faoli', null, empty("Bu hafta hali test yo'q.", 'flame'));
  return h('a', { class: 'week-star', href: `#/staff/${top.id}` },
    trophy('amber', 'week-trophy'),
    h('span', { class: 'week-text' },
      h('span', { class: 'eyebrow' }, 'Haftaning eng faoli'),
      h('span', { class: 'week-person' }, avatar(top.avatar, top.name, 36), h('b', null, top.name)),
      rolePill(top.role, top.roleColor, true),
      h('span', { class: 'week-count' }, h('b', null, top.count), ' ta test')));
}

// ---------- yangiliklar ----------
function newsDialog(item, onDone) {
  openDialog({
    title: item ? 'Yangilikni tahrirlash' : 'Yangi yangilik',
    description: item ? null : 'Yangilik panelga kiradigan hamma xodimga bosh sahifada ko\'rinadi.',
    wide: true,
    fields: [
      { name: 'title', label: 'Sarlavha', required: true, max: 120, value: item?.title || '', placeholder: 'Masalan: Sword navbati kechqurun ochiq' },
      { name: 'body', label: 'Matn', type: 'textarea', required: true, max: 2000, value: item?.body || '' },
      item ? null : { name: 'kit', label: 'Kim ko\'radi', type: 'select', value: '', options: [{ value: '', label: 'Hamma kitlar' }, ...S.me.kits.map(k => ({ value: k.kit, label: `Faqat ${k.name}` }))] },
      { name: 'pinned', label: 'Yuqorida qadab qo\'yish', type: 'select', value: item?.pinned ? '1' : '', options: [{ value: '', label: "Yo'q" }, { value: '1', label: 'Ha, eng yuqorida tursin' }] }
    ].filter(Boolean),
    submitLabel: item ? 'Saqlash' : "Qo'shish",
    onSubmit: v => (item
      ? send('PATCH', `/api/news/${item.id}`, { title: v.title, body: v.body, pinned: v.pinned === '1' })
      : send('POST', '/api/news', { title: v.title, body: v.body, kit: v.kit || null, pinned: v.pinned === '1' })),
    onDone: result => { if (result?.message) toast(result.message); onDone(); }
  });
}
function newsCard(n, reload) {
  return h('article', { class: `news-card${n.pinned ? ' pinned' : ''}` },
    h('div', { class: 'news-head' },
      h('div', { class: 'news-meta' },
        n.pinned ? h('span', { class: 'news-pin' }, icon('star'), 'Qadalgan') : null,
        h('time', { title: fmtDate(n.createdAt) }, fmtAgo(n.createdAt)),
        n.author ? h('span', { class: 'news-author' }, n.author.name) : null,
        n.kit ? h('span', { class: 'news-kit' }, KIT_NAMES[n.kit] || n.kit) : null),
      n.canEdit ? h('div', { class: 'news-actions' },
        h('button', { class: 'icon-btn', type: 'button', title: 'Tahrirlash', 'aria-label': 'Tahrirlash', onclick: () => newsDialog(n, reload) }, icon('pencil')),
        h('button', { class: 'icon-btn danger', type: 'button', title: "O'chirish", 'aria-label': "O'chirish", onclick: () => openDialog({
          title: "Yangilikni o'chirish",
          description: `"${n.title}" o'chiriladi.`,
          submitLabel: "O'chirish",
          danger: true,
          onSubmit: () => send('DELETE', `/api/news/${n.id}`, {}),
          onDone: result => { if (result?.message) toast(result.message); reload(); }
        }) }, icon('trash'))) : null),
    h('h3', { class: 'news-title' }, n.title),
    h('p', { class: 'news-body' }, n.body));
}
function newsSection() {
  const list = h('div', { class: 'news-list' }, h('div', { class: 'skeleton news-skeleton' }));
  const addBox = h('span');
  async function load() {
    const data = await api('/api/news').catch(err => { handleActionError(err); return null; });
    if (!data) return;
    replaceKids(addBox, data.canPost ? h('button', { class: 'btn small', type: 'button', onclick: () => newsDialog(null, load) }, icon('plus'), "Qo'shish") : null);
    replaceKids(list, data.items.length ? data.items.map(n => newsCard(n, load)) : empty("Yangiliklar hali yo'q", 'note', data.canPost ? 'Birinchi yangilikni qo\'shing: u hamma xodimga ko\'rinadi.' : 'Rahbarlar yangilik yozganda shu yerda ko\'rinadi.'));
  }
  load();
  return h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('div', { class: 'card-head-copy' }, h('h2', null, 'Yangiliklar'), h('span', { class: 'hint' }, 'Panel va tarmoq yangiliklari')), addBox),
    list);
}

export async function pageHome() {
  const d = await api('/api/overview');
  document.title = 'Bosh sahifa · UzTiers Panel';
  const scopeNote = S.me.global ? 'UzTiers boshqaruv paneliga xush kelibsiz.' : `Siz faqat ${S.me.kits.map(k => k.name).join(', ')} serverini ko'ryapsiz.`;
  const series = d.series?.length ? d.series : d.perDay;
  return [
    h('div', { class: 'page-head home-hero' },
      avatar(S.me.avatar, S.me.name, 56),
      h('div', { class: 'grow' },
        h('h1', null, `${greeting()}, ${S.me.name}`),
        h('div', { class: 'sub' }, scopeNote)),
      h('div', { class: 'tl-hero-side' }, statePill(d.totals.testers > 0, `${d.totals.testers} tester onlayn`, 'Tester onlayn emas'))),
    h('div', { class: 'stat-grid' },
      statCard("O'yinchilar", d.totals.players, meter(d.totals.players ? d.totals.tiered / d.totals.players : 0, 'Darajasi borlar ulushi'), `${fmtNum(d.totals.tiered)} tasida daraja bor`),
      statCard('Bu oy testlar', d.totals.month, sparkline(series.slice(-30).map(r => r.count)), `jami ${fmtNum(d.totals.total)}`),
      statCard('Navbatda', d.totals.queue, sparkline(series.slice(-14).map(r => r.count)), `${fmtNum(d.totals.active)} ta test ketmoqda`),
      statCard('Cheklanganlar', d.totals.restricted, meter(d.totals.players ? d.totals.restricted / d.totals.players * 10 : 0, 'Cheklanganlar ulushi'), 'hozir cheklangan')),
    d.live.length ? h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', { class: 'with-dot' }, h('span', { class: 'live-dot' }), 'Jonli chiptalar'), h('a', { class: 'hint link', href: '#/tickets' }, 'Hammasi', icon('open'))),
      h('div', { class: 'live-grid' }, d.live.map(liveTicketCard))) : null,
    h('div', { class: 'home-layout' },
      h('div', { class: 'home-col' },
        kitList(d.kits),
        trendCard(series, { title: 'Tarmoqdagi testlar' })),
      h('div', { class: 'home-col' },
        newsSection(),
        weekStar(d.weekTop),
        card("So'nggi voqealar", h('a', { class: 'hint link', href: '#/logs' }, 'Audit', icon('open')), eventList(d.recent.slice(0, 8), historyNote(d.historySince)))))
  ];
}
