// Chiptalar Tarixi: oddiy va yuqori test chiptalari, jonli kuzatish va yozishmalar.
import { S, h, replaceKids, api, debounce, highlight, fmtDate, fmtDateTime, fmtTime, fmtAgo, fmtDuration, fmtNum, KIT_ICON, KIT_NAMES } from '../core.js';
import { sfx } from '../look.js';
import { icon, empty, searchBar, catBar, pager, avatar, personChip, rolePill, tierChip, trophy, trophyFor, skinImg, kitIcon, openLightbox, select, toast } from '../ui.js';

const isTier = value => /^(HT|LT)[1-5]$/.test(String(value || ''));
function resultBadge(t) {
  if (!t.closedAt) return h('span', { class: 'ticket-state live' }, h('span', { class: 'live-dot' }), 'Jonli');
  if (isTier(t.result)) return h('span', { class: 'ticket-state good' }, icon('check'), tierChip(t.result));
  const names = { failed: ['Yiqildi', 'bad'], ignored: ['Ignore qilindi', 'off'], forced: ['Majburiy yopildi', 'off'] };
  const [text, tone] = names[t.result] || ['Yopilgan', 'off'];
  return h('span', { class: `ticket-state ${tone}` }, text);
}

// Bosh sahifa va kit sahifasidagi jonli chipta kartasi.
export function liveTicketCard(t) {
  return h('a', { class: `live-card`, href: `#/tickets/${t.id}` },
    h('span', { class: 'live-skin' }, skinImg(t, 'bust', 128)),
    h('span', { class: 'live-body' },
      h('span', { class: 'live-top' }, h('b', null, t.nickname || "O'yinchi"), kitIcon(t.kit, t.kitName)),
      h('span', { class: 'live-tier' }, t.kind === 'high'
        ? [trophy(trophyFor(t.targetTier), 'tiny'), tierChip(t.currentTier), icon('chevron', 'ico arrow'), tierChip(t.targetTier)]
        : [h('span', { class: 'mini-chip' }, icon('sword'), 'Oddiy test'), t.tester ? h('span', { class: 'note' }, t.tester.name) : null]),
      h('span', { class: 'live-preview' }, t.lastPreview ? `${t.lastAuthor ? `${t.lastAuthor}: ` : ''}${t.lastPreview}` : 'Hali xabar yo\'q'),
      h('span', { class: 'live-time' }, h('span', { class: 'live-dot' }), fmtAgo(t.lastAt))));
}

function ticketRow(t, q) {
  const staff = t.kind === 'regular' ? (t.tester ? [t.tester] : []) : (t.closedBy ? [t.closedBy] : t.staff);
  return h('a', { class: 'ticket-row', href: `#/tickets/${t.id}` },
    h('span', { class: 'ticket-skin' }, skinImg(t, 'bust', 96)),
    h('span', { class: 'ticket-main' },
      h('span', { class: 'ticket-nick' }, highlight(t.nickname || "O'yinchi", q), kitIcon(t.kit, t.kitName)),
      h('span', { class: 'ticket-sub' },
        t.foundInText ? h('span', { class: 'mini-chip' }, icon('search'), 'Matnda topildi') : null,
        t.lastPreview ? h('span', { class: 'ticket-preview' }, t.lastPreview) : h('span', { class: 'ticket-preview' }, 'Xabar yo\'q'))),
    h('span', { class: 'ticket-tiers' }, t.kind === 'high'
      ? [trophy(trophyFor(t.targetTier), 'small'), tierChip(t.currentTier), icon('chevron', 'ico arrow'), tierChip(t.targetTier)]
      : (t.server ? h('span', { class: 'mini-chip' }, t.server) : null)),
    h('span', { class: 'ticket-staff' }, staff.length ? staff.slice(0, 3).map(p => avatar(p?.avatar, p?.name, 30)) : h('span', { class: 'note' }, 'Tester yo\'q')),
    h('span', { class: 'ticket-counts' },
      h('span', { title: 'Xabarlar' }, icon('chat'), fmtNum(t.messages)),
      t.images ? h('span', { title: 'Rasmlar' }, icon('image'), fmtNum(t.images)) : null),
    resultBadge(t),
    h('time', { class: 'ticket-time', title: fmtDateTime(t.lastAt) }, fmtAgo(t.lastAt)));
}

export async function pageTickets(ctx) {
  const get = name => ctx.query.get(name) || '';
  const state = { kind: get('kind') === 'high' ? 'high' : 'regular', kit: get('kit'), status: get('status'), q: get('q'), page: Number(get('page')) || 1 };
  let token = 0;
  let lastSignature = '';
  document.title = 'Chiptalar Tarixi · UzTiers Panel';
  const kitBox = h('div', { class: 'ticket-kits' });
  const listBox = h('div');
  const subline = h('div', { class: 'sub' });
  const kindBox = h('div');
  let kindSignature = '';

  function syncUrl() {
    const p = new URLSearchParams();
    if (state.kind !== 'regular') p.set('kind', state.kind);
    if (state.kit) p.set('kit', state.kit);
    if (state.status) p.set('status', state.status);
    if (state.q) p.set('q', state.q);
    if (state.page > 1) p.set('page', state.page);
    history.replaceState(null, '', `#/tickets${p.toString() ? `?${p}` : ''}`);
  }
  function renderKits(summary) {
    const rows = summary[state.kind];
    replaceKids(kitBox, rows.map(r => h('button', {
      class: `ticket-kit${r.open ? ' active' : ''}`,
      type: 'button',
      'aria-pressed': String(state.kit === r.kit),
      onclick: () => { state.kit = state.kit === r.kit ? '' : r.kit; state.page = 1; refresh(); }
    },
    h('img', { src: KIT_ICON(r.kit), alt: '', width: 40, height: 40, draggable: 'false' }),
    h('span', { class: 'ticket-kit-text' },
      h('b', null, r.name),
      h('small', null, r.lastAt ? `So'nggi faollik: ${fmtAgo(r.lastAt)}` : "Hali chipta yo'q")),
    h('span', { class: 'ticket-kit-side' },
      r.open ? h('span', { class: 'ticket-state live' }, h('span', { class: 'live-dot' }), r.open) : null,
      h('small', null, `${fmtNum(r.total)} ta`)))));
  }
  async function refresh({ quiet = false } = {}) {
    const run = ++token;
    const params = new URLSearchParams({ kind: state.kind, page: state.page });
    if (state.kit) params.set('kit', state.kit);
    if (state.status) params.set('status', state.status);
    if (state.q) params.set('q', state.q);
    const [summary, list] = await Promise.all([api('/api/tickets/summary'), api(`/api/tickets?${params}`)]);
    if (run !== token || !summary || !list) return;
    if (!quiet) syncUrl();
    state.page = list.page;
    const count = key => summary[key].reduce((n, r) => n + r.open, 0);
    subline.textContent = summary.since ? `Chiptalar ${fmtDate(summary.since)} dan boshlab saqlanmoqda. Hozir ochiq: ${count('regular') + count('high')} ta.` : "Yangi chiptalar ochilganda shu yerda paydo bo'ladi.";
    const total = key => summary[key].reduce((n, r) => n + r.total, 0);
    const nextKinds = `${total('regular')}:${total('high')}`;
    if (nextKinds !== kindSignature) {
      kindSignature = nextKinds;
      replaceKids(kindBox, catBar([
        { value: 'regular', text: 'Oddiy testlar', icon: 'sword', count: total('regular') },
        { value: 'high', text: 'Yuqori testlar', icon: 'trophy', count: total('high') }
      ], state.kind, value => { state.kind = value; state.page = 1; refresh(); }, { label: 'Chipta turi' }));
    }
    // O'zgarish bo'lmasa qayta chizilmaydi, shunda sichqoncha ostidagi qator sakramaydi.
    const signature = JSON.stringify([summary, list.items.map(t => [t.id, t.lastAt, t.closedAt, t.messages, t.images, t.result]), list.page, list.total]);
    if (quiet && signature === lastSignature) return;
    lastSignature = signature;
    renderKits(summary);
    replaceKids(listBox, list.items.length
      ? [h('div', { class: 'ticket-list' }, list.items.map(t => ticketRow(t, state.q))),
         list.partial ? h('p', { class: 'note' }, "Qidiruv juda ko'p chiptani qamrab oldi, faqat bir qismi tekshirildi. So'zni aniqroq yozing.") : null,
         list.pages > 1 ? pager(list.page, list.pages, next => { state.page = next; refresh(); window.scrollTo(0, 0); }) : null]
      : empty(state.q ? 'Bu qidiruv bo\'yicha chipta topilmadi.' : 'Bu bo\'limda hali chipta yo\'q.', 'folder'));
  }
  await refresh();
  ctx.every(8000, () => refresh({ quiet: true }));
  return [
    h('div', { class: 'page-head' },
      h('div', { class: 'grow' }, h('h1', null, 'Chiptalar Tarixi'), subline),
      searchBar({ id: 'tickets-search', placeholder: 'Nik, tester yoki yozishma matni…', value: state.q, cls: 'wide', oninput: debounce(value => { state.q = value; state.page = 1; refresh(); }, 300) })),
    kindBox,
    h('div', { class: 'controls' },
      select('tickets-status', 'Holat', [['', 'Hammasi'], ['open', 'Faqat jonli'], ['closed', 'Faqat yopilgan']], state.status, e => { state.status = e.target.value; state.page = 1; refresh(); })),
    kitBox,
    h('section', { class: 'card' }, listBox)
  ];
}

// ---------- yozishma ----------
const TOKEN = /<@!?(\d+)>|<@&(\d+)>|<#(\d+)>|<a?:(\w+):(\d+)>|<t:(\d+)(?::[a-zA-Z])?>|\*\*(.+?)\*\*|(https?:\/\/[^\s<]+)/g;
// Discord matnini xavfsiz ko'rsatadi: har bir qism alohida element, HTML sifatida o'qilmaydi.
function richLine(line, mentions, q) {
  const out = [];
  let last = 0;
  const plain = text => { if (text) out.push(...highlight(text, q)); };
  for (const m of line.matchAll(TOKEN)) {
    plain(line.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[1]) out.push(h('span', { class: 'mention' }, `@${mentions?.[m[1]] || 'foydalanuvchi'}`));
    else if (m[2]) out.push(h('span', { class: 'mention' }, '@rol'));
    else if (m[3]) out.push(h('span', { class: 'mention' }, '#kanal'));
    else if (m[5]) out.push(h('img', { class: 'emoji', src: `https://cdn.discordapp.com/emojis/${m[5]}.webp?size=32`, alt: `:${m[4]}:`, title: m[4], width: 20, height: 20, loading: 'lazy' }));
    else if (m[6]) out.push(h('time', { class: 'mention' }, fmtDateTime(Number(m[6]) * 1000)));
    else if (m[7]) out.push(h('strong', null, highlight(m[7], q)));
    else if (m[8]) out.push(h('a', { class: 'msg-link', href: m[8], target: '_blank', rel: 'noopener noreferrer nofollow' }, m[8]));
  }
  plain(line.slice(last));
  return out;
}
function richText(text, mentions, q) {
  return String(text || '').split('\n').map(line => {
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    return h('div', { class: heading ? 'msg-line heading' : 'msg-line' }, richLine(heading ? heading[2] : line, mentions, q));
  });
}
function messageFiles(m) {
  if (!m.files?.length) return null;
  return h('div', { class: 'msg-files' }, m.files.map(f => {
    if (f.url) {
      return h('button', { class: 'msg-image', type: 'button', title: f.name, 'aria-label': `Rasmni ochish: ${f.name}`, onclick: () => openLightbox(f.url, f.name) },
        h('img', { src: f.url, alt: f.name, loading: 'lazy', decoding: 'async', onerror: e => e.target.closest('.msg-image').replaceWith(h('span', { class: 'msg-file' }, icon('image'), h('span', null, f.name), h('small', null, "rasm endi saqlanmagan"))) }));
    }
    const image = String(f.type || '').startsWith('image/');
    return h('span', { class: 'msg-file' }, icon(image ? 'image' : 'doc'), h('span', null, f.name), h('small', null, image ? 'saqlanmoqda…' : 'fayl saqlanmaydi'));
  }));
}
function messageNode(m, ticket, previous, byId, q) {
  const compact = previous && previous.authorId === m.authorId && m.at - previous.at < 5 * 60000 && !m.replyTo;
  const original = m.replyTo ? byId.get(m.replyTo) : null;
  const tag = m.bot ? 'Bot' : (m.isPlayer ? "O'yinchi" : null);
  return h('article', { class: `msg${compact ? ' compact' : ''}${m.bot ? ' from-bot' : ''}${m.isPlayer ? ' from-player' : ''}${m.deletedAt ? ' is-deleted' : ''}`, 'data-id': m.id },
    compact ? h('span', { class: 'msg-gutter' }, h('time', { title: fmtDateTime(m.at) }, fmtTime(m.at))) : avatar(m.avatar, m.author, 40),
    h('div', { class: 'msg-body' },
      compact ? null : h('div', { class: 'msg-head' },
        h('b', { class: 'msg-author' }, m.author),
        tag ? h('span', { class: `msg-tag${m.isPlayer ? ' player' : ''}` }, tag) : null,
        rolePill(m.role, m.roleColor, true),
        h('time', { class: 'msg-time', title: fmtDateTime(m.at) }, fmtDateTime(m.at))),
      m.replyTo ? h('div', { class: 'msg-reply' }, icon('reply'), original ? `${original.author}: ${String(original.text || original.parts?.[0] || '').slice(0, 90)}` : 'Oldingi xabar') : null,
      m.text ? h('div', { class: 'msg-text' }, richText(m.text, m.mentions, q)) : null,
      (m.parts || []).map(part => h('div', { class: 'msg-card' }, richText(part, m.mentions, q))),
      (m.embeds || []).map(e => h('div', { class: 'msg-card' },
        e.title ? h('div', { class: 'msg-line heading' }, highlight(e.title, q)) : null,
        e.text ? richText(e.text, m.mentions, q) : null,
        (e.fields || []).map(f => h('div', { class: 'msg-field' }, h('b', null, highlight(f.name, q)), richText(f.value, m.mentions, q))))),
      messageFiles(m),
      m.editedAt ? h('span', { class: 'msg-flag', title: fmtDateTime(m.editedAt) }, icon('pencil'), 'tahrirlangan') : null,
      m.deletedAt ? h('span', { class: 'msg-flag bad', title: fmtDateTime(m.deletedAt) }, icon('trash'), "Discord'da o'chirilgan") : null));
}

export async function pageTicket(ctx) {
  const id = ctx.params[0];
  const first = await api(`/api/tickets/${id}`);
  if (!first) return ctx.notFound('Chipta topilmadi yoki sizda ruxsat yo\'q.');
  let ticket = first.ticket;
  let seq = first.seq;
  let text = '';
  const messages = new Map(first.messages.map(m => [m.id, m]));
  const listEl = h('div', { class: 'transcript', role: 'log', 'aria-label': 'Yozishma' });
  const headBox = h('div');
  const followBtn = h('button', { class: 'btn small follow-btn', type: 'button', hidden: true, onclick: () => { scrollBottom(); followBtn.hidden = true; } }, icon('down'), 'Yangi xabarlar');
  const nearBottom = () => window.innerHeight + window.scrollY > document.documentElement.scrollHeight - 160;
  const scrollBottom = () => window.scrollTo(0, document.documentElement.scrollHeight);
  document.title = `${ticket.nickname || 'Chipta'} · Chiptalar Tarixi`;

  function renderHead() {
    const t = ticket;
    const duration = (t.closedAt || Date.now()) - t.openedAt;
    replaceKids(headBox, h('section', { class: 'hero-card' },
      h('div', { class: 'hero-inner' },
        h('span', { class: 'hero-skin small' }, skinImg(t, 'bust', 256)),
        h('div', { class: 'grow' },
          h('div', { class: 'eyebrow' }, kitIcon(t.kit, t.kitName), t.kind === 'high' ? 'Yuqori test chiptasi' : 'Oddiy test chiptasi'),
          h('h1', { class: 'hero-name' }, t.playerId ? h('a', { href: `#/players/${t.playerId}` }, t.nickname || "O'yinchi") : (t.nickname || "O'yinchi")),
          h('div', { class: 'profile-meta' },
            resultBadge(t),
            t.kind === 'high' ? h('span', { class: 'meta-item tiers' }, trophy(trophyFor(t.targetTier), 'tiny'), tierChip(t.currentTier), icon('chevron', 'ico arrow'), tierChip(t.targetTier)) : null,
            t.server ? h('span', { class: 'meta-item' }, icon('tag'), t.server) : null,
            h('span', { class: 'meta-item' }, icon('calendar'), fmtDateTime(t.openedAt)),
            h('span', { class: 'meta-item' }, icon('clock'), fmtDuration(duration)),
            h('span', { class: 'meta-item' }, icon('chat'), `${fmtNum(t.messages)} ta xabar`),
            t.images ? h('span', { class: 'meta-item' }, icon('image'), `${fmtNum(t.images)} ta rasm`) : null),
          h('div', { class: 'ticket-people' },
            t.tester ? h('span', { class: 'people-item' }, h('small', null, 'Tester'), personChip(t.tester)) : null,
            t.closedBy && t.closedBy.id !== t.tester?.id ? h('span', { class: 'people-item' }, h('small', null, 'Yopgan'), personChip(t.closedBy)) : null,
            !t.tester && t.staff?.length ? h('span', { class: 'people-item' }, h('small', null, 'Xodimlar'), t.staff.map(p => personChip(p))) : null)))));
  }
  function renderMessages() {
    const ordered = [...messages.values()].sort((a, b) => a.at - b.at || (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
    const needle = text.toLowerCase();
    const visible = needle
      ? ordered.filter(m => [m.text, m.author, ...(m.parts || []), ...(m.embeds || []).flatMap(e => [e.title, e.text])].some(v => String(v || '').toLowerCase().includes(needle)))
      : ordered;
    const nodes = [];
    let previous = null;
    for (const m of visible) {
      nodes.push(messageNode(m, ticket, needle ? null : previous, messages, text));
      previous = m;
    }
    replaceKids(listEl, nodes.length ? nodes : empty(needle ? 'Bu so\'z yozishmada topilmadi.' : 'Hali xabar yo\'q.', 'chat'));
  }
  renderHead();
  renderMessages();
  async function poll() {
    if (ticket.closedAt) return;
    const data = await api(`/api/tickets/${id}?since=${seq}`);
    if (!data) return;
    const stayDown = nearBottom();
    let fresh = false;
    for (const m of data.messages) {
      if (!messages.has(m.id)) fresh = true;
      messages.set(m.id, m);
    }
    seq = data.seq;
    ticket = data.ticket;
    renderHead();
    if (data.messages.length) {
      renderMessages();
      if (fresh) {
        sfx('msg');
        if (stayDown) scrollBottom();
        else followBtn.hidden = false;
      }
    }
    if (ticket.closedAt) toast('Chipta yopildi.');
  }
  if (!ticket.closedAt) ctx.every(3000, poll);
  return [
    h('a', { class: 'back', href: `#/tickets?kind=${ticket.kind}${ticket.kit ? `&kit=${ticket.kit}` : ''}` }, '← Chiptalar Tarixi'),
    headBox,
    h('section', { class: 'card transcript-card' },
      h('div', { class: 'card-head' },
        h('h2', null, ticket.closedAt ? 'Yozishma' : h('span', { class: 'with-dot' }, h('span', { class: 'live-dot' }), 'Jonli yozishma')),
        searchBar({ id: 'ticket-search', placeholder: 'Yozishmadan qidirish…', oninput: value => { text = value; renderMessages(); } })),
      listEl),
    followBtn
  ];
}
