'use strict';
// Xodim rollari va daraja o'zgartirish qoidalari.
// Discord komandalari ham, veb-panel ham shu bitta qoidadan foydalanadi.

// Pastdan yuqoriga.
const ROLE_ORDER = ['Tasdiqlangan Tester', 'Tester Tasdiqluvchi', 'Senior Tester', 'Moderator', 'Administrator', 'Manager', 'Network Admin', 'OWNER'];
// Pastdan yuqoriga: bir qadam shu ro'yxatdagi qo'shni daraja.
const TIER_STEPS = ['LT5', 'HT5', 'LT4', 'HT4', 'LT3', 'HT3', 'LT2', 'HT2', 'LT1', 'HT1'];
const TIER_LIMIT_MS = 24 * 60 * 60 * 1000;

const rankOfRole = name => ROLE_ORDER.indexOf(name);
const ADMIN_RANK = rankOfRole('Administrator');
const MANAGER_RANK = rankOfRole('Manager');
const OWNER_RANK = rankOfRole('OWNER');
const MODERATOR_RANK = rankOfRole('Moderator');
const TRUST_MEMO_MS = 5000;
const trustMemo = new WeakMap();
const warnedRoles = new Set();

// Discord'da rol yaratish huquqi bor odam faqat o'z rolidan pastda rol yarata oladi.
// Shuning uchun "OWNER" deb nomlangan soxta rol haqiqiy joyida turmaydi va hisoblanmaydi:
// bir xil nomli rollardan faqat eng yuqorisi olinadi, undan yuqorida pastroq xodim roli turmasligi kerak.
// Testerlar tekshirilmaydi: ularning tartibi serverlarda har xil va ularni Administrator baribir bera oladi.
function trustedStaffRoles(guild) {
  const size = guild.roles.cache.size;
  const memo = trustMemo.get(guild);
  if (memo && memo.size === size && memo.until > Date.now()) return memo;
  const rankById = new Map();
  const roleByName = new Map();
  let lowestAbove = Infinity;
  const staff = [...guild.roles.cache.values()].filter(r => rankOfRole(r.name) >= 0).sort((a, b) => b.rawPosition - a.rawPosition);
  for (const role of staff) {
    const rank = rankOfRole(role.name);
    if (rank >= MODERATOR_RANK) {
      if (roleByName.has(role.name) || rank > lowestAbove) {
        if (!warnedRoles.has(role.id)) {
          warnedRoles.add(role.id);
          console.warn(`Shubhali rol hisobga olinmadi: "${role.name}" (${guild.name}, ${role.id})`);
        }
        continue;
      }
      lowestAbove = rank;
    }
    rankById.set(role.id, rank);
    if (!roleByName.has(role.name)) roleByName.set(role.name, role);
  }
  const result = { size, until: Date.now() + TRUST_MEMO_MS, rankById, roleByName };
  trustMemo.set(guild, result);
  return result;
}
// Shu nomdagi haqiqiy xodim roli (yo'q bo'lsa undefined).
const staffRoleByName = (guild, name) => trustedStaffRoles(guild).roleByName.get(name);

// Bitta serverdagi eng yuqori xodim darajasi (-1: xodim emas).
function bestRankOf(member) {
  if (!member || member.user?.bot) return -1;
  const { rankById } = trustedStaffRoles(member.guild);
  let best = -1;
  for (const id of member.roles.cache.keys()) best = Math.max(best, rankById.get(id) ?? -1);
  return best;
}

// Berilgan serverlar ichidagi eng yuqori xodim darajasi (-1: xodim emas).
function highestRank(client, guildIds, userId) {
  let best = -1;
  for (const guildId of guildIds) best = Math.max(best, bestRankOf(client.guilds.cache.get(guildId)?.members.cache.get(userId)));
  return best;
}

// Xodim faqat o'z rolidan past rollarni bera yoki ola oladi.
function canAssignRole(actorRank, roleName) {
  const rank = rankOfRole(roleName);
  return rank >= 0 && rank < actorRank;
}

// Darajasi yo'q o'yinchiga faqat eng pastki daraja (LT5) berilishi mumkin.
function isOneStep(currentTier, newTier) {
  const to = TIER_STEPS.indexOf(newTier);
  if (to < 0) return false;
  const from = TIER_STEPS.indexOf(currentTier);
  if (from < 0) return to === 0;
  return Math.abs(from - to) === 1;
}

// Hozirgi darajadan bir qadam pastdagi va yuqoridagi daraja.
function neighbourTiers(currentTier) {
  const from = TIER_STEPS.indexOf(currentTier);
  if (from < 0) return { down: null, up: TIER_STEPS[0] };
  return { down: TIER_STEPS[from - 1] || null, up: TIER_STEPS[from + 1] || null };
}

// 24 soat ichida Manager'dan past xodim qilgan oxirgi daraja o'zgarishining tugash vaqti (yo'q bo'lsa null).
function tierLockUntil(recentChanges, rankOf, now = Date.now()) {
  let until = null;
  for (const change of recentChanges) {
    if (rankOf(change.actorId) >= MANAGER_RANK) continue;
    const end = Number(change.createdAt) + TIER_LIMIT_MS;
    if (end > now && (until === null || end > until)) until = end;
  }
  return until;
}

module.exports = {
  ROLE_ORDER,
  TIER_STEPS,
  TIER_LIMIT_MS,
  ADMIN_RANK,
  MANAGER_RANK,
  OWNER_RANK,
  MODERATOR_RANK,
  rankOfRole,
  staffRoleByName,
  bestRankOf,
  highestRank,
  canAssignRole,
  isOneStep,
  neighbourTiers,
  tierLockUntil
};
