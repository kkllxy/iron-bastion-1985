import { expect, test } from '@playwright/test';

type Snap = {
  frame: number;
  score: number;
  sun: number;
  wave: number;
  phase: string;
  enemiesAlive: number;
  plantsAlive: number;
  starsOnBoard: number;
  defenseHp: number;
};

// 等待测试钩子就绪（谓词在页面内轮询，避免跨帧引用失效）。
async function waitForHooks(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(() => typeof window.__THREE_GAME_TEST_HOOKS__?.testBuy === 'function');
}

// 等待某个阶段生效（诊断每帧发布，setState 同步生效后需等下一帧才反映）。
async function waitForPhase(page: import('@playwright/test').Page, phase: string): Promise<void> {
  await page.waitForFunction((p) => (window.__THREE_GAME_DIAGNOSTICS__?.phase ?? '') === p, phase);
}

const snap = (page: import('@playwright/test').Page): Promise<Snap | null> =>
  page.evaluate(() => {
    const d = window.__THREE_GAME_DIAGNOSTICS__;
    if (!d) return null;
    return {
      frame: d.frame,
      score: d.score,
      sun: d.sun,
      wave: d.wave,
      phase: d.phase,
      enemiesAlive: d.enemiesAlive,
      plantsAlive: d.plantsAlive,
      starsOnBoard: d.starsOnBoard,
      defenseHp: d.defenseHp,
    };
  });

test('机器人游玩：买种子 → 摆阵 → 开战，经济/升星推进，全程无错误', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome', '机器人用钩子驱动；移动端触控由 visual.spec 覆盖');
  test.setTimeout(90_000);

  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));

  await page.goto('/');
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 12);
  await waitForHooks(page);
  await page.evaluate(() => {
    const h = window.__THREE_GAME_TEST_HOOKS__;
    h?.seed(2024);
    h?.setState('prep');
  });

  const before = (await snap(page)) as Snap;

  // 用钩子驱动：购买第一个可负担槽并摆放
  const driven = await page.evaluate(() => {
    const h = window.__THREE_GAME_TEST_HOOKS__;
    if (!h) return { bought: 0, placed: 0 };
    let bought = 0;
    for (let i = 0; i < 5; i += 1) {
      for (let s = 0; s < 5; s += 1) {
        if (h.testBuy(s)) {
          bought += 1;
          break;
        }
      }
    }
    const spots: Array<[number, number, number]> = [
      [0, 2, 2],
      [1, 2, 4],
      [2, 2, 1],
      [3, 3, 3],
      [4, 1, 3],
    ];
    let placed = 0;
    for (const [bi, lane, col] of spots) {
      if (h.testPlace(bi, lane, col)) placed += 1;
    }
    h.testStartBattle();
    return { bought, placed };
  });

  await page.waitForTimeout(4000);
  const mid = (await snap(page)) as Snap;

  expect(mid.frame, '游戏循环必须持续运行').toBeGreaterThan(before.frame + 100);
  expect(driven.placed, '机器人应成功摆放植物').toBeGreaterThan(0);
  expect(mid.plantsAlive, '场上应有存活植物').toBeGreaterThan(0);
  expect(mid.starsOnBoard, '场上星级应至少等于放置数').toBeGreaterThanOrEqual(driven.placed);

  await testInfo.attach('bot-smoke-report', {
    body: JSON.stringify({ before, driven, mid, consoleErrors, pageErrors }, null, 2),
    contentType: 'application/json',
  });
  expect(pageErrors, '机器人游玩期间出现 page error').toEqual([]);
  expect(consoleErrors, '机器人游玩期间出现 console error').toEqual([]);
});

test('完整自走棋闭环：清波 → 奖励 → 升星/经济推进 → 下一波', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome', '闭环测试在桌面端运行');
  test.setTimeout(120_000);

  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));

  await page.goto('/');
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 12);
  await waitForHooks(page);
  await page.evaluate(() => {
    const h = window.__THREE_GAME_TEST_HOOKS__;
    h?.seed(31337);
    h?.setState('prep');
  });

  // 注入一套能清掉第 1 波的阵容（确定性，验证战斗结算 + 波次推进 + 奖励）
  await page.evaluate(() => {
    const h = window.__THREE_GAME_TEST_HOOKS__;
    if (!h) return;
    for (let lane = 0; lane < 5; lane += 1) {
      h.testInject('peashooter', 2, lane, 4);
      h.testInject('peashooter', 2, lane, 5);
    }
    h.testInject('sunflower', 2, 2, 1);
    h.testStartBattle();
  });

  // 轮询等待第 1 波清空进入奖励阶段
  let cleared: Snap | null = null;
  for (let t = 0; t < 45; t += 1) {
    await page.waitForTimeout(1000);
    cleared = await snap(page);
    if (cleared && (cleared.phase === 'reward' || cleared.phase === 'prep')) break;
  }

  expect(cleared, '诊断必须可用').not.toBeNull();
  expect(cleared!.phase, '第 1 波应被清空并进入奖励/下一波阶段').toMatch(/reward|prep/);
  expect(cleared!.score, '清波应获得击杀分 + 清波奖励').toBeGreaterThanOrEqual(200);
  expect(cleared!.defenseHp, '防线不应被突破').toBeGreaterThan(0);

  // 若处于奖励阶段，选第一张卡，断言进入第 2 波备战
  if (cleared!.phase === 'reward') {
    await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.testPickReward(0));
    await page.waitForTimeout(500);
    const after = (await snap(page)) as Snap;
    expect(after.phase, '选奖励后应进入备战').toBe('prep');
    expect(after.wave, '应推进到第 2 波').toBe(2);
  }

  await testInfo.attach('bot-loop-report', {
    body: JSON.stringify({ cleared, consoleErrors, pageErrors }, null, 2),
    contentType: 'application/json',
  });
  expect(pageErrors, '闭环期间出现 page error').toEqual([]);
  expect(consoleErrors, '闭环期间出现 console error').toEqual([]);
});

test('确定性：同一 seed 两次商店刷新结果一致', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 12);
  await waitForHooks(page);

  const rollShop = async () => {
    await page.evaluate(() => {
      const h = window.__THREE_GAME_TEST_HOOKS__;
      h?.seed(99);
      h?.setState('prep');
    });
    await waitForPhase(page, 'prep');
    return page.evaluate(() =>
      Array.from(document.querySelectorAll('.shop-slot')).map((s) => (s as HTMLElement).dataset.plant),
    );
  };

  const runA = await rollShop();
  const runB = await rollShop();

  expect(runA, '固定 seed 的商店刷新必须可复现').toEqual(runB);
  expect(runA.filter(Boolean).length, '商店应有非空槽').toBeGreaterThan(0);
});
