// Bir martalik vosita: Discord kanallaridan tiklangan tarixni panel_events jadvaliga yuklaydi.
// Ishlatish: node panel/import-history.js <history.json yo'li>
// Qayta ishga tushirish xavfsiz: har bir yozuvning noyob source_id si bor, takrorlar o'tkazib yuboriladi.
// Faqat panel_events jadvaliga yozadi, tierlarga va boshqa ma'lumotlarga tegmaydi.
const fs = require('fs');
const db = require('../db');
const events = require('./events');

const clip = (value, max) => (value === null || value === undefined ? null : String(value).slice(0, max));

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('history.json yo\'li ko\'rsatilmagan.');
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(rows)) throw new Error('Fayl formati noto\'g\'ri.');
  await events.ensureTable();

  const [[{ n: before }]] = await db.pool.query('SELECT COUNT(*) AS n FROM panel_events');
  for (let i = 0; i < rows.length; i += 200) {
    const values = rows.slice(i, i + 200).map(r => [
      Number(r.createdAt), clip(r.type, 32), clip(r.guildId, 25), clip(r.kit, 20), clip(r.actorId, 25), clip(r.targetId, 25),
      clip(r.nickname, 32), clip(r.oldValue, 40), clip(r.newValue, 40), clip(r.note, 255), 'discord', clip(r.sourceId, 40)
    ]);
    await db.pool.query(
      'INSERT IGNORE INTO panel_events (created_at, type, guild_id, kit, actor_id, target_id, nickname, old_value, new_value, note, source, source_id) VALUES ?',
      [values]
    );
  }
  const [[{ n: after }]] = await db.pool.query('SELECT COUNT(*) AS n FROM panel_events');
  console.log(`Faylda: ${rows.length}; oldin jadvalda: ${before}; hozir jadvalda: ${after}; qo'shildi: ${after - before}`);
  await db.pool.end();
}

main().catch(err => {
  console.error('Import xatosi:', err.message);
  process.exit(1);
});
