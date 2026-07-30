import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { PNG } from 'pngjs';
import process from 'node:process';

const url = process.env.WEB_BASE_URL ?? process.argv[2] ?? 'http://127.0.0.1:5194';
let serverProcess = null;

async function serverIsReady() {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

if (!(await serverIsReady()) && !process.env.WEB_BASE_URL && !process.argv[2]) {
  serverProcess = spawn(process.execPath, ['qa/server.mjs'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'ignore',
  });
  const deadline = Date.now() + 20_000;
  while (!(await serverIsReady()) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const consoleErrors = [];
const pageErrors = [];
page.on('console', (message) => message.type() === 'error' && consoleErrors.push(message.text()));
page.on('pageerror', (error) => pageErrors.push(error.message));

let report;
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const canvas = page.locator('canvas').first();
  await canvas.waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForFunction(() => Boolean(window.GardenTestBridge), undefined, { timeout: 30_000 });
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Godot canvas has no bounding box');
  const png = PNG.sync.read(await canvas.screenshot());
  let min = 255;
  let max = 0;
  let opaque = 0;
  const buckets = new Set();
  const stride = Math.max(1, Math.floor((png.width * png.height) / 8192));
  for (let pixel = 0; pixel < png.width * png.height; pixel += stride) {
    const offset = pixel * 4;
    const r = png.data[offset];
    const g = png.data[offset + 1];
    const b = png.data[offset + 2];
    const a = png.data[offset + 3];
    min = Math.min(min, r, g, b);
    max = Math.max(max, r, g, b);
    if (a > 0) opaque += 1;
    buckets.add(`${r >> 4},${g >> 4},${b >> 4},${a >> 6}`);
  }
  report = {
    url,
    canvas: { width: box.width, height: box.height },
    variance: max - min,
    colorBuckets: buckets.size,
    sampledOpaquePixels: opaque,
    consoleErrors,
    pageErrors,
  };
  const ok = box.width >= 32 && box.height >= 32 && max - min > 8 && buckets.size > 3 && opaque > 256;
  if (!ok || consoleErrors.length > 0 || pageErrors.length > 0) process.exitCode = 1;
} catch (error) {
  report = { url, error: error instanceof Error ? error.message : String(error), consoleErrors, pageErrors };
  process.exitCode = 1;
} finally {
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  serverProcess?.kill('SIGTERM');
}
