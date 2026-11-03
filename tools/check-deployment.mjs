import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const url = new URL(process.argv[2]);
if (url.protocol !== 'https:') throw new Error('Pass the published HTTPS site URL');
if (!url.pathname.endsWith('/')) url.pathname += '/';
const report = { url: url.href, checkedAt: new Date().toISOString(), checks: [], errors: [], requestsFailed: [] };
const chrome = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1512, height: 1200 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) report.requestsFailed.push({ url: r.url(), status: r.status() }); });
  const response = await page.goto(new URL('?paused', url).href, { waitUntil: 'networkidle', timeout: 60000 });
  const check = (label, condition) => { assert.ok(condition, label); report.checks.push(label); };
  check('Published page returns HTTP 200', response.status() === 200);
  await page.waitForFunction(() => !!window.atmosphere, { timeout: 30000 });
  const initial = await page.evaluate(() => ({ d: window.atmosphere.getDiagnostics(), p: window.atmosphere.getParameters() }));
  check('Public scene renders author city at 1890x1063', initial.d.logicalWidth === 1890 && initial.d.logicalHeight === 1063 && initial.d.layers.filter(l => l.id.startsWith('city-')).every(l => l.visible));
  check('Canonical start is moonless and cloudless', !initial.p.sky.moonEnabled && !initial.p.clouds.enabled);
  await page.locator('#city-view').click();
  check('PSD comparison works on project subpath', await page.evaluate(() => window.atmosphere.getDiagnostics().layers.find(l => l.id === 'reference-sky').visible));
  await page.locator('[data-preset="drifting"]').click();
  check('Cloud preset enables both cloud planes', await page.evaluate(() => window.atmosphere.getDiagnostics().layers.filter(l => l.id.startsWith('cloud-')).every(l => l.visible)));
  report.animationBefore = await page.evaluate(() => ({ diagnostics: window.atmosphere.getDiagnostics(), label: document.querySelector('#pause').textContent, visibility: document.visibilityState }));
  await page.locator('#pause').click();
  await page.waitForFunction(() => window.atmosphere.getDiagnostics().running && window.atmosphere.getDiagnostics().time > 0, undefined, { timeout: 15000, polling: 100 });
  report.animationAfter = await page.evaluate(() => window.atmosphere.getDiagnostics());
  check('Animation starts and advances on the published site', await page.evaluate(() => window.atmosphere.getDiagnostics().running && window.atmosphere.getDiagnostics().time > 0));
  await page.locator('#pause').click();
  await page.locator('#reset').click();
  const download = page.waitForEvent('download'); await page.locator('#save').click();
  check('Preset export works', (await download).suggestedFilename().endsWith('.json'));
  const links = await page.locator('.location-tools nav a').evaluateAll(a => a.map(l => l.href));
  check('Scene navigation stays under the deployed project URL', links.every(link => link.startsWith(url.href)));
  check('No failed requests, JavaScript exceptions or shader errors', report.errors.length === 0 && report.requestsFailed.length === 0);
  await page.screenshot({ path: 'artifacts/published-site.png', fullPage: true });
  console.log(`PASS: ${report.checks.length} published-site checks at ${url.href}`);
} catch (error) {
  report.errors.push(error.stack || String(error)); process.exitCode = 1; console.error(error);
} finally {
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/deployment-report.json', JSON.stringify(report, null, 2));
  await browser.close();
}
