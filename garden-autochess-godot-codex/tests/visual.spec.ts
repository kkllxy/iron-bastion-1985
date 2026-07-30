import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import {
  bridgeSnapshot,
  captureBrowserErrors,
  newRun,
  phaseOf,
  readChineseUiText,
  waitForGarden,
} from './helpers/garden';

async function canvasSample(page: Page) {
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box || box.width < 32 || box.height < 32) return { ok: false, reason: 'canvas-too-small' };

  const png = PNG.sync.read(await canvas.screenshot());
  let min = 255;
  let max = 0;
  let opaque = 0;
  const buckets = new Set<string>();
  const stride = Math.max(1, Math.floor((png.width * png.height) / 4096));
  for (let pixel = 0; pixel < png.width * png.height; pixel += stride) {
    const offset = pixel * 4;
    const [r, g, b, a] = png.data.subarray(offset, offset + 4);
    min = Math.min(min, r, g, b);
    max = Math.max(max, r, g, b);
    if (a > 0) opaque += 1;
    buckets.add(`${r >> 4},${g >> 4},${b >> 4},${a >> 6}`);
  }
  return {
    ok: opaque > 256 && max - min > 8 && buckets.size > 3,
    reason: 'sampled',
    variance: max - min,
    colorBuckets: buckets.size,
  };
}

test('Godot Web 启动、Canvas 非空且无浏览器错误', async ({ page }, testInfo) => {
  const errors = captureBrowserErrors(page);
  await waitForGarden(page);

  const sample = await canvasSample(page);
  expect(sample, JSON.stringify(sample)).toMatchObject({ ok: true });
  await testInfo.attach(`${testInfo.project.name}-canvas`, {
    body: await page.locator('canvas').first().screenshot(),
    contentType: 'image/png',
  });
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
});

test('状态桥提供关键简体中文文案', async ({ page }) => {
  const errors = captureBrowserErrors(page);
  await waitForGarden(page);
  await newRun(page, 19_850_731);
  const text = await readChineseUiText(page);

  for (const label of ['末日花园自走棋', '阳光', '波次', '防线血量', '刷新', '锁定']) {
    expect(text, `状态桥缺少关键中文文案：${label}`).toContain(label);
  }
  expect(text).not.toMatch(/[�□]{2,}/);
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
});

test('真实 Canvas 开始按钮支持桌面点击与移动触控', async ({ page }, testInfo) => {
  const errors = captureBrowserErrors(page);
  await waitForGarden(page);
  expect(phaseOf((await bridgeSnapshot(page))!)).toBe('start');

  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width * 0.5;
  const y = box!.y + box!.height * 0.6;

  if (testInfo.project.name === 'mobile-chrome') await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);

  await expect.poll(async () => phaseOf((await bridgeSnapshot(page))!)).toBe('prep');
  expect(await canvasSample(page)).toMatchObject({ ok: true });
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
});
