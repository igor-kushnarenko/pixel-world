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
  const response = await page.goto(new URL('?fresh', url).href, { waitUntil: 'networkidle', timeout: 60000 });
  const check = (label, condition) => { assert.ok(condition, label); report.checks.push(label); };
  check('Published page returns HTTP 200', response.status() === 200);
  await page.waitForFunction(() => !!window.atmosphere && !document.querySelector('#enter-quiet').disabled, undefined, { timeout: 30000 });
  const initial = await page.evaluate(() => ({ d: window.atmosphere.getDiagnostics(), p: window.atmosphere.getParameters() }));
  check('Public apartment renders natively at 1672x941', initial.d.logicalWidth === 1672 && initial.d.logicalHeight === 941 && initial.d.layers.some(l => l.id === 'apartment' && l.visible));
  check('Canonical start is moonless and cloudless', !initial.p.sky.moonEnabled && !initial.p.clouds.enabled);
  check('Audio waits for a user gesture', await page.locator('#audio-status').getAttribute('data-state') === 'locked');
  await page.locator('#enter-quiet').click();
  check('Quiet entrance leaves audio locked and menu closed', await page.locator('#audio-status').getAttribute('data-state') === 'locked' && await page.locator('#menu-toggle').getAttribute('aria-expanded') === 'false');
  await page.locator('#menu-toggle').click();
  await page.locator('#lamp-left').click(); await page.locator('#lamp-right').click();
  check('Room lights are independently controllable', await page.locator('#lamp-left').getAttribute('aria-pressed') === 'true' && await page.locator('#lamp-right').getAttribute('aria-pressed') === 'true');
  await page.locator('#cloud-toggle').click();
  check('Both procedural cloud fields are available', await page.evaluate(() => window.atmosphere.getDiagnostics().layers.filter(l => l.id.startsWith('cloud-')).every(l => l.visible)));
  await page.locator('#rain-toggle').click();
  check('Rain control updates GPU weather', await page.evaluate(() => window.atmosphere.getParameters().weather.rain > 0));
  await page.locator('#sound-toggle').click();
  await page.waitForFunction(() => document.querySelector('#audio-status').dataset.state === 'running');
  check('Ambient audio unlocks after an explicit click', await page.locator('#sound-toggle').getAttribute('aria-pressed') === 'true');
  await page.locator('#sound-toggle').click();
  check('Master mute is reflected in controls', await page.locator('#sound-toggle').getAttribute('aria-pressed') === 'false');
  const previousView = await page.locator('#view-name').textContent(); await page.locator('#view-next').click();
  check('Authored city layouts switch without replacing room art', await page.locator('#view-name').textContent() !== previousView);
  await page.locator('#reset-scene').click();
  check('Canonical reset powers down lamps and radio', await page.locator('#lamp-left').getAttribute('aria-pressed') === 'false' && await page.locator('#radio-toggle').getAttribute('aria-pressed') === 'false');
  check('Workshop navigation stays under the deployed project URL', (await page.locator('.menu-footer a').getAttribute('href')).startsWith(url.pathname));
  await page.setViewportSize({ width: 390, height: 844 });
  check('Mobile menu fits without document overflow', await page.evaluate(() => document.documentElement.scrollWidth === 390));
  check('No failed requests, JavaScript exceptions or shader errors', report.errors.length === 0 && report.requestsFailed.length === 0);
  await page.setViewportSize({ width: 1512, height: 1200 });
  await page.screenshot({ path: 'artifacts/published-site.png', fullPage: true });
  console.log(`PASS: ${report.checks.length} published-site checks at ${url.href}`);
} catch (error) {
  report.errors.push(error.stack || String(error)); process.exitCode = 1; console.error(error);
} finally {
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/deployment-report.json', JSON.stringify(report, null, 2));
  await browser.close();
}
