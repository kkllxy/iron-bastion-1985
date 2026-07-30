import { expect, test } from '@playwright/test';
import {
  bridgeSnapshot,
  captureBrowserErrors,
  newRun,
  numberField,
  phaseOf,
  runAutoplayChunk,
  shopOf,
  waitForGarden,
} from './helpers/garden';

test('固定 seed 的初始商店完全一致', async ({ page }) => {
  await waitForGarden(page);
  await newRun(page, 99);
  const first = shopOf((await bridgeSnapshot(page))!);
  await newRun(page, 99);
  const second = shopOf((await bridgeSnapshot(page))!);

  expect(first.length, 'snapshot.shop 必须暴露商店槽').toBeGreaterThan(0);
  expect(second).toEqual(first);
});

test('机器人固定 seed 跑通完整 15 波闭环', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome', '完整机器人局只跑一次桌面硬门禁');
  test.setTimeout(180_000);
  const errors = captureBrowserErrors(page);
  await waitForGarden(page);
  await newRun(page, 1985);

  const stepsPerChunk = 240;
  const maxChunks = 1_000;
  let final = await bridgeSnapshot(page);
  for (let chunk = 0; chunk < maxChunks; chunk += 1) {
    await runAutoplayChunk(page, stepsPerChunk, 1 / 30);
    final = await bridgeSnapshot(page);
    const phase = final ? phaseOf(final) : '';
    if (phase === 'victory' || phase === 'game_over') break;
  }
  final = await bridgeSnapshot(page);
  expect(final, '机器人结束时必须有 snapshot').not.toBeNull();

  const phase = phaseOf(final!);
  const wave = numberField(final!, 'wave', 'wave_number', 'waveNumber');
  const defense = numberField(final!, 'defense_hp', 'defenseHp');
  expect(phase, JSON.stringify(final)).toBe('victory');
  expect(wave, '必须完成至少 15 波').toBeGreaterThanOrEqual(15);
  expect(defense, '通关时防线必须存活').toBeGreaterThan(0);

  const synergies = numberField(final!, 'active_synergies', 'activeSynergies', 'synergy_count');
  if (!Number.isNaN(synergies)) expect(synergies, '机器人应形成至少两种联动').toBeGreaterThanOrEqual(2);
  const maxStar = numberField(final!, 'max_star', 'maxStar');
  if (!Number.isNaN(maxStar)) expect(maxStar, '机器人应完成三星构筑').toBeGreaterThanOrEqual(3);

  await testInfo.attach('bot-15-wave-report', {
    body: JSON.stringify({ final, errors }, null, 2),
    contentType: 'application/json',
  });
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
});
