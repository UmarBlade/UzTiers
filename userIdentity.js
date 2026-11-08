const TIER_ORDER = ['LT5', 'HT5', 'LT4', 'HT4', 'LT3', 'HT3', 'LT2', 'HT2', 'LT1', 'HT1'];
const HIGH_TEST_ELIGIBLE_TIER = ['LT3', 'HT3', 'LT2', 'HT2', 'LT1', 'HT1'];

function getTierRank(tier) {
    const normalized = String(tier || '').trim();
    const index = TIER_ORDER.indexOf(normalized);
    return index === -1 ? -1 : index;
}

function findHighestTier(tiers) {
    const ranked = (tiers || [])
        .filter(Boolean)
        .map(t => String(t).trim())
        .filter(t => getTierRank(t) !== -1)
        .sort((a, b) => getTierRank(a) - getTierRank(b));
    return ranked.length ? ranked[ranked.length - 1] : null;
}

function isEligibleForTesterTier(tier) {
    const normalized = String(tier || '').trim();
    return HIGH_TEST_ELIGIBLE_TIER.includes(normalized);
}

function upsertUserVerificationProfile(userProfiles, userId, guildId, nickname, verifiedAt = Date.now()) {
    if (!userId || !guildId || !nickname) return null;
    const profile = userProfiles[userId] || { nickname: null, verifiedAt: null, guilds: {} };
    if (!profile.guilds || typeof profile.guilds !== 'object') profile.guilds = {};
    profile.nickname = profile.nickname || nickname;
    profile.verifiedAt = profile.verifiedAt || verifiedAt;
    profile.lastVerifiedGuildId = guildId;
    profile.guilds[guildId] = {
        ...(profile.guilds[guildId] || {}),
        nickname,
        verifiedAt,
    };
    userProfiles[userId] = profile;
    return profile;
}

module.exports = {
    TIER_ORDER,
    HIGH_TEST_ELIGIBLE_TIER,
    getTierRank,
    findHighestTier,
    isEligibleForTesterTier,
    upsertUserVerificationProfile
};
