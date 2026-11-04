import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const port = 4175;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { windowsHide: true, stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break; } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  browser = await chromium.launch({ executablePath: ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync), headless: true, args: process.env.CLOUD_TEST_HARDWARE ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/?scene=demo&paused`);
  await page.waitForFunction(() => !!window.atmosphere);
  const result = await page.evaluate(async () => {
    const { AtmosphereEngine } = await import('/src/engine/index.ts');
    const container = document.createElement('div'); document.body.append(container);
    const e = await AtmosphereEngine.create({ container, autoRender: false, scene: { width: 1672, height: 941 }, parameters: { clouds: { enabled: true, coverage: 0.85, density: 1, scale: 0.3, windSpeed: 1 } } });
    const checks = [];
    e.setParameters({ clouds: { enabled: false } }); const sky = e.readPixels();
    e.setParameters({ clouds: { enabled: true } });
    for (const plane of ['far', 'low']) {
      e.setParameters({ clouds: { layers: { far: { enabled: plane === 'far' }, low: { enabled: plane === 'low' } } } });
      const speed = e.getParameters().clouds.layers[plane].speed * 12;
      for (const seconds of [0, 60, 3600]) {
        e.seek(seconds); const a = e.readPixels();
        e.seek(seconds + 1 / speed); const b = e.readPixels();
        let changed = 0, compared = 0, cloudPixels = 0;
        // One pixel of wind must translate the same cloud, not regenerate it.
        for (let y = 0; y < 941; y++) for (let x = 1; x < 1672; x++) {
          if (a[(y * 1672 + x) * 4] !== sky[(y * 1672 + x) * 4]) cloudPixels++;
          for (let c = 0; c < 3; c++) {
            compared++; if (a[(y * 1672 + x - 1) * 4 + c] !== b[(y * 1672 + x) * 4 + c]) changed++;
          }
        }
        checks.push({ plane, seconds, changed, compared, cloudPixels });
      }
    }
    e.dispose(); container.remove(); return checks;
  });
  console.log(JSON.stringify({ result, errors }));
  await writeFile('artifacts/cloud-stability-report.json', JSON.stringify({ result, errors }, null, 2));
  assert.equal(errors.length, 0);
  assert.ok(result.every(c => c.changed === 0), 'Cloud pixels must remain identical when translated by one pixel');
  assert.ok(result.every(c => c.cloudPixels > 100), 'Each check must contain a visible cloud field');
} finally { await browser?.close(); server.kill(); }
