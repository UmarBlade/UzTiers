// Cheklanganlar: katta skinli kartalar va batafsil oyna.
import { S, h, replaceKids, api, debounce, highlight, allowedKits, runAction, fmtDate, fmtDuration, fmtNum } from '../core.js';
import { icon, empty, searchBar, catBar, pager, avatar, rolePill, skinImg, kitOrb, openDialog, kitField, toast } from '../ui.js';
import { restrictDialog } from './players.js';

// O'yinchi qidirib tanlash: yozilgan harflar sariq bilan belgilanadi.
function playerPicker({ placeholder, onPick }) {
  const results = h('div', { class: 'picker-results', hidden: true, role: 'listbox' });
  let items = [];
  let active = -1;
  let token = 0;
  let query = '';
  const paint = () => {
    [...results.children].forEach((el, i) => el.classList.toggle('active', i === active));
    results.children[active]?.scrollIntoView({ block: 'nearest' });
  };
  const pick = p => {
    results.hidden = true;
    input.value = '';
    onPick(p);
  };
  const search = debounce(async value => {
    query = value;
    if (!value) { results.hidden = true; return; }
    const run = ++token;
    const data = await api(`/api/search?q=${encodeURIComponent(value)}`).catch(() => null);
    if (run !== token || !data) return;
    items = data.players;
    active = items.length ? 0 : -1;
    replaceKids(results, items.length ? items.map(p => h('button', { class: 'picker-row', type: 'button', role: 'option', onclick: () => pick(p) },
      h('span', { class: 'picker-skin' }, skinImg(p, 'bust')),
      h('span', { class: 'picker-name' }, highlight(p.nickname, query)),
      p.restricted ? h('span', { class: 'mini-chip danger' }, icon('ban'), 'Cheklangan') : null,
      h('span', { class: 'picker-rank' }, `#${p.place}`))) : h('div', { class: 'picker-empty' }, 'Hech kim topilmadi.'));
    results.hidden = false;
    paint();
  }, 160);
  const input = h('input', { type: 'search', placeholder, 'aria-label': placeholder, autocomplete: 'off', oninput: e => search(e.target.value.trim()), onkeydown: e => {
    if (results.hidden || !items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % items.length; paint(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + items.length) % items.length; paint(); }
    if (e.key === 'Enter' && items[active]) { e.preventDefault(); pick(items[active]); }
    if (e.key === 'Escape') results.hidden = true;
  } });
  const wrap = h('div', { class: 'picker' }, h('div', { class: 'searchbar' }, icon('search', 'ico search-ico'), input), results);
  document.addEventListener('pointerdown', e => { if (!wrap.contains(e.target)) results.hidden = true; });
  return wrap;
}

function restrictionCard(item, onOpen, q) {
  return h('button', { class: `rcard${item.active ? '' : ' ended'}`, type: 'button', onclick: () => onOpen(item) },
    h('span', { class: 'rcard-stage' },
      h('span', { class: 'rcard-skin' }, skinImg(item, 'full')),
      item.active ? h('span', { class: 'rcard-time' }, icon('clock'), fmtDuration(item.endsAt - Date.now())) : h('span', { class: 'rcard-time' }, 'Tugagan')),
    h('span', { class: 'rcard-body' },
      h('b', { class: 'rcard-nick' }, highlight(item.nickname, q)),
      h('span', { class: 'rcard-reason' }, icon('ban'), h('span', null, item.reason ? highlight(item.reason, q) : 'Sabab yozilmagan')),
      h('span', { class: 'rcard-date' }, icon('calendar'), fmtDate(item.setAt))));
}

function openDetail(item, reload) {
  const elapsed = item.endsAt && item.setAt ? Math.min(Math.max((Date.now() - item.setAt) / (item.endsAt - item.setAt), 0), 1) : 1;
  const historyBox = h('div', { class: 'rdetail-history' }, h('span', { class: 'note' }, 'Tarix yuklanmoqda…'));
  const close = () => { dialog.close(); dialog.remove(); };
  const canLift = item.active && allowedKits('unrestrict').length > 0;
  const panel = h('div', { class: 'rdetail-panel' },
    h('button', { class: 'icon-btn rdetail-close', type: 'button', 'aria-label': 'Yopish', onclick: close }, icon('close')),
    h('div', { class: 'rdetail-stage' },
      h('span', { class: 'rdetail-skin' }, skinImg(item, 'full')),
      h('span', { class: `rstamp${item.active ? '' : ' off'}` }, item.active ? 'CHEKLANGAN' : 'TUGAGAN')),
    h('div', { class: 'rdetail-info' },
      h('h2', { class: 'rdetail-nick' }, item.nickname),
      h('blockquote', { class: 'rdetail-reason' }, item.reason || 'Sabab yozilmagan'),
      item.active ? h('div', null,
        h('div', { class: 'rdetail-time-head' }, h('span', null, `Tugashiga: ${fmtDuration(item.endsAt - Date.now())}`), h('span', { class: 'note' }, `${Math.round(elapsed * 100)}% o'tdi`)),
        h('div', { class: 'rdetail-track' }, h('i', { vars: { width: `${elapsed * 100}%` } }))) : null,
      h('dl', { class: 'rdetail-grid' },
        h('div', null, h('dt', null, 'Boshlangan'), h('dd', null, fmtDate(item.setAt))),
        item.endsAt ? h('div', null, h('dt', null, 'Tugaydi'), h('dd', null, fmtDate(item.endsAt))) : null,
        item.months ? h('div', null, h('dt', null, 'Muddat'), h('dd', null, item.months)) : null,
        h('div', null, h('dt', null, 'Kim chekladi'), h('dd', { class: 'rdetail-setter' }, item.setter ? [avatar(item.setter.avatar, item.setter.name, 26), h('span', null, item.setter.name), rolePill(item.setter.role, item.setter.roleColor, true)] : '—'))),
      item.savedTiers?.length ? h('div', null, h('div', { class: 'note' }, 'Cheklovdan keyin qaytadigan darajalar:'), h('div', { class: 'rdetail-orbs' }, item.savedTiers.map(t => kitOrb(t.kit, t.tier)))) : null,
      historyBox,
      h('div', { class: 'rdetail-actions' },
        h('a', { class: 'btn', href: `#/players/${item.id}`, onclick: close }, icon('players'), "Profilga o'tish"),
        canLift ? h('button', { class: 'btn primary', type: 'button', onclick: () => openDialog({
          title: 'Cheklovni olib tashlash',
          description: `${item.nickname} ning cheklovi olib tashlanadi va saqlangan darajalari qaytariladi.`,
          fields: [kitField('unrestrict'), { name: 'reason', label: 'Sabab', type: 'textarea', required: true }],
          submitLabel: 'Olib tashlash',
          onSubmit: v => runAction('unrestrict', { targetId: item.id, kit: v.kit, reason: v.reason }),
          onDone: () => { close(); reload(); }
        }) }, icon('shield-check'), 'Cheklovni olib tashlash') : null)));
  const dialog = h('dialog', { class: 'rdetail', 'aria-label': `${item.nickname} cheklovi` }, panel);
  dialog.addEventListener('cancel', () => dialog.remove());
  dialog.addEventListener('click', e => { if (e.target === dialog) close(); });
  document.body.append(dialog);
  dialog.showModal();

  // Oldingi cheklovlar va profil ma'lumoti.
  api(`/api/players/${item.id}`).then(d => {
    if (!d) { historyBox.remove(); return; }
    const past = d.events.filter(e => e.type === 'restrict');
    const lifted = d.events.filter(e => e.type === 'unrestrict');
    replaceKids(historyBox,
      h('div', { class: 'rdetail-stats' },
        h('span', null, h('b', null, past.length), ' ta cheklov tarixda'),
        h('span', null, h('b', null, lifted.length), ' marta olib tashlangan'),
        h('span', null, h('b', null, d.points), ' ball')));
  }).catch(() => historyBox.remove());
}

export async function pageRestricted(ctx) {
  const state = { status: ctx.query.get('status') === 'ended' ? 'ended' : 'active', q: ctx.query.get('q') || '', page: Number(ctx.query.get('page')) || 1 };
  let token = 0;
  document.title = 'Cheklanganlar · UzTiers Panel';
  const gridBox = h('div');
  const subline = h('div', { class: 'sub' });

  async function load() {
    const run = ++token;
    const params = new URLSearchParams({ status: state.status, page: state.page });
    if (state.q) params.set('q', state.q);
    const d = await api(`/api/restrictions?${params}`);
    if (run !== token || !d) return;
    state.page = d.page;
    const p = new URLSearchParams();
    if (state.status !== 'active') p.set('status', state.status);
    if (state.q) p.set('q', state.q);
    if (state.page > 1) p.set('page', state.page);
    history.replaceState(null, '', `#/restricted${p.toString() ? `?${p}` : ''}`);
    subline.textContent = state.status === 'active' ? `${fmtNum(d.total)} ta o'yinchi hozir cheklangan.` : `${fmtNum(d.total)} ta eski cheklov yozuvi.`;
    replaceKids(gridBox, d.items.length
      ? [h('div', { class: 'rgrid' }, d.items.map(item => restrictionCard(item, it => openDetail(it, load), state.q))),
         d.pages > 1 ? pager(d.page, d.pages, next => { state.page = next; load(); window.scrollTo(0, 0); }) : null]
      : empty(state.q ? "Bu qidiruv bo'yicha hech kim topilmadi." : (state.status === 'active' ? 'Hozir hech kim cheklanmagan.' : "Eski cheklovlar yo'q."), 'shield-check'));
  }
  await load();
  const canRestrict = allowedKits('restrict').length > 0;
  return [
    h('div', { class: 'page-head' },
      h('div', { class: 'grow' }, h('h1', null, 'Cheklanganlar'), subline),
      searchBar({ id: 'restricted-search', placeholder: "Ro'yxatdan qidirish: nik yoki sabab…", value: state.q, cls: 'wide', oninput: debounce(value => { state.q = value; state.page = 1; load(); }, 220) })),
    catBar([
      { value: 'active', text: 'Hozirgi', icon: 'ban' },
      { value: 'ended', text: 'Eski yozuvlar', icon: 'clock' }
    ], state.status, value => { state.status = value; state.page = 1; load(); }, { label: 'Holat' }),
    h('div', { class: 'controls' },
      canRestrict ? h('div', { class: 'restrict-find' }, playerPicker({
        placeholder: "Cheklash uchun o'yinchi qidiring…",
        onPick: async p => {
          const d = await api(`/api/players/${p.id}`).catch(() => null);
          if (!d) { toast("O'yinchi topilmadi.", 'bad'); return; }
          if (d.protected || d.id === S.me.id) { toast('Bu xodimni cheklay olmaysiz.', 'bad'); return; }
          if (d.restriction) { toast(`${d.nickname} allaqachon cheklangan.`, 'bad'); return; }
          restrictDialog(d, () => load());
        }
      })) : null),
    gridBox
  ];
}
