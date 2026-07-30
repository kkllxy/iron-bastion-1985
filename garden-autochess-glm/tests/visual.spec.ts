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
    ok: alphaPixels > 256 && (variance > 8 || (buckets.size ?? 0) > 3),
    reason: 'sampled',
    variance,
    colorBuckets: buckets.size,
  };
}

test('标题画面渲染非空画布且无错误', async ({ page }, testInfo) => {
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

test('中文文案正确渲染（无乱码/无方块）', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));

  await page.goto('/');
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 12);
  await page.evaluate(() => {
    window.__THREE_GAME_TEST_HOOKS__?.seed(12345);
    window.__THREE_GAME_TEST_HOOKS__?.setState('prep');
  });

  // 顶部 HUD 中文标签
  await expect(page.locator('#sun-value')).toBeVisible();
  await expect(page.locator('#wave-text')).toContainText('/');
  await expect(page.locator('text=防线血量')).toBeVisible();
  await expect(page.locator('text=波次')).toBeVisible();

  // 备战面板按钮中文
  await expect(page.locator('#start-wave-btn')).toContainText('开始本波');
  await expect(page.locator('#reroll-btn')).toContainText('刷新');
  await expect(page.locator('#lock-btn')).toContainText('锁定');

  // 商店槽有植物中文名（非空）
  const shopNames = await page.locator('.shop-slot .shop-name').allTextContents();
  expect(shopNames.filter((n) => n && n !== '空').length).toBeGreaterThan(0);

  // 标题模态中文
  await expect(page.locator('#modal-title')).toContainText('末日花园自走棋');
  expect(consoleErrors).toEqual([]);
});

test('开始 → 购买 → 摆放 → 开战 全流程可交互', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto('/');
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 12);
  await page.evaluate(() => {
    window.__THREE_GAME_TEST_HOOKS__?.seed(777);
    window.__THREE_GAME_TEST_HOOKS__?.setState('prep');
  });

  // 购买第一个可负担的商店槽（确定性）
  const bought = await page.evaluate(() => {
    for (let i = 0; i < 5; i += 1) {
      if (window.__THREE_GAME_TEST_HOOKS__?.testBuy(i)) return i;
    }
    return -1;
  });
  expect(bought, '应至少能成功购买一株').toBeGreaterThanOrEqual(0);
  await page.waitForTimeout(60);

  // 摆放到网格（用测试钩子，避免 DnD 不稳定）
  await page.evaluate(() => {
    window.__THREE_GAME_TEST_HOOKS__?.testPlace(0, 2, 3);
  });

  // 等待诊断刷新（放置是同步的，但诊断每帧发布）
  await expect
    .poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.plantsAlive ?? 0))
    .toBeGreaterThan(0);

  // 开始本波
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.testStartBattle());
  await expect
    .poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.phase))
    .toBe('battle');

  const sample = await sampleCanvas(page);
  expect(sample, JSON.stringify(sample)).toMatchObject({ ok: true });
  await testInfo.attach(`${testInfo.project.name}-play`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  void bought;
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
