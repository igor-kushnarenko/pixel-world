import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4178'],{windowsHide:true,stdio:'ignore'});
let browser;
try{
  for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:4178')).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4178/?fresh&paused');await page.waitForFunction(()=>!!window.atmosphere);
  await page.evaluate(()=>window.atmosphere.setParameters({life:{traffic:0,windowDrops:false}}));
  await page.locator('#enter-quiet').click();
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('#welcome')).opacity==='0');
  assert.equal(await page.locator('.scene-dock').isVisible(),true);
  await page.locator('#menu-toggle').click();assert.equal(await page.locator('#panel-scene').isVisible(),true);
  assert.equal(await page.locator('#panel-audio').isVisible(),false);
  await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/ui-scene.png'});
  await page.locator('#nav-audio').click();assert.equal(await page.locator('#sound-toggle').isVisible(),true);
  assert.equal(await page.locator('#radio-toggle').isVisible(),true);assert.equal(await page.locator('#cloud-toggle').isVisible(),false);
  await page.locator('#nav-room').click();await page.locator('#lamp-left').click();assert.equal(await page.locator('#lamp-left').getAttribute('aria-pressed'),'true');
  await page.screenshot({path:'artifacts/ui-light.png'});
  await page.locator('#nav-detail').click();
  await page.getByText('Дымка и туман по планам',{exact:false}).click();
  await page.locator('summary').filter({hasText:'Дальний город'}).click();
  await page.locator('#atmo-far-hazeDensity').fill('22');await page.locator('#atmo-far-hazeDensity').dispatchEvent('input');
  assert.equal(await page.evaluate(()=>window.atmosphere.getParameters().weather.layers.far.hazeDensity),0.22);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#scene-menu').isVisible(),false);
  assert.equal(await page.locator('#nav-detail').evaluate(el=>el===document.activeElement),true);
  for(const viewport of [{width:390,height:844},{width:844,height:390}]){
    await page.setViewportSize(viewport);await page.locator('#menu-toggle').click();
    const fit=await page.evaluate(()=>{const p=document.querySelector('#scene-menu').getBoundingClientRect(),d=document.querySelector('.scene-dock').getBoundingClientRect();return p.left>=0&&p.right<=innerWidth&&p.top>=0&&p.bottom<=d.top&&d.right<=innerWidth&&d.left>=0&&document.documentElement.scrollWidth<=innerWidth;});
    assert.ok(fit,JSON.stringify(viewport));
    if(viewport.width===390)await page.screenshot({path:'artifacts/ui-mobile.png'});
    await page.keyboard.press('Escape');
  }
  assert.deepEqual(errors,[]);console.log('PASS: scene/audio/light/details navigation, controls, Escape focus and mobile/landscape layout; no browser errors');
}finally{await browser?.close();server.kill();}
