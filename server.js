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
const STARTER_ITEMS = [
  { id: 'starter_blade', name: '여행자의 철검', slot: 'weapon', rarity: 'common', atk: 4, def: 0, enhance: 0 },
  { id: 'starter_coat', name: '숲지기 가죽옷', slot: 'armor', rarity: 'common', atk: 0, def: 3, enhance: 0 },
  { id: 'starter_boots', name: '길잡이 장화', slot: 'boots', rarity: 'common', atk: 0, def: 1, enhance: 0 },
  { id: 'starter_ring', name: '낡은 호박 반지', slot: 'ring', rarity: 'common', atk: 1, def: 0, enhance: 0 }
];
const DEFAULT_RPG = Object.freeze({ xp: 0, gold: 40, kills: 0, questStage: 0, questKills: 0, potions: 3, x: 1300, y: 1070, hp: 100, items: STARTER_ITEMS, equipment: { weapon: 'starter_blade', armor: 'starter_coat', boots: 'starter_boots', ring: 'starter_ring' } });
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
  return session.user;
}
function requestUser(req) { return identity(req.headers.authorization?.replace(/^Bearer /, '')); }
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
    }))
  };
}

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
  const user = requestUser(req);
  if (!user) return res.sendStatus(401);
  try {
    const account = await readMember(user);
    if (!account) return res.sendStatus(404);
    res.json(sanitizeRpg(account.rpg || DEFAULT_RPG));
  } catch {
    res.status(503).json({ error: '캐릭터 저장소를 불러오지 못했습니다' });
  }
});
app.post('/api/rpg/save', async (req, res) => {
  const user = requestUser(req);
  if (!user) return res.sendStatus(401);
  try {
    const rpg = sanitizeRpg(req.body || {});
    const account = await editMember(user, record => { record.rpg = rpg; });
    res.json({ ok: true, rpg: sanitizeRpg(account.rpg) });
  } catch {
    res.status(503).json({ error: '캐릭터 저장 실패 · 잠시 후 다시 시도하세요' });
  }
});

server.listen(port, '0.0.0.0');
