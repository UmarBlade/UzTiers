// O'yinchilar ro'yxati va o'yinchi profili.
import { S, h, replaceKids, api, send, runAction, can, allowedKits, debounce, highlight, fmtDate, fmtDateTime, fmtDuration, fmtAgo, fmtNum, TIERS, TIER_VALUES, KIT_NAMES, KIT_ICON } from '../core.js';
import { sfx } from '../look.js';
import { catBar, staffRoleDialog, icon, card, empty, select, searchBar, pager, tierChip, tierClass, kitIcon, kitOrb, trophy, trophyFor, avatar, person, personChip, rolePill, roleChips, skinImg, actionBtn, openDialog, kitField, eventRow, eventList, handleActionError, toast, segmented } from '../ui.js';

const PLAYERS_PER_PAGE = 30;

function statusChips(p) {
  return [
    p.restricted ? h('span', { class: 'mini-chip danger' }, icon('ban'), 'Cheklangan') : null,
    p.muted ? h('span', { class: 'mini-chip' }, icon('muted'), 'Mute') : null,
    p.retired ? h('span', { class: 'mini-chip' }, icon('moon'), 'Retired') : null,
    p.onCooldown ? h('span', { class: 'mini-chip', title: 'Test cooldownida' }, icon('clock')) : null
  ];
}

function playerRow(p, position, q) {
  return h('a', { class: 'prow', href: `#/players/${p.id}` },
    h('span', { class: 'prow-rank' }, h('span', { class: 'rank-tag' }, position)),
    h('span', { class: 'prow-skin' }, skinImg(p, 'bust')),
    h('span', { class: 'prow-main' }, h('span', { class: 'prow-name' }, h('span', { class: 'nick' }, highlight(p.nickname, q)), statusChips(p))),
    h('span', { class: 'prow-points' }, h('b', null, p.points), h('small', null, 'ball')),
    h('span', { class: 'prow-orbs' }, S.me.kits.map(k => kitOrb(k.kit, p.tiers[k.kit]))));
}

export async function pagePlayers(ctx) {
  const get = name => ctx.query.get(name) || '';
  const filters = { q: get('q'), kit: get('kit'), tier: get('tier'), tierMode: get('tierMode'), status: get('status'), role: get('role'), sort: get('sort') };
  let page = Number(get('page')) || 1;
  let token = 0;
  if (!S.roles) S.roles = await api('/api/roles');
  document.title = "O'yinchilar · UzTiers Panel";

  const subline = h('div', { class: 'sub' });
  const bodyBox = h('div', { class: 'players-body' });
  const clearBox = h('span');
  const railBox = h('div');
  let railSignature = '';

  function syncUrl() {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
    if (page > 1) p.set('page', page);
    history.replaceState(null, '', `#/players${p.toString() ? `?${p}` : ''}`);
  }
  async function load({ scroll = false } = {}) {
    const run = ++token;
    const params = new URLSearchParams({ page, limit: PLAYERS_PER_PAGE });
    for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
    const d = await api(`/api/players?${params}`);
    if (run !== token || !d) return;
    syncUrl();
    page = d.page;
    const active = Object.entries(filters).some(([k, v]) => v && k !== 'sort');
    replaceKids(clearBox, active ? h('button', { class: 'btn', type: 'button', onclick: () => {
      Object.keys(filters).forEach(k => { filters[k] = ''; });
      page = 1;
      replaceKids(root, ...build());
      load();
    } }, icon('close'), 'Tozalash') : null);
    subline.textContent = `${fmtNum(d.total)} ta o'yinchi${filters.q ? ` · qidiruv: ${filters.q}` : ''}${filters.kit ? ` · ${KIT_NAMES[filters.kit]}` : ''}`;
    renderRail(d.kitTotals);
    const list = h('div', { class: 'plist' },
      h('div', { class: 'plist-head' },
        h('span', null, '#'),
        h('span', null),
        h('span', null, "O'yinchi"),
        h('span', { class: 'ta-r' }, 'Ball'),
        h('span', { class: 'prow-orbs head' }, S.me.kits.map(k => h('button', {
          class: 'orb-head',
          type: 'button',
          title: `${k.name} bo'yicha filtr`,
          onclick: () => setFilter('kit', filters.kit === k.kit ? '' : k.kit)
        }, h('img', { src: KIT_ICON(k.kit), alt: k.name, width: 24, height: 24 }))))),
      d.items.map((p, i) => playerRow(p, d.start + i + 1, filters.q)));
    replaceKids(bodyBox,
      d.items.length ? list : empty("Hech narsa topilmadi. Filtrlarni o'zgartirib ko'ring."),
      d.pages > 1 ? pager(d.page, d.pages, next => { page = next; load({ scroll: true }); }) : null);
    if (scroll) window.scrollTo(0, 0);
  }
  const setFilter = (name, value) => {
    filters[name] = value;
    page = 1;
    load();
  };
  const searchLater = debounce(value => setFilter('q', value), 220);

  function renderRail(totals) {
    if (S.me.kits.length < 2) return;
    const signature = JSON.stringify([totals, filters.kit]);
    if (signature === railSignature) return;
    railSignature = signature;
    replaceKids(railBox, catBar([
      { value: '', text: 'Hammasi', icon: 'players' },
      ...S.me.kits.map(k => ({ value: k.kit, text: k.name, img: KIT_ICON(k.kit), count: totals?.[k.kit] || 0 }))
    ], filters.kit, value => setFilter('kit', value), { compact: true, label: 'Kit tanlash' }));
  }
  function build() {
    return [
      h('div', { class: 'page-head' },
        h('div', { class: 'grow' }, h('h1', null, "O'yinchilar"), subline),
        searchBar({ id: 'players-search', placeholder: "Nik yoki Discord ID bo'yicha qidirish…", value: filters.q, oninput: searchLater, cls: 'wide' })),
      railBox,
      h('div', { class: 'controls' },
        select('pf-tier', 'Daraja', [['', 'Barcha darajalar'], ...TIERS.map(t => [t, t])], filters.tier, e => { setFilter('tier', e.target.value); }),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: filters.tierMode === 'min', onchange: e => setFilter('tierMode', e.target.checked ? 'min' : '') }), 'va yuqori'),
        select('pf-status', 'Holat', [['', 'Har qanday holat'], ['tiered', 'Darajasi borlar'], ['untiered', "Darajasi yo'qlar"], ['restricted', 'Cheklanganlar'], ['muted', 'Mute qilinganlar'], ['retired', 'Retired'], ['cooldown', 'Cooldownda']], filters.status, e => setFilter('status', e.target.value)),
        select('pf-role', 'Rol', [['', 'Barcha rollar'], ...(S.roles?.roles || []).map(r => [r.name, `${r.name} (${r.members})`])], filters.role, e => setFilter('role', e.target.value)),
        select('pf-sort', 'Tartib', [['', "Ball bo'yicha"], ['nick', "Nik bo'yicha"], ['recent', "Oxirgi test bo'yicha"]], filters.sort, e => setFilter('sort', e.target.value)),
        clearBox),
      bodyBox
    ];
  }
  const root = h('div', { class: 'stack' }, build());
  await load();
  return [root];
}

// ---------- o'yinchi profili ----------
function siteWarning(k, siteChecked) {
  if (!siteChecked || !k.onSite) return null;
  if (k.tier && k.siteTier && k.tier !== k.siteTier) return `Saytda boshqacha: ${k.siteTier}`;
  if (k.tier && !k.siteTier) return "Saytda bu daraja yo'q";
  if (!k.tier && k.siteTier) return `Saytda bor (${k.siteTier}), Discordda yo'q`;
  return null;
}

function tierButtons(d, k, base, name) {
  const control = k.tierControl;
  const out = [];
  if (!can('setTier', k.kit)) return out;
  if (control?.limited) {
    if (control.self) return [h('div', { class: 'note' }, "O'z darajangizni o'zgartira olmaysiz.")];
    if (control.lockedUntil) return [h('div', { class: 'note lock-note' }, icon('lock'), `Keyingi o'zgarish ${fmtDuration(control.lockedUntil - Date.now())}dan keyin (kuniga bir marta).`)];
    const confirm = (action, tier, word, danger) => openDialog({
      title: `${name} · ${k.name}`,
      description: `${k.tier || "Darajasi yo'q"} → ${tier}. Administrator bir o'yinchining darajasini kuniga bir marta, faqat bir qadamga o'zgartira oladi.`,
      submitLabel: word,
      danger,
      onSubmit: () => runAction(action, { ...base, tier })
    });
    if (control.up) out.push(actionBtn(control.up, () => confirm('setTier', control.up, `${control.up} berish`, false), 'step-up', 'up'));
    if (control.down && k.tier) out.push(actionBtn(control.down, () => confirm('demote', control.down, `${control.down} ga tushirish`, true), 'step-down', 'down'));
    return out;
  }
  out.push(actionBtn('Daraja berish', () => openDialog({
    title: `${name} · ${k.name}`,
    fields: [{ name: 'tier', label: 'Yangi daraja', type: 'select', required: true, value: k.tier || 'LT5', options: TIERS.map(t => ({ value: t, label: t })) }],
    submitLabel: 'Berish',
    onSubmit: v => runAction('setTier', { ...base, tier: v.tier })
  }), '', 'swap'));
  if (k.tier && can('demote', k.kit)) {
    const lower = TIERS.slice(TIERS.indexOf(k.tier) + 1);
    if (lower.length) out.push(actionBtn('Pasaytirish', () => openDialog({
      title: `${name} · ${k.name}: pasaytirish`,
      description: `Hozirgi daraja: ${k.tier}`,
      fields: [{ name: 'tier', label: 'Yangi daraja', type: 'select', required: true, options: lower.map(t => ({ value: t, label: t })) }],
      submitLabel: 'Pasaytirish',
      danger: true,
      onSubmit: v => runAction('demote', { ...base, tier: v.tier })
    }), '', 'down'));
  }
  return out;
}

// Tugmalar faqat ruxsat bo'lsa ko'rinadi; server ham alohida tekshiradi.
function kitActions(d, k) {
  if (d.protected) return null;
  const name = d.nickname || d.id;
  const base = { kit: k.kit, targetId: d.id };
  const buttons = tierButtons(d, k, base, name);
  if (k.tier && can('deleteTier', k.kit)) {
    buttons.push(actionBtn("O'chirish", () => openDialog({
      title: "Darajani o'chirish",
      description: `${name} ning ${k.name} dagi ${k.tier} darajasi o'chiriladi. Sayt va Discord ham yangilanadi.`,
      submitLabel: "O'chirish",
      danger: true,
      onSubmit: () => runAction('deleteTier', base)
    }), 'ghost-danger', 'trash'));
  }
  if (can('setCooldown', k.kit)) {
    buttons.push(actionBtn('Cooldown', () => openDialog({
      title: `${name} · ${k.name}: cooldown`,
      fields: [
        { name: 'category', label: 'Kategoriya', type: 'select', required: true, value: 'test', options: S.me.options.cooldownCategories.map(c => ({ value: c, label: c })) },
        { name: 'days', label: 'Kunlar', type: 'number', min: 1, max: 365, value: 20, required: true }
      ],
      submitLabel: 'Berish',
      onSubmit: v => runAction('setCooldown', { ...base, category: v.category, days: Number(v.days) })
    }), '', 'clock'));
  }
  if ((k.cooldownMs || k.highCooldownMs) && can('resetCooldown', k.kit)) {
    buttons.push(actionBtn('Tiklash', () => openDialog({
      title: `${name} · ${k.name}: cooldownni tiklash`,
      fields: [{ name: 'category', label: 'Kategoriya', type: 'select', required: true, value: k.cooldownMs ? 'test' : 'high_test', options: S.me.options.cooldownCategories.map(c => ({ value: c, label: c })) }],
      submitLabel: 'Tiklash',
      onSubmit: v => runAction('resetCooldown', { ...base, category: v.category })
    })));
  }
  const retiredAction = k.retired ? 'unretired' : 'retired';
  if (k.inGuild && can(retiredAction, k.kit)) {
    buttons.push(actionBtn(k.retired ? 'Retired ni olish' : 'Retired', () => openDialog({
      title: k.retired ? 'Retired ni olib tashlash' : 'Retired berish',
      description: k.retired ? `${name} dan ${k.name} serverida Retired roli olinadi. Bot saytdagi darajasini LT3 qilib yozadi.` : `${name} ga ${k.name} serverida Retired roli beriladi.`,
      submitLabel: 'Tasdiqlash',
      onSubmit: () => runAction(retiredAction, base)
    }), '', 'moon'));
  }
  if (k.roleControl) buttons.push(actionBtn('Rollar', () => staffRoleDialog(name, d.kits.filter(x => x.roleControl), d.id, k.kit), '', 'badge'));
  return buttons.length ? h('div', { class: 'card-actions' }, buttons) : null;
}

// Mute sababi: qaysi serverda, nima uchun, kim bergan va qancha qolgan.
function muteSummary(muted) {
  return h('div', { class: 'mute-list' }, muted.map(k => h('div', { class: `mute-item` },
    kitIcon(k.kit, k.name),
    h('div', { class: 'grow' },
      h('div', { class: 'mute-reason' }, k.mute?.reason ? k.mute.reason : "Sabab ko'rsatilmagan"),
      h('div', { class: 'note' },
        k.name,
        k.mute?.by ? ` · ${k.mute.by.name}` : '',
        k.mute?.at ? ` · ${fmtDateTime(k.mute.at)}` : '',
        ` · yana ${fmtDuration(k.muteUntil - Date.now())}`)))));
}

function globalActions(d) {
  const name = d.nickname || d.id;
  const buttons = [];
  if (d.protected) return null;
  if (d.restriction) {
    if (allowedKits('unrestrict').length) buttons.push(actionBtn('Cheklovni olib tashlash', () => openDialog({
      title: 'Cheklovni olib tashlash',
      description: `${name} ning cheklovi olib tashlanadi va saqlangan darajalari qaytariladi.`,
      fields: [kitField('unrestrict'), { name: 'reason', label: 'Sabab', type: 'textarea', required: true }],
      submitLabel: 'Olib tashlash',
      onSubmit: v => runAction('unrestrict', { targetId: d.id, kit: v.kit, reason: v.reason })
    }), '', 'shield-check'));
  } else if (allowedKits('restrict').length && d.id !== S.me.id) {
    buttons.push(actionBtn('Cheklash', () => restrictDialog(d), 'danger', 'ban'));
  }
  const muted = d.kits.filter(k => k.muteUntil);
  const muteKits = allowedKits('mute');
  if (muteKits.length && d.id !== S.me.id) {
    const labels = { 10: '10 daqiqa', 60: '1 soat', 360: '6 soat', 1440: '1 kun', 10080: '7 kun', 40320: '28 kun' };
    buttons.push(actionBtn('Mute', () => openDialog({
      title: `${name} ni mute qilish`,
      description: 'Foydalanuvchi tanlangan vaqt davomida Discordda yoza olmaydi.',
      fields: [
        { name: 'kit', label: 'Qayerda', type: 'select', required: true, value: muteKits.length > 1 ? 'all' : muteKits[0].kit, options: [...(muteKits.length > 1 ? [{ value: 'all', label: 'Men boshqaradigan barcha serverlar' }] : []), ...muteKits.map(k => ({ value: k.kit, label: k.name }))] },
        { name: 'minutes', label: 'Muddat', type: 'select', required: true, value: '60', options: S.me.options.muteMinutes.map(m => ({ value: String(m), label: labels[m] || `${m} daqiqa` })) },
        { name: 'reason', label: 'Sabab', type: 'textarea', required: true, placeholder: 'Masalan: chatda haqorat' }
      ],
      submitLabel: 'Mute qilish',
      danger: true,
      onSubmit: v => runAction('mute', { targetId: d.id, kit: v.kit, minutes: Number(v.minutes), reason: v.reason })
    }), '', 'muted'));
    const removable = muted.filter(k => muteKits.some(m => m.kit === k.kit));
    if (removable.length) buttons.push(actionBtn('Mute ni olish', () => openDialog({
      title: 'Mute ni olib tashlash',
      body: muteSummary(removable),
      fields: [
        { name: 'kit', label: 'Qayerda', type: 'select', required: true, value: removable.length > 1 ? 'all' : removable[0].kit, options: [...(removable.length > 1 ? [{ value: 'all', label: 'Mute bor barcha serverlarda' }] : []), ...removable.map(k => ({ value: k.kit, label: k.name }))] },
        { name: 'reason', label: 'Olib tashlash sababi (ixtiyoriy)', type: 'textarea' }
      ],
      submitLabel: 'Olib tashlash',
      onSubmit: v => runAction('unmute', { targetId: d.id, kit: v.kit, reason: v.reason })
    }), '', 'sound'));
  }
  if (allowedKits('changeNickname').length) {
    buttons.push(actionBtn("Nikni o'zgartirish", () => openDialog({
      title: "Nikni o'zgartirish",
      description: "Nik barcha serverlarda va saytda yangilanadi, darajalar yangi nikka o'tadi.",
      fields: [kitField('changeNickname'), { name: 'nickname', label: 'Yangi nik', required: true, max: 16, value: d.nickname || '' }],
      submitLabel: "O'zgartirish",
      onSubmit: v => runAction('changeNickname', { targetId: d.id, kit: v.kit, nickname: v.nickname })
    }), '', 'pencil'));
  }
  return buttons.length ? h('div', { class: 'head-actions' }, buttons) : null;
}

// Cheklanganlar sahifasi ham shu oynadan foydalanadi.
export function restrictDialog(d, onDone) {
  const name = d.nickname || d.id;
  return openDialog({
    title: `${name} ni cheklash`,
    description: "O'yinchi barcha serverlarda testdan cheklanadi va darajalari vaqtincha olinadi.",
    body: h('div', { class: 'restrict-preview' }, skinImg(d, 'bust', 128), h('div', null, h('b', null, name), d.points !== undefined ? h('div', { class: 'note' }, `${d.points} ball`) : null)),
    fields: [
      kitField('restrict'),
      { name: 'months', label: 'Muddat', type: 'select', required: true, options: S.me.options.restrictMonths.map(m => ({ value: String(m), label: `${m} oy` })) },
      { name: 'reason', label: 'Sabab', type: 'textarea', required: true, placeholder: 'Masalan: cheat' }
    ],
    submitLabel: 'Cheklash',
    danger: true,
    onSubmit: v => runAction('restrict', { targetId: d.id, kit: v.kit, months: Number(v.months), reason: v.reason }),
    onDone
  });
}

const HISTORY_GROUPS = {
  tests: ['test', 'high_win', 'high_loss'],
  tiers: ['tier_set', 'tier_demote', 'tier_delete'],
  punish: ['restrict', 'unrestrict', 'mute', 'unmute'],
  other: null
};
function historySection(events) {
  let group = '';
  let kit = '';
  let text = '';
  const box = h('div');
  const counter = h('span', { class: 'hint' });
  const known = Object.values(HISTORY_GROUPS).filter(Boolean).flat();
  const render = () => {
    const rows = events.filter(e => {
      if (kit && e.kit !== kit) return false;
      if (group === 'other' && known.includes(e.type)) return false;
      if (group && group !== 'other' && !HISTORY_GROUPS[group].includes(e.type)) return false;
      if (text && ![e.note, e.newValue, e.oldValue, e.actorName, e.targetName].some(v => String(v || '').toLowerCase().includes(text))) return false;
      return true;
    });
    counter.textContent = `${rows.length} ta yozuv`;
    replaceKids(box, eventList(rows, "Bu filtr bo'yicha yozuv yo'q.", { q: text }));
  };
  render();
  const kitsInHistory = S.me.kits.filter(k => events.some(e => e.kit === k.kit));
  return h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', null, 'Tarix'), counter),
    h('div', { class: 'controls history-filters' },
      segmented([['', 'Hammasi'], ['tests', 'Testlar'], ['tiers', 'Darajalar'], ['punish', 'Jazolar'], ['other', 'Boshqa']], '', value => { group = value; render(); }, { small: true, label: 'Yozuv turi' }),
      select('hist-kit', 'Kit', [['', 'Barcha kitlar'], ...kitsInHistory.map(k => [k.kit, k.name])], '', e => { kit = e.target.value; render(); }),
      searchBar({ id: 'hist-search', placeholder: 'Tarixdan qidirish…', oninput: value => { text = value.toLowerCase(); render(); }, cls: 'grow' })),
    box);
}

// Faqat xodimlar ko'radigan izohlar.
function notesSection(d) {
  const listBox = h('div', { class: 'notes' });
  const notes = [...d.notes];
  const render = () => {
    replaceKids(listBox, notes.length ? notes.map(n => h('div', { class: 'note-item' },
      avatar(n.author?.avatar, n.author?.name, 34),
      h('div', { class: 'grow' },
        h('div', { class: 'note-head' }, h('b', null, n.author?.name || 'Xodim'), rolePill(n.author?.role, n.author?.roleColor, true), h('time', { title: fmtDateTime(n.createdAt) }, fmtAgo(n.createdAt))),
        h('div', { class: 'note-body' }, n.body)),
      n.canDelete ? h('button', { class: 'icon-btn danger', type: 'button', 'aria-label': "Izohni o'chirish", title: "O'chirish", onclick: async () => {
        try {
          await send('DELETE', `/api/notes/${n.id}`, {});
          notes.splice(notes.indexOf(n), 1);
                    render();
        } catch (err) { handleActionError(err); }
      } }, icon('trash')) : null)) : empty("Hali izoh yo'q. Bu izohlarni o'yinchilar ko'rmaydi.", 'note'));
  };
  render();
  const input = h('textarea', { class: 'field', rows: 2, maxlength: S.me.noteMaxLength, placeholder: "Izoh yozing: masalan, keyingi testda diqqat qiling…", 'aria-label': 'Izoh' });
  const addBtn = h('button', { class: 'btn primary', type: 'submit' }, icon('plus'), "Qo'shish");
  return h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', null, 'Xodimlar izohlari'), h('span', { class: 'hint' }, "faqat xodimlar ko'radi")),
    h('form', { class: 'note-form', onsubmit: async e => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      addBtn.disabled = true;
      try {
        const data = await send('POST', `/api/players/${d.id}/notes`, { text });
        notes.unshift(data.note);
        input.value = '';
        sfx('ok');
        render();
      } catch (err) { handleActionError(err); } finally { addBtn.disabled = false; }
    } }, input, addBtn),
    listBox);
}

export async function pagePlayer(ctx) {
  const d = await api(`/api/players/${ctx.params[0]}`);
  if (!d) return ctx.notFound("O'yinchi topilmadi yoki sizning serveringizda emas.");
  document.title = `${d.nickname || d.id} · UzTiers Panel`;
  const copyBtn = h('button', { class: 'copy-btn', type: 'button', onclick: async () => {
    try { await navigator.clipboard.writeText(d.id); toast('ID nusxalandi.'); } catch { toast('Nusxalanmadi.', 'bad'); }
  } }, icon('copy'), d.id);
  const muted = d.kits.filter(k => k.muteUntil);
  return [
    h('a', { class: 'back', href: '#/players' }, "← O'yinchilar"),
    h('section', { class: 'hero-card' },
      h('div', { class: 'hero-inner' },
        h('span', { class: 'hero-skin' }, skinImg(d, 'bust', 256)),
        h('div', { class: 'grow' },
          h('h1', { class: 'hero-name' }, d.nickname || 'Niksiz foydalanuvchi'),
          h('div', { class: 'hero-rank' },
            d.place ? h('span', { class: 'rank-tag big' }, `${d.place}.`) : null,
            h('span', { class: 'hero-overall' }, 'OVERALL'),
            h('span', { class: 'hero-points' }, `${d.points} ball`)),
          h('div', { class: 'profile-meta' },
            d.staffRole ? h('a', { href: `#/staff/${d.id}` }, rolePill(d.staffRole, d.staffRoleColor)) : null,
            d.restriction ? h('span', { class: 'mini-chip danger' }, icon('ban'), 'Cheklangan') : null,
            muted.length ? h('span', { class: 'mini-chip' }, icon('muted'), `Mute: ${muted.map(k => k.name).join(', ')}`) : null,
            d.username ? h('span', { class: 'meta-item' }, icon('at'), d.username) : null,
            d.verifiedAt ? h('span', { class: 'meta-item' }, icon('check'), `Tasdiqlangan: ${fmtDate(d.verifiedAt)}`) : null,
            copyBtn),
          globalActions(d)))),
    muted.length ? h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, 'Mute sabablari')), muteSummary(muted)) : null,
    d.restriction ? h('section', { class: 'card restriction' },
      h('div', { class: 'card-head' }, h('h2', null, 'Cheklov'), h('span', { class: 'hint' }, `tugashiga ${fmtDuration(d.restriction.endsAt - Date.now())}`)),
      h('dl', { class: 'kv' },
        h('dt', null, 'Sabab'), h('dd', null, d.restriction.reason || '—'),
        h('dt', null, 'Kim berdi'), h('dd', null, d.restriction.setter?.name || '—'),
        h('dt', null, 'Boshlangan'), h('dd', null, fmtDate(d.restriction.setAt)),
        h('dt', null, 'Tugaydi'), h('dd', null, fmtDate(d.restriction.endsAt))),
      d.restriction.savedTiers.length ? h('p', { class: 'note' }, 'Cheklovdan keyin qaytadi: ', d.restriction.savedTiers.map(t => `${KIT_NAMES[t.kit] || t.kit} ${t.tier}`).join(', ')) : null) : null,
    h('section', { 'aria-label': "Kitlar bo'yicha darajalar", class: 'tier-grid' }, d.kits.map(k => {
      const warning = siteWarning(k, d.siteChecked);
      return h('div', { class: `tier-tile${k.tier ? ` has ${tierClass(k.tier)}` : ' none'}` },
        h('div', { class: 'tier-tile-top' },
          h('img', { class: 'tier-tile-ico', src: KIT_ICON(k.kit), alt: '', draggable: 'false' }),
          h('span', { class: 'tier-tile-kit' }, k.name),
          h('span', { class: 'tier-tile-tier' }, k.tier || '—'),
          trophy(trophyFor(k.tier), 'tier-tile-trophy')),
        h('dl', { class: 'kv' },
          h('dt', null, 'Oxirgi test'), h('dd', null, fmtDate(k.lastTest)),
          h('dt', null, 'Test cooldown'), h('dd', null, k.cooldownMs ? fmtDuration(k.cooldownMs) : "yo'q"),
          h('dt', null, 'Yuqori test'), h('dd', null, k.highCooldownMs ? fmtDuration(k.highCooldownMs) : "yo'q"),
          k.muteUntil ? [h('dt', null, 'Mute tugaydi'), h('dd', null, fmtDateTime(k.muteUntil))] : null),
        k.retired ? h('div', { class: 'note' }, 'Retired') : null,
        !k.inGuild ? h('div', { class: 'note' }, 'Bu serverda emas') : null,
        warning ? h('div', { class: 'warn-line' }, `⚠ ${warning}`) : null,
        roleChips(k.roles),
        k.inGuild ? kitActions(d, k) : null);
    })),
    notesSection(d),
    historySection(d.events)
  ];
}
