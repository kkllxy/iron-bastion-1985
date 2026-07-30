import { expect, test } from '@playwright/test';

// Render two distinct equal-length Chinese strings with the page's real font and
// compare coarse pixel signatures. A missing CJK font renders both as identical
// .notdef boxes (tofu), so equal signatures == tofu == fail.
async function glyphSignature(page: import('@playwright/test').Page, text: string) {
  return page.evaluate((t) => {
    const font = getComputedStyle(document.body).fontFamily;
    const size = 28;
    const c = document.createElement('canvas');
    c.width = size * t.length;
    c.height = size;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#fff';
    ctx.font = `${size - 4}px ${font}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(t, 2, size / 2);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let ink = 0;
    const buckets = new Set<string>();
    for (let i = 0; i < data.length; i += 4) {
      const v = data[i];
      if (v > 40) ink++;
      buckets.add(`${v >> 4}`);
    }
    return { ink, buckets: buckets.size, sig: `${ink}:${[...buckets].sort().join(',')}` };
  }, text);
}

test.describe('Chinese text renders correctly (no tofu, no overflow)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 10);
    await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__!.setState('active-play'));
    await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.phase === 'playing');
  });

  test('distinct glyphs are not tofu boxes', async ({ page }) => {
    const a = await glyphSignature(page, '潜入任务');
    const b = await glyphSignature(page, '警戒基地');
    // each must have real ink (not blank)
    expect(a.ink, 'string A has ink').toBeGreaterThan(40);
    expect(b.ink, 'string B has ink').toBeGreaterThan(40);
    // distinct characters must render distinct pixels (tofu would be identical)
    expect(a.sig, 'glyphs differ from tofu').not.toEqual(b.sig);
  });

  test('HUD strings are correct Simplified Chinese', async ({ page }) => {
    await expect(page.locator('#area-name')).toHaveText('基地外围');
    await expect(page.locator('#area-progress')).toHaveText('1 / 3');
    await expect(page.locator('#alert-badge')).toContainText('警戒');
    await expect(page.locator('#weapon')).toContainText(/手枪|镇静针/);
    await expect(page.locator('#lives')).toContainText('×');
    await expect(page.locator('#card-level')).toContainText('级');
    await expect(page.locator('#objective')).toContainText(/钥匙卡|撤离/);
  });

  test('menu and overlays are Chinese', async ({ page }) => {
    await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__!.setState('menu'));
    await expect(page.locator('.game-title')).toHaveText('夜枭行动');
    await expect(page.locator('#btn-start')).toHaveText('开始任务');
  });

  test('no HUD element overflows the viewport', async ({ page }, testInfo) => {
    const vp = page.viewportSize()!;
    const ids = ['#hud-top', '#hud-bottom', '#objective', '#alert-badge', '#area-name', '#score', '#minimap'];
    for (const id of ids) {
      const box = await page.locator(id).boundingBox();
      expect(box, `${id} present`).not.toBeNull();
      if (!box) continue;
      expect(box.x, `${id} left in-bounds`).toBeGreaterThanOrEqual(-2);
      expect(box.y, `${id} top in-bounds`).toBeGreaterThanOrEqual(-2);
      expect(box.x + box.width, `${id} right in-bounds`).toBeLessThanOrEqual(vp.width + 2);
      expect(box.y + box.height, `${id} bottom in-bounds`).toBeLessThanOrEqual(vp.height + 2);
    }

    if (testInfo.project.name.includes('mobile')) {
      // touch controls must be visible and action buttons inside the viewport
      await expect(page.locator('#touch-stick')).toBeVisible();
      const buttons = ['#btn-fire', '#btn-interact', '#btn-swap', '#btn-box', '#btn-stealth'];
      for (const b of buttons) {
        const box = await page.locator(b).boundingBox();
        expect(box, `${b} present`).not.toBeNull();
        if (!box) continue;
        expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
        expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
      }
      // objective hint must not be occluded by the touch buttons (full AABB overlap)
      const obj = await page.locator('#objective').boundingBox();
      const fire = await page.locator('#btn-fire').boundingBox();
      if (obj && fire) {
        const overlap =
          obj.x < fire.x + fire.width &&
          obj.x + obj.width > fire.x &&
          obj.y < fire.y + fire.height &&
          obj.y + obj.height > fire.y;
        expect(overlap, 'objective not occluded by touch buttons').toBeFalsy();
      }
    }
  });
});
