'use strict';
// UzTiers veb-panel serveri.
// Panel faqat 127.0.0.1 da tinglaydi; tashqariga Cloudflare Tunnel orqali chiqadi.
// Har bir amal rol bo'yicha tekshiriladi va bot.js dagi Discord komandalari bilan bir xil funksiyani chaqiradi.
//
// Kirish qoidalari:
//  - Panelga faqat Administrator va undan yuqori rollar kira oladi.
//  - Administrator faqat o'zi Administrator bo'lgan kit(lar)ni ko'radi. Manager va yuqorisi hamma kitni ko'radi.
//  - Panelga kirgan har bir xodim o'z kit(lar)idagi hamma xodimning amallari va statistikasini ko'radi. Ko'rish amal huquqini bermaydi.
//  - Kirishlar tarixi boshqacha: xodim o'zinikini va o'zidan past rollarnikini ko'radi, teng va yuqori rollarnikini ko'rmaydi (OWNER hammasini ko'radi).
//  - Xodim o'zidan past bo'lmagan xodimga amal qo'llay olmaydi.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ROLE_ORDER, ADMIN_RANK, MANAGER_RANK, OWNER_RANK, TIER_LIMIT_MS, rankOfRole, bestRankOf, canAssignRole, staffRoleByName, neighbourTiers, tierLockUntil } = require('./rules');
const { SettingsError, PANEL_FIELDS, MODAL_FIELD_STYLES } = require('./settings');

const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSION_COOKIE = 'uzp_session';
const STATE_COOKIE = 'uzp_state';
const SESSION_DAYS = 7;
const ACCESS_TTL_MS = 30 * 1000;
const ONLINE_MS = 60 * 1000;
const DISCORD_API = 'https://discord.com/api/v10';
const DAY_MS = 24 * 60 * 60 * 1000;
const UZ_OFFSET_MS = 5 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 16 * 1024;
const CHAT_MAX_LENGTH = 2000;
const NOTE_MAX_LENGTH = 1000;
const BIO_MAX_LENGTH = 400;
const STATUS_MAX_LENGTH = 80;
const REASON_MAX_LENGTH = 200;
const SKIN_REFRESH_MS = 10 * 60 * 1000;
const NOTIFICATION_DAYS = 7;
const AUDIT_LOG_MEMBER_UPDATE = 24;

// Saytdagi ball jadvali bilan bir xil (uztiers lib/players.php).
const TIER_VALUES = { LT5: 1, HT5: 2, LT4: 3, HT4: 4, LT3: 6, HT3: 10, LT2: 20, HT2: 30, LT1: 45, HT1: 60 };
const TIER_ORDER = ['HT1', 'LT1', 'HT2', 'LT2', 'HT3', 'LT3', 'HT4', 'LT4', 'HT5', 'LT5'];
const KIT_ORDER = ['axe', 'mace', 'nethpot', 'potion', 'smp', 'sword', 'uhc', 'vanilla'];
const KIT_NAMES = { axe: 'Axe', mace: 'Mace', nethpot: 'NethPot', potion: 'Potion', smp: 'SMP', sword: 'Sword', uhc: 'UHC', vanilla: 'Vanilla' };
// Saytda Potion ko'rsatilmaydi, shuning uchun ball hisobiga kirmaydi (ball sayt bilan bir xil bo'lishi uchun).
const KITS_NOT_ON_SITE = new Set(['potion']);
const CONTENT_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const LONG_CACHE_TYPES = new Set(['image/png', 'image/webp', 'font/woff2']);
const FILE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
const ID_RE = /^\d{15,25}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const COOLDOWN_CATEGORIES = ['test', 'high_test', 'help', 'complaint', 'tester_app', 'nickname'];
const RESTRICT_MONTHS = [3, 6, 9];
// Discord'ning timeout chegarasi: eng ko'pi 28 kun.
const MUTE_MINUTES = [10, 60, 360, 1440, 10080, 40320];
const LOG_GROUPS = {
  tests: ['test', 'high_win', 'high_loss'],
  tiers: ['tier_set', 'tier_demote', 'tier_delete'],
  punish: ['restrict', 'unrestrict', 'mute', 'unmute'],
  cooldowns: ['cooldown_set', 'cooldown_reset'],
  staff: ['staff_add', 'staff_remove', 'kick_tester'],
  players: ['verified', 'nickname', 'retired', 'unretired', 'note_add', 'note_delete'],
  queue: ['queue_remove', 'queue_move', 'queue_close', 'ticket_close'],
  settings: ['application', 'chat_delete', 'settings_change', 'panel_publish', 'news_add', 'news_delete'],
  logins: ['panel_login']
};
// Panel sozlamalari sahifalaridagi nomlar (log va javob matnlari uchun).
const PANEL_LABELS = { verification: 'Tasdiqlash', testEntry: 'Testga kirish', support: 'Yordam so\'rovi', testerApp: 'Tester arizasi', queue: 'Navbat' };
const MODAL_LABELS = { verify: 'Tasdiqlash', server: 'Server', complaint: 'Shikoyat', apply: 'Tester arizasi' };
const STATS_DAYS = [7, 14, 30, 60, 90, 180, 365];
// Achievementlar: tests - jami testlar, high - yuqori testlar, weeks - hafta yulduzi, days - xodimlik kunlari.
const ACHIEVEMENTS = [
  { id: 'tests10', metric: 'tests', need: 10, trophy: 'bronze', title: 'Birinchi qadam', text: '10 ta test oldi' },
  { id: 'tests50', metric: 'tests', need: 50, trophy: 'silver', title: 'Tajribali tester', text: '50 ta test oldi' },
  { id: 'tests100', metric: 'tests', need: 100, trophy: 'gold', title: 'Yuzlik', text: '100 ta test oldi' },
  { id: 'tests500', metric: 'tests', need: 500, trophy: 'amber', title: 'Afsona', text: '500 ta test oldi' },
  { id: 'high5', metric: 'high', need: 5, trophy: 'bronze', title: 'Yuqori daraja', text: '5 ta yuqori test oldi' },
  { id: 'high25', metric: 'high', need: 25, trophy: 'silver', title: 'Ustoz', text: '25 ta yuqori test oldi' },
  { id: 'high100', metric: 'high', need: 100, trophy: 'gold', title: 'Grandmaster', text: '100 ta yuqori test oldi' },
  { id: 'week1', metric: 'weeks', need: 1, trophy: 'gold', title: 'Hafta yulduzi', text: 'Haftaning eng faol testeri bo\'ldi' },
  { id: 'week5', metric: 'weeks', need: 5, trophy: 'amber', title: 'Doimiy yulduz', text: '5 marta haftaning eng faoli bo\'ldi' },
  { id: 'days30', metric: 'days', need: 30, trophy: 'bronze', title: 'Bir oylik', text: '30 kundan beri xodim' },
  { id: 'days180', metric: 'days', need: 180, trophy: 'silver', title: 'Yarim yillik', text: '180 kundan beri xodim' },
  { id: 'days365', metric: 'days', need: 365, trophy: 'gold', title: 'Bir yillik', text: '365 kundan beri xodim' }
];

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Cloudflare brauzerga JS va CSS ni 4 soat saqlashni aytadi, shuning uchun havolalarga versiya qo'shiladi:
// har bir yangilanish hammaga darhol yetib boradi va eski fayllar yangilari bilan aralashib ketmaydi.
function withVersionLinks(route, body, version) {
  if (route.endsWith('.js')) return Buffer.from(body.toString('utf8').replace(/((?:from|import)\s*)'(\.{1,2}\/[^'?]+\.js)'/g, `$1'$2?v=${version}'`));
  if (route.endsWith('.html')) return Buffer.from(body.toString('utf8').replace(/((?:src|href)=")(\/(?:js|css)\/[^"?]+)"/g, `$1$2?v=${version}"`));
  return body;
}
function loadStaticFiles() {
  const found = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      const type = CONTENT_TYPES[path.extname(entry.name)];
      if (!type) continue;
      found.push({ route: '/' + path.relative(PUBLIC_DIR, full).split(path.sep).join('/'), type, body: fs.readFileSync(full) });
    }
  };
  walk(PUBLIC_DIR);
  found.sort((a, b) => a.route.localeCompare(b.route));
  const hash = crypto.createHash('md5');
  for (const file of found) hash.update(file.route).update(file.body);
  const version = hash.digest('hex').slice(0, 10);
  const files = new Map();
  for (const { route, type, body: raw } of found) {
    const body = withVersionLinks(route, raw, version);
    files.set(route, { body, type, etag: `"${crypto.createHash('md5').update(body).digest('hex')}"` });
  }
  files.set('/', files.get('/index.html'));
  return files;
}

// Foydalanuvchiga ko'rsatiladigan xato (masalan, noto'g'ri qiymat).
class BadRequest extends Error { }

// Chiptalar saqlanmayotgan bo'lsa ham panel ishlayveradi.
const NO_TICKETS = { summary: kits => ({ regular: kits.map(kit => ({ kit, open: 0, total: 0, lastAt: 0, images: 0 })), high: kits.map(kit => ({ kit, open: 0, total: 0, lastAt: 0, images: 0 })) }), liveList: () => [], recentOpened: () => [], firstOpenedAt: () => null, list: async () => ({ total: 0, page: 1, pages: 1, partial: false, items: [] }), get: () => null, getMeta: () => null, filePath: () => null };

function createPanel({ client, events, tickets = NO_TICKETS, getState, kitByGuild, getCooldownRemaining, actions = {}, ActionError = class extends Error { }, env = process.env, fetchImpl = fetch, log = console, settings = null, news = null, botInfo = {} }) {
  const publicUrl = String(env.PANEL_PUBLIC_URL || '').replace(/\/+$/, '');
  const sessionSecret = env.PANEL_SESSION_SECRET;
  const clientSecret = env.DISCORD_CLIENT_SECRET;
  const secureCookies = publicUrl.startsWith('https://');
  const redirectUri = `${publicUrl}/auth/callback`;
  const staticFiles = loadStaticFiles();
  const accessCache = new Map();
  const lastSeen = new Map();
  const seenSaved = new Map();
  const rateHits = new Map();
  const auditMemo = new Map();

  const guildByKit = {};
  for (const [guildId, kit] of Object.entries(kitByGuild)) guildByKit[kit] = guildId;
  const kits = KIT_ORDER.filter(k => guildByKit[k]).map(k => ({ kit: k, name: KIT_NAMES[k], guildId: guildByKit[k] }));
  const kitBySlug = new Map(kits.map(k => [k.kit, k]));

  // ---------- javob yordamchilari ----------
  function setSecurityHeaders(res) {
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' https://cdn.discordapp.com https://mc-heads.net https://render.crafty.gg; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (secureCookies) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  }
  function sendJson(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  }
  function sendText(res, status, text) {
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(text);
  }
  function redirect(res, location) {
    res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
    res.end();
  }
  function cookie(name, value, maxAgeSeconds) {
    return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secureCookies ? '; Secure' : ''}`;
  }
  const safe = (promise, fallback) => Promise.resolve(promise).catch(err => { log.error('Panel: ma\'lumot o\'qilmadi:', err.message); return fallback; });

  function readJsonBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) { reject(new BadRequest('So\'rov juda katta.')); req.destroy(); return; }
        chunks.push(chunk);
      });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not object');
          resolve(parsed);
        } catch {
          reject(new BadRequest('So\'rov noto\'g\'ri.'));
        }
      });
      req.on('error', reject);
    });
  }
  // Boshqa saytdan yuborilgan so'rovlarni to'sadi.
  function isTrustedWrite(req) {
    return req.headers.origin === publicUrl && String(req.headers['content-type'] || '').startsWith('application/json');
  }
  function overLimit(key, limit, windowMs) {
    const now = Date.now();
    const hits = (rateHits.get(key) || []).filter(t => now - t < windowMs);
    if (hits.length >= limit) { rateHits.set(key, hits); return true; }
    hits.push(now);
    rateHits.set(key, hits);
    return false;
  }

  // ---------- sessiya ----------
  function sign(data) {
    return crypto.createHmac('sha256', sessionSecret).update(data).digest('base64url');
  }
  function signSession(uid) {
    const data = Buffer.from(JSON.stringify({ uid, exp: Date.now() + SESSION_DAYS * DAY_MS })).toString('base64url');
    return `${data}.${sign(data)}`;
  }
  function verifySession(token) {
    if (!token) return null;
    const [data, signature, extra] = String(token).split('.');
    if (!data || !signature || extra !== undefined || !safeEqual(signature, sign(data))) return null;
    try {
      const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
      if (!ID_RE.test(String(payload.uid)) || !(payload.exp > Date.now())) return null;
      return payload;
    } catch {
      return null;
    }
  }

  // ---------- rollar va kirish huquqi: faqat 8 ta asosiy serverdagi rollar hisoblanadi ----------
  // Har qanday xodim (panelga kira olmaydiganlar ham) haqida ma'lumot.
  function staffInfo(userId) {
    let rank = -1;
    const inKits = [];
    for (const k of kits) {
      const best = bestRankOf(client.guilds.cache.get(k.guildId)?.members.cache.get(userId));
      if (best < 0) continue;
      rank = Math.max(rank, best);
      inKits.push({ kit: k.kit, role: ROLE_ORDER[best], rank: best });
    }
    return rank >= 0 ? { role: ROLE_ORDER[rank], rank, kits: inKits } : null;
  }
  const rankOf = userId => staffInfo(userId)?.rank ?? -1;
  // Panelga kirish: Administrator va yuqorisi. scope: ko'rishi mumkin bo'lgan kitlar.
  function computeAccess(userId) {
    const info = staffInfo(userId);
    if (!info || info.rank < ADMIN_RANK) return null;
    const global = info.rank >= MANAGER_RANK;
    const scope = global ? kits.map(k => k.kit) : info.kits.filter(k => k.rank >= ADMIN_RANK).map(k => k.kit);
    return { ...info, global, isOwner: info.rank === OWNER_RANK, scope, scopeSet: new Set(scope) };
  }
  function getAccess(userId) {
    const cached = accessCache.get(userId);
    if (cached && cached.until > Date.now()) return cached.access;
    const access = computeAccess(userId);
    accessCache.set(userId, { access, until: Date.now() + ACCESS_TTL_MS });
    return access;
  }
  const scopeKits = access => kits.filter(k => access.scopeSet.has(k.kit));
  const inScope = (access, kit) => Boolean(kit) && access.scopeSet.has(kit);

  // Voqealarni ko'rish chegarasi (SQL uchun).
  function eventScope(access) {
    const scope = {};
    if (!access.global) {
      scope.kitsIn = access.scope;
      scope.guildsIn = access.scope.map(slug => kitBySlug.get(slug).guildId);
    }
    if (!access.isOwner) scope.hideTypes = LOG_GROUPS.logins;
    return scope;
  }

  // Kirishlar tarixi: teng va yuqori rollarning kirishlari ko'rinmaydi.
  function loginScope(access, viewerId) {
    if (access.isOwner) return {};
    return { hideActors: [...allStaff().values()].filter(m => m.rank >= access.rank && m.id !== viewerId).map(m => m.id) };
  }

  // ---------- Discord orqali kirish ----------
  function beginLogin(res) {
    const state = crypto.randomBytes(24).toString('base64url');
    const clientId = client.application?.id || client.user.id;
    const query = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirectUri, scope: 'identify', state, prompt: 'none' });
    res.setHeader('Set-Cookie', cookie(STATE_COOKIE, state, 600));
    redirect(res, `https://discord.com/oauth2/authorize?${query}`);
  }
  // Kirishlar tarixi: IP saqlanmaydi, faqat mamlakat va brauzer.
  function loginNote(req) {
    const agent = String(req.headers['user-agent'] || '');
    const browser = /Edg\//.test(agent) ? 'Edge' : /OPR\//.test(agent) ? 'Opera' : /YaBrowser/.test(agent) ? 'Yandex' : /Firefox\//.test(agent) ? 'Firefox' : /Chrome\//.test(agent) ? 'Chrome' : /Safari\//.test(agent) ? 'Safari' : 'Boshqa brauzer';
    const system = /Windows/.test(agent) ? 'Windows' : /Android/.test(agent) ? 'Android' : /iPhone|iPad/.test(agent) ? 'iOS' : /Mac OS/.test(agent) ? 'macOS' : /Linux/.test(agent) ? 'Linux' : 'Boshqa tizim';
    const country = /^[A-Z]{2}$/.test(String(req.headers['cf-ipcountry'] || '')) ? req.headers['cf-ipcountry'] : '??';
    return `${country} · ${browser} · ${system}`;
  }
  async function finishLogin(req, res, url) {
    const cookies = parseCookies(req.headers.cookie);
    const state = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    const clearState = cookie(STATE_COOKIE, '', 0);
    res.setHeader('Set-Cookie', clearState);
    if (url.searchParams.get('error')) return redirect(res, '/?error=denied');
    if (!state || !code || !cookies[STATE_COOKIE] || !safeEqual(state, cookies[STATE_COOKIE])) return redirect(res, '/?error=failed');

    let user;
    try {
      const tokenRes = await fetchImpl(`${DISCORD_API}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: client.application?.id || client.user.id, client_secret: clientSecret, grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
        signal: AbortSignal.timeout(10000)
      });
      if (!tokenRes.ok) { log.error('Panel: Discord token xatosi:', tokenRes.status); return redirect(res, '/?error=failed'); }
      const { access_token: accessToken } = await tokenRes.json();
      const userRes = await fetchImpl(`${DISCORD_API}/users/@me`, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10000) });
      if (!userRes.ok) { log.error('Panel: Discord foydalanuvchi xatosi:', userRes.status); return redirect(res, '/?error=failed'); }
      user = await userRes.json();
    } catch (err) {
      log.error('Panel: Discord bilan aloqa xatosi:', err.message);
      return redirect(res, '/?error=failed');
    }

    // Keshda bo'lmasa ham rollarni Discord'dan yangilab olamiz.
    for (const k of kits) await client.guilds.cache.get(k.guildId)?.members.fetch(user.id).catch(() => null);
    const access = computeAccess(user.id);
    accessCache.set(user.id, { access, until: Date.now() + ACCESS_TTL_MS });
    if (!access) return redirect(res, '/?error=no_access');

    events.record('panel_login', { actorId: user.id, note: loginNote(req), source: 'panel' });
    res.setHeader('Set-Cookie', [clearState, cookie(SESSION_COOKIE, signSession(user.id), SESSION_DAYS * 24 * 60 * 60)]);
    return redirect(res, '/');
  }
  function logout(req, res) {
    if (req.headers.origin !== publicUrl) return sendJson(res, 403, { error: 'bad_origin' });
    res.setHeader('Set-Cookie', cookie(SESSION_COOKIE, '', 0));
    res.writeHead(204, { 'Cache-Control': 'no-store' });
    return res.end();
  }

  // ---------- ma'lumot yordamchilari ----------
  function label(id) {
    const s = getState();
    const user = client.users.cache.get(id);
    return s.userProfiles?.[id]?.nickname || user?.globalName || user?.username || id;
  }
  function avatarOf(id, size = 64) {
    const user = client.users.cache.get(id);
    return user ? user.displayAvatarURL({ size, extension: 'png' }) : null;
  }
  function memberOf(kit, id) {
    return client.guilds.cache.get(kit.guildId)?.members.cache.get(id) || null;
  }
  function nicknameOf(id, s) {
    if (s.userProfiles?.[id]?.nickname) return s.userProfiles[id].nickname;
    for (const k of kits) if (s.verifiedUsers?.[k.guildId]?.[id]?.nickname) return s.verifiedUsers[k.guildId][id].nickname;
    return null;
  }
  function monthlyOf(stat) {
    const now = new Date();
    const last = new Date(stat?.lastMonthlyReset || 0);
    return now.getUTCMonth() === last.getUTCMonth() && now.getUTCFullYear() === last.getUTCFullYear() ? (stat?.monthly || 0) : 0;
  }
  function activeRestriction(id, s) {
    const record = s.restrictedUsers?.__global?.[id];
    return record && Number(record.endsAt) > Date.now() ? record : null;
  }
  function muteUntil(member) {
    const until = member?.communicationDisabledUntilTimestamp;
    return until && until > Date.now() ? until : null;
  }
  // Discord'dagi rol rangi (rang berilmagan bo'lsa null).
  const roleColorMemo = new Map();
  function roleColor(name) {
    if (!name) return null;
    const memo = roleColorMemo.get(name);
    if (memo && memo.until > Date.now()) return memo.color;
    let color = null;
    for (const k of kits) {
      const roles = client.guilds.cache.get(k.guildId)?.roles?.cache;
      const role = roles?.find?.(r => r.name === name);
      if (role?.hexColor && role.hexColor !== '#000000') { color = role.hexColor; break; }
    }
    roleColorMemo.set(name, { color, until: Date.now() + 5 * 60 * 1000 });
    return color;
  }
  // Loglar va ro'yxatlar uchun: avatar, ism va eng yuqori rol.
  function personOf(id) {
    if (!id) return null;
    const info = staffInfo(id);
    return { id, name: label(id), avatar: avatarOf(id), role: info?.role || null, roleColor: info ? roleColor(info.role) : null };
  }
  function withPeople(rows) {
    return rows.map(e => {
      const actor = personOf(e.actorId);
      const target = e.targetId ? { ...personOf(e.targetId), name: e.nickname || label(e.targetId) } : (e.nickname ? { id: null, name: e.nickname, avatar: null, role: null, roleColor: null } : null);
      return { ...e, actor, target, actorName: actor?.name || null, targetName: target?.name || null };
    });
  }
  function kitCounts(guildId, s) {
    let total = 0;
    let month = 0;
    for (const stat of Object.values(s.testCounts?.[guildId] || {})) {
      total += stat.total || 0;
      month += monthlyOf(stat);
    }
    return { total, month };
  }
  function queueView(k, s) {
    const guildId = k.guildId;
    return {
      open: s.testersOnline?.[guildId] === true,
      players: (s.queues?.[guildId] || []).map(p => ({ id: p.userId, nick: p.mcName || p.username, server: p.server || null, since: p.timestamp || null, avatar: avatarOf(p.userId), ...skinOf(p.mcName || p.username) })),
      testers: [...(s.activeTestersSet?.[guildId] || [])].map(id => personOf(id)),
      active: (s.activeTests?.[guildId] || []).map(t => ({ ticketId: t.ticketId || null, testerId: t.testerId, testerName: label(t.testerId), testerAvatar: avatarOf(t.testerId), playerId: t.playerId, nick: t.mcName || t.playerName, server: t.server || null, ...skinOf(t.mcName || t.playerName) }))
    };
  }
  function rolesOf(member) {
    if (!member) return [];
    return [...member.roles.cache.values()]
      .filter(r => r.name !== '@everyone')
      .sort((a, b) => (b.position || 0) - (a.position || 0))
      .map(r => ({ name: r.name, color: r.hexColor && r.hexColor !== '#000000' ? r.hexColor : null }));
  }

  // Shu serverda shu odamning qaysi rollarini o'zgartirish mumkin (mumkin bo'lmasa null). Amal bajarilganda bot yana tekshiradi.
  function roleControlFor(k, member, targetId, viewerId, access) {
    const myRank = access.kits.find(x => x.kit === k.kit)?.rank ?? -1;
    if (!member || member.user?.bot || targetId === viewerId || myRank < MANAGER_RANK || rankOf(targetId) >= access.rank) return null;
    const guild = client.guilds.cache.get(k.guildId);
    return ROLE_ORDER.filter(name => canAssignRole(myRank, name)).reverse().map(name => {
      const role = staffRoleByName(guild, name);
      return { name, has: Boolean(role && member.roles.cache.has(role.id)), exists: Boolean(role), editable: Boolean(role?.editable) };
    });
  }

  // O'yinchi skini: sayt bilan bir xil (SkinsRestorer). Baza javob bermasa, o'z niki bilan chiziladi.
  let skinMap = {};
  const skinOf = nickname => {
    const ref = skinMap[String(nickname || '').toLowerCase()];
    return ref ? { skinName: ref.skinName, skinUuid: ref.skinUuid } : { skinName: null, skinUuid: null };
  };
  async function refreshSkins() {
    if (!events.skinRefs) return;
    try {
      skinMap = await events.skinRefs();
      indexMemo.until = 0;
    } catch (err) {
      log.error('Panel: skinlar o\'qilmadi:', err.message);
    }
  }

  // Ball saytdagi bilan bir xil bo'lishi uchun sayt o'qiydigan tierlardan hisoblanadi.
  // Baza javob bermasa, Discorddagi tierlardan hisoblanadi.
  let sitePoints = null;
  async function refreshSitePoints() {
    if (!events.allSiteTiers) return;
    try {
      const best = new Map();
      for (const row of await events.allSiteTiers()) {
        const name = String(row.name).toLowerCase();
        const lower = String(row.mode).toLowerCase();
        const mode = lower === 'crystal' ? 'vanilla' : lower;
        if (!kitBySlug.has(mode) || KITS_NOT_ON_SITE.has(mode)) continue;
        const modes = best.get(name) || {};
        modes[mode] = Math.max(modes[mode] || 0, TIER_VALUES[row.tier] || 0);
        best.set(name, modes);
      }
      sitePoints = new Map([...best].map(([name, modes]) => [name, Object.values(modes).reduce((a, b) => a + b, 0)]));
      indexMemo.until = 0;
    } catch (err) {
      log.error('Panel: sayt tierlari o\'qilmadi:', err.message);
    }
  }
  function pointsFor(nickname, discordPoints) {
    if (!sitePoints) return discordPoints;
    return sitePoints.get(String(nickname || '').toLowerCase()) || 0;
  }

  // Har bir qidiruvda hamma o'yinchini qayta hisoblamaslik uchun 10 soniyalik eslab qolish.
  let indexMemo = { until: 0, list: [], maxTierSum: 1 };
  if (events.allSiteTiers) {
    refreshSitePoints();
    setInterval(refreshSitePoints, 60000).unref();
  }
  if (events.skinRefs) {
    refreshSkins();
    setInterval(refreshSkins, SKIN_REFRESH_MS).unref();
  }
  function playerIndex() {
    if (indexMemo.until > Date.now()) return indexMemo.list;
    const s = getState();
    const ids = new Set(Object.keys(s.userProfiles || {}));
    for (const k of kits) {
      for (const id of Object.keys(s.userTiers?.[k.guildId] || {})) ids.add(id);
      for (const id of Object.keys(s.verifiedUsers?.[k.guildId] || {})) ids.add(id);
    }
    const list = [];
    let maxTierSum = 1;
    for (const id of ids) {
      const nickname = nicknameOf(id, s);
      if (!nickname) continue;
      const tiers = {};
      const roles = new Set();
      const roleKits = {};
      const presentIn = new Set();
      let points = 0;
      let tierSum = 0;
      let retired = false;
      let muted = false;
      let lastTest = 0;
      let onCooldown = false;
      for (const k of kits) {
        const tier = s.userTiers?.[k.guildId]?.[id];
        if (tier) {
          tiers[k.kit] = tier;
          presentIn.add(k.kit);
          tierSum += TIER_VALUES[tier] || 0;
          if (!KITS_NOT_ON_SITE.has(k.kit)) points += TIER_VALUES[tier] || 0;
        }
        if (s.verifiedUsers?.[k.guildId]?.[id]) presentIn.add(k.kit);
        const member = memberOf(k, id);
        if (member) {
          presentIn.add(k.kit);
          for (const r of member.roles.cache.values()) {
            if (r.name === '@everyone') continue;
            roles.add(r.name);
            (roleKits[r.name] = roleKits[r.name] || []).push(k.kit);
          }
          if (member.roles.cache.some(r => r.name === 'Retired')) retired = true;
          if (muteUntil(member)) muted = true;
        }
        lastTest = Math.max(lastTest, Number(s.lastTestTime?.[k.guildId]?.[id]) || 0);
        if (getCooldownRemaining(k.guildId, id, 'test') > 0) onCooldown = true;
      }
      maxTierSum = Math.max(maxTierSum, tierSum);
      list.push({ id, nickname, tiers, points: pointsFor(nickname, points), tierSum, restricted: Boolean(activeRestriction(id, s)), retired, muted, onCooldown, lastTest, roleKits, presentIn, ...skinOf(nickname) });
    }
    list.sort((a, b) => b.points - a.points || a.nickname.localeCompare(b.nickname));
    list.forEach((p, i) => { p.place = i + 1; });
    indexMemo = { until: Date.now() + 10000, list, maxTierSum };
    return list;
  }
  const playerInScope = (p, access) => access.global || access.scope.some(kit => p.presentIn.has(kit));
  // Faqat ko'rish mumkin bo'lgan kitlardagi darajalar yuboriladi.
  function playerCard(p, access) {
    const { roleKits, presentIn, ...rest } = p;
    const tiers = access.global ? p.tiers : Object.fromEntries(Object.entries(p.tiers).filter(([kit]) => access.scopeSet.has(kit)));
    return { ...rest, tiers, avatar: avatarOf(p.id) };
  }

  let staffMemo = { until: 0, map: new Map() };
  function allStaff() {
    if (staffMemo.until > Date.now()) return staffMemo.map;
    const staff = new Map();
    for (const k of kits) {
      const guild = client.guilds.cache.get(k.guildId);
      if (!guild) continue;
      for (const member of guild.members.cache.values()) {
        const best = bestRankOf(member);
        if (best < 0) continue;
        let entry = staff.get(member.id);
        if (!entry) {
          entry = { id: member.id, name: label(member.id), avatar: avatarOf(member.id), rank: -1, role: null, roleColor: null, kits: [], online: false };
          staff.set(member.id, entry);
        }
        if (best > entry.rank) { entry.rank = best; entry.role = ROLE_ORDER[best]; entry.roleColor = roleColor(entry.role); }
        entry.kits.push(k.kit);
        const status = member.presence?.status;
        if (status && status !== 'offline' && status !== 'invisible') entry.online = true;
      }
    }
    staffMemo = { until: Date.now() + 5000, map: staff };
    return staff;
  }

  // ---------- o'qish API ----------
  function permissionsFor(access) {
    const out = {};
    for (const [name, rule] of Object.entries(ACTION_RULES)) {
      out[name] = access.kits.filter(k => k.rank >= rankOfRole(rule.min)).map(k => k.kit);
    }
    return out;
  }
  async function apiMe({ userId, access }) {
    const profile = await safe(events.profileGet?.(userId), null);
    return {
      id: userId,
      name: label(userId),
      avatar: avatarOf(userId),
      role: access.role,
      roleColor: roleColor(access.role),
      rank: access.rank,
      isOwner: access.isOwner,
      global: access.global,
      kits: scopeKits(access).map(k => ({ kit: k.kit, name: k.name })),
      permissions: permissionsFor(access),
      options: {
        tiers: TIER_ORDER,
        tierValues: TIER_VALUES,
        cooldownCategories: COOLDOWN_CATEGORIES,
        restrictMonths: RESTRICT_MONTHS,
        muteMinutes: MUTE_MINUTES,
        logGroups: Object.keys(LOG_GROUPS)
      },
      lastSeen: profile?.lastSeen || null,
      chatMaxLength: CHAT_MAX_LENGTH,
      noteMaxLength: NOTE_MAX_LENGTH
    };
  }

  function apiRoles({ access }) {
    const counts = new Map();
    for (const k of scopeKits(access)) {
      const guild = client.guilds.cache.get(k.guildId);
      if (!guild) continue;
      for (const member of guild.members.cache.values()) {
        for (const role of member.roles.cache.values()) {
          if (role.name === '@everyone') continue;
          counts.set(role.name, (counts.get(role.name) || 0) + 1);
        }
      }
    }
    return { roles: [...counts.entries()].map(([name, members]) => ({ name, members })).sort((a, b) => a.name.localeCompare(b.name)) };
  }

  async function buildNotifications(access, userId) {
    const since = Date.now() - NOTIFICATION_DAYS * DAY_MS;
    const items = [];
    const rows = await safe(events.listEvents({ types: ['restrict', 'unrestrict', 'staff_add', 'staff_remove', 'application'], from: since, limit: 30, ...eventScope(access) }), []);
    for (const e of withPeople(rows)) {
      if (e.actorId === userId) continue;
      items.push({ id: `e${e.id}`, kind: e.type, at: e.createdAt, kit: e.kit, actor: e.actor, target: e.target, oldValue: e.oldValue, newValue: e.newValue, note: e.note, href: e.targetId ? `#/players/${e.targetId}` : '#/logs' });
    }
    for (const meta of tickets.recentOpened(access.scope, since, 20)) {
      items.push({ id: `t${meta.id}`, kind: meta.kind === 'high' ? 'ticket_high' : 'ticket', at: meta.openedAt, kit: meta.kit, nickname: meta.nickname, targetTier: meta.targetTier, live: !meta.closedAt, href: `#/tickets/${meta.id}` });
    }
    const conversations = events.dmConversations ? await safe(events.dmConversations(userId), []) : [];
    for (const c of conversations) {
      if (!c.unread || !c.last) continue;
      items.push({ id: `d${c.otherId}`, kind: 'dm', at: c.last.createdAt, actor: personOf(c.otherId), count: c.unread, preview: String(c.last.body).slice(0, 100), href: `#/chat/dm/${c.otherId}` });
    }
    items.sort((a, b) => b.at - a.at);
    const profile = await safe(events.profileGet?.(userId), null);
    const readAt = profile?.notifReadAt || 0;
    return { items: items.slice(0, 40), unread: items.filter(i => i.at > readAt).length, readAt };
  }

  async function apiPing({ userId, access }) {
    const seen = [];
    for (const [id, at] of lastSeen) {
      if (Date.now() - at > ONLINE_MS) { lastSeen.delete(id); continue; }
      seen.push({ ...personOf(id), you: id === userId });
    }
    seen.sort((a, b) => a.name.localeCompare(b.name));
    const notifications = await buildNotifications(access, userId);
    const state = getState();
    return {
      latestChatId: await safe(events.chatLatestId(), 0),
      dmUnread: events.dmUnreadCount ? await safe(events.dmUnreadCount(userId), 0) : 0,
      notifUnread: notifications.unread,
      liveTickets: tickets.liveList(access.scope, 999).length,
      // Yon paneldagi kit nuqtasi: navbat ochiq yoki yopiq.
      queues: Object.fromEntries(scopeKits(access).map(k => [k.kit, state.testersOnline?.[k.guildId] === true])),
      online: seen
    };
  }

  function weekLeader(rows) {
    const week = events.currentWeekNumber ? events.currentWeekNumber() : null;
    if (week === null) return null;
    const current = rows.filter(r => r.week === week).sort((a, b) => b.count - a.count)[0];
    return current ? { ...personOf(current.actorId), count: current.count } : null;
  }

  async function apiOverview({ userId, access }) {
    const s = getState();
    const scoped = scopeKits(access);
    const scope = eventScope(access);
    const players = playerIndex().filter(p => playerInScope(p, access));
    const kitCards = scoped.map(k => {
      const counts = kitCounts(k.guildId, s);
      const queue = queueView(k, s);
      return { kit: k.kit, name: k.name, open: queue.open, queue: queue.players.length, testers: queue.testers.length, active: queue.active.length, tiered: Object.keys(s.userTiers?.[k.guildId] || {}).length, month: counts.month, total: counts.total };
    });
    const sum = key => kitCards.reduce((n, c) => n + c[key], 0);
    const restricted = players.filter(p => p.restricted).length;
    const weekly = events.weeklyTesterCounts ? await safe(events.weeklyTesterCounts(access.global ? {} : { kitsIn: access.scope }), []) : [];
    const series = await safe(events.testsPerDay({ days: 180, ...(access.global ? {} : { kitsIn: access.scope }) }), []);
    return {
      totals: { players: players.length, tiered: players.filter(p => Object.keys(p.tiers).some(kit => access.scopeSet.has(kit))).length, month: sum('month'), total: sum('total'), queue: sum('queue'), testers: sum('testers'), active: sum('active'), restricted },
      kits: kitCards,
      perDay: series.slice(-30),
      series,
      recent: withPeople(await safe(events.listEvents({ limit: 12, types: [...LOG_GROUPS.tests, ...LOG_GROUPS.tiers, ...LOG_GROUPS.punish], ...scope }), [])),
      live: tickets.liveList(access.scope, 6).map(ticketCard),
      weekTop: weekLeader(weekly),
      historySince: await safe(events.historySince(), null)
    };
  }

  async function apiTestsPerDay({ url, userId, access }) {
    const days = STATS_DAYS.includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 30;
    const kitParam = url.searchParams.get('kit');
    const kit = kitBySlug.has(kitParam) && inScope(access, kitParam) ? kitParam : undefined;
    const actor = url.searchParams.get('actor');
    const actorId = ID_RE.test(actor || '') ? actor : undefined;
    return { days, perDay: await safe(events.testsPerDay({ days, kit, actorId, ...(access.global || kit ? {} : { kitsIn: access.scope }) }), []) };
  }

  function apiPlayers({ url, access }) {
    const get = name => url.searchParams.get(name);
    const q = String(get('q') || '').trim().toLowerCase().slice(0, 40);
    const kit = kitBySlug.has(get('kit')) && inScope(access, get('kit')) ? get('kit') : null;
    const tier = TIER_VALUES[get('tier')] ? get('tier') : null;
    const atLeast = get('tierMode') === 'min';
    const status = get('status');
    const role = String(get('role') || '').slice(0, 100);
    const sort = get('sort');
    const limit = Math.min(Math.max(Number(get('limit')) || 50, 1), 100);
    const inScopeTiers = p => Object.entries(p.tiers).filter(([k]) => access.scopeSet.has(k));

    let list = playerIndex().filter(p => playerInScope(p, access));
    if (q) list = list.filter(p => p.id === q || p.nickname.toLowerCase().includes(q));
    // Kit tanlansa, shu kitda darajasi borlar ko'rsatiladi (rol filtri bo'lsa, shu rol egalari).
    if (kit && !role) list = list.filter(p => p.tiers[kit]);
    if (tier) {
      const value = TIER_VALUES[tier];
      const matches = t => (atLeast ? (TIER_VALUES[t] || 0) >= value : t === tier);
      list = list.filter(p => (kit ? matches(p.tiers[kit]) : inScopeTiers(p).some(([, t]) => matches(t))));
    }
    if (role) list = list.filter(p => (kit ? p.roleKits[role]?.includes(kit) : p.roleKits[role]?.some(k => access.scopeSet.has(k))));
    if (status === 'restricted') list = list.filter(p => p.restricted);
    else if (status === 'retired') list = list.filter(p => p.retired);
    else if (status === 'muted') list = list.filter(p => p.muted);
    else if (status === 'cooldown') list = list.filter(p => p.onCooldown);
    else if (status === 'tiered') list = list.filter(p => inScopeTiers(p).length > 0);
    else if (status === 'untiered') list = list.filter(p => inScopeTiers(p).length === 0);
    if (sort === 'nick') list = [...list].sort((a, b) => a.nickname.localeCompare(b.nickname));
    else if (sort === 'recent') list = [...list].sort((a, b) => b.lastTest - a.lastTest);
    else if (kit && !sort) list = [...list].sort((a, b) => (TIER_VALUES[b.tiers[kit]] || 0) - (TIER_VALUES[a.tiers[kit]] || 0) || b.points - a.points);

    const s = getState();
    const pages = Math.max(Math.ceil(list.length / limit), 1);
    const page = Math.min(Math.max(Math.floor(Number(get('page'))) || 1, 1), pages);
    const start = (page - 1) * limit;
    return {
      total: list.length,
      page,
      pages,
      start,
      maxTierSum: indexMemo.maxTierSum,
      kitTotals: Object.fromEntries(scopeKits(access).map(k => [k.kit, Object.keys(s.userTiers?.[k.guildId] || {}).length])),
      items: list.slice(start, start + limit).map(p => playerCard(p, access))
    };
  }

  // Qidiruv oynasi: harflar boshida mos kelganlar birinchi.
  function apiSearch({ url, access }) {
    const q = String(url.searchParams.get('q') || '').trim().toLowerCase().slice(0, 40);
    if (!q) return { q, players: [], playersTotal: 0, staff: [] };
    const score = name => (name === q ? 0 : name.startsWith(q) ? 1 : 2);
    const found = playerIndex()
      .filter(p => playerInScope(p, access) && (p.id === q || p.nickname.toLowerCase().includes(q)))
      .sort((a, b) => score(a.nickname.toLowerCase()) - score(b.nickname.toLowerCase()) || b.points - a.points || a.nickname.length - b.nickname.length);
    const staff = [...allStaff().values()]
      .filter(m => (access.global || m.kits.some(k => access.scopeSet.has(k))) && (m.id === q || m.name.toLowerCase().includes(q)))
      .sort((a, b) => score(a.name.toLowerCase()) - score(b.name.toLowerCase()) || b.rank - a.rank)
      .slice(0, 4)
      .map(m => ({ id: m.id, name: m.name, avatar: m.avatar, role: m.role, roleColor: m.roleColor, online: m.online }));
    return {
      q,
      playersTotal: found.length,
      players: found.slice(0, 8).map(p => ({ id: p.id, nickname: p.nickname, place: p.place, points: p.points, avatar: avatarOf(p.id), skinName: p.skinName, skinUuid: p.skinUuid, restricted: p.restricted })),
      staff
    };
  }

  // Mute sababi: avval panel/bot yozuvidan, topilmasa Discord audit logidan olinadi.
  async function muteFromAudit(guild, userId) {
    const key = `${guild.id}:${userId}`;
    const memo = auditMemo.get(key);
    if (memo && memo.until > Date.now()) return memo.value;
    let value = null;
    try {
      const logs = await guild.fetchAuditLogs({ type: AUDIT_LOG_MEMBER_UPDATE, limit: 50 });
      const entry = [...logs.entries.values()].find(e => e.targetId === userId && e.changes?.some(c => c.key === 'communication_disabled_until' && c.new));
      if (entry) value = { reason: entry.reason || null, actorId: entry.executorId || null, at: entry.createdTimestamp || null };
    } catch { /* audit logni o'qish imkoni yo'q */ }
    auditMemo.set(key, { value, until: Date.now() + 60000 });
    return value;
  }
  async function muteInfoFor(id, kit, until, muteEvents) {
    const last = muteEvents.find(e => e.kit === kit.kit);
    const fromEvent = last && last.type === 'mute' ? { reason: last.note || null, actorId: last.actorId, at: last.createdAt } : null;
    const source = fromEvent || (client.guilds.cache.get(kit.guildId) ? await muteFromAudit(client.guilds.cache.get(kit.guildId), id) : null);
    return { until, reason: source?.reason || null, at: source?.at || null, by: personOf(source?.actorId) };
  }

  async function apiPlayer({ match, userId, access }) {
    const id = match[1];
    const s = getState();
    const nickname = nicknameOf(id, s);
    const profile = s.userProfiles?.[id];
    const known = nickname || kits.some(k => s.userTiers?.[k.guildId]?.[id]);
    if (!known) return null;
    const indexed = playerIndex().find(p => p.id === id);
    if (indexed && !playerInScope(indexed, access)) return null;
    if (!indexed && !access.global && !scopeKits(access).some(k => s.userTiers?.[k.guildId]?.[id] || memberOf(k, id))) return null;

    const scope = eventScope(access);
    // Baza javob bermasa null: panel "saytda yo'q" deb noto'g'ri ogohlantirmasligi uchun.
    const site = await safe(events.siteTiers(nickname), null);
    const siteLower = Object.fromEntries(Object.entries(site || {}).map(([m, t]) => [m.toLowerCase() === 'crystal' ? 'vanilla' : m.toLowerCase(), t]));
    const restriction = activeRestriction(id, s);
    const target = staffInfo(id);
    const isProtected = id !== userId && Boolean(target) && target.rank >= access.rank;
    const recentTierChanges = await safe(events.listEvents({ targetId: id, types: ['tier_set', 'tier_demote'], from: Date.now() - TIER_LIMIT_MS, limit: 50 }), []);
    const muteEvents = await safe(events.listEvents({ targetId: id, types: ['mute', 'unmute'], limit: 40 }), []);
    let points = 0;
    const kitRows = [];
    for (const k of scopeKits(access)) {
      const tier = s.userTiers?.[k.guildId]?.[id] || null;
      if (tier && !KITS_NOT_ON_SITE.has(k.kit)) points += TIER_VALUES[tier] || 0;
      const member = memberOf(k, id);
      const until = muteUntil(member);
      const myRankHere = access.kits.find(x => x.kit === k.kit)?.rank ?? -1;
      kitRows.push({
        kit: k.kit,
        name: k.name,
        tier,
        siteTier: siteLower[k.kit] || null,
        onSite: !KITS_NOT_ON_SITE.has(k.kit),
        lastTest: s.lastTestTime?.[k.guildId]?.[id] || null,
        cooldownMs: getCooldownRemaining(k.guildId, id, 'test'),
        highCooldownMs: getCooldownRemaining(k.guildId, id, 'high_test'),
        inGuild: Boolean(member),
        retired: Boolean(member?.roles.cache.some(r => r.name === 'Retired')),
        muteUntil: until,
        mute: until ? await muteInfoFor(id, k, until, muteEvents) : null,
        // Manager'dan past xodim darajani faqat bir qadamga, kuniga bir marta o'zgartira oladi.
        tierControl: myRankHere >= MANAGER_RANK
          ? { limited: false }
          : { limited: true, self: id === userId, ...neighbourTiers(tier), lockedUntil: tierLockUntil(recentTierChanges.filter(e => e.kit === k.kit), rankOf) },
        roles: rolesOf(member),
        roleControl: roleControlFor(k, member, id, userId, access)
      });
    }
    const notes = events.noteList ? await safe(events.noteList(id, access.global ? null : access.scope), []) : [];
    return {
      id,
      nickname,
      username: client.users.cache.get(id)?.username || null,
      avatar: avatarOf(id, 128),
      ...skinOf(nickname),
      place: indexed?.place || null,
      verifiedAt: profile?.verifiedAt || null,
      siteChecked: site !== null,
      points: pointsFor(nickname, points),
      staffRole: target?.role || null,
      staffRoleColor: target ? roleColor(target.role) : null,
      staffRank: target?.rank ?? -1,
      protected: isProtected,
      restriction: restriction ? {
        reason: restriction.reason || null,
        setAt: restriction.setAt || null,
        endsAt: restriction.endsAt,
        setter: personOf(restriction.setterId),
        savedTiers: Object.entries(restriction.savedTiers || {}).map(([guildId, tier]) => ({ kit: kitByGuild[guildId] || null, tier })).filter(x => x.kit && access.scopeSet.has(x.kit))
      } : null,
      kits: kitRows,
      notes: notes.map(n => ({ ...n, author: personOf(n.authorId), canDelete: n.authorId === userId || rankOf(n.authorId) < access.rank })),
      events: withPeople(await safe(events.listEvents({ targetId: id, limit: 200, ...scope }), []))
    };
  }

  // Cheklanganlar sahifasi.
  async function apiRestrictions({ url, userId, access }) {
    const s = getState();
    const q = String(url.searchParams.get('q') || '').trim().toLowerCase().slice(0, 60);
    const status = url.searchParams.get('status') === 'ended' ? 'ended' : 'active';
    const limit = 40;
    const pageParam = Math.max(Math.floor(Number(url.searchParams.get('page'))) || 1, 1);
    const byId = new Map(playerIndex().map(p => [p.id, p]));
    const relevant = id => {
      if (access.global) return true;
      const p = byId.get(id);
      return p ? playerInScope(p, access) : scopeKits(access).some(k => memberOf(k, id));
    };
    const card = (id, { nickname: given, ...data }) => {
      const nickname = given || nicknameOf(id, s) || label(id);
      return { id, nickname, avatar: avatarOf(id, 128), ...skinOf(nickname), points: byId.get(id)?.points || 0, place: byId.get(id)?.place || null, ...data };
    };
    if (status === 'active') {
      let rows = Object.entries(s.restrictedUsers?.__global || {})
        .filter(([id, r]) => Number(r.endsAt) > Date.now() && relevant(id))
        .map(([id, r]) => card(id, {
          reason: r.reason || null,
          setAt: r.setAt || null,
          endsAt: Number(r.endsAt),
          active: true,
          setter: personOf(r.setterId),
          savedTiers: Object.entries(r.savedTiers || {}).map(([guildId, tier]) => ({ kit: kitByGuild[guildId] || null, tier })).filter(x => x.kit && access.scopeSet.has(x.kit))
        }));
      if (q) rows = rows.filter(r => String(r.nickname).toLowerCase().includes(q) || String(r.reason || '').toLowerCase().includes(q) || r.id === q);
      rows.sort((a, b) => (b.setAt || 0) - (a.setAt || 0));
      const pages = Math.max(Math.ceil(rows.length / limit), 1);
      const page = Math.min(pageParam, pages);
      return { status, total: rows.length, page, pages, items: rows.slice((page - 1) * limit, page * limit) };
    }
    const result = await safe(events.searchEvents({ types: ['restrict'], q: q || undefined, page: pageParam, limit, ...eventScope(access) }), { total: 0, page: 1, pages: 1, items: [] });
    return {
      status,
      total: result.total,
      page: result.page,
      pages: result.pages,
      items: result.items.map(e => card(e.targetId, {
        nickname: e.nickname,
        reason: e.note || null,
        setAt: e.createdAt,
        endsAt: null,
        months: e.newValue || null,
        active: Boolean(activeRestriction(e.targetId, s)),
        setter: personOf(e.actorId),
        savedTiers: []
      }))
    };
  }

  function statsFromCounts(counts = {}) {
    const n = (...types) => types.reduce((sum, t) => sum + (counts[t] || 0), 0);
    return {
      tests: n('test', 'high_win'),
      regular: n('test'),
      high: n('high_win', 'high_loss'),
      tiers: n('tier_set', 'tier_demote', 'tier_delete'),
      restricts: n('restrict'),
      mutes: n('mute'),
      cooldowns: n('cooldown_set', 'cooldown_reset'),
      actions: Object.entries(counts).filter(([type]) => type !== 'panel_login').reduce((sum, [, c]) => sum + c, 0)
    };
  }
  function periodRange(period, url) {
    if (period === 'week') return { from: Date.now() - 7 * DAY_MS };
    if (period === '30d') return { from: Date.now() - 30 * DAY_MS };
    if (period === 'month') { const now = new Date(); return { from: Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) }; }
    if (period === 'custom') {
      const from = parseDay(url.searchParams.get('from'));
      const to = parseDay(url.searchParams.get('to'));
      return { from: from || undefined, to: to ? to + DAY_MS : undefined };
    }
    return {};
  }
  async function apiStaff({ url, userId, access }) {
    const s = getState();
    const allowed = new Set(['week', '30d', 'month', 'all', 'custom']);
    const period = allowed.has(url.searchParams.get('period')) ? url.searchParams.get('period') : 'month';
    const kitParam = url.searchParams.get('kit');
    const kit = kitBySlug.has(kitParam) && inScope(access, kitParam) ? kitParam : null;
    const selected = kit ? [kitBySlug.get(kit)] : scopeKits(access);
    const kitsLimit = access.global || kit ? {} : { kitsIn: access.scope };

    const totals = {};
    const monthly = {};
    for (const k of selected) {
      for (const [id, stat] of Object.entries(s.testCounts?.[k.guildId] || {})) {
        totals[id] = (totals[id] || 0) + (stat.total || 0);
        monthly[id] = (monthly[id] || 0) + monthlyOf(stat);
      }
    }
    const range = periodRange(period, url);
    let periodCounts;
    if (period === 'all') periodCounts = totals;
    else if (period === 'month') periodCounts = monthly;
    else periodCounts = await safe(events.testCountsByActor({ ...range, kit, ...kitsLimit }), {});
    const actionsByActor = events.actionCounts
      ? await safe(events.actionCounts({ ...range, kit: kit || undefined, ...(access.global || kit ? {} : { kitsIn: access.scope, guildsIn: access.scope.map(slug => kitBySlug.get(slug).guildId) }) }), {})
      : {};

    const since = await safe(events.staffSince(), {});
    const staffMap = allStaff();
    const row = (id, base) => ({
      ...base,
      total: totals[id] || 0,
      monthly: monthly[id] || 0,
      count: periodCounts[id] || 0,
      stats: statsFromCounts(actionsByActor[id]),
      since: since[id] || null
    });
    const staff = [...staffMap.values()]
      .filter(m => (kit ? m.kits.includes(kit) : m.kits.some(k => access.scopeSet.has(k))))
      .map(m => row(m.id, { ...m, kits: m.kits.filter(k => access.scopeSet.has(k)) }))
      .sort((a, b) => b.rank - a.rank || (b.count || 0) - (a.count || 0) || a.name.localeCompare(b.name));

    const removedIds = new Set([...Object.keys(periodCounts)].filter(id => periodCounts[id] > 0 && !staffMap.has(id)));
    const removed = [...removedIds].map(id => row(id, { id, name: label(id), avatar: avatarOf(id) })).sort((a, b) => b.count - a.count);
    const top = [...staff, ...removed].filter(p => p.count > 0).sort((a, b) => b.count - a.count).slice(0, 10);
    const weekly = events.weeklyTesterCounts ? await safe(events.weeklyTesterCounts(access.global ? {} : { kitsIn: access.scope }), []) : [];

    return { period, kit, roles: ROLE_ORDER.slice().reverse(), staff, removed, top, weekTop: weekLeader(weekly), historySince: await safe(events.historySince(), null) };
  }

  function achievementsFor(metrics) {
    return ACHIEVEMENTS.map(a => ({ id: a.id, trophy: a.trophy, title: a.title, text: a.text, metric: a.metric, need: a.need, value: metrics[a.metric] || 0, earned: (metrics[a.metric] || 0) >= a.need }));
  }
  const publicProfile = p => ({ bio: p?.bio || '', status: p?.status || '', workDays: p?.workDays || [], workFrom: p?.workFrom || '', workTo: p?.workTo || '', lastSeen: p?.lastSeen || null });

  async function apiStaffProfile({ match, userId, access }) {
    const id = match[1];
    const s = getState();
    const staff = allStaff().get(id);
    const isSelf = id === userId;
    const targetRank = staff?.rank ?? -1;
    const sharesKit = access.global || !staff || staff.kits.some(k => access.scopeSet.has(k));
    if (!sharesKit && !isSelf && targetRank < access.rank) return null;

    const perKit = scopeKits(access).map(k => {
      const stat = s.testCounts?.[k.guildId]?.[id];
      const member = memberOf(k, id);
      const best = bestRankOf(member);
      return { kit: k.kit, name: k.name, role: best < 0 ? null : ROLE_ORDER[best], total: stat?.total || 0, monthly: monthlyOf(stat), roles: rolesOf(member), roleControl: roleControlFor(k, member, id, userId, access) };
    });
    const total = perKit.reduce((n, k) => n + k.total, 0);
    if (!staff && total === 0 && !isSelf) return null;
    const since = await safe(events.staffSince(), {});
    const profile = events.profileGet ? await safe(events.profileGet(id), null) : null;
    const base = {
      id,
      name: label(id),
      nickname: nicknameOf(id, s),
      avatar: avatarOf(id, 256),
      role: staff?.role || null,
      roleColor: staff?.roleColor || null,
      online: staff?.online || false,
      inPanel: lastSeen.has(id) && Date.now() - lastSeen.get(id) < ONLINE_MS,
      since: since[id] || null,
      profile: publicProfile(profile),
      canEdit: isSelf,
      canDm: !isSelf && Boolean(computeAccess(id)),
      kits: perKit
    };

    const scope = { hideTypes: LOG_GROUPS.logins, ...(access.global ? {} : { kitsIn: access.scope, guildsIn: access.scope.map(slug => kitBySlug.get(slug).guildId) }) };
    const counts = events.actionCounts ? await safe(events.actionCounts({ actorId: id, ...scope }), {}) : {};
    const stats = statsFromCounts(counts[id]);
    const weekly = events.weeklyTesterCounts ? await safe(events.weeklyTesterCounts({}), []) : [];
    const winners = new Map();
    for (const r of weekly) if (!winners.has(r.week) || winners.get(r.week).count < r.count) winners.set(r.week, r);
    const currentWeek = events.currentWeekNumber ? events.currentWeekNumber() : null;
    const weeksWon = [...winners.entries()].filter(([week, r]) => r.actorId === id && week !== currentWeek).length;
    const metrics = { tests: total, high: stats.high, weeks: weeksWon, days: since[id] ? Math.floor((Date.now() - since[id]) / DAY_MS) : 0 };
    return {
      ...base,
      total,
      monthly: perKit.reduce((n, k) => n + k.monthly, 0),
      stats,
      achievements: achievementsFor(metrics),
      perDay: await safe(events.testsPerDay({ days: 30, actorId: id, ...(access.global ? {} : { kitsIn: access.scope }) }), []),
      heat: events.activityDays ? await safe(events.activityDays(id, 84, scope), []) : [],
      hours: events.activityHours ? await safe(events.activityHours(id, scope), []) : [],
      tiersGiven: await safe(events.tiersGiven(id, access.global ? {} : { kitsIn: access.scope }), []),
      recent: withPeople(await safe(events.listEvents({ actorId: id, limit: 50, ...eventScope(access) }), [])),
      historySince: await safe(events.historySince(), null)
    };
  }

  async function apiProfileSave({ body, userId }) {
    const bio = String(body.bio ?? '').trim();
    const status = String(body.status ?? '').trim();
    if (bio.length > BIO_MAX_LENGTH) throw new BadRequest(`Bio ${BIO_MAX_LENGTH} belgidan oshmasligi kerak.`);
    if (status.length > STATUS_MAX_LENGTH) throw new BadRequest(`Holat ${STATUS_MAX_LENGTH} belgidan oshmasligi kerak.`);
    const workDays = Array.isArray(body.workDays) ? [...new Set(body.workDays.map(Number))].filter(d => Number.isInteger(d) && d >= 0 && d <= 6).sort() : [];
    const workFrom = String(body.workFrom || '');
    const workTo = String(body.workTo || '');
    if ((workFrom && !TIME_RE.test(workFrom)) || (workTo && !TIME_RE.test(workTo))) throw new BadRequest('Ish vaqti noto\'g\'ri yozilgan.');
    const saved = await events.profileSave(userId, { bio, status, workDays, workFrom, workTo });
    return { status: 200, data: { ok: true, profile: publicProfile(saved) } };
  }

  async function apiKit({ match, userId, access }) {
    const slug = match[1];
    const k = kitBySlug.get(slug);
    if (!k || !inScope(access, slug)) return null;
    const s = getState();
    const guild = client.guilds.cache.get(k.guildId);
    const tiers = s.userTiers?.[k.guildId] || {};
    const distribution = TIER_ORDER.map(tier => ({ tier, count: 0 }));
    for (const tier of Object.values(tiers)) {
      const row = distribution.find(d => d.tier === tier);
      if (row) row.count++;
    }
    const counts = kitCounts(k.guildId, s);
    const top = Object.entries(s.testCounts?.[k.guildId] || {})
      .map(([id, stat]) => ({ ...personOf(id), month: monthlyOf(stat), total: stat.total || 0 }))
      .filter(t => t.month > 0)
      .sort((a, b) => b.month - a.month)
      .slice(0, 10);
    // 180 kun: diagramma 90 kungacha davrni oldingi davr bilan solishtira oladi.
    const series = await safe(events.testsPerDay({ days: 180, kit: slug }), []);
    const perDay = series.slice(-30);
    const { kitsIn, guildsIn, ...scope } = eventScope(access);
    const feed = async (types, limit = 8) => withPeople(await safe(events.listEvents({ kit: slug, limit, types, ...scope }), []));
    const testers = Object.values(s.testCounts?.[k.guildId] || {}).filter(stat => monthlyOf(stat) > 0).length;
    return {
      kit: slug,
      name: k.name,
      guildName: guild?.name || null,
      members: guild?.memberCount ?? null,
      applicationOpen: s.applicationOpen?.[k.guildId] !== false,
      tiered: Object.keys(tiers).length,
      testers,
      tests: { total: counts.total, month: counts.month, today: perDay.at(-1)?.count || 0, week: perDay.slice(-7).reduce((n, d) => n + d.count, 0) },
      queue: queueView(k, s),
      queueLimit: settings ? settings.queueLimit(slug) : 20,
      distribution,
      top,
      perDay,
      series,
      live: tickets.liveList([slug], 6).map(ticketCard),
      recent: withPeople(await safe(events.listEvents({ kit: slug, limit: 15, types: [...LOG_GROUPS.tests, ...LOG_GROUPS.tiers], ...scope }), [])),
      feeds: {
        tests: await feed(LOG_GROUPS.tests),
        punish: await feed(LOG_GROUPS.punish),
        staff: await feed(LOG_GROUPS.staff)
      },
      canManage: access.rank >= MANAGER_RANK,
      historySince: await safe(events.historySince(), null)
    };
  }

  // Sana (YYYY-MM-DD) O'zbekiston vaqtida kun boshiga aylantiriladi.
  function parseDay(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
    const t = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(t) ? t - UZ_OFFSET_MS : null;
  }
  // Nik yoki Discord ID ni foydalanuvchi ID siga aylantiradi.
  function resolvePerson(value) {
    const text = String(value || '').trim();
    if (!text) return null;
    if (ID_RE.test(text)) return text;
    const lower = text.toLowerCase();
    return playerIndex().find(p => p.nickname.toLowerCase() === lower)?.id || 'none';
  }
  async function apiLogs({ url, userId, access }) {
    const get = name => url.searchParams.get(name);
    const groupName = Object.hasOwn(LOG_GROUPS, get('group') || '') ? get('group') : null;
    const logins = groupName === 'logins';
    const allTypes = Object.values(LOG_GROUPS).flat();
    const type = allTypes.includes(get('type')) ? get('type') : null;
    const source = ['bot', 'panel', 'discord'].includes(get('source')) ? get('source') : undefined;
    const from = parseDay(get('from'));
    const to = parseDay(get('to'));
    const kit = kitBySlug.has(get('kit')) && inScope(access, get('kit')) ? get('kit') : undefined;
    const actorId = resolvePerson(get('actor')) || undefined;
    const result = await events.searchEvents({
      // Kirishlar tarixi umumiy ro'yxatga aralashmaydi. Unda kit yo'q, shuning uchun rol bo'yicha ko'rsatiladi.
      ...(logins ? loginScope(access, userId) : eventScope(access)),
      hideTypes: logins ? undefined : LOG_GROUPS.logins,
      types: logins ? LOG_GROUPS.logins : (type ? [type] : (groupName ? LOG_GROUPS[groupName] : undefined)),
      kit: logins ? undefined : kit,
      actorId,
      targetId: resolvePerson(get('target')) || undefined,
      q: String(get('q') || '').trim().slice(0, 60) || undefined,
      source,
      from: from || undefined,
      to: to ? to + DAY_MS : undefined,
      page: get('page'),
      limit: 50
    });
    return { ...result, items: withPeople(result.items) };
  }

  // ---------- chiptalar ----------
  // Discord'ning <@id> kabi yozuvlari o'qiladigan ko'rinishga keltiriladi.
  function mentionName(id) {
    const name = label(id);
    return name === id ? 'foydalanuvchi' : name;
  }
  function previewText(text) {
    if (!text) return text;
    return String(text)
      .replace(/<@!?(\d+)>/g, (_, id) => `@${mentionName(id)}`)
      .replace(/<@&\d+>/g, '@rol')
      .replace(/<#\d+>/g, '#kanal')
      .replace(/<a?:(\w+):\d+>/g, ':$1:')
      .replace(/<t:\d+(?::[a-zA-Z])?>/g, '')
      .replace(/\*\*/g, '');
  }
  // Yangi xabar turida Discord mention ro'yxatini bermasligi mumkin: ismlar matndan to'ldiriladi.
  function mentionsFor(m) {
    const names = { ...m.mentions };
    const texts = [m.text, ...(m.parts || []), ...(m.embeds || []).flatMap(e => [e.title, e.text, ...(e.fields || []).flatMap(f => [f.name, f.value])])];
    for (const text of texts) {
      for (const match of String(text || '').matchAll(/<@!?(\d+)>/g)) if (!names[match[1]]) names[match[1]] = mentionName(match[1]);
    }
    return names;
  }
  function ticketCard(meta) {
    const nickname = meta.nickname || (meta.playerId ? label(meta.playerId) : null);
    return {
      id: meta.id,
      kit: meta.kit,
      kitName: KIT_NAMES[meta.kit] || meta.kit,
      kind: meta.kind,
      name: meta.name,
      playerId: meta.playerId,
      nickname,
      playerAvatar: meta.playerId ? avatarOf(meta.playerId) : null,
      ...skinOf(nickname),
      tester: personOf(meta.testerId),
      closedBy: personOf(meta.closedBy),
      staff: (meta.staffIds || []).slice(0, 5).map(personOf),
      currentTier: meta.currentTier,
      targetTier: meta.targetTier,
      server: meta.server,
      openedAt: meta.openedAt,
      closedAt: meta.closedAt,
      result: meta.result,
      lastAt: meta.lastAt,
      lastPreview: previewText(meta.lastPreview),
      lastAuthor: meta.lastAuthor,
      messages: meta.messages || 0,
      images: meta.images || 0,
      filesGone: Boolean(meta.filesGone),
      foundInText: Boolean(meta.foundInText),
      live: !meta.closedAt
    };
  }
  function apiTicketSummary({ access }) {
    const data = tickets.summary(access.scope);
    const named = rows => rows.map(r => ({ ...r, name: KIT_NAMES[r.kit] || r.kit }));
    return { regular: named(data.regular), high: named(data.high), since: tickets.firstOpenedAt() };
  }
  async function apiTicketList({ url, access }) {
    const get = name => url.searchParams.get(name);
    const kind = ['regular', 'high'].includes(get('kind')) ? get('kind') : null;
    const kit = kitBySlug.has(get('kit')) && inScope(access, get('kit')) ? get('kit') : null;
    const status = ['open', 'closed'].includes(get('status')) ? get('status') : null;
    const result = await tickets.list({ kits: access.scope, kind, kit, status, q: String(get('q') || '').slice(0, 60), page: get('page') });
    return { ...result, items: result.items.map(ticketCard) };
  }
  function apiTicket({ match, url, access }) {
    const meta = tickets.getMeta(match[1]);
    if (!meta || !inScope(access, meta.kit)) return null;
    const since = Math.max(Number(url.searchParams.get('since')) || 0, 0);
    const { messages } = tickets.get(meta.id, since);
    return {
      ticket: ticketCard(meta),
      seq: meta.seq || 0,
      messages: messages.map(m => {
        const info = m.authorId ? staffInfo(m.authorId) : null;
        return {
          ...m,
          mentions: mentionsFor(m),
          role: info?.role || null,
          roleColor: info ? roleColor(info.role) : null,
          isPlayer: m.authorId === meta.playerId,
          files: m.files.map(f => ({ id: f.id, name: f.name, type: f.type, size: f.size, width: f.width, height: f.height, url: f.file ? `/api/tickets/${meta.id}/files/${f.file}` : null }))
        };
      })
    };
  }
  // Chipta rasmlari faqat ruxsati bor xodimga beriladi.
  function sendTicketFile(res, match, access) {
    const meta = tickets.getMeta(match[1]);
    if (!meta || !inScope(access, meta.kit)) return sendJson(res, 404, { error: 'not_found' });
    const full = tickets.filePath(match[1], match[2]);
    if (!full) return sendJson(res, 404, { error: 'not_found' });
    res.writeHead(200, { 'Content-Type': FILE_TYPES[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'private, max-age=604800', 'Content-Disposition': 'inline' });
    return fs.createReadStream(full).on('error', () => res.end()).pipe(res);
  }

  // ---------- amallar ----------
  const needText = (value, name, max = REASON_MAX_LENGTH) => {
    const text = String(value ?? '').trim();
    if (!text) throw new BadRequest(`${name} kiritilishi kerak.`);
    if (text.length > max) throw new BadRequest(`${name} ${max} belgidan oshmasligi kerak.`);
    return text;
  };
  const optionalText = (value, name, max = REASON_MAX_LENGTH) => (String(value ?? '').trim() ? needText(value, name, max) : '');
  const needTier = value => {
    if (typeof value !== 'string' || !Object.hasOwn(TIER_VALUES, value)) throw new BadRequest('Daraja noto\'g\'ri tanlandi.');
    return value;
  };
  const needCategory = value => {
    if (!COOLDOWN_CATEGORIES.includes(value)) throw new BadRequest('Kategoriya noto\'g\'ri tanlandi.');
    return value;
  };

  // min: amal uchun kerakli eng past rol. notSelf: o'zingizga qo'llab bo'lmaydi.
  // Daraja o'zgartirishdagi "bir qadam, kuniga bir marta" qoidasi bot.js dagi action funksiyalarda tekshiriladi.
  const ACTION_RULES = {
    setTier: { min: 'Administrator', target: true, run: async (c, b) => { await actions.setTier(c.guild, c.actorId, b.targetId, needTier(b.tier), 'panel'); return `${label(b.targetId)} ga ${b.tier} berildi.`; } },
    demote: { min: 'Administrator', target: true, run: async (c, b) => { const old = await actions.demote(c.guild, c.actorId, b.targetId, needTier(b.tier), 'panel'); return `${label(b.targetId)}: ${old} dan ${b.tier} ga tushirildi.`; } },
    deleteTier: { min: 'Manager', target: true, run: async (c, b) => ((await actions.deleteTier(c.guild, c.actorId, b.targetId, 'panel')) ? `${label(b.targetId)} darajasi o'chirildi.` : `${label(b.targetId)} da daraja topilmadi.`) },
    retired: { min: 'Administrator', target: true, run: async (c, b) => { await actions.setRetired(c.guild, c.actorId, b.targetId, true, 'panel'); return `${label(b.targetId)} ga Retired berildi.`; } },
    unretired: { min: 'Administrator', target: true, run: async (c, b) => { await actions.setRetired(c.guild, c.actorId, b.targetId, false, 'panel'); return `${label(b.targetId)} dan Retired olindi.`; } },
    setCooldown: {
      min: 'Administrator',
      target: true,
      run: async (c, b) => {
        const days = Number(b.days);
        if (!Number.isInteger(days) || days < 1 || days > 365) throw new BadRequest('Kunlar soni 1 dan 365 gacha bo\'lishi kerak.');
        await actions.setCooldown(c.guild, c.actorId, b.targetId, needCategory(b.category), days, 'panel');
        return `${b.category} cooldown (${days} kun) berildi.`;
      }
    },
    resetCooldown: { min: 'Administrator', target: true, run: async (c, b) => ((await actions.resetCooldown(c.guild, c.actorId, b.targetId, needCategory(b.category), 'panel')) ? `${b.category} cooldown tiklandi.` : `${b.category} cooldown yo'q edi.`) },
    restrict: {
      min: 'Administrator',
      target: true,
      notSelf: true,
      run: async (c, b) => {
        const months = Number(b.months);
        if (!RESTRICT_MONTHS.includes(months)) throw new BadRequest('Muddat noto\'g\'ri tanlandi.');
        await actions.restrict(c.guild, c.actorId, b.targetId, months, needText(b.reason, 'Sabab'), 'panel');
        return `${label(b.targetId)} ${months} oyga cheklandi.`;
      }
    },
    unrestrict: { min: 'Administrator', target: true, run: async (c, b) => { await actions.unrestrict(c.guild, c.actorId, b.targetId, needText(b.reason, 'Sabab'), 'panel'); return `${label(b.targetId)} cheklovi olib tashlandi.`; } },
    changeNickname: { min: 'Administrator', target: true, run: async (c, b) => { const nick = needText(b.nickname, 'Nik', 16); const old = await actions.changeNickname(c.guild, c.actorId, b.targetId, nick, 'panel'); return old && old !== nick ? `Nik o'zgardi: ${old} → ${nick}` : `Yangi nik: ${nick}`; } },
    mute: {
      min: 'Administrator',
      target: true,
      notSelf: true,
      allKits: true,
      run: async (c, b) => {
        const minutes = Number(b.minutes);
        if (!MUTE_MINUTES.includes(minutes)) throw new BadRequest('Muddat noto\'g\'ri tanlandi.');
        await actions.mute(c.guild, c.actorId, b.targetId, minutes, needText(b.reason, 'Sabab'), 'panel');
        return `${label(b.targetId)} mute qilindi.`;
      }
    },
    unmute: { min: 'Administrator', target: true, allKits: true, run: async (c, b) => { await actions.unmute(c.guild, c.actorId, b.targetId, 'panel', optionalText(b.reason, 'Sabab')); return `${label(b.targetId)} dan mute olindi.`; } },
    kickTester: { min: 'Administrator', target: true, run: async (c, b) => { await actions.kickTester(c.guild, c.actorId, b.targetId, 'panel'); return `${label(b.targetId)} navbatdan chiqarildi.`; } },
    queueRemove: { min: 'Administrator', target: true, run: async (c, b) => { await actions.queueRemove(c.guild, c.actorId, b.targetId, 'panel'); return `${label(b.targetId)} navbatdan olib tashlandi.`; } },
    queueMove: {
      min: 'Administrator',
      target: true,
      run: async (c, b) => {
        const direction = Number(b.direction);
        if (direction !== 1 && direction !== -1) throw new BadRequest('Yo\'nalish noto\'g\'ri.');
        await actions.queueMove(c.guild, c.actorId, b.targetId, direction, 'panel');
        return 'Navbat yangilandi.';
      }
    },
    queueClose: { min: 'Administrator', run: async c => { await actions.queueClose(c.guild, c.actorId, 'panel'); return 'Navbat yopildi.'; } },
    staffRole: {
      min: 'Manager',
      target: true,
      notSelf: true,
      run: async (c, b) => {
        if (!ROLE_ORDER.includes(b.role)) throw new BadRequest('Rol noto\'g\'ri tanlandi.');
        if (typeof b.on !== 'boolean') throw new BadRequest('Amal noto\'g\'ri.');
        const changed = await actions.setStaffRole(c.guild, c.actorId, b.targetId, b.role, b.on, 'panel');
        // Panelga kirish huquqi eski rol bo'yicha qolib ketmasligi uchun.
        accessCache.delete(b.targetId);
        staffMemo.until = 0;
        if (!changed) return `${label(b.targetId)}: ${b.role} roli o'zgarmadi.`;
        return b.on ? `${label(b.targetId)} ga ${b.role} roli berildi.` : `${label(b.targetId)} dan ${b.role} roli olindi.`;
      }
    },
    setApplication: { min: 'Manager', run: async (c, b) => { await actions.setApplication(c.guild, c.actorId, b.open === true, 'panel'); return `Tester arizasi ${b.open === true ? 'ochildi' : 'yopildi'}.`; } }
  };

  async function apiAction({ match, body, userId, access }) {
    const name = match[1];
    const rule = Object.prototype.hasOwnProperty.call(ACTION_RULES, name) ? ACTION_RULES[name] : null;
    if (!rule) return { status: 404, data: { error: 'not_found' } };
    if (overLimit(`action:${userId}`, 40, 60000)) return { status: 429, data: { error: 'too_fast', message: 'Juda ko\'p amal bajarildi. Biroz kuting.' } };
    if (rule.target) {
      if (typeof body.targetId !== 'string' || !ID_RE.test(body.targetId)) throw new BadRequest('Foydalanuvchi noto\'g\'ri.');
      if (rule.notSelf && body.targetId === userId) throw new BadRequest('Bu amalni o\'zingizga qo\'llab bo\'lmaydi.');
      // O'zidan past bo'lmagan xodimga hech qanday amal qo'llab bo'lmaydi.
      if (body.targetId !== userId && rankOf(body.targetId) >= access.rank) throw new BadRequest('Rolingiz sizdan past bo\'lmagan xodimga bu amalni qo\'llab bo\'lmaydi.');
    }
    const allowedKits = access.kits.filter(k => k.rank >= rankOfRole(rule.min)).map(k => k.kit);

    // Mute bir vaqtda bir nechta serverga qo'llanishi mumkin.
    if (rule.allKits && body.kit === 'all') {
      if (!allowedKits.length) return { status: 403, data: { error: 'forbidden', message: 'Bu amal uchun rolingiz yetarli emas.' } };
      let done = 0;
      let lastError = null;
      for (const slug of allowedKits) {
        const guild = client.guilds.cache.get(kitBySlug.get(slug).guildId);
        if (!guild?.members.cache.get(body.targetId)) continue;
        // Mute olib tashlashda faqat haqiqatan mute qilingan serverlar hisoblanadi.
        if (name === 'unmute' && !muteUntil(guild.members.cache.get(body.targetId))) continue;
        try {
          await rule.run({ guild, actorId: userId }, body);
          done++;
        } catch (err) {
          if (err instanceof BadRequest) throw err;
          if (!(err instanceof ActionError)) throw err;
          lastError = err.message;
        }
      }
      if (!done) throw new BadRequest(lastError || 'Foydalanuvchi siz boshqaradigan serverlarda topilmadi.');
      indexMemo.until = 0;
      return { status: 200, data: { ok: true, message: `${done} ta serverda bajarildi.` } };
    }

    const kit = kitBySlug.get(body.kit);
    if (!kit) throw new BadRequest('Server tanlanmagan.');
    if (!allowedKits.includes(kit.kit)) return { status: 403, data: { error: 'forbidden', message: 'Bu amal uchun shu serverda rolingiz yetarli emas.' } };
    const guild = client.guilds.cache.get(kit.guildId);
    if (!guild) throw new BadRequest('Server topilmadi.');
    const message = await rule.run({ guild, actorId: userId }, body);
    indexMemo.until = 0;
    return { status: 200, data: { ok: true, message } };
  }

  // ---------- o'yinchi izohlari ----------
  async function apiNoteAdd({ match, body, userId, access }) {
    const targetId = match[1];
    const indexed = playerIndex().find(p => p.id === targetId);
    if (!indexed || !playerInScope(indexed, access)) return { status: 404, data: { error: 'not_found' } };
    if (overLimit(`note:${userId}`, 10, 60000)) return { status: 429, data: { error: 'too_fast', message: 'Juda tez yozyapsiz. Biroz kuting.' } };
    const text = needText(body.text, 'Izoh', NOTE_MAX_LENGTH);
    // Manager va yuqorisining izohi hamma kitda ko'rinadi. Administrator izohi faqat o'z kit(lar)ida.
    const kit = access.global ? null : (access.scope.find(k => indexed.presentIn.has(k)) || access.scope[0] || null);
    const note = await events.noteAdd(targetId, userId, kit, text);
    events.record('note_add', { kit, guildId: kit ? kitBySlug.get(kit).guildId : null, actorId: userId, targetId, nickname: indexed.nickname, source: 'panel' });
    return { status: 200, data: { note: { ...note, author: personOf(userId), canDelete: true } } };
  }
  async function apiNoteDelete({ match, userId, access }) {
    const note = await events.noteGet(Number(match[1]));
    if (!note || (note.kit && !inScope(access, note.kit))) return { status: 404, data: { error: 'not_found' } };
    if (note.authorId !== userId && rankOf(note.authorId) >= access.rank) return { status: 403, data: { error: 'forbidden', message: 'Bu izohni o\'chira olmaysiz.' } };
    await events.noteDelete(note.id);
    events.record('note_delete', { kit: note.kit, guildId: note.kit ? kitBySlug.get(note.kit)?.guildId || null : null, actorId: userId, targetId: note.targetId, source: 'panel' });
    return { status: 200, data: { ok: true } };
  }

  // ---------- xodimlar chati ----------
  const chatView = m => ({ ...m, author: personOf(m.authorId), authorName: label(m.authorId), authorAvatar: avatarOf(m.authorId), authorRole: staffInfo(m.authorId)?.role || null });
  async function apiChatGet({ url }) {
    const since = Number(url.searchParams.get('since'));
    const before = Number(url.searchParams.get('before'));
    let messages;
    if (since > 0) messages = await events.chatChangedSince(since);
    else messages = await events.chatRecent({ limit: 60, beforeId: before > 0 ? before : null });
    const replyIds = [...new Set(messages.map(m => m.replyTo).filter(Boolean))];
    const known = new Map(messages.map(m => [m.id, m]));
    const replies = {};
    for (const id of replyIds) {
      const original = known.get(id) || await events.chatGet(id);
      if (original) replies[id] = { id, authorName: label(original.authorId), body: original.deleted ? '' : original.body.slice(0, 120), deleted: original.deleted };
    }
    return { messages: messages.map(chatView), replies, serverTime: Date.now() };
  }
  async function apiChatPost({ body, userId }) {
    if (overLimit(`chat:${userId}`, 8, 10000)) return { status: 429, data: { error: 'too_fast', message: 'Juda tez yozyapsiz. Biroz kuting.' } };
    const text = needText(body.text, 'Xabar', CHAT_MAX_LENGTH);
    let replyTo = null;
    if (body.replyTo) {
      const original = await events.chatGet(Number(body.replyTo));
      if (!original || original.deleted) throw new BadRequest('Javob berilayotgan xabar topilmadi.');
      replyTo = original.id;
    }
    return { status: 200, data: { message: chatView(await events.chatInsert(userId, text, replyTo)) } };
  }
  async function apiChatEdit({ match, body, userId }) {
    const id = Number(match[1]);
    const message = await events.chatGet(id);
    if (!message || message.deleted) return { status: 404, data: { error: 'not_found' } };
    if (message.authorId !== userId) return { status: 403, data: { error: 'forbidden', message: 'Faqat o\'z xabaringizni tahrirlay olasiz.' } };
    return { status: 200, data: { message: chatView(await events.chatEdit(id, needText(body.text, 'Xabar', CHAT_MAX_LENGTH))) } };
  }
  async function apiChatDelete({ match, userId, access }) {
    const id = Number(match[1]);
    const message = await events.chatGet(id);
    if (!message || message.deleted) return { status: 404, data: { error: 'not_found' } };
    const own = message.authorId === userId;
    if (!own && rankOf(message.authorId) >= access.rank) return { status: 403, data: { error: 'forbidden', message: 'Bu xodimning xabarini o\'chira olmaysiz.' } };
    // Boshqa xodim xabari o'chirilsa, matni logda saqlanadi.
    const body = message.body;
    await events.chatDelete(id);
    if (!own) events.record('chat_delete', { actorId: userId, targetId: message.authorId, note: body, source: 'panel' });
    return { status: 200, data: { ok: true } };
  }

  // ---------- shaxsiy xabarlar: faqat ikki tomon o'qiy oladi, OWNER ham ko'rmaydi ----------
  async function apiDmList({ userId }) {
    const conversations = await events.dmConversations(userId);
    const byOther = new Map(conversations.map(c => [c.otherId, c]));
    // Panelga kira oladigan hamma xodim bilan yozishish mumkin.
    const contacts = [...allStaff().values()].filter(m => m.rank >= ADMIN_RANK && m.id !== userId);
    const items = contacts.map(m => {
      const c = byOther.get(m.id);
      return { id: m.id, name: m.name, avatar: m.avatar, role: m.role, roleColor: m.roleColor, online: m.online, unread: c?.unread || 0, lastAt: c?.last?.createdAt || null, lastBody: c?.last ? (c.last.deleted ? '' : String(c.last.body).slice(0, 80)) : null, lastMine: c?.last?.authorId === userId };
    }).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0) || b.unread - a.unread || a.name.localeCompare(b.name));
    return { contacts: items };
  }
  const dmContactOk = (otherId, userId) => otherId !== userId && Boolean(computeAccess(otherId));
  async function apiDmGet({ match, url, userId }) {
    const otherId = match[1];
    if (!dmContactOk(otherId, userId)) return null;
    const since = Number(url.searchParams.get('since'));
    const before = Number(url.searchParams.get('before'));
    let messages;
    if (since > 0) messages = await events.dmChangedSince(userId, otherId, since);
    else messages = await events.dmRecent(userId, otherId, { limit: 60, beforeId: before > 0 ? before : null });
    const key = events.dmKey(userId, otherId);
    const known = new Map(messages.map(m => [m.id, m]));
    const replies = {};
    for (const id of new Set(messages.map(m => m.replyTo).filter(Boolean))) {
      const original = known.get(id) || await events.dmGet(id);
      if (original && original.convKey === key) replies[id] = { id, authorName: label(original.authorId), body: original.deleted ? '' : original.body.slice(0, 120), deleted: original.deleted };
    }
    return { other: personOf(otherId), messages: messages.map(chatView), replies, serverTime: Date.now() };
  }
  async function apiDmPost({ match, body, userId }) {
    const otherId = match[1];
    if (!dmContactOk(otherId, userId)) return { status: 404, data: { error: 'not_found' } };
    if (overLimit(`chat:${userId}`, 8, 10000)) return { status: 429, data: { error: 'too_fast', message: 'Juda tez yozyapsiz. Biroz kuting.' } };
    const text = needText(body.text, 'Xabar', CHAT_MAX_LENGTH);
    let replyTo = null;
    if (body.replyTo) {
      const original = await events.dmGet(Number(body.replyTo));
      if (!original || original.deleted || original.convKey !== events.dmKey(userId, otherId)) throw new BadRequest('Javob berilayotgan xabar topilmadi.');
      replyTo = original.id;
    }
    return { status: 200, data: { message: chatView(await events.dmInsert(userId, otherId, text, replyTo)) } };
  }
  async function apiDmRead({ match, userId }) {
    if (!dmContactOk(match[1], userId)) return { status: 404, data: { error: 'not_found' } };
    await events.dmMarkRead(userId, match[1]);
    return { status: 200, data: { ok: true } };
  }
  async function apiDmEdit({ match, body, userId }) {
    const id = Number(match[1]);
    const message = await events.dmGet(id);
    if (!message || message.deleted || message.authorId !== userId) return { status: 404, data: { error: 'not_found' } };
    return { status: 200, data: { message: chatView(await events.dmEdit(id, needText(body.text, 'Xabar', CHAT_MAX_LENGTH))) } };
  }
  async function apiDmDelete({ match, userId }) {
    const id = Number(match[1]);
    const message = await events.dmGet(id);
    if (!message || message.deleted || message.authorId !== userId) return { status: 404, data: { error: 'not_found' } };
    await events.dmDelete(id);
    return { status: 200, data: { ok: true } };
  }

  async function apiNotificationsRead({ userId }) {
    await events.profileSetNotifRead(userId, Date.now());
    return { status: 200, data: { ok: true } };
  }

  // ---------- server sozlamalari, panellar va yangiliklar ----------
  // Ko'rish hamma panel foydalanuvchisiga ochiq; o'zgartirish faqat Manager va undan yuqori.
  const canManage = access => access.rank >= MANAGER_RANK;
  // Audit jadvalida new_value ustuni 40 belgilik.
  const auditText = value => String(value).slice(0, 40);
  const MANAGE_ONLY = { status: 403, data: { error: 'forbidden', message: 'Sozlamalarni faqat Manager va undan yuqori rollar o\'zgartira oladi.' } };
  const CHANNEL_GUILD_TEXT = 0;
  const CHANNEL_CATEGORY = 4;
  const CHANNEL_NEWS = 5;
  const configKit = (access, slug) => {
    const k = kitBySlug.get(slug);
    return k && inScope(access, slug) ? k : null;
  };
  const guildChannels = guild => (guild ? [...guild.channels.cache.values()] : []);
  function textChannelsOf(guild) {
    const all = guildChannels(guild);
    const parents = new Map(all.filter(c => c.type === CHANNEL_CATEGORY).map(c => [c.id, c.name]));
    return all
      .filter(c => c.type === CHANNEL_GUILD_TEXT || c.type === CHANNEL_NEWS)
      .sort((a, b) => (a.rawPosition ?? a.position ?? 0) - (b.rawPosition ?? b.position ?? 0))
      .map(c => ({ id: c.id, name: c.name, category: parents.get(c.parentId) || null }));
  }
  function channelHealth(guild) {
    const all = guildChannels(guild);
    return Object.entries(botInfo.channelNames || {}).map(([key, name]) => {
      const ch = all.find(c => c.name === name);
      return { key, name, found: Boolean(ch), id: ch?.id || null };
    });
  }
  function ticketCategoryView(guild) {
    const all = guildChannels(guild);
    return (botInfo.ticketCategories || []).map(c => {
      const cat = all.find(ch => ch.name === c.category && ch.type === CHANNEL_CATEGORY);
      const open = cat ? all.filter(ch => ch.parentId === cat.id).length : 0;
      return { ...c, found: Boolean(cat), open };
    });
  }
  // Bot xabarlari qaysi kanalda turadi.
  function panelTargets(guild) {
    const all = guildChannels(guild);
    return Object.entries(botInfo.panelChannels || {}).map(([id, name]) => ({ id, label: PANEL_LABELS[id] || id, channel: name, found: all.some(c => c.name === name) }));
  }
  const settingsError = err => (err instanceof SettingsError ? new BadRequest(err.message) : err);

  async function apiKitConfig({ match, access }) {
    const k = configKit(access, match[1]);
    if (!k || !settings) return null;
    const guild = client.guilds.cache.get(k.guildId);
    const s = getState();
    return {
      kit: k.kit,
      name: k.name,
      guildId: k.guildId,
      guildName: guild?.name || null,
      canEdit: canManage(access),
      ...settings.view(k.kit),
      panelFields: PANEL_FIELDS,
      modalFieldStyles: MODAL_FIELD_STYLES,
      channels: channelHealth(guild),
      textChannels: textChannelsOf(guild),
      categories: ticketCategoryView(guild),
      panelTargets: panelTargets(guild),
      applicationOpen: s.applicationOpen?.[k.guildId] !== false,
      queueOpen: s.testersOnline?.[k.guildId] === true,
      slashCommands: botInfo.slashCommands || []
    };
  }

  async function apiKitConfigSave({ match, body, userId, access }) {
    const k = configKit(access, match[1]);
    if (!k || !settings) return { status: 404, data: { error: 'not_found' } };
    if (!canManage(access)) return MANAGE_ONLY;
    if (overLimit(`config:${userId}`, 30, 60000)) return { status: 429, data: { error: 'too_fast', message: 'Juda ko\'p o\'zgarish. Biroz kuting.' } };
    const [section, item] = [match[2], match[3] || null];
    let value;
    let what;
    try {
      if (section === 'cooldowns') { value = settings.setCooldowns(k.kit, body.cooldowns); what = 'Cooldownlar'; }
      else if (section === 'queue') { value = settings.setQueue(k.kit, body.queue); what = 'Navbat hajmi'; }
      else if (section === 'servers') { value = settings.setServers(k.kit, body.servers); what = 'Serverlar ro\'yxati'; }
      else if (section === 'panel' && PANEL_LABELS[item]) { value = body.reset === true ? settings.resetPanel(k.kit, item) : settings.setPanel(k.kit, item, body.panel); what = `${PANEL_LABELS[item]} paneli`; }
      else if (section === 'modal' && MODAL_LABELS[item]) { value = body.reset === true ? settings.resetModal(k.kit, item) : settings.setModal(k.kit, item, body.modal); what = `${MODAL_LABELS[item]} oynasi`; }
      else return { status: 404, data: { error: 'not_found' } };
    } catch (err) { throw settingsError(err); }
    events.record('settings_change', { kit: k.kit, guildId: k.guildId, actorId: userId, newValue: what, note: body.reset === true ? 'standart holatga qaytarildi' : null, source: 'panel' });
    return { status: 200, data: { ok: true, value, message: body.reset === true ? `${what} standart holatga qaytarildi.` : `${what} saqlandi.` } };
  }

  async function apiPanelPublish({ match, userId, access }) {
    const k = configKit(access, match[1]);
    const id = match[2];
    if (!k || !PANEL_LABELS[id]) return { status: 404, data: { error: 'not_found' } };
    if (!canManage(access)) return MANAGE_ONLY;
    if (overLimit(`publish:${userId}`, 10, 60000)) return { status: 429, data: { error: 'too_fast', message: 'Juda tez yuboryapsiz. Biroz kuting.' } };
    if (!actions.refreshPanel) throw new BadRequest('Bot bu amalni qo\'llamaydi.');
    const guild = client.guilds.cache.get(k.guildId);
    if (!guild) throw new BadRequest('Server topilmadi.');
    const result = await actions.refreshPanel(guild, userId, id);
    events.record('panel_publish', { kit: k.kit, guildId: k.guildId, actorId: userId, newValue: `${PANEL_LABELS[id]} paneli`, note: result?.channelName || null, source: 'panel' });
    return { status: 200, data: { ok: true, message: result?.created ? `${PANEL_LABELS[id]} paneli kanalga yuborildi.` : `${PANEL_LABELS[id]} paneli Discord'da yangilandi.` } };
  }

  function customPanelChannelOk(guild, channelId) {
    return textChannelsOf(guild).some(c => c.id === channelId);
  }
  async function apiCustomPanelSave({ match, body, userId, access }) {
    const k = configKit(access, match[1]);
    if (!k || !settings) return { status: 404, data: { error: 'not_found' } };
    if (!canManage(access)) return MANAGE_ONLY;
    if (overLimit(`config:${userId}`, 30, 60000)) return { status: 429, data: { error: 'too_fast', message: 'Juda ko\'p o\'zgarish. Biroz kuting.' } };
    const guild = client.guilds.cache.get(k.guildId);
    if (!customPanelChannelOk(guild, String(body.panel?.channelId || ''))) throw new BadRequest('Kanal shu serverda topilmadi.');
    let saved;
    try { saved = settings.saveCustomPanel(k.kit, match[2] || null, body.panel, match[2] ? {} : { authorId: userId }); } catch (err) { throw settingsError(err); }
    events.record('settings_change', { kit: k.kit, guildId: k.guildId, actorId: userId, newValue: auditText(`Panel: ${saved.name}`), source: 'panel' });
    return { status: 200, data: { ok: true, panel: saved, message: 'Panel saqlandi.' } };
  }
  async function apiCustomPanelPublish({ match, userId, access }) {
    const k = configKit(access, match[1]);
    if (!k || !settings) return { status: 404, data: { error: 'not_found' } };
    if (!canManage(access)) return MANAGE_ONLY;
    if (overLimit(`publish:${userId}`, 10, 60000)) return { status: 429, data: { error: 'too_fast', message: 'Juda tez yuboryapsiz. Biroz kuting.' } };
    const panel = settings.customPanel(k.kit, match[2]);
    if (!panel) return { status: 404, data: { error: 'not_found' } };
    if (!actions.publishCustomPanel) throw new BadRequest('Bot bu amalni qo\'llamaydi.');
    const guild = client.guilds.cache.get(k.guildId);
    if (!guild || !customPanelChannelOk(guild, panel.channelId)) throw new BadRequest('Kanal shu serverda topilmadi.');
    const result = await actions.publishCustomPanel(guild, userId, panel);
    const updated = settings.markCustomPanel(k.kit, panel.id, { messageId: result.messageId, publishedChannelId: panel.channelId, publishedAt: Date.now() });
    events.record('panel_publish', { kit: k.kit, guildId: k.guildId, actorId: userId, newValue: auditText(`Panel: ${panel.name}`), note: result.channelName || null, source: 'panel' });
    return { status: 200, data: { ok: true, panel: updated, message: result.created ? 'Panel kanalga yuborildi.' : 'Panel Discord\'da yangilandi.' } };
  }
  async function apiCustomPanelDelete({ match, userId, access }) {
    const k = configKit(access, match[1]);
    if (!k || !settings) return { status: 404, data: { error: 'not_found' } };
    if (!canManage(access)) return MANAGE_ONLY;
    const panel = settings.customPanel(k.kit, match[2]);
    if (!panel) return { status: 404, data: { error: 'not_found' } };
    const guild = client.guilds.cache.get(k.guildId);
    let messageRemoved = false;
    if (panel.messageId && guild && actions.deleteCustomPanelMessage) {
      messageRemoved = await actions.deleteCustomPanelMessage(guild, panel).catch(() => false);
    }
    settings.removeCustomPanel(k.kit, panel.id);
    events.record('settings_change', { kit: k.kit, guildId: k.guildId, actorId: userId, newValue: auditText(`Panel: ${panel.name}`), note: 'o\'chirildi', source: 'panel' });
    return { status: 200, data: { ok: true, message: messageRemoved ? 'Panel va uning Discord xabari o\'chirildi.' : 'Panel o\'chirildi.' } };
  }

  // Yangiliklar: hamma o'qiydi; Manager va yuqorisi yozadi; muallif yoki undan yuqori rol tahrirlaydi.
  const newsView = (n, userId, access) => ({ ...n, author: personOf(n.authorId), canEdit: n.authorId === userId || rankOf(n.authorId) < access.rank });
  function apiNews({ userId, access }) {
    if (!news) return { items: [], canPost: false };
    return { items: news.list({ kits: access.global ? null : access.scope, limit: 40 }).map(n => newsView(n, userId, access)), canPost: canManage(access) };
  }
  function apiNewsAdd({ body, userId, access }) {
    if (!news) return { status: 404, data: { error: 'not_found' } };
    if (!canManage(access)) return { status: 403, data: { error: 'forbidden', message: 'Yangilikni faqat Manager va undan yuqori rollar yoza oladi.' } };
    if (overLimit(`news:${userId}`, 6, 60000)) return { status: 429, data: { error: 'too_fast', message: 'Juda tez yozyapsiz. Biroz kuting.' } };
    const kit = kitBySlug.has(body.kit) ? body.kit : null;
    let item;
    try { item = news.add({ authorId: userId, title: body.title, body: body.body, kit, pinned: body.pinned === true }); } catch (err) { throw settingsError(err); }
    events.record('news_add', { kit, guildId: kit ? kitBySlug.get(kit).guildId : null, actorId: userId, newValue: auditText(item.title), source: 'panel' });
    return { status: 200, data: { ok: true, item: newsView(item, userId, access), message: 'Yangilik qo\'shildi.' } };
  }
  function apiNewsEdit({ match, body, userId, access }) {
    const item = news?.get(match[1]);
    if (!item || (item.kit && !inScope(access, item.kit))) return { status: 404, data: { error: 'not_found' } };
    if (!newsView(item, userId, access).canEdit) return { status: 403, data: { error: 'forbidden', message: 'Bu yangilikni tahrirlay olmaysiz.' } };
    let updated;
    try { updated = news.update(item.id, { title: body.title, body: body.body, pinned: body.pinned === true }); } catch (err) { throw settingsError(err); }
    return { status: 200, data: { ok: true, item: newsView(updated, userId, access), message: 'Yangilik saqlandi.' } };
  }
  function apiNewsDelete({ match, userId, access }) {
    const item = news?.get(match[1]);
    if (!item || (item.kit && !inScope(access, item.kit))) return { status: 404, data: { error: 'not_found' } };
    if (!newsView(item, userId, access).canEdit) return { status: 403, data: { error: 'forbidden', message: 'Bu yangilikni o\'chira olmaysiz.' } };
    news.remove(item.id);
    events.record('news_delete', { kit: item.kit, guildId: item.kit ? kitBySlug.get(item.kit)?.guildId || null : null, actorId: userId, newValue: auditText(item.title), source: 'panel' });
    return { status: 200, data: { ok: true, message: 'Yangilik o\'chirildi.' } };
  }

  // Boshqaruv: tarmoqdagi serverlar, kanallar holati, rollar va bot holati (faqat o'qish).
  function apiManage({ access }) {
    const s = getState();
    return {
      canEdit: canManage(access),
      kits: scopeKits(access).map(k => {
        const guild = client.guilds.cache.get(k.guildId);
        const health = channelHealth(guild);
        const queue = queueView(k, s);
        return {
          kit: k.kit,
          name: k.name,
          guildId: k.guildId,
          guildName: guild?.name || null,
          members: guild?.memberCount ?? null,
          online: Boolean(guild),
          open: queue.open,
          queue: queue.players.length,
          testers: queue.testers.length,
          applicationOpen: s.applicationOpen?.[k.guildId] !== false,
          channelsFound: health.filter(c => c.found).length,
          channelsTotal: health.length,
          missing: health.filter(c => !c.found).map(c => c.name),
          changed: settings ? settings.view(k.kit).panelsChanged.length + settings.view(k.kit).modalsChanged.length : 0
        };
      }),
      roles: [...ROLE_ORDER].reverse().map(name => ({ name, rank: rankOfRole(name), color: roleColor(name) })),
      bot: {
        ping: Number.isFinite(client.ws?.ping) ? Math.round(client.ws.ping) : null,
        uptime: Math.round(process.uptime() * 1000),
        guilds: client.guilds.cache.size,
        memory: Math.round(process.memoryUsage().rss / 1048576),
        node: process.version
      },
      slashCommands: botInfo.slashCommands || []
    };
  }

  // ---------- marshrutlar ----------
  const READ_ROUTES = [
    [/^\/api\/kits\/([a-z]+)\/config$/, apiKitConfig],
    [/^\/api\/news$/, apiNews],
    [/^\/api\/manage$/, apiManage],
    [/^\/api\/me$/, apiMe],
    [/^\/api\/ping$/, apiPing],
    [/^\/api\/roles$/, apiRoles],
    [/^\/api\/overview$/, apiOverview],
    [/^\/api\/stats\/tests$/, apiTestsPerDay],
    [/^\/api\/search$/, apiSearch],
    [/^\/api\/players$/, apiPlayers],
    [/^\/api\/players\/(\d{15,25})$/, apiPlayer],
    [/^\/api\/restrictions$/, apiRestrictions],
    [/^\/api\/staff$/, apiStaff],
    [/^\/api\/staff\/(\d{15,25})$/, apiStaffProfile],
    [/^\/api\/kits\/([a-z]+)$/, apiKit],
    [/^\/api\/logs$/, apiLogs],
    [/^\/api\/tickets\/summary$/, apiTicketSummary],
    [/^\/api\/tickets$/, apiTicketList],
    [/^\/api\/tickets\/(\d{15,25})$/, apiTicket],
    [/^\/api\/chat$/, apiChatGet],
    [/^\/api\/dm$/, apiDmList],
    [/^\/api\/dm\/(\d{15,25})$/, apiDmGet],
    [/^\/api\/notifications$/, ({ userId, access }) => buildNotifications(access, userId)]
  ];
  const WRITE_ROUTES = [
    ['POST', /^\/api\/actions\/([a-zA-Z]+)$/, apiAction],
    ['POST', /^\/api\/chat$/, apiChatPost],
    ['PATCH', /^\/api\/chat\/(\d+)$/, apiChatEdit],
    ['DELETE', /^\/api\/chat\/(\d+)$/, apiChatDelete],
    ['POST', /^\/api\/dm\/(\d{15,25})$/, apiDmPost],
    ['POST', /^\/api\/dm\/(\d{15,25})\/read$/, apiDmRead],
    ['PATCH', /^\/api\/dm\/msg\/(\d+)$/, apiDmEdit],
    ['DELETE', /^\/api\/dm\/msg\/(\d+)$/, apiDmDelete],
    ['POST', /^\/api\/players\/(\d{15,25})\/notes$/, apiNoteAdd],
    ['DELETE', /^\/api\/notes\/(\d+)$/, apiNoteDelete],
    ['PATCH', /^\/api\/profile$/, apiProfileSave],
    ['POST', /^\/api\/notifications\/read$/, apiNotificationsRead],
    ['PATCH', /^\/api\/kits\/([a-z]+)\/config\/(cooldowns|queue|servers|panel|modal)(?:\/([a-zA-Z]+))?$/, apiKitConfigSave],
    ['POST', /^\/api\/kits\/([a-z]+)\/panels\/([a-zA-Z]+)\/publish$/, apiPanelPublish],
    ['POST', /^\/api\/kits\/([a-z]+)\/custom-panels$/, apiCustomPanelSave],
    ['PATCH', /^\/api\/kits\/([a-z]+)\/custom-panels\/(p[a-z0-9]{4,20})$/, apiCustomPanelSave],
    ['POST', /^\/api\/kits\/([a-z]+)\/custom-panels\/(p[a-z0-9]{4,20})\/publish$/, apiCustomPanelPublish],
    ['DELETE', /^\/api\/kits\/([a-z]+)\/custom-panels\/(p[a-z0-9]{4,20})$/, apiCustomPanelDelete],
    ['POST', /^\/api\/news$/, apiNewsAdd],
    ['PATCH', /^\/api\/news\/(n[a-z0-9]{4,20})$/, apiNewsEdit],
    ['DELETE', /^\/api\/news\/(n[a-z0-9]{4,20})$/, apiNewsDelete]
  ];

  async function handleApi(req, res, pathname, url) {
    const cookies = parseCookies(req.headers.cookie);
    const session = verifySession(cookies[SESSION_COOKIE]);
    if (!session) return sendJson(res, 401, { error: 'unauthorized' });
    const access = getAccess(session.uid);
    if (!access) {
      res.setHeader('Set-Cookie', cookie(SESSION_COOKIE, '', 0));
      return sendJson(res, 403, { error: 'no_access' });
    }
    const userId = session.uid;
    lastSeen.set(userId, Date.now());
    if (events.profileTouch && Date.now() - (seenSaved.get(userId) || 0) > 5 * 60 * 1000) {
      seenSaved.set(userId, Date.now());
      safe(events.profileTouch(userId), null);
    }

    const method = req.method;
    if (method !== 'GET' && method !== 'HEAD') {
      // O'zgartiruvchi so'rovlar faqat panelning o'zidan qabul qilinadi.
      const route = WRITE_ROUTES.find(([m, re]) => m === method && re.test(pathname));
      if (!route) {
        res.setHeader('Allow', 'GET, HEAD');
        return sendJson(res, 405, { error: 'method_not_allowed' });
      }
      if (!isTrustedWrite(req)) return sendJson(res, 403, { error: 'bad_origin' });
      const body = await readJsonBody(req);
      const out = await route[2]({ match: pathname.match(route[1]), body, url, userId, access });
      return sendJson(res, out.status, out.data);
    }

    const fileMatch = pathname.match(/^\/api\/tickets\/(\d{15,25})\/files\/([0-9a-z.]+)$/);
    if (fileMatch) return sendTicketFile(res, fileMatch, access);

    const route = READ_ROUTES.find(([re]) => re.test(pathname));
    if (!route) return sendJson(res, 404, { error: 'not_found' });
    const data = await route[1]({ match: pathname.match(route[0]), url, userId, access });
    if (!data) return sendJson(res, 404, { error: 'not_found' });
    return sendJson(res, 200, data);
  }

  async function handler(req, res) {
    setSecurityHeaders(res);
    try {
      const url = new URL(req.url, 'http://panel.local');
      const pathname = url.pathname;
      if (req.method === 'POST' && pathname === '/auth/logout') return logout(req, res);
      if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname, url);
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD');
        return sendJson(res, 405, { error: 'method_not_allowed' });
      }
      if (pathname === '/auth/discord') return beginLogin(res);
      if (pathname === '/auth/callback') return await finishLogin(req, res, url);
      const file = staticFiles.get(pathname);
      if (!file) return sendText(res, 404, 'Topilmadi');
      const cacheControl = LONG_CACHE_TYPES.has(file.type) ? 'public, max-age=604800' : 'no-cache';
      if (req.headers['if-none-match'] === file.etag) {
        res.writeHead(304, { ETag: file.etag, 'Cache-Control': cacheControl });
        return res.end();
      }
      res.writeHead(200, { 'Content-Type': file.type, 'Cache-Control': cacheControl, ETag: file.etag });
      return res.end(file.body);
    } catch (err) {
      if (err instanceof BadRequest || err instanceof ActionError) {
        if (!res.headersSent) return sendJson(res, 400, { error: 'bad_request', message: err.message });
        return res.end();
      }
      log.error('Panel xatosi:', err.message);
      if (!res.headersSent) return sendJson(res, 500, { error: 'server_error' });
      return res.end();
    }
  }

  return { handler, signSession, verifySession };
}

// Sozlamalar to'liq bo'lmasa panel ishga tushmaydi, bot esa odatdagidek ishlayveradi.
function startPanel(options) {
  const env = options.env || process.env;
  const log = options.log || console;
  const port = Number(env.PANEL_PORT);
  if (!port) {
    log.log('Veb-panel o\'chirilgan (PANEL_PORT yo\'q).');
    return null;
  }
  const missing = ['PANEL_PUBLIC_URL', 'PANEL_SESSION_SECRET', 'DISCORD_CLIENT_SECRET'].filter(name => !env[name]);
  if (missing.length) {
    log.error(`Veb-panel ishga tushmadi, .env da yo'q: ${missing.join(', ')}`);
    return null;
  }
  if (String(env.PANEL_SESSION_SECRET).length < 32) {
    log.error('Veb-panel ishga tushmadi: PANEL_SESSION_SECRET juda qisqa.');
    return null;
  }
  try {
    const panel = createPanel(options);
    const server = http.createServer(panel.handler);
    server.on('error', err => log.error('Veb-panel xatosi:', err.message));
    server.listen(port, '127.0.0.1', () => log.log(`Veb-panel ishga tushdi: 127.0.0.1:${port}`));
    return { server, ...panel };
  } catch (err) {
    log.error('Veb-panel ishga tushmadi:', err.message);
    return null;
  }
}

module.exports = { createPanel, startPanel, ROLE_ORDER, TIER_VALUES };
