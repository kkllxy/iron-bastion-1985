import { expect, test } from '@playwright/test';

// A real bot playtest: the bot drives the player tank toward the nearest hostile
// with keyboard input and fires, then asserts the objective actually progressed
// (score up / hostiles down), the loop kept running, and no errors fired.
type Snap = {
  frame: number;
  score: number;
  enemiesRemaining: number;
  enemiesOnField: number;
  px: number;
  pz: number;
  enemies: Array<{ x: number; z: number }>;
};

const MOVE_KEY = { N: 'KeyW', S: 'KeyS', E: 'KeyD', W: 'KeyA' } as const;

test('bot playtest: seeks hostiles and progresses the objective', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome', 'bot uses keyboard; mobile is covered by visual.spec.ts');
  test.setTimeout(120_000);

  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });

  await page.goto('/');
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 10);
  await page.evaluate(() => {
    window.__THREE_GAME_TEST_HOOKS__?.seed(12345);
    window.__THREE_GAME_TEST_HOOKS__?.setState('play');
    window.__THREE_GAME_TEST_HOOKS__?.setInvincible(true);
  });
  await page.waitForTimeout(800);

  const snap = (): Promise<Snap | null> =>
    page.evaluate(() => {
      const d = window.__THREE_GAME_DIAGNOSTICS__;
      if (!d) return null;
      return {
        frame: d.frame,
        score: d.score,
        enemiesRemaining: d.enemiesRemaining,
        enemiesOnField: d.enemiesOnField,
        px: d.player.x,
        pz: d.player.z,
        enemies: d.enemies.map((e) => ({ x: e.x, z: e.z })),
      };
    });

  const before = await snap();
  expect(before, 'diagnostics must publish before the bot can play').not.toBeNull();
  const startScore = before!.score;
  const startRemaining = before!.enemiesRemaining;

  let heldKey: string | null = null;
  let distance = 0;
  let softlockWindows = 0;
  let prevFrame = before!.frame;
  let stuck = false;
  // rotate a blocked primary through the other cardinals to skirt walls
  const order = [MOVE_KEY.N, MOVE_KEY.E, MOVE_KEY.S, MOVE_KEY.W];
  const rotate = new Map(order.map((k) => [k, () => order[(order.indexOf(k) + 1) % 4]]));

  for (let step = 0; step < 70; step += 1) {
    const s = await snap();
    if (!s) break;
    // choose direction toward the nearest enemy, with wall-skirting: if the
    // previous step produced no motion, try the perpendicular axis to go around.
    let target: { x: number; z: number } | null = null;
    let best = Infinity;
    for (const e of s.enemies) {
      const d = Math.hypot(e.x - s.px, e.z - s.pz);
      if (d < best) {
        best = d;
        target = e;
      }
    }
    let key: string | null = null;
    if (!target) {
      // no hostile on field: advance toward the spawn line to stay active
      key = MOVE_KEY.N;
    } else {
      const dx = target.x - s.px;
      const dz = target.z - s.pz;
      const primary = Math.abs(dx) >= Math.abs(dz)
        ? dx >= 0 ? MOVE_KEY.E : MOVE_KEY.W
        : dz >= 0 ? MOVE_KEY.S : MOVE_KEY.N;
      // wall-skirting: if blocked last step, rotate through axes to escape
      key = stuck ? (rotate.get(primary)?.() ?? primary) : primary;
    }

    if (heldKey && heldKey !== key) {
      await page.keyboard.up(heldKey);
      heldKey = null;
    }
    if (key && key !== heldKey) {
      await page.keyboard.down(key);
      heldKey = key;
    }
    // fire
    await page.keyboard.down('Space');
    await page.waitForTimeout(150);
    await page.keyboard.up('Space');
    await page.waitForTimeout(120);

    const after = await snap();
    if (after) {
      const moved = Math.hypot(after.px - s.px, after.pz - s.pz);
      distance += moved;
      stuck = heldKey !== null && moved < 0.15;
      const progressed = after.enemiesRemaining < s.enemiesRemaining || after.score > s.score;
      // only a real softlock: a movement key was held yet the tank did not move
      if (heldKey !== null && !progressed && after.frame > prevFrame && moved < 0.15) {
        softlockWindows += 1;
      }
      prevFrame = after.frame;
    }
    // stop early once a sector is cleared (level advanced / victory)
    if (await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.complete)) break;
  }

  if (heldKey) await page.keyboard.up(heldKey);
  const after = (await snap())!;

  const report = {
    framesAdvanced: after.frame - before!.frame,
    scoreBefore: startScore,
    scoreAfter: after.score,
    remainingBefore: startRemaining,
    remainingAfter: after.enemiesRemaining,
    distanceTravelled: Number(distance.toFixed(2)),
    softlockWindows,
    consoleErrors,
    pageErrors,
  };
  await testInfo.attach('bot-playtest-report', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  console.log(`bot playtest: ${JSON.stringify(report)}`);

  expect(pageErrors, 'page errors during bot play').toEqual([]);
  expect(consoleErrors, 'console errors during bot play').toEqual([]);
  expect(report.framesAdvanced, 'game loop must keep running').toBeGreaterThan(200);
  expect(report.distanceTravelled, 'tank must respond to scripted input').toBeGreaterThan(6);
  expect(report.softlockWindows, 'too many frames with no motion or progress').toBeLessThan(18);
  const progressed = report.scoreAfter > report.scoreBefore || report.remainingAfter < report.remainingBefore;
  expect(progressed, 'bot must reduce hostiles or gain score').toBe(true);
});
