import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4177'],{windowsHide:true,stdio:'ignore'});
let browser;
try {
  for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:4177')).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage(); const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4177/?fresh&paused');
  await page.waitForFunction(()=>!!window.atmosphere);
  const checks=await page.evaluate(async()=>{
    const {AtmosphereEngine}=await import('/src/engine/index.ts');
    const image=(color,x,y,w,h)=>{const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.fillRect(x,y,w,h);return c;};
    const host=document.createElement('div');document.body.append(host);
    const e=await AtmosphereEngine.create({container:host,autoRender:false,scene:{width:64,height:64,windowMask:image('white',8,8,48,48),layers:[
      {id:'back',scope:'world',depth:20,source:image('#000000',0,0,64,64)},
      {id:'front',scope:'world',depth:40,source:image('#00aa00',32,0,32,64)},
      {id:'room',scope:'room',depth:100,source:image('#0000aa',0,0,64,8)}
    ]}});
    const at=(a,x,y)=>Array.from(a.slice(((63-y)*64+x)*4,((63-y)*64+x)*4+3));
    const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
    const off=e.readPixels();
    e.setParameters({weather:{layers:{back:{hazeDensity:1}}}}); const haze=e.readPixels();
    const result={count:Object.keys(e.getParameters().weather.layers).length===2,
      uniform:same(at(haze,16,20),at(haze,16,44)),
      visible:!same(at(off,16,20),at(haze,16,20)),
      occluded:same(at(off,44,20),at(haze,44,20)),
      room:same(at(off,16,4),at(haze,16,4)),
      mask:same(at(off,4,20),at(haze,4,20))};
    e.setParameters({weather:{layers:{back:{hazeDensity:0},front:{fogDensity:1,fogAmount:0.5}}}});
    const fog=e.readPixels();
    result.topClear=same(at(off,16,16),at(fog,16,16));
    result.bottomDense=at(fog,16,52).reduce((a,b)=>a+b)>at(fog,16,40).reduce((a,b)=>a+b);
    e.setParameters({weather:{layers:{front:{billowing:1}}}});e.seek(0);const a=e.readPixels();e.seek(15);const b=e.readPixels();
    result.billowing=a.some((v,i)=>v!==b[i]);
    const preset=e.exportPreset();e.applyPreset('canonical');e.importPreset(preset);e.seek(15);
    result.roundtrip=same(Array.from(e.readPixels()),Array.from(b));
    let rejected=false;try{e.setParameters({weather:{layers:{room:{fogDensity:1}}}});}catch{rejected=true;}
    result.atomic=rejected&&e.exportPreset()===preset;
    e.dispose();host.remove();return result;
  });
  console.log(JSON.stringify({checks,errors}));
  assert.ok(Object.values(checks).every(Boolean));assert.equal(errors.length,0);
  await page.locator('#enter-quiet').click();await page.locator('#menu-toggle').click();
  await page.locator('summary').filter({hasText:'Дымка и туман по планам'}).click();
  await page.locator('summary').filter({hasText:'Дальний город'}).click();
  await page.locator('#atmo-far-hazeDensity').fill('35');await page.locator('#atmo-far-hazeDensity').dispatchEvent('input');
  assert.equal(await page.evaluate(()=>window.atmosphere.getParameters().weather.layers.far.hazeDensity),0.35);
  const life=await page.evaluate(()=>{
    const e=window.atmosphere;e.setParameters({life:{traffic:1,beacons:true,windowDrops:true},weather:{rain:1}});
    e.seek(0);const first=e.readPixels();e.update(2);const second=e.readPixels();
    const trafficMoves=first.some((v,i)=>v!==second[i]);
    for(let i=0;i<10;i++)e.update(1);
    const capture=()=>{const c=document.createElement('canvas');c.width=e.width;c.height=e.height;const ctx=c.getContext('2d');ctx.drawImage(e.canvas,0,0);return ctx.getImageData(0,0,c.width,c.height).data;};
    e.setParameters({life:{windowDrops:false}});e.render();const dry=capture();
    e.setParameters({life:{windowDrops:true}});e.render();const wet=capture();
    let changed=0,roomLeaks=0;
    for(let y=0;y<e.height;y++)for(let x=0;x<e.width;x++){
      const i=(y*e.width+x)*4;
      if(dry[i]!==wet[i]||dry[i+1]!==wet[i+1]||dry[i+2]!==wet[i+2]){
        changed++;if(y<100||y>850||x<100||x>1630)roomLeaks++;
      }
    }
    return {trafficMoves,changed,roomLeaks};
  });
  console.log(JSON.stringify({life}));assert.ok(life.trafficMoves&&life.changed>0&&life.roomLeaks===0);
  console.log('PASS: 11 GPU/API checks and apartment menu control');
}finally{await browser?.close();server.kill();}
