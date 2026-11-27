const {test,expect}=require('@playwright/test');

async function createAccount(page,classId='warrior'){
  const user='rpg_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,5);
  await page.goto('/?account=1');
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

async function clickGameTab(page,selector){
  if(await page.locator('#menu-dropdown').isHidden())await page.locator('#menu-toggle').click();
  await page.locator(selector).click();
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
  await clickGameTab(page,'#bag-open');
  await expect(page.locator('#equipment-slots .gear-slot')).toHaveCount(5);
  await expect(page.locator('#combat-power')).not.toBeEmpty();
  await page.locator('#bag-close').click();
  expect(await page.evaluate(()=>window.__rpgInspect().items.length)).toBe(4);
});

test('archer arrow modes spend focus and automatic skills can be toggled',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await createAccount(page,'archer');
  await clickGameTab(page,'#bag-open');
  await expect(page.locator('#archer-arrow-setting')).toBeVisible();
  await expect(page.locator('#archer-skills-setting')).toBeVisible();
  const initial=await page.evaluate(()=>window.__rpgInspect().archerFocus);
  await page.locator('#archer-arrow').selectOption('explosive');
  await page.locator('#archer-auto-skills').uncheck();
  expect(await page.evaluate(()=>window.__rpgInspect().autoSettings)).toMatchObject({arrowType:'explosive',autoSkills:false});
  await page.locator('#bag-close').click();
  await expect.poll(async()=>page.evaluate(()=>window.__rpgInspect().attackEffects.some(effect=>effect.kind==='archer'&&effect.arrowType==='explosive')),{timeout:45000}).toBeTruthy();
  await expect.poll(async()=>page.evaluate(()=>window.__rpgInspect().archerFocus),{timeout:10000}).toBeLessThan(initial);
  expect(errors).toEqual([]);
});

test('mobile archer combat settings fit the portrait viewport',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const page=await context.newPage();
  await page.goto('/?dev=1');
  await page.locator('#character-name').fill('모바일궁수');
  await page.locator('[data-class="archer"]').click();
  await page.locator('#create-submit').click();
  await expect(page.locator('#game')).toBeVisible();
  await clickGameTab(page,'#bag-open');
  await expect(page.locator('#archer-arrow-setting')).toBeVisible();
  await expect(page.locator('#archer-cost-note')).toBeVisible();
  await expect(page.locator('#archer-skills-setting')).toBeVisible();
  const layout=await page.evaluate(()=>{
    const panel=document.querySelector('.gear-panel').getBoundingClientRect();
    const ids=['archer-arrow-setting','archer-cost-note','archer-skills-setting','archer-focus-wrap'];
    return {width:innerWidth,panel:{left:panel.left,right:panel.right},items:ids.map(id=>{const r=document.getElementById(id).getBoundingClientRect();return{id,left:r.left,right:r.right,top:r.top,bottom:r.bottom,hidden:document.getElementById(id).hidden}})};
  });
  for(const item of layout.items){expect(item.hidden).toBeFalsy();expect(item.left).toBeGreaterThanOrEqual(layout.panel.left-1);expect(item.right).toBeLessThanOrEqual(layout.panel.right+1)}
  for(let i=0;i<layout.items.length;i++)for(let j=i+1;j<layout.items.length;j++){const a=layout.items[i],b=layout.items[j],overlapX=a.left<b.right&&b.left<a.right,overlapY=a.top<b.bottom&&b.top<a.bottom;expect(overlapX&&overlapY,`${a.id} overlaps ${b.id}`).toBeFalsy()}
  await page.screenshot({path:'test-results/archer-mobile-portrait.png'});
  await context.close();
});

test('equipped epic bow bonuses and bow image persist across reconnect',async({page})=>{
  const user=await createAccount(page,'archer');
  const original=await page.evaluate(()=>({state:window.__rpgInspect(),token:sessionStorage.getItem('ashenValeToken')}));
  await page.evaluate(()=>document.querySelector('#logout').click());
  await page.locator('#uid').fill(user);await page.locator('#pw').fill('test-only-pass-123');
  await page.locator('#auth-form button[type=submit]').click();
  await expect(page.locator('#realm-select')).toBeVisible({timeout:20000});
  await page.locator('[data-server="dawn"]').click();
  await expect(page.locator('#character-select')).toBeVisible();
  const characterId=await page.locator('[data-enter]').first().getAttribute('data-enter');
  const saved=await page.evaluate(async({characterId,state})=>{
    const token=sessionStorage.getItem('ashenValeToken'),headers={'Content-Type':'application/json',Authorization:'Bearer '+token};
    const select=await fetch('/api/rpg/characters/select',{method:'POST',headers,body:JSON.stringify({characterId})});
    if(!select.ok)return select.status;
    const bow={id:'review_epic_bow',visualKey:'bow_epic_1',name:'검수용 별빛 장궁',slot:'weapon',rarity:'epic',atk:20,def:0,enhance:0};
    const response=await fetch('/api/rpg/save',{method:'POST',headers,body:JSON.stringify({...state,items:[...state.items,bow],equipment:{...state.equipment,weapon:bow.id},classId:'archer'})});
    return response.status;
  },{characterId,state:original.state});
  expect(saved).toBe(200);
  await page.locator('[data-enter]').click();
  await expect(page.locator('#game')).toBeVisible();
  const state=await page.evaluate(()=>window.__rpgInspect());
  expect(state.classId).toBe('archer');
  expect(state.equipment.weapon).toBe('review_epic_bow');
  expect(state.combatStats.attackSpeed).toBeCloseTo(0.025,3);
  expect(state.combatStats.critChance).toBeCloseTo(0.068,3);
  await clickGameTab(page,'#bag-open');
  const row=page.locator('.loot-item').filter({hasText:'검수용 별빛 장궁'});
  await expect(row).toBeVisible();
  await expect.poll(()=>row.locator('img').evaluate(image=>image.naturalWidth>0),{timeout:10000}).toBeTruthy();
});

test('all archer bow catalog images exist and carry combat bonuses',async({page})=>{
  await page.goto('/?dev=1');
  const bows=await page.evaluate(async()=>{
    const {ARCHER_BOW_CATALOG}=await import('/equipment-visuals.js?catalog-review');
    return Promise.all(ARCHER_BOW_CATALOG.map(async bow=>({key:bow.key,rarity:bow.rarity,shotColor:bow.shotColor,bonuses:bow.combatBonuses,imageOk:(await fetch(bow.src,{method:'HEAD'})).ok})));
  });
  expect(bows).toHaveLength(30);
  expect(new Set(bows.map(bow=>bow.key)).size).toBe(30);
  expect(bows.every(bow=>bow.imageOk&&bow.shotColor&&bow.bonuses&&bow.bonuses.critChance>0)).toBeTruthy();
});

test('server roster has three character slots with class choice and deletion',async({page})=>{
  const user=await createAccount(page);
  await clickGameTab(page,'#logout');
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
  await clickGameTab(page,'#logout');
  await page.locator('#uid').fill(user);await page.locator('#pw').fill('test-only-pass-123');
  await page.locator('#auth-form button[type=submit]').click();
  await expect(page.locator('#realm-select')).toBeVisible({timeout:45000});
  await page.locator('[data-server="dawn"]').click();
  await page.locator('[data-enter]').click();
  await expect(page.locator('#game')).toBeVisible({timeout:20000});
  await clickGameTab(page,'#shop-open');
  await page.locator('[data-gacha="cash:10:weapon"]').click();
  await expect(page.locator('.gacha-result')).toHaveCount(10);
  let state=await page.evaluate(()=>window.__rpgInspect());
  expect(state.cash).toBe(100);
  const tenPull=state.summonHistory[0];
  expect(tenPull.count).toBe(10);
  expect(state.items).toHaveLength(4+10-tenPull.duplicateCount);
  expect(state.gold).toBeGreaterThanOrEqual(10000+tenPull.goldRefund);
  expect(state.gold).toBeLessThan(10100+tenPull.goldRefund);
  expect(tenPull.items.some(item=>['rare','epic','unique','legendary','mythic','immortal'].includes(item.rarity))).toBeTruthy();
  const goldBeforeSingle=state.gold;
  await page.locator('[data-gacha="gold:1:weapon"]').click();
  state=await page.evaluate(()=>window.__rpgInspect());
  const singlePull=state.summonHistory[0];
  expect(state.gold).toBeGreaterThanOrEqual(goldBeforeSingle-500+singlePull.goldRefund);
  expect(state.gold).toBeLessThan(goldBeforeSingle-500+singlePull.goldRefund+100);
  expect(state.cash).toBe(100);
  expect(state.items).toHaveLength(4+10-tenPull.duplicateCount+(singlePull.duplicateCount?0:1));
});

test('side-scrolling battlefield keeps the hero grounded while auto-hunting',async({page})=>{
  await page.goto('/?dev=1');
  await page.locator('#character-name').fill('횡스크롤검증');
  await page.locator('[data-class="archer"]').click();
  await page.locator('#create-submit').click();
  await expect(page.locator('#game')).toBeVisible();
  const before=await page.evaluate(()=>window.__rpgInspect());
  await page.screenshot({path:'test-results/side-scroll-map.png'});
  expect(before.viewMode).toBe('side-scroll');
  expect(Math.abs(before.y-before.groundY)).toBeLessThan(2);
  await expect.poll(async()=>{const state=await page.evaluate(()=>window.__rpgInspect());return Math.abs(state.x-before.x)>35&&Math.abs(state.y-state.groundY)<2;},{timeout:20000}).toBeTruthy();
  await expect.poll(async()=>page.evaluate(()=>window.__rpgInspect().attackEffects.some(effect=>effect.kind==='archer')),{timeout:30000}).toBeTruthy();
});

test('server security headers and logout revoke the bearer session',async({page})=>{
  const response=await page.goto('/?dev=1');
  const headers=await response.allHeaders();
  expect(headers['x-powered-by']).toBeUndefined();
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['permissions-policy']).toContain('camera=()');
  const user=await createAccount(page,'warrior');
  const result=await page.evaluate(async()=>{const token=sessionStorage.getItem('ashenValeToken'),headers={Authorization:'Bearer '+token};const before=await fetch('/api/rpg',{headers});const logout=await fetch('/api/logout',{method:'POST',headers});const after=await fetch('/api/rpg',{headers});return{before:before.status,logout:logout.status,after:after.status}});
  expect(result).toEqual({before:200,logout:204,after:401});
});

test('gear and character upgrades are processed by server APIs',async({page})=>{
  await createAccount(page,'warrior');
  const result=await page.evaluate(async()=>{const token=sessionStorage.getItem('ashenValeToken'),headers={'Content-Type':'application/json',Authorization:'Bearer '+token},state=window.__rpgInspect(),item={id:'server_test_blade',name:'서버 검증검',slot:'weapon',rarity:'rare',atk:10,def:0,enhance:0};const seeded=await fetch('/api/rpg/save',{method:'POST',headers,body:JSON.stringify({...state,xp:500,gold:5000,items:[...state.items,item]})});const equipped=await fetch('/api/rpg/gear/action',{method:'POST',headers,body:JSON.stringify({action:'equip',itemId:item.id})});const enhanced=await fetch('/api/rpg/character/upgrade',{method:'POST',headers,body:JSON.stringify({mode:'gold',key:'attack'})});const current=await enhanced.json();const salvaged=await fetch('/api/rpg/gear/action',{method:'POST',headers,body:JSON.stringify({action:'salvage',itemId:item.id})});return{seeded:seeded.status,equipped:equipped.status,equipment:(await equipped.json()).state.equipment.weapon,enhanced:enhanced.status,attackUpgrade:current.state.enhancements.gold.attack,salvageEquipped:salvaged.status}});
  expect(result).toEqual({seeded:200,equipped:200,equipment:'server_test_blade',enhanced:200,attackUpgrade:1,salvageEquipped:409});
});

test('portrait battlefield HUD fits without landscape rotation',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?dev=1');await page.locator('#character-name').fill('세로전장');await page.locator('[data-class="archer"]').click();await page.locator('#create-submit').click();
  await expect(page.locator('#game')).toBeVisible();await expect(page.locator('#battle-target-panel')).toBeVisible({timeout:12000});
  const layout=await page.evaluate(()=>{const top=document.querySelector('.topbar').getBoundingClientRect(),hud=document.querySelector('#battle-target-panel').getBoundingClientRect();return{portrait:matchMedia('(orientation: portrait)').matches,orientation:screen.orientation?.type,viewport:{width:innerWidth,height:innerHeight},documentWidth:document.documentElement.scrollWidth,topbar:{bottom:top.bottom},hud:{left:hud.left,right:hud.right,top:hud.top,bottom:hud.bottom},name:document.querySelector('#battle-target-name').textContent}});
  expect(layout.portrait).toBeTruthy();expect(layout.documentWidth).toBe(layout.viewport.width);expect(layout.hud.left).toBeGreaterThanOrEqual(0);expect(layout.hud.right).toBeLessThanOrEqual(layout.viewport.width);expect(layout.hud.top).toBeGreaterThanOrEqual(layout.topbar.bottom-1);expect(layout.name).not.toBe('몬스터');expect(errors).toEqual([]);
  await page.screenshot({path:'test-results/battlefield-mobile-portrait.png'});await context.close();
});
