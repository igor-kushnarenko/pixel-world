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
  await page.addInitScript(()=>localStorage.setItem('pixel-world.apartment.v1',JSON.stringify({traffic:0})));
  await page.route('https://api.open-meteo.com/**',r=>r.fulfill({json:{current:{temperature_2m:13.4,weather_code:3,time:1793782800}}}));
  await page.route('https://geocoding-api.open-meteo.com/**',r=>r.fulfill({json:{results:[{name:'Токио',latitude:35.68,longitude:139.69,timezone:'Asia/Tokyo',country:'Япония'}]}}));
  await page.goto('http://127.0.0.1:4178/?paused');await page.waitForFunction(()=>!!window.atmosphere);
  await page.evaluate(()=>window.atmosphere.setParameters({life:{traffic:0,windowDrops:false}}));
  await page.locator('#enter-quiet').click();
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('#welcome')).opacity==='0');
  await page.waitForFunction(()=>document.querySelector('#real-weather').textContent.includes('13°'));
  assert.equal(await page.locator('#real-place').textContent(),'Анапа');
  assert.equal(await page.locator('#real-world').count(),0);
  assert.equal(await page.locator('.scene-dock').isVisible(),true);
  await page.locator('#menu-toggle').click();assert.equal(await page.locator('#panel-scene').isVisible(),true);
  assert.equal(await page.locator('#panel-audio').isVisible(),false);
  await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/ui-scene.png'});
  await page.locator('#nav-audio').click();assert.equal(await page.locator('#sound-toggle').isVisible(),true);
  assert.equal(await page.locator('#radio-toggle').isVisible(),true);assert.equal(await page.locator('#cloud-toggle').isVisible(),false);
  await page.locator('#nav-room').click();await page.locator('#lamp-left').click();assert.equal(await page.locator('#lamp-left').getAttribute('aria-pressed'),'true');
  const beforeComputer=await page.evaluate(()=>{const e=window.atmosphere,i=((e.height-1-690)*e.width+450)*4;return Array.from(e.readPixels().slice(i,i+3));});
  await page.locator('#computer-toggle').click();
  await page.waitForFunction(old=>{const e=window.atmosphere,i=((e.height-1-690)*e.width+450)*4;return e.getParameters().lighting.computerEnabled&&Array.from(e.readPixels().slice(i,i+3)).some((v,j)=>v!==old[j]);},beforeComputer);
  await page.keyboard.press('Escape');await page.screenshot({path:'artifacts/computer-weather.png'});
  const clip=await page.evaluate(()=>{const r=window.atmosphere.canvas.getBoundingClientRect(),s=r.width/1672;return{x:r.x+345*s,y:r.y+608*s,width:265*s,height:220*s};});
  await page.screenshot({path:'artifacts/computer-glass-detail.png',clip});
  await page.locator('#hit-computer').click();assert.equal(await page.evaluate(()=>window.atmosphere.getParameters().lighting.computerEnabled),false);
  await page.keyboard.press('c');assert.equal(await page.evaluate(()=>window.atmosphere.getParameters().lighting.computerEnabled),true);
  await page.locator('#nav-room').click();
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
  await page.locator('#menu-toggle').click();await page.locator('.city-weather summary').click();await page.locator('#city-query').fill('Токио');await page.locator('#city-form button').click();
  await page.locator('#city-results button').click();await page.waitForFunction(()=>document.querySelector('#real-place').textContent==='Токио');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('pixel-world.place.v1')).timezone),'Asia/Tokyo');
  assert.deepEqual(errors,[]);console.log('PASS: scene/audio/light/details navigation, controls, Escape focus and mobile/landscape layout; no browser errors');
}finally{await browser?.close();server.kill();}
