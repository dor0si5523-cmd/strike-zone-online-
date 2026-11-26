const express = require('express');
const crypto = require('node:crypto');
const http = require('node:http');

const app = express();
const server = http.createServer(app);
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
const CLASSES = ['warrior', 'archer', 'mage', 'gunner'];
const STARTER_ITEMS = [
  { id: 'starter_blade', name: '여행자의 철검', slot: 'weapon', rarity: 'common', atk: 4, def: 0, enhance: 0 },
  { id: 'starter_coat', name: '숲지기 가죽옷', slot: 'armor', rarity: 'common', atk: 0, def: 3, enhance: 0 },
  { id: 'starter_boots', name: '길잡이 장화', slot: 'boots', rarity: 'common', atk: 0, def: 1, enhance: 0 },
  { id: 'starter_ring', name: '낡은 호박 반지', slot: 'ring', rarity: 'common', atk: 1, def: 0, enhance: 0 }
];
const DEFAULT_RPG = Object.freeze({ xp: 0, gold: 40, cash: 300, kills: 0, questStage: 0, questKills: 0, potions: 3, x: 1300, y: 1070, hp: 100, items: STARTER_ITEMS, equipment: { weapon: 'starter_blade', armor: 'starter_coat', boots: 'starter_boots', ring: 'starter_ring' }, classId: 'warrior' });
const GACHA_PRICES = { gold: { 1: 500, 10: 4500 }, cash: { 1: 100, 10: 900 } };
const GEAR_RARITY = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
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
function sanitizeRpg(value = {}) {
  const number = (key, min, max, fallback) => {
    const n = Number(value[key]);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  };
  const numberFrom = (raw, min, max, fallback) => {
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  };
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
    hp: number('hp', 1, 100, DEFAULT_RPG.hp),
    items: Array.isArray(value.items) ? value.items.slice(0, 60).map((item, index) => ({
      id: String(item?.id || `gear_${index}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48),
      name: String(item?.name || '낡은 장비').slice(0, 32),
      slot: ['weapon', 'armor', 'boots', 'ring'].includes(item?.slot) ? item.slot : 'weapon',
      rarity: ['common', 'uncommon', 'rare', 'epic', 'legendary'].includes(item?.rarity) ? item.rarity : 'common',
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
function generateGachaGear(level, forcedRarity = null) {
  const roll = crypto.randomInt(10000);
  const rarity = forcedRarity || (roll < 6000 ? 'common' : roll < 8500 ? 'uncommon' : roll < 9600 ? 'rare' : roll < 9950 ? 'epic' : 'legendary');
  const multiplier = { common: 1, uncommon: 1.35, rare: 1.8, epic: 2.5, legendary: 3.5 }[rarity];
  const slot = ['weapon', 'armor', 'boots', 'ring'][crypto.randomInt(4)];
  const prefix = { common: '낡은', uncommon: '정교한', rare: '빛나는', epic: '영웅의', legendary: '전설의' }[rarity];
  const base = Math.max(1, Math.round(level * multiplier * (slot === 'weapon' ? 2.5 : 1)));
  return {
    id: 'gacha_' + crypto.randomUUID(),
    name: `${prefix} ${GEAR_NAMES[slot][crypto.randomInt(GEAR_NAMES[slot].length)]}`,
    slot, rarity,
    atk: slot === 'weapon' ? base : Math.floor(base * .28),
    def: slot === 'weapon' ? Math.floor(base * .22) : base,
    enhance: 0
  };
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
      if (state.items.length + count > 60) throw new Error('INVENTORY_FULL');
      if (state[currency] < price) throw new Error('INSUFFICIENT_CURRENCY');
      state[currency] -= price;
      const level = characterLevel(state.xp);
      const results = Array.from({ length: count }, () => generateGachaGear(level));
      if (count === 10 && !results.some(item => GEAR_RARITY.indexOf(item.rarity) >= GEAR_RARITY.indexOf('rare'))) results[9] = generateGachaGear(level, 'rare');
      state.items.push(...results);
      character.state = { ...state, classId: character.classId };
      outcome = { ok: true, currency, cost: price, count, items: results, state: sanitizeRpg(character.state) };
    });
    if (!account || !outcome) return res.status(503).json({ error: '뽑기 결과를 저장하지 못했습니다.' });
    res.json(outcome);
  } catch (error) {
    if (error.message === 'INSUFFICIENT_CURRENCY') return res.status(409).json({ error: currency === 'gold' ? '골드가 부족합니다.' : '캐시가 부족합니다.' });
    if (error.message === 'INVENTORY_FULL') return res.status(409).json({ error: '장비 가방이 가득 찼습니다. 먼저 장비를 정리해 주세요.' });
    if (error.message === 'CHARACTER_NOT_FOUND') return res.status(404).json({ error: '캐릭터를 찾을 수 없습니다.' });
    res.status(503).json({ error: '뽑기 결과를 저장하지 못했습니다.' });
  }
});

server.listen(port, '0.0.0.0');
