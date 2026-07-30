import { expect, type Page } from '@playwright/test';

export type GardenSnapshot = Record<string, unknown> & {
  phase?: string | number;
  wave?: number;
  defense_hp?: number;
  defenseHp?: number;
  score?: number;
  sun?: number;
  shop?: unknown[];
};

export type BrowserErrors = {
  consoleErrors: string[];
  pageErrors: string[];
};

export function captureBrowserErrors(page: Page): BrowserErrors {
  const errors: BrowserErrors = { consoleErrors: [], pageErrors: [] };
  page.on('console', (message) => {
    if (message.type() === 'error') errors.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => errors.pageErrors.push(error.message));
  return errors;
}

function normalize(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

export async function waitForGarden(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => {
    const candidate = (window as unknown as { GardenTestBridge?: unknown }).GardenTestBridge;
    return candidate !== undefined && candidate !== null;
  }, undefined, { timeout: 30_000 });
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => bridgeSnapshot(page), { timeout: 30_000 }).not.toBeNull();
}

export async function bridgeCall<T = unknown>(
  page: Page,
  names: string | string[],
  ...args: unknown[]
): Promise<T> {
  const aliases = Array.isArray(names) ? names : [names];
  const result = await page.evaluate(
    async ({ aliases: methodNames, args: methodArgs }) => {
      const bridge = (window as unknown as { GardenTestBridge?: Record<string, unknown> }).GardenTestBridge;
      if (!bridge) throw new Error('window.GardenTestBridge is missing');

      for (const name of methodNames) {
        const method = bridge[name];
        if (typeof method === 'function') {
          return await (method as (...values: unknown[]) => unknown).apply(bridge, methodArgs);
        }
      }

      for (const dispatcherName of ['invoke', 'callMethod', 'call_method']) {
        const dispatcher = bridge[dispatcherName];
        if (typeof dispatcher === 'function') {
          return await (dispatcher as (...values: unknown[]) => unknown).call(
            bridge,
            methodNames[0],
            ...methodArgs,
          );
        }
      }

      throw new Error(
        `GardenTestBridge method missing: ${methodNames.join(' / ')}; available: ${Object.keys(bridge).join(', ')}`,
      );
    },
    { aliases, args },
  );
  return normalize(result) as T;
}

export async function bridgeSnapshot(page: Page): Promise<GardenSnapshot | null> {
  try {
    return await bridgeCall<GardenSnapshot>(page, ['snapshot', 'get_snapshot', 'getSnapshot']);
  } catch {
    return null;
  }
}

export async function newRun(page: Page, seed: number): Promise<void> {
  await bridgeCall(page, ['new_run', 'newRun'], seed);
  await expect.poll(async () => bridgeSnapshot(page)).not.toBeNull();
}

export function phaseOf(snapshot: GardenSnapshot): string {
  return String(snapshot.phase ?? snapshot.game_phase ?? snapshot.gamePhase ?? '').toLowerCase();
}

export function numberField(snapshot: GardenSnapshot, ...names: string[]): number {
  for (const name of names) {
    const value = snapshot[name];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return Number.NaN;
}

export function shopOf(snapshot: GardenSnapshot): unknown[] {
  const value = snapshot.shop ?? snapshot.shop_items ?? snapshot.shopItems;
  return Array.isArray(value) ? value : [];
}

export async function readChineseUiText(page: Page): Promise<string> {
  const value = await bridgeCall<unknown>(page, [
    'ui_strings',
    'get_ui_strings',
    'getUiStrings',
    'visible_text',
  ]);
  if (Array.isArray(value)) return value.join('\n');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value ?? '');
}

export async function prepareVisualState(page: Page, state: string): Promise<void> {
  await bridgeCall(page, ['prepare_visual_state', 'prepareVisualState', 'set_test_state'], state);
  try {
    await bridgeCall(page, ['set_reduced_motion', 'setReducedMotion'], true);
  } catch {
    // A fixed model state is the hard requirement; reduced motion is an optional bridge convenience.
  }
  try {
    await bridgeCall(page, ['set_paused_for_screenshot', 'setPausedForScreenshot'], true);
  } catch {
    // Some views keep rendering while the deterministic model is already frozen by prepare_visual_state.
  }
  await page.waitForTimeout(250);
}

export async function runAutoplayChunk(page: Page, steps: number, delta: number): Promise<void> {
  await page.evaluate(
    async ({ steps: count, delta: frameDelta }) => {
      const bridge = (window as unknown as { GardenTestBridge?: Record<string, unknown> }).GardenTestBridge;
      if (!bridge) throw new Error('window.GardenTestBridge is missing');
      const findMethod = (names: string[]) => {
        for (const name of names) {
          if (typeof bridge[name] === 'function') return bridge[name] as (...args: unknown[]) => unknown;
        }
        throw new Error(`GardenTestBridge method missing: ${names.join(' / ')}`);
      };
      const autoplay = findMethod(['autoplay_step', 'autoplayStep']);
      const advance = findMethod(['advance']);
      for (let index = 0; index < count; index += 1) {
        await autoplay.call(bridge);
        await advance.call(bridge, frameDelta);
      }
    },
    { steps, delta },
  );
}
