import { expect, test, type Page } from '@playwright/test';

// 确定性视觉基线。首次生成：
//   npx playwright test tests/visual-regression.spec.ts --update-snapshots
// 比较：
//   npx playwright test tests/visual-regression.spec.ts
//
// 依赖 window.__THREE_GAME_TEST_HOOKS__（seed/setState/setPausedForScreenshot/
// setReducedMotion/hideDebugUi）。冻结环境动效 + 暂停模拟但继续渲染，重跑只在
// 真正的视觉变化时 diff。

async function prepareDeterministicScreenshot(page: Page, stateName: string) {
  await page.goto('/');
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 12);

  const hasHooks = await page.evaluate(() => Boolean(window.__THREE_GAME_TEST_HOOKS__));
  if (!hasHooks) {
    throw new Error('__THREE_GAME_TEST_HOOKS__ 缺失 — 实现确定性测试钩子后再启用视觉基线。');
  }

  await page.evaluate((name) => {
    const hooks = window.__THREE_GAME_TEST_HOOKS__;
    hooks?.seed(12345);
    hooks?.setReducedMotion(true);
    hooks?.hideDebugUi(true);
    hooks?.setState(name);
    hooks?.setPausedForScreenshot(true);
  }, stateName);

  await page.waitForTimeout(250);
}

test('备战战斗画面视觉基线', async ({ page }, testInfo) => {
  await prepareDeterministicScreenshot(page, 'active-play');
  await expect(page).toHaveScreenshot(`active-play-${testInfo.project.name}.png`, {
    fullPage: true,
    maxDiffPixelRatio: 0.02,
  });
});

test('BOSS 战画面视觉基线', async ({ page }, testInfo) => {
  await prepareDeterministicScreenshot(page, 'boss');
  await expect(page).toHaveScreenshot(`boss-${testInfo.project.name}.png`, {
    fullPage: true,
    maxDiffPixelRatio: 0.02,
  });
});

test('通关结算视觉基线', async ({ page }, testInfo) => {
  await prepareDeterministicScreenshot(page, 'complete');
  await expect(page).toHaveScreenshot(`complete-${testInfo.project.name}.png`, {
    fullPage: true,
    maxDiffPixelRatio: 0.02,
  });
});
