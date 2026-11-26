const {test,expect}=require('@playwright/test');

async function createAccount(page){
  const user='rpg_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,5);
  await page.goto('/');
  await page.locator('#switch-auth').click();
  await page.locator('#uid').fill(user);
  await page.locator('#pw').fill('test-only-pass-123');
  await page.locator('#auth-form button[type=submit]').click();
  await expect(page.locator('#game')).toBeVisible({timeout:20000});
  await expect(page.locator('#portal')).toBeHidden();
  await expect(page.locator('#quest-title')).toHaveText('숲길 정찰');
  return user;
}

test('desktop login, RPG movement, attack and persistent character save',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const user=await createAccount(page);
  const before=await page.evaluate(()=>window.__rpgInspect());
  await page.evaluate(()=>document.activeElement?.blur());
  await page.keyboard.down('KeyD');await page.waitForTimeout(900);await page.keyboard.up('KeyD');
  const moved=await page.evaluate(()=>window.__rpgInspect());
  expect(moved.x-before.x).toBeGreaterThan(35);
  await page.keyboard.press('Space');
  expect(await page.evaluate(()=>window.__rpgInspect().attackActive)).toBeTruthy();
  const saved=await page.evaluate(async user=>{
    const token=sessionStorage.getItem('ashenValeToken'),s=window.__rpgInspect();
    const item={id:'test_epic_blade',name:'시험 영웅검',slot:'weapon',rarity:'epic',atk:29,def:2,enhance:3};
    const body={xp:47,gold:135,kills:2,questStage:1,questKills:2,potions:2,x:s.x,y:s.y,hp:83,items:[...s.items,item],equipment:{...s.equipment,weapon:item.id}};
    const write=await fetch('/api/rpg/save',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});
    const login=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user,password:'test-only-pass-123'})});
    const relogged=await login.json();
    const read=await fetch('/api/rpg',{headers:{Authorization:'Bearer '+relogged.token}});
    return {write:write.status,login:login.status,state:await read.json()};
  },user);
  expect(saved.write).toBe(200);expect(saved.login).toBe(200);expect(saved.state.xp).toBe(47);expect(saved.state.gold).toBe(135);expect(saved.state.questStage).toBe(1);expect(saved.state.hp).toBe(83);expect(saved.state.equipment.weapon).toBe('test_epic_blade');expect(saved.state.items.some(item=>item.rarity==='epic'&&item.atk===29)).toBeTruthy();
  expect(errors).toEqual([]);
});

test('mobile browser shows touch controls and RPG HUD',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await createAccount(page);
  await expect(page.locator('#stick')).toBeVisible();
  await expect(page.locator('#attack')).toBeVisible();
  await expect(page.locator('#potion-use')).toBeVisible();
  await expect(page.locator('#auto-hunt-mobile')).toBeVisible();
  await page.locator('#auto-hunt-mobile').click();
  expect(await page.evaluate(()=>window.__rpgInspect().autoHunt)).toBeTruthy();
  expect(await page.evaluate(()=>window.__rpgInspect().playing)).toBeTruthy();
  expect(errors).toEqual([]);
  await context.close();
});

test('auto hunt roams to monsters and kills them; gear panel shows equipment slots',async({page})=>{
  const user=await createAccount(page);
  const before=await page.evaluate(()=>window.__rpgInspect());
  await page.locator('#auto-hunt').click();
  await expect(page.locator('#auto-hunt')).toHaveAttribute('aria-pressed','true');
  await expect.poll(async()=>{const state=await page.evaluate(()=>window.__rpgInspect());return state.kills>0&&state.x!==before.x||state.kills>0&&state.y!==before.y},{timeout:35000}).toBeTruthy();
  await page.locator('#bag-open').click();
  await expect(page.locator('#equipment-slots .gear-slot')).toHaveCount(4);
  await expect(page.locator('#combat-power')).not.toBeEmpty();
  await page.locator('#bag-close').click();
  expect(await page.evaluate(()=>window.__rpgInspect().items.length)).toBeGreaterThanOrEqual(4);
});
