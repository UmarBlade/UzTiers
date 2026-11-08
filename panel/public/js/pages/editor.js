// Xabar muharriri: bot panellari (matn, rang, tugmalar), qo'shimcha panellar va Discord oynalari.
// O'ng tomonda Discord'dagi ko'rinishga yaqin jonli ko'rinish; saqlash va yuborish faqat Manager va undan yuqori.
import { S, h, replaceKids, send, fmtDateTime, fmtAgo, debounce } from '../core.js';
import { icon, empty, openDialog, toast, handleActionError, segmented } from '../ui.js';
import { kitHead, statePill } from './kit.js';
import { loadConfig, saveConfig, readOnlyNote } from './kitconfig.js';

export const PANEL_INFO = {
  verification: ['Tasdiqlash', 'Yangi a\'zo nikini yozib tasdiqlanadi', 'shield-check'],
  testEntry: ['Testga kirish', 'Navbatga kirish va yuqori test tugmalari', 'sword'],
  support: ['Yordam so\'rovi', 'Yordam va shikoyat chiptalari', 'chat'],
  testerApp: ['Tester arizasi', 'Tester bo\'lish uchun ariza', 'doc'],
  queue: ['Navbat', 'Navbat holati, o\'yinchilar va testerlar (jonli yangilanadi)', 'list']
};
export const MODAL_INFO = {
  verify: ['Tasdiqlash oynasi', '"Tasdiqlash" tugmasi bosilganda ochiladi'],
  server: ['Server oynasi', '"Navbatga kirish" bosilganda server so\'raladi'],
  complaint: ['Shikoyat oynasi', '"Shikoyat" tugmasi bosilganda ochiladi'],
  apply: ['Tester arizasi oynasi', '"Ariza topshirish" bosilganda ochiladi']
};
const FIELD_LABELS = {
  accent: 'Urg\'u rangi', title: 'Sarlavha', body: 'Asosiy matn', high: 'Yuqori test matni', cooldownLine: 'Cooldown qatori', button: 'Tugma nomi', highButton: 'Yuqori test tugmasi',
  details: 'Batafsil matn', helpButton: 'Yordam tugmasi', complaintButton: 'Shikoyat tugmasi', requirements: 'Talablar', info: 'Muhim ma\'lumot', showImage: 'Rasm ko\'rsatilsin',
  openAccent: 'Ochiq holat rangi', openTitle: 'Ochiq holat sarlavhasi', openBody: 'Ochiq holat matni', closedAccent: 'Yopiq holat rangi', closedTitle: 'Yopiq holat sarlavhasi', closedBody: 'Yopiq holat matni',
  joinButton: 'Kirish tugmasi', leaveButton: 'Chiqish tugmasi'
};
const FIELD_HINTS = {
  cooldownLine: '{days} kunlar soniga almashadi.',
  title: 'Discord emojisi: <:nomi:id> ko\'rinishida yozing.',
  high: 'Bo\'sh qoldirsangiz, bu bo\'lak ko\'rsatilmaydi.',
  body: '**qalin**, ### sarlavha, - ro\'yxat ishlaydi.'
};

// ---------- Discord ko'rinishi ----------
const INLINE = /<(a?):(\w+):(\d+)>|<@!?(\d+)>|<@&(\d+)>|<#(\d+)>|<t:(\d+)(?::[a-zA-Z])?>|\*\*(.+?)\*\*|__(.+?)__|`([^`]+)`|\*(.+?)\*|(https?:\/\/[^\s<]+)/g;
function dcInline(text) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[3]) out.push(h('img', { class: 'dc-emoji', src: `https://cdn.discordapp.com/emojis/${m[3]}.${m[1] ? 'gif' : 'webp'}?size=48`, alt: `:${m[2]}:`, title: `:${m[2]}:`, loading: 'lazy' }));
    else if (m[4]) out.push(h('span', { class: 'dc-mention' }, '@foydalanuvchi'));
    else if (m[5]) out.push(h('span', { class: 'dc-mention' }, '@rol'));
    else if (m[6]) out.push(h('span', { class: 'dc-mention' }, '#kanal'));
    else if (m[7]) out.push(h('span', { class: 'dc-time' }, fmtDateTime(Number(m[7]) * 1000)));
    else if (m[8]) out.push(h('strong', null, dcInline(m[8])));
    else if (m[9]) out.push(h('u', null, dcInline(m[9])));
    else if (m[10]) out.push(h('code', { class: 'dc-code' }, m[10]));
    else if (m[11]) out.push(h('em', null, dcInline(m[11])));
    else if (m[12]) out.push(h('span', { class: 'dc-link' }, m[12]));
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
function dcText(content) {
  return h('div', { class: 'dc-text' }, String(content || '').split('\n').map(line => {
    const head = /^(#{1,3})\s+(.*)$/.exec(line);
    if (head) return h('div', { class: `dc-h${head[1].length}` }, dcInline(head[2]));
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) return h('div', { class: 'dc-li' }, dcInline(bullet[1]));
    return h('div', { class: 'dc-line' }, line ? dcInline(line) : ' ');
  }));
}
const BUTTON_STYLES = { success: 'dc-btn success', primary: 'dc-btn primary', danger: 'dc-btn danger', link: 'dc-btn link', secondary: 'dc-btn secondary' };
// blocks: [{ type: 'text'|'separator'|'image'|'buttons', ... }]
export function discordMessage({ accent, blocks }) {
  return h('div', { class: 'dc-msg' },
    h('img', { class: 'dc-avatar', src: '/img/emblem.webp', alt: '', width: 40, height: 40 }),
    h('div', { class: 'dc-main' },
      h('div', { class: 'dc-head' }, h('b', { class: 'dc-name' }, 'UzTiers'), h('span', { class: 'dc-bot' }, 'BOT'), h('span', { class: 'dc-stamp' }, 'Bugun')),
      h('div', { class: 'dc-container', vars: accent ? { '--dc-accent': accent } : {} }, blocks.map(b => {
        if (b.type === 'text') return dcText(b.content);
        if (b.type === 'separator') return h('div', { class: `dc-sep${b.large ? ' large' : ''}${b.divider === false ? ' blank' : ''}` });
        if (b.type === 'image') {
          return b.url
            ? h('div', { class: 'dc-media' }, h('img', { src: b.url, alt: '', loading: 'lazy', onerror: e => { e.target.replaceWith(h('div', { class: 'dc-media-ph' }, icon('image'), 'Rasm faqat Discord CDN havolasi bo\'lsa ko\'rinadi')); } }))
            : h('div', { class: 'dc-media dc-media-ph' }, icon('image'), b.placeholder || 'rasm');
        }
        if (b.type === 'buttons') return h('div', { class: 'dc-buttons' }, b.items.map(it => h('span', { class: `${BUTTON_STYLES[it.style || 'link']}${it.disabled ? ' disabled' : ''}` }, it.label || 'Tugma', it.style === 'link' ? icon('open') : null)));
        return null;
      }))));
}
const sep = () => ({ type: 'separator' });
// Bot xabarlari qanday quriladi (bot.js dagi PANEL_BUILDERS bilan bir xil tartibda).
export function panelBlocks(id, look, cfg, variant = 'open') {
  const days = cfg.cooldowns?.test ?? 20;
  if (id === 'verification') {
    return [{ type: 'text', content: `### ${look.title}\n${look.body}` }, sep(), look.showImage ? { type: 'image', placeholder: 'Tasdiqlash rasmi (TasdiqlashUztiers.jpg)' } : null, look.showImage ? sep() : null, { type: 'buttons', items: [{ label: look.button, style: 'success' }] }].filter(Boolean);
  }
  if (id === 'testEntry') {
    return [{ type: 'text', content: `## ${look.title}\n${look.body}` }, sep(), look.high ? { type: 'text', content: look.high } : null, look.high ? sep() : null, { type: 'text', content: look.cooldownLine.replace(/\{days\}/g, String(days)) }, sep(), { type: 'buttons', items: [{ label: look.button, style: 'success' }, { label: look.highButton, style: 'primary' }] }].filter(Boolean);
  }
  if (id === 'support') {
    return [{ type: 'text', content: `### ${look.title}\n${look.body}` }, sep(), { type: 'text', content: look.details }, sep(), { type: 'buttons', items: [{ label: look.helpButton, style: 'primary' }, { label: look.complaintButton, style: 'danger' }] }];
  }
  if (id === 'testerApp') {
    return [{ type: 'text', content: `## ${look.title}\n${look.requirements}` }, sep(), { type: 'text', content: look.info }, sep(), { type: 'text', content: `Status: ${cfg.applicationOpen ? 'Ochiq <:yashil_nuqta:1512534180267823144>' : 'Yopiq <:kulrang_nuqta:1512534150081544282>'}` }, sep(), { type: 'buttons', items: [{ label: look.button, style: 'success', disabled: !cfg.applicationOpen }] }];
  }
  if (id === 'queue') {
    if (variant === 'closed') return [{ type: 'text', content: `### ${look.closedTitle}` }, { type: 'text', content: look.closedBody }, sep(), { type: 'text', content: 'Oxirgi test vaqti: <t:1794100000:F>' }];
    return [{ type: 'text', content: `### ${look.openTitle}\n${look.openBody}` }, sep(), { type: 'text', content: '**Navbat:**\n1. <@100000000000000001>\n2. <@100000000000000002>' }, sep(), { type: 'text', content: '**Aktiv Testerlar:**\n1. <@100000000000000003>' }, sep(), { type: 'buttons', items: [{ label: look.joinButton, style: 'primary' }, { label: look.leaveButton, style: 'danger' }] }];
  }
  return [];
}
const panelAccent = (id, look, variant) => (id === 'queue' ? (variant === 'closed' ? look.closedAccent : look.openAccent) : look.accent);

// Matn maydoni: belgi hisoblagichi bilan.
function textField({ label, value, max, multiline = false, hint = null, disabled, oninput, rows = 4 }) {
  const counter = h('span', { class: 'field-counter' }, `${String(value || '').length}/${max}`);
  const input = multiline
    ? h('textarea', { class: 'field', rows, maxlength: max, disabled }, value || '')
    : h('input', { class: 'field', value: value || '', maxlength: max, disabled });
  input.addEventListener('input', () => { counter.textContent = `${input.value.length}/${max}`; oninput(input.value); });
  return h('label', { class: 'ed-field' }, h('span', { class: 'ed-label' }, h('span', null, label), counter), input, hint ? h('span', { class: 'note' }, hint) : null);
}
function colorField({ label, value, disabled, oninput }) {
  const text = h('input', { class: 'field mono', value, maxlength: 7, disabled, 'aria-label': `${label} (hex)` });
  const picker = h('input', { class: 'color-swatch', type: 'color', value, disabled, 'aria-label': label });
  picker.addEventListener('input', () => { text.value = picker.value; oninput(picker.value); });
  text.addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(text.value)) { picker.value = text.value; oninput(text.value.toLowerCase()); } });
  return h('label', { class: 'ed-field' }, h('span', { class: 'ed-label' }, h('span', null, label)), h('div', { class: 'color-row' }, picker, text));
}
function toggleField({ label, value, disabled, onchange }) {
  const input = h('input', { type: 'checkbox', checked: value, disabled, onchange: e => onchange(e.target.checked) });
  return h('label', { class: 'switch-row ed-switch' }, h('span', { class: 'switch-text' }, h('b', null, label)), h('span', { class: 'switch' }, input, h('i')));
}
function channelChip(target) {
  if (!target) return null;
  return h('span', { class: `channel-chip${target.found ? '' : ' missing'}`, title: target.found ? 'Kanal topildi' : 'Kanal serverda topilmadi' }, icon('hash'), target.channel);
}

// ---------- panellar ro'yxati ----------
export async function pageKitPanels(ctx) {
  const slug = ctx.params[0];
  const cfg = await loadConfig(slug);
  if (!cfg) return ctx.notFound('Kit topilmadi yoki sizda ruxsat yo\'q.');
  document.title = `Panellar · ${cfg.name}`;
  const publish = async id => {
    try { const r = await send('POST', `/api/kits/${slug}/panels/${id}/publish`, {}); toast(r.message); } catch (err) { handleActionError(err); }
  };
  const builtIn = Object.keys(PANEL_INFO).map(id => {
    const [title, desc, ico] = PANEL_INFO[id];
    const target = cfg.panelTargets.find(t => t.id === id);
    return h('section', { class: 'panel-card' },
      h('div', { class: 'panel-card-head' },
        h('span', { class: 'panel-card-ico' }, icon(ico)),
        h('span', { class: 'grow' }, h('b', null, title), h('small', null, desc)),
        cfg.panelsChanged.includes(id) ? h('span', { class: 'mini-chip' }, 'o\'zgartirilgan') : h('span', { class: 'mini-chip plain-chip' }, 'standart')),
      h('div', { class: 'panel-card-channel' }, channelChip(target)),
      h('div', { class: 'panel-card-foot' },
        h('a', { class: 'btn small', href: `#/kits/${slug}/panels/${id}` }, icon('pencil'), 'Tahrirlash'),
        cfg.canEdit ? h('button', { class: 'btn small', type: 'button', disabled: !target?.found, title: target?.found ? 'Discord\'dagi xabarni yangilash' : 'Kanal serverda topilmadi', onclick: () => publish(id) }, icon('send'), 'Yuborish') : null));
  });
  const customRows = cfg.customPanels.map(p => {
    const ch = cfg.textChannels.find(c => c.id === p.channelId);
    return h('div', { class: 'custom-row' },
      h('span', { class: 'panel-card-ico small' }, icon('note')),
      h('span', { class: 'grow' }, h('b', null, p.name), h('small', null, ch ? `#${ch.name}` : 'kanal topilmadi', ' · ', p.publishedAt ? `yuborilgan ${fmtAgo(p.publishedAt)}` : 'hali yuborilmagan')),
      p.publishedAt ? statePill(p.publishedChannelId === p.channelId, 'Discordda', 'Kanal o\'zgargan') : null,
      h('a', { class: 'btn small', href: `#/kits/${slug}/panels/${p.id}` }, icon('pencil'), 'Tahrirlash'));
  });
  return [
    kitHead({ title: 'Panellar', desc: 'Bot Discord\'ga yuboradigan xabarlar: matn, rang va tugmalar', actions: cfg.canEdit ? [h('a', { class: 'btn primary small', href: `#/kits/${slug}/panels/new` }, icon('plus'), 'Yangi panel')] : [] }),
    readOnlyNote(cfg),
    h('div', { class: 'section-label' }, 'Bot xabarlari'),
    h('div', { class: 'panel-grid' }, builtIn),
    h('div', { class: 'section-label' }, 'Qo\'shimcha panellar', h('span', { class: 'count-pill' }, cfg.customPanels.length)),
    h('section', { class: 'card' }, customRows.length ? h('div', { class: 'custom-list' }, customRows) : empty("Qo'shimcha panel yo'q", 'note', cfg.canEdit ? 'Qoidalar, e\'lon yoki havolalar uchun o\'z xabaringizni yarating va istalgan kanalga yuboring.' : 'Rahbarlar yaratgan panellar shu yerda ko\'rinadi.'))
  ];
}

// ---------- bot panelini tahrirlash ----------
async function builtInEditor(ctx, slug, id) {
  const cfg = await loadConfig(slug);
  if (!cfg) return ctx.notFound('Kit topilmadi yoki sizda ruxsat yo\'q.');
  const [title, desc] = PANEL_INFO[id];
  document.title = `${title} paneli · ${cfg.name}`;
  const look = { ...cfg.panels[id] };
  const disabled = !cfg.canEdit;
  let variant = 'open';
  const preview = h('div', { class: 'dc-frame' });
  const renderPreview = () => replaceKids(preview, discordMessage({ accent: panelAccent(id, look, variant), blocks: panelBlocks(id, look, cfg, variant) }));
  const later = debounce(renderPreview, 60);
  const fields = cfg.panelFields[id].map(([name, type, max]) => {
    const set = v => { look[name] = v; later(); };
    if (type === 'color') return colorField({ label: FIELD_LABELS[name], value: look[name], disabled, oninput: set });
    if (type === 'bool') return toggleField({ label: FIELD_LABELS[name], value: look[name], disabled, onchange: set });
    return textField({ label: FIELD_LABELS[name] || name, value: look[name], max, multiline: type === 'long', hint: FIELD_HINTS[name] || null, disabled, oninput: set, rows: type === 'long' ? 5 : 1 });
  });
  renderPreview();
  const target = cfg.panelTargets.find(t => t.id === id);
  const save = () => saveConfig(slug, 'panel', id, { panel: look });
  const actionsBox = cfg.canEdit ? [
    cfg.panelsChanged.includes(id) ? h('button', { class: 'btn small', type: 'button', onclick: () => openDialog({
      title: 'Standart holatga qaytarish',
      description: 'Panel matnlari botning asl matnlariga qaytadi. Discord\'dagi xabar keyingi yuborishda yangilanadi.',
      submitLabel: 'Qaytarish',
      danger: true,
      onSubmit: () => saveConfig(slug, 'panel', id, { reset: true })
    }) }, icon('swap'), 'Standart') : null,
    asyncButton('Saqlash', save, ''),
    asyncButton('Saqlash va yuborish', async () => { await save(); return send('POST', `/api/kits/${slug}/panels/${id}/publish`, {}); }, 'primary', 'send', !target?.found)
  ].filter(Boolean) : [];
  return [
    kitHead({ title: `${title} paneli`, desc, back: `#/kits/${slug}/panels`, actions: actionsBox }),
    readOnlyNote(cfg),
    h('div', { class: 'editor-layout' },
      h('section', { class: 'card editor-form' },
        h('div', { class: 'card-head stacked' }, h('h2', null, 'Matn va ko\'rinish'), h('span', { class: 'hint' }, 'Tugmalarning vazifasi o\'zgarmaydi, faqat nomi va matnlar.')),
        h('div', { class: 'ed-fields' }, fields)),
      h('section', { class: 'card editor-preview' },
        h('div', { class: 'card-head' }, h('h2', null, 'Ko\'rinish'), channelChip(target)),
        id === 'queue' ? segmented([['open', 'Ochiq holat'], ['closed', 'Yopiq holat']], variant, v => { variant = v; renderPreview(); }, { small: true, label: 'Holat' }) : null,
        preview,
        h('p', { class: 'note' }, target?.found ? '"Yuborish" bosilganda bot shu kanaldagi o\'z xabarini tahrirlaydi, xabar bo\'lmasa yangisini yuboradi.' : 'Bu kanal serverda topilmadi, shuning uchun xabarni yuborib bo\'lmaydi.')))
  ];
}
// Tugma: bosilganda ishlaydi, xato bo'lsa xabar chiqadi.
function asyncButton(text, run, cls = '', iconName = 'check', disabled = false) {
  const btn = h('button', { class: `btn small ${cls}`, type: 'button', disabled, onclick: async () => {
    btn.disabled = true;
    try {
      const r = await run();
      if (r?.message) toast(r.message);
    } catch (err) { handleActionError(err); } finally { btn.disabled = disabled; }
  } }, icon(iconName), text);
  return btn;
}

// ---------- qo'shimcha panel ----------
const BLOCK_TYPES = [['text', 'Matn', 'note'], ['separator', 'Ajratgich', 'list'], ['image', 'Rasm', 'image'], ['buttons', 'Havola tugmalari', 'open']];
const newBlock = type => ({ text: { type: 'text', content: '' }, separator: { type: 'separator', large: false, divider: true }, image: { type: 'image', url: '' }, buttons: { type: 'buttons', items: [{ label: 'Sayt', url: 'https://uztiers.com' }] } }[type]);
const TEMPLATES = {
  rules: { name: 'Qoidalar', accent: '#558ae8', blocks: [{ type: 'text', content: '## 📜 Server qoidalari\n- Hurmat bilan muomala qiling\n- Cheat va makrolar taqiqlanadi\n- Testerlar qaroriga hurmat bilan qarang' }, { type: 'separator', large: false, divider: true }, { type: 'text', content: 'Qoidabuzarlik uchun **cheklov** yoki **mute** beriladi.' }] },
  news: { name: 'E\'lon', accent: '#ffe453', blocks: [{ type: 'text', content: '## 📢 E\'lon\nBugun kechqurun maxsus test kuni bo\'lib o\'tadi.' }, { type: 'separator', large: false, divider: true }, { type: 'buttons', items: [{ label: 'Saytga o\'tish', url: 'https://uztiers.com' }] }] },
  empty: { name: 'Yangi panel', accent: '#558ae8', blocks: [{ type: 'text', content: '## Sarlavha\nMatningizni shu yerga yozing.' }] }
};
async function customEditor(ctx, slug, panelId) {
  const cfg = await loadConfig(slug);
  if (!cfg) return ctx.notFound('Kit topilmadi yoki sizda ruxsat yo\'q.');
  const existing = panelId === 'new' ? null : cfg.customPanels.find(p => p.id === panelId);
  if (panelId !== 'new' && !existing) return ctx.notFound('Panel topilmadi.');
  if (!existing && !cfg.canEdit) return ctx.notFound('Panel yaratish faqat Manager va undan yuqori rollar uchun.');
  document.title = `${existing ? existing.name : 'Yangi panel'} · ${cfg.name}`;
  const firstChannel = cfg.textChannels.find(c => /e-lon|elon|e'lon|yangilik|qoida/i.test(c.name)) || cfg.textChannels[0];
  const state = existing
    ? { name: existing.name, channelId: existing.channelId, accent: existing.accent, blocks: existing.blocks.map(b => ({ ...b, items: b.items ? b.items.map(i => ({ ...i })) : undefined })) }
    : { ...structuredClone(TEMPLATES.empty), channelId: firstChannel?.id || '' };
  const disabled = !cfg.canEdit;
  const preview = h('div', { class: 'dc-frame' });
  const blocksBox = h('div', { class: 'block-list' });
  const settingsBox = h('div', { class: 'ed-fields' });
  const renderPreview = () => replaceKids(preview, discordMessage({ accent: state.accent, blocks: state.blocks }));
  const later = debounce(renderPreview, 60);
  function renderSettings() {
    const groups = new Map();
    for (const c of cfg.textChannels) { const g = c.category || 'Kategoriyasiz'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(c); }
    const select = h('select', { class: 'field', disabled, onchange: e => { state.channelId = e.target.value; } },
      [...groups].map(([g, list]) => h('optgroup', { label: g }, list.map(c => h('option', { value: c.id, selected: c.id === state.channelId }, `#${c.name}`)))));
    replaceKids(settingsBox,
      textField({ label: 'Panel nomi (faqat panelda ko\'rinadi)', value: state.name, max: 60, disabled, oninput: v => { state.name = v; } }),
      h('label', { class: 'ed-field' }, h('span', { class: 'ed-label' }, h('span', null, 'Qaysi kanalga')), select),
      toggleField({ label: 'Chap tomonda rangli chiziq', value: Boolean(state.accent), disabled, onchange: on => { state.accent = on ? (state.accent || '#558ae8') : null; renderSettings(); renderPreview(); } }),
      state.accent ? colorField({ label: 'Rang', value: state.accent, disabled, oninput: v => { state.accent = v; later(); } }) : null);
  }
  function move(i, d) { const j = i + d; if (j < 0 || j >= state.blocks.length) return; [state.blocks[i], state.blocks[j]] = [state.blocks[j], state.blocks[i]]; renderBlocks(); renderPreview(); }
  function blockEditor(b, i) {
    const label = BLOCK_TYPES.find(t => t[0] === b.type);
    let body = null;
    if (b.type === 'text') body = textField({ label: 'Matn', value: b.content, max: 2000, multiline: true, rows: 5, disabled, hint: FIELD_HINTS.body, oninput: v => { b.content = v; later(); } });
    if (b.type === 'separator') body = h('div', { class: 'ed-inline' }, toggleField({ label: 'Chiziq', value: b.divider !== false, disabled, onchange: v => { b.divider = v; renderPreview(); } }), toggleField({ label: 'Katta oraliq', value: b.large, disabled, onchange: v => { b.large = v; renderPreview(); } }));
    if (b.type === 'image') body = textField({ label: 'Rasm havolasi (https://)', value: b.url, max: 500, disabled, hint: 'Panelda faqat cdn.discordapp.com rasmlari ko\'rinadi; Discord\'da istalgan https rasm chiqadi.', oninput: v => { b.url = v.trim(); later(); } });
    if (b.type === 'buttons') {
      body = h('div', { class: 'btn-items' }, b.items.map((it, k) => h('div', { class: 'btn-item' },
        h('input', { class: 'field', value: it.label, maxlength: 80, placeholder: 'Tugma nomi', disabled, 'aria-label': 'Tugma nomi', oninput: e => { it.label = e.target.value; later(); } }),
        h('input', { class: 'field mono', value: it.url, maxlength: 500, placeholder: 'https://', disabled, 'aria-label': 'Havola', oninput: e => { it.url = e.target.value.trim(); later(); } }),
        h('button', { class: 'icon-btn danger', type: 'button', disabled: disabled || b.items.length === 1, title: 'Olib tashlash', 'aria-label': 'Tugmani olib tashlash', onclick: () => { b.items.splice(k, 1); renderBlocks(); renderPreview(); } }, icon('close')))),
        b.items.length < 5 && !disabled ? h('button', { class: 'btn small', type: 'button', onclick: () => { b.items.push({ label: 'Havola', url: 'https://' }); renderBlocks(); renderPreview(); } }, icon('plus'), 'Tugma qo\'shish') : null);
    }
    return h('div', { class: 'block-item' },
      h('div', { class: 'block-head' },
        h('span', { class: 'block-grip' }, icon(label[2])),
        h('b', null, label[1]),
        h('span', { class: 'grow' }),
        disabled ? null : [
          h('button', { class: 'icon-btn', type: 'button', disabled: i === 0, title: 'Yuqoriga', 'aria-label': 'Yuqoriga', onclick: () => move(i, -1) }, icon('up')),
          h('button', { class: 'icon-btn', type: 'button', disabled: i === state.blocks.length - 1, title: 'Pastga', 'aria-label': 'Pastga', onclick: () => move(i, 1) }, icon('down')),
          h('button', { class: 'icon-btn danger', type: 'button', title: "O'chirish", 'aria-label': "Bo'lakni o'chirish", onclick: () => { state.blocks.splice(i, 1); renderBlocks(); renderPreview(); } }, icon('trash'))
        ]),
      body);
  }
  function renderBlocks() {
    replaceKids(blocksBox,
      state.blocks.length ? state.blocks.map(blockEditor) : empty("Bo'lak yo'q", 'note', 'Pastdagi tugmalar bilan matn, rasm yoki tugma qo\'shing.'),
      disabled ? null : h('div', { class: 'block-add' }, h('span', { class: 'note' }, 'Qo\'shish:'), BLOCK_TYPES.map(([type, text, ico]) => h('button', { class: 'btn small', type: 'button', disabled: state.blocks.length >= 12, onclick: () => { state.blocks.push(newBlock(type)); renderBlocks(); renderPreview(); } }, icon(ico), text))));
  }
  renderSettings();
  renderBlocks();
  renderPreview();
  const payload = () => ({ panel: { name: state.name, channelId: state.channelId, accent: state.accent, blocks: state.blocks } });
  const save = async () => {
    if (existing) return send('PATCH', `/api/kits/${slug}/custom-panels/${existing.id}`, payload());
    const r = await send('POST', `/api/kits/${slug}/custom-panels`, payload());
    history.replaceState(null, '', `#/kits/${slug}/panels/${r.panel.id}`);
    S.refreshPage();
    return r;
  };
  const actions = cfg.canEdit ? [
    existing ? h('button', { class: 'btn small ghost-danger', type: 'button', onclick: () => openDialog({
      title: 'Panelni o\'chirish',
      description: existing.messageId ? 'Panel va uning Discord\'dagi xabari o\'chiriladi.' : 'Panel o\'chiriladi.',
      submitLabel: "O'chirish",
      danger: true,
      onSubmit: () => send('DELETE', `/api/kits/${slug}/custom-panels/${existing.id}`, {}),
      onDone: r => { if (r?.message) toast(r.message); location.hash = `#/kits/${slug}/panels`; }
    }) }, icon('trash'), "O'chirish") : null,
    asyncButton('Saqlash', save),
    existing ? asyncButton(existing.messageId ? 'Saqlash va yangilash' : 'Saqlash va yuborish', async () => { await save(); const r = await send('POST', `/api/kits/${slug}/custom-panels/${existing.id}/publish`, {}); S.refreshPage(); return r; }, 'primary', 'send') : null
  ].filter(Boolean) : [];
  return [
    kitHead({ title: existing ? existing.name : 'Yangi panel', desc: existing?.publishedAt ? `Discord'ga yuborilgan: ${fmtDateTime(existing.publishedAt)}` : 'Chapda sozlamalar va bo\'laklar, o\'ngda Discord\'dagi ko\'rinish', back: `#/kits/${slug}/panels`, actions }),
    readOnlyNote(cfg),
    !existing && cfg.canEdit ? h('div', { class: 'template-row' }, h('span', { class: 'note' }, 'Shablon:'), segmented([['empty', "Bo'sh"], ['rules', 'Qoidalar'], ['news', "E'lon"]], 'empty', key => { Object.assign(state, structuredClone(TEMPLATES[key]), { channelId: state.channelId }); renderSettings(); renderBlocks(); renderPreview(); }, { small: true, label: 'Shablon' })) : null,
    h('div', { class: 'editor-layout' },
      h('div', { class: 'stack' },
        h('section', { class: 'card editor-form' }, h('div', { class: 'card-head' }, h('h2', null, 'Sozlamalar')), settingsBox),
        h('section', { class: 'card editor-form' }, h('div', { class: 'card-head' }, h('h2', null, 'Bo\'laklar'), h('span', { class: 'count-pill' }, `${state.blocks.length}/12`)), blocksBox)),
      h('section', { class: 'card editor-preview' },
        h('div', { class: 'card-head' }, h('h2', null, 'Ko\'rinish'), h('span', { class: 'note' }, 'Hech kim ping qilinmaydi')),
        preview,
        h('p', { class: 'note' }, existing ? 'Avval saqlang, keyin "yuborish" bilan Discord\'ga chiqaring. Qayta yuborilganda bot o\'sha xabarni tahrirlaydi.' : 'Yangi panel avval saqlanadi, keyin uni Discord\'ga yuborish mumkin.')))
  ];
}

export async function pageKitPanel(ctx) {
  const [slug, id] = ctx.params;
  if (PANEL_INFO[id]) return builtInEditor(ctx, slug, id);
  return customEditor(ctx, slug, id);
}

// ---------- Discord oynalari ----------
export async function pageKitModals(ctx) {
  const slug = ctx.params[0];
  const cfg = await loadConfig(slug);
  if (!cfg) return ctx.notFound('Kit topilmadi yoki sizda ruxsat yo\'q.');
  document.title = `Oynalar · ${cfg.name}`;
  return [
    kitHead({ title: 'Oynalar', desc: 'Discord\'da tugma bosilganda chiqadigan so\'rovnoma oynalari (modal)' }),
    readOnlyNote(cfg),
    h('div', { class: 'panel-grid' }, Object.keys(MODAL_INFO).map(id => {
      const m = cfg.modals[id];
      const [title, desc] = MODAL_INFO[id];
      return h('a', { class: 'panel-card link-card', href: `#/kits/${slug}/modals/${id}` },
        h('div', { class: 'panel-card-head' },
          h('span', { class: 'panel-card-ico' }, icon('doc')),
          h('span', { class: 'grow' }, h('b', null, title), h('small', null, desc)),
          cfg.modalsChanged.includes(id) ? h('span', { class: 'mini-chip' }, 'o\'zgartirilgan') : h('span', { class: 'mini-chip plain-chip' }, 'standart')),
        h('div', { class: 'panel-card-foot' }, h('span', { class: 'note' }, `"${m.title}" · ${Object.keys(m.fields).length} ta savol`), h('span', { class: 'grow' }), h('span', { class: 'btn small' }, icon('pencil'), 'Tahrirlash')));
    }))
  ];
}
function discordModal(modal, styles) {
  return h('div', { class: 'dcm' },
    h('div', { class: 'dcm-head' }, h('img', { src: '/img/emblem.webp', alt: '', width: 28, height: 28 }), h('b', null, modal.title || 'Oyna'), h('span', { class: 'dcm-x' }, icon('close'))),
    h('div', { class: 'dcm-body' }, Object.entries(modal.fields).map(([key, f]) => h('div', { class: 'dcm-field' },
      h('div', { class: 'dcm-label' }, f.label || 'Savol', h('span', { class: 'dcm-req' }, '*')),
      h('div', { class: `dcm-input${styles[key] === 'paragraph' ? ' tall' : ''}` }, f.placeholder || '')))),
    h('div', { class: 'dcm-foot' }, h('span', { class: 'dcm-cancel' }, 'Bekor qilish'), h('span', { class: 'dc-btn primary' }, 'Yuborish')));
}
export async function pageKitModal(ctx) {
  const [slug, id] = ctx.params;
  if (!MODAL_INFO[id]) return ctx.notFound('Bunday oyna yo\'q.');
  const cfg = await loadConfig(slug);
  if (!cfg) return ctx.notFound('Kit topilmadi yoki sizda ruxsat yo\'q.');
  const [title, desc] = MODAL_INFO[id];
  document.title = `${title} · ${cfg.name}`;
  const modal = structuredClone(cfg.modals[id]);
  const disabled = !cfg.canEdit;
  const preview = h('div', { class: 'dcm-frame' });
  const renderPreview = () => replaceKids(preview, discordModal(modal, cfg.modalFieldStyles));
  const later = debounce(renderPreview, 60);
  renderPreview();
  const fieldCards = Object.entries(modal.fields).map(([key, f], i) => h('div', { class: 'block-item' },
    h('div', { class: 'block-head' }, h('span', { class: 'block-grip' }, h('b', null, i + 1)), h('b', null, `Savol ${i + 1}`), h('span', { class: 'mini-chip plain-chip' }, cfg.modalFieldStyles[key] === 'paragraph' ? 'Uzun javob' : 'Qisqa javob'), h('span', { class: 'grow' })),
    textField({ label: 'Savol matni', value: f.label, max: 45, disabled, oninput: v => { f.label = v; later(); } }),
    textField({ label: 'Namuna (javob qutisida kulrang matn)', value: f.placeholder, max: 100, disabled, oninput: v => { f.placeholder = v; later(); }, hint: id === 'server' && key === 'server' ? 'Bo\'sh qolsa, Serverlar bo\'limidagi ro\'yxat namuna sifatida ko\'rinadi.' : null })));
  const save = () => saveConfig(slug, 'modal', id, { modal });
  return [
    kitHead({ title, desc, back: `#/kits/${slug}/modals`, actions: cfg.canEdit ? [
      cfg.modalsChanged.includes(id) ? h('button', { class: 'btn small', type: 'button', onclick: () => openDialog({
        title: 'Standart holatga qaytarish',
        description: 'Oyna matnlari botning asl matnlariga qaytadi.',
        submitLabel: 'Qaytarish',
        danger: true,
        onSubmit: () => saveConfig(slug, 'modal', id, { reset: true })
      }) }, icon('swap'), 'Standart') : null,
      asyncButton('Saqlash', save, 'primary')
    ].filter(Boolean) : [] }),
    readOnlyNote(cfg),
    h('div', { class: 'editor-layout' },
      h('div', { class: 'stack' },
        h('section', { class: 'card editor-form' },
          h('div', { class: 'card-head stacked' }, h('h2', null, 'Asosiy'), h('span', { class: 'hint' }, 'Savollar soni va turi bot ichida belgilangan, faqat matnlar o\'zgaradi. O\'zgarish keyingi ochilgan oynada darhol ishlaydi.')),
          textField({ label: 'Oyna sarlavhasi (Discord\'da)', value: modal.title, max: 45, disabled, oninput: v => { modal.title = v; later(); } })),
        h('section', { class: 'card editor-form' }, h('div', { class: 'card-head' }, h('h2', null, 'Savollar'), h('span', { class: 'count-pill' }, Object.keys(modal.fields).length)), h('div', { class: 'block-list' }, fieldCards))),
      h('section', { class: 'card editor-preview' }, h('div', { class: 'card-head' }, h('h2', null, 'Ko\'rinish')), preview))
  ];
}
