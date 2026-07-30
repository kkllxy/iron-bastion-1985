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
  if (!box || box.width < 32 || box.height < 32) return { ok: false, reason: 'canvas-too-small' };

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

async function startRun(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    window.__THREE_GAME_TEST_HOOKS__?.seed(12345);
    window.__THREE_GAME_TEST_HOOKS__?.setState('active-play');
  });
  // wait until the level has spawned enemies (playing state active)
  await expect
    .poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.targetScore ?? 0))
    .toBeGreaterThan(0);
}

test('renders a nonblank canvas on load (title)', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto('/');
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.locator('#game-modal')).toBeVisible();
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 12);

  const sample = await sampleCanvas(page);
  expect(sample, JSON.stringify(sample)).toMatchObject({ ok: true });
  await testInfo.attach(`${testInfo.project.name}-title`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('start + movement + attack respond to input', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto('/');
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 12);
  await startRun(page);

  const beforeZ = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.player.position.z ?? 0);

  if (testInfo.project.name.includes('mobile')) {
    // touch stick: drag up to move forward (-Z)
    const stick = page.locator('#touch-stick');
    await expect(stick).toBeVisible();
    const box = await stick.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.05, { steps: 6 });
      await page.waitForTimeout(500);
      await page.mouse.up();
    }
    // tap attack button
    await page.locator('#attack-button').dispatchEvent('pointerdown');
    await page.waitForTimeout(120);
    await page.locator('#attack-button').dispatchEvent('pointerup');
  } else {
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(500);
    await page.keyboard.up('KeyW');
    // attack (J) — should not error even with no target in range
    await page.keyboard.press('KeyJ');
    await page.waitForTimeout(200);
  }

  await expect
    .poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.player.position.z ?? 0))
    .toBeLessThan(beforeZ - 0.3);

  const sample = await sampleCanvas(page);
  expect(sample, JSON.stringify(sample)).toMatchObject({ ok: true });

  await testInfo.attach(`${testInfo.project.name}-play`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
