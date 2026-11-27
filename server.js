const express = require('express');
const crypto = require('node:crypto');
const http = require('node:http');
const { Server: SocketServer } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new SocketServer(server, { maxHttpBufferSize: 16 * 1024, pingInterval: 25000, pingTimeout: 20000 });
const liveRaids = new Map();
const port = Number(process.env.PORT) || 3000;
const sessions = new Map();
const attempts = new Map();
const memberBase = 'https://api.github.com/repos/dor0si5523-cmd/strike-zone-members/contents/';
const WORLD = { width: 2600, height: 1900 };
const GAME_SERVERS = [
  { id: 'dawn', name: '새벽숲', region: '아시아 · 1서버', status: '원활' },
  { id: 'moon', name: '달빛 항구', region: '아시아 · 2서버', status: '원활' },
  { id: 'ember', name: '잿빛 변경', region: '아시아 · 3서버', status: '원활' }
];
const GAME_ZONES = {
  forest: { name: '초록숲', requiredLevel: 1 },
  ashlands: { name: '잿빛 고원', requiredLevel: 8 },
  moonharbor: { name: '달빛 항구', requiredLevel: 18 }
};
const CLASSES = ['warrior', 'archer', 'mage', 'gunner'];
const STARTER_ITEMS = [
  { id: 'starter_blade', visualKey: 'starter_blade', name: '여행자의 철검', slot: 'weapon', rarity: 'common', atk: 4, def: 0, enhance: 0 },
  { id: 'starter_coat', visualKey: 'starter_coat', name: '숲지기 가죽옷', slot: 'armor', rarity: 'common', atk: 0, def: 3, enhance: 0 },
  { id: 'starter_boots', visualKey: 'starter_boots', name: '길잡이 장화', slot: 'boots', rarity: 'common', atk: 0, def: 1, enhance: 0 },
  { id: 'starter_ring', visualKey: 'starter_ring', name: '낡은 호박 반지', slot: 'ring', rarity: 'common', atk: 1, def: 0, enhance: 0 }
];
function kstDayKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = type => parts.find(item => item.type === type)?.value || '00';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function kstWeekKey(date = new Date()) {
  const monday = new Date(`${kstDayKey(date)}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  return monday.toISOString().slice(0, 10);
}
function previousDayKey(dayKey) { const previous = new Date(`${dayKey}T00:00:00Z`); previous.setUTCDate(previous.getUTCDate() - 1); return previous.toISOString().slice(0, 10); }
const RPG_UPGRADE_KEYS = ['attack', 'defense', 'maxHp', 'critChance', 'critDamage', 'goldGain', 'xpGain'];
const DEFAULT_RPG = Object.freeze({ xp: 0, gold: 40, cash: 300, kills: 0, enhancements: { gold: Object.fromEntries(RPG_UPGRADE_KEYS.map(key => [key, 0])), stats: Object.fromEntries(RPG_UPGRADE_KEYS.map(key => [key, 0])) }, questStage: 0, questKills: 0, potions: 3, x: 1300, y: 1070, hp: 100, items: STARTER_ITEMS, equipment: { weapon: 'starter_blade', armor: 'starter_coat', boots: 'starter_boots', ring: 'starter_ring' }, autoSettings: { range: 'balanced', target: 'nearest', potionAt: 45, autoQuest: true }, summonPity: { epic: 0, legendary: 0 }, summonHistory: [], attendance: { lastDay: '', streak: 0 }, daily: { dayKey: kstDayKey(), kills: 0, attendanceClaimed: false, missionClaimed: false }, weekly: { weekKey: kstWeekKey(), kills: 0, missionClaimed: false }, zoneId: 'forest', classId: 'warrior' });
const GACHA_PRICES = { gold: { 1: 500, 10: 4500 }, cash: { 1: 100, 10: 900 } };
const GACHA_PITY = { epic: 30, legendary: 100 };
const DUPLICATE_GOLD = { common: 80, uncommon: 150, rare: 350, epic: 1200, unique: 2200, legendary: 4000, mythic: 8000, immortal: 16000 };
const GEAR_RARITY = ['common', 'uncommon', 'rare', 'epic', 'unique', 'legendary', 'mythic', 'immortal'];
const ARCHER_BOWS = [
  ['솔바람 장궁','bow_ashwood','rare'], ['월강성궁','bow_moonsteel','rare'], ['잿불 파쇄궁','bow_ember','rare'], ['가시덩굴 정령궁','bow_thornvine','rare'], ['별빛 왕관궁','bow_starfall','rare'],
  ['달무리 이중궁','bow_epic_1','epic'], ['공명 천공궁','bow_epic_2','epic'], ['가시 군주의 흑궁','bow_epic_3','epic'], ['비전 고리활','bow_epic_4','epic'], ['자수정 파쇄궁','bow_epic_5','epic'],
  ['태양의 파열궁','bow_unique_1','unique'], ['황금 매의 분할궁','bow_unique_2','unique'], ['용골 사냥활','bow_unique_3','unique'], ['시계장치 발리스타','bow_unique_4','unique'], ['금사 비단뱀궁','bow_unique_5','unique'],
  ['새싹 여왕의 생명궁','bow_legendary_1','legendary'], ['비늘용의 옥궁','bow_legendary_2','legendary'], ['잎새 춤 장궁','bow_legendary_3','legendary'], ['고대 뿔사냥궁','bow_legendary_4','legendary'], ['숲 수호자의 쌍날궁','bow_legendary_5','legendary'],
  ['성운의 고리활','bow_mythic_1','mythic'], ['백익의 깃궁','bow_mythic_2','mythic'], ['순백 다이아궁','bow_mythic_3','mythic'], ['은월 화염궁','bow_mythic_4','mythic'], ['무지개 유리궁','bow_mythic_5','mythic'],
  ['용암 균열 흑궁','bow_immortal_1','immortal'], ['혈룡의 날개궁','bow_immortal_2','immortal'], ['삼지창 전쟁궁','bow_immortal_3','immortal'], ['진홍 유골궁','bow_immortal_4','immortal'], ['적월 궤도궁','bow_immortal_5','immortal']
].map(([name, visualKey, rarity]) => ({ name, visualKey, rarity }));
const GEAR_NAMES = {
  weapon: ['숲길잡이 단검', '달빛 강철검', '고블린 파쇄자'],
  armor: ['수호자의 가죽 갑옷', '잿빛 망토', '숲의 비늘 갑옷'],
  boots: ['바람걸음 장화', '개척자의 발걸음', '그늘 추적자'],
  ring: ['호박빛 반지', '숲의 룬 반지', '변경 수호 반지']
};
const testMembers = process.env.NODE_ENV === 'test' && process.env.SZ_TEST_LOCAL === '1' && !process.env.RENDER ? new Map() : null;

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.json({ limit: '16kb' }));
app.use(express.static('public', { setHeaders(res, file) {
  if (/\.(js|html|css|webmanifest)$/.test(file)) res.setHeader('Cache-Control', 'no-cache');
} }));
app.get('/health', (_req, res) => res.json({ ok: true, version: '5.0', uptime: Math.floor(process.uptime()) }));

function hash(password, salt) { return crypto.scryptSync(password, salt, 64).toString('hex'); }
function issueSession(res, user) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { user, expiresAt: Date.now() + 86400000 });
  res.json({ token, name: user });
}
function identity(token) {
  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) return null;
  return session;
}
function requestUser(req) { return identity(req.headers.authorization?.replace(/^Bearer /, ''))?.user || null; }
function requestSession(req) { return identity(req.headers.authorization?.replace(/^Bearer /, '')); }
function isRpgAdmin(session) { const allowed = String(process.env.RPG_ADMIN_USERS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean); return Boolean(session?.user && allowed.includes(session.user.toLowerCase())); }
function rateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip;
  const recent = (attempts.get(key) || []).filter(time => now - time < 60000);
  if (recent.length >= 10) return res.status(429).json({ error: '잠시 후 다시 시도하세요' });
  recent.push(now);
  attempts.set(key, recent);
  next();
}
async function memberRequest(user, method = 'GET', body) {
  const token = process.env.GITHUB_MEMBERS_TOKEN;
  if (!token) throw new Error('storage not configured');
  const path = memberBase + 'members' + (user ? '/' + user + '.json' : '');
  return fetch(path, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000)
  });
}
const socialFilePath = memberBase + 'members/public-rankings.json';
function socialRequest(method = 'GET', body) {
  const token = process.env.GITHUB_MEMBERS_TOKEN;
  if (!token) throw new Error('storage not configured');
  return fetch(socialFilePath, { method, headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000) });
}
function normalizeSocial(value = {}) {
  const entries = {};
  if (value.entries && typeof value.entries === 'object' && !Array.isArray(value.entries)) for (const [id, entry] of Object.entries(value.entries).slice(0, 10000)) {
    if (!/^[a-f0-9]{64}$/.test(id) || !entry || typeof entry !== 'object') continue;
    entries[id] = { alias: String(entry.alias || '모험가').slice(0, 16), classId: CLASSES.includes(entry.classId) ? entry.classId : 'warrior', level: Math.floor(Math.max(1, Math.min(60, Number(entry.level) || 1))), score: Math.floor(Math.max(0, Math.min(999999999, Number(entry.score) || 0))), kills: Math.floor(Math.max(0, Math.min(999999, Number(entry.kills) || 0))), rankingOptIn: entry.rankingOptIn === true };
  }
  const clans = {};
  if (value.clans && typeof value.clans === 'object' && !Array.isArray(value.clans)) for (const [id, clan] of Object.entries(value.clans).slice(0, 2000)) {
    if (!/^[a-f0-9]{16}$/.test(id) || !clan || typeof clan !== 'object') continue;
    clans[id] = { name: String(clan.name || '모험가 길드').slice(0, 16), code: String(clan.code || '').slice(0, 8).toUpperCase(), memberIds: Array.isArray(clan.memberIds) ? [...new Set(clan.memberIds.filter(key => /^[a-f0-9]{64}$/.test(key)))].slice(0, 30) : [], weekKey: /^\d{4}-\d{2}-\d{2}$/.test(clan.weekKey || '') ? clan.weekKey : kstWeekKey(), weeklyKills: Math.floor(Math.max(0, Math.min(999999, Number(clan.weeklyKills) || 0))) };
  }
  const noticeSource = value.announcement && typeof value.announcement === 'object' ? value.announcement : null;
  const announcement = noticeSource && typeof noticeSource.title === 'string' && typeof noticeSource.body === 'string' ? { title: noticeSource.title.slice(0, 48), body: noticeSource.body.slice(0, 500), updatedAt: Math.floor(Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Number(noticeSource.updatedAt) || 0))) } : null;
  const audit = Array.isArray(value.adminAudit) ? value.adminAudit.slice(0, 20).filter(entry => entry && typeof entry.action === 'string').map(entry => ({ action: entry.action.slice(0, 24), at: Math.floor(Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Number(entry.at) || 0))) })) : [];
  return { entries, clans, announcement, adminAudit: audit };
}
async function readSocial() {
  const response = await socialRequest();
  if (response.status === 404) return { board: normalizeSocial(), sha: null };
  if (!response.ok) throw new Error('social storage read failed');
  const file = await response.json();
  return { board: normalizeSocial(JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'))), sha: file.sha };
}
async function updateSocial(change) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { board, sha } = await readSocial();
    const result = change(board);
    const body = { message: 'Update Ashen Vale public community data', content: Buffer.from(JSON.stringify(board)).toString('base64') };
    if (sha) body.sha = sha;
    const saved = await socialRequest('PUT', body);
    if (saved.ok) return { board, result };
    if (saved.status !== 409 && saved.status !== 422) throw new Error('social storage write failed');
  }
  throw new Error('social storage conflict');
}
function socialMemberId(session) { return crypto.createHash('sha256').update(`${session.user}:${session.serverId}:${session.characterId}`).digest('hex'); }
function safePublicAlias(value, fallback) { const alias = String(value || fallback || '').trim(); if (!/^[\p{L}\p{N}_ ]{2,16}$/u.test(alias)) throw new Error('별칭은 한글·영문·숫자 2~16자로 입력해 주세요.'); return alias; }
function locateSocialClan(board, memberId) { return Object.entries(board.clans).find(([, clan]) => clan.memberIds.includes(memberId)) || null; }
function socialClanView(board, clanId) {
  const clan = board.clans[clanId]; if (!clan) return null;
  if (clan.weekKey !== kstWeekKey()) { clan.weekKey = kstWeekKey(); clan.weeklyKills = 0; }
  return { id: clanId, name: clan.name, inviteCode: clan.code, memberCount: clan.memberIds.length, members: clan.memberIds.map(id => board.entries[id]).filter(Boolean).map(entry => ({ alias: entry.alias, classId: entry.classId, level: entry.level, score: entry.score })), weeklyKills: clan.weeklyKills, weeklyGoal: 100 };
}
async function readMember(user) {
  if (testMembers) return testMembers.get(user) || null;
  const response = await memberRequest(user);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('storage read failed');
  const file = await response.json();
  return JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
}
async function createMember(user, account) {
  if (testMembers) {
    if (testMembers.has(user)) return false;
    testMembers.set(user, account);
    return true;
  }
  const response = await memberRequest(user, 'PUT', {
    message: 'Register member',
    content: Buffer.from(JSON.stringify(account)).toString('base64')
  });
  if (response.status === 409 || response.status === 422) {
    if (await readMember(user)) return false;
  }
  if (!response.ok) throw new Error('storage write failed');
  return true;
}
async function editMember(user, change) {
  if (testMembers) {
    const account = testMembers.get(user);
    if (!account) throw new Error('회원 조회 실패');
    change(account);
    testMembers.set(user, account);
    return account;
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await memberRequest(user);
    if (!response.ok) throw new Error('회원 조회 실패');
    const file = await response.json();
    const account = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
    change(account);
    const saved = await memberRequest(user, 'PUT', {
      message: 'Save Ashen Vale character',
      sha: file.sha,
      content: Buffer.from(JSON.stringify(account)).toString('base64')
    });
    if (saved.ok) return account;
    if (saved.status !== 409 && saved.status !== 422) throw new Error('저장 실패');
  }
  throw new Error('저장 충돌');
}
function legacyWeaponVisualKey(item, classId, index = 0) { const existing = String(item?.visualKey || ''); if (existing.startsWith('bow_')) return existing; if (classId === 'archer' && item?.slot === 'weapon') { if (String(item?.id || '').startsWith('starter_')) return 'bow_ashwood'; let hash = 0; for (const char of String(item?.id || item?.name || index)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0; return ARCHER_BOWS[hash % ARCHER_BOWS.length].visualKey; } return existing || (String(item?.id || '').startsWith('starter_') ? String(item.id) : `${item?.slot || 'weapon'}_${item?.rarity || 'common'}`); }
function legacyWeaponName(item, classId, index = 0) { if (classId !== 'archer' || item?.slot !== 'weapon' || String(item?.visualKey || '').startsWith('bow_')) return String(item?.name || '낡은 장비').slice(0, 32); const key = legacyWeaponVisualKey(item, classId, index), bow = ARCHER_BOWS.find(entry => entry.visualKey === key), prefix = { common: '낡은', uncommon: '정교한', rare: '빛나는', epic: '영웅의', legendary: '전설의' }[item?.rarity] || '낡은'; return `${prefix} ${bow?.name || '솔바람 장궁'}`.slice(0, 32); }
function sanitizeRpg(value = {}) {
  const number = (key, min, max, fallback) => {
    const n = Number(value[key]);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  };
  const numberFrom = (raw, min, max, fallback) => {
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  };
  const today = kstDayKey(), week = kstWeekKey(), dailySource = value.daily || {}, weeklySource = value.weekly || {}, attendanceSource = value.attendance || {};
  const dailyIsCurrent = dailySource.dayKey === today, weeklyIsCurrent = weeklySource.weekKey === week, enhancementSource = value.enhancements || {}, enhancements = { gold: {}, stats: {} };
  let statPoints = Math.max(0, (characterLevel(Math.floor(number('xp', 0, 999999, DEFAULT_RPG.xp))) - 1) * 5);
  for (const key of RPG_UPGRADE_KEYS) { enhancements.gold[key] = Math.floor(numberFrom(enhancementSource.gold?.[key], 0, 50, 0)); const requested = Math.floor(numberFrom(enhancementSource.stats?.[key], 0, 100, 0)); enhancements.stats[key] = Math.min(requested, statPoints); statPoints -= enhancements.stats[key]; }
  const maxHp = 100 + enhancements.gold.maxHp * 10 + enhancements.stats.maxHp * 5;
  return {
    xp: Math.floor(number('xp', 0, 999999, DEFAULT_RPG.xp)),
    gold: Math.floor(number('gold', 0, 9999999, DEFAULT_RPG.gold)),
    cash: Math.floor(number('cash', 0, 99999999, DEFAULT_RPG.cash)),
    kills: Math.floor(number('kills', 0, 999999, DEFAULT_RPG.kills)),
    questStage: Math.floor(number('questStage', 0, 2, DEFAULT_RPG.questStage)),
    questKills: Math.floor(number('questKills', 0, 999, DEFAULT_RPG.questKills)),
    potions: Math.floor(number('potions', 0, 99, DEFAULT_RPG.potions)),
    x: number('x', 48, WORLD.width - 48, DEFAULT_RPG.x),
    y: number('y', 48, WORLD.height - 48, DEFAULT_RPG.y),
    hp: number('hp', 1, maxHp, Math.min(100, maxHp)),
    enhancements,
    items: Array.isArray(value.items) ? value.items.slice(0, 60).map((item, index) => ({
      id: String(item?.id || `gear_${index}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48),
      visualKey: legacyWeaponVisualKey(item, value.classId, index).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48),
      name: legacyWeaponName(item, value.classId, index),
      slot: ['weapon', 'armor', 'boots', 'ring'].includes(item?.slot) ? item.slot : 'weapon',
      rarity: GEAR_RARITY.includes(item?.rarity) ? item.rarity : 'common',
      atk: Math.floor(numberFrom(item?.atk, 0, 300, 0)),
      def: Math.floor(numberFrom(item?.def, 0, 300, 0)),
      enhance: Math.floor(numberFrom(item?.enhance, 0, 5, 0))
    })) : DEFAULT_RPG.items.map(item => ({ ...item })),
    equipment: Object.fromEntries(['weapon', 'armor', 'boots', 'ring'].map(slot => {
      const requested = String(value.equipment?.[slot] || '');
      const equipped = requested && Array.isArray(value.items) && value.items.some(item => item?.id === requested && item?.slot === slot) ? requested : '';
      const starter = !Array.isArray(value.items) ? DEFAULT_RPG.equipment[slot] : equipped;
      return [slot, starter];
    })),
    autoSettings: {
      range: ['close', 'balanced', 'safe'].includes(value.autoSettings?.range) ? value.autoSettings.range : DEFAULT_RPG.autoSettings.range,
      target: ['nearest', 'weakest'].includes(value.autoSettings?.target) ? value.autoSettings.target : DEFAULT_RPG.autoSettings.target,
      potionAt: [30, 45, 60].includes(Number(value.autoSettings?.potionAt)) ? Number(value.autoSettings.potionAt) : DEFAULT_RPG.autoSettings.potionAt,
      autoQuest: value.autoSettings?.autoQuest !== false
    },
    summonPity: {
      epic: Math.floor(numberFrom(value.summonPity?.epic, 0, GACHA_PITY.epic - 1, 0)),
      legendary: Math.floor(numberFrom(value.summonPity?.legendary, 0, GACHA_PITY.legendary - 1, 0))
    },
    summonHistory: Array.isArray(value.summonHistory) ? value.summonHistory.slice(0, 10).map(entry => ({
      at: Math.floor(numberFrom(entry?.at, 0, Number.MAX_SAFE_INTEGER, 0)),
      currency: ['gold', 'cash'].includes(entry?.currency) ? entry.currency : 'gold',
      count: [1, 10].includes(Number(entry?.count)) ? Number(entry.count) : 1,
      cost: Math.floor(numberFrom(entry?.cost, 0, 9999999, 0)),
      duplicateCount: Math.floor(numberFrom(entry?.duplicateCount, 0, 10, 0)),
      goldRefund: Math.floor(numberFrom(entry?.goldRefund, 0, 9999999, 0)),
      items: Array.isArray(entry?.items) ? entry.items.slice(0, 10).map(item => ({
        name: String(item?.name || '장비').slice(0, 32),
        slot: ['weapon', 'armor', 'boots', 'ring'].includes(item?.slot) ? item.slot : 'weapon',
        rarity: GEAR_RARITY.includes(item?.rarity) ? item.rarity : 'common',
        duplicate: item?.duplicate === true,
        goldRefund: Math.floor(numberFrom(item?.goldRefund, 0, 9999999, 0))
      })) : []
    })) : [],
    attendance: {
      lastDay: /^\d{4}-\d{2}-\d{2}$/.test(attendanceSource.lastDay || '') ? attendanceSource.lastDay : '',
      streak: Math.floor(numberFrom(attendanceSource.streak, 0, 7, 0))
    },
    daily: {
      dayKey: today,
      kills: dailyIsCurrent ? Math.floor(numberFrom(dailySource.kills, 0, 999999, 0)) : 0,
      attendanceClaimed: dailyIsCurrent && dailySource.attendanceClaimed === true,
      missionClaimed: dailyIsCurrent && dailySource.missionClaimed === true
    },
    weekly: {
      weekKey: week,
      kills: weeklyIsCurrent ? Math.floor(numberFrom(weeklySource.kills, 0, 999999, 0)) : 0,
      missionClaimed: weeklyIsCurrent && weeklySource.missionClaimed === true
    },
    zoneId: GAME_ZONES[value.zoneId] && characterLevel(Math.floor(number('xp', 0, 999999, DEFAULT_RPG.xp))) >= GAME_ZONES[value.zoneId].requiredLevel ? value.zoneId : 'forest',
    growth: { petLevel: Math.floor(numberFrom(value.growth?.petLevel, 1, 30, 1)), petExp: Math.floor(numberFrom(value.growth?.petExp, 0, 999999, 0)), bossKills: Math.floor(numberFrom(value.growth?.bossKills, 0, 999999, 0)), achievementClaims: Array.isArray(value.growth?.achievementClaims) ? value.growth.achievementClaims.filter(id => ['kills_10', 'kills_100', 'boss_1', 'level_10'].includes(id)).slice(0, 10) : [], mailClaims: Array.isArray(value.growth?.mailClaims) ? value.growth.mailClaims.filter(id => id === 'welcome_v1').slice(0, 10) : [] },
    bestiary: Object.fromEntries(['slime', 'forest_wolf', 'ash_goblin', 'ash_wolf', 'raider', 'reef_wraith', 'forest_guardian', 'ash_golem', 'sea_leviathan'].map(id => [id, Math.floor(numberFrom(value.bestiary?.[id], 0, 999999, 0))])),
    records: { bestScore: Math.floor(numberFrom(value.records?.bestScore, 0, 999999999, 0)), bestKills: Math.floor(numberFrom(value.records?.bestKills, 0, 999999, 0)), bestBosses: Math.floor(numberFrom(value.records?.bestBosses, 0, 999999, 0)) },
    partyEnabled: value.partyEnabled !== false,
    clanWeeklyClaimKey: /^\d{4}-\d{2}-\d{2}$/.test(value.clanWeeklyClaimKey || '') ? value.clanWeeklyClaimKey : '',
    classId: CLASSES.includes(value.classId) ? value.classId : 'warrior'
  };
}
function serverCharacters(record, serverId) {
  if (!record.rpgServers || typeof record.rpgServers !== 'object' || Array.isArray(record.rpgServers)) record.rpgServers = {};
  if (!Array.isArray(record.rpgServers[serverId])) record.rpgServers[serverId] = [];
  return record.rpgServers[serverId];
}
function publicCharacter(character) {
  const state = sanitizeRpg(character.state || {});
  let level = 1, xp = state.xp, need = 120;
  while (xp >= need && level < 60) { xp -= need; level++; need = 120 + (level - 1) * 45; }
  return { id: character.id, name: character.name, classId: character.classId, level, xp: state.xp, kills: state.kills };
}
function newCharacterState(classId) {
  const state = sanitizeRpg({ ...DEFAULT_RPG, classId });
  state.items[0].name = { warrior: '초보자의 철검', archer: '수습 사냥꾼의 단궁', mage: '견습 마도 지팡이', gunner: '해적의 플린트락' }[classId];
  return state;
}
function characterLevel(xp) {
  let level = 1, remaining = xp, needed = 120;
  while (remaining >= needed && level < 60) { remaining -= needed; level++; needed = 120 + (level - 1) * 45; }
  return level;
}
function generateGachaGear(level, forcedRarity = null, classId = 'warrior') {
  const slot = ['weapon', 'armor', 'boots', 'ring'][crypto.randomInt(4)];
  let rarity, bow = null;
  if (slot === 'weapon' && classId === 'archer') {
    const tiers = [['rare', 6500], ['epic', 2000], ['unique', 1000], ['legendary', 400], ['mythic', 90], ['immortal', 10]];
    const roll = crypto.randomInt(10000);
    let edge = 0;
    rarity = forcedRarity || 'rare';
    for (const [tier, weight] of tiers) { edge += weight; if (roll < edge) { rarity = forcedRarity || tier; break; } }
    const candidates = ARCHER_BOWS.filter(item => item.rarity === rarity);
    bow = candidates[crypto.randomInt(candidates.length)];
  } else {
    const roll = crypto.randomInt(10000);
    rarity = forcedRarity || (roll < 6000 ? 'common' : roll < 8500 ? 'uncommon' : roll < 9600 ? 'rare' : roll < 9950 ? 'epic' : 'legendary');
  }
  const multiplier = { common: 1, uncommon: 1.35, rare: 1.8, epic: 2.5, unique: 3.1, legendary: 4.1, mythic: 5.3, immortal: 7 }[rarity];
  const prefix = { common: '낡은', uncommon: '정교한', rare: '레어', epic: '에픽', unique: '유니크', legendary: '레전드리', mythic: '신화', immortal: '불멸' }[rarity];
  const gearName = bow?.name || GEAR_NAMES[slot][crypto.randomInt(GEAR_NAMES[slot].length)];
  const base = Math.max(1, Math.round(level * multiplier * (slot === 'weapon' ? 2.5 : 1)));
  return { id: 'gacha_' + crypto.randomUUID(), visualKey: bow?.visualKey || `${slot}_${rarity}`, name: `${prefix} ${gearName}`, slot, rarity, atk: slot === 'weapon' ? base : Math.floor(base * .28), def: slot === 'weapon' ? Math.floor(base * .22) : base, enhance: 0 };
}

app.get('/api/rpg/servers', async (req, res) => {
  const session = requestSession(req);
  if (!session) return res.sendStatus(401);
  try {
    const record = await readMember(session.user);
    if (!record) return res.sendStatus(404);
    const rosters = record.rpgServers && typeof record.rpgServers === 'object' ? record.rpgServers : {};
    res.json({ servers: GAME_SERVERS.map(server => ({ ...server, characterCount: Array.isArray(rosters[server.id]) ? Math.min(3, rosters[server.id].length) : 0 })), hasLegacySave: Boolean(record.rpg && !record.rpgMigrationComplete) });
  } catch {
    res.status(503).json({ error: '서버 목록을 불러오지 못했습니다.' });
  }
});
app.post('/api/rpg/server/select', async (req, res) => {
  const session = requestSession(req);
  if (!session) return res.sendStatus(401);
  const server = GAME_SERVERS.find(item => item.id === req.body?.serverId);
  if (!server) return res.status(400).json({ error: '서버를 선택해 주세요.' });
  try {
    const record = await editMember(session.user, member => {
      const characters = serverCharacters(member, server.id);
      if (!member.rpgMigrationComplete && member.rpg && characters.length === 0) {
        const state = sanitizeRpg(member.rpg);
        characters.push({ id: 'legacy_' + server.id, name: '기존 모험가', classId: state.classId, state });
        member.rpgMigrationComplete = true;
      }
    });
    session.serverId = server.id;
    session.characterId = null;
    res.json({ server, characters: serverCharacters(record, server.id).map(publicCharacter) });
  } catch {
    res.status(503).json({ error: '캐릭터 목록을 불러오지 못했습니다.' });
  }
});
app.post('/api/rpg/characters', async (req, res) => {
  const session = requestSession(req);
  if (!session) return res.sendStatus(401);
  if (!GAME_SERVERS.some(server => server.id === session.serverId)) return res.status(409).json({ error: '먼저 서버를 선택해 주세요.' });
  const name = String(req.body?.name || '').trim();
  const classId = String(req.body?.classId || '');
  if (!/^[\p{L}\p{N}_ ]{2,12}$/u.test(name) || !CLASSES.includes(classId)) return res.status(400).json({ error: '캐릭터 이름은 2~12자, 직업을 선택해 주세요.' });
  try {
    const record = await editMember(session.user, member => {
      const characters = serverCharacters(member, session.serverId);
      if (characters.length >= 3) throw new Error('슬롯이 가득 찼습니다.');
      if (characters.some(character => character.name.toLowerCase() === name.toLowerCase())) throw new Error('같은 이름의 캐릭터가 있습니다.');
      const state = newCharacterState(classId);
      characters.push({ id: crypto.randomUUID(), name, classId, state });
    });
    res.json({ characters: serverCharacters(record, session.serverId).map(publicCharacter) });
  } catch (error) {
    res.status(error.message === '슬롯이 가득 찼습니다.' ? 409 : error.message === '같은 이름의 캐릭터가 있습니다.' ? 409 : 503).json({ error: error.message || '캐릭터를 생성하지 못했습니다.' });
  }
});
app.post('/api/rpg/characters/select', async (req, res) => {
  const session = requestSession(req);
  if (!session) return res.sendStatus(401);
  if (!GAME_SERVERS.some(server => server.id === session.serverId)) return res.status(409).json({ error: '먼저 서버를 선택해 주세요.' });
  try {
    const record = await readMember(session.user);
    const character = serverCharacters(record, session.serverId).find(item => item.id === req.body?.characterId);
    if (!character) return res.status(404).json({ error: '캐릭터를 찾을 수 없습니다.' });
    session.characterId = character.id;
    res.json({ character: publicCharacter(character) });
  } catch {
    res.status(503).json({ error: '캐릭터를 선택하지 못했습니다.' });
  }
});
app.post('/api/rpg/characters/delete', async (req, res) => {
  const session = requestSession(req);
  if (!session) return res.sendStatus(401);
  if (!GAME_SERVERS.some(server => server.id === session.serverId)) return res.status(409).json({ error: '먼저 서버를 선택해 주세요.' });
  try {
    const record = await editMember(session.user, member => {
      const characters = serverCharacters(member, session.serverId);
      member.rpgServers[session.serverId] = characters.filter(item => item.id !== req.body?.characterId);
    });
    if (session.characterId === req.body?.characterId) session.characterId = null;
    res.json({ characters: serverCharacters(record, session.serverId).map(publicCharacter) });
  } catch {
    res.status(503).json({ error: '캐릭터를 삭제하지 못했습니다.' });
  }
});

app.post('/api/signup', rateLimit, async (req, res) => {
  try {
    const user = String(req.body?.user || '').toLowerCase();
    const password = String(req.body?.password || '');
    if (!/^[a-z0-9_]{4,20}$/.test(user) || password.length < 8 || password.length > 128) {
      return res.status(400).json({ error: '아이디 4~20자 영문/숫자, 비밀번호 8~128자' });
    }
    if (await readMember(user)) return res.status(409).json({ error: '이미 사용 중인 아이디' });
    const salt = crypto.randomBytes(16).toString('hex');
    const account = { salt, hash: hash(password, salt), createdAt: new Date().toISOString() };
    if (!await createMember(user, account)) return res.status(409).json({ error: '이미 사용 중인 아이디' });
    issueSession(res, user);
  } catch {
    res.status(503).json({ error: '회원 저장소 연결 실패' });
  }
});
app.post('/api/login', rateLimit, async (req, res) => {
  try {
    const user = String(req.body?.user || '').toLowerCase();
    const password = String(req.body?.password || '');
    const account = /^[a-z0-9_]{4,20}$/.test(user) ? await readMember(user) : null;
    if (!account || account.banned || password.length > 128 || !crypto.timingSafeEqual(Buffer.from(account.hash, 'hex'), Buffer.from(hash(password, account.salt), 'hex'))) {
      return res.status(401).json({ error: '아이디 또는 비밀번호 확인' });
    }
    issueSession(res, user);
  } catch {
    res.status(503).json({ error: '회원 저장소 연결 실패' });
  }
});
app.get('/api/rpg', async (req, res) => {
  const session = requestSession(req);
  if (!session) return res.sendStatus(401);
  if (!session.serverId || !session.characterId) return res.status(409).json({ error: '서버와 캐릭터를 선택해 주세요.' });
  try {
    const account = await readMember(session.user);
    if (!account) return res.sendStatus(404);
    const character = serverCharacters(account, session.serverId).find(item => item.id === session.characterId);
    if (!character) return res.status(404).json({ error: '선택한 캐릭터를 찾을 수 없습니다.' });
    res.json(sanitizeRpg(character.state || DEFAULT_RPG));
  } catch {
    res.status(503).json({ error: '캐릭터 저장소를 불러오지 못했습니다' });
  }
});
app.post('/api/rpg/save', async (req, res) => {
  const session = requestSession(req);
  if (!session) return res.sendStatus(401);
  if (!session.serverId || !session.characterId) return res.status(409).json({ error: '서버와 캐릭터를 선택해 주세요.' });
  try {
    const rpg = sanitizeRpg(req.body || {});
    const account = await editMember(session.user, record => {
      const character = serverCharacters(record, session.serverId).find(item => item.id === session.characterId);
      if (!character) throw new Error('선택한 캐릭터를 찾을 수 없습니다.');
      character.state = { ...rpg, classId: character.classId };
    });
    const character = serverCharacters(account, session.serverId).find(item => item.id === session.characterId);
    res.json({ ok: true, rpg: sanitizeRpg(character.state) });
  } catch {
    res.status(503).json({ error: '캐릭터 저장 실패 · 잠시 후 다시 시도하세요' });
  }
});
app.post('/api/rpg/zone/travel', async (req, res) => {
  const session = requestSession(req);
  if (!session) return res.sendStatus(401);
  if (!session.serverId || !session.characterId) return res.status(409).json({ error: '서버와 캐릭터를 선택해 주세요.' });
  const zoneId = String(req.body?.zoneId || ''), zone = GAME_ZONES[zoneId];
  if (!zone) return res.status(400).json({ error: '지역 정보를 확인해 주세요.' });
  try {
    let outcome;
    const account = await editMember(session.user, record => {
      const character = serverCharacters(record, session.serverId).find(item => item.id === session.characterId);
      if (!character) throw new Error('CHARACTER_NOT_FOUND');
      const state = sanitizeRpg(character.state || DEFAULT_RPG), level = characterLevel(state.xp);
      if (level < zone.requiredLevel) throw new Error('ZONE_LOCKED');
      state.zoneId = zoneId;
      state.x = 1300;
      state.y = 1070;
      state.hp = Math.max(65, state.hp);
      character.state = { ...state, classId: character.classId };
      outcome = { zoneId, zone, state: sanitizeRpg(character.state) };
    });
    if (!account || !outcome) return res.status(503).json({ error: '지역 이동을 저장하지 못했습니다.' });
    res.json(outcome);
  } catch (error) {
    if (error.message === 'CHARACTER_NOT_FOUND') return res.status(404).json({ error: '선택한 캐릭터를 찾을 수 없습니다.' });
    if (error.message === 'ZONE_LOCKED') return res.status(409).json({ error: `이 지역은 레벨 ${zone.requiredLevel}부터 입장할 수 있습니다.` });
    res.status(503).json({ error: '지역 이동을 저장하지 못했습니다.' });
  }
});
app.get('/api/rpg/announcement', async (req, res) => {
  try { const { board } = await readSocial(); res.json({ announcement: board.announcement, isAdmin: isRpgAdmin(requestSession(req)) }); }
  catch { res.status(503).json({ error: '운영 공지를 불러오지 못했습니다.' }); }
});
app.get('/api/admin/overview', async (req, res) => {
  const session = requestSession(req); if (!session) return res.sendStatus(401);
  if (!isRpgAdmin(session)) return res.sendStatus(403);
  try {
    const { board } = await readSocial();
    res.json({ uptimeSeconds: Math.floor(process.uptime()), activeSessions: sessions.size, optedInRanks: Object.values(board.entries).filter(entry => entry.rankingOptIn).length, clans: Object.keys(board.clans).length, updatedAt: Date.now() });
  } catch { res.status(503).json({ error: '운영 현황을 불러오지 못했습니다.' }); }
});
app.post('/api/admin/announcement', rateLimit, async (req, res) => {
  const session = requestSession(req); if (!session) return res.sendStatus(401);
  if (!isRpgAdmin(session)) return res.sendStatus(403);
  const title = String(req.body?.title || '').trim(), body = String(req.body?.body || '').trim();
  if (title.length < 2 || title.length > 48 || body.length < 2 || body.length > 500) return res.status(400).json({ error: '제목은 2~48자, 내용은 2~500자로 입력해 주세요.' });
  try {
    const { board } = await updateSocial(current => { current.announcement = { title, body, updatedAt: Date.now() }; current.adminAudit.unshift({ action: 'announcement_publish', at: Date.now() }); current.adminAudit = current.adminAudit.slice(0, 20); });
    res.json({ ok: true, announcement: board.announcement });
  } catch { res.status(503).json({ error: '공지를 저장하지 못했습니다.' }); }
});
app.delete('/api/admin/announcement', rateLimit, async (req, res) => {
  const session = requestSession(req); if (!session) return res.sendStatus(401);
  if (!isRpgAdmin(session)) return res.sendStatus(403);
  try {
    await updateSocial(board => { board.announcement = null; board.adminAudit.unshift({ action: 'announcement_clear', at: Date.now() }); board.adminAudit = board.adminAudit.slice(0, 20); });
    res.json({ ok: true });
  } catch { res.status(503).json({ error: '공지를 내리지 못했습니다.' }); }
});
app.get('/api/rpg/social/rankings', async (req, res) => {
  try {
    let { board } = await readSocial();
    const session = requestSession(req);
    if (session?.serverId && session?.characterId) {
      const account = await readMember(session.user), character = serverCharacters(account || {}, session.serverId).find(item => item.id === session.characterId), id = socialMemberId(session), own = board.entries[id];
      if (character && own?.rankingOptIn) {
        const state = sanitizeRpg(character.state || DEFAULT_RPG);
        await updateSocial(current => { const entry = current.entries[id]; if (entry?.rankingOptIn) Object.assign(entry, { classId: character.classId, level: characterLevel(state.xp), score: state.records.bestScore, kills: state.kills }); });
        ({ board } = await readSocial());
      }
    }
    const rankings = Object.values(board.entries).filter(entry => entry.rankingOptIn).sort((a, b) => b.score - a.score || b.level - a.level || a.alias.localeCompare(b.alias)).slice(0, 50);
    let mine = { optedIn: false, rank: 0 };
    if (session?.serverId && session?.characterId) {
      const id = socialMemberId(session), own = board.entries[id];
      mine = { optedIn: own?.rankingOptIn === true, rank: own?.rankingOptIn ? rankings.findIndex(entry => entry === own) + 1 : 0 };
    }
    res.json({ rankings, mine });
  } catch { res.status(503).json({ error: '공개 랭킹을 불러오지 못했습니다.' }); }
});
app.post('/api/rpg/social/ranking', rateLimit, async (req, res) => {
  const session = requestSession(req);
  if (!session) return res.sendStatus(401);
  if (!session.serverId || !session.characterId) return res.status(409).json({ error: '캐릭터를 선택해 주세요.' });
  if (typeof req.body?.optIn !== 'boolean') return res.status(400).json({ error: '공개 설정을 확인해 주세요.' });
  try {
    const account = await readMember(session.user), character = serverCharacters(account || {}, session.serverId).find(item => item.id === session.characterId);
    if (!character) return res.status(404).json({ error: '캐릭터를 찾을 수 없습니다.' });
    const state = sanitizeRpg(character.state || DEFAULT_RPG), id = socialMemberId(session), alias = safePublicAlias(req.body?.alias, character.name);
    await updateSocial(board => {
      const existing = board.entries[id] || {};
      if (req.body.optIn) board.entries[id] = { ...existing, alias, classId: character.classId, level: characterLevel(state.xp), score: state.records.bestScore, kills: state.kills, rankingOptIn: true };
      else if (locateSocialClan(board, id)) board.entries[id] = { ...existing, alias, rankingOptIn: false };
      else delete board.entries[id];
    });
    res.json({ ok: true, optedIn: req.body.optIn });
  } catch (error) { res.status(503).json({ error: error.message || '랭킹 설정을 저장하지 못했습니다.' }); }
});
app.get('/api/rpg/social/clan', async (req, res) => {
  const session = requestSession(req);
  if (!session) return res.sendStatus(401);
  if (!session.serverId || !session.characterId) return res.status(409).json({ error: '캐릭터를 선택해 주세요.' });
  try {
    const { board } = await readSocial(), id = socialMemberId(session), found = locateSocialClan(board, id);
    const account = await readMember(session.user), character = serverCharacters(account || {}, session.serverId).find(item => item.id === session.characterId);
    const state = sanitizeRpg(character?.state || DEFAULT_RPG), week = kstWeekKey();
    res.json({ clan: found ? socialClanView(board, found[0]) : null, weeklyClaimed: state.clanWeeklyClaimKey === week });
  } catch { res.status(503).json({ error: '클랜 정보를 불러오지 못했습니다.' }); }
});
app.post('/api/rpg/social/clan', rateLimit, async (req, res) => {
  const session = requestSession(req);
  if (!session) return res.sendStatus(401);
  if (!session.serverId || !session.characterId) return res.status(409).json({ error: '캐릭터를 선택해 주세요.' });
  const action = String(req.body?.action || '');
  if (!['create', 'join', 'leave'].includes(action)) return res.status(400).json({ error: '클랜 작업을 확인해 주세요.' });
  try {
    const account = await readMember(session.user), character = serverCharacters(account || {}, session.serverId).find(item => item.id === session.characterId);
    if (!character) return res.status(404).json({ error: '캐릭터를 찾을 수 없습니다.' });
    const state = sanitizeRpg(character.state || DEFAULT_RPG), id = socialMemberId(session), alias = safePublicAlias(req.body?.alias, character.name);
    const clanName = String(req.body?.name || '').trim();
    if (action === 'create' && !/^[\p{L}\p{N}_ ]{2,16}$/u.test(clanName)) return res.status(400).json({ error: '클랜명은 한글·영문·숫자 2~16자로 입력해 주세요.' });
    const inviteCode = String(req.body?.code || '').trim().toUpperCase();
    const { board } = await updateSocial(current => {
      let existing = current.entries[id] || {};
      current.entries[id] = { ...existing, alias, classId: character.classId, level: characterLevel(state.xp), score: state.records.bestScore, kills: state.kills, rankingOptIn: existing.rankingOptIn === true };
      const previous = locateSocialClan(current, id);
      if (previous) { current.clans[previous[0]].memberIds = current.clans[previous[0]].memberIds.filter(member => member !== id); if (!current.clans[previous[0]].memberIds.length) delete current.clans[previous[0]]; }
      if (action === 'create') {
        if (Object.keys(current.clans).length >= 2000) throw new Error('현재 새 클랜을 만들 수 없습니다.');
        const clanId = crypto.randomBytes(8).toString('hex');
        let code; do { code = crypto.randomBytes(3).toString('hex').toUpperCase(); } while (Object.values(current.clans).some(clan => clan.code === code));
        current.clans[clanId] = { name: clanName, code, memberIds: [id], weekKey: kstWeekKey(), weeklyKills: 0 };
      } else if (action === 'join') {
        const found = Object.entries(current.clans).find(([, clan]) => clan.code === inviteCode);
        if (!found) throw new Error('초대 코드를 찾을 수 없습니다.');
        if (found[1].memberIds.length >= 30) throw new Error('클랜 정원이 가득 찼습니다.');
        found[1].memberIds.push(id);
      }
    });
    const found = locateSocialClan(board, id);
    res.json({ ok: true, clan: found ? socialClanView(board, found[0]) : null });
  } catch (error) { res.status(400).json({ error: error.message || '클랜 정보를 저장하지 못했습니다.' }); }
});
app.post('/api/rpg/social/clan/contribute', rateLimit, async (req, res) => {
  const session = requestSession(req);
  if (!session) return res.sendStatus(401);
  if (!session.serverId || !session.characterId) return res.status(409).json({ error: '캐릭터를 선택해 주세요.' });
  const count = Math.floor(Math.max(0, Math.min(20, Number(req.body?.count) || 0)));
  if (!count) return res.status(400).json({ error: '기여 처치 수를 확인해 주세요.' });
  try {
    let outcome = { hasClan: false, weeklyKills: 0, weeklyGoal: 100 };
    await updateSocial(board => {
      const found = locateSocialClan(board, socialMemberId(session)); if (!found) return;
      const clan = found[1]; if (clan.weekKey !== kstWeekKey()) { clan.weekKey = kstWeekKey(); clan.weeklyKills = 0; }
      clan.weeklyKills = Math.min(999999, clan.weeklyKills + count);
      outcome = { hasClan: true, weeklyKills: clan.weeklyKills, weeklyGoal: 100 };
    });
    res.json(outcome);
  } catch { res.status(503).json({ error: '클랜 사냥 기록을 저장하지 못했습니다.' }); }
});
app.post('/api/rpg/social/clan/claim', rateLimit, async (req, res) => {
  const session = requestSession(req);
  if (!session) return res.sendStatus(401);
  if (!session.serverId || !session.characterId) return res.status(409).json({ error: '캐릭터를 선택해 주세요.' });
  try {
    const { board } = await readSocial(), found = locateSocialClan(board, socialMemberId(session));
    if (!found) return res.status(409).json({ error: '클랜에 가입해야 보상을 받을 수 있습니다.' });
    const clan = found[1]; if (clan.weekKey !== kstWeekKey() || clan.weeklyKills < 100) return res.status(409).json({ error: '클랜 주간 처치 목표 100회를 달성해야 합니다.' });
    let rewardState;
    await editMember(session.user, record => {
      const character = serverCharacters(record, session.serverId).find(item => item.id === session.characterId);
      if (!character) throw new Error('CHARACTER_NOT_FOUND');
      const state = sanitizeRpg(character.state || DEFAULT_RPG), week = kstWeekKey();
      if (state.clanWeeklyClaimKey === week) throw new Error('CLAN_REWARD_CLAIMED');
      state.clanWeeklyClaimKey = week; state.gold = Math.min(9999999, state.gold + 500); state.cash = Math.min(99999999, state.cash + 20);
      character.state = { ...state, classId: character.classId }; rewardState = sanitizeRpg(character.state);
    });
    res.json({ ok: true, reward: { gold: 500, cash: 20 }, state: rewardState });
  } catch (error) {
    if (error.message === 'CLAN_REWARD_CLAIMED') return res.status(409).json({ error: '이번 주 클랜 보상은 이미 받았습니다.' });
    if (error.message === 'CHARACTER_NOT_FOUND') return res.status(404).json({ error: '캐릭터를 찾을 수 없습니다.' });
    res.status(503).json({ error: '클랜 보상을 지급하지 못했습니다.' });
  }
});
app.post('/api/rpg/activity/claim', async (req, res) => {
  const session = requestSession(req);
  if (!session) return res.sendStatus(401);
  if (!session.serverId || !session.characterId) return res.status(409).json({ error: '서버와 캐릭터를 선택해 주세요.' });
  const type = req.body?.type;
  if (!['attendance', 'daily', 'weekly'].includes(type)) return res.status(400).json({ error: '보상 종류를 확인해 주세요.' });
  try {
    let outcome;
    const account = await editMember(session.user, record => {
      const character = serverCharacters(record, session.serverId).find(item => item.id === session.characterId);
      if (!character) throw new Error('CHARACTER_NOT_FOUND');
      const state = sanitizeRpg(character.state || DEFAULT_RPG), today = kstDayKey(), week = kstWeekKey();
      const reward = { gold: 0, cash: 0 }, detail = {};
      if (type === 'attendance') {
        if (state.daily.attendanceClaimed) throw new Error('ATTENDANCE_CLAIMED');
        const streak = state.attendance.lastDay === previousDayKey(today) ? (state.attendance.streak >= 7 ? 1 : state.attendance.streak + 1) : 1;
        state.attendance = { lastDay: today, streak };
        state.daily.attendanceClaimed = true;
        reward.gold = streak === 7 ? 700 : 100;
        reward.cash = streak === 7 ? 100 : 20;
        detail.streak = streak;
      } else if (type === 'daily') {
        if (state.daily.missionClaimed) throw new Error('DAILY_CLAIMED');
        if (state.daily.kills < 20) throw new Error('DAILY_NOT_READY');
        state.daily.missionClaimed = true;
        reward.gold = 600;
        reward.cash = 25;
        detail.kills = state.daily.kills;
      } else {
        if (state.weekly.missionClaimed) throw new Error('WEEKLY_CLAIMED');
        if (state.weekly.kills < 100) throw new Error('WEEKLY_NOT_READY');
        state.weekly.missionClaimed = true;
        reward.gold = 2500;
        reward.cash = 125;
        detail.kills = state.weekly.kills;
      }
      state.gold = Math.min(9999999, state.gold + reward.gold);
      state.cash = Math.min(99999999, state.cash + reward.cash);
      character.state = { ...state, classId: character.classId };
      outcome = { ok: true, type, reward, detail, state: sanitizeRpg(character.state) };
    });
    if (!account || !outcome) return res.status(503).json({ error: '보상을 저장하지 못했습니다.' });
    res.json(outcome);
  } catch (error) {
    if (error.message === 'CHARACTER_NOT_FOUND') return res.status(404).json({ error: '선택한 캐릭터를 찾을 수 없습니다.' });
    if (error.message === 'ATTENDANCE_CLAIMED') return res.status(409).json({ error: '오늘 출석 보상을 이미 받았습니다.' });
    if (error.message === 'DAILY_CLAIMED') return res.status(409).json({ error: '오늘 사냥 의뢰 보상을 이미 받았습니다.' });
    if (error.message === 'DAILY_NOT_READY') return res.status(409).json({ error: '오늘 몬스터 20마리를 처치하면 보상을 받을 수 있습니다.' });
    if (error.message === 'WEEKLY_CLAIMED') return res.status(409).json({ error: '이번 주 사냥 보상을 이미 받았습니다.' });
    if (error.message === 'WEEKLY_NOT_READY') return res.status(409).json({ error: '이번 주 몬스터 100마리를 처치하면 보상을 받을 수 있습니다.' });
    res.status(503).json({ error: '보상을 저장하지 못했습니다.' });
  }
});
app.post('/api/rpg/gacha', async (req, res) => {
  const session = requestSession(req);
  if (!session) return res.sendStatus(401);
  if (!session.serverId || !session.characterId) return res.status(409).json({ error: '서버와 캐릭터를 선택해 주세요.' });
  const currency = req.body?.currency;
  const count = Number(req.body?.count);
  const price = GACHA_PRICES[currency]?.[count];
  if (!price) return res.status(400).json({ error: '뽑기 횟수와 재화를 확인해 주세요.' });
  try {
    let outcome;
    const account = await editMember(session.user, record => {
      const character = serverCharacters(record, session.serverId).find(item => item.id === session.characterId);
      if (!character) throw new Error('CHARACTER_NOT_FOUND');
      const state = sanitizeRpg(character.state || DEFAULT_RPG);
      if (state[currency] < price) throw new Error('INSUFFICIENT_CURRENCY');
      state[currency] -= price;
      const level = characterLevel(state.xp);
      const results = [], newItems = [];
      let rarePlus = false, duplicateCount = 0, goldRefund = 0;
      for (let index = 0; index < count; index++) {
        let forcedRarity = null;
        if (state.summonPity.legendary >= GACHA_PITY.legendary - 1) forcedRarity = 'legendary';
        else if (state.summonPity.epic >= GACHA_PITY.epic - 1) forcedRarity = 'epic';
        else if (count === 10 && index === count - 1 && !rarePlus) forcedRarity = 'rare';
        const gear = generateGachaGear(level, forcedRarity, character.classId);
        const isEpicPlus = GEAR_RARITY.indexOf(gear.rarity) >= GEAR_RARITY.indexOf('epic');
        if (['legendary', 'mythic', 'immortal'].includes(gear.rarity)) state.summonPity.legendary = 0;
        else state.summonPity.legendary = Math.min(GACHA_PITY.legendary - 1, state.summonPity.legendary + 1);
        if (isEpicPlus) state.summonPity.epic = 0;
        else state.summonPity.epic = Math.min(GACHA_PITY.epic - 1, state.summonPity.epic + 1);
        rarePlus ||= GEAR_RARITY.indexOf(gear.rarity) >= GEAR_RARITY.indexOf('rare');
        const duplicate = state.items.some(item => item.slot === gear.slot && item.name === gear.name) || newItems.some(item => item.slot === gear.slot && item.name === gear.name);
        if (duplicate) {
          gear.duplicate = true;
          gear.goldRefund = DUPLICATE_GOLD[gear.rarity];
          duplicateCount++;
          goldRefund += gear.goldRefund;
        } else newItems.push(gear);
        results.push(gear);
      }
      if (state.items.length + newItems.length > 60) throw new Error('INVENTORY_FULL');
      state.items.push(...newItems);
      state.gold = Math.min(9999999, state.gold + goldRefund);
      const history = { at: Date.now(), currency, count, cost: price, duplicateCount, goldRefund, items: results.map(item => ({ name: item.name, slot: item.slot, rarity: item.rarity, duplicate: item.duplicate === true, goldRefund: item.goldRefund || 0 })) };
      state.summonHistory = [history, ...state.summonHistory].slice(0, 10);
      character.state = { ...state, classId: character.classId };
      outcome = { ok: true, currency, cost: price, count, items: results, duplicateCount, goldRefund, pity: state.summonPity, state: sanitizeRpg(character.state) };
    });
    if (!account || !outcome) return res.status(503).json({ error: '뽑기 결과를 저장하지 못했습니다.' });
    res.json(outcome);
  } catch (error) {
    if (error.message === 'INSUFFICIENT_CURRENCY') return res.status(409).json({ error: currency === 'gold' ? '골드가 부족합니다.' : '캐시가 부족합니다.' });
    if (error.message === 'INVENTORY_FULL') return res.status(409).json({ error: '장비 가방 공간이 부족합니다. 중복 장비는 골드로 보상됩니다.' });
    if (error.message === 'CHARACTER_NOT_FOUND') return res.status(404).json({ error: '캐릭터를 찾을 수 없습니다.' });
    res.status(503).json({ error: '뽑기 결과를 저장하지 못했습니다.' });
  }
});

function raidRoomView(raid) {
  return { code: raid.code, zoneId: raid.zoneId, bossName: raid.bossName, hp: raid.hp, maxHp: raid.maxHp, cleared: raid.cleared, members: [...raid.members.values()].map(member => ({ name: member.name, classId: member.classId, level: member.level, damage: member.damage })) };
}
async function loadRaidCharacter(session) {
  const account = await readMember(session.user);
  const character = serverCharacters(account || {}, session.serverId).find(item => item.id === session.characterId);
  if (!character) throw new Error('캐릭터 정보를 찾을 수 없습니다.');
  const state = sanitizeRpg(character.state || DEFAULT_RPG);
  const level = characterLevel(state.xp).level;
  const equipment = Object.keys(state.equipment).map(slot => state.items.find(item => item.id === state.equipment[slot])).filter(Boolean);
  const attack = level * 2 + equipment.reduce((sum, item) => sum + item.atk + item.enhance * 2, 0) + Math.max(0, state.growth.petLevel - 1) + (state.enhancements.gold.attack + state.enhancements.stats.attack) * 2;
  const enhancements = state.enhancements, critChance = Math.min(.75, .05 + (enhancements.gold.critChance + enhancements.stats.critChance) * .005), critDamage = 1.5 + enhancements.gold.critDamage * .03 + enhancements.stats.critDamage * .02;
  return { state, name: String(character.name || '모험가').slice(0, 12), classId: character.classId, level, attack, critChance, critDamage };
}
function removeRaidMember(socket) {
  const code = socket.data.raidCode;
  if (!code) return;
  const raid = liveRaids.get(code);
  socket.data.raidCode = null;
  socket.leave(code);
  if (!raid) return;
  raid.members.delete(socket.id);
  if (!raid.members.size) { clearTimeout(raid.expiry); liveRaids.delete(code); }
  else io.to(code).emit('raid:state', raidRoomView(raid));
}
async function enterRaid(socket, code, ack) {
  const session = socket.data.session;
  try {
    const character = await loadRaidCharacter(session), target = liveRaids.get(String(code || '').toUpperCase());
    if (!target) throw new Error('레이드 방을 찾을 수 없습니다.');
    if (target.serverId !== session.serverId) throw new Error('같은 서버의 캐릭터만 참가할 수 있습니다.');
    if (target.zoneId !== character.state.zoneId) throw new Error('현재 지역이 같은 캐릭터만 참가할 수 있습니다.');
    if (target.cleared) throw new Error('이미 토벌이 끝난 레이드입니다.');
    if (target.members.size >= 4 && !target.members.has(socket.id)) throw new Error('레이드는 최대 4명까지 참가할 수 있습니다.');
    removeRaidMember(socket);
    const member = { name: character.name, classId: character.classId, level: character.level, attack: character.attack, critChance: character.critChance, critDamage: character.critDamage, damage: 0, lastAttack: 0, session: { user: session.user, serverId: session.serverId, characterId: session.characterId } };
    target.members.set(socket.id, member); socket.data.raidCode = target.code; await socket.join(target.code);
    const view = raidRoomView(target); ack?.({ ok: true, raid: view }); io.to(target.code).emit('raid:state', view);
  } catch (error) { ack?.({ ok: false, error: error.message || '레이드 참가에 실패했습니다.' }); }
}
io.use((socket, next) => {
  const session = identity(String(socket.handshake.auth?.token || ''));
  if (!session?.serverId || !session?.characterId) return next(new Error('로그인 후 캐릭터를 선택해 주세요.'));
  socket.data.session = session;
  next();
});
io.on('connection', socket => {
  socket.emit('raid:ready', { ok: true });
  socket.on('raid:create', async (_payload, ack) => {
    try {
      const session = socket.data.session, character = await loadRaidCharacter(session), boss = { forest: ['숲의 수호자', 12000], ashlands: ['잿빛 거신', 26000], moonharbor: ['심해 레비아탄', 52000] }[character.state.zoneId] || ['숲의 수호자', 12000];
      removeRaidMember(socket);
      let code; do { code = crypto.randomBytes(3).toString('hex').toUpperCase(); } while (liveRaids.has(code));
      const raid = { code, serverId: session.serverId, zoneId: character.state.zoneId, bossName: boss[0], maxHp: boss[1], hp: boss[1], cleared: false, members: new Map(), expiry: setTimeout(() => { io.to(code).emit('raid:closed', { reason: '레이드 방이 만료되었습니다.' }); liveRaids.delete(code); }, 60 * 60 * 1000) };
      liveRaids.set(code, raid);
      await enterRaid(socket, code, ack);
    } catch (error) { ack?.({ ok: false, error: error.message || '레이드 방 생성에 실패했습니다.' }); }
  });
  socket.on('raid:join', (payload, ack) => enterRaid(socket, payload?.code, ack));
  socket.on('raid:leave', ack => { removeRaidMember(socket); ack?.({ ok: true }); socket.emit('raid:state', null); });
  socket.on('raid:attack', ack => {
    const raid = liveRaids.get(socket.data.raidCode), member = raid?.members.get(socket.id);
    if (!raid || !member || raid.cleared) return ack?.({ ok: false, error: '참가 중인 레이드가 없습니다.' });
    const cooldown = { warrior: 440, archer: 560, mage: 720, gunner: 300 }[member.classId] || 500, now = Date.now();
    if (now - member.lastAttack < cooldown) return ack?.({ ok: false, cooldown: true });
    member.lastAttack = now;
    const multiplier = { warrior: 4.1, archer: 2.9, mage: 3.8, gunner: 2.55 }[member.classId] || 3;
    const baseDamage = Math.max(1, Math.round(member.attack * multiplier + member.level * 2)), critical = crypto.randomInt(10000) < member.critChance * 10000, damage = Math.round(baseDamage * (critical ? member.critDamage : 1));
    member.damage += damage; raid.hp = Math.max(0, raid.hp - damage);
    if (raid.hp <= 0) {
      raid.cleared = true;
      io.to(raid.code).emit('raid:clear', { raid: raidRoomView(raid), reward: { xp: 420, gold: 260 }, participants: [...raid.members.entries()].filter(([, active]) => active.damage > 0).map(([id]) => id), bossType: { forest: 'forest_guardian', ashlands: 'ash_golem', moonharbor: 'sea_leviathan' }[raid.zoneId] });
    } else io.to(raid.code).emit('raid:state', { ...raidRoomView(raid), lastHit: { name: member.name, damage } });
    ack?.({ ok: true, damage });
  });
  socket.on('disconnect', () => removeRaidMember(socket));
});
server.listen(port, '0.0.0.0');
