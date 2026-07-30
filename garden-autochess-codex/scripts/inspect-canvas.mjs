import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';

const server=spawn('npm',['run','dev'],{stdio:'ignore',shell:false});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{
  for(let i=0;i<40;i++){try{const r=await fetch('http://127.0.0.1:5195');if(r.ok)break}catch{}await wait(250)}
  const browser=await chromium.launch({channel:'chromium'});const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5195');await page.getByRole('button',{name:'开始守园'}).click();await wait(500);
  const canvas=page.locator('canvas');const box=await canvas.boundingBox();const shot=await canvas.screenshot();
  if(!box||box.width<300||box.height<300)throw new Error('Canvas 尺寸异常');
  if(shot.length<20_000)throw new Error(`Canvas 截图疑似空白: ${shot.length} bytes`);
  if(errors.length)throw new Error(`浏览器错误: ${errors.join(' | ')}`);
  console.log(JSON.stringify({ok:true,width:box.width,height:box.height,screenshotBytes:shot.length,consoleErrors:0}));
  await browser.close();
}finally{server.kill('SIGTERM')}
