import { expect, test, type Page } from '@playwright/test';

// Deterministic baselines for the game's key states. First run with update:
//   npx playwright test tests/visual-regression.spec.ts --update-snapshots
// Then compare:
//   npx playwright test tests/visual-regression.spec.ts
//
// Requires window.__THREE_GAME_TEST_HOOKS__ (seed/setState/setPausedForScreenshot/
// setReducedMotion/hideDebugUi). The game freezes ambient motion + pauses the
// sim while continuing to render, so reruns diff only on real visual changes.

async function prepareDeterministicScreenshot(page: Page, stateName: string) {
  await page.goto('/');
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 12);

  const hasHooks = await page.evaluate(() => Boolean(window.__THREE_GAME_TEST_HOOKS__));
  if (!hasHooks) {
    throw new Error('__THREE_GAME_TEST_HOOKS__ missing — implement deterministic hooks before baselines.');
  }

  await page.evaluate((name) => {
    const hooks = window.__THREE_GAME_TEST_HOOKS__;
    hooks?.seed(12345);
    hooks?.setReducedMotion(true);
    hooks?.hideDebugUi(true);
    hooks?.setState(name);
    hooks?.setPausedForScreenshot(true);
  }, stateName);

  await page.waitForTimeout(200);
}

test('active play visual baseline', async ({ page }, testInfo) => {
  await prepareDeterministicScreenshot(page, 'active-play');
  await expect(page).toHaveScreenshot(`active-play-${testInfo.project.name}.png`, {
    fullPage: true,
    maxDiffPixelRatio: 0.02,
  });
});

test('boss encounter visual baseline', async ({ page }, testInfo) => {
  await prepareDeterministicScreenshot(page, 'boss');
  await expect(page).toHaveScreenshot(`boss-${testInfo.project.name}.png`, {
    fullPage: true,
    maxDiffPixelRatio: 0.02,
  });
});

test('victory visual baseline', async ({ page }, testInfo) => {
  await prepareDeterministicScreenshot(page, 'complete');
  await expect(page).toHaveScreenshot(`complete-${testInfo.project.name}.png`, {
    fullPage: true,
    maxDiffPixelRatio: 0.02,
  });
});
