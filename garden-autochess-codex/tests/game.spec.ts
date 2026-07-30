import {expect,test} from '@playwright/test';

type State={phase:string;wave:number;sun:number;defense:number;score:number;bench:{id:string;star:number}[];board:{id:string;star:number;col:number;lane:number}[];synergies:{solar:number;steam:number;mushroom:number;thorns:number}};

test('中文主菜单、商店、暂停和失败重开流程可用',async({page})=>{
  const errors:string[]=[];page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'余烬花圃'})).toBeVisible();
  await expect(page.getByText('买种')).toBeVisible();
  await page.getByRole('button',{name:'开始守园'}).click();
  await expect(page.locator('.shop-card')).toHaveCount(5);
  await expect(page.getByText('种子商队',{exact:true})).toBeVisible();
  await page.locator('.shop-card').first().click();
  await expect(page.locator('.bench-slot.filled')).toHaveCount(1);
  const source=await page.locator('.bench-slot.filled').boundingBox();
  const field=await page.locator('canvas').boundingBox();
  expect(source).not.toBeNull();expect(field).not.toBeNull();
  await page.mouse.move(source!.x+source!.width/2,source!.y+source!.height/2);
  await page.mouse.down();await page.mouse.move(field!.x+field!.width*.5,field!.y+field!.height*.43,{steps:8});await page.mouse.up();
  expect((await page.evaluate(()=>window.__GARDEN_TEST__.state())).board).toHaveLength(1);
  await page.getByRole('button',{name:'暂停游戏'}).click();
  await expect(page.getByRole('heading',{name:'时间静止'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#prep')).not.toHaveClass(/hidden/);
  expect(errors).toEqual([]);
});

test('固定种子可复现升星、摆阵和光合相邻联动',async({page})=>{
  await page.goto('/');
  await page.evaluate(()=>{window.__GARDEN_TEST__.newGame();window.__GARDEN_TEST__.seed(7719)});
  await page.evaluate(()=>{const g=window.__GARDEN_TEST__;g.add('sunbud');g.add('sunbud');g.add('sunbud');});
  let state=await page.evaluate(()=>window.__GARDEN_TEST__.state()) as State;
  expect(state.bench.some(u=>u.id==='sunbud'&&u.star===2)).toBeTruthy();
  await page.evaluate(()=>{const g=window.__GARDEN_TEST__;g.add('burstpod');const s=g.state();const sun=s.bench.findIndex(x=>x.id==='sunbud');const shot=s.bench.findIndex(x=>x.id==='burstpod');g.place(sun,3,2);g.place(shot,4,2)});
  state=await page.evaluate(()=>window.__GARDEN_TEST__.state()) as State;
  expect(state.board).toHaveLength(2);
  expect(state.synergies.solar).toBe(1);
  expect(state.sun).toBe(220);
});

test('真实自动战斗会生成敌人、结算投射物并进入奖励阶段',async({page})=>{
  await page.goto('/');
  await page.evaluate(()=>{
    const g=window.__GARDEN_TEST__;g.newGame();g.seed(1985);g.setTimeScale(5);
    for(let lane=0;lane<5;lane++){g.add('burstpod',3);g.place(0,4,lane)}
    g.startWave();
  });
  await expect.poll(()=>page.evaluate(()=>window.__GARDEN_TEST__.state().phase),{timeout:12_000}).toBe('reward');
  const state=await page.evaluate(()=>window.__GARDEN_TEST__.state());
  expect(state.score,{message:JSON.stringify(state)}).toBeGreaterThan(250);
  expect(state.defense).toBe(100);
  await expect(page.getByRole('heading',{name:'选择一项花园强化'})).toBeVisible();
});
