import { expect, test } from '@playwright/test';
import { captureBrowserErrors, prepareVisualState, waitForGarden } from './helpers/garden';

const states = ['start', 'prep', 'battle', 'reward', 'defeat', 'victory'] as const;

for (const state of states) {
  test(`${state} 状态视觉基线`, async ({ page }, testInfo) => {
    const errors = captureBrowserErrors(page);
    await waitForGarden(page);
    await prepareVisualState(page, state);
    await expect(page.locator('canvas').first()).toHaveScreenshot(`${state}-${testInfo.project.name}.png`, {
      maxDiffPixelRatio: 0.02,
    });
    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);
  });
}
