import { expect, test } from '@playwright/test';

type Snapshot = {
  frame: number;
  score: number;
  target: number;
  complete: boolean;
  x: number;
  z: number;
};

test('bot playtest: approach + attack drives kills and progress', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome', 'bot uses keyboard; mobile is covered by visual.spec');
  test.setTimeout(120_000);

  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));

  await page.goto('/');
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 12);
  await page.evaluate(() => {
    window.__THREE_GAME_TEST_HOOKS__?.seed(777);
    window.__THREE_GAME_TEST_HOOKS__?.setState('active-play');
  });
  await expect
    .poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.targetScore ?? 0))
    .toBeGreaterThan(0);

  const snap = (): Promise<Snapshot | null> =>
    page.evaluate(() => {
      const d = window.__THREE_GAME_DIAGNOSTICS__;
      if (!d) return null;
      return {
        frame: d.frame,
        score: d.score,
        target: d.targetScore,
        complete: d.complete,
        x: d.player.position.x,
        z: d.player.position.z,
      };
    });

  const before = (await snap()) as Snapshot;
  let distance = 0;
  let killsAtSomePoint = before.score;
  let firstKillCycle = -1;

  // Close the gap to the first wave (player spawns at the back), then chain
  // attacks so closing enemies get hit. Walking stops while attacking (attack
  // zeroes velocity), so the pattern is: approach, then punch-flurry.
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2400);
  await page.keyboard.up('KeyW');

  const CYCLES = 12;
  for (let i = 0; i < CYCLES; i += 1) {
    for (let j = 0; j < 5; j += 1) {
      await page.keyboard.press('KeyJ');
      await page.waitForTimeout(200);
    }
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(450);
    await page.keyboard.up('KeyW');

    const s = (await snap()) as Snapshot;
    if (s.score > killsAtSomePoint) {
      killsAtSomePoint = s.score;
      if (firstKillCycle === -1) firstKillCycle = i;
    }
    distance += Math.hypot(s.x - before.x, s.z - before.z) / CYCLES;
  }

  const after = (await snap()) as Snapshot;
  const report = {
    cycles: CYCLES,
    framesAdvanced: after.frame - before.frame,
    scoreBefore: before.score,
    scoreAfter: after.score,
    firstKillCycle,
    complete: after.complete,
    distanceApprox: Number(distance.toFixed(2)),
    consoleErrors,
    pageErrors,
  };
  await testInfo.attach('bot-playtest-report', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  });
  console.log(`bot playtest: ${JSON.stringify(report)}`);

  expect(pageErrors, 'page errors during bot play').toEqual([]);
  expect(consoleErrors, 'console errors during bot play').toEqual([]);
  expect(report.framesAdvanced, 'game loop must keep running').toBeGreaterThan(200);
  expect(report.scoreAfter, 'bot must land kills (score must rise)').toBeGreaterThan(report.scoreBefore);
});
