// ======================= DB SETUP / MIGRATION =======================
// Bir martalik skript:
//   1. uztiers_discord database'da link_codes va discord_links jadvallarini yaratadi
//   2. uztiers_tiers'dagi test ma'lumotlarini tozalaydi (player_names, player_tiers)
// Ishga tushirish: node setup_discord_db.js
// Tozalashni o'tkazib yuborish: node setup_discord_db.js --keep-data
const mysql = require('mysql2/promise');
require('dotenv').config();

const KEEP_DATA = process.argv.includes('--keep-data');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 4000,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: true },  // TiDB Cloud uchun majburiy
    multipleStatements: true
  });

  // uztiers_discord mavjudligiga ishonch hosil qilamiz.
  await conn.query('CREATE DATABASE IF NOT EXISTS uztiers_discord');

  // Kutilayotgan tasdiqlash kodlari (vaqtinchalik, bir martalik).
  await conn.query(`
    CREATE TABLE IF NOT EXISTS uztiers_discord.link_codes (
      code          VARCHAR(8)  NOT NULL PRIMARY KEY,
      discord_id    VARCHAR(32) NOT NULL,
      guild_id      VARCHAR(32) NOT NULL,
      expected_name VARCHAR(32) NOT NULL,
      is_change     TINYINT(1)  NOT NULL DEFAULT 0,
      expires_at    BIGINT      NOT NULL,
      INDEX (discord_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Tasdiqlangan bog'lanishlar (doimiy). notified=0 bo'lsa bot hali ishlamagan.
  await conn.query(`
    CREATE TABLE IF NOT EXISTS uztiers_discord.discord_links (
      discord_id VARCHAR(32) NOT NULL PRIMARY KEY,
      guild_id   VARCHAR(32) NOT NULL,
      uuid       VARCHAR(36) NOT NULL,
      name       VARCHAR(32) NOT NULL,
      notified   TINYINT(1)  NOT NULL DEFAULT 0,
      linked_at  BIGINT      NOT NULL,
      INDEX (notified),
      INDEX (uuid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  console.log('✓ uztiers_discord jadvallari tayyor (link_codes, discord_links).');

  if (!KEEP_DATA) {
    const [pt] = await conn.query('DELETE FROM uztiers_tiers.player_tiers');
    const [pn] = await conn.query('DELETE FROM uztiers_tiers.player_names');
    console.log(`✓ uztiers_tiers tozalandi: player_tiers (${pt.affectedRows} satr), player_names (${pn.affectedRows} satr).`);
  } else {
    console.log('• --keep-data: uztiers_tiers tozalanmadi.');
  }

  await conn.end();
  console.log('Tugadi.');
})().catch(err => {
  console.error('XATO:', err.code, err.message);
  process.exit(1);
});
