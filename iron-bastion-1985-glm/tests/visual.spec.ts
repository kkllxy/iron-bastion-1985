import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

type CanvasSample = {
  ok: boolean;
  reason: string;
  variance?: number;
  colorBuckets?: number;
};

async function sampleCanvas(page: import('@playwright/test').Page): Promise<CanvasSample> {
  const canvas = page.locator('#game-canvas');
  const box = await canvas.boundingBox();
  if (!box || box.width < 32 || box.height < 32) {
    return { ok: false, reason: 'canvas-too-small' };
  }
  const buffer = await canvas.screenshot();
  const png = PNG.sync.read(buffer);
  let min = 255;
  let max = 0;
  let alphaPixels = 0;
  const buckets = new Set<string>();
  const stride = Math.max(1, Math.floor((png.width * png.height) / 4096));
  for (let pixel = 0; pixel < png.width * png.height; pixel += stride) {
    const offset = pixel * 4;
    const r = png.data[offset];
    const g = png.data[offset + 1];
    const b = png.data[offset + 2];
    const a = png.data[offset + 3];
    min = Math.min(min, r, g, b);
    max = Math.max(max, r, g, b);
    if (a > 0) alphaPixels += 1;
    buckets.add(`${r >> 4},${g >> 4},${b >> 4},${a >> 6}`);
  }
  const variance = max - min;
  return {
    ok: alphaPixels > 256 && (variance > 8 || buckets.size > 3),
    reason: 'sampled',
    variance,
    colorBuckets: buckets.size,
  };
}

test('renders a nonblank interactive game canvas (desktop)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome', 'desktop test uses keyboard input');
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto('/');
  await expect(page.locator('#game-canvas')).toBeVisible();
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 10);

  // start an active run for a real play screenshot
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.setState('play'));
  await page.waitForTimeout(400);

  const sample = await sampleCanvas(page);
  expect(sample, JSON.stringify(sample)).toMatchObject({ ok: true });

  const before = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.player.z ?? 0);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(450);
  await page.keyboard.up('KeyW');
  await expect
    .poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.player.z ?? 0))
    .toBeLessThan(before - 0.3);

  // fire a shot to exercise the projectile path
  await page.keyboard.down('Space');
  await page.waitForTimeout(120);
  await page.keyboard.up('Space');

  await page.evaluate(() => {
    window.__THREE_GAME_TEST_HOOKS__?.setReducedMotion(true);
    window.__THREE_GAME_TEST_HOOKS__?.setPausedForScreenshot(true);
  });
  await page.waitForTimeout(60);
  const shot = await page.screenshot({ fullPage: true });
  await testInfo.attach('desktop-active-play', { body: shot, contentType: 'image/png' });

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('mobile viewport: canvas nonblank, touch stick moves the tank', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-safari', 'mobile test uses the on-screen touch stick');
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });

  await page.goto('/');
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 10);
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.setState('play'));
  await page.waitForTimeout(300);

  const stick = page.locator('#touch-stick');
  await expect(stick).toBeVisible();
  const box = await stick.boundingBox();
  expect(box).not.toBeNull();
  const before = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.player.z ?? 0);

  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.08, { steps: 6 });
    await page.waitForTimeout(500);
    await page.mouse.up();
  }

  await expect
    .poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.player.z ?? 0))
    .toBeLessThan(before - 0.2);

  await page.evaluate(() => {
    window.__THREE_GAME_TEST_HOOKS__?.setReducedMotion(true);
    window.__THREE_GAME_TEST_HOOKS__?.setPausedForScreenshot(true);
  });
  await page.waitForTimeout(60);
  const sample = await sampleCanvas(page);
  expect(sample, JSON.stringify(sample)).toMatchObject({ ok: true });
  const shot = await page.screenshot({ fullPage: true });
  await testInfo.attach('mobile-active-play', { body: shot, contentType: 'image/png' });
  expect(consoleErrors).toEqual([]);
});
