'use strict';
// Server sozlamalari va yangiliklar: panel o'zgartiradi, bot o'qiydi.
// Fayl panel-data/ ichida, shuning uchun panel/ yangilanganda o'chmaydi.
// Fayl bo'lmasa yoki biror qiymat yozilmagan bo'lsa, bot avvalgi (kod ichidagi) qiymatlar bilan ishlaydi.
const fs = require('fs');
const path = require('path');

const KITS = ['axe', 'mace', 'nethpot', 'potion', 'smp', 'sword', 'uhc', 'vanilla'];
// Har bir kitda o'zgartirsa bo'ladigan cooldownlar (nickname cooldown umumiy, u bu yerda yo'q).
const COOLDOWN_KEYS = ['test', 'high_test', 'help', 'complaint', 'tester_app'];
const MAX_COOLDOWN_DAYS = 365;
const MAX_QUEUE = 50;
const MAX_SERVERS = 12;
const MAX_CUSTOM_PANELS = 20;
const MAX_BLOCKS = 12;
const MAX_NEWS = 200;

// Bot xabarlari: matnlar bot.js dagi hozirgi matnlar bilan aynan bir xil.
const PANEL_DEFAULTS = {
  verification: {
    accent: '#ffa500',
    title: 'Tasdiqlash',
    body: 'Amaldan o\'tish uchun “Tasdiqlash” tugmasini bosing.',
    button: 'Tasdiqlash',
    showImage: true
  },
  testEntry: {
    accent: '#ffa500',
    title: 'Testga kirish',
    body: 'Pastdagi tugmani bosgandan so\'ng, siz **Navbat** kanaliga qo\'shilasiz\nUyerda Tester online bo\'lganda sizga ping yuboriladi.',
    high: 'Agar sizning darajangiz: **LT3** yoki undan baland bo\'lsa - yuqori ticket ochish uchun **Yuqori Testlar** tugmasini bosing.',
    cooldownLine: 'Testlardagi Cooldown - {days}kun',
    button: 'Navbatga kirish',
    highButton: 'Yuqori Testlar'
  },
  support: {
    accent: '#ffa500',
    title: 'Yordam So\'rovi',
    body: 'Yordamimiz uchun pastdagi tugmalarni vaziyatingizga qarab tanlang:',
    details: 'Yordam - har qanday darajadagi savol hamda Tierlist bo\'yicha yordam.\n\nShikoyat - qoidalarga qarshi ish qo\'zg\'atgan o\'yinchi bo\'yicha to\'liq shikoyat yozing!',
    helpButton: '🛡️ Yordam',
    complaintButton: '🚨 Shikoyat'
  },
  testerApp: {
    accent: '#9b59b6',
    title: '<:Tester:1512750590214672384> Tester bo\'lish arizasi',
    requirements: '### Talablar 📃:\n- Shu serverda LT3 yoki undan yuqori darajaga ega bo\'lishingiz\n- Professional, ammo yomon xulqli bo\'lmagan va do\'stona munosabatni saqlab qolish\n- Bu jamiyatda hammavaqt yordam berishga va xizmat qilishga doimiy faol va qiziqish\n- Kamida 13 yoshda bo\'lishingiz',
    info: '### Muhim ma\'lumotlar <:xavf:1512747903964418079> :\n- Ushbu qabul bosqichida yuborilgan barcha arizalar ko‘rib chiqiladi.\n- Hazil yoki soxta arizalar yuborish, yolg‘on ma\'lumot kiritish, boshqa birovning arizasidan nusxa olish yoki sun\'iy intellekt yordamida tayyorlangan arizalarni topshirish arizaning rad etilishiga va qo‘shimcha choralar ko‘rilishiga sabab bo‘lishi mumkin.\nArizangizning holati haqida ma\'muriyatga murojaat qilmasligingizni so‘raymiz.',
    button: '📧 Ariza topshirish'
  },
  queue: {
    openAccent: '#ffa500',
    openTitle: 'Navbat Ochiq!',
    openBody: 'Navbatga kirish uchun **Kirish** tugmasini bosing. Chiqish uchun **Chiqish** tugmasini bosing.',
    closedAccent: '#808080',
    closedTitle: 'Navbat yopiq',
    closedBody: 'Hozircha testerlar yoq. Testerlar kelganda sizga xabar beramiz.',
    joinButton: 'Kirish',
    leaveButton: 'Chiqish'
  }
};
// Har bir maydon: [nomi, turi, eng ko'p uzunlik]. Turlar: text (bir qator), long (ko'p qator), color, bool.
const PANEL_FIELDS = {
  verification: [['accent', 'color'], ['title', 'text', 200], ['body', 'long', 1500], ['button', 'button', 80], ['showImage', 'bool']],
  testEntry: [['accent', 'color'], ['title', 'text', 200], ['body', 'long', 1500], ['high', 'long', 800], ['cooldownLine', 'text', 200], ['button', 'button', 80], ['highButton', 'button', 80]],
  support: [['accent', 'color'], ['title', 'text', 200], ['body', 'long', 1000], ['details', 'long', 1500], ['helpButton', 'button', 80], ['complaintButton', 'button', 80]],
  testerApp: [['accent', 'color'], ['title', 'text', 200], ['requirements', 'long', 1500], ['info', 'long', 1800], ['button', 'button', 80]],
  queue: [['openAccent', 'color'], ['openTitle', 'text', 200], ['openBody', 'long', 800], ['closedAccent', 'color'], ['closedTitle', 'text', 200], ['closedBody', 'long', 800], ['joinButton', 'button', 80], ['leaveButton', 'button', 80]]
};

// Discord oynalari (modal): maydonlar soni va ID lari bot mantiqiga bog'liq, faqat matnlar o'zgaradi.
const MODAL_DEFAULTS = {
  verify: { title: 'Tasdiqlash', fields: { minecraft_nick: { label: 'Minecraft Nikingizni yozing..', placeholder: 'Nikingizni yozing.. (maks 16 belgi)' } } },
  server: { title: 'Server ma\'lumotlari', fields: { server: { label: 'Server IP yoki nomi', placeholder: '' } } },
  complaint: {
    title: 'Shikoyat',
    fields: {
      user_nick: { label: 'Sizning Nikingiz', placeholder: 'Nikingizni kiriting' },
      offender_nick: { label: 'Qoidabuzar Niki', placeholder: 'Qoidabuzar nikini kiriting' }
    }
  },
  apply: {
    title: 'Jamoaga qo\'shilish arizasi',
    fields: {
      q1: { label: 'Yoshingiz nechida?', placeholder: 'Yoshingizni kiriting.' },
      q2: { label: 'O‘zingiz haqingizda qisqacha ma\'lumot bering.', placeholder: 'Xarakteringiz, qiziqishlaringiz va faoliyatingiz haqida yozing' },
      q3: { label: 'Sizda biron bir tajriba bormi?', placeholder: 'Tajribangiz haqida yozing.' },
      q4: { label: 'Nima uchun jamoamizga qo‘shilmoqchisiz?', placeholder: 'Maqsadingizni ifodalang.' },
      q5: { label: 'Nega aynan sizni tanlashimiz kerak?', placeholder: 'Boshqalardan ajralib turadigan jihatlaringiz...' }
    }
  }
};
// Maydon turi panelda ko'rinish uchun: short (bir qator) yoki paragraph.
const MODAL_FIELD_STYLES = { minecraft_nick: 'short', server: 'short', user_nick: 'short', offender_nick: 'short', q1: 'short', q2: 'paragraph', q3: 'paragraph', q4: 'paragraph', q5: 'paragraph' };

class SettingsError extends Error { }

const clone = value => JSON.parse(JSON.stringify(value));
const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const HEX_RE = /^#[0-9a-f]{6}$/i;
const HTTPS_RE = /^https:\/\/[^\s<>"']{3,500}$/i;
// Discord'dagi @everyone va @here xabar matnida ham ping qilmasligi uchun bot allowedMentions ni o'chiradi; bu yerda faqat uzunlik va bo'shliq tekshiriladi.
function cleanText(value, label, max, { required = true, multiline = false } = {}) {
  let text = typeof value === 'string' ? value : '';
  text = text.replace(/\r\n?/g, '\n');
  if (!multiline) text = text.replace(/\n/g, ' ');
  text = text.trim();
  if (required && !text) throw new SettingsError(`${label} bo'sh bo'lmasligi kerak.`);
  if (text.length > max) throw new SettingsError(`${label} ${max} belgidan oshmasligi kerak.`);
  return text;
}
function cleanColor(value, label) {
  const text = String(value || '').trim();
  if (!HEX_RE.test(text)) throw new SettingsError(`${label} rangi noto'g'ri (masalan #ffa500).`);
  return text.toLowerCase();
}
function cleanInt(value, label, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new SettingsError(`${label} ${min} dan ${max} gacha butun son bo'lishi kerak.`);
  return n;
}
const colorToInt = hex => parseInt(String(hex).slice(1), 16);

// ---------- tekshirish ----------
function validatePanel(id, input) {
  const fields = PANEL_FIELDS[id];
  if (!fields) throw new SettingsError('Bunday panel yo\'q.');
  if (!isPlainObject(input)) throw new SettingsError('Ma\'lumot noto\'g\'ri.');
  const out = {};
  for (const [name, type, max] of fields) {
    const label = name;
    if (type === 'color') out[name] = cleanColor(input[name], 'Urg\'u');
    else if (type === 'bool') out[name] = input[name] === true;
    else if (type === 'long') out[name] = cleanText(input[name], 'Matn', max, { multiline: true, required: name !== 'high' });
    else if (type === 'button') out[name] = cleanText(input[name], 'Tugma nomi', max);
    else out[name] = cleanText(input[name], label === 'title' ? 'Sarlavha' : 'Matn', max);
  }
  if (id === 'testEntry' && !out.cooldownLine.includes('{days}')) throw new SettingsError('Cooldown qatorida {days} bo\'lishi kerak: u kunlar soniga almashadi.');
  const total = Object.values(out).filter(v => typeof v === 'string').reduce((n, v) => n + v.length, 0);
  if (total > 3800) throw new SettingsError('Xabar juda uzun: Discord bitta xabarda 4000 belgigacha ruxsat beradi.');
  return out;
}
function validateModal(id, input) {
  const base = MODAL_DEFAULTS[id];
  if (!base) throw new SettingsError('Bunday oyna yo\'q.');
  if (!isPlainObject(input) || !isPlainObject(input.fields)) throw new SettingsError('Ma\'lumot noto\'g\'ri.');
  const out = { title: cleanText(input.title, 'Oyna sarlavhasi', 45), fields: {} };
  for (const key of Object.keys(base.fields)) {
    const f = isPlainObject(input.fields[key]) ? input.fields[key] : {};
    out.fields[key] = {
      label: cleanText(f.label, 'Savol', 45),
      placeholder: cleanText(f.placeholder, 'Namuna matni', 100, { required: false })
    };
  }
  return out;
}
function validateCooldowns(input) {
  if (!isPlainObject(input)) throw new SettingsError('Ma\'lumot noto\'g\'ri.');
  const out = {};
  const names = { test: 'Navbat testi cooldowni', high_test: 'Yuqori test cooldowni', help: 'Yordam cooldowni', complaint: 'Shikoyat cooldowni', tester_app: 'Tester arizasi cooldowni' };
  for (const key of COOLDOWN_KEYS) out[key] = cleanInt(input[key], names[key], 1, MAX_COOLDOWN_DAYS);
  return out;
}
function validateQueue(input) {
  if (!isPlainObject(input)) throw new SettingsError('Ma\'lumot noto\'g\'ri.');
  return { limit: cleanInt(input.limit, 'Navbat hajmi', 1, MAX_QUEUE) };
}
function validateServers(input) {
  if (!Array.isArray(input)) throw new SettingsError('Ma\'lumot noto\'g\'ri.');
  if (input.length > MAX_SERVERS) throw new SettingsError(`Ko'pi bilan ${MAX_SERVERS} ta server qo'shish mumkin.`);
  const seen = new Set();
  return input.map(s => {
    const ip = cleanText(s?.ip, 'Server manzili', 60).toLowerCase();
    if (!/^[a-z0-9.-]+(:\d{2,5})?$/.test(ip)) throw new SettingsError(`Server manzili noto'g'ri: ${ip}`);
    if (seen.has(ip)) throw new SettingsError(`${ip} ikki marta yozilgan.`);
    seen.add(ip);
    return { ip, name: cleanText(s?.name, 'Server nomi', 40, { required: false }) };
  });
}
// Erkin panel (axborot xabari): matn, ajratgich, rasm va havola tugmalari.
function validateCustomPanel(input) {
  if (!isPlainObject(input)) throw new SettingsError('Ma\'lumot noto\'g\'ri.');
  const name = cleanText(input.name, 'Panel nomi', 60);
  const channelId = String(input.channelId || '');
  if (!/^\d{15,25}$/.test(channelId)) throw new SettingsError('Kanal tanlanmagan.');
  const accent = input.accent ? cleanColor(input.accent, 'Urg\'u') : null;
  if (!Array.isArray(input.blocks) || !input.blocks.length) throw new SettingsError('Kamida bitta bo\'lak qo\'shing.');
  if (input.blocks.length > MAX_BLOCKS) throw new SettingsError(`Ko'pi bilan ${MAX_BLOCKS} ta bo'lak bo'ladi.`);
  let textTotal = 0;
  const blocks = input.blocks.map(b => {
    if (!isPlainObject(b)) throw new SettingsError('Bo\'lak noto\'g\'ri.');
    if (b.type === 'text') {
      const content = cleanText(b.content, 'Matn', 2000, { multiline: true });
      textTotal += content.length;
      return { type: 'text', content };
    }
    if (b.type === 'separator') return { type: 'separator', large: b.large === true, divider: b.divider !== false };
    if (b.type === 'image') {
      const url = String(b.url || '').trim();
      if (!HTTPS_RE.test(url)) throw new SettingsError('Rasm havolasi https:// bilan boshlanishi kerak.');
      return { type: 'image', url };
    }
    if (b.type === 'buttons') {
      if (!Array.isArray(b.items) || !b.items.length || b.items.length > 5) throw new SettingsError('Tugmalar qatorida 1 dan 5 tagacha tugma bo\'ladi.');
      return {
        type: 'buttons',
        items: b.items.map(item => {
          const url = String(item?.url || '').trim();
          if (!HTTPS_RE.test(url)) throw new SettingsError('Tugma havolasi https:// bilan boshlanishi kerak.');
          return { label: cleanText(item?.label, 'Tugma nomi', 80), url };
        })
      };
    }
    throw new SettingsError('Noma\'lum bo\'lak turi.');
  });
  if (textTotal > 3800) throw new SettingsError('Matn juda uzun: Discord bitta xabarda 4000 belgigacha ruxsat beradi.');
  return { name, channelId, accent, blocks };
}

// ---------- saqlash ----------
function readJson(file, fallback, log) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const text = fs.readFileSync(file, 'utf8');
    return text.trim() ? JSON.parse(text) : fallback;
  } catch (err) {
    log.error(`${path.basename(file)} o'qilmadi:`, err.message);
    // Buzilgan faylning nusxasi qoladi, bot standart qiymatlar bilan ishlayveradi.
    try { fs.copyFileSync(file, `${file}.corrupted`); } catch { /* bo'lmasa ham davom etadi */ }
    return fallback;
  }
}
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function createSettingsStore({ file, testDaysByKit = {}, cooldownDefaults = {}, log = console }) {
  let data = readJson(file, { kits: {} }, log);
  if (!isPlainObject(data) || !isPlainObject(data.kits)) data = { kits: {} };
  const kitData = kit => {
    if (!KITS.includes(kit)) throw new SettingsError('Kit noto\'g\'ri.');
    if (!isPlainObject(data.kits[kit])) data.kits[kit] = {};
    return data.kits[kit];
  };
  const stored = kit => (isPlainObject(data.kits[kit]) ? data.kits[kit] : {});
  const save = () => writeJson(file, data);

  function defaultCooldowns(kit) {
    const testDays = testDaysByKit[kit] || cooldownDefaults.test || 20;
    return { test: testDays, high_test: testDays, help: cooldownDefaults.help || 1, complaint: cooldownDefaults.complaint || 3, tester_app: cooldownDefaults.tester_app || 15 };
  }
  function cooldowns(kit) { return { ...defaultCooldowns(kit), ...(stored(kit).cooldowns || {}) }; }
  function panel(kit, id) { return { ...clone(PANEL_DEFAULTS[id]), ...(stored(kit).panels?.[id] || {}) }; }
  function modal(kit, id) {
    const base = clone(MODAL_DEFAULTS[id]);
    const saved = stored(kit).modals?.[id];
    if (!saved) return base;
    const fields = {};
    for (const key of Object.keys(base.fields)) fields[key] = { ...base.fields[key], ...(saved.fields?.[key] || {}) };
    return { title: saved.title || base.title, fields };
  }
  return {
    // Bot uchun: yozilmagan bo'lsa null qaytadi va bot o'z standart qiymatini oladi.
    cooldownDays(kit, category) {
      const value = stored(kit).cooldowns?.[category];
      return Number.isInteger(value) && value > 0 ? value : null;
    },
    queueLimit(kit) { return stored(kit).queue?.limit || 20; },
    panel,
    modal,
    servers(kit) { return clone(stored(kit).servers || []); },
    customPanels(kit) { return clone(stored(kit).customPanels || []); },
    customPanel(kit, id) { return clone((stored(kit).customPanels || []).find(p => p.id === id) || null); },
    // Panel uchun: hamma narsa bitta javobda, standart qiymatlari bilan.
    view(kit) {
      const s = stored(kit);
      return {
        cooldowns: cooldowns(kit),
        cooldownDefaults: defaultCooldowns(kit),
        queue: { limit: s.queue?.limit || 20 },
        panels: Object.fromEntries(Object.keys(PANEL_DEFAULTS).map(id => [id, panel(kit, id)])),
        panelsChanged: Object.keys(s.panels || {}),
        modals: Object.fromEntries(Object.keys(MODAL_DEFAULTS).map(id => [id, modal(kit, id)])),
        modalsChanged: Object.keys(s.modals || {}),
        servers: clone(s.servers || []),
        customPanels: clone(s.customPanels || [])
      };
    },
    setCooldowns(kit, input) { kitData(kit).cooldowns = validateCooldowns(input); save(); return cooldowns(kit); },
    setQueue(kit, input) { kitData(kit).queue = validateQueue(input); save(); return { limit: kitData(kit).queue.limit }; },
    setServers(kit, input) { kitData(kit).servers = validateServers(input); save(); return clone(kitData(kit).servers); },
    setPanel(kit, id, input) {
      const value = validatePanel(id, input);
      const k = kitData(kit);
      k.panels = { ...(k.panels || {}), [id]: value };
      save();
      return panel(kit, id);
    },
    resetPanel(kit, id) {
      if (!PANEL_DEFAULTS[id]) throw new SettingsError('Bunday panel yo\'q.');
      const k = kitData(kit);
      if (k.panels) delete k.panels[id];
      save();
      return panel(kit, id);
    },
    setModal(kit, id, input) {
      const value = validateModal(id, input);
      const k = kitData(kit);
      k.modals = { ...(k.modals || {}), [id]: value };
      save();
      return modal(kit, id);
    },
    resetModal(kit, id) {
      if (!MODAL_DEFAULTS[id]) throw new SettingsError('Bunday oyna yo\'q.');
      const k = kitData(kit);
      if (k.modals) delete k.modals[id];
      save();
      return modal(kit, id);
    },
    saveCustomPanel(kit, id, input, extra = {}) {
      const value = validateCustomPanel(input);
      const k = kitData(kit);
      const list = Array.isArray(k.customPanels) ? k.customPanels : [];
      const existing = id ? list.find(p => p.id === id) : null;
      if (id && !existing) throw new SettingsError('Panel topilmadi.');
      if (!existing && list.length >= MAX_CUSTOM_PANELS) throw new SettingsError(`Ko'pi bilan ${MAX_CUSTOM_PANELS} ta panel bo'ladi.`);
      const now = Date.now();
      const saved = existing
        ? Object.assign(existing, value, { updatedAt: now }, extra)
        : { id: `p${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, createdAt: now, updatedAt: now, messageId: null, ...value, ...extra };
      if (!existing) list.push(saved);
      k.customPanels = list;
      save();
      return clone(saved);
    },
    markCustomPanel(kit, id, fields) {
      const p = (kitData(kit).customPanels || []).find(x => x.id === id);
      if (!p) return null;
      Object.assign(p, fields);
      save();
      return clone(p);
    },
    removeCustomPanel(kit, id) {
      const k = kitData(kit);
      const before = (k.customPanels || []).length;
      k.customPanels = (k.customPanels || []).filter(p => p.id !== id);
      if (k.customPanels.length === before) return false;
      save();
      return true;
    }
  };
}

// ---------- yangiliklar ----------
function createNewsStore({ file, log = console }) {
  let list = readJson(file, [], log);
  if (!Array.isArray(list)) list = [];
  const save = () => writeJson(file, list);
  return {
    list({ kits = null, limit = 30 } = {}) {
      return clone(list
        .filter(n => !n.kit || !kits || kits.includes(n.kit))
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt)
        .slice(0, limit));
    },
    get(id) { return clone(list.find(n => n.id === id) || null); },
    add({ authorId, title, body, kit = null, pinned = false }) {
      const item = {
        id: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        authorId,
        title: cleanText(title, 'Sarlavha', 120),
        body: cleanText(body, 'Matn', 2000, { multiline: true }),
        kit: kit && KITS.includes(kit) ? kit : null,
        pinned: pinned === true
      };
      list.unshift(item);
      if (list.length > MAX_NEWS) list = list.slice(0, MAX_NEWS);
      save();
      return clone(item);
    },
    update(id, { title, body, pinned }) {
      const item = list.find(n => n.id === id);
      if (!item) return null;
      item.title = cleanText(title, 'Sarlavha', 120);
      item.body = cleanText(body, 'Matn', 2000, { multiline: true });
      item.pinned = pinned === true;
      item.updatedAt = Date.now();
      save();
      return clone(item);
    },
    remove(id) {
      const before = list.length;
      list = list.filter(n => n.id !== id);
      if (list.length === before) return false;
      save();
      return true;
    }
  };
}

module.exports = { KITS, COOLDOWN_KEYS, PANEL_DEFAULTS, PANEL_FIELDS, MODAL_DEFAULTS, MODAL_FIELD_STYLES, SettingsError, colorToInt, createSettingsStore, createNewsStore };
