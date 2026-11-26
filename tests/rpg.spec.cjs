const {test,expect}=require('@playwright/test');

async function createAccount(page,classId='warrior'){
  const user='rpg_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,5);
  await page.goto('/');
  await page.locator('#switch-auth').click();
  await page.locator('#uid').fill(user);
  await page.locator('#pw').fill('test-only-pass-123');
  await page.locator('#auth-form button[type=submit]').click();
  await expect(page.locator('#realm-select')).toBeVisible({timeout:45000});
  await page.locator('[data-server="dawn"]').click();
  await expect(page.locator('#character-select')).toBeVisible();
  await page.locator('[data-create]').first().click();
  await page.locator('#character-name').fill('모험가');
  await page.locator(`[data-class="${classId}"]`).click();
  await page.locator('#create-submit').click();
  await expect(page.locator('#character-select')).toBeVisible();
  await page.locator('[data-enter]').click();
  await expect(page.locator('#game')).toBeVisible({timeout:20000});
  await expect(page.locator('#portal')).toBeHidden();
  await expect(page.locator('#quest-title')).toHaveText('숲길 정찰');
  return user;
}

test('development shortcut opens character creation without login or realm selection',async({page})=>{
  const blocked=[];
  page.on('request',request=>{if(['/api/login','/api/signup','/api/rpg/servers','/api/rpg/server/select'].some(path=>request.url().endsWith(path)))blocked.push(request.url())});
  await page.goto('/?dev=1');
  await expect(page.locator('#character-name')).toBeVisible();
  await expect(page.locator('#auth-form')).toHaveCount(0);
  await expect(page.locator('#realm-select')).toHaveCount(0);
  await page.locator('#character-name').fill('개발궁수');
  await page.locator('[data-class="archer"]').click();
  await page.locator('#create-submit').click();
  await expect(page.locator('#game')).toBeVisible();
  expect(await page.evaluate(()=>window.__rpgInspect().classId)).toBe('archer');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('ashenValeDevCharacter')).character.name)).toBe('개발궁수');
  expect(blocked).toEqual([]);
});

test('desktop login starts automatic combat and persists character save',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const user=await createAccount(page);
  const before=await page.evaluate(()=>window.__rpgInspect());expect(before.classId).toBe('warrior');
  await expect.poll(async()=>{const state=await page.evaluate(()=>window.__rpgInspect());return state.autoHunt&&(state.x!==before.x||state.y!==before.y)},{timeout:20000}).toBeTruthy();
  await expect.poll(async()=>page.evaluate(()=>window.__rpgInspect().attackActive),{timeout:20000}).toBeTruthy();
  const moved=await page.evaluate(()=>window.__rpgInspect());
  const saved=await page.evaluate(async user=>{
    const token=sessionStorage.getItem('ashenValeToken'),s=window.__rpgInspect();
    const item={id:'test_epic_blade',name:'시험 영웅검',slot:'weapon',rarity:'epic',atk:29,def:2,enhance:3};
    const body={xp:47,gold:135,kills:2,questStage:1,questKills:2,potions:2,x:s.x,y:s.y,hp:83,classId:s.classId,items:[...s.items,item],equipment:{...s.equipment,weapon:item.id}};
    const write=await fetch('/api/rpg/save',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});
    const login=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user,password:'test-only-pass-123'})});
    const relogged=await login.json();
    const headers={'Content-Type':'application/json',Authorization:'Bearer '+relogged.token};
    const realm=await fetch('/api/rpg/server/select',{method:'POST',headers,body:JSON.stringify({serverId:'dawn'})});
    const selected=await fetch('/api/rpg/characters/select',{method:'POST',headers,body:JSON.stringify({characterId:s.characterId})});
    const read=await fetch('/api/rpg',{headers:{Authorization:'Bearer '+relogged.token}});
    return {write:write.status,login:login.status,realm:realm.status,selected:selected.status,state:await read.json()};
  },user);
  expect(saved.write).toBe(200);expect(saved.login).toBe(200);expect(saved.realm).toBe(200);expect(saved.selected).toBe(200);expect(saved.state.xp).toBe(47);expect(saved.state.gold).toBe(135);expect(saved.state.questStage).toBe(1);expect(saved.state.hp).toBe(83);expect(saved.state.equipment.weapon).toBe('test_epic_blade');expect(saved.state.items.some(item=>item.rarity==='epic'&&item.atk===29)).toBeTruthy();
  expect(errors).toEqual([]);
});

test('mobile character creation selects gunner with automatic combat controls only',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await createAccount(page,'gunner');
  expect(await page.evaluate(()=>window.__rpgInspect().classId)).toBe('gunner');
  await expect(page.locator('#stick')).toHaveCount(0);
  await expect(page.locator('#attack')).toHaveCount(0);
  await expect(page.locator('#potion-use')).toHaveCount(0);
  await expect(page.locator('#auto-hunt-mobile')).toHaveCount(0);
  expect(await page.evaluate(()=>window.__rpgInspect().autoHunt)).toBeTruthy();
  expect(await page.evaluate(()=>window.__rpgInspect().playing)).toBeTruthy();
  expect(errors).toEqual([]);
  await context.close();
});

test('automatic combat roams and kills without gear farming; gacha remains available',async({page})=>{
  const user=await createAccount(page,'archer');
  const before=await page.evaluate(()=>window.__rpgInspect());
  expect(before.autoHunt).toBeTruthy();
  await expect.poll(async()=>{const state=await page.evaluate(()=>window.__rpgInspect());return state.attackEffects.some(effect=>effect.kind==='archer')},{timeout:35000}).toBeTruthy();
  await expect.poll(async()=>{const state=await page.evaluate(()=>window.__rpgInspect());return state.kills>0&&state.x!==before.x||state.kills>0&&state.y!==before.y},{timeout:35000}).toBeTruthy();
  await page.locator('#bag-open').click();
  await expect(page.locator('#equipment-slots .gear-slot')).toHaveCount(4);
  await expect(page.locator('#combat-power')).not.toBeEmpty();
  await page.locator('#bag-close').click();
  expect(await page.evaluate(()=>window.__rpgInspect().items.length)).toBe(4);
});

test('server roster has three character slots with class choice and deletion',async({page})=>{
  const user=await createAccount(page);
  await page.locator('#logout').click();
  await page.locator('#uid').fill(user);await page.locator('#pw').fill('test-only-pass-123');
  await page.locator('#auth-form button[type=submit]').click();
  await expect(page.locator('#realm-select')).toBeVisible({timeout:20000});
  await page.locator('[data-server="dawn"]').click();
  await expect(page.locator('#character-select')).toBeVisible();
  await expect(page.locator('.character-slot')).toHaveCount(3);
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('.character-slot:nth-child(1) [data-delete]').click();
  await expect(page.locator('[data-create]')).toHaveCount(3);
  await page.locator('[data-create]').first().click();
  await expect(page.locator('.class-choice')).toHaveCount(4);
  for(const id of ['warrior','archer','mage','gunner'])await expect(page.locator(`#class-${id}`)).toBeVisible();
  await page.locator('#character-name').fill('바람궁수');
  await page.locator('#class-archer').click();
  await page.locator('#create-submit').click();
  await page.locator('[data-create]').first().click();
  await page.locator('#character-name').fill('별마도사');
  await page.locator('#class-mage').click();
  await page.locator('#create-submit').click();
  await page.locator('[data-create]').first().click();
  await page.locator('#character-name').fill('바다거너');
  await page.locator('#class-gunner').click();
  await page.locator('#create-submit').click();
  await expect(page.locator('.character-slot')).toHaveCount(3);
  await expect(page.locator('.character-slot .class-label')).toHaveText(['궁수','마법사','해적 (거너)']);
  await expect(page.locator('[data-create]')).toHaveCount(0);
});

test('gold and free cash gacha save gear and guarantee rare gear on ten pulls',async({page})=>{
  const user=await createAccount(page);
  const seeded=await page.evaluate(async()=>{
    const token=sessionStorage.getItem('ashenValeToken'),state=window.__rpgInspect();
    const response=await fetch('/api/rpg/save',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({...state,gold:10000,cash:1000})});
    return response.status;
  });
  expect(seeded).toBe(200);
  await page.locator('#logout').click();
  await page.locator('#uid').fill(user);await page.locator('#pw').fill('test-only-pass-123');
  await page.locator('#auth-form button[type=submit]').click();
  await expect(page.locator('#realm-select')).toBeVisible({timeout:45000});
  await page.locator('[data-server="dawn"]').click();
  await page.locator('[data-enter]').click();
  await expect(page.locator('#game')).toBeVisible({timeout:20000});
  await page.locator('#bag-open').click();
  await page.locator('.gacha-card summary').click();
  await page.locator('[data-gacha="cash:10"]').click();
  await expect(page.locator('.gacha-result')).toHaveCount(10);
  let state=await page.evaluate(()=>window.__rpgInspect());
  expect(state.cash).toBe(100);
  expect(state.items).toHaveLength(14);
  expect(state.items.slice(-10).some(item=>['rare','epic','legendary'].includes(item.rarity))).toBeTruthy();
  await page.locator('[data-gacha="gold:1"]').click();
  state=await page.evaluate(()=>window.__rpgInspect());
  expect(state.gold).toBe(9500);
  expect(state.cash).toBe(100);
  expect(state.items).toHaveLength(15);
});
