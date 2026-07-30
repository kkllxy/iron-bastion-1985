import { expect, test } from '@playwright/test';

// Visual baselines. The menu/overlay screens are fully static DOM+background, so
// they are compared strictly. In-game WebGL frames are paused + reduced-motion +
// debug-hidden and compared with a tolerance; they are also archived for review.
test.describe('visual baselines', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 10);
  });

  test('menu screen baseline', async ({ page }, testInfo) => {
    await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__!.setState('menu'));
    await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__!.hideDebugUi(true));
    await page.waitForTimeout(400);
    await expect(page).toHaveScreenshot(`${testInfo.project.name}-menu.png`, {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
  });

  test('active-play frame baseline', async ({ page }, testInfo) => {
    await page.evaluate(() => {
      const h = window.__THREE_GAME_TEST_HOOKS__!;
      h.seed(42);
      h.setReducedMotion(true);
      h.hideDebugUi(true);
      h.setState('active-play');
    });
    await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.phase === 'playing');
    // let the camera settle, then freeze the sim deterministically
    await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 30);
    await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__!.setPausedForScreenshot(true));
    await page.waitForTimeout(250);
    await expect(page).toHaveScreenshot(`${testInfo.project.name}-play.png`, {
      maxDiffPixelRatio: 0.08,
      animations: 'disabled',
    });
    await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__!.setPausedForScreenshot(false));
  });

  test('boss fight frame (archived for review)', async ({ page }, testInfo) => {
    await page.evaluate(() => {
      const h = window.__THREE_GAME_TEST_HOOKS__!;
      h.seed(7);
      h.setReducedMotion(true);
      h.hideDebugUi(true);
      h.setState('boss');
    });
    await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.phase === 'playing');
    await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 30);
    await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__!.setPausedForScreenshot(true));
    await page.waitForTimeout(250);
    await page.screenshot({ path: `artifacts/${testInfo.project.name}-boss-review.png`, fullPage: true });
    await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__!.setPausedForScreenshot(false));
  });
});
