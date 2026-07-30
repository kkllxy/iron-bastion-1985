import { expect, test } from '@playwright/test';

// Exploration bot: keep the agent moving, firing, and interacting for a while
// and assert the simulation keeps ticking, controls emit intents, and nothing
// softlocks or throws.
test('exploration bot survives and keeps the sim alive', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 10);
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__!.setState('active-play'));
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.phase === 'playing');

  const start = await page.evaluate(() => ({
    x: window.__THREE_GAME_DIAGNOSTICS__!.player.position.x,
    z: window.__THREE_GAME_DIAGNOSTICS__!.player.position.z,
  }));

  // Wander: cycle directions, fire, and interact for ~9s.
  const dirs = ['KeyW', 'KeyD', 'KeyS', 'KeyA'];
  for (let i = 0; i < 9; i++) {
    await page.keyboard.down(dirs[i % dirs.length]);
    await page.keyboard.down('KeyJ');
    await page.waitForTimeout(450);
    await page.keyboard.up(dirs[i % dirs.length]);
    await page.keyboard.up('KeyJ');
    if (i % 2 === 0) await page.keyboard.press('KeyE');
  }

  const after = await page.evaluate(() => ({
    x: window.__THREE_GAME_DIAGNOSTICS__!.player.position.x,
    z: window.__THREE_GAME_DIAGNOSTICS__!.player.position.z,
    frame: window.__THREE_GAME_DIAGNOSTICS__!.frame,
    phase: window.__THREE_GAME_DIAGNOSTICS__!.phase,
  }));

  expect(after.frame, 'frames advanced').toBeGreaterThan(start.x === undefined ? 0 : 100);
  const moved = Math.hypot(after.x - start.x, after.z - start.z);
  expect(moved, 'player moved under bot control').toBeGreaterThan(0.5);
  // Phase may be playing/dead/briefing (transitioned) but must not be an error/hang.
  expect(['playing', 'dead', 'briefing', 'gameover']).toContain(after.phase);
  expect(errors, 'no console/page errors').toEqual([]);
});

// Boss bot: face the mech, fire, and assert destructible parts actually break
// (proves the win condition path is wired and damageable).
test('boss bot damages and destroys mech parts', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 10);
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__!.setState('boss'));
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.phase === 'playing');
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.bossProgress !== null);

  // Close to medium range facing the boss (player starts west on its row),
  // then sustain fire toward it. Aim stays fixed on +x (toward the boss).
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(1400);
  await page.keyboard.up('KeyD');

  await page.keyboard.down('KeyJ');
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(300);
    const prog = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!.bossProgress);
    if (prog === '3/3') break;
  }
  await page.keyboard.up('KeyJ');

  const final = await page.evaluate(() => ({
    prog: window.__THREE_GAME_DIAGNOSTICS__!.bossProgress,
    phase: window.__THREE_GAME_DIAGNOSTICS__!.phase,
  }));
  // At least one part must have been destroyed by sustained fire.
  expect(['1/3', '2/3', '3/3']).toContain(final.prog);
  expect(errors, 'no console/page errors during boss fight').toEqual([]);
});
