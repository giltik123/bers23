import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';

const host='127.0.0.1',port=4827;
const origin=`http://${host}:${port}`;
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host',host,'--port',String(port),'--strictPort'],{
  env:{...process.env,VITE_CORE_API_URL:'http://127.0.0.1:4828/api/core'},stdio:['ignore','pipe','pipe'],
});
let logs='';
for(const stream of [vite.stdout,vite.stderr])stream.on('data',chunk=>{logs+=String(chunk).slice(-2000);});
let browser;
try {
  let ready=false;
  for(let attempt=0;attempt<80;attempt++){
    if(vite.exitCode!==null)throw new Error(`Vite exited early: ${logs.slice(-2000)}`);
    try {
      const response=await fetch(`${origin}/tests/editor-quality-inspector-browser.html`,{signal:AbortSignal.timeout(2500)});
      if(response.ok){ready=true;break;}
    } catch{}
    await sleep(350);
  }
  if(!ready)throw new Error(`Editor Quality Inspector Vite harness failed to start: ${logs.slice(-2000)}`);
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1000,height:740}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${origin}/tests/editor-quality-inspector-browser.html`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('[data-testid="quality-compare-viewport"] img')).length===2 &&
    Array.from(document.querySelectorAll('[data-testid="quality-compare-viewport"] img')).every(x=>x.naturalWidth>0));
  await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(
    button => button.textContent?.trim() === 'Split view' && !button.disabled,
  ));
  assert.equal(await page.getByRole('button',{name:'Split view'}).isEnabled(),true,
    'same-geometry images may be compared in split mode');
  await page.getByRole('button',{name:'Split view'}).click();
  const slider=page.getByRole('slider',{name:'Comparison split position'});
  assert.equal(await slider.inputValue(),'50');
  await slider.press('ArrowRight');
  assert.equal(await slider.inputValue(),'51','keyboard split control must move a percent step');
  const clip=await page.locator('[data-testid="quality-compare-viewport"] [style*="clip-path"]').getAttribute('style');
  assert.match(clip,/inset\(0(?:px)? 0(?:px)? 0(?:px)? 51%\)/u);
  await page.getByRole('button',{name:'Zoom in'}).click();
  await page.getByRole('button',{name:'Zoom in'}).click();
  assert.match(await page.getByRole('region',{name:/Before and after image inspection/}).innerText(),/Before[\s\S]*After/u);
  const viewport=page.getByRole('region',{name:/Before and after image inspection/});
  await viewport.focus();
  await viewport.press('ArrowRight');
  const transforms=await viewport.locator('img').evaluateAll(items=>items.map(x=>x.style.transform));
  assert.equal(transforms.length,2);
  assert.equal(transforms[0],transforms[1],'zoom + pan must be identical for both image layers');
  assert.match(transforms[0],/scale\(4\)/u);
  assert.notEqual(transforms[0],'translate(0%, 0%) scale(4)','keyboard panning must work');
  await page.getByRole('button',{name:'Reset image view'}).click();
  assert.match(await viewport.locator('img').first().getAttribute('style'),/scale\(1\)/u);
  assert.deepEqual(await page.evaluate(()=>window.__qualityInspectorActions),[],
    'preview-only zoom, pan and split must not trigger Project Accept or any edit');
  await page.getByRole('button',{name:'Accept'}).click();
  await page.getByRole('button',{name:'Retry'}).click();
  await page.getByRole('button',{name:'Discard'}).click();
  assert.deepEqual(await page.evaluate(()=>window.__qualityInspectorActions),['accept','retry','discard']);
  await page.goto(`${origin}/tests/editor-quality-inspector-browser.html?mismatch=1`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!document.querySelector('[role="status"]'));
  assert.equal(await page.getByRole('button',{name:'Split view'}).isDisabled(),true,
    'different source and result dimensions must not permit misleading registered split');
  assert.match(await page.getByRole('status').innerText(),/identical image dimensions/u);
  await page.goto(`${origin}/tests/editor-quality-inspector-browser.html?badImage=1`,{waitUntil:'networkidle'});
  await page.getByRole('alert').waitFor({state:'visible'});
  assert.match(await page.getByRole('alert').innerText(),/could not be loaded/u);
  assert.deepEqual(errors,[],`No uncaught browser UI exceptions allowed: ${errors.join('; ')}`);
  console.log('EDITOR_QUALITY_INSPECTOR_BROWSER_ACCEPTED: dimensions, split keyboard, shared zoom/pan, reset, callbacks, missing image');
} finally {
  await browser?.close();
  vite.kill('SIGTERM');
}
