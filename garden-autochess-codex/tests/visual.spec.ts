import {expect,test} from '@playwright/test';

test('固定花园场景无乱码、无横向溢出并匹配视觉基线',async({page},testInfo)=>{
  await page.goto('/');
  await page.evaluate(()=>{
    const g=window.__GARDEN_TEST__;g.newGame();g.seed(20260730);
    g.add('sunbud',2);g.add('burstpod',2);g.add('shellroot',2);g.add('frostfern',2);g.add('emberbloom',2);g.add('mirecap',2);
    g.place(0,2,1);g.place(1,3,1);g.place(2,6,1);g.place(3,3,2);g.place(4,4,2);g.place(5,3,3);
  });
  await page.waitForTimeout(500);
  const layout=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,innerWidth,canvas:(document.querySelector('canvas') as HTMLCanvasElement).getBoundingClientRect().toJSON(),text:document.body.innerText}));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.innerWidth);
  expect(layout.canvas.width).toBeGreaterThan(300);
  expect(layout.canvas.height).toBeGreaterThan(300);
  expect(layout.text).not.toMatch(/[�□]{2,}/);
  await expect(page).toHaveScreenshot(`garden-${testInfo.project.name}.png`,{animations:'disabled',maxDiffPixelRatio:.025});
});
