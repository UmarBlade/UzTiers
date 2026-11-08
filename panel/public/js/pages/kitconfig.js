// Kit sozlamalari: umumiy va kanallar, cooldownlar, serverlar ro'yxati va chipta kategoriyalari.
// Ko'rish hamma panel foydalanuvchisiga ochiq; saqlash faqat Manager va undan yuqori (server ham tekshiradi).
import { S, h, replaceKids, api, send, runAction, can, fmtNum } from '../core.js';
import { icon, card, empty, openDialog, toast, handleActionError, segmented, actionBtn, roleChips } from '../ui.js';
import { kitHead, statePill } from './kit.js';

export const loadConfig = slug => api(`/api/kits/${slug}/config`);
export const saveConfig = (slug, section, item, body) => send('PATCH', `/api/kits/${slug}/config/${section}${item ? `/${item}` : ''}`, body);
export const COOLDOWN_LABELS = {
  test: ['Navbat testi', 'Oddiy test chiptasidan keyin', 'sword'],
  high_test: ['Yuqori test', 'Yuqori test chiptasidan keyin', 'trophy'],
  help: ['Yordam chiptasi', 'Yordam so\'rovidan keyin', 'chat'],
  complaint: ['Shikoyat chiptasi', 'Shikoyatdan keyin', 'ban'],
  tester_app: ['Tester arizasi', 'Ariza topshirgandan keyin', 'doc']
};
const CHANNEL_LABELS = { verification: 'Tasdiqlash', testEntry: 'Testga kirish', support: 'Yordam so\'rovi', testerApp: 'Tester arizasi', staffCommands: 'Xodim buyruqlari', queue: 'Navbat', leaderboard: 'Reyting', results: 'Natijalar' };

export const readOnlyNote = cfg => (cfg.canEdit ? null : h('div', { class: 'info-banner muted' }, icon('lock'), h('span', null, 'Bu sahifani ko\'rishingiz mumkin. O\'zgartirish faqat Manager va undan yuqori rollar uchun.')));

// Son tanlagich: − [son] +
export function stepper({ value, min = 1, max = 365, disabled = false, label, onchange = () => {} }) {
  const input = h('input', { class: 'stepper-input', type: 'number', min, max, value, disabled, 'aria-label': label, oninput: () => onchange(Number(input.value)) });
  const step = d => {
    const next = Math.min(max, Math.max(min, (Number(input.value) || min) + d));
    input.value = next;
    onchange(next);
  };
  return h('div', { class: `stepper${disabled ? ' disabled' : ''}` },
    h('button', { type: 'button', 'aria-label': 'Kamaytirish', disabled, onclick: () => step(-1) }, '−'),
    input,
    h('button', { type: 'button', 'aria-label': 'Ko\'paytirish', disabled, onclick: () => step(1) }, '+'));
}
// Saqlash tugmasi: bosilganda yoqiladi, so'rov tugaguncha o'chadi.
export function saveButton(text, run, { cls = 'primary', iconName = 'check' } = {}) {
  const btn = h('button', { class: `btn ${cls}`, type: 'button', onclick: async () => {
    btn.disabled = true;
    try {
      const result = await run();
      if (result?.message) toast(result.message);
    } catch (err) { handleActionError(err); } finally { btn.disabled = false; }
  } }, icon(iconName), text);
  return btn;
}

// ---------- sozlamalar ----------
export async function pageKitSettings(ctx) {
  const slug = ctx.params[0];
  const cfg = await loadConfig(slug);
  if (!cfg) return ctx.notFound('Kit topilmadi yoki sizda ruxsat yo\'q.');
  document.title = `Sozlamalar · ${cfg.name}`;
  let tab = ctx.query.get('tab') === 'channels' ? 'channels' : 'general';
  const body = h('div', { class: 'stack' });
  let limit = cfg.queue.limit;
  const general = () => [
    card('Server', 'Discord server ma\'lumotlari',
      h('dl', { class: 'info-grid' },
        h('div', null, h('dt', null, 'Server nomi'), h('dd', null, cfg.guildName || '—')),
        h('div', null, h('dt', null, 'Server ID'), h('dd', null, h('code', { class: 'mono' }, cfg.guildId),
          h('button', { class: 'copy-btn', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(cfg.guildId); toast('ID nusxalandi.'); } catch { toast('Nusxalanmadi.', 'bad'); } } }, icon('copy'), 'Nusxalash'))),
        h('div', null, h('dt', null, 'Navbat'), h('dd', null, statePill(cfg.queueOpen, 'Ochiq', 'Yopiq'))),
        h('div', null, h('dt', null, 'Tester arizasi'), h('dd', null, statePill(cfg.applicationOpen, 'Ochiq', 'Yopiq'))))),
    h('section', { class: 'card' },
      h('div', { class: 'card-head stacked' }, h('h2', null, 'Navbat hajmi'), h('span', { class: 'hint' }, 'Navbatga bir vaqtda nechta o\'yinchi qo\'shila oladi. To\'lganda bot "Navbat to\'ldi" deb javob beradi.')),
      h('div', { class: 'form-row' },
        stepper({ value: limit, min: 1, max: 50, disabled: !cfg.canEdit, label: 'Navbat hajmi', onchange: v => { limit = v; } }),
        h('span', { class: 'note' }, 'kishi · standart 20'),
        cfg.canEdit ? saveButton('Saqlash', () => saveConfig(slug, 'queue', null, { queue: { limit } })) : null)),
    h('section', { class: 'card' },
      h('div', { class: 'card-head stacked' }, h('h2', null, 'Tester arizasi'), h('span', { class: 'hint' }, 'Ochiq bo\'lsa, o\'yinchilar tester bo\'lish uchun ariza topshira oladi. Ariza xabari Discord\'da ham yangilanadi.')),
      h('div', { class: 'form-row' },
        statePill(cfg.applicationOpen, 'Arizalar qabul qilinmoqda', 'Arizalar yopiq'),
        can('setApplication', slug) ? actionBtn(cfg.applicationOpen ? 'Yopish' : 'Ochish', () => openDialog({
          title: cfg.applicationOpen ? 'Tester arizasini yopish' : 'Tester arizasini ochish',
          description: `${cfg.name} serverida ariza xabari ham yangilanadi.`,
          submitLabel: 'Tasdiqlash',
          onSubmit: () => runAction('setApplication', { kit: slug, open: !cfg.applicationOpen })
        }), '', 'doc') : null)),
    card('Buyruqlar', 'Bot ishga tushganda Discord\'da avtomatik ro\'yxatdan o\'tkaziladi',
      h('div', { class: 'cmd-chips' }, (cfg.slashCommands || []).map(c => h('code', { class: 'cmd-chip' }, `/${c}`))))
  ];
  const channels = () => [
    h('section', { class: 'card' },
      h('div', { class: 'card-head stacked' }, h('h2', null, 'Bot kanallari'), h('span', { class: 'hint' }, 'Bot kanallarni nomi bo\'yicha topadi. Kanal topilmasa, shu xabar yoki amal ishlamaydi: kanal nomini Discord\'da aynan shunday qiling.')),
      h('div', { class: 'check-list' }, cfg.channels.map(c => h('div', { class: `check-row${c.found ? '' : ' missing'}` },
        h('span', { class: 'check-ico' }, icon(c.found ? 'check' : 'close')),
        h('span', { class: 'grow' }, h('b', null, CHANNEL_LABELS[c.key] || c.key), h('small', null, `#${c.name}`)),
        h('span', { class: `state-pill ${c.found ? 'on' : 'bad'}` }, h('i'), c.found ? 'Topildi' : 'Topilmadi'))))),
    h('section', { class: 'card' },
      h('div', { class: 'card-head stacked' }, h('h2', null, 'Matnli kanallar'), h('span', { class: 'hint' }, `Serverdagi ${cfg.textChannels.length} ta kanal: qo'shimcha panellar shulardan biriga yuboriladi.`)),
      h('div', { class: 'channel-cloud' }, cfg.textChannels.map(c => h('span', { class: 'channel-chip', title: c.category || '' }, icon('hash'), c.name))))
  ];
  const render = () => replaceKids(body, tab === 'general' ? general() : channels());
  render();
  return [
    kitHead({ title: 'Sozlamalar', desc: `${cfg.name} serverining asosiy sozlamalari va bot kanallari` }),
    readOnlyNote(cfg),
    segmented([['general', 'Umumiy', 'settings'], ['channels', 'Kanallar', 'hash']], tab, value => { tab = value; history.replaceState(null, '', `#/kits/${slug}/settings${value === 'channels' ? '?tab=channels' : ''}`); render(); }, { label: 'Bo\'lim' }),
    body
  ];
}

// ---------- cooldownlar ----------
export async function pageKitCooldowns(ctx) {
  const slug = ctx.params[0];
  const cfg = await loadConfig(slug);
  if (!cfg) return ctx.notFound('Kit topilmadi yoki sizda ruxsat yo\'q.');
  document.title = `Cooldownlar · ${cfg.name}`;
  const values = { ...cfg.cooldowns };
  const rows = Object.keys(COOLDOWN_LABELS).map(key => {
    const [title, hint, ico] = COOLDOWN_LABELS[key];
    const changed = cfg.cooldowns[key] !== cfg.cooldownDefaults[key];
    return h('div', { class: 'cd-row' },
      h('span', { class: 'cd-ico' }, icon(ico)),
      h('span', { class: 'cd-text' }, h('b', null, title), h('small', null, `${hint} · standart ${cfg.cooldownDefaults[key]} kun`)),
      changed ? h('span', { class: 'mini-chip' }, 'o\'zgartirilgan') : null,
      stepper({ value: values[key], min: 1, max: 365, disabled: !cfg.canEdit, label: `${title} (kun)`, onchange: v => { values[key] = v; } }),
      h('span', { class: 'note cd-unit' }, 'kun'));
  });
  return [
    kitHead({ title: 'Cooldownlar', desc: 'Chipta yopilgandan keyin o\'yinchi qancha kun kutishi kerak', actions: cfg.canEdit ? [
      saveButton('Standartga qaytarish', async () => { const r = await saveConfig(slug, 'cooldowns', null, { cooldowns: cfg.cooldownDefaults }); S.refreshPage(); return r; }, { cls: '', iconName: 'swap' }),
      saveButton('Saqlash', () => saveConfig(slug, 'cooldowns', null, { cooldowns: values }))
    ] : [] }),
    readOnlyNote(cfg),
    h('section', { class: 'card' },
      h('div', { class: 'card-head stacked' }, h('h2', null, 'Cooldown profillari'), h('span', { class: 'hint' }, 'O\'zgarish darhol ishlaydi, hozir kutayotganlarning qolgan vaqti ham yangi muddat bo\'yicha hisoblanadi.')),
      h('div', { class: 'cd-list' }, rows)),
    h('div', { class: 'info-banner muted' }, icon('clock'), h('span', null, 'Nik o\'zgartirish cooldowni (30 kun) hamma serverlar uchun umumiy, u bu yerda o\'zgarmaydi. Testga kirish xabaridagi "Cooldown - N kun" qatori Panellar bo\'limidan qayta yuborilganda yangilanadi.'))
  ];
}
// ---------- serverlar ----------
export async function pageKitServers(ctx) {
  const slug = ctx.params[0];
  const cfg = await loadConfig(slug);
  if (!cfg) return ctx.notFound('Kit topilmadi yoki sizda ruxsat yo\'q.');
  document.title = `Serverlar · ${cfg.name}`;
  let list = [...cfg.servers];
  const listBox = h('div');
  const countBox = h('span', { class: 'count-pill' });
  const ipInput = h('input', { class: 'field', placeholder: 'masalan: hypixel.net', maxlength: 60, disabled: !cfg.canEdit, 'aria-label': 'Server manzili' });
  const nameInput = h('input', { class: 'field', placeholder: 'Ro\'yxatdagi nomi (ixtiyoriy)', maxlength: 40, disabled: !cfg.canEdit, 'aria-label': 'Server nomi' });
  async function persist(next, message) {
    const result = await saveConfig(slug, 'servers', null, { servers: next });
    list = result.value;
    render();
    toast(message || result.message);
  }
  function render() {
    countBox.textContent = list.length;
    replaceKids(listBox, list.length ? h('div', { class: 'server-items' }, list.map((s, i) => h('div', { class: 'server-item' },
      h('span', { class: 'server-ico' }, icon('m-dashboard')),
      h('span', { class: 'grow' }, h('b', null, s.name || s.ip), h('small', null, s.ip)),
      cfg.canEdit ? [
        h('button', { class: 'icon-btn', type: 'button', disabled: i === 0, title: 'Yuqoriga', 'aria-label': 'Yuqoriga', onclick: () => { const next = [...list]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; persist(next, 'Tartib saqlandi.').catch(handleActionError); } }, icon('up')),
        h('button', { class: 'icon-btn danger', type: 'button', title: "O'chirish", 'aria-label': "O'chirish", onclick: () => persist(list.filter((_, j) => j !== i), 'Server olib tashlandi.').catch(handleActionError) }, icon('trash'))
      ] : null)))
      : empty("Ro'yxat bo'sh", 'm-dashboard', 'Server qo\'shsangiz, u testga kirishdagi "Server" oynasida namuna sifatida ko\'rinadi.'));
  }
  render();
  const add = async () => {
    const ip = ipInput.value.trim();
    if (!ip) { ipInput.focus(); return; }
    try {
      await persist([...list, { ip, name: nameInput.value.trim() }], 'Server qo\'shildi.');
      ipInput.value = '';
      nameInput.value = '';
    } catch (err) { handleActionError(err); }
  };
  ipInput.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
  return [
    kitHead({ title: 'Serverlar', desc: 'O\'yinchilarga tavsiya qilinadigan Minecraft serverlari' }),
    readOnlyNote(cfg),
    h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', null, 'Yangi server'), h('a', { class: 'btn small', href: `#/kits/${slug}/modals/server` }, icon('pencil'), 'Server oynasi')),
      h('div', { class: 'server-form' },
        h('label', { class: 'dialog-row' }, h('span', null, 'Manzil (IP)'), ipInput),
        h('label', { class: 'dialog-row' }, h('span', null, 'Nomi'), nameInput),
        h('button', { class: 'btn primary', type: 'button', disabled: !cfg.canEdit, onclick: add }, icon('plus'), "Qo'shish"))),
    h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, 'Serverlar'), countBox), listBox),
    h('div', { class: 'info-banner muted' }, icon('tag'), h('span', null, 'O\'yinchi testga kirishda serverini o\'zi yozadi. Bu ro\'yxat o\'sha oynada "Masalan: …" ko\'rinishida chiqadi (Server oynasida o\'z namunangiz yozilmagan bo\'lsa).'))
  ];
}

// ---------- chipta kategoriyalari ----------
export async function pageKitCategories(ctx) {
  const slug = ctx.params[0];
  const cfg = await loadConfig(slug);
  if (!cfg) return ctx.notFound('Kit topilmadi yoki sizda ruxsat yo\'q.');
  document.title = `Kategoriyalar · ${cfg.name}`;
  return [
    kitHead({ title: 'Kategoriyalar', desc: 'Chipta turlari: qaysi Discord kategoriyasida ochiladi, kim ko\'radi va qancha kutiladi', actions: [h('a', { class: 'btn small', href: `#/kits/${slug}/cooldowns` }, icon('clock'), 'Cooldownlar')] }),
    h('div', { class: 'cat-grid' }, cfg.categories.map(c => h('section', { class: `cat-card${c.found ? '' : ' missing'}` },
      h('div', { class: 'cat-card-head' },
        h('span', { class: 'cat-card-ico' }, icon(COOLDOWN_LABELS[c.cooldown]?.[2] || 'folder')),
        h('span', { class: 'grow' }, h('b', null, c.name), h('small', null, c.category)),
        h('span', { class: `state-pill ${c.found ? 'on' : 'bad'}` }, h('i'), c.found ? 'Kategoriya bor' : 'Kategoriya yo\'q')),
      h('dl', { class: 'kv' },
        h('dt', null, 'Kanal nomi'), h('dd', null, h('code', { class: 'mono' }, c.pattern)),
        h('dt', null, 'Hozir ochiq'), h('dd', null, `${fmtNum(c.open)} ta kanal`),
        h('dt', null, 'Cooldown'), h('dd', null, `${cfg.cooldowns[c.cooldown] ?? '—'} kun`)),
      c.roles?.length ? h('div', { class: 'cat-roles' }, h('small', { class: 'note' }, 'Ko\'radigan rollar:'), roleChips(c.roles.map(name => ({ name })))) : null))),
    h('div', { class: 'info-banner muted' }, icon('folder'), h('span', null, 'Kategoriya nomlari botning yopish va tekshirish mantiqiga bog\'liq, shuning uchun ular shu yerda faqat ko\'rsatiladi. Discord\'da kategoriya nomini o\'zgartirmang.'))
  ];
}
