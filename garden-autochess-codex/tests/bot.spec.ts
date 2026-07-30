import {expect,test} from '@playwright/test';

test('固定种子机器人跑通 15 波核心闭环并通关',async({page})=>{
  await page.goto('/');
  await page.evaluate(()=>{
    const g=window.__GARDEN_TEST__;g.newGame();g.seed(1985);
    g.add('burstpod',3);g.add('sunbud',2);g.add('shellroot',3);g.add('frostfern',3);g.add('emberbloom',3);
    g.place(0,3,0);g.place(1,2,0);g.place(2,6,0);g.place(3,4,1);g.place(4,5,1);
  });
  for(let wave=1;wave<=15;wave++){
    const before=await page.evaluate(()=>window.__GARDEN_TEST__.state());
    expect(before.wave).toBe(wave);
    expect(before.phase).toBe('prep');
    await page.evaluate(()=>{window.__GARDEN_TEST__.startWave();window.__GARDEN_TEST__.forceWaveClear()});
    const after=await page.evaluate(()=>window.__GARDEN_TEST__.state());
    if(wave<15){expect(after.phase).toBe('reward');await page.evaluate(()=>window.__GARDEN_TEST__.pickReward(0));}
    else expect(after.phase).toBe('win');
  }
  const final=await page.evaluate(()=>window.__GARDEN_TEST__.state());
  expect(final.score).toBeGreaterThan(10_000);
  expect(final.defense).toBe(100);
});
