import { expect, test } from '@playwright/test';

async function setStableState(page:import('@playwright/test').Page,state:string):Promise<void>{
  await page.goto('/');
  await page.waitForFunction(()=>Boolean(window.__THREE_GAME_TEST_HOOKS__));
  await page.evaluate(({state})=>{const hooks=window.__THREE_GAME_TEST_HOOKS__!;hooks.seed(1985);hooks.setReducedMotion(true);hooks.hideDebugUi(true);hooks.setState(state);hooks.setPausedForScreenshot(true)},{state});
  await page.waitForTimeout(150);
}

test('active battlefield visual baseline',async({page},testInfo)=>{
  await setStableState(page,'active-play');
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.locator('#topbar')).toBeVisible();
  await expect(page).toHaveScreenshot(`active-${testInfo.project.name}.png`,{animations:'disabled',maxDiffPixelRatio:.015});
});

for(const level of [2,3])test(`level ${level} battlefield visual baseline`,async({page},testInfo)=>{
  await setStableState(page,`level-${level}`);
  await expect(page.locator('#level-value')).toHaveText(String(level).padStart(2,'0'));
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page).toHaveScreenshot(`level-${level}-${testInfo.project.name}.png`,{animations:'disabled',maxDiffPixelRatio:.015});
});

test('level complete transition visual baseline',async({page},testInfo)=>{
  await setStableState(page,'level-complete');
  await expect(page.locator('#modal-title')).toHaveText('战区肃清');
  await expect(page.locator('#modal-copy')).toContainText('钢铁水网');
  await expect(page).toHaveScreenshot(`level-complete-${testInfo.project.name}.png`,{animations:'disabled',maxDiffPixelRatio:.012});
});

test('defeat overlay visual baseline',async({page},testInfo)=>{
  await setStableState(page,'fail');
  await expect(page.locator('#modal-title')).toContainText('全军覆没');
  await expect(page).toHaveScreenshot(`defeat-${testInfo.project.name}.png`,{animations:'disabled',maxDiffPixelRatio:.012});
});

test('victory overlay visual baseline',async({page},testInfo)=>{
  await setStableState(page,'victory');
  await expect(page.locator('#modal-title')).toContainText('守卫成功');
  await expect(page).toHaveScreenshot(`victory-${testInfo.project.name}.png`,{animations:'disabled',maxDiffPixelRatio:.012});
});
