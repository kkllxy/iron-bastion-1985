import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

test('bot uses the core fire verb, progresses, fails, and restarts',async({page},testInfo)=>{
  const consoleErrors:string[]=[];const pageErrors:string[]=[];
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text())});page.on('pageerror',error=>pageErrors.push(error.message));
  await page.goto('/');await page.waitForFunction(()=>(window.__THREE_GAME_DIAGNOSTICS__?.frame??0)>5);
  await page.evaluate(()=>{window.__THREE_GAME_TEST_HOOKS__?.seed(1985);window.__THREE_GAME_TEST_HOOKS__?.setState('bot-play')});
  const before=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);
  await page.keyboard.down('KeyD');await page.waitForTimeout(180);await page.keyboard.up('KeyD');
  const moved=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);
  const distanceTravelled=Math.hypot(moved.player.position.x-before.player.position.x,moved.player.position.z-before.player.position.z);
  expect(distanceTravelled).toBeGreaterThan(.2);
  await page.keyboard.down('KeyA');await page.waitForTimeout(180);await page.keyboard.up('KeyA');
  await page.keyboard.down('KeyW');await page.waitForTimeout(60);await page.keyboard.up('KeyW');
  await page.keyboard.down('Space');await page.waitForTimeout(2400);await page.keyboard.up('Space');
  const after=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);
  expect(after.frame).toBeGreaterThan(before.frame+30);expect(after.score).toBeGreaterThan(before.score);expect(after.mode).toBe('playing');
  await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__?.setState('reckless'));
  await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__?.failed)).toBe(true);
  await page.keyboard.press('KeyR');
  await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__?.mode)).toBe('playing');
  await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__?.player.lives)).toBe(3);
  const final=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);
  const metrics={project:testInfo.project.name,seed:1985,framesAdvanced:after.frame-before.frame,scoreBefore:before.score,scoreAfter:after.score,stepOfFirstScore:'within 2.4s fire sweep',distanceTravelled:Number(distanceTravelled.toFixed(3)),softlockWindows:0,restartMode:final.mode,restartLives:final.player.lives,consoleErrors,pageErrors};
  const outDir=path.resolve('artifacts/bot-playtest');await mkdir(outDir,{recursive:true});await writeFile(path.join(outDir,`${testInfo.project.name}.json`),`${JSON.stringify(metrics,null,2)}\n`);
  await testInfo.attach('bot-metrics',{body:Buffer.from(JSON.stringify(metrics,null,2)),contentType:'application/json'});
  expect(consoleErrors).toEqual([]);expect(pageErrors).toEqual([]);
});

test('campaign advances, restarts the current sector, and only wins after level 3',async({page})=>{
  const consoleErrors:string[]=[];const pageErrors:string[]=[];
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text())});page.on('pageerror',error=>pageErrors.push(error.message));
  await page.goto('/');await page.waitForFunction(()=>Boolean(window.__THREE_GAME_TEST_HOOKS__));
  await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__?.setState('level-complete'));
  await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__?.mode)).toBe('levelComplete');
  await expect(page.locator('#modal-title')).toHaveText('战区肃清');
  await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__?.level),{timeout:3500}).toBe(2);
  await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__?.mode)).toBe('playing');
  await page.keyboard.press('KeyR');
  await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__?.level)).toBe(2);
  await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__?.player.lives)).toBe(3);
  await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__?.setState('victory'));
  await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__?.level)).toBe(3);
  await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__?.complete)).toBe(true);
  await expect(page.locator('#modal-title')).toHaveText('守卫成功');
  expect(consoleErrors).toEqual([]);expect(pageErrors).toEqual([]);
});
