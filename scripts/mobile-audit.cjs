const { chromium } = require('@playwright/test');

const baseURL = process.env.SZ_MOBILE_URL || 'http://localhost:3000';
const report = { errors: [], consoleErrors: [], failedRequests: [] };
let page;

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  page = context.pages()[0] || await context.newPage();
  if (page.url().startsWith('http://localhost:3000')) await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
  page.on('requestfailed', request => report.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  await page.goto(baseURL, { waitUntil: 'networkidle', timeout: 60000 });
  report.device = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    screen: { width: screen.width, height: screen.height, orientation: screen.orientation?.type },
    webgl: (() => { const gl = document.querySelector('canvas')?.getContext('webgl2') || document.querySelector('canvas')?.getContext('webgl'); return gl ? gl.getParameter(gl.RENDERER) : 'unavailable'; })(),
    renderBuffer: { width: document.querySelector('canvas')?.width, height: document.querySelector('canvas')?.height },
    quality: JSON.parse(localStorage.getItem('szSettingsV28') || '{}').quality || 'default'
  }));

  await page.locator('#switchAuth').click();
  const user = `mq${Date.now().toString().slice(-12)}`;
  await page.locator('#uid').fill(user);
  await page.locator('#pw').fill('local-test-only-1234');
  await page.locator('#authForm button[type=submit]').click();
  await page.locator('.channel').first().waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('.channel').first().click();
  await page.locator('#create').click();
  await page.locator('#roomMode').selectOption('practice');
  await page.locator('#roomForm').evaluate(form => form.requestSubmit());
  await page.locator('#startGame').click();
  await page.waitForFunction(() => window.__szInspect?.().players.length === 8, null, { timeout: 30000 });
  await page.waitForFunction(() => window.__szInspect?.().models.filter(model => model.rigged).length >= 7, null, { timeout: 60000 });

  const initial = await page.evaluate(() => window.__szInspect());
  report.teamCounts = [initial.players.filter(p => p.team === 0).length, initial.players.filter(p => p.team === 1).length];
  report.models = initial.models.map(model => ({ key: model.key, height: model.height, width: model.width, ground: model.ground, rigged: model.rigged }));
  report.controls = await page.evaluate(() => ['stick', 'fire', 'reload', 'jump'].map(id => {
    const element = document.getElementById(id);
    const rect = element?.getBoundingClientRect();
    return { id, visible: !!rect && rect.width > 0 && rect.height > 0, rect: rect && { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, pointerEvents: element && getComputedStyle(element).pointerEvents };
  }));
  report.community = await page.locator('#communityToggle').evaluate(element => {
    const a = element.getBoundingClientRect(), b = document.getElementById('v4Aim').getBoundingClientRect();
    return { rect: { x: a.x, y: a.y, width: a.width, height: a.height }, overlapsAim: a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top };
  });

  const touch = await page.context().newCDPSession(page);
  const stick = report.controls.find(control => control.id === 'stick').rect;
  const start = await page.evaluate(() => window.__szInspect());
  const me = start.players.find(p => p.key === start.id);
  const sx = stick.x + stick.width / 2, sy = stick.y + stick.height / 2;
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy, id: 1 }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx + 25, y: sy, id: 1 }] });
  await page.waitForTimeout(1200);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const moved = await page.evaluate(() => window.__szInspect().players.find(p => p.key === window.__szInspect().id));
  report.touchMovement = Math.hypot(moved.x - me.x, moved.z - me.z);
  const ammoBefore = moved.ammo;
  const fire = report.controls.find(control => control.id === 'fire').rect;
  const fx = fire.x + fire.width / 2, fy = fire.y + fire.height / 2;
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fx, y: fy, id: 2 }] });
  await page.waitForTimeout(650);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const fired = await page.evaluate(() => window.__szInspect().players.find(p => p.key === window.__szInspect().id));
  report.touchShots = ammoBefore - fired.ammo;
  const reload = report.controls.find(control => control.id === 'reload').rect;
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: reload.x + reload.width / 2, y: reload.y + reload.height / 2, id: 3 }] });
  await page.waitForTimeout(180);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(1800);
  report.reloadAmmo = (await page.evaluate(() => window.__szInspect().players.find(p => p.key === window.__szInspect().id))).ammo;

  const fpsFrames = await page.evaluate(async () => {
    let frames = 0, start;
    return await new Promise(resolve => {
      const frame = time => { start ??= time; frames++; if (time - start >= 5000) resolve(frames / ((time - start) / 1000)); else requestAnimationFrame(frame); };
      requestAnimationFrame(frame);
    });
  });
  const performance = await page.context().newCDPSession(page);
  await performance.send('Performance.enable');
  const metrics = await performance.send('Performance.getMetrics');
  report.fps = Math.round(fpsFrames);
  report.performanceMetrics = Object.fromEntries(metrics.metrics.filter(m => ['JSHeapUsedSize', 'JSHeapTotalSize', 'Nodes', 'Documents', 'LayoutCount', 'TaskDuration'].includes(m.name)).map(m => [m.name, m.value]));
  const final = await page.evaluate(() => window.__szInspect());
  report.botDisplacement = initial.players.filter(p => p.key.startsWith('bot:')).map(p => {
    const q = final.players.find(next => next.key === p.key);
    return { key: p.key, distance: Math.hypot(q.x - p.x, q.z - p.z) };
  });
  await page.waitForTimeout(70000);
  const combat = await page.evaluate(() => window.__szInspect());
  report.aiCombat = combat.players.filter(p => p.key.startsWith('bot:')).map(({ key, hp, dead, k, d, x, z }) => {
    const origin = initial.players.find(p => p.key === key);
    return { key, hp, dead: !!dead, kills: k, deaths: d, distance: Math.hypot(x - origin.x, z - origin.z), x, z };
  });
  report.aiDamageObserved = report.aiCombat.some(p => p.hp < 100 || p.kills > 0 || p.deaths > 0);
  await page.screenshot({ path: 'test-results/mobile-practice.png', fullPage: false });
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  if (report.errors.length || report.teamCounts.some(n => n !== 4) || report.models.some(m => m.height < 0.8 || m.height > 2.1 || m.width > 1.6) || report.touchMovement < 0.5 || report.touchShots < 1 || report.reloadAmmo < 30) process.exitCode = 1;
})().catch(async error => { console.error(error); if (page) console.error('PAGE:', (await page.locator('body').innerText().catch(() => '')).slice(0, 2500)); console.error('REPORT:', JSON.stringify(report, null, 2)); process.exitCode = 1; });
