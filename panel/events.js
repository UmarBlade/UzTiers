// Panel ma'lumotlari: voqealar tarixi (panel_events), xodimlar chati (panel_chat), shaxsiy xabarlar (panel_dm),
// xodim profillari (panel_profiles) va o'yinchi izohlari (panel_notes).
// Tarixga yozishdagi xato botni to'xtatmaydi.
const db = require('../db');

// Leaderboard bilan bir xil: yiqilgan yuqori test hisoblanmaydi.
const COUNTED_TEST_TYPES = ['test', 'high_win'];
const SKINS_DB = 'scorestudio_skins';

// Kunlar O'zbekiston vaqti (UTC+5) bo'yicha ajratiladi.
const DAY_MS = 24 * 60 * 60 * 1000;
const UZ_OFFSET_MS = 5 * 60 * 60 * 1000;
// 1970-yil 1-yanvar payshanba edi: 3 kun qo'shilsa haftalar dushanbadan boshlanadi.
const WEEK_SHIFT_MS = 3 * DAY_MS;
const WEEK_MS = 7 * DAY_MS;

async function ensureTable() {
  await db.pool.query(`
    CREATE TABLE IF NOT EXISTS panel_events (
      id BIGINT NOT NULL AUTO_INCREMENT,
      created_at BIGINT NOT NULL,
      type VARCHAR(32) NOT NULL,
      guild_id VARCHAR(25) NULL,
      kit VARCHAR(20) NULL,
      actor_id VARCHAR(25) NULL,
      target_id VARCHAR(25) NULL,
      nickname VARCHAR(32) NULL,
      old_value VARCHAR(40) NULL,
      new_value VARCHAR(40) NULL,
      note VARCHAR(255) NULL,
      source VARCHAR(10) NOT NULL DEFAULT 'bot',
      source_id VARCHAR(40) NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_source (source_id),
      KEY idx_time (created_at),
      KEY idx_target (target_id, created_at),
      KEY idx_actor (actor_id, created_at),
      KEY idx_type (type, created_at)
    ) DEFAULT CHARSET=utf8mb4
  `);
  await db.pool.query(`
    CREATE TABLE IF NOT EXISTS panel_chat (
      id BIGINT NOT NULL AUTO_INCREMENT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      author_id VARCHAR(25) NOT NULL,
      body TEXT NOT NULL,
      reply_to BIGINT NULL,
      edited TINYINT NOT NULL DEFAULT 0,
      deleted TINYINT NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      KEY idx_updated (updated_at)
    ) DEFAULT CHARSET=utf8mb4
  `);
  await db.pool.query(`
    CREATE TABLE IF NOT EXISTS panel_dm (
      id BIGINT NOT NULL AUTO_INCREMENT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      conv_key VARCHAR(52) NOT NULL,
      author_id VARCHAR(25) NOT NULL,
      recipient_id VARCHAR(25) NOT NULL,
      body TEXT NOT NULL,
      reply_to BIGINT NULL,
      edited TINYINT NOT NULL DEFAULT 0,
      deleted TINYINT NOT NULL DEFAULT 0,
      read_at BIGINT NULL,
      PRIMARY KEY (id),
      KEY idx_conv (conv_key, id),
      KEY idx_recipient (recipient_id, read_at),
      KEY idx_conv_updated (conv_key, updated_at)
    ) DEFAULT CHARSET=utf8mb4
  `);
  await db.pool.query(`
    CREATE TABLE IF NOT EXISTS panel_profiles (
      user_id VARCHAR(25) NOT NULL,
      bio VARCHAR(400) NULL,
      status_text VARCHAR(80) NULL,
      work_days VARCHAR(20) NULL,
      work_from VARCHAR(5) NULL,
      work_to VARCHAR(5) NULL,
      notif_read_at BIGINT NOT NULL DEFAULT 0,
      last_seen BIGINT NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id)
    ) DEFAULT CHARSET=utf8mb4
  `);
  await db.pool.query(`
    CREATE TABLE IF NOT EXISTS panel_notes (
      id BIGINT NOT NULL AUTO_INCREMENT,
      created_at BIGINT NOT NULL,
      target_id VARCHAR(25) NOT NULL,
      author_id VARCHAR(25) NOT NULL,
      kit VARCHAR(20) NULL,
      body VARCHAR(1000) NOT NULL,
      deleted TINYINT NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      KEY idx_target (target_id, id)
    ) DEFAULT CHARSET=utf8mb4
  `);
}

// Hech qachon xato tashlamaydi va botni kutdirmaydi.
function record(type, { guildId = null, kit = null, actorId = null, targetId = null, nickname = null, oldValue = null, newValue = null, note = null, source = 'bot' } = {}) {
  try {
    db.pool.query(
      'INSERT INTO panel_events (created_at, type, guild_id, kit, actor_id, target_id, nickname, old_value, new_value, note, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [Date.now(), type, guildId, kit, actorId, targetId, nickname, oldValue, newValue, note === null || note === undefined || note === '' ? null : String(note).slice(0, 255), source]
    ).catch(err => console.error(`panel_events yozilmadi (${type}):`, err.message));
  } catch (err) {
    console.error(`panel_events yozilmadi (${type}):`, err.message);
  }
}

const marks = list => list.map(() => '?').join(', ');

// kitsIn: bir kit administratori faqat o'z kiti voqealarini va o'z serveridan qilingan umumiy amallarni ko'radi.
// hideActors: kirishlar tarixida teng va yuqori rollar ko'rinmaydi.
function buildWhere({ targetId, actorId, kit, types, from, to, kitsOnly, source, q, kitsIn, guildsIn, hideActors, hideTypes } = {}) {
  const where = [];
  const params = [];
  if (targetId) { where.push('target_id = ?'); params.push(targetId); }
  if (actorId) { where.push('actor_id = ?'); params.push(actorId); }
  if (kit) { where.push('kit = ?'); params.push(kit); }
  if (kitsOnly) where.push('kit IS NOT NULL');
  if (source) { where.push('source = ?'); params.push(source); }
  if (types?.length) { where.push(`type IN (${marks(types)})`); params.push(...types); }
  if (from) { where.push('created_at >= ?'); params.push(from); }
  if (to) { where.push('created_at < ?'); params.push(to); }
  if (kitsIn) {
    if (!kitsIn.length) where.push('1 = 0');
    else if (guildsIn?.length) {
      where.push(`(kit IN (${marks(kitsIn)}) OR (kit IS NULL AND guild_id IN (${marks(guildsIn)})))`);
      params.push(...kitsIn, ...guildsIn);
    } else {
      where.push(`kit IN (${marks(kitsIn)})`);
      params.push(...kitsIn);
    }
  }
  if (hideActors?.length) { where.push(`(actor_id IS NULL OR actor_id NOT IN (${marks(hideActors)}))`); params.push(...hideActors); }
  if (hideTypes?.length) { where.push(`type NOT IN (${marks(hideTypes)})`); params.push(...hideTypes); }
  if (q) {
    const like = `%${String(q).replace(/[\\%_]/g, '\\$&')}%`;
    where.push('(nickname LIKE ? OR note LIKE ? OR old_value LIKE ? OR new_value LIKE ? OR actor_id = ? OR target_id = ?)');
    params.push(like, like, like, like, q, q);
  }
  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

const EVENT_COLUMNS = `id, created_at AS createdAt, type, kit, actor_id AS actorId, target_id AS targetId, nickname,
  old_value AS oldValue, new_value AS newValue, note, source`;
const eventRow = r => ({ ...r, id: Number(r.id), createdAt: Number(r.createdAt) });

async function listEvents(filters = {}) {
  const { clause, params } = buildWhere(filters);
  const limit = Math.min(Math.max(Number(filters.limit) || 30, 1), 300);
  const [rows] = await db.pool.query(`SELECT ${EVENT_COLUMNS} FROM panel_events ${clause} ORDER BY created_at DESC, id DESC LIMIT ?`, [...params, limit]);
  return rows.map(eventRow);
}

// Loglar sahifasi uchun: filtrlar va sahifalash.
async function searchEvents(filters = {}) {
  const { clause, params } = buildWhere(filters);
  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 100);
  const [[{ total }]] = await db.pool.query(`SELECT COUNT(*) AS total FROM panel_events ${clause}`, params);
  const pages = Math.max(Math.ceil(Number(total) / limit), 1);
  const page = Math.min(Math.max(Math.floor(Number(filters.page)) || 1, 1), pages);
  const [rows] = await db.pool.query(
    `SELECT ${EVENT_COLUMNS} FROM panel_events ${clause} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit]
  );
  return { total: Number(total), page, pages, items: rows.map(eventRow) };
}

// Tanlangan davrdagi testlar soni: { actorId: son }.
async function testCountsByActor({ from, to, kit, kitsIn } = {}) {
  const { clause, params } = buildWhere({ from, to, kit, kitsIn, types: COUNTED_TEST_TYPES, kitsOnly: true });
  const [rows] = await db.pool.query(`SELECT actor_id AS actorId, COUNT(*) AS c FROM panel_events ${clause} GROUP BY actor_id`, params);
  return Object.fromEntries(rows.filter(r => r.actorId).map(r => [r.actorId, Number(r.c)]));
}

// Har bir xodimning har bir tur bo'yicha amallari soni: { actorId: { type: son } }.
async function actionCounts(filters = {}) {
  const { clause, params } = buildWhere(filters);
  const [rows] = await db.pool.query(
    `SELECT actor_id AS actorId, type, COUNT(*) AS c FROM panel_events ${clause}${clause ? ' AND' : ' WHERE'} actor_id IS NOT NULL GROUP BY actor_id, type`,
    params
  );
  const out = {};
  for (const r of rows) (out[r.actorId] = out[r.actorId] || {})[r.type] = Number(r.c);
  return out;
}

// Har bir kun uchun testlar soni. Bo'sh kunlar 0 bilan to'ldiriladi, oxirgi kun bugun.
async function testsPerDay({ days = 30, kit, kitsIn, actorId } = {}) {
  const today = Math.floor((Date.now() + UZ_OFFSET_MS) / DAY_MS);
  const firstDay = today - days + 1;
  const { clause, params } = buildWhere({ kit, kitsIn, actorId, types: COUNTED_TEST_TYPES, kitsOnly: true, from: firstDay * DAY_MS - UZ_OFFSET_MS });
  const [rows] = await db.pool.query(
    `SELECT FLOOR((created_at + ?) / ?) AS d, COUNT(*) AS c FROM panel_events ${clause} GROUP BY d`,
    [UZ_OFFSET_MS, DAY_MS, ...params]
  );
  const byDay = new Map(rows.map(r => [Number(r.d), Number(r.c)]));
  const out = [];
  for (let d = firstDay; d <= today; d++) {
    out.push({ date: new Date(d * DAY_MS).toISOString().slice(0, 10), count: byDay.get(d) || 0 });
  }
  return out;
}

// Xodimning istalgan amallari kunlar bo'yicha (faollik xaritasi uchun).
async function activityDays(actorId, days = 84, scope = {}) {
  const today = Math.floor((Date.now() + UZ_OFFSET_MS) / DAY_MS);
  const firstDay = today - days + 1;
  const { clause, params } = buildWhere({ ...scope, actorId, from: firstDay * DAY_MS - UZ_OFFSET_MS });
  const [rows] = await db.pool.query(
    `SELECT FLOOR((created_at + ?) / ?) AS d, COUNT(*) AS c FROM panel_events ${clause} GROUP BY d`,
    [UZ_OFFSET_MS, DAY_MS, ...params]
  );
  const byDay = new Map(rows.map(r => [Number(r.d), Number(r.c)]));
  const out = [];
  for (let d = firstDay; d <= today; d++) out.push({ date: new Date(d * DAY_MS).toISOString().slice(0, 10), count: byDay.get(d) || 0 });
  return out;
}

// Xodim kunning qaysi soatlarida faol (O'zbekiston vaqti, 24 ta ustun).
async function activityHours(actorId, scope = {}) {
  const { clause, params } = buildWhere({ ...scope, actorId });
  const [rows] = await db.pool.query(
    `SELECT FLOOR(MOD(created_at + ?, ?) / ?) AS h, COUNT(*) AS c FROM panel_events ${clause} GROUP BY h`,
    [UZ_OFFSET_MS, DAY_MS, 3600000, ...params]
  );
  const out = new Array(24).fill(0);
  for (const r of rows) out[Number(r.h)] = Number(r.c);
  return out;
}

// Hafta bo'yicha testerlar: [{ week, actorId, count }]. Hafta dushanbadan boshlanadi.
async function weeklyTesterCounts({ kitsIn } = {}) {
  const { clause, params } = buildWhere({ kitsIn, types: COUNTED_TEST_TYPES, kitsOnly: true });
  const [rows] = await db.pool.query(
    `SELECT FLOOR((created_at + ? + ?) / ?) AS w, actor_id AS actorId, COUNT(*) AS c FROM panel_events ${clause}${clause ? ' AND' : ' WHERE'} actor_id IS NOT NULL GROUP BY w, actor_id`,
    [UZ_OFFSET_MS, WEEK_SHIFT_MS, WEEK_MS, ...params]
  );
  return rows.map(r => ({ week: Number(r.w), actorId: r.actorId, count: Number(r.c) }));
}
function currentWeekNumber() {
  return Math.floor((Date.now() + UZ_OFFSET_MS + WEEK_SHIFT_MS) / WEEK_MS);
}

// Tester qaysi darajalarni necha marta bergan.
async function tiersGiven(actorId, scope = {}) {
  const { clause, params } = buildWhere({ ...scope, actorId, types: COUNTED_TEST_TYPES });
  const [rows] = await db.pool.query(`SELECT new_value AS tier, COUNT(*) AS c FROM panel_events ${clause} GROUP BY new_value`, params);
  return rows.map(r => ({ tier: r.tier, count: Number(r.c) }));
}

// Tarix qachondan beri yozilmoqda (bo'sh bo'lsa null).
async function historySince() {
  const [rows] = await db.pool.query('SELECT MIN(created_at) AS t FROM panel_events');
  return rows[0]?.t ? Number(rows[0].t) : null;
}

// Xodim hozirgi rolini qachon olgani: { userId: vaqt }.
async function staffSince() {
  const [rows] = await db.pool.query("SELECT target_id AS id, MAX(created_at) AS t FROM panel_events WHERE type = 'staff_add' GROUP BY target_id");
  return Object.fromEntries(rows.map(r => [r.id, Number(r.t)]));
}

// Saytda ko'rinadigan tierlar (sayt shu jadvallardan o'qiydi): { kit: tier }.
async function siteTiers(nickname) {
  if (!nickname) return {};
  const [rows] = await db.pool.query(
    'SELECT t.mode, t.tier FROM player_names n JOIN player_tiers t ON t.uuid = n.uuid WHERE LOWER(n.name) = LOWER(?)',
    [nickname]
  );
  return Object.fromEntries(rows.map(r => [r.mode, r.tier]));
}

// Saytdagi hamma tierlar (ballni sayt bilan bir xil hisoblash uchun).
async function allSiteTiers() {
  const [rows] = await db.pool.query('SELECT n.name, t.mode, t.tier FROM player_names n JOIN player_tiers t ON t.uuid = n.uuid');
  return rows;
}

// O'yinchilar o'zi tanlagan skinlar (SkinsRestorer jadvallari, faqat o'qiladi): { kichik harfli nik: { skinName, skinUuid } }.
// Sayt ham skinlarni xuddi shu tartibda tanlaydi (uztiers lib/skins.php).
const skinUuidFromValue = value => {
  try {
    const data = JSON.parse(Buffer.from(String(value), 'base64').toString('utf8'));
    return /^[0-9a-fA-F]{32}$/.test(data?.profileId || '') ? data.profileId : null;
  } catch {
    return null;
  }
};
async function skinRefs() {
  const compact = uuid => String(uuid || '').toLowerCase().replace(/-/g, '');
  const [players] = await db.pool.query(`SELECT uuid, skin_identifier AS ident, skin_type AS type FROM ${SKINS_DB}.sr_players WHERE skin_identifier IS NOT NULL`);
  if (!players.length) return {};
  const [names] = await db.pool.query('SELECT uuid, name FROM player_names');
  const nameByUuid = new Map(names.map(n => [compact(n.uuid), n.name]));
  const [playerSkins] = await db.pool.query(`SELECT uuid, last_known_name AS name FROM ${SKINS_DB}.sr_player_skins`);
  const skinNames = new Map(playerSkins.map(s => [String(s.uuid), s.name]));
  const [urlSkins] = await db.pool.query(`SELECT url AS k, value FROM ${SKINS_DB}.sr_url_skins`);
  const [customSkins] = await db.pool.query(`SELECT name AS k, value FROM ${SKINS_DB}.sr_custom_skins`);
  const urlValues = new Map(urlSkins.map(s => [String(s.k), s.value]));
  const customValues = new Map(customSkins.map(s => [String(s.k), s.value]));
  const out = {};
  for (const p of players) {
    const name = nameByUuid.get(compact(p.uuid));
    if (!name) continue;
    const type = String(p.type || 'PLAYER').toUpperCase();
    if (type === 'PLAYER') {
      const skinName = skinNames.get(String(p.ident));
      if (/^[A-Za-z0-9_]{1,16}$/.test(skinName || '')) out[name.toLowerCase()] = { skinName, skinUuid: null };
    } else {
      const value = type === 'URL' ? urlValues.get(String(p.ident)) : customValues.get(String(p.ident));
      const skinUuid = value ? skinUuidFromValue(value) : null;
      if (skinUuid) out[name.toLowerCase()] = { skinName: null, skinUuid };
    }
  }
  return out;
}

// ---------- xodimlar chati ----------
const CHAT_COLUMNS = 'id, created_at AS createdAt, updated_at AS updatedAt, author_id AS authorId, body, reply_to AS replyTo, edited, deleted';
const chatRow = r => ({
  id: Number(r.id),
  createdAt: Number(r.createdAt),
  updatedAt: Number(r.updatedAt),
  authorId: r.authorId,
  body: r.deleted ? '' : r.body,
  replyTo: r.replyTo === null ? null : Number(r.replyTo),
  edited: Boolean(r.edited),
  deleted: Boolean(r.deleted)
});

// Oxirgi xabarlar (eskidan yangiga). beforeId bo'lsa, undan oldingilar.
async function chatRecent({ limit = 60, beforeId = null } = {}) {
  const [rows] = await db.pool.query(
    `SELECT ${CHAT_COLUMNS} FROM panel_chat ${beforeId ? 'WHERE id < ?' : ''} ORDER BY id DESC LIMIT ?`,
    beforeId ? [beforeId, limit] : [limit]
  );
  return rows.map(chatRow).reverse();
}
// Berilgan vaqtdan keyin qo'shilgan, tahrirlangan yoki o'chirilgan xabarlar.
async function chatChangedSince(timestamp) {
  const [rows] = await db.pool.query(`SELECT ${CHAT_COLUMNS} FROM panel_chat WHERE updated_at > ? ORDER BY id ASC LIMIT 200`, [timestamp]);
  return rows.map(chatRow);
}
async function chatGet(id) {
  const [rows] = await db.pool.query(`SELECT ${CHAT_COLUMNS} FROM panel_chat WHERE id = ?`, [id]);
  return rows.length ? chatRow(rows[0]) : null;
}
async function chatInsert(authorId, body, replyTo = null) {
  const now = Date.now();
  const [result] = await db.pool.query('INSERT INTO panel_chat (created_at, updated_at, author_id, body, reply_to) VALUES (?, ?, ?, ?, ?)', [now, now, authorId, body, replyTo]);
  return chatGet(result.insertId);
}
async function chatEdit(id, body) {
  await db.pool.query('UPDATE panel_chat SET body = ?, edited = 1, updated_at = ? WHERE id = ? AND deleted = 0', [body, Date.now(), id]);
  return chatGet(id);
}
async function chatDelete(id) {
  await db.pool.query("UPDATE panel_chat SET body = '', deleted = 1, updated_at = ? WHERE id = ?", [Date.now(), id]);
}
async function chatLatestId() {
  const [rows] = await db.pool.query('SELECT MAX(id) AS id FROM panel_chat');
  return rows[0]?.id ? Number(rows[0].id) : 0;
}

// ---------- shaxsiy xabarlar (faqat ikki tomon ko'radi) ----------
const dmKey = (a, b) => (BigInt(a) < BigInt(b) ? `${a}:${b}` : `${b}:${a}`);
const DM_COLUMNS = `${CHAT_COLUMNS}, recipient_id AS recipientId, conv_key AS convKey, read_at AS readAt`;
const dmRow = r => ({ ...chatRow(r), recipientId: r.recipientId, convKey: r.convKey, readAt: r.readAt === null ? null : Number(r.readAt) });

async function dmRecent(a, b, { limit = 60, beforeId = null } = {}) {
  const key = dmKey(a, b);
  const [rows] = await db.pool.query(
    `SELECT ${DM_COLUMNS} FROM panel_dm WHERE conv_key = ? ${beforeId ? 'AND id < ?' : ''} ORDER BY id DESC LIMIT ?`,
    beforeId ? [key, beforeId, limit] : [key, limit]
  );
  return rows.map(dmRow).reverse();
}
async function dmChangedSince(a, b, timestamp) {
  const [rows] = await db.pool.query(`SELECT ${DM_COLUMNS} FROM panel_dm WHERE conv_key = ? AND updated_at > ? ORDER BY id ASC LIMIT 200`, [dmKey(a, b), timestamp]);
  return rows.map(dmRow);
}
async function dmGet(id) {
  const [rows] = await db.pool.query(`SELECT ${DM_COLUMNS} FROM panel_dm WHERE id = ?`, [id]);
  return rows.length ? dmRow(rows[0]) : null;
}
async function dmInsert(authorId, recipientId, body, replyTo = null) {
  const now = Date.now();
  const [result] = await db.pool.query(
    'INSERT INTO panel_dm (created_at, updated_at, conv_key, author_id, recipient_id, body, reply_to) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [now, now, dmKey(authorId, recipientId), authorId, recipientId, body, replyTo]
  );
  return dmGet(result.insertId);
}
async function dmEdit(id, body) {
  await db.pool.query('UPDATE panel_dm SET body = ?, edited = 1, updated_at = ? WHERE id = ? AND deleted = 0', [body, Date.now(), id]);
  return dmGet(id);
}
async function dmDelete(id) {
  await db.pool.query("UPDATE panel_dm SET body = '', deleted = 1, updated_at = ? WHERE id = ?", [Date.now(), id]);
}
async function dmMarkRead(readerId, otherId) {
  const now = Date.now();
  const [result] = await db.pool.query(
    'UPDATE panel_dm SET read_at = ?, updated_at = ? WHERE conv_key = ? AND recipient_id = ? AND read_at IS NULL',
    [now, now, dmKey(readerId, otherId), readerId]
  );
  return result.affectedRows || 0;
}
// Suhbatlar: { otherId, unread, last }. Eng yangi xabarli suhbat birinchi.
async function dmConversations(userId) {
  const [rows] = await db.pool.query(
    `SELECT conv_key AS convKey, MAX(id) AS lastId, SUM(CASE WHEN recipient_id = ? AND read_at IS NULL AND deleted = 0 THEN 1 ELSE 0 END) AS unread
     FROM panel_dm WHERE author_id = ? OR recipient_id = ? GROUP BY conv_key ORDER BY lastId DESC`,
    [userId, userId, userId]
  );
  if (!rows.length) return [];
  const ids = rows.map(r => Number(r.lastId));
  const [lastRows] = await db.pool.query(`SELECT ${DM_COLUMNS} FROM panel_dm WHERE id IN (${marks(ids)})`, ids);
  const lastById = new Map(lastRows.map(r => [Number(r.id), dmRow(r)]));
  return rows.map(r => {
    const [x, y] = r.convKey.split(':');
    return { otherId: x === userId ? y : x, unread: Number(r.unread) || 0, last: lastById.get(Number(r.lastId)) || null };
  });
}
async function dmUnreadCount(userId) {
  const [[row]] = await db.pool.query('SELECT COUNT(*) AS n FROM panel_dm WHERE recipient_id = ? AND read_at IS NULL AND deleted = 0', [userId]);
  return Number(row.n) || 0;
}

// ---------- xodim profillari ----------
const profileRow = r => ({
  userId: r.user_id,
  bio: r.bio || '',
  status: r.status_text || '',
  workDays: r.work_days ? r.work_days.split(',').map(Number).filter(d => d >= 0 && d <= 6) : [],
  workFrom: r.work_from || '',
  workTo: r.work_to || '',
  notifReadAt: Number(r.notif_read_at) || 0,
  lastSeen: Number(r.last_seen) || 0
});
async function profileGet(userId) {
  const [rows] = await db.pool.query('SELECT * FROM panel_profiles WHERE user_id = ?', [userId]);
  return rows.length ? profileRow(rows[0]) : null;
}
async function profileSave(userId, { bio, status, workDays, workFrom, workTo }) {
  const now = Date.now();
  await db.pool.query(
    `INSERT INTO panel_profiles (user_id, bio, status_text, work_days, work_from, work_to, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE bio = VALUES(bio), status_text = VALUES(status_text), work_days = VALUES(work_days), work_from = VALUES(work_from), work_to = VALUES(work_to), updated_at = VALUES(updated_at)`,
    [userId, bio, status, workDays.join(','), workFrom, workTo, now]
  );
  return profileGet(userId);
}
async function profileTouch(userId, lastSeen = Date.now()) {
  await db.pool.query(
    'INSERT INTO panel_profiles (user_id, last_seen) VALUES (?, ?) ON DUPLICATE KEY UPDATE last_seen = VALUES(last_seen)',
    [userId, lastSeen]
  );
}
async function profileSetNotifRead(userId, at = Date.now()) {
  await db.pool.query(
    'INSERT INTO panel_profiles (user_id, notif_read_at) VALUES (?, ?) ON DUPLICATE KEY UPDATE notif_read_at = VALUES(notif_read_at)',
    [userId, at]
  );
}

// ---------- o'yinchi izohlari ----------
const noteRow = r => ({ id: Number(r.id), createdAt: Number(r.created_at), targetId: r.target_id, authorId: r.author_id, kit: r.kit, body: r.body });
async function noteList(targetId, kitsIn = null) {
  const scoped = kitsIn ? `AND (kit IS NULL OR kit IN (${kitsIn.length ? marks(kitsIn) : 'NULL'}))` : '';
  const [rows] = await db.pool.query(
    `SELECT * FROM panel_notes WHERE target_id = ? AND deleted = 0 ${scoped} ORDER BY id DESC LIMIT 100`,
    kitsIn ? [targetId, ...kitsIn] : [targetId]
  );
  return rows.map(noteRow);
}
async function noteGet(id) {
  const [rows] = await db.pool.query('SELECT * FROM panel_notes WHERE id = ? AND deleted = 0', [id]);
  return rows.length ? noteRow(rows[0]) : null;
}
async function noteAdd(targetId, authorId, kit, body) {
  const [result] = await db.pool.query('INSERT INTO panel_notes (created_at, target_id, author_id, kit, body) VALUES (?, ?, ?, ?, ?)', [Date.now(), targetId, authorId, kit, body]);
  return noteGet(result.insertId);
}
async function noteDelete(id) {
  await db.pool.query('UPDATE panel_notes SET deleted = 1 WHERE id = ?', [id]);
}

module.exports = {
  COUNTED_TEST_TYPES,
  ensureTable,
  record,
  listEvents,
  searchEvents,
  testCountsByActor,
  actionCounts,
  testsPerDay,
  activityDays,
  activityHours,
  weeklyTesterCounts,
  currentWeekNumber,
  tiersGiven,
  historySince,
  staffSince,
  siteTiers,
  allSiteTiers,
  skinRefs,
  chatRecent,
  chatChangedSince,
  chatGet,
  chatInsert,
  chatEdit,
  chatDelete,
  chatLatestId,
  dmKey,
  dmRecent,
  dmChangedSince,
  dmGet,
  dmInsert,
  dmEdit,
  dmDelete,
  dmMarkRead,
  dmConversations,
  dmUnreadCount,
  profileGet,
  profileSave,
  profileTouch,
  profileSetNotifRead,
  noteList,
  noteGet,
  noteAdd,
  noteDelete
};
