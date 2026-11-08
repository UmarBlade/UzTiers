// ======================= MySQL TIER DATABASE =======================
// Bu modul faqat MySQL'dagi tier ma'lumotlari bilan ishlaydi.
// Cooldown, navbat va boshqa local ma'lumotlar JSON fayllarda qoladi.
const mysql = require('mysql2/promise');
const crypto = require('crypto');
require('dotenv').config();

// Botdagi barcha tierlar default sword rejimida saqlanadi, ammo boshqa kitlar uchun ham ishlatilishi mumkin.
const DEFAULT_MODE = 'sword';

function normalizeModeName(mode = DEFAULT_MODE) {
  const cleaned = String(mode || DEFAULT_MODE)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

  const aliases = {
    sword: 'sword',
    axe: 'axe',
    mace: 'mace',
    nethpot: 'nethpot',
    smp: 'smp',
    uhc: 'uhc',
    vanilla: 'vanilla',
    crystal: 'vanilla'
  };

  return aliases[cleaned] || cleaned || DEFAULT_MODE;
}

// O'yinchi serverda topilmaganda tashlanadigan maxsus xatolik.
class PlayerNotFoundError extends Error {
  constructor(name) {
    super(`O'yinchi serverda topilmadi: ${name}`);
    this.name = 'PlayerNotFoundError';
    this.playerName = name;
  }
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  // Ulanish shifrlanadi va server sertifikati tekshiriladi.
  ssl: { rejectUnauthorized: true }
});

// Nik bo'yicha uuid topish. Topilmasa null qaytaradi.
// Eslatma: nik ustuni unique emas, lekin oddiy holatda bitta uuid bo'ladi.
async function getUuidByName(name) {
  if (!name) return null;
  const [rows] = await pool.query(
    'SELECT uuid FROM player_names WHERE LOWER(name) = LOWER(?) LIMIT 1',
    [name]
  );
  return rows.length ? rows[0].uuid : null;
}

// Minecraft offline (cracked) UUID: MD5("OfflinePlayer:<nik>") asosida UUID v3.
// Server offline rejimda shu algoritm bilan UUID beradi, shu sabab mos keladi.
function offlineUuid(name) {
  const hash = crypto.createHash('md5').update(`OfflinePlayer:${name}`, 'utf8').digest();
  hash[6] = (hash[6] & 0x0f) | 0x30; // versiya 3
  hash[8] = (hash[8] & 0x3f) | 0x80; // variant
  const hex = hash.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Nik bo'yicha uuid topadi; topilmasa offline uuid yaratib player_names'ga qo'shadi.
// Har doim uuid qaytaradi (PlayerNotFoundError tashlamaydi).
async function ensurePlayer(name) {
  const existing = await getUuidByName(name);
  if (existing) return existing;
  const uuid = offlineUuid(name);
  await pool.query(
    'INSERT INTO player_names (uuid, name) VALUES (?, ?) ' +
    'ON DUPLICATE KEY UPDATE name = VALUES(name)',
    [uuid, name]
  );
  return uuid;
}

// O'yinchining tierini topish. Yo'q bo'lsa null.
async function getTier(name, mode = DEFAULT_MODE) {
  const normalizedMode = normalizeModeName(mode);
  const uuid = await getUuidByName(name);
  if (!uuid) throw new PlayerNotFoundError(name);
  const [rows] = await pool.query(
    'SELECT tier FROM player_tiers WHERE uuid = ? AND mode = ? LIMIT 1',
    [uuid, normalizedMode]
  );
  return rows.length ? rows[0].tier : null;
}

// Tierni yozish/yangilash. Avval eski tierni topadi, keyin yangilaydi.
// O'yinchi player_names'da yo'q bo'lsa offline uuid bilan avtomatik qo'shiladi.
// { uuid, oldTier, newTier } qaytaradi.
async function setTier(name, tier, mode = DEFAULT_MODE) {
  const normalizedMode = normalizeModeName(mode);
  const uuid = await ensurePlayer(name);

  const [existing] = await pool.query(
    'SELECT tier FROM player_tiers WHERE uuid = ? AND mode = ? LIMIT 1',
    [uuid, normalizedMode]
  );
  const oldTier = existing.length ? existing[0].tier : null;

  // Eski tier bo'lmasa yangi satr yaratadi, bo'lsa yangilaydi (composite PK: uuid+mode).
  await pool.query(
    'INSERT INTO player_tiers (uuid, mode, tier) VALUES (?, ?, ?) ' +
    'ON DUPLICATE KEY UPDATE tier = VALUES(tier)',
    [uuid, normalizedMode, tier]
  );

  return { uuid, oldTier, newTier: tier };
}

// Tierni o'chirish. O'yinchi serverda yo'q bo'lsa PlayerNotFoundError.
// O'chirilgan bo'lsa true, tier umuman yo'q bo'lsa false qaytaradi.
async function deleteTier(name, mode = DEFAULT_MODE) {
  const normalizedMode = normalizeModeName(mode);
  const uuid = await getUuidByName(name);
  if (!uuid) throw new PlayerNotFoundError(name);
  const [result] = await pool.query(
    'DELETE FROM player_tiers WHERE uuid = ? AND mode = ?',
    [uuid, normalizedMode]
  );
  return result.affectedRows > 0;
}

// Ulanishni tekshirish (bot ishga tushganda chaqiriladi).
async function testConnection() {
  const conn = await pool.getConnection();
  await conn.ping();
  conn.release();
}

// ======================= DISCORD AKKAUNT BOG'LASH =======================
// Bog'lash jadvallari uztiers_discord database'da. Tier ko'chirish plugin
// tomonidan /dc da bajariladi — bot faqat kod yaratadi va tasdiqlarni o'qiydi.

const LINK_CODE_TTL_MS = 5 * 60 * 1000; // 5 daqiqa
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // chalkash belgilar (0,O,1,I) yo'q

function generateCode(len = 6) {
  let code = '';
  for (let i = 0; i < len; i++) {
    code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  }
  return code;
}

// Yangi tasdiqlash kodi yaratadi. Shu discord_id ning eski kodlarini o'chiradi
// (eski kodlar ishlamaydi). isChange=true — akkaunt almashtirish (tier ko'chiriladi).
// Yaratilgan kodni qaytaradi.
async function createLinkCode(discordId, guildId, name, isChange = false) {
  // Eski kodlarni darhol o'chiramiz — bir vaqtda faqat bitta aktiv kod.
  await pool.query('DELETE FROM uztiers_discord.link_codes WHERE discord_id = ?', [discordId]);

  // Noyob kod topguncha urinamiz (PK to'qnashuvi juda kam ehtimol).
  let code;
  for (let attempt = 0; attempt < 10; attempt++) {
    code = generateCode();
    try {
      await pool.query(
        'INSERT INTO uztiers_discord.link_codes (code, discord_id, guild_id, expected_name, is_change, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
        [code, discordId, guildId, name, isChange ? 1 : 0, Date.now() + LINK_CODE_TTL_MS]
      );
      return code;
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') continue; // kod band, qaytadan
      throw err;
    }
  }
  throw new Error('Kod yaratib bo\'lmadi (juda ko\'p urinish).');
}

// Bot polling: hali ishlov berilmagan (notified=0) tasdiqlangan bog'lanishlar.
async function fetchNewLinks() {
  const [rows] = await pool.query(
    'SELECT discord_id, guild_id, uuid, name FROM uztiers_discord.discord_links WHERE notified = 0'
  );
  return rows;
}

// Bog'lanish bot tomonidan ishlandi deb belgilash.
async function markNotified(discordId) {
  await pool.query('UPDATE uztiers_discord.discord_links SET notified = 1 WHERE discord_id = ?', [discordId]);
}

const SWORD_MODE = DEFAULT_MODE;
const getSwordTier = getTier;
const setSwordTier = setTier;
const deleteSwordTier = deleteTier;

module.exports = {
  SWORD_MODE,
  DEFAULT_MODE,
  normalizeModeName,
  PlayerNotFoundError,
  getUuidByName,
  offlineUuid,
  ensurePlayer,
  getTier,
  setTier,
  deleteTier,
  getSwordTier,
  setSwordTier,
  deleteSwordTier,
  testConnection,
  createLinkCode,
  fetchNewLinks,
  markNotified,
  pool
};
