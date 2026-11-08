'use strict';
// Test chiptalarini saqlash: yozishmalar va skrinshotlar serverning o'zida (panel-data/tickets) turadi.
// Sayt bazasi joyini band qilmaslik uchun MySQL ishlatilmaydi.
// Bu yerdagi hech bir xato botni to'xtatmasligi kerak.
const fs = require('fs');
const path = require('path');

const MAX_MESSAGES_PER_BACKFILL = 5000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_QUOTA_BYTES = 2 * 1024 * 1024 * 1024;
const IMAGE_MAX_WIDTH = 1920;
const SAVE_DELAY_MS = 5000;
const MAX_TEXT = 4000;
const SEARCH_BUDGET_MS = 2000;
const IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const DISCORD_HOST_RE = /^https:\/\/(cdn|media)\.discord(app)?\.(com|net)\//;
const ID_RE = /^\d{15,25}$/;
const FILE_RE = /^\d{15,25}\.(png|jpg|webp|gif)$/;

const compareIds = (a, b) => {
  const x = BigInt(a);
  const y = BigInt(b);
  return x < y ? -1 : x > y ? 1 : 0;
};

// Discord'ning yangi xabar turi (container) ichidagi matnlarni yig'adi.
function componentTexts(components, out = []) {
  for (const c of components || []) {
    if (typeof c?.content === 'string' && c.content) out.push(c.content.slice(0, MAX_TEXT));
    if (c?.components) componentTexts(c.components, out);
  }
  return out;
}
function embedTexts(embeds) {
  return (embeds || []).map(e => ({
    title: e.title || e.author?.name || null,
    text: e.description ? e.description.slice(0, MAX_TEXT) : null,
    fields: (e.fields || []).slice(0, 12).map(f => ({ name: String(f.name).slice(0, 200), value: String(f.value).slice(0, 1000) }))
  })).filter(e => e.title || e.text || e.fields.length);
}
function mentionNames(message) {
  const out = {};
  for (const user of message.mentions?.users?.values?.() || []) out[user.id] = message.guild?.members.cache.get(user.id)?.displayName || user.globalName || user.username;
  return out;
}
function messageRecord(message) {
  const author = message.author;
  return {
    id: message.id,
    at: message.createdTimestamp,
    authorId: author?.id || null,
    author: message.member?.displayName || author?.globalName || author?.username || 'Noma\'lum',
    avatar: (message.member || author)?.displayAvatarURL?.({ size: 64, extension: 'png' }) || null,
    bot: Boolean(author?.bot),
    text: String(message.content || '').slice(0, MAX_TEXT),
    parts: componentTexts(message.components),
    embeds: embedTexts(message.embeds),
    mentions: mentionNames(message),
    replyTo: message.reference?.messageId || null,
    files: [...(message.attachments?.values?.() || [])].map(a => ({
      id: a.id,
      name: String(a.name || 'fayl').slice(0, 120),
      type: a.contentType || null,
      size: a.size || 0,
      width: a.width || null,
      height: a.height || null,
      file: null
    })),
    editedAt: null,
    deletedAt: null,
    seq: 0
  };
}
function previewOf(record) {
  const text = record.text || record.parts?.[0] || record.embeds?.[0]?.text || record.embeds?.[0]?.title || '';
  if (text) return String(text).replace(/\s+/g, ' ').slice(0, 140);
  return record.files?.length ? 'Rasm yoki fayl' : '';
}

function createTicketStore({ dir, kitByGuild, fetchImpl = fetch, log = console, now = () => Date.now() }) {
  const metaFile = path.join(dir, 'tickets.json');
  const msgDir = path.join(dir, 'messages');
  const fileDir = path.join(dir, 'files');
  const tickets = new Map();
  const live = new Map(); // ochiq chiptalar xabarlari xotirada: channelId -> Map(messageId -> record)
  let saveTimer = null;
  let usedBytes = 0;
  let imageChain = Promise.resolve();

  const msgPath = id => path.join(msgDir, `${id}.jsonl`);

  function load() {
    try {
      fs.mkdirSync(msgDir, { recursive: true });
      fs.mkdirSync(fileDir, { recursive: true });
      if (fs.existsSync(metaFile)) {
        const content = fs.readFileSync(metaFile, 'utf8');
        for (const meta of JSON.parse(content || '[]')) tickets.set(meta.id, meta);
      }
      for (const folder of fs.readdirSync(fileDir)) {
        for (const name of fs.readdirSync(path.join(fileDir, folder))) usedBytes += fs.statSync(path.join(fileDir, folder, name)).size;
      }
    } catch (err) {
      log.error('Chiptalar yuklanmadi:', err.message);
    }
    for (const meta of tickets.values()) {
      if (meta.closedAt) continue;
      const map = readMessages(meta.id);
      live.set(meta.id, map);
      // Bot to'satdan o'chgan bo'lsa, oxirgi saqlanmagan raqamlar xabarlar faylidan tiklanadi.
      for (const message of map.values()) meta.seq = Math.max(meta.seq || 0, message.seq);
      meta.messages = map.size;
      // Oxirgi faollik har doim haqiqiy xabarlardan olinadi.
      const newest = [...map.values()].filter(m => !m.deletedAt).sort((a, b) => compareIds(a.id, b.id)).at(-1);
      if (newest) {
        meta.lastAt = newest.at;
        meta.lastPreview = previewOf(newest);
        meta.lastAuthor = newest.author;
      }
    }
  }

  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    try {
      const tmp = `${metaFile}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify([...tickets.values()]));
      fs.renameSync(tmp, metaFile);
    } catch (err) {
      log.error('Chiptalar saqlanmadi:', err.message);
    }
  }
  function saveSoon() {
    if (saveTimer) return;
    saveTimer = setTimeout(saveNow, SAVE_DELAY_MS);
    saveTimer.unref?.();
  }

  // Har bir qator: yangi xabar (t:'m') yoki unga o'zgartirish (t:'e' tahrir, t:'d' o'chirish, t:'f' saqlangan rasm).
  function appendLine(id, line) {
    try {
      fs.appendFileSync(msgPath(id), `${JSON.stringify(line)}\n`);
    } catch (err) {
      log.error('Chipta xabari yozilmadi:', err.message);
    }
  }
  function applyLine(map, line) {
    if (line.t === 'm') {
      map.set(line.record.id, { ...line.record, seq: line.seq });
      return;
    }
    const record = map.get(line.id);
    if (!record) return;
    record.seq = line.seq;
    if (line.t === 'e') {
      record.text = line.text;
      record.parts = line.parts || record.parts;
      record.embeds = line.embeds || record.embeds;
      if (!line.previewOnly) record.editedAt = line.at;
    } else if (line.t === 'd') {
      record.deletedAt = line.at;
    } else if (line.t === 'f') {
      const file = record.files.find(f => f.id === line.fileId);
      if (file) file.file = line.file;
    }
  }
  function readMessages(id) {
    const map = new Map();
    try {
      if (!fs.existsSync(msgPath(id))) return map;
      for (const row of fs.readFileSync(msgPath(id), 'utf8').split('\n')) {
        if (!row) continue;
        try { applyLine(map, JSON.parse(row)); } catch { /* buzilgan qator o'tkazib yuboriladi */ }
      }
    } catch (err) {
      log.error('Chipta o\'qilmadi:', err.message);
    }
    return map;
  }
  function record(meta, line) {
    meta.seq = (meta.seq || 0) + 1;
    const full = { ...line, seq: meta.seq };
    appendLine(meta.id, full);
    const map = live.get(meta.id);
    if (map) applyLine(map, full);
    saveSoon();
  }

  // ---------- rasmlar ----------
  function imageUrls(message, attachment) {
    const urls = [];
    const proxy = attachment.proxyURL;
    if (proxy && DISCORD_HOST_RE.test(proxy)) {
      // Discord o'zi kichraytirib beradi: 780 KB li skrinshot taxminan 50 KB bo'ladi.
      const params = new URLSearchParams({ format: 'webp' });
      if (attachment.width > IMAGE_MAX_WIDTH && attachment.height) {
        params.set('width', String(IMAGE_MAX_WIDTH));
        params.set('height', String(Math.round(attachment.height * IMAGE_MAX_WIDTH / attachment.width)));
      }
      urls.push(`${proxy}${proxy.includes('?') ? '&' : '?'}${params}`);
    }
    if (attachment.url && DISCORD_HOST_RE.test(attachment.url) && attachment.size <= MAX_IMAGE_BYTES) urls.push(attachment.url);
    return urls;
  }
  async function fetchImage(urls) {
    for (const url of urls) {
      try {
        const res = await fetchImpl(url, { signal: AbortSignal.timeout(25000) });
        if (!res.ok) continue;
        const ext = IMAGE_TYPES[String(res.headers.get('content-type') || '').split(';')[0].trim()];
        if (!ext) continue;
        const body = Buffer.from(await res.arrayBuffer());
        if (!body.length || body.length > MAX_IMAGE_BYTES) continue;
        return { ext, body };
      } catch { /* keyingi manzil sinab ko'riladi */ }
    }
    return null;
  }
  function pruneOldImages() {
    if (usedBytes <= IMAGE_QUOTA_BYTES) return;
    const target = IMAGE_QUOTA_BYTES * 0.9;
    const oldest = [...tickets.values()].filter(m => m.closedAt && !m.filesGone).sort((a, b) => a.openedAt - b.openedAt);
    for (const meta of oldest) {
      if (usedBytes <= target) break;
      const folder = path.join(fileDir, meta.id);
      try {
        if (fs.existsSync(folder)) {
          for (const name of fs.readdirSync(folder)) usedBytes -= fs.statSync(path.join(folder, name)).size;
          fs.rmSync(folder, { recursive: true, force: true });
        }
        meta.filesGone = true;
      } catch (err) {
        log.error('Eski rasmlar o\'chirilmadi:', err.message);
      }
    }
    saveSoon();
  }
  // Rasmlar birma-bir yuklanadi: xotira va tarmoqni band qilmaslik uchun.
  function queueImages(meta, message) {
    for (const attachment of message.attachments?.values?.() || []) {
      if (!IMAGE_TYPES[String(attachment.contentType || '').split(';')[0].trim()]) continue;
      if (live.get(meta.id)?.get(message.id)?.files.find(f => f.id === attachment.id)?.file) continue;
      const urls = imageUrls(message, attachment);
      if (!urls.length) continue;
      imageChain = imageChain.then(async () => {
        const image = await fetchImage(urls);
        if (!image) return;
        const folder = path.join(fileDir, meta.id);
        fs.mkdirSync(folder, { recursive: true });
        const name = `${attachment.id}.${image.ext}`;
        fs.writeFileSync(path.join(folder, name), image.body);
        usedBytes += image.body.length;
        meta.images = (meta.images || 0) + 1;
        record(meta, { t: 'f', id: message.id, fileId: attachment.id, file: name });
        pruneOldImages();
      }).catch(err => log.error('Rasm saqlanmadi:', err.message));
    }
  }

  // ---------- Discord voqealari ----------
  function open(info) {
    try {
      const kit = kitByGuild[info.guildId];
      if (!kit || !ID_RE.test(String(info.channelId))) return null;
      const existing = tickets.get(info.channelId);
      if (existing) return existing;
      const meta = {
        id: info.channelId,
        guildId: info.guildId,
        kit,
        kind: info.kind === 'high' ? 'high' : 'regular',
        name: info.name || null,
        playerId: info.playerId || null,
        nickname: info.nickname || null,
        testerId: info.testerId || null,
        currentTier: info.currentTier || null,
        targetTier: info.targetTier || null,
        server: info.server || null,
        openedAt: info.openedAt || now(),
        closedAt: null,
        result: null,
        closedBy: null,
        lastAt: info.openedAt || now(),
        lastPreview: '',
        lastAuthor: null,
        messages: 0,
        images: 0,
        staffIds: [],
        seq: 0
      };
      tickets.set(meta.id, meta);
      live.set(meta.id, new Map());
      saveNow();
      return meta;
    } catch (err) {
      log.error('Chipta ochilmadi:', err.message);
      return null;
    }
  }
  function storeMessage(meta, message) {
    const rec = messageRecord(message);
    if (live.get(meta.id)?.has(rec.id)) return;
    record(meta, { t: 'm', record: rec });
    meta.messages = (meta.messages || 0) + 1;
    if (rec.at >= (meta.lastAt || 0)) {
      meta.lastAt = rec.at;
      meta.lastPreview = previewOf(rec);
      meta.lastAuthor = rec.author;
    }
    if (rec.authorId && !rec.bot && rec.authorId !== meta.playerId && !meta.staffIds.includes(rec.authorId) && meta.staffIds.length < 10) meta.staffIds.push(rec.authorId);
    queueImages(meta, message);
  }
  function onMessage(message) {
    try {
      const meta = tickets.get(message.channelId);
      if (meta && !meta.closedAt) storeMessage(meta, message);
    } catch (err) {
      log.error('Chipta xabari saqlanmadi:', err.message);
    }
  }
  function onMessageUpdate(message) {
    try {
      const meta = tickets.get(message.channelId);
      if (!meta || meta.closedAt || message.partial) return;
      const existing = live.get(meta.id)?.get(message.id);
      if (!existing) return;
      const rec = messageRecord(message);
      if (existing.text === rec.text && JSON.stringify(existing.parts) === JSON.stringify(rec.parts) && JSON.stringify(existing.embeds) === JSON.stringify(rec.embeds)) return;
      // Discord havola oldindan ko'rinishini ham shu yo'l bilan qo'shadi: bu tahrir emas.
      const previewOnly = existing.text === rec.text && JSON.stringify(existing.parts) === JSON.stringify(rec.parts);
      record(meta, { t: 'e', id: message.id, at: now(), text: rec.text, parts: rec.parts, embeds: rec.embeds, ...(previewOnly ? { previewOnly: true } : {}) });
    } catch (err) {
      log.error('Chipta xabari yangilanmadi:', err.message);
    }
  }
  // O'chirilgan xabar matni saqlanib qoladi va "o'chirilgan" deb belgilanadi.
  function onMessageDelete(message) {
    try {
      const meta = tickets.get(message.channelId);
      if (!meta || meta.closedAt || !live.get(meta.id)?.has(message.id)) return;
      record(meta, { t: 'd', id: message.id, at: now() });
    } catch (err) {
      log.error('Chipta xabari belgilanmadi:', err.message);
    }
  }
  function setResult(channelId, { result = null, closedBy = null } = {}) {
    const meta = tickets.get(channelId);
    if (!meta) return;
    if (result) meta.result = result;
    if (closedBy) meta.closedBy = closedBy;
    saveNow();
  }
  function close(channelId) {
    const meta = tickets.get(channelId);
    if (!meta || meta.closedAt) return;
    meta.closedAt = now();
    live.delete(channelId);
    saveNow();
  }
  function onChannelDelete(channel) {
    try {
      close(channel.id);
    } catch (err) {
      log.error('Chipta yopilmadi:', err.message);
    }
  }

  // Bot o'chiq paytdagi xabarlarni va ochiq chiptalarning eski xabarlarini Discord'dan olib keladi.
  async function backfill(channel, meta) {
    const known = live.get(meta.id);
    const known_ids = [...known.keys()];
    const newest = known_ids.length ? known_ids.sort(compareIds).at(-1) : null;
    const collected = [];
    let before;
    while (collected.length < MAX_MESSAGES_PER_BACKFILL) {
      const page = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
      if (!page.size) break;
      let reachedKnown = false;
      for (const message of page.values()) {
        if (newest && compareIds(message.id, newest) <= 0) {
          reachedKnown = true;
          // Oldin yuklanmay qolgan rasmlar qayta sinab ko'riladi.
          if (known.has(message.id)) queueImages(meta, message);
          continue;
        }
        collected.push(message);
      }
      before = page.lastKey();
      if (reachedKnown || page.size < 100) break;
    }
    collected.sort((a, b) => compareIds(a.id, b.id));
    for (const message of collected) storeMessage(meta, message);
    return collected.length;
  }
  async function sync(client, { activeTests = {}, highTestTickets = {}, labelOf = () => null } = {}) {
    for (const [guildId, list] of Object.entries(activeTests)) {
      if (!kitByGuild[guildId]) continue;
      for (const t of list || []) {
        if (!t.ticketId || tickets.has(t.ticketId)) continue;
        open({ channelId: t.ticketId, guildId, kind: 'regular', playerId: t.playerId, nickname: t.mcName || t.playerName, testerId: t.testerId, server: t.server });
      }
    }
    for (const [guildId, map] of Object.entries(highTestTickets)) {
      if (!kitByGuild[guildId]) continue;
      for (const [channelId, t] of Object.entries(map || {})) {
        if (tickets.has(channelId)) continue;
        open({ channelId, guildId, kind: 'high', playerId: t.playerId, nickname: t.nickname || labelOf(t.playerId), currentTier: t.currentTier, targetTier: t.targetTier });
      }
    }
    let fetched = 0;
    for (const meta of [...tickets.values()].filter(m => !m.closedAt)) {
      const channel = await client.channels.fetch(meta.id).catch(err => (err?.code === 10003 ? null : undefined));
      if (channel === null) {
        // Bot o'chiq paytda kanal o'chirilgan.
        close(meta.id);
        continue;
      }
      if (!channel) continue;
      if (!meta.name && channel.name) meta.name = channel.name;
      if (meta.openedAt > (channel.createdTimestamp || Infinity)) {
        // Eski chipta endi topildi: uning eski xabarlari ham oxirgi faollik sifatida hisoblanishi kerak.
        meta.openedAt = channel.createdTimestamp;
        if (!meta.messages) meta.lastAt = channel.createdTimestamp;
      }
      try {
        fetched += await backfill(channel, meta);
      } catch (err) {
        log.error(`Chipta tarixi olinmadi (${meta.id}):`, err.message);
      }
    }
    saveNow();
    return { open: [...tickets.values()].filter(m => !m.closedAt).length, fetched };
  }

  // ---------- panel uchun o'qish ----------
  function summary(kits) {
    const allowed = new Set(kits);
    const out = { regular: {}, high: {} };
    for (const meta of tickets.values()) {
      if (!allowed.has(meta.kit)) continue;
      const row = (out[meta.kind][meta.kit] = out[meta.kind][meta.kit] || { kit: meta.kit, open: 0, total: 0, lastAt: 0, images: 0 });
      row.total++;
      row.images += meta.images || 0;
      if (!meta.closedAt) row.open++;
      row.lastAt = Math.max(row.lastAt, meta.lastAt || 0);
    }
    const sorted = group => kits.map(kit => group[kit] || { kit, open: 0, total: 0, lastAt: 0, images: 0 }).sort((a, b) => (b.open > 0) - (a.open > 0) || b.lastAt - a.lastAt);
    return { regular: sorted(out.regular), high: sorted(out.high) };
  }
  function liveList(kits, limit = 12) {
    const allowed = new Set(kits);
    return [...tickets.values()].filter(m => !m.closedAt && allowed.has(m.kit)).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0)).slice(0, limit);
  }
  function recentOpened(kits, since, limit = 30) {
    const allowed = new Set(kits);
    return [...tickets.values()].filter(m => allowed.has(m.kit) && m.openedAt >= since).sort((a, b) => b.openedAt - a.openedAt).slice(0, limit);
  }
  function firstOpenedAt() {
    let first = null;
    for (const meta of tickets.values()) if (first === null || meta.openedAt < first) first = meta.openedAt;
    return first;
  }
  async function list({ kits, kind = null, kit = null, status = null, q = '', page = 1, limit = 30 } = {}) {
    const allowed = new Set(kits);
    const text = String(q || '').trim().toLowerCase();
    let rows = [...tickets.values()].filter(m => allowed.has(m.kit)
      && (!kind || m.kind === kind)
      && (!kit || m.kit === kit)
      && (status !== 'open' || !m.closedAt)
      && (status !== 'closed' || m.closedAt));
    rows.sort((a, b) => (!b.closedAt) - (!a.closedAt) || (b.lastAt || 0) - (a.lastAt || 0));
    let partial = false;
    if (text) {
      const started = now();
      const matches = [];
      for (const meta of rows) {
        const inMeta = [meta.nickname, meta.playerId, meta.testerId, meta.closedBy, meta.targetTier, meta.currentTier, meta.result, meta.server, meta.name].some(v => String(v || '').toLowerCase().includes(text));
        if (inMeta) { matches.push({ meta, inText: false }); continue; }
        if (partial || !text || text.length < 2) continue;
        if (now() - started > SEARCH_BUDGET_MS) { partial = true; continue; }
        try {
          const raw = await fs.promises.readFile(msgPath(meta.id), 'utf8');
          if (raw.toLowerCase().includes(text)) matches.push({ meta, inText: true });
        } catch { /* xabari yo'q chipta */ }
      }
      const total = matches.length;
      const pages = Math.max(Math.ceil(total / limit), 1);
      const current = Math.min(Math.max(Math.floor(Number(page)) || 1, 1), pages);
      return { total, page: current, pages, partial, items: matches.slice((current - 1) * limit, current * limit).map(m => ({ ...m.meta, foundInText: m.inText })) };
    }
    const total = rows.length;
    const pages = Math.max(Math.ceil(total / limit), 1);
    const current = Math.min(Math.max(Math.floor(Number(page)) || 1, 1), pages);
    return { total, page: current, pages, partial, items: rows.slice((current - 1) * limit, current * limit) };
  }
  function get(id, since = 0) {
    const meta = tickets.get(id);
    if (!meta) return null;
    const map = live.get(id) || readMessages(id);
    const messages = [...map.values()].filter(m => m.seq > since).sort((a, b) => compareIds(a.id, b.id));
    return { meta, messages };
  }
  function getMeta(id) {
    return tickets.get(id) || null;
  }
  function filePath(id, name) {
    if (!ID_RE.test(String(id)) || !FILE_RE.test(String(name))) return null;
    const full = path.join(fileDir, id, name);
    return fs.existsSync(full) ? full : null;
  }

  load();
  return { open, onMessage, onMessageUpdate, onMessageDelete, onChannelDelete, setResult, close, sync, summary, liveList, recentOpened, firstOpenedAt, list, get, getMeta, filePath, saveNow };
}

module.exports = { createTicketStore };
