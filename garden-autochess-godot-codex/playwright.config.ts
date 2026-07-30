import { defineConfig, devices } from '@playwright/test';

const port = Number.parseInt(process.env.WEB_PORT ?? '5194', 10);
const baseURL = process.env.WEB_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests',
  outputDir: './qa/test-results',
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}-{projectName}-{platform}{ext}',
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    },
  },
  reporter: [
    ['line'],
    ['html', { outputFolder: 'qa/playwright-report', open: 'never' }],
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: process.env.WEB_BASE_URL
    ? undefined
    : {
        command: 'npm run serve:web',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 20_000,
        env: {
          WEB_PORT: String(port),
          WEB_ROOT: process.env.WEB_ROOT ?? 'build/web',
          WEB_CROSS_ORIGIN_ISOLATION: process.env.WEB_CROSS_ORIGIN_ISOLATION ?? '0',
        },
      },
  projects: [
    {
      name: 'desktop-chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chromium',
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'mobile-chrome',
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium',
        channel: 'chromium',
      },
    },
  ],
});
