const {
  Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionFlagsBits,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags,
  EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  MediaGalleryBuilder, MediaGalleryItemBuilder, AttachmentBuilder, ThumbnailBuilder
} = require('discord.js');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { upsertUserVerificationProfile, isEligibleForTesterTier } = require('./userIdentity');
const panelEvents = require('./panel/events');
const { startPanel } = require('./panel/server');
const { createTicketStore } = require('./panel/tickets');
const panelRules = require('./panel/rules');
const { createSettingsStore, createNewsStore, colorToInt } = require('./panel/settings');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences
  ]
});

// ======================= DATA STORES =======================
let queues = {};
let activeTests = {};
let cooldowns = {};
let lastTestTime = {};
let testersOnline = {};
let verifiedUsers = {};
let userTiers = {};
let activeTestersSet = {};
let queueMessageId = {};
let manualQueueClosed = {};
let highTestTickets = {};
let testCounts = {};
let leaderboardMessageId = {};
let guildKitModes = {};
let userProfiles = {};
let restrictedUsers = {};
let applicationOpen = {};
let pendingNicknameRepairs = [];

const DATA_FILES = {
  queue: 'queueData.json',
  cooldowns: 'cooldowns.json',
  verified: 'verifiedUsers.json',
  lastTest: 'lastTestTime.json',
  tiers: 'userTiers.json',
  highTests: 'highTests.json',
  testCounts: 'testCounts.json',
  activeTests: 'activeTests.json',
  guildKitModes: 'guildKitModes.json',
  userProfiles: 'userProfiles.json',
  restrictedUsers: 'restrictedUsers.json',
  applicationOpen: 'applicationOpen.json'
};

const BOT_CONFIG = {
  channelNames: {
    verification: '☘️┃tasdiqlash',
    testEntry: '📨┃testga-kirish',
    support: '☎️┃yordam-sorovi',
    testerApp: '🗡️┃tester-sorovi',
    staffCommands: '⚙️┃staff-commands',
    queue: '🏹┃navbat',
    leaderboard: '📈┃leaderboard',
    results: '🥈┃natijalar'
  },
  roleNames: {
    azo: "A'zo",
    whitelist: 'Whitelist',
    retired: 'Retired',
    restricted: 'Cheklangan'
  },
  cooldownDurations: { test: 20, high_test: 20, help: 1, complaint: 3, tester_app: 15, nickname: 30 },
  testCooldownDaysByKit: { sword: 20, axe: 20, smp: 20, nethpot: 15, vanilla: 15, mace: 15, uhc: 15, potion: 20 },
  cooldownCategories: ['test', 'high_test', 'help', 'complaint', 'tester_app', 'nickname'],
  restrictDurationsMonths: [3, 6, 9],
  nickname: {
    pattern: /^[a-zA-Z0-9_]+$/,
    maxLength: 16,
    invalidMessage: 'Nikname faqat lotin harflari, raqamlar, pastgi chiziqlar va ko\'pida 16ta harflar bilan yozilishi mumkin.'
  }
};

const KNOWN_GUILD_KIT_MODE_BY_ID = {
  '1490141644928974948': 'sword',
  '1527912635604140032': 'nethpot',
  '1527912894119809104': 'vanilla',
  '1528063576735223959': 'smp',
  '1528061562776977459': 'mace',
  '1528060219865825442': 'uhc',
  '1528063834072285338': 'axe',
  '1528064349443199077': 'potion'
};
const KIT_GUILD_IDS = Object.keys(KNOWN_GUILD_KIT_MODE_BY_ID);
// Test chiptalarining yozishmalari panel uchun serverda saqlanadi (MySQL'da emas).
const panelTickets = createTicketStore({ dir: path.join(__dirname, 'panel-data', 'tickets'), kitByGuild: KNOWN_GUILD_KIT_MODE_BY_ID });
// Panelda o'zgartiriladigan server sozlamalari (cooldownlar, navbat hajmi, xabar matnlari, oynalar) va yangiliklar.
// Sozlama yozilmagan bo'lsa, quyidagi BOT_CONFIG va koddagi asl matnlar ishlatiladi.
const panelSettings = createSettingsStore({ file: path.join(__dirname, 'panel-data', 'settings.json'), testDaysByKit: BOT_CONFIG.testCooldownDaysByKit, cooldownDefaults: BOT_CONFIG.cooldownDurations });
const panelNews = createNewsStore({ file: path.join(__dirname, 'panel-data', 'news.json') });
const PUNISHMENT_CHANNEL_IDS = {
  '1490141644928974948': '1491032730190745721', '1527912635604140032': '1527912638254809279',
  '1528061562776977459': '1528061564769538150', '1527912894119809104': '1527912895021711440',
  '1528060219865825442': '1528060221010739330', '1528063834072285338': '1528063835032916088',
  '1528063576735223959': '1528063577922076842', '1528064349443199077': '1528064350487576736'
};

function safeRead(file, defaultValue = {}) {
  if (!fs.existsSync(file)) return defaultValue;
  try {
    const content = fs.readFileSync(file, 'utf8');
    if (!content.trim()) return defaultValue;
    return JSON.parse(content);
  } catch (err) {
    console.error(`Error reading ${file}:`, err.message);
    if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.corrupted`);
    return defaultValue;
  }
}

function loadData() {
  queues = safeRead(DATA_FILES.queue);
  cooldowns = safeRead(DATA_FILES.cooldowns);
  verifiedUsers = safeRead(DATA_FILES.verified);
  lastTestTime = safeRead(DATA_FILES.lastTest);
  userTiers = safeRead(DATA_FILES.tiers);
  activeTests = safeRead(DATA_FILES.activeTests);
  highTestTickets = safeRead(DATA_FILES.highTests);
  testCounts = safeRead(DATA_FILES.testCounts);
  guildKitModes = safeRead(DATA_FILES.guildKitModes);
  userProfiles = safeRead(DATA_FILES.userProfiles);
  restrictedUsers = safeRead(DATA_FILES.restrictedUsers);
  applicationOpen = safeRead(DATA_FILES.applicationOpen);

  // Existing restrictions were stored per guild. Keep the latest one for each user as a global restriction.
  if (!restrictedUsers.__global) restrictedUsers.__global = {};
  for (const [guildId, entries] of Object.entries(restrictedUsers)) {
    if (guildId === '__global') continue;
    for (const [userId, record] of Object.entries(entries || {})) {
      const existing = restrictedUsers.__global[userId];
      if (!existing || Number(record?.endsAt || 0) > Number(existing.endsAt || 0)) {
        restrictedUsers.__global[userId] = { ...record, reason: record?.reason || 'Oldingi cheklov', savedTiers: record?.savedTiers || {} };
      }
    }
  }

  // Migrate legacy guild-scoped verification records into global profile cache.
  for (const [guildId, users] of Object.entries(verifiedUsers || {})) {
    for (const [userId, record] of Object.entries(users || {})) {
      const nickname = record?.nickname;
      if (!nickname) continue;
      upsertUserVerificationProfile(userProfiles, userId, guildId, nickname, record?.verifiedAt || Date.now());
    }
  }

  // Migrate legacy per-guild nickname cooldowns into one global nickname cooldown.
  if (!cooldowns.__global) cooldowns.__global = {};
  if (!cooldowns.__global.nickname) cooldowns.__global.nickname = {};
  for (const [scopeGuildId, scopeData] of Object.entries(cooldowns || {})) {
    if (scopeGuildId === '__global') continue;
    const nicknameMap = scopeData?.nickname || {};
    for (const [userId, startTs] of Object.entries(nicknameMap)) {
      const ts = Number(startTs);
      if (!Number.isFinite(ts)) continue;
      const prevTs = Number(cooldowns.__global.nickname[userId] || 0);
      // Keep the latest timestamp so the strictest remaining cooldown applies globally.
      if (ts > prevTs) cooldowns.__global.nickname[userId] = ts;
    }
  }

  pendingNicknameRepairs = repairStaleNicknames();
}

// Avval vaqtinchalik faylga yozamiz, keyin uni asosiy fayl o'rniga qo'yamiz.
// Shunda yozish paytida bot o'chib qolsa ham asosiy JSON fayl buzilmaydi.
function safeWrite(file, data) {
  const tmpFile = `${file}.tmp`;
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
    fs.renameSync(tmpFile, file);
  } catch (err) {
    console.error(`Error writing ${file}:`, err.message);
  }
}

function saveData() {
  safeWrite(DATA_FILES.queue, queues);
  safeWrite(DATA_FILES.cooldowns, cooldowns);
  safeWrite(DATA_FILES.verified, verifiedUsers);
  safeWrite(DATA_FILES.lastTest, lastTestTime);
  safeWrite(DATA_FILES.tiers, userTiers);
  safeWrite(DATA_FILES.activeTests, activeTests);
  safeWrite(DATA_FILES.highTests, highTestTickets);
  safeWrite(DATA_FILES.testCounts, testCounts);
  safeWrite(DATA_FILES.guildKitModes, guildKitModes);
  safeWrite(DATA_FILES.userProfiles, userProfiles);
  safeWrite(DATA_FILES.restrictedUsers, restrictedUsers);
  safeWrite(DATA_FILES.applicationOpen, applicationOpen);
}

function normalizeKitMode(mode) {
  const cleaned = String(mode || 'sword').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  const aliases = {
    sword: 'sword',
    axe: 'axe',
    mace: 'mace',
    nethpot: 'nethpot',
    potion: 'potion',
    smp: 'smp',
    uhc: 'uhc',
    vanilla: 'vanilla',
    crystal: 'vanilla'
  };
  return aliases[cleaned] || cleaned || 'sword';
}

function getDefaultGuildKitMode(guildId) {
  if (process.env.KIT_MODE) return normalizeKitMode(process.env.KIT_MODE);
  if (process.env.KIT_MODE_BY_GUILD) {
    try {
      const map = JSON.parse(process.env.KIT_MODE_BY_GUILD);
      if (map[guildId]) return normalizeKitMode(map[guildId]);
    } catch (err) {
      console.error('Invalid KIT_MODE_BY_GUILD:', err.message);
    }
  }
  if (KNOWN_GUILD_KIT_MODE_BY_ID[guildId]) return normalizeKitMode(KNOWN_GUILD_KIT_MODE_BY_ID[guildId]);
  return 'sword';
}

function getGuildKitMode(guildId) {
  if (!guildId) return 'sword';
  if (!guildKitModes[guildId]) guildKitModes[guildId] = getDefaultGuildKitMode(guildId);
  if (!restrictedUsers[guildId]) restrictedUsers[guildId] = {};
  return normalizeKitMode(guildKitModes[guildId]);
}

function setGuildKitMode(guildId, mode) {
  if (!guildId) return;
  guildKitModes[guildId] = normalizeKitMode(mode);
  saveData();
  return guildKitModes[guildId];
}

// Panel tarixiga voqea yozadi. Kit faqat 8 ta asosiy server uchun belgilanadi.
function logPanelEvent(type, guildId, fields = {}) {
  panelEvents.record(type, { guildId, kit: KNOWN_GUILD_KIT_MODE_BY_ID[guildId] || null, ...fields });
}

function setLastTestTime(guildId, userId, timestamp = Date.now()) {
  if (!guildId || !userId) return null;
  if (!lastTestTime[guildId]) lastTestTime[guildId] = {};
  lastTestTime[guildId][userId] = timestamp;
  return timestamp;
}

function formatLastTestDate(timestamp) {
  if (!timestamp) return 'Hech qachon test bermagan.';
  return new Date(timestamp).toLocaleString('uz-UZ', {
    dateStyle: 'long',
    timeStyle: 'short'
  });
}

function getGuildData(guildId) {
  if (!queues[guildId]) queues[guildId] = [];
  if (!activeTests[guildId]) activeTests[guildId] = [];
  ensureGuildCooldownStore(guildId);
  if (!verifiedUsers[guildId]) verifiedUsers[guildId] = {};
  if (!userTiers[guildId]) userTiers[guildId] = {};
  if (!lastTestTime[guildId]) lastTestTime[guildId] = {};
  if (!activeTestersSet[guildId]) activeTestersSet[guildId] = new Set();
  if (testersOnline[guildId] === undefined) testersOnline[guildId] = false;
  if (manualQueueClosed[guildId] === undefined) manualQueueClosed[guildId] = false;
  if (!highTestTickets[guildId]) highTestTickets[guildId] = {};
  if (!testCounts[guildId]) testCounts[guildId] = {};
  if (!guildKitModes[guildId]) guildKitModes[guildId] = getDefaultGuildKitMode(guildId);
  for (const uid in testCounts[guildId]) {
    const stats = testCounts[guildId][uid];
    if (!stats.lastMonthlyReset) stats.lastMonthlyReset = Date.now();
    const now = new Date();
    const lastReset = new Date(stats.lastMonthlyReset);
    if (now.getUTCMonth() !== lastReset.getUTCMonth() || now.getUTCFullYear() !== lastReset.getUTCFullYear()) {
      stats.monthly = 0;
      stats.lastMonthlyReset = Date.now();
    }
  }
  return {
    queue: queues[guildId],
    activeTests: activeTests[guildId],
    cooldowns: cooldowns[guildId],
    verifiedUsers: verifiedUsers[guildId],
    userTiers: userTiers[guildId],
    activeTestersSet: activeTestersSet[guildId],
    testersOnline: testersOnline[guildId],
    lastTestTime: lastTestTime[guildId],
    highTestTickets: highTestTickets[guildId],
    testCounts: testCounts[guildId],
    restrictedUsers: restrictedUsers[guildId]
  };
}

function getGlobalRestrictionStore() {
  if (!restrictedUsers.__global) restrictedUsers.__global = {};
  return restrictedUsers.__global;
}

function getRestrictionRecord(guildId, userId) {
  return getGlobalRestrictionStore()[userId] || null;
}

function getRestrictionRemainingMs(guildId, userId) {
  const record = getRestrictionRecord(guildId, userId);
  if (!record?.endsAt) return 0;
  const remaining = record.endsAt - Date.now();
  return remaining > 0 ? remaining : 0;
}

function formatRestrictRemaining(ms) {
  const monthMs = 30 * 24 * 60 * 60 * 1000;
  const dayMs = 24 * 60 * 60 * 1000;
  const hourMs = 60 * 60 * 1000;

  const months = Math.floor(ms / monthMs);
  const days = Math.floor((ms % monthMs) / dayMs);
  const hours = Math.floor((ms % dayMs) / hourMs);

  return `${months} oy ${days} kun ${hours} soat`;
}

function setRestriction(userId, months, reason, setterId = null, savedTiers = {}) {
  const durationMs = months * 30 * 24 * 60 * 60 * 1000;
  const endsAt = Date.now() + durationMs;
  const record = {
    months,
    reason,
    setAt: Date.now(),
    endsAt,
    setterId,
    savedTiers
  };
  getGlobalRestrictionStore()[userId] = record;
  saveData();
  return record;
}

function clearRestriction(userId) {
  const globalStore = getGlobalRestrictionStore();
  const record = globalStore[userId];
  if (!record) return null;
  delete globalStore[userId];
  saveData();
  return record;
}

async function clearRestrictionIfExpired(guild, userId) {
  const record = getRestrictionRecord(guild.id, userId);
  if (!record) return false;
  if (record.endsAt > Date.now()) return false;

  await restoreRestrictedUser(userId, clearRestriction(userId));
  return true;
}

async function getActiveRestrictionRemaining(guild, userId) {
  const guildId = guild.id;
  await clearRestrictionIfExpired(guild, userId);
  return getRestrictionRemainingMs(guildId, userId);
}

async function sweepExpiredRestrictions() {
  for (const userId of Object.keys(getGlobalRestrictionStore())) {
    if (getGlobalRestrictionStore()[userId]?.endsAt <= Date.now()) {
      await restoreRestrictedUser(userId, clearRestriction(userId));
    }
  }
}

async function collectStoredTiers(userId) {
  const savedTiers = {};
  for (const [guildId, tiers] of Object.entries(userTiers)) {
    const tier = tiers?.[userId];
    if (tierRoleNames.includes(tier)) savedTiers[guildId] = tier;
  }
  for (const [guildId, tier] of Object.entries(userProfiles[userId]?.tierByGuild || {})) {
    if (tierRoleNames.includes(tier) && !savedTiers[guildId]) savedTiers[guildId] = tier;
  }
  for (const guild of client.guilds.cache.values()) {
    const targetMember = await guild.members.fetch(userId).catch(() => null);
    const tier = targetMember && tierRoleNames.find(tierName => targetMember.roles.cache.some(role => role.name === tierName));
    if (tier) savedTiers[guild.id] = tier;
  }
  return savedTiers;
}

async function applyRestrictionToMember(member) {
  const guild = member.guild;
  const restrictedRole = guild.roles.cache.find(r => r.name === BOT_CONFIG.roleNames.restricted);
  if (restrictedRole && !member.roles.cache.has(restrictedRole.id)) await member.roles.add(restrictedRole).catch(() => { });
  for (const tierName of tierRoleNames) {
    const tierRole = guild.roles.cache.find(r => r.name === tierName);
    if (tierRole && member.roles.cache.has(tierRole.id)) await member.roles.remove(tierRole).catch(() => { });
  }
  const whitelistRole = guild.roles.cache.find(r => r.name === BOT_CONFIG.roleNames.whitelist);
  if (whitelistRole && member.roles.cache.has(whitelistRole.id)) await member.roles.remove(whitelistRole).catch(() => { });
}

async function applyGlobalRestriction(userId, record) {
  for (const guild of client.guilds.cache.values()) {
    const guildId = guild.id;
    const data = getGuildData(guildId);
    data.queue = data.queue.filter(player => player.userId !== userId);
    queues[guildId] = data.queue;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member) await applyRestrictionToMember(member);
    await updateQueueMessage(guild);
  }
  for (const guildId of Object.keys(userTiers)) delete userTiers[guildId]?.[userId];
  if (userProfiles[userId]) {
    delete userProfiles[userId].tierByGuild;
    delete userProfiles[userId].effectiveTier;
    delete userProfiles[userId].effectiveTierSourceGuildId;
  }
  const nickname = userProfiles[userId]?.nickname || findLegacyNicknameAcrossGuilds(userId);
  if (nickname) {
    for (const guildId of Object.keys(record.savedTiers || {})) await db.deleteTier(nickname, getGuildKitMode(guildId)).catch(() => { });
  }
  saveData();
}

async function restoreRestrictedUser(userId, record) {
  if (!record) return;
  const nickname = userProfiles[userId]?.nickname || findLegacyNicknameAcrossGuilds(userId);

  // A user may not have had a tier in every kit server, but restriction is global.
  // Remove Cheklangan everywhere before restoring only the tiers that were saved.
  for (const guild of client.guilds.cache.values()) {
    const targetMember = await guild.members.fetch(userId).catch(() => null);
    if (!targetMember) continue;
    const restrictedRole = guild.roles.cache.find(role => role.name === BOT_CONFIG.roleNames.restricted);
    if (restrictedRole && targetMember.roles.cache.has(restrictedRole.id)) {
      await targetMember.roles.remove(restrictedRole).catch(() => { });
    }
  }

  for (const [guildId, tier] of Object.entries(record.savedTiers || {})) {
    if (!tierRoleNames.includes(tier)) continue;
    if (!userTiers[guildId]) userTiers[guildId] = {};
    userTiers[guildId][userId] = tier;
    if (!userProfiles[userId]) userProfiles[userId] = {};
    if (!userProfiles[userId].tierByGuild) userProfiles[userId].tierByGuild = {};
    userProfiles[userId].tierByGuild[guildId] = tier;
    if (nickname) await db.setTier(nickname, tier, getGuildKitMode(guildId)).catch(() => { });
    const guild = client.guilds.cache.get(guildId);
    const targetMember = guild && await guild.members.fetch(userId).catch(() => null);
    if (!targetMember) continue;
    await restoreStoredTierForMember(targetMember);
  }
  saveData();
}

async function syncVerifiedProfile(guildId, userId, nickname, verifiedAt = Date.now()) {
  if (!guildId || !userId || !nickname) return null;
  const profile = upsertUserVerificationProfile(userProfiles, userId, guildId, nickname, verifiedAt);
  // Global profilda ham eng oxirgi nik turishi kerak (aks holda /nickname dan keyin eski nik qaytib qoladi).
  profile.nickname = nickname;
  if (!verifiedUsers[guildId]) verifiedUsers[guildId] = {};
  verifiedUsers[guildId][userId] = {
    ...verifiedUsers[guildId][userId],
    nickname,
    verifiedAt: profile.verifiedAt,
    preferredServer: verifiedUsers[guildId][userId]?.preferredServer || null
  };
  saveData();
  return profile;
}

function findLegacyNicknameAcrossGuilds(userId) {
  if (!userId) return null;
  for (const users of Object.values(verifiedUsers || {})) {
    const nickname = users?.[userId]?.nickname;
    if (nickname) return nickname;
  }
  return null;
}

// Nik boshqa foydalanuvchida (istalgan serverda) band ekanini tekshiradi.
function isNicknameTaken(nickname, exceptUserId = null) {
  const target = String(nickname || '').toLowerCase();
  if (!target) return false;
  for (const [userId, profile] of Object.entries(userProfiles)) {
    if (userId !== exceptUserId && profile?.nickname?.toLowerCase() === target) return true;
  }
  for (const users of Object.values(verifiedUsers)) {
    for (const [userId, record] of Object.entries(users || {})) {
      if (userId !== exceptUserId && record?.nickname?.toLowerCase() === target) return true;
    }
  }
  return false;
}

// Eski xato: /nickname global profildagi nikni yangilamas edi va ba'zi serverlarda eski nik qaytib qolardi.
// Agar serverlarda bitta yangi nik bo'lsa (va o'yinchi nikni almashtirgani aniq bo'lsa), hamma joyga o'shani yozamiz.
function repairStaleNicknames() {
  const repaired = [];
  for (const [userId, profile] of Object.entries(userProfiles)) {
    if (!profile?.nickname) continue;
    const globalNick = profile.nickname.toLowerCase();
    const records = Object.values(verifiedUsers).map(users => users?.[userId]?.nickname).filter(Boolean);
    const newerNicks = new Map();
    for (const nick of records) {
      if (nick.toLowerCase() !== globalNick) newerNicks.set(nick.toLowerCase(), nick);
    }
    if (newerNicks.size !== 1) continue;
    const usedNicknameCommand = Boolean(cooldowns.__global?.nickname?.[userId]);
    const allServersAgree = records.every(nick => nick.toLowerCase() !== globalNick);
    if (!usedNicknameCommand && !allServersAgree) continue;
    const currentNick = [...newerNicks.values()][0];
    const oldNick = profile.nickname;
    profile.nickname = currentNick;
    for (const [guildId, users] of Object.entries(verifiedUsers)) {
      if (users?.[userId]?.nickname) users[userId].nickname = currentNick;
      if (profile.guilds?.[guildId]) profile.guilds[guildId].nickname = currentNick;
    }
    repaired.push({ userId, oldNick, currentNick });
  }
  return repaired;
}

// Eski nikdagi barcha kit tierlarini (MySQL) yangi nikka ko'chiradi.
async function moveTiersToNewNickname(oldNick, newNick, guildId) {
  await db.ensurePlayer(oldNick);
  const modes = new Set([getGuildKitMode(guildId), ...Object.values(KNOWN_GUILD_KIT_MODE_BY_ID).map(normalizeKitMode)]);
  for (const mode of modes) {
    const oldTier = await db.getTier(oldNick, mode);
    if (!oldTier) continue;
    await db.setTier(newNick, oldTier, mode);
    await db.deleteTier(oldNick, mode).catch(() => { });
  }
}

async function resolveVerifiedNickname(guildId, userId, fallbackNickname = null) {
  const guildRecord = verifiedUsers[guildId]?.[userId];
  const globalProfile = userProfiles[userId];
  const legacyNickname = findLegacyNicknameAcrossGuilds(userId);
  const nickname = globalProfile?.nickname || guildRecord?.nickname || legacyNickname || fallbackNickname;
  if (nickname) {
    await syncVerifiedProfile(guildId, userId, nickname, guildRecord?.verifiedAt || globalProfile?.verifiedAt || Date.now());
  }
  return nickname || null;
}

// Tester arizasi uchun faqat shu serverdagi daraja hisoblanadi, boshqa serverlardagi tierlar hisobga olinmaydi.
// Saqlangan tier bo'lsa u asosiy; bo'lmasa shu serverdagi tier roli tekshiriladi.
function hasTesterTierOnThisServer(member) {
  const storedTier = userTiers[member.guild.id]?.[member.id];
  if (storedTier) return isEligibleForTesterTier(storedTier);
  return highTestEligible.some(tierName => member.roles.cache.some(r => r.name === tierName));
}

async function setUserTierProfile(userId, guildId, tier) {
  if (!userId || !guildId || !tier) return null;
  if (!userProfiles[userId]) userProfiles[userId] = {};
  userProfiles[userId].effectiveTier = tier;
  userProfiles[userId].effectiveTierSourceGuildId = guildId;
  if (!userProfiles[userId].tierByGuild) userProfiles[userId].tierByGuild = {};
  userProfiles[userId].tierByGuild[guildId] = tier;
  saveData();
  return userProfiles[userId];
}

async function restoreStoredTierForMember(member) {
  if (!member || !member.guild) return null;
  if (getRestrictionRecord(member.guild.id, member.id)?.endsAt > Date.now()) {
    await applyRestrictionToMember(member);
    return null;
  }
  const guildId = member.guild.id;
  const storedTier = userTiers[guildId]?.[member.id];
  if (!storedTier || !tierRoleNames.includes(storedTier)) return null;

  const tierRole = member.guild.roles.cache.find(r => r.name === storedTier);
  if (!tierRole) return null;

  for (const tierName of tierRoleNames) {
    if (tierName === storedTier) continue;
    const otherRole = member.guild.roles.cache.find(r => r.name === tierName);
    if (otherRole && member.roles.cache.has(otherRole.id)) {
      await member.roles.remove(otherRole).catch(() => { });
    }
  }

  if (!member.roles.cache.has(tierRole.id)) {
    await member.roles.add(tierRole).catch(() => { });
  }

  return storedTier;
}

// Cooldown helpers
function ensureGuildCooldownStore(guildId) {
  if (!cooldowns[guildId]) cooldowns[guildId] = {};
  for (const category of BOT_CONFIG.cooldownCategories) {
    if (!cooldowns[guildId][category]) cooldowns[guildId][category] = {};
  }
  return cooldowns[guildId];
}

function ensureGlobalCooldownStore(category) {
  if (!cooldowns.__global) cooldowns.__global = {};
  if (!cooldowns.__global[category]) cooldowns.__global[category] = {};
  return cooldowns.__global[category];
}

// Cooldown davomiyligi (kun): panelda yozilgan bo'lsa o'sha, bo'lmasa avvalgi qiymat.
function cooldownDaysFor(guildId, category) {
  const kit = getGuildKitMode(guildId);
  const configured = category === 'nickname' ? null : panelSettings.cooldownDays(kit, category);
  if (configured) return configured;
  return ['test', 'high_test'].includes(category) ? (BOT_CONFIG.testCooldownDaysByKit[kit] || BOT_CONFIG.cooldownDurations.test) : BOT_CONFIG.cooldownDurations[category];
}

function getCooldownRemaining(guildId, userId, category) {
  const start = category === 'nickname'
    ? ensureGlobalCooldownStore('nickname')[userId]
    : ensureGuildCooldownStore(guildId)?.[category]?.[userId];
  if (!start) return 0;
  const durationDays = cooldownDaysFor(guildId, category);
  const duration = durationDays * 24 * 60 * 60 * 1000;
  const remaining = duration - (Date.now() - start);
  return remaining > 0 ? remaining : 0;
}
function formatCooldown(ms) {
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  return `${days} kun ${hours} soat ${minutes} minut`;
}
function setCooldown(guildId, userId, category, customDays = null) {
  const guildCooldowns = ensureGuildCooldownStore(guildId);
  let adjustedStart;
  if (customDays !== null) {
    const defaultDays = cooldownDaysFor(guildId, category);
    const defaultDur = defaultDays * 24 * 60 * 60 * 1000;
    const customDur = customDays * 24 * 60 * 60 * 1000;
    adjustedStart = Date.now() - (defaultDur - customDur);
  } else {
    adjustedStart = Date.now();
  }
  if (category === 'nickname') {
    ensureGlobalCooldownStore('nickname')[userId] = adjustedStart;
  } else {
    guildCooldowns[category][userId] = adjustedStart;
  }
  saveData();
}

// Role helpers
const staffRoles = ['OWNER', 'Network Admin', 'Manager', 'Administrator', 'Moderator'];
const testerRoles = ['Senior Tester', 'Tester Tasdiqluvchi', 'Tasdiqlangan Tester'];
const highTestEligible = ['LT3', 'HT3', 'LT2', 'HT2', 'LT1', 'HT1'];
const highTestStaff = ['UzTiers', 'OWNER', 'Network Admin', 'Manager', 'Administrator', 'Moderator', 'Senior Tester'];
const tierRoleNames = ['LT5', 'HT5', 'LT4', 'HT4', 'LT3', 'HT3', 'LT2', 'HT2', 'LT1', 'HT1'];
const fullTierOrder = ['LT5', 'HT5', 'LT4', 'HT4', 'LT3', 'HT3', 'LT2', 'HT2', 'LT1', 'HT1', 'A\'zo', 'Tasdiqlangan Tester', 'Tester Tasdiqluvchi', 'Senior Tester', 'Moderator'];

function isStaff(member) { return panelRules.bestRankOf(member) >= panelRules.MODERATOR_RANK; }
function isTester(member) { return member.roles.cache.some(r => testerRoles.includes(r.name)); }
function isHighTestStaff(member) { return member.roles.cache.some(r => highTestStaff.includes(r.name)); }
function canManageTicketParticipants(member) { return member.roles.cache.some(r => highTestStaff.includes(r.name)); }
function isAdminCmd(member) { return panelRules.bestRankOf(member) >= panelRules.ADMIN_RANK; }
function isManagerCmd(member) { return panelRules.bestRankOf(member) >= panelRules.MANAGER_RANK; }
function isModCmd(member) { return panelRules.bestRankOf(member) >= panelRules.MODERATOR_RANK; }
function isSeniorCmd(member) { return member.roles.cache.some(r => ['Senior Tester', 'Tasdiqlangan Tester', 'Moderator', 'Administrator', 'Manager', 'Network Admin', 'OWNER'].includes(r.name)); }
function isAllowedCommandChannel(channel) {
  if (!channel) return false;
  return channel.name === BOT_CONFIG.channelNames.staffCommands || channel.name === '🔧┃commandlar';
}
function isTesterOnline(member) {
  if (!isTester(member)) return false;
  const status = member.presence?.status;
  return status && status !== 'offline' && status !== 'invisible';
}

function getNextHighTier(currentTier) {
  const mapping = { 'LT3': 'HT3', 'HT3': 'LT2', 'LT2': 'HT2', 'HT2': 'LT1', 'LT1': 'HT1' };
  return mapping[currentTier];
}
function getTierIndex(tierName) { return fullTierOrder.indexOf(tierName); }

// Leaderboard helpers
async function incrementTestCount(guildId, testerId) {
  const stats = testCounts[guildId];
  if (!stats[testerId]) {
    stats[testerId] = { total: 0, monthly: 0, lastMonthlyReset: Date.now() };
  }
  const now = new Date();
  const lastReset = new Date(stats[testerId].lastMonthlyReset);
  if (now.getUTCMonth() !== lastReset.getUTCMonth() || now.getUTCFullYear() !== lastReset.getUTCFullYear()) {
    stats[testerId].monthly = 0;
    stats[testerId].lastMonthlyReset = Date.now();
  }
  stats[testerId].total++;
  stats[testerId].monthly++;
  saveData();
  await updateLeaderboard(guildId);
}

async function refreshMonthlyLeaderboardState(guildId) {
  const stats = testCounts[guildId] || {};
  const now = new Date();
  let shouldReset = false;
  for (const stat of Object.values(stats)) {
    const lastReset = new Date(stat.lastMonthlyReset || Date.now());
    if (now.getUTCMonth() !== lastReset.getUTCMonth() || now.getUTCFullYear() !== lastReset.getUTCFullYear()) {
      stat.monthly = 0;
      stat.lastMonthlyReset = Date.now();
      shouldReset = true;
    }
  }
  if (shouldReset) saveData();
  if (shouldReset) await updateLeaderboard(guildId);
}

// Kanaldagi botning tugmali (yoki container) oxirgi xabarini topadi.
// Restartdan keyin yangi xabar yubormasdan, eskisini tahrirlash uchun kerak.
async function findLatestBotMessage(channel) {
  const msgs = await channel.messages.fetch({ limit: 20 }).catch(() => null);
  return msgs?.find(msg => msg.author.id === client.user.id && msg.components.length) || null;
}

async function updateLeaderboard(guildId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;
  const leaderboardChannel = guild.channels.cache.find(ch => ch.name === '📈┃leaderboard');
  if (!leaderboardChannel) return;
  const stats = testCounts[guildId] || {};
  const allTesters = Object.entries(stats)
    .map(([userId, data]) => ({ userId, total: data.total || 0, monthly: data.monthly || 0 }));
  const totalSorted = [...allTesters].sort((a, b) => b.total - a.total).slice(0, 10);
  // Oylik ro'yxat barcha testerlardan tuziladi (faqat umumiy top 10 dan emas).
  const monthlySorted = allTesters.filter(u => u.monthly > 0).sort((a, b) => b.monthly - a.monthly).slice(0, 10);
  const monthNames = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr'];
  const currentMonth = monthNames[new Date().getUTCMonth()];
  const totalMonthlyTests = Object.values(stats).reduce((sum, d) => sum + (d.monthly || 0), 0);

  const totalLines = totalSorted.map((u, i) => `${i + 1}. <@${u.userId}> — **${u.total}** ta test`).join('\n');
  const monthlyLines = monthlySorted.map((u, i) => `${i + 1}. <@${u.userId}> — **${u.monthly}** ta test`).join('\n');

  const container = new ContainerBuilder().setAccentColor(0xFFA500);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🏆 Umumiy Sinovlar Yetakchilari\n\n${totalLines || 'Hali testar yoq'}`));
  container.addSeparatorComponents(sep => sep.setSpacing(2));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🏅 ${currentMonth} oyi testlari Yetakchilari\n\n${monthlyLines || 'Hali testar yoq'}`));
  container.addSeparatorComponents(sep => sep.setSpacing(1));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`${currentMonth} oyidagi Umumiy Testlar: **${totalMonthlyTests}**`));

  const payload = { flags: MessageFlags.IsComponentsV2, components: [container] };
  let existing = null;
  if (leaderboardMessageId[guildId]) existing = await leaderboardChannel.messages.fetch(leaderboardMessageId[guildId]).catch(() => null);
  if (!existing) existing = await findLatestBotMessage(leaderboardChannel);
  if (existing) {
    await existing.edit(payload);
    leaderboardMessageId[guildId] = existing.id;
  } else {
    const newMsg = await leaderboardChannel.send(payload);
    leaderboardMessageId[guildId] = newMsg.id;
  }
}

// Ticket helpers
async function createModalTicket(interaction, categoryName, ticketNamePrefix, staffRolesArray, initialMessageBuilder) {
  const guild = interaction.guild;
  const category = guild.channels.cache.find(c => c.name === categoryName && c.type === ChannelType.GuildCategory);
  if (!category) throw new Error(`"${categoryName}" kategoriyasi topilmadi`);
  const ticketName = `${ticketNamePrefix}-${interaction.user.username}-${Date.now()}`;
  const ticketChannel = await guild.channels.create({
    name: ticketName,
    type: ChannelType.GuildText,
    parent: category,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      ...staffRolesArray.map(roleName => {
        const role = guild.roles.cache.find(r => r.name === roleName);
        return role ? { id: role.id, allow: [PermissionFlagsBits.ViewChannel] } : null;
      }).filter(Boolean)
    ]
  });
  await initialMessageBuilder(ticketChannel, interaction);
  return ticketChannel;
}

// Confirmation for closing tickets
let activeConfirmations = {};
const ticketCreateLocks = new Set();
const tempCloseTests = new Map();

function acquireTicketLock(guildId, userId, kind) {
  const key = `${guildId}:${userId}:${kind}`;
  if (ticketCreateLocks.has(key)) return null;
  ticketCreateLocks.add(key);
  return key;
}

function releaseTicketLock(lockKey) {
  if (!lockKey) return;
  ticketCreateLocks.delete(lockKey);
}

async function sendCloseConfirmation(channel, closer) {
  const container = new ContainerBuilder().setAccentColor(0xFFA500);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### Chipta yopilishini tasdiqlang\n<@${closer.id}> chiptani yopmoqchi.\n\n**Tasdiqlash**\nMa'muriyat yoki foydalanuvchi chipta yopilishini tasdiqlashi kerak.`));
  container.addSeparatorComponents(sep => sep.setSpacing(1));
  const confirmBtn = new ButtonBuilder().setCustomId(`confirm_close_yes:${channel.id}:${closer.id}`).setLabel('Tasdiqlash').setStyle(ButtonStyle.Success);
  const cancelBtn = new ButtonBuilder().setCustomId(`confirm_close_no:${channel.id}:${closer.id}`).setLabel('Bekor qilish').setStyle(ButtonStyle.Danger);
  container.addActionRowComponents(row => row.addComponents(confirmBtn, cancelBtn));
  const sentMsg = await channel.send({ flags: MessageFlags.IsComponentsV2, components: [container] });
  activeConfirmations[sentMsg.id] = { channel, closer, originalMessageId: sentMsg.id };
  return sentMsg;
}

// ======================= QUEUE DISPLAY =======================
async function updateQueueMessage(guild) {
  const guildId = guild.id;
  const data = getGuildData(guildId);
  const queueChannel = guild.channels.cache.find(ch => ch.name === '🏹┃navbat');
  if (!queueChannel) return;

  const look = panelSettings.panel(getGuildKitMode(guildId), 'queue');
  const container = new ContainerBuilder();
  if (!data.testersOnline) {
    container.setAccentColor(colorToInt(look.closedAccent));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${look.closedTitle}`));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(look.closedBody));
    container.addSeparatorComponents(sep => sep.setSpacing(1));
    const guildLastTests = lastTestTime[guildId] || {};
    const _lastTs = Object.values(guildLastTests).filter(Number.isFinite);
    const lastTimestamp = _lastTs.length ? Math.max(..._lastTs) : null;
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`Oxirgi test vaqti: ${lastTimestamp ? `<t:${Math.floor(lastTimestamp / 1000)}:F>` : 'Hali test bo\'lmagan'}`));
  } else {
    container.setAccentColor(colorToInt(look.openAccent));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${look.openTitle}\n${look.openBody}`));
    container.addSeparatorComponents(sep => sep.setSpacing(1));
    if (data.queue.length) {
      let queueList = '**Navbat:**\n' + data.queue.map((p, i) => `${i + 1}. <@${p.userId}>`).join('\n');
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(queueList));
      container.addSeparatorComponents(sep => sep.setSpacing(1));
    }
    let testersList = '**Aktiv Testerlar:**\n';
    const uniqueTesters = Array.from(data.activeTestersSet).map(id => `<@${id}>`);
    testersList += uniqueTesters.length ? uniqueTesters.map((t, i) => `${i + 1}. ${t}`).join('\n') : 'Yoq';
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(testersList));
    container.addSeparatorComponents(sep => sep.setSpacing(1));
    const kirish = new ButtonBuilder().setCustomId('join_queue_navbat').setLabel(look.joinButton).setStyle(ButtonStyle.Primary);
    const chiqish = new ButtonBuilder().setCustomId('leave_queue').setLabel(look.leaveButton).setStyle(ButtonStyle.Danger);
    container.addActionRowComponents(row => row.addComponents(kirish, chiqish));
  }
  const payload = { flags: MessageFlags.IsComponentsV2, components: [container], allowedMentions: { parse: ['users'] } };
  let existing = null;
  if (queueMessageId[guildId]) existing = await queueChannel.messages.fetch(queueMessageId[guildId]).catch(() => null);
  if (!existing) existing = await findLatestBotMessage(queueChannel);
  if (existing) {
    await existing.edit(payload);
    queueMessageId[guildId] = existing.id;
  } else {
    const newMsg = await queueChannel.send(payload);
    queueMessageId[guildId] = newMsg.id;
  }
  return { created: !existing, channelName: queueChannel.name };
}

async function openQueue(guild, sendMention = true) {
  const guildId = guild.id;
  const data = getGuildData(guildId);
  data.queue = [];
  queues[guildId] = [];
  manualQueueClosed[guildId] = false;
  if (!data.testersOnline) {
    data.testersOnline = true;
    testersOnline[guildId] = true;
    await updateQueueMessage(guild);
    if (sendMention) {
      const queueChannel = guild.channels.cache.find(ch => ch.name === '🏹┃navbat');
      if (queueChannel) {
        const whitelistRole = guild.roles.cache.find(r => r.name === 'Whitelist');
        if (whitelistRole) {
          const mentionMsg = await queueChannel.send({ content: `<@&${whitelistRole.id}>` });
          setTimeout(() => mentionMsg.delete().catch(() => { }), 3000);
        }
      }
    }
  }
}

async function closeQueue(guild) {
  const guildId = guild.id;
  const data = getGuildData(guildId);
  if (data.testersOnline) {
    data.testersOnline = false;
    testersOnline[guildId] = false;
    manualQueueClosed[guildId] = true;
    data.activeTestersSet.clear();
    activeTestersSet[guildId] = new Set();
    if (onlineTesterCache[guildId]) onlineTesterCache[guildId].clear();
    data.queue = [];
    queues[guildId] = [];
    await updateQueueMessage(guild);
  }
}

const onlineTesterCache = {};
async function updateTestersOnline(guild, updatedMember = null) {
  const guildId = guild.id;
  if (!onlineTesterCache[guildId]) onlineTesterCache[guildId] = new Set();
  const cache = onlineTesterCache[guildId];
  const data = getGuildData(guildId);
  let activeSetChanged = false;

  if (updatedMember) {
    const isNow = isTesterOnline(updatedMember);
    const was = cache.has(updatedMember.id);
    if (isNow && !was) {
      cache.add(updatedMember.id);
    } else if (!isNow && was) {
      cache.delete(updatedMember.id);
      if (data.activeTestersSet.delete(updatedMember.id)) activeSetChanged = true;
    } else if (!isNow && data.activeTestersSet.delete(updatedMember.id)) {
      activeSetChanged = true;
    }
  } else {
    try {
      const members = await guild.members.fetch();
      cache.clear();
      for (const m of members.values()) {
        if (isTesterOnline(m)) {
          cache.add(m.id);
        }
      }

      // Aktiv testerlar to'plamida faqat online qolganlar bo'lishi kerak.
      for (const testerId of Array.from(data.activeTestersSet)) {
        if (!cache.has(testerId)) {
          data.activeTestersSet.delete(testerId);
          activeSetChanged = true;
        }
      }
    } catch (err) { console.error(`Error fetching members for guild ${guildId}:`, err); }
  }

  if (activeSetChanged && data.testersOnline) {
    if (data.activeTestersSet.size === 0) {
      await closeQueue(guild);
    } else {
      await updateQueueMessage(guild);
    }
  }
}

// Regular test ticket creation
async function createTestTicket(interaction, player, tester) {
  const guild = interaction.guild;
  const category = guild.channels.cache.find(c => c.name === 'Testlar 🎫' && c.type === ChannelType.GuildCategory);
  if (!category) throw new Error('Testlar 🎫 kategoriyasi topilmadi');
  const ticketName = `test-${player.username}-${Date.now()}`;
  const ticketChannel = await guild.channels.create({
    name: ticketName,
    type: ChannelType.GuildText,
    parent: category,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: tester.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: player.userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      ...staffRoles.map(rn => { const r = guild.roles.cache.find(rr => rr.name === rn); return r ? { id: r.id, allow: [PermissionFlagsBits.ViewChannel] } : null; }).filter(Boolean)
    ]
  });
  panelTickets.open({ channelId: ticketChannel.id, guildId: guild.id, kind: 'regular', name: ticketName, playerId: player.userId, nickname: player.mcName, testerId: tester.id, currentTier: userTiers[guild.id]?.[player.userId] || null, server: player.server });
  const avatarURL = interaction.client.users.cache.get(player.userId)?.displayAvatarURL() || player.userId;
  const description = `Salom <@${player.userId}>. Sizning navbatdagi chiptangiz ochildi. Iltimos, kuting.\n\n` +
    `Chipta egasi: <@${player.userId}>\n` +
    `Nickname: **${player.mcName}**\n` +
    `Afzal ko'rilgan server: **${player.server}**\n` +
    `Yaratildi: <t:${Math.floor(Date.now() / 1000)}:R>`;
  const ticketEmbed = new EmbedBuilder()
    .setColor(0xFFA500)
    .setTitle('Navbatdagi Chipta')
    .setThumbnail(avatarURL)
    .setDescription(description);
  const ignoreButton = new ButtonBuilder().setCustomId(`ignore_${player.userId}`).setLabel('⚠️ Ignore').setStyle(ButtonStyle.Danger);
  const row = new ActionRowBuilder().addComponents(ignoreButton);
  await ticketChannel.send({ embeds: [ticketEmbed], components: [row] });
  return ticketChannel;
}

// High test ticket creation
async function createHighTestTicket(interaction, player, currentTier, targetTier) {
  const guild = interaction.guild;
  const category = guild.channels.cache.find(c => c.name === 'Yuqori Testlar' && c.type === ChannelType.GuildCategory);
  if (!category) throw new Error('Yuqori Testlar kategoriyasi topilmadi');
  const guildHighTests = highTestTickets[guild.id] || {};
  const existing = Object.values(guildHighTests).find(t => t.playerId === player.id);
  if (existing) throw new Error('existing_ticket');
  const nickname = verifiedUsers[guild.id]?.[player.id]?.nickname || player.user.username;
  const ticketName = `${targetTier}-${nickname}`;
  const ticketChannel = await guild.channels.create({
    name: ticketName,
    type: ChannelType.GuildText,
    parent: category,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: player.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      ...highTestStaff.map(roleName => {
        const role = guild.roles.cache.find(r => r.name === roleName);
        return role ? { id: role.id, allow: [PermissionFlagsBits.ViewChannel] } : null;
      }).filter(Boolean)
    ]
  });
  const guildData = getGuildData(guild.id);
  guildData.highTestTickets[ticketChannel.id] = {
    playerId: player.id,
    targetTier: targetTier,
    nickname: nickname,
    currentTier: currentTier
  };
  saveData();
  panelTickets.open({ channelId: ticketChannel.id, guildId: guild.id, kind: 'high', name: ticketName, playerId: player.id, nickname, currentTier, targetTier });
  const container = new ContainerBuilder().setAccentColor(0xFFA500);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### Yuqori Test: ${currentTier} → ${targetTier}\n<@${player.id}>. Sizning yuqori test chiptangiz ochildi.`));
  container.addSeparatorComponents(sep => sep.setSpacing(1));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('Administratorlar sizga raqib qo\'shishadi.\nIltimos sabrli bo\'ling.'));
  await ticketChannel.send({ flags: MessageFlags.IsComponentsV2, components: [container] });
  return ticketChannel;
}

// Ephemeral container helper
async function ephemeralContainer(interaction, content, accentColor, components = null) {
  const container = new ContainerBuilder().setAccentColor(accentColor);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
  if (components) container.addActionRowComponents(components);
  const payload = { flags: MessageFlags.IsComponentsV2 | 64, components: [container] };
  try {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply(payload);
    } else if (interaction.deferred && !interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.followUp(payload);
    }
  } catch (err) {
    if (err?.code === 40060) {
      // Race holatida interaction allaqachon acknowledged bo'lsa, fallback qilamiz.
      try {
        if (interaction.deferred && !interaction.replied) {
          await interaction.editReply(payload);
        } else {
          await interaction.followUp(payload);
        }
      } catch (_) { }
      return;
    }
    if (err?.code === 10062) return;
    throw err;
  }
}
async function embedReply(interaction, desc) {
  const embed = new EmbedBuilder().setColor(0xFFA500).setDescription(desc);
  if (interaction.replied || interaction.deferred) await interaction.editReply({ embeds: [embed] });
  else await interaction.reply({ embeds: [embed], flags: 64 });
}
async function logToChannel(guild, channelName, messageContent, containerColor = 0x5865F2) {
  const channel = guild.channels.cache.find(ch => ch.name === channelName);
  if (!channel) return;
  const container = new ContainerBuilder().setAccentColor(containerColor);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(messageContent));
  await channel.send({ flags: MessageFlags.IsComponentsV2, components: [container] });
}

async function logActionToChannel(guild, messageContent, containerColor = 0x5865F2) {
  const preferred = guild.channels.cache.find(ch => ch.name === 'uztiers-action-log')
    || guild.channels.cache.find(ch => ch.name === 'uztiers-action_log');
  if (preferred) {
    const container = new ContainerBuilder().setAccentColor(containerColor);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(messageContent));
    await preferred.send({ flags: MessageFlags.IsComponentsV2, components: [container] });
    return;
  }
  await logToChannel(guild, 'uztiers-action-log', messageContent, containerColor);
}

async function sendHighTestLt3Result(guild, playerId, testerId, nickname, achievedTier, color) {
  const resultsChannel = guild.channels.cache.find(channel => channel.name === BOT_CONFIG.channelNames.results);
  if (!resultsChannel) return;
  const player = await guild.members.fetch(playerId).catch(() => null);
  const skinUrl = `https://render.crafty.gg/3d/bust/${encodeURIComponent(nickname)}`;
  const resultEmbed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: `${nickname} ning Test Natijalari`, iconURL: player?.user?.displayAvatarURL() || client.users.cache.get(playerId)?.displayAvatarURL() })
    .setThumbnail(skinUrl)
    .addFields(
      { name: 'Tester:', value: `<@${testerId}>`, inline: false },
      { name: 'O\'yinchi Niki:', value: nickname, inline: false },
      { name: 'Oldingi Tier:', value: 'LT3', inline: false },
      { name: 'Qo\'lga kiritilgan Tier:', value: achievedTier, inline: false }
    );
  await resultsChannel.send({ content: `<@${playerId}>`, embeds: [resultEmbed] });
}

async function sendPunishmentMessage(guild, targetUser, nickname, reason, months = null) {
  const configuredChannelId = PUNISHMENT_CHANNEL_IDS[guild.id];
  const channel = configuredChannelId
    ? await guild.channels.fetch(configuredChannelId).catch(err => {
      console.error(`Jazolar channel fetch failed for ${guild.name} (${configuredChannelId}):`, err.message);
      return null;
    })
    : guild.channels.cache.find(ch => ch.name === '⛔┃jazolar' || ch.name === 'jazolar');
  if (!channel?.isTextBased()) {
    console.error(`Jazolar channel was not found or is not text-based for ${guild.name}.`);
    return false;
  }
  const restricted = months !== null;
  const status = restricted ? 'Cheklandi' : 'Cheklanishdan chiqdi';
  const details = restricted ? `Nickname:\n**${nickname}**\n\nSabab:\n${reason}\n\nMuddat:\n${months} oy\n\n-# ${targetUser.id}` : `Nickname:\n**${nickname}**\n\nSabab:\n${reason}\n\n-# ${targetUser.id}`;
  const container = new ContainerBuilder().setAccentColor(restricted ? 0xFF0000 : 0x5BC0DE);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### <@${targetUser.id}> ${restricted ? '⚠️' : '☑️'}`));
  container.addSeparatorComponents(separator => separator.setSpacing(1));
  container.addSectionComponents(section => section.addTextDisplayComponents(text => text.setContent(`## ${nickname} ${status}\n${details}`)).setThumbnailAccessory(new ThumbnailBuilder().setURL(`https://render.crafty.gg/3d/bust/${encodeURIComponent(nickname)}`)));
  try {
    await channel.send({ flags: MessageFlags.IsComponentsV2, components: [container] });
    return true;
  } catch (err) {
    console.error(`Jazolar message send failed for ${guild.name} (${channel.id}):`, err);
    return false;
  }
}

// ======================= MESSAGES =======================
// Matnlar va ranglar panelda o'zgartiriladi (panel/settings.js); yozilmagan bo'lsa asl matnlar ishlatiladi.
const panelLook = (guildId, id) => panelSettings.panel(getGuildKitMode(guildId), id);
function buildVerificationPayload(guildId) {
  const look = panelLook(guildId, 'verification');
  const imagePath = path.join(__dirname, 'TasdiqlashUztiers.jpg');
  const withImage = look.showImage && fs.existsSync(imagePath);
  if (look.showImage && !withImage) console.error(`Verification image not found at: ${imagePath}`);
  const container = new ContainerBuilder()
    .setAccentColor(colorToInt(look.accent))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${look.title}\n${look.body}`))
    .addSeparatorComponents(sep => sep.setSpacing(1));
  if (withImage) {
    container
      .addMediaGalleryComponents(gallery => gallery.addItems(new MediaGalleryItemBuilder().setURL('attachment://verification.jpg')))
      .addSeparatorComponents(sep => sep.setSpacing(1));
  }
  container.addActionRowComponents(row => row.addComponents(new ButtonBuilder().setCustomId('verify_me').setLabel(look.button).setStyle(ButtonStyle.Success)));
  const payload = { flags: MessageFlags.IsComponentsV2, components: [container], allowedMentions: { parse: [] } };
  return withImage ? { ...payload, files: [new AttachmentBuilder(imagePath, { name: 'verification.jpg' })] } : payload;
}
async function sendVerificationMessage(channel) {
  await channel.send(buildVerificationPayload(channel.guild.id));
}
function buildTestgaKirishPayload(guildId) {
  const look = panelLook(guildId, 'testEntry');
  const cooldownDays = cooldownDaysFor(guildId, 'test');
  const container = new ContainerBuilder().setAccentColor(colorToInt(look.accent));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${look.title}\n${look.body}`));
  container.addSeparatorComponents(sep => sep.setSpacing(1));
  if (look.high) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(look.high));
    container.addSeparatorComponents(sep => sep.setSpacing(1));
  }
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(look.cooldownLine.replace(/\{days\}/g, String(cooldownDays))));
  container.addSeparatorComponents(sep => sep.setSpacing(1));
  const navbatKirish = new ButtonBuilder().setCustomId('join_queue_button').setLabel(look.button).setStyle(ButtonStyle.Success);
  const yuqoriTestlar = new ButtonBuilder().setCustomId('high_test_button').setLabel(look.highButton).setStyle(ButtonStyle.Primary);
  container.addActionRowComponents(row => row.addComponents(navbatKirish, yuqoriTestlar));
  return { flags: MessageFlags.IsComponentsV2, components: [container], allowedMentions: { parse: [] } };
}
async function sendTestgaKirishMessage(channel) {
  await channel.send(buildTestgaKirishPayload(channel.guild.id));
}
async function refreshTestgaKirishMessage(channel) {
  const messages = await channel.messages.fetch({ limit: 50 });
  const botMessage = messages.find(message => message.author.id === client.user.id && message.components.length);
  if (botMessage) await botMessage.edit(buildTestgaKirishPayload(channel.guild.id));
  else await sendTestgaKirishMessage(channel);
}
function buildSupportPayload(guildId) {
  const look = panelLook(guildId, 'support');
  const container = new ContainerBuilder().setAccentColor(colorToInt(look.accent));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${look.title}\n${look.body}`));
  container.addSeparatorComponents(sep => sep.setSpacing(1));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(look.details));
  container.addSeparatorComponents(sep => sep.setSpacing(1));
  const yordamBtn = new ButtonBuilder().setCustomId('support_yordam').setLabel(look.helpButton).setStyle(ButtonStyle.Primary);
  const shikoyatBtn = new ButtonBuilder().setCustomId('support_shikoyat').setLabel(look.complaintButton).setStyle(ButtonStyle.Danger);
  container.addActionRowComponents(row => row.addComponents(yordamBtn, shikoyatBtn));
  return { flags: MessageFlags.IsComponentsV2, components: [container], allowedMentions: { parse: [] } };
}
async function sendSupportMessage(channel) {
  await channel.send(buildSupportPayload(channel.guild.id));
}
function buildTesterAppPayload(guildId) {
  const look = panelLook(guildId, 'testerApp');
  const isOpen = applicationOpen[guildId] !== false;
  const statusText = isOpen ? 'Ochiq <:yashil_nuqta:1512534180267823144>' : 'Yopiq <:kulrang_nuqta:1512534150081544282>';
  const container = new ContainerBuilder().setAccentColor(colorToInt(look.accent));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${look.title}\n${look.requirements}`));
  container.addSeparatorComponents(sep => sep.setSpacing(1));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(look.info));
  container.addSeparatorComponents(sep => sep.setSpacing(1));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`Status: ${statusText}`));
  container.addSeparatorComponents(sep => sep.setSpacing(1));
  const applyBtn = new ButtonBuilder().setCustomId('tester_apply').setLabel(look.button).setStyle(ButtonStyle.Success);
  if (!isOpen) applyBtn.setDisabled(true);
  container.addActionRowComponents(row => row.addComponents(applyBtn));
  return { flags: MessageFlags.IsComponentsV2, components: [container], allowedMentions: { parse: [] } };
}
async function sendTesterAppMessage(channel, guildId) {
  await channel.send(buildTesterAppPayload(guildId));
}
// Mavjud ariza xabarini hozirgi holatga (Ochiq/Yopiq) moslaydi, xabar bo'lmasa yangisini yuboradi.
async function refreshTesterAppMessage(channel, guildId) {
  const botMessage = await findLatestBotMessage(channel);
  if (botMessage) await botMessage.edit(buildTesterAppPayload(guildId));
  else await sendTesterAppMessage(channel, guildId);
}

// Discord oynalari (modal): matnlar paneldan, maydonlar soni va ID lari o'zgarmaydi.
const modalLook = (guildId, id) => panelSettings.modal(getGuildKitMode(guildId), id);
// Discord bo'sh namuna matnini qabul qilmaydi, shuning uchun faqat matn bo'lsa qo'yiladi.
function withPlaceholder(input, text) {
  const value = String(text || '').slice(0, 100);
  return value ? input.setPlaceholder(value) : input;
}
// Serverlar ro'yxati yozilgan bo'lsa, server oynasida namuna sifatida ko'rinadi.
function serverListHint(guildId) {
  const list = panelSettings.servers(getGuildKitMode(guildId));
  if (!list.length) return '';
  const text = `Masalan: ${list.map(s => s.ip).join(', ')}`;
  return text.length > 100 ? `${text.slice(0, 97)}...` : text;
}

// Panel "Discordga yuborish" tugmasi: bot xabarini yangi matn bilan tahrirlaydi, xabar bo'lmasa yangisini yuboradi.
const PANEL_CHANNEL_KEYS = { verification: 'verification', testEntry: 'testEntry', support: 'support', testerApp: 'testerApp' };
const PANEL_BUILDERS = { verification: buildVerificationPayload, testEntry: buildTestgaKirishPayload, support: buildSupportPayload, testerApp: buildTesterAppPayload };
async function actionRefreshPanel(guild, actorId, panelId) {
  try {
    if (panelId === 'queue') {
      const queueChannel = guild.channels.cache.find(ch => ch.name === '🏹┃navbat');
      if (!queueChannel) throw new ActionError('"🏹┃navbat" kanali bu serverda topilmadi.');
      return await updateQueueMessage(guild);
    }
    const channelName = BOT_CONFIG.channelNames[PANEL_CHANNEL_KEYS[panelId]];
    if (!channelName) throw new ActionError('Bunday panel yo\'q.');
    const channel = guild.channels.cache.find(ch => ch.name === channelName);
    if (!channel) throw new ActionError(`"${channelName}" kanali bu serverda topilmadi.`);
    const payload = PANEL_BUILDERS[panelId](guild.id);
    const existing = await findLatestBotMessage(channel);
    if (existing) await existing.edit(payload.files ? { ...payload, attachments: [] } : payload);
    else await channel.send(payload);
    return { created: !existing, channelName: channel.name };
  } catch (err) {
    if (err instanceof ActionError) throw err;
    throw new ActionError(`Discord xabarni qabul qilmadi: ${err.message}`);
  }
}

// Erkin panellar (axborot xabarlari): matn, ajratgich, rasm va havola tugmalari. Hech kimni ping qilmaydi.
function buildCustomPanelPayload(panel) {
  const container = new ContainerBuilder();
  if (panel.accent) container.setAccentColor(colorToInt(panel.accent));
  for (const block of panel.blocks) {
    if (block.type === 'text') container.addTextDisplayComponents(new TextDisplayBuilder().setContent(block.content));
    else if (block.type === 'separator') container.addSeparatorComponents(sep => sep.setSpacing(block.large ? 2 : 1).setDivider(block.divider !== false));
    else if (block.type === 'image') container.addMediaGalleryComponents(gallery => gallery.addItems(new MediaGalleryItemBuilder().setURL(block.url)));
    else if (block.type === 'buttons') container.addActionRowComponents(row => row.addComponents(...block.items.map(item => new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(item.url).setLabel(item.label))));
  }
  return { flags: MessageFlags.IsComponentsV2, components: [container], allowedMentions: { parse: [] } };
}
async function actionPublishCustomPanel(guild, actorId, panel) {
  const channel = guild.channels.cache.get(panel.channelId);
  if (!channel || typeof channel.send !== 'function') throw new ActionError('Kanal topilmadi.');
  try {
    const payload = buildCustomPanelPayload(panel);
    let message = null;
    if (panel.messageId && panel.publishedChannelId) {
      const oldChannel = guild.channels.cache.get(panel.publishedChannelId);
      const old = oldChannel ? await oldChannel.messages.fetch(panel.messageId).catch(() => null) : null;
      if (old && panel.publishedChannelId === panel.channelId) {
        await old.edit(payload);
        message = old;
      } else if (old) {
        // Kanal almashtirilgan: eski xabar o'chiriladi, yangi kanalga yangi xabar yuboriladi.
        await old.delete().catch(() => { });
      }
    }
    const created = !message;
    if (!message) message = await channel.send(payload);
    return { messageId: message.id, channelName: channel.name, created };
  } catch (err) {
    throw new ActionError(`Discord xabarni qabul qilmadi: ${err.message}`);
  }
}
async function actionDeleteCustomPanelMessage(guild, panel) {
  const channel = guild.channels.cache.get(panel.publishedChannelId || panel.channelId);
  const message = channel && panel.messageId ? await channel.messages.fetch(panel.messageId).catch(() => null) : null;
  if (!message) return false;
  await message.delete();
  return true;
}

// ======================= XODIM AMALLARI =======================
// Discord komandalari ham, veb-panel ham shu funksiyalarni chaqiradi, shuning uchun natija bir xil bo'ladi.
// ActionError matni foydalanuvchiga ko'rsatiladi.
class ActionError extends Error { }

function viaNote(via) { return via === 'panel' ? ' (panel orqali)' : ''; }

async function fetchMemberOrFail(guild, userId, message = 'Foydalanuvchi topilmadi.') {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) throw new ActionError(message);
  return member;
}

function highestStaffRank(userId) {
  return panelRules.highestRank(client, KIT_GUILD_IDS, userId);
}
async function staffRankOnGuild(guild, userId) {
  const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
  return panelRules.bestRankOf(member);
}

// O'zidan past bo'lmagan xodimga hech qanday amal qo'llab bo'lmaydi (o'ziga qo'llash bundan mustasno).
async function assertCanTarget(guild, actorId, targetId) {
  if (actorId === targetId) return;
  const targetRank = highestStaffRank(targetId);
  if (targetRank < 0) return;
  const actorRank = Math.max(highestStaffRank(actorId), await staffRankOnGuild(guild, actorId));
  if (targetRank >= actorRank) throw new ActionError('Rolingiz sizdan past bo\'lmagan xodimga bu amalni qo\'llab bo\'lmaydi.');
}

function assertBotCanEditRole(role) {
  if (!role.editable) throw new ActionError(`Bot "${role.name}" rolini o'zgartira olmaydi: Discord'da bot roli undan yuqorida turishi kerak.`);
}

function currentTierOf(guild, member) {
  const stored = userTiers[guild.id]?.[member.id];
  if (stored) return stored;
  for (const tier of [...tierRoleNames].reverse()) {
    const role = guild.roles.cache.find(r => r.name === tier);
    if (role && member.roles.cache.has(role.id)) return tier;
  }
  return null;
}

// Bir vaqtda kelgan ikkinchi so'rov birinchisi bazaga yozilishini kutmasdan to'xtatiladi.
const TIER_GUARD_MS = 60 * 1000;
const tierChangeGuard = new Map();

// Manager'dan past xodim darajani faqat bir qadamga va bir o'yinchiga kuniga bir marta o'zgartira oladi.
async function assertTierChangeAllowed(guild, actorId, targetId, currentTier, newTier) {
  if (await staffRankOnGuild(guild, actorId) >= panelRules.MANAGER_RANK) return;
  if (actorId === targetId) throw new ActionError('O\'z darajangizni o\'zgartira olmaysiz. Bu uchun Manager kerak.');
  if (!panelRules.isOneStep(currentTier, newTier)) {
    const { down, up } = panelRules.neighbourTiers(currentTier);
    const allowed = [down, up].filter(Boolean).join(' yoki ');
    throw new ActionError(`Administrator darajani faqat bir qadamga o'zgartira oladi (${currentTier || 'darajasi yo\'q'} → ${allowed}). Katta o'zgarish uchun Manager kerak.`);
  }
  const kit = KNOWN_GUILD_KIT_MODE_BY_ID[guild.id];
  if (!kit) return;
  let recent;
  try {
    recent = await panelEvents.listEvents({ targetId, kit, types: ['tier_set', 'tier_demote'], from: Date.now() - panelRules.TIER_LIMIT_MS, limit: 50 });
  } catch (err) {
    throw new ActionError('Oxirgi o\'zgarishlarni tekshirib bo\'lmadi. Birozdan keyin urinib ko\'ring.');
  }
  const until = panelRules.tierLockUntil(recent, highestStaffRank);
  if (until) throw new ActionError(`Bu o'yinchining darajasi yaqinda o'zgartirilgan. Keyingi o'zgartirish ${Math.ceil((until - Date.now()) / 3600000)} soatdan keyin mumkin yoki Manager o'zgartira oladi.`);
  const guardKey = `${guild.id}:${targetId}`;
  if (Date.now() - (tierChangeGuard.get(guardKey) || 0) < TIER_GUARD_MS) throw new ActionError('Bu o\'yinchining darajasi hozirgina o\'zgartirilmoqda. Birozdan keyin urinib ko\'ring.');
  tierChangeGuard.set(guardKey, Date.now());
}

async function actionSetTier(guild, actorId, targetId, tier, via = 'bot') {
  const guildId = guild.id;
  const targetMember = await fetchMemberOrFail(guild, targetId);
  await assertCanTarget(guild, actorId, targetId);
  await assertTierChangeAllowed(guild, actorId, targetId, currentTierOf(guild, targetMember), tier);
  const newRole = guild.roles.cache.find(r => r.name === tier);
  if (!newRole) throw new ActionError('Tier roli topilmadi. Iltimos, serverdagi tier rollarini tekshiring.');
  assertBotCanEditRole(newRole);
  for (const tierName of tierRoleNames) {
    const role = guild.roles.cache.find(r => r.name === tierName);
    if (role && targetMember.roles.cache.has(role.id)) await targetMember.roles.remove(role).catch(() => { });
  }
  await targetMember.roles.add(newRole).catch(() => { });
  const verifiedNick = verifiedUsers[guildId]?.[targetId]?.nickname;
  if (verifiedNick) {
    try {
      await db.setTier(verifiedNick, tier, getGuildKitMode(guildId));
    } catch (err) {
      if (err instanceof db.PlayerNotFoundError) console.warn(`MySQL: o'yinchi topilmadi (${verifiedNick}) — tier faqat Discordda berildi.`);
      else console.error('MySQL setSwordTier (tier) xatosi:', err.message);
    }
  }
  const whitelistRole = guild.roles.cache.find(r => r.name === 'Whitelist');
  if (whitelistRole && targetMember.roles.cache.has(whitelistRole.id)) await targetMember.roles.remove(whitelistRole).catch(() => { });
  if (!userTiers[guildId]) userTiers[guildId] = {};
  logPanelEvent('tier_set', guildId, { source: via, actorId, targetId, nickname: verifiedNick, oldValue: userTiers[guildId][targetId] || null, newValue: tier });
  userTiers[guildId][targetId] = tier;
  await setUserTierProfile(targetId, guildId, tier);
  setLastTestTime(guildId, targetId);
  saveData();
  await logActionToChannel(guild, `<@${actorId}> \`/tier\` komandasini <@${targetId}> ga \`${tier}\` darajasini berish uchun ishlatdi.${viaNote(via)}`, 0x5865F2);
}

// Qaytaradi: oldingi daraja.
async function actionDemote(guild, actorId, targetId, newTier, via = 'bot') {
  const guildId = guild.id;
  const targetMember = await fetchMemberOrFail(guild, targetId);
  let currentTier = null;
  for (const tier of fullTierOrder) {
    const role = guild.roles.cache.find(r => r.name === tier);
    if (role && targetMember.roles.cache.has(role.id)) {
      currentTier = tier;
      break;
    }
  }
  if (!currentTier) throw new ActionError('Hozirgi daraja topilmadi.');
  if (getTierIndex(newTier) >= getTierIndex(currentTier)) throw new ActionError(`Yangi daraja (${newTier}) hozirgi darajadan (${currentTier}) yuqori yoki teng. Demote faqat pasaytirish uchun ishlatiladi.`);
  await assertCanTarget(guild, actorId, targetId);
  await assertTierChangeAllowed(guild, actorId, targetId, currentTierOf(guild, targetMember), newTier);
  const currentRole = guild.roles.cache.find(r => r.name === currentTier);
  const newRole = guild.roles.cache.find(r => r.name === newTier);
  if (currentRole) assertBotCanEditRole(currentRole);
  if (newRole) assertBotCanEditRole(newRole);
  if (currentRole) await targetMember.roles.remove(currentRole).catch(() => { });
  if (newRole) await targetMember.roles.add(newRole).catch(() => { });
  if (!userTiers[guildId]) userTiers[guildId] = {};
  userTiers[guildId][targetId] = newTier;
  // MySQL'ga yangi (pasaytirilgan) Sword tierini yozamiz (qo'shimcha).
  const demoteNick = verifiedUsers[guildId]?.[targetId]?.nickname;
  logPanelEvent('tier_demote', guildId, { source: via, actorId, targetId, nickname: demoteNick, oldValue: currentTier, newValue: newTier });
  if (demoteNick) {
    try {
      await db.setTier(demoteNick, newTier, getGuildKitMode(guildId));
    } catch (err) {
      if (!(err instanceof db.PlayerNotFoundError)) console.error('MySQL setSwordTier (demote) xatosi:', err.message);
    }
  }
  setLastTestTime(guildId, targetId);
  saveData();
  await logActionToChannel(guild, `<@${actorId}> \`/demote\` komandasini <@${targetId}> ga qo'lladi (${currentTier} → ${newTier}).${viaNote(via)}`, 0x5865F2);
  return currentTier;
}

// Qaytaradi: rol olib tashlandimi.
async function actionDeleteTier(guild, actorId, targetId, via = 'bot') {
  const guildId = guild.id;
  const targetMember = await fetchMemberOrFail(guild, targetId);
  if (await staffRankOnGuild(guild, actorId) < panelRules.MANAGER_RANK) throw new ActionError('Darajani o\'chirish faqat Manager va undan yuqori rollar uchun.');
  await assertCanTarget(guild, actorId, targetId);
  let removed = false;
  for (const tier of tierRoleNames) {
    const role = guild.roles.cache.find(r => r.name === tier);
    if (role && targetMember.roles.cache.has(role.id)) {
      await targetMember.roles.remove(role).catch(() => { });
      removed = true;
    }
  }
  if (removed || userTiers[guildId]?.[targetId]) {
    logPanelEvent('tier_delete', guildId, { source: via, actorId, targetId, nickname: verifiedUsers[guildId]?.[targetId]?.nickname, oldValue: userTiers[guildId]?.[targetId] || null });
  }
  if (userTiers[guildId]?.[targetId]) delete userTiers[guildId][targetId];
  if (userProfiles[targetId]?.tierByGuild?.[guildId]) delete userProfiles[targetId].tierByGuild[guildId];
  if (userProfiles[targetId]?.effectiveTierSourceGuildId === guildId) {
    delete userProfiles[targetId].effectiveTier;
    delete userProfiles[targetId].effectiveTierSourceGuildId;
  }
  saveData(); // o'chirilgan tier faylga yoziladi (oldin saqlanmasdi va restartdan keyin qaytib kelardi)
  const deleteNick = verifiedUsers[guildId]?.[targetId]?.nickname;
  if (deleteNick) {
    try {
      await db.deleteTier(deleteNick, getGuildKitMode(guildId));
    } catch (err) {
      if (!(err instanceof db.PlayerNotFoundError)) console.error('MySQL deleteSwordTier xatosi:', err.message);
    }
  }
  if (removed) await logActionToChannel(guild, `<@${actorId}> \`/deletetier\` komandasini <@${targetId}> ga qo'lladi.${viaNote(via)}`, 0x5865F2);
  return removed;
}

async function actionSetRetired(guild, actorId, targetId, retired, via = 'bot') {
  const guildId = guild.id;
  const targetMember = await fetchMemberOrFail(guild, targetId);
  await assertCanTarget(guild, actorId, targetId);
  const retiredRole = guild.roles.cache.find(r => r.name === 'Retired');
  if (!retiredRole) throw new ActionError('Retired roli topilmadi.');
  const nickname = verifiedUsers[guildId]?.[targetId]?.nickname;
  if (retired) {
    await targetMember.roles.add(retiredRole).catch(() => { });
  } else {
    await targetMember.roles.remove(retiredRole).catch(() => { });
    // MySQL'ga LT3 Sword tierini yozamiz (qo'shimcha).
    if (nickname) {
      try {
        await db.setTier(nickname, 'LT3', getGuildKitMode(guildId));
      } catch (err) {
        if (!(err instanceof db.PlayerNotFoundError)) console.error('MySQL setSwordTier (unretired) xatosi:', err.message);
      }
    }
  }
  logPanelEvent(retired ? 'retired' : 'unretired', guildId, { source: via, actorId, targetId, nickname });
  await logActionToChannel(guild, `<@${actorId}> \`/${retired ? 'retired' : 'unretired'}\` komandasini <@${targetId}> ga qo'lladi.${viaNote(via)}`, 0x5865F2);
}

async function actionSetCooldown(guild, actorId, targetId, category, days, via = 'bot') {
  if (!BOT_CONFIG.cooldownDurations[category]) throw new ActionError('Noto\'g\'ri kategoriya tanlandi.');
  if (days < 0) throw new ActionError('Kunlar soni 0 dan katta bo\'lishi kerak.');
  await assertCanTarget(guild, actorId, targetId);
  setCooldown(guild.id, targetId, category, days);
  logPanelEvent('cooldown_set', guild.id, { source: via, actorId, targetId, nickname: userProfiles[targetId]?.nickname, newValue: `${category} ${days} kun` });
  await logActionToChannel(guild, `<@${actorId}> \`/cd\` komandasini <@${targetId}> ga qo'lladi (${category}, ${days} kun).${viaNote(via)}`, 0x5865F2);
}

// Qaytaradi: cooldown bor edimi.
async function actionResetCooldown(guild, actorId, targetId, category, via = 'bot') {
  const guildId = guild.id;
  if (!BOT_CONFIG.cooldownDurations[category]) throw new ActionError('Noto\'g\'ri kategoriya tanlandi.');
  await assertCanTarget(guild, actorId, targetId);
  const isGlobal = category === 'nickname' && cooldowns.__global?.nickname?.[targetId];
  if (isGlobal) delete cooldowns.__global.nickname[targetId];
  else if (cooldowns[guildId]?.[category]?.[targetId]) delete cooldowns[guildId][category][targetId];
  else return false;
  saveData();
  logPanelEvent('cooldown_reset', guildId, { source: via, actorId, targetId, nickname: userProfiles[targetId]?.nickname, newValue: category });
  await logActionToChannel(guild, `<@${actorId}> \`/resetcooldown\` komandasini <@${targetId}> ga qo'lladi (${category}${isGlobal ? ', global' : ''}).${viaNote(via)}`, 0x5865F2);
  return true;
}

async function actionKickTester(guild, actorId, testerId, via = 'bot') {
  const guildId = guild.id;
  await fetchMemberOrFail(guild, testerId, 'Tester topilmadi.');
  await assertCanTarget(guild, actorId, testerId);
  const data = getGuildData(guildId);
  const idx = data.queue.findIndex(p => p.userId === testerId);
  if (idx !== -1) data.queue.splice(idx, 1);
  if (data.activeTestersSet.has(testerId)) data.activeTestersSet.delete(testerId);
  // Tester qolmasa navbat yopiladi.
  if (data.activeTestersSet.size === 0) await closeQueue(guild);
  else await updateQueueMessage(guild);
  logPanelEvent('kick_tester', guildId, { source: via, actorId, targetId: testerId, nickname: userProfiles[testerId]?.nickname });
  await logActionToChannel(guild, `<@${actorId}> \`/kicktester\` komandasini <@${testerId}> ga qo'lladi.${viaNote(via)}`, 0x5865F2);
}

async function actionRestrict(guild, actorId, targetId, months, reason, via = 'bot') {
  const guildId = guild.id;
  if (!BOT_CONFIG.restrictDurationsMonths.includes(months)) throw new ActionError('Noto\'g\'ri muddat tanlandi.');
  await assertCanTarget(guild, actorId, targetId);
  const targetUser = await client.users.fetch(targetId).catch(() => null);
  if (!targetUser) throw new ActionError('Foydalanuvchi topilmadi.');
  const savedTiers = await collectStoredTiers(targetId);
  const record = setRestriction(targetId, months, reason, actorId, savedTiers);
  await applyGlobalRestriction(targetId, record);
  const nickname = await resolveVerifiedNickname(guildId, targetId, targetUser.username);
  logPanelEvent('restrict', guildId, { kit: null, source: via, actorId, targetId, nickname, newValue: `${months} oy`, note: reason });
  await sendPunishmentMessage(guild, targetUser, nickname || targetUser.username, reason, months);
  await logActionToChannel(guild, `<@${actorId}> \`/restrict\` komandasini <@${targetId}> ga qo'lladi (${months} oy).${viaNote(via)}`, 0xFFA500);
}

async function actionUnrestrict(guild, actorId, targetId, reason, via = 'bot') {
  const guildId = guild.id;
  await assertCanTarget(guild, actorId, targetId);
  const targetUser = await client.users.fetch(targetId).catch(() => null);
  if (!targetUser) throw new ActionError('Foydalanuvchi topilmadi.');
  const record = clearRestriction(targetId);
  if (!record) throw new ActionError('Foydalanuvchi uchun aktiv cheklov mavjud emas.');
  await restoreRestrictedUser(targetId, record);
  const nickname = await resolveVerifiedNickname(guildId, targetId, targetUser.username);
  logPanelEvent('unrestrict', guildId, { kit: null, source: via, actorId, targetId, nickname, note: reason });
  await sendPunishmentMessage(guild, targetUser, nickname || targetUser.username, reason);
  await logActionToChannel(guild, `<@${actorId}> \`/unrestrict\` komandasini <@${targetId}> ga qo'lladi.${viaNote(via)}`, 0x5BC0DE);
}

async function actionSetApplication(guild, actorId, isOpen, via = 'bot') {
  const guildId = guild.id;
  applicationOpen[guildId] = isOpen;
  saveData(); // holat faylga yoziladi, restartdan keyin ham saqlanib qoladi
  const testerAppChannel = guild.channels.cache.find(ch => ch.name === BOT_CONFIG.channelNames.testerApp);
  if (testerAppChannel) await refreshTesterAppMessage(testerAppChannel, guildId);
  logPanelEvent('application', guildId, { source: via, actorId, newValue: isOpen ? 'ochiq' : 'yopiq' });
  if (via === 'panel') await logActionToChannel(guild, `<@${actorId}> tester arizasini ${isOpen ? 'ochdi' : 'yopdi'}.${viaNote(via)}`, 0x5865F2);
}

// Nik o'zgarishi xabarlari: eski nik qizil, yangi nik yashil belgi bilan.
const NICKNAME_LOG_COLOR = 0x3FBF8A;
const nicknameChanged = (oldNick, newNick) => Boolean(oldNick) && oldNick !== newNick;
const nicknameChangeText = (oldNick, newNick) => (nicknameChanged(oldNick, newNick)
  ? `nikini 🔴 \`${oldNick}\` dan 🟢 \`${newNick}\` ga o'zgartirdi`
  : `nikini 🟢 \`${newNick}\` ga o'zgartirdi`);
const nicknameArrow = (oldNick, newNick) => (nicknameChanged(oldNick, newNick)
  ? `🔴 \`${oldNick}\` ➜ 🟢 **\`${newNick}\`**`
  : `🟢 **\`${newNick}\`**`);

// Qaytaradi: eski nik (bo'lmasa null).
async function actionChangeNickname(guild, actorId, targetId, nicknameValue, via = 'bot') {
  const guildId = guild.id;
  if (!BOT_CONFIG.nickname.pattern.test(nicknameValue) || nicknameValue.length > BOT_CONFIG.nickname.maxLength) throw new ActionError(BOT_CONFIG.nickname.invalidMessage);
  if (isNicknameTaken(nicknameValue, targetId)) throw new ActionError('Bu nickname allaqachon ishlatilgan! Boshqa nickname tanlang.');
  await assertCanTarget(guild, actorId, targetId);
  const oldNick = await resolveVerifiedNickname(guildId, targetId);
  try {
    await db.ensurePlayer(nicknameValue);
    if (oldNick && oldNick.toLowerCase() !== nicknameValue.toLowerCase()) {
      await moveTiersToNewNickname(oldNick, nicknameValue, guildId);
    }
  } catch (err) {
    console.error('Admin nickname transfer xatosi:', err.message);
    throw new ActionError('Nicknameni o\'zgartirishda xatolik yuz berdi.');
  }
  for (const [otherGuildId, users] of Object.entries(verifiedUsers)) {
    if (!users?.[targetId]) continue;
    users[targetId] = { ...users[targetId], nickname: nicknameValue, verifiedAt: users[targetId].verifiedAt || Date.now() };
    await syncVerifiedProfile(otherGuildId, targetId, nicknameValue, users[targetId].verifiedAt);
  }
  await syncVerifiedProfile(guildId, targetId, nicknameValue, userProfiles[targetId]?.verifiedAt || Date.now());
  for (const targetGuild of client.guilds.cache.values()) {
    const targetMember = await targetGuild.members.fetch(targetId).catch(() => null);
    if (targetMember) await targetMember.setNickname(nicknameValue).catch(() => { });
  }
  saveData();
  logPanelEvent('nickname', guildId, { kit: null, source: via, actorId, targetId, nickname: nicknameValue, oldValue: oldNick, newValue: nicknameValue });
  const who = actorId === targetId ? `<@${targetId}>` : `<@${actorId}> <@${targetId}>`;
  await logActionToChannel(guild, `${who} ${nicknameChangeText(oldNick, nicknameValue)}.${viaNote(via)}`, NICKNAME_LOG_COLOR);
  return oldNick;
}

// Discord'ning o'z "timeout" funksiyasi. Eng ko'pi 28 kun.
async function actionMute(guild, actorId, targetId, minutes, reason, via = 'bot') {
  const targetMember = await fetchMemberOrFail(guild, targetId);
  await assertCanTarget(guild, actorId, targetId);
  try {
    await targetMember.timeout(minutes * 60 * 1000, reason || undefined);
  } catch (err) {
    throw new ActionError('Bot bu foydalanuvchini mute qila olmadi: ruxsat yoki rol darajasi yetarli emas.');
  }
  logPanelEvent('mute', guild.id, { source: via, actorId, targetId, nickname: userProfiles[targetId]?.nickname, newValue: `${minutes} daqiqa`, note: reason });
  await logActionToChannel(guild, `<@${actorId}> <@${targetId}> ni ${minutes} daqiqaga mute qildi.${viaNote(via)}`, 0xFFA500);
}

async function actionUnmute(guild, actorId, targetId, via = 'bot', reason = '') {
  const targetMember = await fetchMemberOrFail(guild, targetId);
  await assertCanTarget(guild, actorId, targetId);
  try {
    await targetMember.timeout(null, reason || undefined);
  } catch (err) {
    throw new ActionError('Bot mute ni olib tashlay olmadi: ruxsat yoki rol darajasi yetarli emas.');
  }
  logPanelEvent('unmute', guild.id, { source: via, actorId, targetId, nickname: userProfiles[targetId]?.nickname, note: reason });
  await logActionToChannel(guild, `<@${actorId}> <@${targetId}> dan mute ni olib tashladi.${viaNote(via)}`, 0x5BC0DE);
}

// Panel o'zgartirgan rollar: guildMemberUpdate ularni "Tizim" nomidan ikkinchi marta yozmasligi uchun.
const panelRoleChanges = new Set();
const panelRoleKey = (guildId, userId, roleName, on) => `${guildId}:${userId}:${roleName}:${on ? '+' : '-'}`;

// Xodim rolini berish yoki olish. Faqat Manager va yuqorisi, o'zidan past xodimga va o'zidan past rolni.
// Natija: o'zgargan bo'lsa true, rol allaqachon shunday bo'lsa false.
async function actionSetStaffRole(guild, actorId, targetId, roleName, on, via = 'bot') {
  if (actorId === targetId) throw new ActionError('O\'z rolingizni o\'zgartira olmaysiz.');
  const actorRank = await staffRankOnGuild(guild, actorId);
  if (actorRank < panelRules.MANAGER_RANK) throw new ActionError('Rollarni faqat Manager va undan yuqori rollar o\'zgartira oladi.');
  if (!panelRules.canAssignRole(actorRank, roleName)) throw new ActionError('Faqat o\'z rolingizdan past rollarni o\'zgartira olasiz.');
  const targetMember = await fetchMemberOrFail(guild, targetId, 'Foydalanuvchi bu serverda yo\'q.');
  await assertCanTarget(guild, actorId, targetId);
  const role = panelRules.staffRoleByName(guild, roleName);
  if (!role) throw new ActionError(`Bu serverda "${roleName}" roli yo'q.`);
  if (targetMember.roles.cache.has(role.id) === on) return false;
  assertBotCanEditRole(role);
  const key = panelRoleKey(guild.id, targetId, roleName, on);
  panelRoleChanges.add(key);
  setTimeout(() => panelRoleChanges.delete(key), 30000).unref?.();
  try {
    if (on) await targetMember.roles.add(role, 'Veb-panel orqali');
    else await targetMember.roles.remove(role, 'Veb-panel orqali');
  } catch (err) {
    panelRoleChanges.delete(key);
    throw new ActionError(`Bot "${roleName}" rolini o'zgartira olmadi: ruxsat yoki rol darajasi yetarli emas.`);
  }
  // Panel sahifasi yangilanganda yangi rol darhol ko'rinishi uchun.
  await guild.members.fetch({ user: targetId, force: true }).catch(() => { });
  logPanelEvent(on ? 'staff_add' : 'staff_remove', guild.id, { source: via, actorId, targetId, nickname: userProfiles[targetId]?.nickname || targetMember.displayName, oldValue: on ? null : roleName, newValue: on ? roleName : null });
  await logActionToChannel(guild, `<@${actorId}> <@${targetId}> ${on ? 'ga' : 'dan'} ${roleName} rolini ${on ? 'berdi' : 'oldi'}.${viaNote(via)}`, on ? 0x5BC0DE : 0xFFA500);
  return true;
}

async function actionQueueRemove(guild, actorId, playerId, via = 'bot') {
  await assertCanTarget(guild, actorId, playerId);
  const data = getGuildData(guild.id);
  const idx = data.queue.findIndex(p => p.userId === playerId);
  if (idx === -1) throw new ActionError('Bu o\'yinchi navbatda emas.');
  const [entry] = data.queue.splice(idx, 1);
  const member = await guild.members.fetch(playerId).catch(() => null);
  const whitelistRole = guild.roles.cache.find(r => r.name === BOT_CONFIG.roleNames.whitelist);
  if (member && whitelistRole && member.roles.cache.has(whitelistRole.id)) await member.roles.remove(whitelistRole).catch(() => { });
  saveData();
  await updateQueueMessage(guild);
  logPanelEvent('queue_remove', guild.id, { source: via, actorId, targetId: playerId, nickname: entry.mcName });
  await logActionToChannel(guild, `<@${actorId}> <@${playerId}> ni navbatdan olib tashladi.${viaNote(via)}`, 0x5865F2);
}

async function actionQueueMove(guild, actorId, playerId, direction, via = 'bot') {
  await assertCanTarget(guild, actorId, playerId);
  const data = getGuildData(guild.id);
  const idx = data.queue.findIndex(p => p.userId === playerId);
  if (idx === -1) throw new ActionError('Bu o\'yinchi navbatda emas.');
  const to = idx + direction;
  if (to < 0 || to >= data.queue.length) return;
  const [entry] = data.queue.splice(idx, 1);
  data.queue.splice(to, 0, entry);
  saveData();
  await updateQueueMessage(guild);
  logPanelEvent('queue_move', guild.id, { source: via, actorId, targetId: playerId, nickname: entry.mcName, oldValue: String(idx + 1), newValue: String(to + 1) });
}

async function actionQueueClose(guild, actorId, via = 'bot') {
  await closeQueue(guild);
  saveData();
  logPanelEvent('queue_close', guild.id, { source: via, actorId });
  await logActionToChannel(guild, `<@${actorId}> navbatni yopdi.${viaNote(via)}`, 0x5865F2);
}

// ======================= BOT READY =======================
client.once('ready', async () => {
  loadData();
  console.log(`${client.user.tag} is online!`);
  setInterval(() => {
    for (const guild of client.guilds.cache.values()) {
      refreshMonthlyLeaderboardState(guild.id).catch(err => console.error(`Leaderboard monthly refresh failed for ${guild.id}:`, err.message));
    }
  }, 60 * 60 * 1000);
  try {
    await db.testConnection();
    console.log('MySQL tier database ulanishi muvaffaqiyatli.');
  } catch (err) {
    console.error('MySQL ulanishida xatolik:', err.message);
  }
  for (const guild of client.guilds.cache.values()) {
    console.log(`Initializing guild: ${guild.name}`);
    getGuildData(guild.id);
    await refreshMonthlyLeaderboardState(guild.id);
    await updateTestersOnline(guild);
    if (applicationOpen[guild.id] === undefined) applicationOpen[guild.id] = true;

    const verificationCh = guild.channels.cache.find(ch => ch.name === BOT_CONFIG.channelNames.verification);
    if (verificationCh) {
      const msgs = await verificationCh.messages.fetch({ limit: 10 });
      const hasBotMsg = msgs.some(msg => msg.author.id === client.user.id && msg.components.length);
      if (!hasBotMsg) await sendVerificationMessage(verificationCh);
    }
    const testgaKirish = guild.channels.cache.find(ch => ch.name === BOT_CONFIG.channelNames.testEntry);
    if (testgaKirish) {
      await refreshTestgaKirishMessage(testgaKirish);
    }
    const supportChannel = guild.channels.cache.find(ch => ch.name === BOT_CONFIG.channelNames.support);
    if (supportChannel) {
      const msgs = await supportChannel.messages.fetch({ limit: 10 });
      const hasMsg = msgs.some(msg => msg.author.id === client.user.id && msg.components.length);
      if (!hasMsg) await sendSupportMessage(supportChannel);
    }
    const testerAppChannel = guild.channels.cache.find(ch => ch.name === BOT_CONFIG.channelNames.testerApp);
    if (testerAppChannel) await refreshTesterAppMessage(testerAppChannel, guild.id);
    // Navbat xabarini haqiqiy holatga moslaymiz (eski xabar bo'lsa o'shani tahrirlaydi, yangisini yubormaydi).
    await updateQueueMessage(guild);
    await updateLeaderboard(guild.id);
  }

  // Eski nik xatosi tuzatilgan o'yinchilarning Discord nikini ham yangilaymiz.
  if (pendingNicknameRepairs.length) {
    saveData();
    for (const { userId, oldNick, currentNick } of pendingNicknameRepairs) {
      console.log(`Nik tuzatildi: ${userId} ${oldNick} -> ${currentNick}`);
      for (const [repairGuildId, users] of Object.entries(verifiedUsers)) {
        if (!users?.[userId]) continue;
        const repairGuild = client.guilds.cache.get(repairGuildId);
        const repairMember = repairGuild && await repairGuild.members.fetch(userId).catch(() => null);
        if (repairMember && repairMember.displayName !== currentNick) await repairMember.setNickname(currentNick).catch(() => { });
      }
    }
    pendingNicknameRepairs = [];
  }

  await sweepExpiredRestrictions();
  setInterval(() => {
    sweepExpiredRestrictions().catch(err => console.error('Restriction sweep xatosi:', err.message));
  }, 10 * 60 * 1000);

  // Panel tarixi jadvali va veb-panel. Panel .env sozlanmaguncha ishga tushmaydi.
  await panelEvents.ensureTable().catch(err => console.error('panel_events jadvali xatosi:', err.message));
  startPanel({
    client,
    events: panelEvents,
    tickets: panelTickets,
    kitByGuild: KNOWN_GUILD_KIT_MODE_BY_ID,
    getCooldownRemaining,
    ActionError,
    actions: {
      setTier: actionSetTier, demote: actionDemote, deleteTier: actionDeleteTier, setRetired: actionSetRetired,
      setCooldown: actionSetCooldown, resetCooldown: actionResetCooldown, kickTester: actionKickTester,
      restrict: actionRestrict, unrestrict: actionUnrestrict, setApplication: actionSetApplication,
      changeNickname: actionChangeNickname, mute: actionMute, unmute: actionUnmute,
      queueRemove: actionQueueRemove, queueMove: actionQueueMove, queueClose: actionQueueClose, setStaffRole: actionSetStaffRole,
      refreshPanel: actionRefreshPanel, publishCustomPanel: actionPublishCustomPanel, deleteCustomPanelMessage: actionDeleteCustomPanelMessage
    },
    settings: panelSettings,
    news: panelNews,
    // Panel sozlamalar sahifasi uchun: bot qaysi kanal va kategoriyalarni nomi bo'yicha qidiradi.
    botInfo: {
      channelNames: BOT_CONFIG.channelNames,
      panelChannels: { verification: BOT_CONFIG.channelNames.verification, testEntry: BOT_CONFIG.channelNames.testEntry, support: BOT_CONFIG.channelNames.support, testerApp: BOT_CONFIG.channelNames.testerApp, queue: '🏹┃navbat' },
      ticketCategories: [
        { id: 'regular', name: 'Navbat testlari', category: 'Testlar 🎫', pattern: 'test-{foydalanuvchi}-{vaqt}', cooldown: 'test', roles: staffRoles },
        { id: 'high', name: 'Yuqori testlar', category: 'Yuqori Testlar', pattern: '{daraja}-{nik}', cooldown: 'high_test', roles: highTestStaff },
        { id: 'help', name: 'Yordam', category: 'Yordam', pattern: 'yordam-{foydalanuvchi}-{vaqt}', cooldown: 'help', roles: ['Senior Tester', 'Moderator', 'Administrator', 'Manager', 'Network Admin', 'OWNER', 'UzTiers'] },
        { id: 'complaint', name: 'Shikoyat', category: 'Shikoyat', pattern: 'shikoyat-{foydalanuvchi}-{vaqt}', cooldown: 'complaint', roles: ['Senior Tester', 'Moderator', 'Administrator', 'Manager', 'Network Admin', 'OWNER', 'UzTiers'] },
        { id: 'tester_app', name: 'Tester arizalari', category: 'Arizalar', pattern: '{foydalanuvchi}-arizasi-…', cooldown: 'tester_app', roles: ['Senior Tester', 'Moderator', 'Administrator', 'Manager', 'Network Admin', 'OWNER', 'UzTiers'] }
      ],
      slashCommands: ['start', 'stop', 'next', 'close', 'forceclose', 'highresult', 'add', 'remove', 'nickname', 'change_nickname', 'status', 'check', 'statuscheck', 'application', 'retired', 'unretired', 'cd', 'resetcooldown', 'tier']
    },
    getState: () => ({ queues, activeTests, highTestTickets, lastTestTime, testersOnline, verifiedUsers, userTiers, activeTestersSet, testCounts, userProfiles, restrictedUsers, applicationOpen })
  });
  // Ochiq chiptalarning eski xabarlari va bot o'chiq paytdagi xabarlar Discord'dan olib kelinadi.
  panelTickets.sync(client, { activeTests, highTestTickets, labelOf: id => userProfiles[id]?.nickname || null })
    .then(result => console.log(`Chiptalar: ${result.open} ta ochiq, ${result.fetched} ta xabar olindi.`))
    .catch(err => console.error('Chiptalarni yangilash xatosi:', err.message));

  try {
    const commands = [
      { name: 'start', description: 'Navbatni ochish' },
      { name: 'next', description: 'Keyingi oyinchini olish' },
      { name: 'close', description: 'Ticketni yopish' },
      { name: 'stop', description: 'Navbatni yopish' },
      { name: 'nickname', description: 'Minecraft nickingizni almashtirish (30 kunda bir)', options: [{ name: 'nickname', type: 3, description: 'Yangi nickname', required: true, min_length: 1, max_length: 16 }] },
      { name: 'change_nickname', description: 'Barcha serverlarda o\'yinchining nikini yangilash', options: [{ name: 'user', type: 6, description: 'Foydalanuvchi', required: true }, { name: 'nickname', type: 3, description: 'Yangi nickname', required: true, min_length: 1, max_length: 16 }] },
      { name: 'add', description: 'Ticketga foydalanuvchi qo\'shish', options: [{ name: 'user', type: 6, description: 'Qo\'shiladigan foydalanuvchi', required: true }] },
      { name: 'remove', description: 'Ticketdan foydalanuvchi olish', options: [{ name: 'user', type: 6, description: 'Olib tashlanadigan foydalanuvchi', required: true }] },
      { name: 'highresult', description: 'Yuqori test natijasi' },
      { name: 'forceclose', description: 'Ticketni majburiy yopish' },
      { name: 'status', description: 'O\'z test statistikangizni ko\'rish' },
      { name: 'check', description: 'Foydalanuvchining oxirgi test sanasini ko\'rish', options: [{ name: 'user', type: 6, description: 'Foydalanuvchi', required: true }] },
      { name: 'statuscheck', description: 'Boshqa testerning statistikasini ko\'rish', options: [{ name: 'user', type: 6, description: 'Foydalanuvchi', required: true }] },
      { name: 'application', description: 'Ariza qabulini ochish/yopish', options: [{ name: 'status', type: 3, description: 'Holat', required: true, choices: [{ name: 'Ochish', value: 'open' }, { name: 'Yopish', value: 'close' }] }] },
      { name: 'retired', description: 'Retired roli berish', options: [{ name: 'user', type: 6, description: 'Foydalanuvchi', required: true }] },
      { name: 'unretired', description: 'Retired rolini olib tashlash', options: [{ name: 'user', type: 6, description: 'Foydalanuvchi', required: true }] },
      {
        name: 'cd', description: 'Cooldown berish', options: [
          { name: 'user', type: 6, description: 'Foydalanuvchi', required: true },
          { name: 'category', type: 3, description: 'Kategoriya', required: true, choices: [{ name: 'test', value: 'test' }, { name: 'high_test', value: 'high_test' }, { name: 'help', value: 'help' }, { name: 'complaint', value: 'complaint' }, { name: 'nickname', value: 'nickname' }, { name: 'tester_app', value: 'tester_app' }] },
          { name: 'days', type: 4, description: 'Kunlar soni', required: true }
        ]
      },
      {
        name: 'cooldown', description: 'Foydalanuvchining cooldownini ko\'rish', options: [
          { name: 'user', type: 6, description: 'Foydalanuvchi', required: true },
          { name: 'category', type: 3, description: 'Kategoriya', required: false, choices: [{ name: 'test', value: 'test' }, { name: 'high_test', value: 'high_test' }, { name: 'help', value: 'help' }, { name: 'complaint', value: 'complaint' }, { name: 'nickname', value: 'nickname' }, { name: 'tester_app', value: 'tester_app' }] }
        ]
      },
      {
        name: 'setkit', description: 'Ushbu server uchun kit/rejimni o\'rnatish', options: [
          { name: 'kit', type: 3, description: 'Kit/rejim', required: true, choices: [{ name: 'Sword', value: 'sword' }, { name: 'Vanilla', value: 'vanilla' }, { name: 'NethPot', value: 'nethpot' }, { name: 'UHC', value: 'uhc' }, { name: 'Mace', value: 'mace' }, { name: 'SMP', value: 'smp' }, { name: 'Axe', value: 'axe' }, { name: 'Potion', value: 'potion' }] }
        ]
      },
      { name: 'leave', description: 'Navbat kanalidan tark etish' },
      { name: 'deletetier', description: 'O\'yinchining darajasini o\'chirish', options: [{ name: 'user', type: 6, description: 'Foydalanuvchi', required: true }] },
      {
        name: 'tier', description: 'Foydalanuvchiga tier berish', options: [
          { name: 'user', type: 6, description: 'Foydalanuvchi', required: true },
          { name: 'tier', type: 3, description: 'Tier', required: true, choices: fullTierOrder.slice(0, 10).map(t => ({ name: t, value: t })) }
        ]
      },
      {
        name: 'demote', description: 'O\'yinchining darajasini pasaytirish', options: [
          { name: 'user', type: 6, description: 'Foydalanuvchi', required: true },
          { name: 'tier', type: 3, description: 'Yangi daraja', required: true, choices: fullTierOrder.filter(t => t !== 'HT1').map(t => ({ name: t, value: t })) }
        ]
      },
      { name: 'kicktester', description: 'Testerni navbatdan chiqarish', options: [{ name: 'tester', type: 6, description: 'Tester foydalanuvchi', required: true }] },
      {
        name: 'resetcooldown', description: 'Cooldownni tiklash', options: [
          { name: 'user', type: 6, description: 'Foydalanuvchi', required: true },
          { name: 'category', type: 3, description: 'Kategoriya', required: true, choices: [{ name: 'test', value: 'test' }, { name: 'high_test', value: 'high_test' }, { name: 'help', value: 'help' }, { name: 'complaint', value: 'complaint' }, { name: 'nickname', value: 'nickname' }, { name: 'tester_app', value: 'tester_app' }] }
        ]
      },
      { name: 'restrict', description: 'Foydalanuvchini testdan vaqtincha cheklash', options: [{ name: 'user', type: 6, description: 'Foydalanuvchi', required: true }, { name: 'sabab', type: 3, description: 'Cheklov sababi', required: true }, { name: 'muddat', type: 3, description: 'Cheklov muddati', required: true, choices: [{ name: '3 oy', value: '3' }, { name: '6 oy', value: '6' }, { name: '9 oy', value: '9' }] }] },
      { name: 'unrestrict', description: 'Foydalanuvchi test cheklovini olib tashlash', options: [{ name: 'user', type: 6, description: 'Foydalanuvchi', required: true }, { name: 'sabab', type: 3, description: 'Cheklovni olib tashlash sababi', required: true }] }
    ];
    console.log('Registering slash commands:', commands.length);
    console.log('Tier command included:', commands.some(c => c.name === 'tier') ? 'YES' : 'NO');
    try { await client.application.commands.set([]); } catch (err) { console.warn('Could not clear global commands:', err.message); }
    for (const guild of client.guilds.cache.values()) {
      await guild.commands.set(commands);
      console.log(`✅ Guild commands registered for ${guild.name}`);
    }
    console.log('✅ Slash commands registered successfully');

    try {
      const registeredCommands = await client.application.commands.fetch();
      const cdCmd = registeredCommands.find(c => c.name === 'cd');
      const resetCmd = registeredCommands.find(c => c.name === 'resetcooldown');
      const tierCmd = registeredCommands.find(c => c.name === 'tier');
      console.log(`✅ Total commands registered: ${registeredCommands.size}`);
      if (cdCmd) {
        const categoryChoices = cdCmd.options?.find(o => o.name === 'category')?.choices?.map(ch => ch.value).join(', ');
        console.log(`✅ /cd category choices: ${categoryChoices}`);
      }
      if (resetCmd) {
        const categoryChoices = resetCmd.options?.find(o => o.name === 'category')?.choices?.map(ch => ch.value).join(', ');
        console.log(`✅ /resetcooldown category choices: ${categoryChoices}`);
      }
      console.log(`✅ /tier command status: ${tierCmd ? 'FOUND' : 'MISSING'}`);
      if (tierCmd) {
        console.log(`✅ /tier command ID: ${tierCmd.id}`);
        console.log(`✅ /tier command description: ${tierCmd.description}`);
        console.log(`✅ /tier command options: ${tierCmd.options?.map(o => `${o.name} (${o.type})`).join(', ')}`);
      }
    } catch (err) {
      console.error('Error fetching registered commands:', err.message);
    }
  } catch (err) {
    console.error('Error registering slash commands:', err.message);
    if (err.response?.data) console.error('Discord API error:', err.response.data);
  }
});

client.on('guildCreate', async (guild) => {
  console.log(`Joined new guild: ${guild.name}`);
  getGuildData(guild.id);
  if (applicationOpen[guild.id] === undefined) applicationOpen[guild.id] = true;
  await updateTestersOnline(guild);
  const verificationCh = guild.channels.cache.find(ch => ch.name === '☘️┃tasdiqlash');
  if (verificationCh) await sendVerificationMessage(verificationCh);
  const testgaKirishCh = guild.channels.cache.find(ch => ch.name === '📨┃testga-kirish');
  if (testgaKirishCh) await sendTestgaKirishMessage(testgaKirishCh);
  const supportCh = guild.channels.cache.find(ch => ch.name === '☎️┃yordam-sorovi');
  if (supportCh) await sendSupportMessage(supportCh);
  const testerAppCh = guild.channels.cache.find(ch => ch.name === '🗡️┃tester-sorovi');
  if (testerAppCh) await sendTesterAppMessage(testerAppCh, guild.id);
  await updateQueueMessage(guild);
  await updateLeaderboard(guild.id);
});

client.on('guildMemberAdd', async (member) => {
  try {
    const guildId = member.guild.id;
    getGuildData(guildId);
    const restoredTier = await restoreStoredTierForMember(member);
    if (restoredTier) {
      await setUserTierProfile(member.id, guildId, restoredTier);
    }
  } catch (err) {
    console.error('guildMemberAdd tier restore xatosi:', err.message);
  }
});

// Har bir tester uchun alohida 5 soniyalik taymer. Oldin bitta umumiy taymer bor edi,
// shuning uchun boshqa a'zolarning status o'zgarishlari testerlarnikini "yutib" yuborardi.
const presenceTimers = new Map();
// Xodim rollari o'zgarishini panel tarixiga yozamiz (faqat 8 ta asosiy serverda).
client.on('guildMemberUpdate', (oldMember, newMember) => {
  const guildId = newMember.guild.id;
  if (!KNOWN_GUILD_KIT_MODE_BY_ID[guildId]) return;
  for (const roleName of [...staffRoles, ...testerRoles]) {
    const had = oldMember.roles.cache.some(r => r.name === roleName);
    const has = newMember.roles.cache.some(r => r.name === roleName);
    if (had === has) continue;
    if (panelRoleChanges.delete(panelRoleKey(guildId, newMember.id, roleName, has))) continue; // panel o'zi yozgan
    const nickname = userProfiles[newMember.id]?.nickname || newMember.displayName;
    logPanelEvent(has ? 'staff_add' : 'staff_remove', guildId, { targetId: newMember.id, nickname, oldValue: had ? roleName : null, newValue: has ? roleName : null });
  }
});

// Test chiptalaridagi yozishmalarni panel uchun saqlaymiz.
client.on('messageCreate', message => panelTickets.onMessage(message));
client.on('messageUpdate', (oldMessage, newMessage) => panelTickets.onMessageUpdate(newMessage));
client.on('messageDelete', message => panelTickets.onMessageDelete(message));
client.on('channelDelete', channel => panelTickets.onChannelDelete(channel));

client.on('presenceUpdate', (old, now) => {
  const guild = now?.guild;
  const member = now?.member;
  if (!guild || !member) return;
  const tracked = onlineTesterCache[guild.id]?.has(member.id) || activeTestersSet[guild.id]?.has(member.id);
  if (!isTester(member) && !tracked) return; // oddiy a'zolar navbatga ta'sir qilmaydi
  const key = `${guild.id}:${member.id}`;
  clearTimeout(presenceTimers.get(key));
  presenceTimers.set(key, setTimeout(() => {
    presenceTimers.delete(key);
    updateTestersOnline(guild, member).catch(err => console.error('presenceUpdate error:', err));
  }, 5000));
});

// ======================= SINGLE INTERACTION HANDLER =======================
client.on('interactionCreate', async interaction => {
  try {
    // ----- BUTTONS -----
    if (interaction.isButton()) {
      const customId = interaction.customId;
      // Verification button
      if (customId === 'verify_me') {
        const guildId = interaction.guild.id;
        const users = verifiedUsers[guildId] || {};
        const existing = users[interaction.user.id];
        const azoRole = interaction.guild.roles.cache.find(r => r.name === BOT_CONFIG.roleNames.azo);
        const existingNickname = await resolveVerifiedNickname(guildId, interaction.user.id);
        if (existing || existingNickname) {
          const nicknameToUse = existing?.nickname || existingNickname;
          if (azoRole && !interaction.member.roles.cache.has(azoRole.id)) await interaction.member.roles.add(azoRole).catch(() => { });
          const restoredTier = await restoreStoredTierForMember(interaction.member);
          if (nicknameToUse) {
            if (!verifiedUsers[guildId]) verifiedUsers[guildId] = {};
            verifiedUsers[guildId][interaction.user.id] = {
              ...(verifiedUsers[guildId][interaction.user.id] || {}),
              nickname: nicknameToUse,
              verifiedAt: verifiedUsers[guildId][interaction.user.id]?.verifiedAt || Date.now(),
              preferredServer: verifiedUsers[guildId][interaction.user.id]?.preferredServer || null
            };
            saveData();
          }
          try { await interaction.member.setNickname(nicknameToUse).catch(() => { }); } catch (e) { }
          const container = new ContainerBuilder().setAccentColor(0xFFA500);
          container.addTextDisplayComponents(new TextDisplayBuilder().setContent('### Muvaffaqiyatli avtorizatsiya'));
          container.addSeparatorComponents(sep => sep.setSpacing(1));
          const tierSuffix = restoredTier ? `, tier **${restoredTier}**` : '';
          container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`Nickname: \`${nicknameToUse}\`${tierSuffix}`));
          await interaction.reply({ flags: MessageFlags.IsComponentsV2 | 64, components: [container] });
          return;
        }
        const form = modalLook(guildId, 'verify');
        const modal = new ModalBuilder().setCustomId('verify_modal').setTitle(form.title);
        const nickInput = withPlaceholder(new TextInputBuilder().setCustomId('minecraft_nick').setLabel(form.fields.minecraft_nick.label).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(16), form.fields.minecraft_nick.placeholder);
        modal.addComponents(new ActionRowBuilder().addComponents(nickInput));
        await interaction.showModal(modal);
        return;
      }
      // Join queue button (testga-kirish)
      if (customId === 'join_queue_button') {
        const member = interaction.member;
        const blockedRoles = ['LT3', 'HT3', 'LT2', 'HT2', 'LT1', 'HT1'];
        if (member.roles.cache.some(r => blockedRoles.includes(r.name))) {
          const red = new ContainerBuilder().setAccentColor(0xFF0000);
          red.addTextDisplayComponents(new TextDisplayBuilder().setContent('### Siz Navbat kanaliga qo\'shilolmaysiz'));
          red.addSeparatorComponents(sep => sep.setSpacing(1));
          red.addTextDisplayComponents(new TextDisplayBuilder().setContent('Sizning darajangiz buyerga kirish uchun yuqori.'));
          await interaction.reply({ flags: MessageFlags.IsComponentsV2 | 64, components: [red] });
          return;
        }
        const guildId = interaction.guild.id;
        const restrictRemaining = await getActiveRestrictionRemaining(interaction.guild, interaction.user.id);
        if (restrictRemaining > 0) {
          const orange = new ContainerBuilder().setAccentColor(0xFFA500);
          orange.addTextDisplayComponents(new TextDisplayBuilder().setContent('### Siz test topshirishdan cheklangansiz'));
          orange.addSeparatorComponents(sep => sep.setSpacing(1));
          orange.addTextDisplayComponents(new TextDisplayBuilder().setContent(`Qolgan vaqt: \`${formatRestrictRemaining(restrictRemaining)}\``));
          await interaction.reply({ flags: MessageFlags.IsComponentsV2 | 64, components: [orange] });
          return;
        }
        const users = verifiedUsers[guildId] || {};
        const userData = users[interaction.user.id];
        if (!userData) return ephemeralContainer(interaction, 'Avval tasdiqlanish bolimida tasdiqlaning.', 0xFFA500);
        const remaining = getCooldownRemaining(guildId, interaction.user.id, 'test');
        if (remaining > 0) {
          const red = new ContainerBuilder().setAccentColor(0xFF0000);
          red.addTextDisplayComponents(new TextDisplayBuilder().setContent(`Sizda cooldown mavjud. Qolgan vaqt: ${formatCooldown(remaining)}`));
          await interaction.reply({ flags: MessageFlags.IsComponentsV2 | 64, components: [red] });
          return;
        }
        const form = modalLook(guildId, 'server');
        const modal = new ModalBuilder().setCustomId('server_modal').setTitle(form.title);
        const serverInput = withPlaceholder(new TextInputBuilder().setCustomId('server').setLabel(form.fields.server.label).setStyle(TextInputStyle.Short).setRequired(true), form.fields.server.placeholder || serverListHint(guildId));
        modal.addComponents(new ActionRowBuilder().addComponents(serverInput));
        await interaction.showModal(modal);
        return;
      }
      // High test button
      if (customId === 'high_test_button') {
        const member = interaction.member;
        const restrictRemaining = await getActiveRestrictionRemaining(interaction.guild, interaction.user.id);
        if (restrictRemaining > 0) {
          const orange = new ContainerBuilder().setAccentColor(0xFFA500);
          orange.addTextDisplayComponents(new TextDisplayBuilder().setContent('### Siz test topshirishdan cheklangansiz'));
          orange.addSeparatorComponents(sep => sep.setSpacing(1));
          orange.addTextDisplayComponents(new TextDisplayBuilder().setContent(`Qolgan vaqt: \`${formatRestrictRemaining(restrictRemaining)}\``));
          await interaction.reply({ flags: MessageFlags.IsComponentsV2 | 64, components: [orange] });
          return;
        }
        const eligible = highTestEligible.some(tierName => member.roles.cache.some(r => r.name === tierName));
        if (!eligible) return ephemeralContainer(interaction, 'Sizning darajangiz yuqori testlar ochish uchun mos emas. Faqat LT3 va undan yuqori darajalar uchun.', 0xFFA500);
        const guildId = interaction.guild.id;
        const highTestCooldownRemaining = getCooldownRemaining(guildId, interaction.user.id, 'high_test');
        if (highTestCooldownRemaining > 0) {
          const red = new ContainerBuilder().setAccentColor(0xFF0000);
          red.addTextDisplayComponents(new TextDisplayBuilder().setContent('### Sizda Yuqori test uchun Cooldown mavjud.'));
          red.addSeparatorComponents(separator => separator.setSpacing(1));
          red.addTextDisplayComponents(new TextDisplayBuilder().setContent(`Qolgan vaqt: \`${formatCooldown(highTestCooldownRemaining)}\``));
          await interaction.reply({ flags: MessageFlags.IsComponentsV2 | 64, components: [red] });
          return;
        }
        let currentTier = null;
        for (const t of highTestEligible) {
          if (member.roles.cache.some(r => r.name === t)) { currentTier = t; break; }
        }
        if (!currentTier) return ephemeralContainer(interaction, 'Sizning darajangiz aniqlanmadi. Iltimos, administrator bilan bog\'laning.', 0xFFA500);
        const targetTier = getNextHighTier(currentTier);
        if (!targetTier) return ephemeralContainer(interaction, 'Siz eng yuqori darajaga yetganingiz uchun yuqori test ochib bo\'lmaydi.', 0xFFA500);
        const guildHighTests = highTestTickets[interaction.guild.id] || {};
        if (Object.values(guildHighTests).find(t => t.playerId === interaction.user.id)) {
          const red = new ContainerBuilder().setAccentColor(0xFF0000);
          red.addTextDisplayComponents(new TextDisplayBuilder().setContent('Sizning yuqori test chiptangiz allaqachon yaratilgan.'));
          await interaction.reply({ flags: MessageFlags.IsComponentsV2 | 64, components: [red] });
          return;
        }
        try {
          const ticket = await createHighTestTicket(interaction, interaction.user, currentTier, targetTier);
          const confirmContainer = new ContainerBuilder().setAccentColor(0xFFA500);
          confirmContainer.addSectionComponents(section => section
            .addTextDisplayComponents(text => text.setContent('### Ticket yaratildi\nSizning Yuqori test Chiptangiz ochildi.'))
            .setButtonAccessory(button => button.setStyle(ButtonStyle.Link).setURL(ticket.url).setLabel('Chiptani ochish'))
          );
          await interaction.reply({ flags: MessageFlags.IsComponentsV2 | 64, components: [confirmContainer] });
        } catch (err) {
          const red = new ContainerBuilder().setAccentColor(0xFF0000);
          red.addTextDisplayComponents(new TextDisplayBuilder().setContent('Sizning yuqori test chiptangiz allaqachon yaratilgan.'));
          await interaction.reply({ flags: MessageFlags.IsComponentsV2 | 64, components: [red] });
        }
        return;
      }
      // Support channel buttons
      if (customId === 'support_yordam') {
        const guildId = interaction.guild.id;
        const remaining = getCooldownRemaining(guildId, interaction.user.id, 'help');
        if (remaining > 0) {
          return ephemeralContainer(interaction, `Sizda yordam ticketi uchun cooldown mavjud. Qolgan vaqt: ${formatCooldown(remaining)}`, 0xFFA500);
        }
        const existingTicket = interaction.guild.channels.cache.find(ch => ch.name.startsWith('yordam-') && ch.parent?.name === 'Yordam' && ch.permissionOverwrites.cache.has(interaction.user.id));
        if (existingTicket) return ephemeralContainer(interaction, 'Sizning ochiq yordam chiptangiz allaqachon mavjud.', 0xFFA500);
        const lockKey = acquireTicketLock(guildId, interaction.user.id, 'yordam');
        if (!lockKey) return ephemeralContainer(interaction, 'Ticket yaratish jarayoni allaqachon boshlangan. Biroz kuting.', 0xFFA500);
        try {
          await interaction.deferReply({ flags: 64 });
          const existingAfterLock = interaction.guild.channels.cache.find(ch => ch.name.startsWith('yordam-') && ch.parent?.name === 'Yordam' && ch.permissionOverwrites.cache.has(interaction.user.id));
          if (existingAfterLock) {
            await interaction.editReply({ content: 'Sizning ochiq yordam chiptangiz allaqachon mavjud.' });
            return;
          }
          const ticket = await createModalTicket(interaction, 'Yordam', 'yordam', ['Senior Tester', 'Moderator', 'Administrator', 'Manager', 'Network Admin', 'OWNER', 'UzTiers'],
            async (ticketChannel, i) => {
              const container = new ContainerBuilder().setAccentColor(0xFFA500);
              container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### Yordam Chiptasi\nSalom <@${i.user.id}>. Sizning chiptangiz ochildi. Iltimos, kuting.\nOchildi: <t:${Math.floor(Date.now() / 1000)}:R>`));
              container.addSeparatorComponents(sep => sep.setSpacing(1));
              const closeBtn = new ButtonBuilder().setCustomId('ticket_close_btn').setLabel('Yopish').setStyle(ButtonStyle.Danger);
              container.addActionRowComponents(row => row.addComponents(closeBtn));
              await ticketChannel.send({ flags: MessageFlags.IsComponentsV2, components: [container] });
            });
          setCooldown(guildId, interaction.user.id, 'help');
          // Send confirmation to the support channel (where button was pressed)
          const confirmContainer = new ContainerBuilder().setAccentColor(0xFFA500);
          confirmContainer.addSectionComponents(section => section
            .addTextDisplayComponents(text => text.setContent('### Ticket yaratildi\nSizning yordam chiptangiz ochildi'))
            .setButtonAccessory(button => button.setStyle(ButtonStyle.Link).setURL(ticket.url).setLabel('Chiptani ochish'))
          );
          await interaction.editReply({ flags: MessageFlags.IsComponentsV2 | 64, components: [confirmContainer] });
          // No additional ephemeral message
        } catch (err) {
          console.error(err);
          if (interaction.deferred || interaction.replied) await interaction.editReply({ content: `Xatolik: ${err.message}` });
          else await ephemeralContainer(interaction, `Xatolik: ${err.message}`, 0xFF0000);
        } finally {
          releaseTicketLock(lockKey);
        }
        return;
      }
      if (customId === 'support_shikoyat') {
        const guildId = interaction.guild.id;
        const remaining = getCooldownRemaining(guildId, interaction.user.id, 'complaint');
        if (remaining > 0) {
          return ephemeralContainer(interaction, `Sizda shikoyat ticketi uchun cooldown mavjud. Qolgan vaqt: ${formatCooldown(remaining)}`, 0xFFA500);
        }
        const existingTicket = interaction.guild.channels.cache.find(ch => ch.name.startsWith('shikoyat-') && ch.parent?.name === 'Shikoyat' && ch.permissionOverwrites.cache.has(interaction.user.id));
        if (existingTicket) return ephemeralContainer(interaction, 'Sizning ochiq shikoyat chiptangiz allaqachon mavjud.', 0xFFA500);
        const lockKey = acquireTicketLock(guildId, interaction.user.id, 'shikoyat_button');
        if (!lockKey) return ephemeralContainer(interaction, 'Ticket yaratish jarayoni allaqachon boshlangan. Biroz kuting.', 0xFFA500);
        const form = modalLook(guildId, 'complaint');
        const modal = new ModalBuilder().setCustomId('complaint_modal').setTitle(form.title);
        const nickInput = withPlaceholder(new TextInputBuilder().setCustomId('user_nick').setLabel(form.fields.user_nick.label).setStyle(TextInputStyle.Short).setRequired(true), form.fields.user_nick.placeholder);
        const offenderInput = withPlaceholder(new TextInputBuilder().setCustomId('offender_nick').setLabel(form.fields.offender_nick.label).setStyle(TextInputStyle.Short).setRequired(true), form.fields.offender_nick.placeholder);
        modal.addComponents(new ActionRowBuilder().addComponents(nickInput), new ActionRowBuilder().addComponents(offenderInput));
        try {
          await interaction.showModal(modal);
        } finally {
          setTimeout(() => releaseTicketLock(lockKey), 8000);
        }
        return;
      }
      // Tester application button
      if (customId === 'tester_apply') {
        const guildId = interaction.guild.id;
        if (applicationOpen[guildId] === undefined) applicationOpen[guildId] = true;
        if (applicationOpen[guildId] === false) return ephemeralContainer(interaction, 'Arizalar qabuli yopiq.', 0xFFA500);
        const remaining = getCooldownRemaining(guildId, interaction.user.id, 'tester_app');
        if (remaining > 0) {
          return ephemeralContainer(interaction, `Sizda tester arizasi uchun cooldown mavjud. Qolgan vaqt: ${formatCooldown(remaining)}`, 0xFFA500);
        }
        const lockKey = acquireTicketLock(guildId, interaction.user.id, 'tester_apply');
        if (!lockKey) return ephemeralContainer(interaction, 'Ariza oynasi allaqachon ochilmoqda. Biroz kuting.', 0xFFA500);
        if (!hasTesterTierOnThisServer(interaction.member)) {
          releaseTicketLock(lockKey);
          const red = new ContainerBuilder().setAccentColor(0xFF0000);
          red.addTextDisplayComponents(new TextDisplayBuilder().setContent('### Daraja yetarli emas!'));
          red.addSeparatorComponents(sep => sep.setSpacing(1));
          red.addTextDisplayComponents(new TextDisplayBuilder().setContent('Ariza topshirish uchun siz shu serverda LT3 yoki undan baland darajaga ega bo\'lishingiz kerak.'));
          await interaction.reply({ flags: MessageFlags.IsComponentsV2 | 64, components: [red] });
          return;
        }
        const existingTicket = interaction.guild.channels.cache.find(ch => ch.name.endsWith('-arizasi') && ch.parent?.name === 'Arizalar' && ch.permissionOverwrites.cache.has(interaction.user.id));
        if (existingTicket) {
          releaseTicketLock(lockKey);
          return ephemeralContainer(interaction, 'Sizning ochiq arizangiz allaqachon mavjud.', 0xFFA500);
        }
        const form = modalLook(guildId, 'apply');
        const modal = new ModalBuilder().setCustomId('apply_modal').setTitle(form.title);
        const question = (id, style) => withPlaceholder(new TextInputBuilder().setCustomId(id).setLabel(form.fields[id].label).setStyle(style).setRequired(true), form.fields[id].placeholder);
        const q1 = question('q1', TextInputStyle.Short);
        const q2 = question('q2', TextInputStyle.Paragraph);
        const q3 = question('q3', TextInputStyle.Paragraph);
        const q4 = question('q4', TextInputStyle.Paragraph);
        const q5 = question('q5', TextInputStyle.Paragraph);
        modal.addComponents(new ActionRowBuilder().addComponents(q1), new ActionRowBuilder().addComponents(q2), new ActionRowBuilder().addComponents(q3), new ActionRowBuilder().addComponents(q4), new ActionRowBuilder().addComponents(q5));
        try {
          await interaction.showModal(modal);
        } finally {
          setTimeout(() => releaseTicketLock(lockKey), 8000);
        }
        return;
      }
      // Join queue navbat button
      if (customId === 'join_queue_navbat') {
        const guild = interaction.guild;
        const guildId = guild.id;
        const member = interaction.member;
        const restrictRemaining = await getActiveRestrictionRemaining(interaction.guild, interaction.user.id);
        if (restrictRemaining > 0) {
          const orange = new ContainerBuilder().setAccentColor(0xFFA500);
          orange.addTextDisplayComponents(new TextDisplayBuilder().setContent('### Siz test topshirishdan cheklangansiz'));
          orange.addSeparatorComponents(sep => sep.setSpacing(1));
          orange.addTextDisplayComponents(new TextDisplayBuilder().setContent(`Qolgan vaqt: \`${formatRestrictRemaining(restrictRemaining)}\``));
          await interaction.reply({ flags: MessageFlags.IsComponentsV2 | 64, components: [orange] });
          return;
        }
        if (isTester(member)) return interaction.reply({ flags: MessageFlags.IsComponentsV2 | 64, components: [new ContainerBuilder().setAccentColor(0xFFA500).addTextDisplayComponents(new TextDisplayBuilder().setContent('Testerlar navbatga qo\'shila olmaydi.'))] });
        const data = getGuildData(guildId);
        if (!data.testersOnline) return interaction.reply({ flags: MessageFlags.IsComponentsV2 | 64, components: [new ContainerBuilder().setAccentColor(0xFFA500).addTextDisplayComponents(new TextDisplayBuilder().setContent('Hozir testerlar yoq. Keyinroq urinib koring.'))] });
        const userData = verifiedUsers[guildId]?.[interaction.user.id];
        if (!userData) return interaction.reply({ flags: MessageFlags.IsComponentsV2 | 64, components: [new ContainerBuilder().setAccentColor(0xFFA500).addTextDisplayComponents(new TextDisplayBuilder().setContent('Avval tasdiqlanish bolimida tasdiqlaning.'))] });
        if (!userData.preferredServer) return interaction.reply({ flags: MessageFlags.IsComponentsV2 | 64, components: [new ContainerBuilder().setAccentColor(0xFFA500).addTextDisplayComponents(new TextDisplayBuilder().setContent('Iltimos, avval 📨┃testga-kirish kanalida serveringizni belgilang.'))] });
        const hasOpenTicket = data.activeTests.some(t => t.playerId === interaction.user.id);
        if (hasOpenTicket) {
          const redContainer = new ContainerBuilder().setAccentColor(0xFF0000);
          redContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent('### Navbatga kirib bo\'lmaydi.'));
          redContainer.addSeparatorComponents(sep => sep.setSpacing(1));
          redContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent('Sizda allaqachon navbatdan ochiq chipta bor. Navbatga qayta kirishdan oldin uni yoping.'));
          return interaction.reply({ flags: MessageFlags.IsComponentsV2 | 64, components: [redContainer] });
        }
        if (data.queue.find(p => p.userId === interaction.user.id)) return interaction.reply({ flags: MessageFlags.IsComponentsV2 | 64, components: [new ContainerBuilder().setAccentColor(0xFFA500).addTextDisplayComponents(new TextDisplayBuilder().setContent('Siz allaqachon navbatdasiz!'))] });
        const queueLimit = panelSettings.queueLimit(getGuildKitMode(guildId));
        if (data.queue.length >= queueLimit) return interaction.reply({ flags: MessageFlags.IsComponentsV2 | 64, components: [new ContainerBuilder().setAccentColor(0xFFA500).addTextDisplayComponents(new TextDisplayBuilder().setContent(`Navbat toldi (${queueLimit} kishi).`))] });
        const remaining = getCooldownRemaining(guildId, interaction.user.id, 'test');
        if (remaining > 0) return interaction.reply({ flags: MessageFlags.IsComponentsV2 | 64, components: [new ContainerBuilder().setAccentColor(0xFF0000).addTextDisplayComponents(new TextDisplayBuilder().setContent(`Sizda test uchun cooldown mavjud. Qolgan vaqt: ${formatCooldown(remaining)}`))] });
        data.queue.push({ userId: interaction.user.id, username: interaction.user.username, mcName: userData.nickname, server: userData.preferredServer, timestamp: Date.now() });
        await updateQueueMessage(guild);
        const position = data.queue.length;
        const confirmContainer = new ContainerBuilder().setAccentColor(0xFFA500);
        confirmContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent('### Navbatga qoshildingiz!'));
        confirmContainer.addSeparatorComponents(sep => sep.setSpacing(1));
        confirmContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(`Sizning o'rningiz: **${position}**. Chiqish uchun **Chiqish** tugmasini bosing.`));
        await interaction.reply({ flags: MessageFlags.IsComponentsV2 | 64, components: [confirmContainer] });
        return;
      }
      // Leave queue button
      if (customId === 'leave_queue') {
        const guild = interaction.guild;
        const guildId = guild.id;
        const data = getGuildData(guildId);
        const idx = data.queue.findIndex(p => p.userId === interaction.user.id);
        if (idx === -1) return interaction.reply({ flags: MessageFlags.IsComponentsV2 | 64, components: [new ContainerBuilder().setAccentColor(0xFFA500).addTextDisplayComponents(new TextDisplayBuilder().setContent('Siz navbatda emassiz.'))] });
        const confirmContainer = new ContainerBuilder().setAccentColor(0xFFA500);
        confirmContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent('### Chiqishni tasdiqlang\nNavbatdan chiqmoqchimisiz?'));
        confirmContainer.addSeparatorComponents(sep => sep.setSpacing(1));
        const yesButton = new ButtonBuilder().setCustomId('confirm_leave_yes').setLabel('Ha, chiqish').setStyle(ButtonStyle.Danger);
        const noButton = new ButtonBuilder().setCustomId('confirm_leave_no').setLabel('Bekor qilish').setStyle(ButtonStyle.Secondary);
        confirmContainer.addActionRowComponents(row => row.addComponents(yesButton, noButton));
        await interaction.reply({ flags: MessageFlags.IsComponentsV2 | 64, components: [confirmContainer] });
        return;
      }
      if (customId === 'confirm_leave_yes') {
        const guild = interaction.guild;
        const guildId = guild.id;
        const data = getGuildData(guildId);
        const idx = data.queue.findIndex(p => p.userId === interaction.user.id);
        if (idx !== -1) data.queue.splice(idx, 1);
        await updateQueueMessage(guild);
        await interaction.message.delete().catch(() => { });
        const container = new ContainerBuilder().setAccentColor(0xFFA500);
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent('Siz navbatdan chiqdingiz.'));
        await interaction.reply({ flags: MessageFlags.IsComponentsV2 | 64, components: [container] });
        return;
      }
      if (customId === 'confirm_leave_no') {
        await interaction.message.delete().catch(() => { });
        const container = new ContainerBuilder().setAccentColor(0xFFA500);
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent('### Chiqish bekor qilindi'));
        container.addSeparatorComponents(sep => sep.setSpacing(1));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent('Navbatdan chiqish bekor bo\'ldi.'));
        await interaction.reply({ flags: MessageFlags.IsComponentsV2 | 64, components: [container] });
        return;
      }
      if (customId.startsWith('ignore_')) {
        const playerId = customId.split('_')[1];
        const guildId = interaction.guild.id;
        const active = activeTests[guildId]?.find(t => t.playerId === playerId);
        if (!active) return interaction.reply({ content: 'Bu test topilmadi.', ephemeral: true });
        if (active.testerId !== interaction.user.id && !isStaff(interaction.member)) return interaction.reply({ content: 'Siz bu testni ignore qila olmaysiz.', ephemeral: true });
        panelTickets.setResult(interaction.channel.id, { result: 'ignored', closedBy: interaction.user.id });
        const data = getGuildData(guildId);
        const qIdx = data.queue.findIndex(p => p.userId === playerId);
        if (qIdx !== -1) data.queue.splice(qIdx, 1);
        await updateQueueMessage(interaction.guild);
        await interaction.reply({ content: `O'yinchi <@${playerId}> ticketi ignore qilindi.`, ephemeral: true });
        setTimeout(() => interaction.channel.delete().catch(() => { }), 3000);
        const aIdx = activeTests[guildId]?.findIndex(t => t.ticketId === interaction.channel.id);
        if (aIdx !== undefined && aIdx !== -1) activeTests[guildId].splice(aIdx, 1);
        saveData();
        return;
      }
      // Close confirmation buttons (for support/complaint/application tickets)
      if (customId.startsWith('confirm_close_yes')) {
        const parts = customId.split(':');
        const closeChannelId = parts[1] || interaction.channel.id;
        const closerId = parts[2] || interaction.user.id;
        const closeChannel = interaction.guild.channels.cache.get(closeChannelId) || interaction.channel;
        const limeContainer = new ContainerBuilder().setAccentColor(0x00FF00);
        limeContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent('### Chipta yopildi'));
        limeContainer.addSeparatorComponents(sep => sep.setSpacing(1));
        limeContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(`Chipta <@${closerId}> tomonidan yopildi`));
        await interaction.update({ flags: MessageFlags.IsComponentsV2, components: [limeContainer] });
        setTimeout(() => closeChannel.delete().catch(() => { }), 10000);
        delete activeConfirmations[interaction.message.id];
        return;
      }
      if (customId.startsWith('confirm_close_no')) {
        const parts = customId.split(':');
        const closerId = parts[2] || interaction.user.id;
        const redContainer = new ContainerBuilder().setAccentColor(0xFF0000);
        redContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent('### Chipta yopilishi bekor qilindi'));
        redContainer.addSeparatorComponents(sep => sep.setSpacing(1));
        redContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(`Chipta yopilishi <@${closerId}> tomonidan bekor qilindi.`));
        await interaction.update({ flags: MessageFlags.IsComponentsV2, components: [redContainer] });
        delete activeConfirmations[interaction.message.id];
        return;
      }
      // Ticket close button (for support, complaint, and application tickets) – allow ticket owner too
      if (customId === 'ticket_close_btn') {
        // Acknowledge the button press without sending placeholder text.
        await interaction.deferUpdate();
        const isOwner = interaction.channel.permissionOverwrites.cache.has(interaction.user.id);
        if (!isModCmd(interaction.member) && !isOwner) {
          await ephemeralContainer(interaction, 'Siz bu tugmani ishlata olmaysiz.', 0xFF0000);
          return;
        }
        await sendCloseConfirmation(interaction.channel, interaction.member);
        return;
      }
    }

    // Modal submits
    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'verify_modal') {
        const nick = interaction.fields.getTextInputValue('minecraft_nick');
        if (!BOT_CONFIG.nickname.pattern.test(nick) || nick.length > BOT_CONFIG.nickname.maxLength) return ephemeralContainer(interaction, BOT_CONFIG.nickname.invalidMessage, 0xFF0000);
        const guildId = interaction.guild.id;
        // Nik barcha serverlar bo'yicha tekshiriladi (oldin faqat shu serverda tekshirilardi).
        const isNickTaken = isNicknameTaken(nick, interaction.user.id);
        if (isNickTaken) {
          const red = new ContainerBuilder().setAccentColor(0xFF0000);
          red.addTextDisplayComponents(new TextDisplayBuilder().setContent('### Bu nickname allaqachon ishlatilgan!'));
          red.addSeparatorComponents(sep => sep.setSpacing(1));
          red.addTextDisplayComponents(new TextDisplayBuilder().setContent('Boshqa nickname tanlang.'));
          await interaction.reply({ flags: MessageFlags.IsComponentsV2 | 64, components: [red] });
          return;
        }
        // Previously we required the user to run `/dc <code>` in-game to confirm.
        // Now verification simply records the requested nickname if available
        // and grants the local verification entry (and the A'zo role if present).
        if (!verifiedUsers[guildId]) verifiedUsers[guildId] = {};
        await syncVerifiedProfile(guildId, interaction.user.id, nick);
        const azoRole = interaction.guild.roles.cache.find(r => r.name === BOT_CONFIG.roleNames.azo);
        if (azoRole && !interaction.member.roles.cache.has(azoRole.id)) await interaction.member.roles.add(azoRole).catch(() => { });
        const restoredTier = await restoreStoredTierForMember(interaction.member);
        // Try to set the Discord nickname to the verified Minecraft nick
        try { await interaction.member.setNickname(nick).catch(() => { }); } catch (e) { }
        const success = new ContainerBuilder().setAccentColor(0x00FF00);
        success.addTextDisplayComponents(new TextDisplayBuilder().setContent('### Muvaffaqiyatli avtorizatsiya'));
        success.addSeparatorComponents(sep => sep.setSpacing(1));
        const tierSuffix = restoredTier ? `, tier **${restoredTier}**` : '';
        success.addTextDisplayComponents(new TextDisplayBuilder().setContent(`Nickname: \`${nick}\`${tierSuffix}`));
        await interaction.reply({ flags: MessageFlags.IsComponentsV2 | 64, components: [success] });
        await logToChannel(interaction.guild, 'uztiers-log', `<@${interaction.user.id}> Minecraft akkauntini tasdiqladi: \`${nick}\`.`, 0x00FF00);
        return;
      }
      if (interaction.customId === 'server_modal') {
        const server = interaction.fields.getTextInputValue('server');
        const guildId = interaction.guild.id;
        if (!verifiedUsers[guildId]) verifiedUsers[guildId] = {};
        const userData = verifiedUsers[guildId][interaction.user.id];
        if (!userData) return interaction.reply({ content: 'Avval tasdiqlaning.', ephemeral: true });
        userData.preferredServer = server;
        saveData();
        const whitelistRole = interaction.guild.roles.cache.find(r => r.name === BOT_CONFIG.roleNames.whitelist);
        if (whitelistRole) await interaction.member.roles.add(whitelistRole).catch(() => { });
        const savedServer = new ContainerBuilder().setAccentColor(0xFFA500);
        savedServer.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Sizning serveringiz saqlandi:\nServer: \`${server}\``));
        savedServer.addSeparatorComponents(separator => separator.setSpacing(1));
        savedServer.addTextDisplayComponents(new TextDisplayBuilder().setContent('Endi navbat kanalidan foydalanishingiz mumkin.'));
        await interaction.reply({ flags: MessageFlags.IsComponentsV2 | 64, components: [savedServer] });
        return;
      }
      if (interaction.customId === 'complaint_modal') {
        const guildId = interaction.guild.id;
        const remaining = getCooldownRemaining(guildId, interaction.user.id, 'complaint');
        if (remaining > 0) {
          return ephemeralContainer(interaction, `Sizda shikoyat ticketi uchun cooldown mavjud. Qolgan vaqt: ${formatCooldown(remaining)}`, 0xFFA500);
        }
        const lockKey = acquireTicketLock(guildId, interaction.user.id, 'shikoyat');
        if (!lockKey) return ephemeralContainer(interaction, 'Ticket yaratish jarayoni allaqachon boshlangan. Biroz kuting.', 0xFFA500);
        const userNick = interaction.fields.getTextInputValue('user_nick');
        const offenderNick = interaction.fields.getTextInputValue('offender_nick');
        try {
          await interaction.deferReply({ flags: 64 });
          const existingAfterLock = interaction.guild.channels.cache.find(ch => ch.name.startsWith('shikoyat-') && ch.parent?.name === 'Shikoyat' && ch.permissionOverwrites.cache.has(interaction.user.id));
          if (existingAfterLock) {
            await interaction.editReply({ content: 'Sizning ochiq shikoyat chiptangiz allaqachon mavjud.' });
            return;
          }
          const ticket = await createModalTicket(interaction, 'Shikoyat', 'shikoyat', ['Senior Tester', 'Moderator', 'Administrator', 'Manager', 'Network Admin', 'OWNER', 'UzTiers'],
            async (ticketChannel, i) => {
              const container = new ContainerBuilder().setAccentColor(0xFFA500);
              container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### Shikoyat Chiptasi\nSalom <@${i.user.id}>. Sizning chiptangiz ochildi. Iltimos, kuting.\nOchildi: <t:${Math.floor(Date.now() / 1000)}:R>\nNik: **${userNick}**\nQoidabuzar niki: **${offenderNick}**`));
              container.addSeparatorComponents(sep => sep.setSpacing(1));
              const closeBtn = new ButtonBuilder().setCustomId('ticket_close_btn').setLabel('Yopish').setStyle(ButtonStyle.Danger);
              container.addActionRowComponents(row => row.addComponents(closeBtn));
              await ticketChannel.send({ flags: MessageFlags.IsComponentsV2, components: [container] });
            });
          setCooldown(guildId, interaction.user.id, 'complaint');
          // Send confirmation to the same channel (support channel)
          const confirmContainer = new ContainerBuilder().setAccentColor(0xFFA500);
          confirmContainer.addSectionComponents(section => section
            .addTextDisplayComponents(text => text.setContent('### Ticket yaratildi\nSizning shikoyat chiptangiz ochildi'))
            .setButtonAccessory(button => button.setStyle(ButtonStyle.Link).setURL(ticket.url).setLabel('Chiptani ochish'))
          );
          await interaction.editReply({ flags: MessageFlags.IsComponentsV2 | 64, components: [confirmContainer] });
        } catch (err) {
          console.error(err);
          if (interaction.deferred || interaction.replied) await interaction.editReply({ content: `Xatolik: ${err.message}` });
          else await ephemeralContainer(interaction, `Xatolik: ${err.message}`, 0xFF0000);
        } finally {
          releaseTicketLock(lockKey);
        }
        return;
      }
      if (interaction.customId === 'apply_modal') {
        const guildId = interaction.guild.id;
        const remaining = getCooldownRemaining(guildId, interaction.user.id, 'tester_app');
        if (remaining > 0) {
          return ephemeralContainer(interaction, `Sizda tester arizasi uchun cooldown mavjud. Qolgan vaqt: ${formatCooldown(remaining)}`, 0xFFA500);
        }
        await interaction.deferReply({ flags: 64 });
        const answers = {
          q1: interaction.fields.getTextInputValue('q1'),
          q2: interaction.fields.getTextInputValue('q2'),
          q3: interaction.fields.getTextInputValue('q3'),
          q4: interaction.fields.getTextInputValue('q4'),
          q5: interaction.fields.getTextInputValue('q5')
        };
        try {
          const ticket = await createModalTicket(interaction, 'Arizalar', `${interaction.user.username}-arizasi`, ['Senior Tester', 'Moderator', 'Administrator', 'Manager', 'Network Admin', 'OWNER', 'UzTiers'],
            async (ticketChannel, i) => {
              const container = new ContainerBuilder().setAccentColor(0xFFA500);
              container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `### Yangi Ariza\n<@${i.user.id}> tomonidan ariza.\n\n**Yosh:** ${answers.q1}\n**Siz haqingizda:** ${answers.q2}\n**Tajriba:** ${answers.q3}\n**Nega qo'shilmoqchisiz:** ${answers.q4}\n**Nega siz:** ${answers.q5}`
              ));
              container.addSeparatorComponents(sep => sep.setSpacing(1));
              const closeBtn = new ButtonBuilder().setCustomId('ticket_close_btn').setLabel('Yopish').setStyle(ButtonStyle.Danger);
              container.addActionRowComponents(row => row.addComponents(closeBtn));
              await ticketChannel.send({ flags: MessageFlags.IsComponentsV2, components: [container] });
            });
          setCooldown(guildId, interaction.user.id, 'tester_app');
          // Send confirmation to the tester-sorovi channel (where button was pressed)
          const confirmContainer = new ContainerBuilder().setAccentColor(0xFFA500);
          confirmContainer.addSectionComponents(section => section
            .addTextDisplayComponents(text => text.setContent('### Ariza yuborildi\nChiptaga o\'tish uchun tugmani bosing.'))
            .setButtonAccessory(button => button.setStyle(ButtonStyle.Link).setURL(ticket.url).setLabel('Chiptani ochish'))
          );
          await interaction.editReply({ flags: MessageFlags.IsComponentsV2 | 64, components: [confirmContainer] });
        } catch (err) { console.error(err); await ephemeralContainer(interaction, `Xatolik: ${err.message}`, 0xFF0000); }
        return;
      }
    }

    // Slash commands
    if (interaction.isCommand()) {
      // Defer all commands early to avoid "application did not respond"
      await interaction.deferReply({ flags: 64 });
      const { commandName, member, channel, guild, user, options } = interaction;
      const replyText = text => interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription(text)] });
      const guildId = guild.id;

      const altCommandChannel = guild.channels.cache.find(ch => ch.name === '🔧┃commandlar');
      if (commandName === 'leave' && !isAllowedCommandChannel(channel)) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription(`Bu buyruq faqat ${altCommandChannel?.toString() || '🔧┃commandlar'} kanalida ishlatilishi mumkin.`)] });
      if (['start', 'next', 'stop'].includes(commandName) && !isTester(member)) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription('Bu buyruq faqat testerlar uchun.')] });

      // Special commands that don't need channel restrictions
      if (commandName === 'status') {
        if (!isSeniorCmd(member)) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription('Bu buyruq faqat testerlar uchun.')] });
        const stats = testCounts[guildId]?.[user.id];
        const total = stats?.total || 0;
        const monthly = stats?.monthly || 0;
        const monthNames = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr'];
        const currentMonth = monthNames[new Date().getUTCMonth()];
        const container = new ContainerBuilder().setAccentColor(0xFFA500);
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent('### Sizning Testlar ko\'rsatgichingiz:'));
        container.addSeparatorComponents(sep => sep.setSpacing(1));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`Umumiy Testlar: \`${total}\`\n\n${currentMonth} oyi Testlari: \`${monthly}\``));
        await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [container] });
        return;
      }
      if (commandName === 'check') {
        const targetUser = options.getUser('user');
        if (!targetUser) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription('Iltimos, foydalanuvchini belgilang.')] });
        const member = await guild.members.fetch(targetUser.id).catch(() => null);
        const displayName = member?.displayName || targetUser.username;
        const lastTestTimestamp = lastTestTime[guildId]?.[targetUser.id];
        const container = new ContainerBuilder().setAccentColor(0xFFA500);
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${displayName} ning oxirgi test sanasi:`));
        container.addSeparatorComponents(sep => sep.setSpacing(1));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(formatLastTestDate(lastTestTimestamp)));
        await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [container] });
        return;
      }
      if (commandName === 'statuscheck') {
        if (!isAdminCmd(member)) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription('Bu buyruq faqat Administrator+ uchun.')] });
        const targetUser = options.getUser('user');
        if (!targetUser) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription('Iltimos, foydalanuvchini belgilang.')] });
        const stats = testCounts[guildId]?.[targetUser.id];
        const total = stats?.total || 0;
        const monthly = stats?.monthly || 0;
        const monthNames = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr'];
        const currentMonth = monthNames[new Date().getUTCMonth()];
        const container = new ContainerBuilder().setAccentColor(0xFFA500);
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${targetUser.username} ning Testlar ko'rsatgichi:`));
        container.addSeparatorComponents(sep => sep.setSpacing(1));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`Umumiy Testlar: \`${total}\`\n\n${currentMonth} oyi Testlari: \`${monthly}\``));
        await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [container] });
        return;
      }
      if (commandName === 'setkit') {
        if (!isAdminCmd(member)) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription('Bu buyruq faqat Administrator+ uchun.')] });
        const kit = options.getString('kit');
        const configuredMode = setGuildKitMode(guildId, kit);
        const testEntryChannel = guild.channels.cache.find(ch => ch.name === BOT_CONFIG.channelNames.testEntry);
        if (testEntryChannel) await refreshTestgaKirishMessage(testEntryChannel);
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription(`Ushbu server uchun kit/rejim o'rnatildi: ${configuredMode}`)] });
        return;
      }
      if (commandName === 'restrict') {
        if (!isAdminCmd(member)) return replyText('Bu buyruq faqat Administrator+ uchun.');
        const targetUser = options.getUser('user');
        const reason = options.getString('sabab');
        const months = Number(options.getString('muddat'));
        if (!targetUser || !reason || !BOT_CONFIG.restrictDurationsMonths.includes(months)) {
          return replyText('Iltimos, foydalanuvchini belgilang.');
        }
        await actionRestrict(guild, member.id, targetUser.id, months, reason);
        const container = new ContainerBuilder().setAccentColor(0xFFA500);
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### <@${targetUser.id}> test jarayonidan \`${months} oyga\` cheklandi.`));
        await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [container] });
        return;
      }
      if (commandName === 'unrestrict') {
        if (!isAdminCmd(member)) return replyText('Bu buyruq faqat Administrator+ uchun.');
        const targetUser = options.getUser('user');
        const reason = options.getString('sabab');
        if (!targetUser || !reason) return replyText('Iltimos, foydalanuvchi va sababni belgilang.');
        await actionUnrestrict(guild, member.id, targetUser.id, reason);
        const container = new ContainerBuilder().setAccentColor(0x5BC0DE);
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### <@${targetUser.id}> ning cheklovi olib tashlandi.`));
        await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [container] });
        return;
      }
      if (commandName === 'leave') {
        const whitelistRole = guild.roles.cache.find(r => r.name === BOT_CONFIG.roleNames.whitelist);
        if (!whitelistRole || !member.roles.cache.has(whitelistRole.id)) {
          const container = new ContainerBuilder().setAccentColor(0xFFA500);
          container.addTextDisplayComponents(new TextDisplayBuilder().setContent('Bu commandni ishlatish uchun siz navbat kanalida bo\'lishiz kerak.'));
          await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [container] });
          return;
        }
        const data = getGuildData(guildId);
        await member.roles.remove(whitelistRole).catch(() => { });
        const queueIndex = data.queue.findIndex(entry => entry.userId === member.id);
        if (queueIndex !== -1) data.queue.splice(queueIndex, 1);
        await updateQueueMessage(guild);
        const container = new ContainerBuilder().setAccentColor(0xFFA500);
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent('Siz navbat kanalidan olib tashlandingiz.'));
        await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [container] });
        return;
      }
      if (commandName === 'change_nickname') {
        if (!isAdminCmd(member)) return replyText('Bu buyruq faqat Administrator+ uchun.');
        const targetUser = options.getUser('user');
        const nicknameValue = options.getString('nickname');
        if (!targetUser) throw new ActionError(BOT_CONFIG.nickname.invalidMessage);
        const previousNick = await actionChangeNickname(guild, member.id, targetUser.id, nicknameValue);
        const success = new ContainerBuilder().setAccentColor(NICKNAME_LOG_COLOR);
        success.addTextDisplayComponents(new TextDisplayBuilder().setContent('### Nickname muvaffaqiyatli o\'zgartirildi'));
        success.addSeparatorComponents(sep => sep.setSpacing(1));
        success.addTextDisplayComponents(new TextDisplayBuilder().setContent(nicknameArrow(previousNick, nicknameValue)));
        await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [success] });
        return;
      }
      if (commandName === 'nickname') {
        const nicknameValue = options.getString('nickname');
        const validNick = BOT_CONFIG.nickname.pattern;
        const remaining = getCooldownRemaining(guildId, user.id, 'nickname');
        if (remaining > 0) {
          const orange = new ContainerBuilder().setAccentColor(0xFFA500);
          orange.addTextDisplayComponents(new TextDisplayBuilder().setContent(`Sizning nick almashtirish uchun cooldowningiz mavjud: ${formatCooldown(remaining)}`));
          await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [orange] });
          return;
        }
        if (!validNick.test(nicknameValue) || nicknameValue.length > BOT_CONFIG.nickname.maxLength) {
          return interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [new ContainerBuilder().setAccentColor(0xFF0000).addTextDisplayComponents(new TextDisplayBuilder().setContent(BOT_CONFIG.nickname.invalidMessage))] });
        }
        // Yangi nik boshqa o'yinchida band emasligini tekshiramiz.
        const nickTaken = isNicknameTaken(nicknameValue, user.id);
        if (nickTaken) {
          return interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [new ContainerBuilder().setAccentColor(0xFF0000).addTextDisplayComponents(new TextDisplayBuilder().setContent('Bu nickname allaqachon ishlatilgan! Boshqa nickname tanlang.'))] });
        }
        const oldNick = await resolveVerifiedNickname(guildId, user.id);
        if (oldNick === nicknameValue) {
          return interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [new ContainerBuilder().setAccentColor(0xFFA500).addTextDisplayComponents(new TextDisplayBuilder().setContent(`Sizning nikingiz allaqachon \`${nicknameValue}\`.`))] });
        }
        const existing = verifiedUsers[guildId]?.[user.id] || {};
        if (!verifiedUsers[guildId]) verifiedUsers[guildId] = {};
        if (oldNick && oldNick.toLowerCase() !== nicknameValue.toLowerCase()) {
          try {
            await db.ensurePlayer(nicknameValue);
            // Oldin faqat shu serverdagi kit tieri ko'chirilardi, boshqa kitlar eski nikda qolib ketardi.
            await moveTiersToNewNickname(oldNick, nicknameValue, guildId);
          } catch (err) {
            console.error('Nickname transfer xatosi:', err.message);
            return interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [new ContainerBuilder().setAccentColor(0xFF0000).addTextDisplayComponents(new TextDisplayBuilder().setContent('Nicknameni o\'zgartirishda xatolik yuz berdi. Birozdan keyin qayta urinib ko\'ring.'))] });
          }
        } else {
          try {
            await db.ensurePlayer(nicknameValue);
          } catch (err) {
            console.error('Nickname verify xatosi:', err.message);
            return interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [new ContainerBuilder().setAccentColor(0xFF0000).addTextDisplayComponents(new TextDisplayBuilder().setContent('Nicknameni o\'zgartirishda xatolik yuz berdi. Birozdan keyin qayta urinib ko\'ring.'))] });
          }
        }
        verifiedUsers[guildId][user.id] = {
          nickname: nicknameValue,
          verifiedAt: existing.verifiedAt || Date.now(),
          preferredServer: existing.preferredServer || null
        };

        for (const [otherGuildId, users] of Object.entries(verifiedUsers || {})) {
          if (!users?.[user.id]) continue;
          users[user.id] = {
            ...users[user.id],
            nickname: nicknameValue,
            verifiedAt: users[user.id].verifiedAt || existing.verifiedAt || Date.now()
          };
          await syncVerifiedProfile(otherGuildId, user.id, nicknameValue, users[user.id].verifiedAt || Date.now());
        }

        for (const g of client.guilds.cache.values()) {
          const targetMember = await g.members.fetch(user.id).catch(() => null);
          if (!targetMember) continue;
          await targetMember.setNickname(nicknameValue).catch(() => { });
        }

        await syncVerifiedProfile(guildId, user.id, nicknameValue, existing.verifiedAt || Date.now());
        saveData();
        const member = interaction.member;
        setCooldown(guildId, user.id, 'nickname');
        logPanelEvent('nickname', guildId, { kit: null, source: 'bot', actorId: user.id, targetId: user.id, nickname: nicknameValue, oldValue: oldNick, newValue: nicknameValue });
        await logToChannel(guild, 'uztiers-log', `<@${user.id}> ${nicknameChangeText(oldNick, nicknameValue)}.`, NICKNAME_LOG_COLOR);
        const success = new ContainerBuilder().setAccentColor(NICKNAME_LOG_COLOR);
        success.addTextDisplayComponents(new TextDisplayBuilder().setContent('### Nickname muvaffaqiyatli o\'zgartirildi'));
        success.addSeparatorComponents(sep => sep.setSpacing(1));
        success.addTextDisplayComponents(new TextDisplayBuilder().setContent(nicknameArrow(oldNick, nicknameValue)));
        await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [success] });
        return;
      }
      if (commandName === 'application') {
        if (!member.roles.cache.some(r => ['Manager', 'Network Admin', 'OWNER'].includes(r.name))) return replyText('Bu buyruq faqat Manager+ uchun.');
        const isOpen = options.getString('status') === 'open';
        await actionSetApplication(guild, member.id, isOpen);
        await replyText(`Ariza qabuli ${isOpen ? 'ochildi' : 'yopildi'}.`);
        return;
      }

      const data = getGuildData(guildId);

      if (commandName === 'start') {
        data.activeTestersSet.add(member.id);
        if (!onlineTesterCache[guildId]) onlineTesterCache[guildId] = new Set();
        if (isTesterOnline(member)) onlineTesterCache[guildId].add(member.id);
        if (!data.testersOnline) await openQueue(guild, true);
        else await updateQueueMessage(guild);
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription('Navbat ochildi. Tester sifatida qoshildingiz.')] });
      } else if (commandName === 'stop') {
        data.activeTestersSet.delete(member.id);
        if (data.activeTestersSet.size === 0) await closeQueue(guild);
        else await updateQueueMessage(guild);
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription('Siz navbatdan chiqdingiz.')] });
      } else if (commandName === 'next') {
        if (!data.testersOnline) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription('Hozir testerlar yoq. Avval /start bilan navbatni oching.')] });
        if (data.queue.length === 0) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription('Navbat bosh.')] });
        const player = data.queue.shift();
        await updateQueueMessage(guild);
        try {
          const ticketChannel = await createTestTicket(interaction, player, member);
          activeTests[guildId].push({ ticketId: ticketChannel.id, testerId: member.id, testerName: member.user.username, playerId: player.userId, playerName: player.username, mcName: player.mcName, server: player.server });
          saveData();
          const confirmContainer = new ContainerBuilder().setAccentColor(0xFFA500);
          confirmContainer.addSectionComponents(section => section
            .addTextDisplayComponents(text => text.setContent('### Ticket yaratildi\nSizga navbatdagi chipta ochildi.'))
            .setButtonAccessory(button => button.setStyle(ButtonStyle.Link).setURL(ticketChannel.url).setLabel('Chiptani ochish'))
          );
          await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [confirmContainer] });
        } catch (err) { console.error(err); await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription(`Xatolik: ${err.message}`)] }); }
      } else if (commandName === 'close') {
        const parent = channel.parent;
        if (!parent) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription('Bu kanal ticket emas.')] });
        const categoryName = parent.name;
        if (categoryName === 'Yuqori Testlar') {
          if (!isHighTestStaff(member)) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription('Bu buyruq faqat yuqori test xodimlari uchun.')] });
          const highTest = highTestTickets[guildId]?.[channel.id];
          if (!highTest) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription('Bu yuqori test ticketi topilmadi.')] });
          if (highTest.currentTier === 'LT3' && highTest.targetTier === 'HT3') {
            const nickname = await resolveVerifiedNickname(guildId, highTest.playerId, highTest.nickname);
            await sendHighTestLt3Result(guild, highTest.playerId, member.id, nickname || highTest.nickname, 'LT3', 0xAEB3B5);
          }
          setCooldown(guildId, highTest.playerId, 'high_test');
          logPanelEvent('high_loss', guildId, { actorId: member.id, targetId: highTest.playerId, nickname: highTest.nickname, oldValue: highTest.currentTier, newValue: highTest.targetTier });
          panelTickets.setResult(channel.id, { result: 'failed', closedBy: member.id });
          delete highTestTickets[guildId][channel.id];
          saveData();
          await channel.send('Ticket 5 soniyadan keyin yopiladi.');
          setTimeout(() => channel.delete().catch(() => { }), 5000);
          const failedHighTest = new ContainerBuilder().setAccentColor(0xFFA500);
          failedHighTest.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### <@${highTest.playerId}> ${highTest.targetTier} testidan yiqildi. Cooldown berildi`));
          failedHighTest.addSeparatorComponents(separator => separator.setSpacing(1));
          failedHighTest.addTextDisplayComponents(new TextDisplayBuilder().setContent('Ticket 5 soniyadan keyin yopiladi.'));
          await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [failedHighTest] });
          return;
        }
        if (categoryName !== 'Testlar 🎫') {
          return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription('/close buyrugʻi faqat test ticketlarida ishlatilishi mumkin. Boshqa ticketlarni yopish uchun "Yopish" tugmasidan foydalaning.')] });
        }
        const active = activeTests[guildId]?.find(t => t.ticketId === channel.id);
        if (!active) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription('Bu kanal faol testga tegishli emas.')] });
        if (active.testerId !== member.id && !isStaff(member)) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription('Bu test sizga tegishli emas.')] });
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('tier_select')
          .setPlaceholder('Darajani tanlang...')
          .addOptions(
            new StringSelectMenuOptionBuilder().setLabel('LT5').setDescription('Low Tier 5').setValue('LT5').setEmoji('🥉'),
            new StringSelectMenuOptionBuilder().setLabel('HT5').setDescription('High Tier 5').setValue('HT5').setEmoji('🥉'),
            new StringSelectMenuOptionBuilder().setLabel('LT4').setDescription('Low Tier 4').setValue('LT4').setEmoji('🥈'),
            new StringSelectMenuOptionBuilder().setLabel('HT4').setDescription('High Tier 4').setValue('HT4').setEmoji('🥈'),
            new StringSelectMenuOptionBuilder().setLabel('LT3').setDescription('Low Tier 3').setValue('LT3').setEmoji('🥇')
          );
        const row = new ActionRowBuilder().addComponents(selectMenu);
        await interaction.editReply({ content: `**${active.playerName} Chiptasini yopish**\nO'yinchi erishgan darajani tanlang:`, components: [row] });
        tempCloseTests.set(channel.id, { guildId, test: active, channel, tester: member });
        return;
      } else if (commandName === 'add') {
        if (!canManageTicketParticipants(member)) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription('Bu buyruq faqat Senior Tester, Moderator, Administrator, Manager, Network Admin, OWNER yoki UzTiers rollariga ega foydalanuvchilar uchun.')] });
        const targetUser = options.getUser('user');
        if (!targetUser) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription('Iltimos, qo\'shmoqchi bo\'lgan foydalanuvchini belgilang.')] });
        const perms = channel.permissionOverwrites.cache.get(targetUser.id);
        if (perms && perms.allow.has(PermissionFlagsBits.ViewChannel)) {
          const orange = new ContainerBuilder().setAccentColor(0xFFA500);
          orange.addTextDisplayComponents(new TextDisplayBuilder().setContent('Bu foydalanuvchi allaqachon chiptada mavjud!'));
          return interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [orange] });
        }
        await channel.permissionOverwrites.edit(targetUser.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }).catch(() => { });
        await channel.send(`<@${targetUser.id}> ticketga qo'shildi.`);
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription(`${targetUser.tag} ticketga qo'shildi.`)] });
      } else if (commandName === 'remove') {
        if (!canManageTicketParticipants(member)) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription('Bu buyruq faqat Senior Tester, Moderator, Administrator, Manager, Network Admin, OWNER yoki UzTiers rollariga ega foydalanuvchilar uchun.')] });
        const targetUser = options.getUser('user');
        if (!targetUser) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription('Iltimos, olib tashlamoqchi bo\'lgan foydalanuvchini belgilang.')] });
        const staffRolesToProtect = ['OWNER', 'Network Admin', 'Manager', 'Administrator', 'Moderator', 'Senior Tester', 'UzTiers'];
        const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
        if (targetMember && targetMember.roles.cache.some(r => staffRolesToProtect.includes(r.name))) {
          const orange = new ContainerBuilder().setAccentColor(0xFFA500);
          orange.addTextDisplayComponents(new TextDisplayBuilder().setContent('Bu foydalanuvchini chiptadan chiqarolmaysiz!'));
          return interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [orange] });
        }
        await channel.permissionOverwrites.delete(targetUser.id).catch(() => { });
        await channel.send(`<@${targetUser.id}> ticketdan olib tashlandi.`);
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription(`${targetUser.tag} ticketdan olib tashlandi.`)] });
      } else if (commandName === 'highresult') {
        if (!isHighTestStaff(member)) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription('Bu buyruq faqat yuqori test xodimlari uchun.')] });
        const highTestData = highTestTickets[guildId]?.[channel.id];
        if (!highTestData) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription('Bu buyruq faqat yuqori test ticketlarida ishlatilishi mumkin.')] });
        const winnerUser = await client.users.fetch(highTestData.playerId).catch(() => null);
        if (!winnerUser) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription('Ticket egasi topilmadi.')] });
        const targetTier = highTestData.targetTier;
        const winnerMember = await guild.members.fetch(winnerUser.id).catch(() => null);
        if (!winnerMember) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription('Foydalanuvchi topilmadi.')] });
        const currentTier = highTestData.currentTier;
        const winnerNick = verifiedUsers[guildId]?.[winnerUser.id]?.nickname || winnerUser.username;

        // MySQL'ga Sword tierini yozamiz (qo'shimcha). Xato bo'lsa ham kod davom etadi.
        try {
          await db.setTier(winnerNick, targetTier, getGuildKitMode(guildId));
        } catch (err) {
          if (err instanceof db.PlayerNotFoundError) console.warn(`MySQL: o'yinchi topilmadi (${winnerNick}) — tier faqat Discordda berildi.`);
          else console.error('MySQL setSwordTier (highresult) xatosi:', err.message);
        }

        const prevRole = guild.roles.cache.find(r => r.name === currentTier);
        if (prevRole && winnerMember.roles.cache.has(prevRole.id)) await winnerMember.roles.remove(prevRole).catch(() => { });
        const newRole = guild.roles.cache.find(r => r.name === targetTier);
        if (newRole) await winnerMember.roles.add(newRole).catch(() => { });
        if (!userTiers[guildId]) userTiers[guildId] = {};
        userTiers[guildId][winnerUser.id] = targetTier;
        setLastTestTime(guildId, winnerUser.id);
        setCooldown(guildId, winnerUser.id, 'high_test');
        delete highTestTickets[guildId][channel.id];
        saveData();
        logPanelEvent('high_win', guildId, { actorId: member.id, targetId: winnerUser.id, nickname: winnerNick, oldValue: currentTier, newValue: targetTier });
        panelTickets.setResult(channel.id, { result: targetTier, closedBy: member.id });
        await incrementTestCount(guildId, member.id);
        if (currentTier === 'LT3' && targetTier === 'HT3') {
          await sendHighTestLt3Result(guild, winnerUser.id, member.id, winnerNick, 'HT3', 0xF7693B);
        }
        const congratsContainer = new ContainerBuilder().setAccentColor(0xFFA500);
        congratsContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${winnerNick} ${targetTier} darajasini qo'lga kiritdi.`));
        await channel.send({ flags: MessageFlags.IsComponentsV2, components: [congratsContainer] });
        await logToChannel(guild, 'yuqori-testlar-logs', `<@${member.id}> \`${targetTier}\` darajasini <@${winnerUser.id}> ga berdi.`, 0xFFA500);
        await logActionToChannel(guild, `<@${member.id}> \`/highresult\` komandasini ishlatib, <@${winnerUser.id}> ga \`${targetTier}\` darajasini berdi.`, 0x5865F2);
        setTimeout(() => channel.delete().catch(() => { }), 5000);
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription(`${winnerUser.tag} ga ${targetTier} darajasi berildi. Ticket 5 soniyadan keyin yopiladi.`)] });
      } else if (commandName === 'forceclose') {
        if (!isModCmd(member)) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription('Bu buyruq faqat Moderator+ uchun.')] });
        const parent = channel.parent;
        if (!parent || !['Testlar 🎫', 'Yuqori Testlar', 'Yordam', 'Shikoyat', 'Arizalar', 'Yordam so\'rovlari', 'Tester so\'rovlari'].includes(parent.name))
          return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription('Bu kanal ticket emas.')] });
        const regularTest = activeTests[guildId]?.find(t => t.ticketId === channel.id);
        if (regularTest) activeTests[guildId] = activeTests[guildId].filter(t => t.ticketId !== channel.id);
        const highTest = highTestTickets[guildId]?.[channel.id];
        if (highTest) delete highTestTickets[guildId][channel.id];
        saveData();
        panelTickets.setResult(channel.id, { result: 'forced', closedBy: member.id });
        await channel.send('Ticket majburiy yopilmoqda...');
        setTimeout(() => channel.delete().catch(() => { }), 3000);
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription('Ticket yopildi.')] });
        await logActionToChannel(guild, `<@${member.id}> \`/forceclose\` komandasini \`${channel.name}\` ticketida ishlatdi.`, 0x5865F2);
      } else if (commandName === 'retired' || commandName === 'unretired') {
        if (!isAdminCmd(member)) return replyText('Bu buyruq faqat Administrator+ uchun.');
        const targetUser = options.getUser('user');
        if (!targetUser) return replyText('Iltimos, foydalanuvchini belgilang.');
        const retired = commandName === 'retired';
        await actionSetRetired(guild, member.id, targetUser.id, retired);
        await replyText(retired ? `${targetUser.tag} ga Retired roli berildi.` : `${targetUser.tag} dan Retired roli olib tashlandi.`);
      } else if (commandName === 'cd') {
        if (!isAdminCmd(member)) return replyText('Bu buyruq faqat Administrator+ uchun.');
        const targetUser = options.getUser('user');
        const category = options.getString('category');
        const days = options.getInteger('days');
        if (!targetUser || !category || !days) return replyText('Iltimos, barcha maydonlarni to\'ldiring.');
        await actionSetCooldown(guild, member.id, targetUser.id, category, days);
        await replyText(`${targetUser.tag} ga ${category} cooldown (${days} kun) berildi.`);
      } else if (commandName === 'cooldown') {
        if (!isSeniorCmd(member)) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription('Bu buyruq faqat Senior Tester+ uchun.')] });
        const targetUser = options.getUser('user');
        const category = options.getString('category') || 'test';
        if (!targetUser) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription('Iltimos, foydalanuvchini belgilang.')] });
        if (!BOT_CONFIG.cooldownDurations[category]) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription('Noto\'g\'ri kategoriya tanlandi.')] });
        const remaining = getCooldownRemaining(guildId, targetUser.id, category);
        if (remaining === 0) {
          await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription(`${targetUser.tag} uchun ${category} cooldowni mavjud emas.`)] });
        } else {
          await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription(`${targetUser.tag} uchun ${category} cooldowni: ${formatCooldown(remaining)}.`)] });
        }
      } else if (commandName === 'deletetier') {
        if (!isManagerCmd(member)) return replyText('Bu buyruq faqat Manager, Network Admin yoki OWNER uchun.');
        const targetUser = options.getUser('user');
        if (!targetUser) return replyText('Iltimos, foydalanuvchini belgilang.');
        const removed = await actionDeleteTier(guild, member.id, targetUser.id);
        await replyText(removed ? `${targetUser.tag} dan barcha darajalar olib tashlandi.` : `${targetUser.tag} da hech qanday daraja topilmadi.`);
      } else if (commandName === 'tier') {
        if (!isAdminCmd(member)) return replyText('Bu buyruq faqat Administrator+ uchun.');
        const targetUser = options.getUser('user');
        const targetTier = options.getString('tier');
        if (!targetUser || !targetTier) return replyText('Iltimos, barcha maydonlarni to\'ldiring.');
        await actionSetTier(guild, member.id, targetUser.id, targetTier);
        await replyText(`${targetUser.tag} ga ${targetTier} darajasi berildi.`);
      } else if (commandName === 'demote') {
        if (!isAdminCmd(member)) return replyText('Bu buyruq faqat Administrator+ uchun.');
        const targetUser = options.getUser('user');
        const newTier = options.getString('tier');
        if (!targetUser || !newTier) return replyText('Iltimos, barcha maydonlarni to\'ldiring.');
        const currentTier = await actionDemote(guild, member.id, targetUser.id, newTier);
        await replyText(`${targetUser.tag} ning darajasi ${currentTier} dan ${newTier} ga pasaytirildi.`);
      } else if (commandName === 'kicktester') {
        if (!isModCmd(member)) return replyText('Bu buyruq faqat Moderator+ uchun.');
        const targetTester = options.getUser('tester');
        if (!targetTester) return replyText('Iltimos, testerni belgilang.');
        await actionKickTester(guild, member.id, targetTester.id);
        await replyText(`${targetTester.tag} tester navbatdan chiqarildi.`);
      } else if (commandName === 'resetcooldown') {
        if (!isAdminCmd(member)) return replyText('Bu buyruq faqat Administrator+ uchun.');
        const targetUser = options.getUser('user');
        const category = options.getString('category');
        if (!targetUser || !category) return replyText('Iltimos, foydalanuvchi va kategoriyani belgilang.');
        const reset = await actionResetCooldown(guild, member.id, targetUser.id, category);
        await replyText(reset ? `${targetUser.tag} uchun ${category} cooldown tiklandi${category === 'nickname' ? ' (global)' : ''}.` : `${targetUser.tag} uchun ${category} cooldown mavjud emas.`);
      }
      return;
    }

    // --- STRING SELECT MENU (regular test tier selection) ---
    if (interaction.isStringSelectMenu() && interaction.customId === 'tier_select') {
      const tempData = tempCloseTests.get(interaction.channel.id);
      if (!tempData) return embedReply(interaction, 'Nimadir xato ketdi. Qaytadan /close bosing.');
      await interaction.deferReply({ flags: 64 });
      const { guildId, test, channel, tester } = tempData;
      const tier = interaction.values[0];
      const playerId = test.playerId;
      const playerName = test.playerName;
      const minecraftNick = verifiedUsers[guildId]?.[playerId]?.nickname || test.mcName;

      // MySQL'ga Sword tierini yozamiz (qo'shimcha). Xato bo'lsa ham kod davom etadi.
      let dbOldTier = null;
      try {
        const res = await db.setTier(minecraftNick, tier, getGuildKitMode(guildId));
        dbOldTier = res.oldTier;
      } catch (err) {
        if (err instanceof db.PlayerNotFoundError) console.warn(`MySQL: o'yinchi topilmadi (${minecraftNick}) — tier faqat Discordda berildi.`);
        else console.error('MySQL setSwordTier xatosi:', err.message);
      }

      const role = interaction.guild.roles.cache.find(r => r.name === tier);
      const memberPlayer = await interaction.guild.members.fetch(playerId).catch(() => null);
      if (role && memberPlayer) {
        const prevTier = userTiers[guildId]?.[playerId];
        if (prevTier && prevTier !== tier) {
          const prevRole = interaction.guild.roles.cache.find(r => r.name === prevTier);
          if (prevRole && memberPlayer.roles.cache.has(prevRole.id)) await memberPlayer.roles.remove(prevRole).catch(() => { });
        }
        await memberPlayer.roles.add(role).catch(() => { });
        const whitelistRole = interaction.guild.roles.cache.find(r => r.name === 'Whitelist');
        if (whitelistRole && memberPlayer.roles.cache.has(whitelistRole.id)) await memberPlayer.roles.remove(whitelistRole).catch(() => { });
      }
      const oldTier = dbOldTier || (userTiers[guildId]?.[playerId]) || 'yo\'q';
      if (!userTiers[guildId]) userTiers[guildId] = {};
      userTiers[guildId][playerId] = tier;
      saveData();
      setCooldown(guildId, playerId, 'test');
      setLastTestTime(guildId, playerId);
      saveData();
      logPanelEvent('test', guildId, { actorId: tester.id, targetId: playerId, nickname: minecraftNick, oldValue: oldTier === 'yo\'q' ? null : oldTier, newValue: tier });
      panelTickets.setResult(channel.id, { result: tier, closedBy: tester.id });
      await incrementTestCount(guildId, tester.id);

      const skinUrl = `https://render.crafty.gg/3d/bust/${encodeURIComponent(minecraftNick)}`;
      const resultEmbed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setAuthor({ name: `${minecraftNick} ning Test Natijalari 🏆`, iconURL: memberPlayer?.user?.displayAvatarURL() || interaction.client.users.cache.get(playerId)?.displayAvatarURL() })
        .setThumbnail(skinUrl)
        .addFields(
          { name: 'Tester:', value: `<@${tester.id}>`, inline: false },
          { name: 'O\'yinchi Niki:', value: minecraftNick, inline: false },
          { name: 'Oldingi Tier:', value: oldTier === 'yo\'q' ? 'yo\'q' : oldTier, inline: false },
          { name: 'Qo\'lga kiritilgan Tier:', value: tier, inline: false }
        );
      const resultsChannel = interaction.guild.channels.cache.find(ch => ch.name === '🥈┃natijalar');
      if (resultsChannel) await resultsChannel.send({ content: `<@${playerId}>`, embeds: [resultEmbed] });

      const idx = activeTests[guildId]?.findIndex(t => t.ticketId === test.ticketId);
      if (idx !== undefined && idx !== -1) activeTests[guildId].splice(idx, 1);
      saveData();
      await updateQueueMessage(interaction.guild);
      const tierAwarded = new ContainerBuilder().setAccentColor(0xFFA500);
      tierAwarded.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${playerName} ga ${tier} darajasi berildi.`));
      tierAwarded.addSeparatorComponents(separator => separator.setSpacing(1));
      tierAwarded.addTextDisplayComponents(new TextDisplayBuilder().setContent('Kanal 5 soniyadan keyin yopiladi.'));
      await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [tierAwarded] });
      setTimeout(() => channel.delete().catch(() => { }), 5000);
      tempCloseTests.delete(interaction.channel.id);
      return;
    }
  } catch (err) {
    if (err?.code === 10062 || err?.code === 40060) return;
    if (err instanceof ActionError) {
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription(err.message)] }).catch(() => { });
      return;
    }
    console.error('interactionCreate xatosi:', err);
  }
});

process.on('uncaughtException', error => {
  console.error('Uncaught exception:', error);
});
process.on('unhandledRejection', reason => {
  console.error('Unhandled promise rejection:', reason);
});

client.login(process.env.TOKEN);
