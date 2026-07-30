import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

// Deterministic visual baselines per sector + key screens. Uses the test hooks
// (seed + reducedMotion + paused) so captures are reproducible. We assert
// nonblank/varied output rather than brittle exact-pixel diffs (GPU/SwiftShader
// differences would flake a strict diff); screenshots are attached as baselines.
async function nonblank(page: import('@playwright/test').Page): Promise<{ ok: boolean; buckets: number; variance: number }> {
  const png = PNG.sync.read(await page.locator('#game-canvas').screenshot());
  let min = 255;
  let max = 0;
  const buckets = new Set<string>();
  const stride = Math.max(1, Math.floor((png.width * png.height) / 4096));
  for (let p = 0; p < png.width * png.height; p += stride) {
    const o = p * 4;
    const r = png.data[o];
    const g = png.data[o + 1];
    const b = png.data[o + 2];
    min = Math.min(min, r, g, b);
    max = Math.max(max, r, g, b);
    buckets.add(`${r >> 4},${g >> 4},${b >> 4}`);
  }
  return { ok: max - min > 12 && buckets.size > 6, buckets: buckets.size, variance: max - min };
}

async function capture(page: import('@playwright/test').Page, state: string, attachName: string, testInfo: import('@playwright/test').TestInfo) {
  await page.evaluate((s) => {
    window.__THREE_GAME_TEST_HOOKS__?.seed(777);
    window.__THREE_GAME_TEST_HOOKS__?.setState(s);
  }, state);
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    window.__THREE_GAME_TEST_HOOKS__?.setReducedMotion(true);
    window.__THREE_GAME_TEST_HOOKS__?.setPausedForScreenshot(true);
  });
  await page.waitForTimeout(80);
  const res = await nonblank(page);
  expect(res, `state ${state} should be nonblank`).toMatchObject({ ok: true });
  await testInfo.attach(attachName, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.setPausedForScreenshot(false));
}

test.describe('visual baselines per sector', () => {
  test('sector 1 — Checkpoint', async ({ page }, testInfo) => {
    await page.goto('/');
    await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 10);
    await capture(page, 'play', 'sector-1-checkpoint', testInfo);
  });

  test('sector 2 — Crossfire', async ({ page }, testInfo) => {
    await page.goto('/');
    await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 10);
    await capture(page, 'play-l2', 'sector-2-crossfire', testInfo);
  });

  test('sector 3 — Fortress', async ({ page }, testInfo) => {
    await page.goto('/');
    await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 10);
    await capture(page, 'play-l3', 'sector-3-fortress', testInfo);
  });

  test('title + victory screens render', async ({ page }, testInfo) => {
    await page.goto('/');
    await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 10);
    await page.evaluate(() => {
      window.__THREE_GAME_TEST_HOOKS__?.setReducedMotion(true);
      window.__THREE_GAME_TEST_HOOKS__?.setPausedForScreenshot(true);
    });
    await page.waitForTimeout(80);
    let res = await nonblank(page);
    expect(res.ok, 'title nonblank').toBe(true);
    await testInfo.attach('title-screen', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.setPausedForScreenshot(false));
    await capture(page, 'victory', 'victory-screen', testInfo);
  });
});
