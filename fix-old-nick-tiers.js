// Bir martalik skript: eski /nickname xatosi tufayli MySQL'da eski nik ostida qolib ketgan
// kit tierlarini topadi va o'yinchining hozirgi nikiga ko'chiradi.
//
//   node fix-old-nick-tiers.js           -> faqat hisobot (hech narsa o'zgarmaydi)
//   node fix-old-nick-tiers.js --apply   -> hisobotdagi o'zgarishlarni bajaradi
//
// Eski niklar hozirgi JSON fayllardan va backup* papkalardagi JSON fayllardan olinadi.
// Tier faqat Discord'dagi tier (userTiers.json) bilan mos kelsa ko'chiriladi.
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { upsertUserVerificationProfile } = require('./userIdentity');

const BOT_DIR = __dirname;

const KIT_GUILDS = {
  '1490141644928974948': 'sword',
  '1527912635604140032': 'nethpot',
  '1527912894119809104': 'vanilla',
  '1528063576735223959': 'smp',
  '1528061562776977459': 'mace',
  '1528060219865825442': 'uhc',
  '1528063834072285338': 'axe',
  '1528064349443199077': 'potion'
};
const KIT_ORDER = Object.values(KIT_GUILDS);

function lower(name) {
  return String(name || '').trim().toLowerCase();
}

function tierKey(tier) {
  return String(tier || '').trim().toUpperCase();
}

function readJson(file) {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, 'utf8');
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Could not read ${file}: ${err.message}`);
  }
}

function loadCurrentData() {
  const read = name => readJson(path.join(BOT_DIR, name));
  return {
    userProfiles: read('userProfiles.json'),
    verifiedUsers: read('verifiedUsers.json'),
    cooldowns: read('cooldowns.json'),
    userTiers: read('userTiers.json'),
    restrictedUsers: read('restrictedUsers.json')
  };
}

// backup* papkalarda yangilanishdan oldingi niklar saqlangan.
function loadBackups() {
  return fs.readdirSync(BOT_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^backup/i.test(entry.name))
    .map(entry => path.join(BOT_DIR, entry.name))
    .filter(dir => fs.existsSync(path.join(dir, 'userProfiles.json')) || fs.existsSync(path.join(dir, 'verifiedUsers.json')))
    .map(dir => ({
      dir,
      userProfiles: readJson(path.join(dir, 'userProfiles.json')),
      verifiedUsers: readJson(path.join(dir, 'verifiedUsers.json'))
    }));
}

// bot.js dagi repairStaleNicknames bilan bir xil qoida.
function repairStaleNicknames(userProfiles, verifiedUsers, usedNicknameCommand) {
  let count = 0;
  for (const [userId, profile] of Object.entries(userProfiles)) {
    if (!profile?.nickname) continue;
    const globalNick = profile.nickname.toLowerCase();
    const records = Object.values(verifiedUsers).map(users => users?.[userId]?.nickname).filter(Boolean);
    const newerNicks = new Map();
    for (const nick of records) {
      if (nick.toLowerCase() !== globalNick) newerNicks.set(nick.toLowerCase(), nick);
    }
    if (newerNicks.size !== 1) continue;
    const allServersAgree = records.every(nick => nick.toLowerCase() !== globalNick);
    if (!usedNicknameCommand.has(userId) && !allServersAgree) continue;
    const currentNick = [...newerNicks.values()][0];
    profile.nickname = currentNick;
    for (const [guildId, users] of Object.entries(verifiedUsers)) {
      if (users?.[userId]?.nickname) users[userId].nickname = currentNick;
      if (profile.guilds?.[guildId]) profile.guilds[guildId].nickname = currentNick;
    }
    count++;
  }
  return count;
}

// Bot ishga tushganda qiladigan ishni (loadData) xotirada takrorlaydi: hozirgi niklar shu yerdan olinadi.
function buildCurrentState(raw) {
  const userProfiles = structuredClone(raw.userProfiles);
  const verifiedUsers = structuredClone(raw.verifiedUsers);
  for (const [guildId, users] of Object.entries(verifiedUsers)) {
    for (const [userId, record] of Object.entries(users || {})) {
      if (record?.nickname) upsertUserVerificationProfile(userProfiles, userId, guildId, record.nickname, record.verifiedAt || Date.now());
    }
  }
  const usedNicknameCommand = new Set();
  for (const scope of Object.values(raw.cooldowns || {})) {
    for (const [userId, ts] of Object.entries(scope?.nickname || {})) {
      if (ts && Number.isFinite(Number(ts))) usedNicknameCommand.add(userId);
    }
  }
  const repairedCount = repairStaleNicknames(userProfiles, verifiedUsers, usedNicknameCommand);
  return { userProfiles, verifiedUsers, repairedCount };
}

function addName(map, userId, name) {
  const key = lower(name);
  if (!key || !userId) return;
  if (!map.has(userId)) map.set(userId, new Map());
  map.get(userId).set(key, String(name).trim());
}

// O'yinchi qachondir ishlatgan barcha niklar (hozirgi va backup fayllardan).
function collectAllNames(sources) {
  const names = new Map();
  for (const source of sources) {
    for (const [userId, profile] of Object.entries(source.userProfiles || {})) {
      addName(names, userId, profile?.nickname);
      for (const guildRecord of Object.values(profile?.guilds || {})) addName(names, userId, guildRecord?.nickname);
    }
    for (const users of Object.values(source.verifiedUsers || {})) {
      for (const [userId, record] of Object.entries(users || {})) addName(names, userId, record?.nickname);
    }
  }
  return names;
}

// Bot hozir ishlatayotgan niklar (global profil va server yozuvlari).
function collectInUseNames(state) {
  const names = new Map();
  for (const [userId, profile] of Object.entries(state.userProfiles)) addName(names, userId, profile?.nickname);
  for (const users of Object.values(state.verifiedUsers)) {
    for (const [userId, record] of Object.entries(users || {})) addName(names, userId, record?.nickname);
  }
  return names;
}

function addOwner(map, key, userId) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(userId);
}

function discordTier(raw, state, userId, mode) {
  for (const [guildId, kit] of Object.entries(KIT_GUILDS)) {
    if (kit !== mode) continue;
    const tier = raw.userTiers?.[guildId]?.[userId] || state.userProfiles[userId]?.tierByGuild?.[guildId];
    if (typeof tier === 'string' && tier.trim()) return tier.trim();
  }
  return null;
}

function isRestricted(restrictedUsers, userId) {
  const now = Date.now();
  return Object.values(restrictedUsers || {}).some(scope => {
    const record = scope?.[userId];
    return Boolean(record) && Number(record.endsAt || Infinity) > now;
  });
}

async function fetchTiersByNames(keys) {
  const list = [...keys];
  const rows = [];
  for (let i = 0; i < list.length; i += 200) {
    const [result] = await db.pool.query(
      'SELECT pn.uuid, pn.name, pt.mode, pt.tier FROM player_names pn JOIN player_tiers pt ON pt.uuid = pn.uuid WHERE LOWER(pn.name) IN (?)',
      [list.slice(i, i + 200)]
    );
    rows.push(...result);
  }
  return rows;
}

async function buildPlan(raw, backups) {
  const state = buildCurrentState(raw);
  const allNames = collectAllNames([raw, ...backups]);
  const inUse = collectInUseNames(state);

  const inUseOwners = new Map();
  for (const [userId, names] of inUse) for (const key of names.keys()) addOwner(inUseOwners, key, userId);

  const oldNamesByUser = new Map();
  const oldOwners = new Map();
  for (const [userId, names] of allNames) {
    const current = inUse.get(userId);
    if (!current) continue;
    for (const [key, name] of names) {
      if (current.has(key)) continue;
      if (!oldNamesByUser.has(userId)) oldNamesByUser.set(userId, new Map());
      oldNamesByUser.get(userId).set(key, name);
      addOwner(oldOwners, key, userId);
    }
  }

  const rows = oldOwners.size ? await fetchTiersByNames(oldOwners.keys()) : [];
  const rowsByName = new Map();
  for (const row of rows) {
    const key = lower(row.name);
    if (!rowsByName.has(key)) rowsByName.set(key, []);
    rowsByName.get(key).push(row);
  }

  const items = [];
  const skipped = [];
  for (const [userId, oldNames] of oldNamesByUser) {
    const userRows = [...oldNames.keys()].flatMap(key => rowsByName.get(key) || []);
    if (!userRows.length) continue;
    const currentName = state.userProfiles[userId]?.nickname || null;
    const skipAll = reason => userRows.forEach(row => skipped.push({ userId, currentName, row, reason }));

    if (!currentName) { skipAll('player has no current nickname'); continue; }
    if (inUse.get(userId).size > 1) { skipAll(`player has different nicknames on different servers (${[...inUse.get(userId).values()].join(', ')})`); continue; }
    if (isRestricted(raw.restrictedUsers, userId)) { skipAll('player is restricted (Cheklangan)'); continue; }

    const currentUuid = await db.getUuidByName(currentName);
    const usableRows = [];
    for (const row of userRows) {
      const key = lower(row.name);
      if (inUseOwners.has(key)) skipped.push({ userId, currentName, row, reason: 'this nickname now belongs to another player' });
      else if (oldOwners.get(key).size > 1) skipped.push({ userId, currentName, row, reason: 'more than one player used this nickname before' });
      else if (currentUuid && row.uuid === currentUuid) continue;
      else usableRows.push(row);
    }
    if (!usableRows.length) continue;

    const [currentRows] = currentUuid
      ? await db.pool.query('SELECT mode, tier FROM player_tiers WHERE uuid = ?', [currentUuid])
      : [[]];

    const modes = [...new Set(usableRows.map(row => row.mode))];
    for (const mode of modes) {
      const modeRows = usableRows.filter(row => row.mode === mode);
      const currentTier = currentRows.find(row => row.mode === mode)?.tier || null;
      const jsonTier = discordTier(raw, state, userId, mode);
      const values = [currentTier, ...modeRows.map(row => row.tier)].filter(Boolean);

      let finalTier = null;
      if (jsonTier) finalTier = values.find(tier => tierKey(tier) === tierKey(jsonTier)) || null;
      if (!finalTier && currentTier && modeRows.every(row => tierKey(row.tier) === tierKey(currentTier))) finalTier = currentTier;

      if (!finalTier) {
        const reason = jsonTier
          ? `Discord says ${jsonTier}, MySQL says ${values.join(' / ')}`
          : 'Discord shows no tier for this kit';
        modeRows.forEach(row => skipped.push({ userId, currentName, row, reason }));
        continue;
      }

      const action = !currentTier ? 'move' : tierKey(currentTier) === tierKey(finalTier) ? 'clean' : 'replace';
      items.push({
        userId,
        currentName,
        mode,
        action,
        currentTier,
        finalTier,
        discordTier: jsonTier,
        oldRows: modeRows.map(row => ({ name: row.name, uuid: row.uuid, tier: row.tier }))
      });
    }
  }

  const modeIndex = mode => (KIT_ORDER.includes(mode) ? KIT_ORDER.indexOf(mode) : 99);
  items.sort((a, b) => a.currentName.localeCompare(b.currentName) || modeIndex(a.mode) - modeIndex(b.mode));
  skipped.sort((a, b) => String(a.currentName).localeCompare(String(b.currentName)));
  return { state, items, skipped };
}

function describe(item) {
  const from = item.oldRows.map(row => `${row.tier} under ${row.name}`).join(', ');
  const discord = item.discordTier ? `  (Discord: ${item.discordTier})` : '';
  if (item.action === 'move') return `${from}  ->  move to ${item.currentName}${discord}`;
  if (item.action === 'replace') return `${from}  ->  ${item.currentName} gets ${item.finalTier} instead of ${item.currentTier}${discord}`;
  return `${from}  ->  delete old copy (${item.currentName} already has ${item.currentTier})`;
}

function printReport(plan, backups, applying) {
  console.log('');
  console.log('UzTiers: old nickname tier check');
  console.log(applying ? 'Mode: APPLY (changes will be saved to MySQL)' : 'Mode: CHECK ONLY (nothing will be changed)');
  console.log('');
  console.log(`Backup folders read: ${backups.length ? backups.map(b => path.basename(b.dir)).join(', ') : 'none'}`);
  if (!backups.length && plan.state.repairedCount === 0) {
    console.log('WARNING: no backup folder with JSON files was found. Old nicknames from before the update may be missing.');
  }
  console.log('');

  const byUser = new Map();
  for (const item of plan.items) {
    if (!byUser.has(item.userId)) byUser.set(item.userId, []);
    byUser.get(item.userId).push(item);
  }

  if (!plan.items.length) {
    console.log('No old nickname tiers to fix.');
  } else {
    console.log(`Tiers to fix: ${plan.items.length} (for ${byUser.size} players)`);
    let n = 0;
    for (const [userId, items] of byUser) {
      n++;
      console.log('');
      console.log(`${n}. ${items[0].currentName}  (Discord ID ${userId})`);
      for (const item of items) console.log(`     ${item.mode.padEnd(8)} ${describe(item)}`);
    }
  }

  if (plan.skipped.length) {
    console.log('');
    console.log(`Skipped (not changed, check by hand): ${plan.skipped.length}`);
    for (const s of plan.skipped) {
      console.log(`   - ${s.row.name} ${s.row.mode} ${s.row.tier}  (now: ${s.currentName || '?'}, Discord ID ${s.userId}): ${s.reason}`);
    }
  }

  const count = action => plan.items.filter(item => item.action === action).length;
  console.log('');
  console.log(`Summary: move ${count('move')}, replace ${count('replace')}, delete old copy ${count('clean')}, skipped ${plan.skipped.length}`);
}

async function applyItem(item) {
  const uuid = await db.ensurePlayer(item.currentName);
  if (item.oldRows.some(row => row.uuid === uuid)) throw new Error('old and new nickname have the same uuid');
  const conn = await db.pool.getConnection();
  try {
    await conn.beginTransaction();
    if (tierKey(item.currentTier) !== tierKey(item.finalTier)) {
      await conn.query(
        'INSERT INTO player_tiers (uuid, mode, tier) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE tier = VALUES(tier)',
        [uuid, item.mode, item.finalTier]
      );
    }
    for (const row of item.oldRows) {
      await conn.query('DELETE FROM player_tiers WHERE uuid = ? AND mode = ?', [row.uuid, item.mode]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => { });
    throw err;
  } finally {
    conn.release();
  }
}

function timestamp() {
  const d = new Date();
  const pad = v => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function main(args = []) {
  const applying = args.includes('--apply');
  const raw = loadCurrentData();
  const backups = loadBackups();
  const plan = await buildPlan(raw, backups);
  printReport(plan, backups, applying);

  if (!applying) {
    console.log('');
    console.log('This was only a check. Nothing was changed.');
    if (plan.items.length) console.log('To make these changes, run:  node fix-old-nick-tiers.js --apply');
    return 0;
  }

  // Eski bot hali ishlayotgan bo'lsa, u tierlarni yana eski nikka yozishi mumkin.
  const botCode = fs.existsSync(path.join(BOT_DIR, 'bot.js')) ? fs.readFileSync(path.join(BOT_DIR, 'bot.js'), 'utf8') : '';
  if (!botCode.includes('repairStaleNicknames') || plan.state.repairedCount > 0) {
    console.log('');
    console.log('STOPPED: the new bot.js has not run on this data yet. Nothing was changed.');
    console.log('Upload the new bot.js, run "pm2 restart all", then run this script again.');
    return 1;
  }

  if (!plan.items.length) {
    console.log('');
    console.log('Nothing to change.');
    return 0;
  }

  const logFile = path.join(BOT_DIR, `old-nick-tier-fix-${timestamp()}.json`);
  fs.writeFileSync(logFile, JSON.stringify({ createdAt: new Date().toISOString(), items: plan.items }, null, 2));
  console.log('');
  console.log(`Undo information saved to: ${path.basename(logFile)}`);

  let done = 0;
  let failed = 0;
  for (const item of plan.items) {
    try {
      await applyItem(item);
      done++;
    } catch (err) {
      failed++;
      console.log(`   FAILED: ${item.currentName} ${item.mode}: ${err.message}`);
    }
  }
  console.log(`Done: ${done} changed, ${failed} failed.`);
  return failed ? 1 : 0;
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then(code => { process.exitCode = code; })
    .catch(err => {
      console.error('ERROR:', err.message);
      process.exitCode = 1;
    })
    .finally(() => db.pool.end().catch(() => { }));
}

module.exports = { main, buildPlan, buildCurrentState };
