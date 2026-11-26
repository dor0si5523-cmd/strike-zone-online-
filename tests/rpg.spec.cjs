const {test,expect}=require('@playwright/test');

async function createAccount(page){
  const user='rpg_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,5);
  await page.goto('/');
  await page.locator('#switch-auth').click();
  await page.locator('#uid').fill(user);
  await page.locator('#pw').fill('test-only-pass-123');
  await page.locator('#auth-form button[type=submit]').click();
  await expect(page.locator('#game')).toBeVisible();
  await expect(page.locator('#portal')).toBeHidden();
  await expect(page.locator('#quest-title')).toHaveText('숲길 정찰');
  return user;
}

test('desktop login, RPG movement, attack and persistent character save',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const user=await createAccount(page);
  const before=await page.evaluate(()=>window.__rpgInspect());
  await page.evaluate(()=>document.activeElement?.blur());
  await page.keyboard.down('KeyD');await page.waitForTimeout(550);await page.keyboard.up('KeyD');
  const moved=await page.evaluate(()=>window.__rpgInspect());
  expect(moved.x-before.x).toBeGreaterThan(35);
  await page.keyboard.press('Space');
  expect(await page.evaluate(()=>window.__rpgInspect().attackActive)).toBeTruthy();
  const saved=await page.evaluate(async user=>{
    const token=sessionStorage.getItem('ashenValeToken'),s=window.__rpgInspect();
    const body={xp:47,gold:135,kills:2,questStage:1,questKills:2,potions:2,x:s.x,y:s.y,hp:83};
    const write=await fetch('/api/rpg/save',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});
    const login=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user,password:'test-only-pass-123'})});
    const relogged=await login.json();
    const read=await fetch('/api/rpg',{headers:{Authorization:'Bearer '+relogged.token}});
    return {write:write.status,login:login.status,state:await read.json()};
  },user);
  expect(saved.write).toBe(200);expect(saved.login).toBe(200);expect(saved.state.xp).toBe(47);expect(saved.state.gold).toBe(135);expect(saved.state.questStage).toBe(1);expect(saved.state.hp).toBe(83);
  expect(errors).toEqual([]);
});

test('mobile browser shows touch controls and RPG HUD',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await createAccount(page);
  await expect(page.locator('#stick')).toBeVisible();
  await expect(page.locator('#attack')).toBeVisible();
  await expect(page.locator('#potion-use')).toBeVisible();
  expect(await page.evaluate(()=>window.__rpgInspect().playing)).toBeTruthy();
  expect(errors).toEqual([]);
  await context.close();
});
