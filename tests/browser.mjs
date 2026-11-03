import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';

const port = 4173;
const basePath = process.env.PAGES_BASE_PATH ?? '/';
const siteBase = new URL(basePath, `http://127.0.0.1:${port}`).href;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'pipe', windowsHide: true });
let serverError = ''; server.stderr.on('data', chunk => { serverError += chunk.toString(); });
const result = { browser: '', checks: [], errors: [], screenshots: [], gpu: null };
let browser;
try {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error(`Preview server stopped: ${serverError}`);
    try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break; } catch { /* starting */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  const chrome = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
  browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  result.browser = browser.version();
  const page = await browser.newPage({ viewport: { width: 1512, height: 1200 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => result.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') result.errors.push(`${message.text()} ${message.location().url}`); });
  await page.goto(`${siteBase}?scene=demo&paused`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.atmosphere, { timeout: 20000 });
  const check = (name, condition) => { assert.ok(condition, name); result.checks.push(name); };
  const initial = await page.evaluate(() => window.atmosphere.getParameters());
  check('Canonical start: night, no moon, no clouds, no interior appliances', initial.timeOfDay === 22 && !initial.sky.moonEnabled && !initial.clouds.enabled && !initial.lighting.interiorLightsEnabled && !initial.lighting.radioBacklightEnabled && !initial.lighting.computerEnabled);
  result.gpu = await page.evaluate(() => {
    const engine = window.atmosphere, gl = engine.canvas.getContext('webgl2');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), diagnostics: engine.getDiagnostics() };
  });
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/demo-canonical.png', fullPage: true }); result.screenshots.push('demo-canonical.png');
  const canvasShot = await page.locator('.atmosphere-canvas').screenshot();
  const blocks = await page.evaluate(async base64 => {
    const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
    const c = document.createElement('canvas'); c.width = image.width; c.height = image.height;
    const ctx = c.getContext('2d'); ctx.drawImage(image, 0, 0); const rgba = ctx.getImageData(0, 0, c.width, c.height).data;
    const s = window.atmosphere.getDiagnostics().integerScale; let mismatched = 0;
    for (let y = 0; y < c.height; y += s) for (let x = 0; x < c.width; x += s) {
      const root = (y * c.width + x) * 4;
      for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) for (let ch = 0; ch < 4; ch++)
        if (rgba[((y + dy) * c.width + x + dx) * 4 + ch] !== rgba[root + ch]) mismatched++;
    }
    return { mismatched, scale: s, width: c.width };
  }, canvasShot.toString('base64'));
  result.pixelBlocks = blocks;
  check('Final display: every logical pixel becomes an identical 2x2 block', blocks.scale === 2 && blocks.width === 960 && blocks.mismatched === 0);
  const pixels = () => page.evaluate(() => Array.from(window.atmosphere.readPixels()));
  const base = await pixels();
  check('GPU framebuffer is nonempty and opaque', base.some((v, i) => i % 4 < 3 && v > 20) && base.every((v, i) => i % 4 !== 3 || v === 255));
  await page.locator('[data-preset="drifting"]').click();
  await page.evaluate(() => window.atmosphere.seek(0));
  const cloudy = await pixels();
  check('Cloud preset changes the GPU image', cloudy.some((v, i) => v !== base[i]));
  await page.screenshot({ path: 'artifacts/demo-clouds.png', fullPage: true }); result.screenshots.push('demo-clouds.png');

  const pixelChecks = await page.evaluate(() => {
    const e = window.atmosphere;
    e.setParameters({ sky: { horizonGlow: 0.15 }, clouds: { enabled: false } }); e.seek(0);
    const a = e.readPixels();
    e.setParameters({ clouds: { enabled: true, coverage: 1, density: 1 } }); e.seek(0);
    const b = e.readPixels();
    const equalAt = (x, y) => { const i = ((269 - y) * 480 + x) * 4; return a.slice(i, i + 4).every((v, j) => v === b[i + j]); };
    let maskLeaks = 0, changedSky = 0, hiddenBehindCity = true;
    for (let y = 0; y < 270; y++) for (let x = 0; x < 480; x++) {
      const opening = x >= 29 && x < 451 && y >= 17 && y < 222 && !(x >= 238 && x < 243) && !(y >= 66 && y < 70);
      if (!opening && !equalAt(x, y)) maskLeaks++;
      if (opening && y < 35 && !equalAt(x, y)) changedSky++;
    }
    // This facade is opaque at depth 40, in front of both default cloud planes.
    for (let y = 80; y < 185; y++) for (let x = 180; x < 208; x++) if (!equalAt(x, y)) hiddenBehindCity = false;
    // Far cloud alone must have a visible, independently moving GPU result.
    e.setParameters({ clouds: { layers: { low: { enabled: false } } } }); e.seek(0); const far0 = e.readPixels(); e.update(40); const far1 = e.readPixels();
    const farMoves = far0.some((v, i) => v !== far1[i]);
    e.setParameters({ clouds: { layers: { far: { enabled: false }, low: { enabled: true } } } }); e.seek(0); const low0 = e.readPixels(); e.update(40); const low1 = e.readPixels();
    const lowMoves = low0.some((v, i) => v !== low1[i]);
    e.setParameters({ clouds: { layers: { low: { thickness: 1, height: 0.5, depth: 30 } } } }); e.seek(0); const behind = e.readPixels();
    e.setParameters({ clouds: { layers: { low: { depth: 45 } } } }); const inFront = e.readPixels();
    let depthChangesFacade = false;
    for (let y = 80; y < 185; y++) for (let x = 180; x < 208; x++) {
      const i = ((269 - y) * 480 + x) * 4; if (behind[i] !== inFront[i]) depthChangesFacade = true;
    }
    e.setParameters({ clouds: { windSpeed: 0 } }); e.seek(0); const stopped = e.readPixels(); e.update(10); const still = e.readPixels();
    const windStops = stopped.every((v, i) => v === still[i]);
    e.applyPreset('drifting'); e.seek(0); const static0 = e.readPixels(); e.update(0.00001); const static1 = e.readPixels();
    const tinyStepStable = static0.every((v, i) => v === static1[i]);
    const saved = e.exportPreset(); e.seek(13); const replayA = e.readPixels(); e.applyPreset('storm'); e.importPreset(saved); e.seek(13); const replayB = e.readPixels();
    const repeatable = replayA.every((v, i) => v === replayB[i]);
    const beforeInvalid = e.exportPreset(); let rejected = false; try { e.importPreset('{"clouds":{"density":99}}'); } catch { rejected = true; }
    const atomicImport = rejected && e.exportPreset() === beforeInvalid;
    e.applyPreset('canonical'); const noFlash = !e.triggerLightning();
    e.applyPreset('storm'); e.seek(0); const beforeFlash = e.readPixels(); const accepted = e.triggerLightning(); const duringFlash = e.readPixels();
    const idx = (x, y) => ((269 - y) * 480 + x) * 4;
    const brighter = (x, y) => duringFlash[idx(x, y)] > beforeFlash[idx(x, y)];
    const synchronizedFlash = accepted && brighter(45, 24) && brighter(183, 90) && brighter(150, 222);
    return { maskLeaks, changedSky, hiddenBehindCity, farMoves, lowMoves, depthChangesFacade, windStops, tinyStepStable, repeatable, atomicImport, noFlash, synchronizedFlash };
  });
  check('Window mask: zero changed pixels outside the aperture, including frame', pixelChecks.maskLeaks === 0);
  check('Cloud planes are occluded by an opaque foreground building', pixelChecks.hiddenBehindCity);
  check('Far cloud field renders and moves on GPU', pixelChecks.farMoves);
  check('Low cloud field renders and moves on GPU', pixelChecks.lowMoves);
  check('Changing cloud depth moves it in front of the city facade', pixelChecks.depthChangesFacade);
  check('Zero wind freezes cloud translation', pixelChecks.windStops);
  check('Tiny time increments do not cause subpixel shimmer', pixelChecks.tinyStepStable);
  check('Export/import plus seek reproduces exact framebuffer bytes', pixelChecks.repeatable);
  check('Invalid preset import is rejected atomically', pixelChecks.atomicImport);
  check('Lightning is disabled in canonical preset', pixelChecks.noFlash);
  check('Explicit storm flash synchronizes sky, city and sill receivers', pixelChecks.synchronizedFlash);
  await page.locator('[data-preset="storm"]').click();
  await page.evaluate(() => window.atmosphere.seek(4));
  await page.screenshot({ path: 'artifacts/demo-storm.png', fullPage: true }); result.screenshots.push('demo-storm.png');
  await page.locator('#city-view').click();
  check('Panorama disables the room and its lights', (await page.evaluate(() => window.atmosphere.getDiagnostics().layers.filter(l => l.id.startsWith('room')).every(l => !l.visible))));
  await page.locator('[data-preset="dawn"]').click();
  await page.screenshot({ path: 'artifacts/demo-dawn.png', fullPage: true }); result.screenshots.push('demo-dawn.png');
  await page.locator('#room-view').click(); await page.locator('#reset').click();
  await page.locator('#cloud-enabled').check();
  check('Cloud switch enables coverage from canonical zero', (await page.evaluate(() => { const p = window.atmosphere.getParameters(); return p.clouds.enabled && p.clouds.coverage > 0; })));
  await page.locator('#wind-speed').fill('0.8'); await page.locator('#wind-speed').dispatchEvent('input');
  check('Slider controls update engine parameters', (await page.evaluate(() => window.atmosphere.getParameters().clouds.windSpeed)) === 0.8);
  await page.locator('#reset').click();
  const file = { ...initial, timeOfDay: 7 };
  await page.locator('#preset-file').setInputFiles({ name: 'preset.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await page.waitForFunction(() => window.atmosphere.getParameters().timeOfDay === 7);
  check('JSON file import updates scene and control values', await page.locator('#time').inputValue() === '7');
  const downloadPromise = page.waitForEvent('download'); await page.locator('#save').click();
  const download = await downloadPromise; check('Preset download is offered as JSON', download.suggestedFilename().endsWith('.json'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  const mobile = await page.evaluate(() => { const c = window.atmosphere.canvas; return { document: document.documentElement.scrollWidth, viewport: innerWidth, width: c.width, cssWidth: parseFloat(c.style.width), diagnostics: window.atmosphere.getDiagnostics() }; });
  check('Narrow layout preserves native pixel grid and scrolls scene locally', mobile.document <= mobile.viewport && mobile.width === 480 && mobile.cssWidth === 480 && mobile.diagnostics.integerScale === 1);
  await page.screenshot({ path: 'artifacts/demo-mobile.png', fullPage: true }); result.screenshots.push('demo-mobile.png');
  check('No browser exceptions or shader compiler errors', result.errors.length === 0);
  const assetChecks = await page.evaluate(async () => {
    const Engine = window.atmosphere.constructor;
    const host = document.createElement('div'); host.style.cssText = 'width:80px;height:80px;display:flex'; document.body.append(host);
    const asset = document.createElement('canvas'); asset.width = 4; asset.height = 4;
    const ctx = asset.getContext('2d'); ctx.fillStyle = '#e04b7a'; ctx.fillRect(0, 0, 4, 4); ctx.clearRect(1, 1, 1, 1);
    const png = asset.toDataURL('image/png');
    const instance = await Engine.create({ container: host, scene: { width: 8, height: 8, background: '#123456', layers: [{ id: 'original-png', source: png, depth: 20, scope: 'world', x: 2, y: 2 }] } });
    instance.setLayerVisible('sky', false); const data = instance.readPixels();
    const at = (x, y) => Array.from(data.slice(((7 - y) * 8 + x) * 4, ((7 - y) * 8 + x) * 4 + 4));
    const originalPixels = JSON.stringify(at(2, 2)) === JSON.stringify([224, 75, 122, 255]);
    const transparentHole = JSON.stringify(at(3, 3)) === JSON.stringify([18, 52, 86, 255]);
    const nativePosition = JSON.stringify(at(1, 2)) === JSON.stringify([18, 52, 86, 255]) && JSON.stringify(at(6, 2)) === JSON.stringify([18, 52, 86, 255]);
    const unmodifiedSource = asset.toDataURL('image/png') === png;
    instance.dispose(); let mismatchedMaskRejected = false;
    try { await Engine.create({ container: host, scene: { width: 8, height: 8, windowMask: png } }); }
    catch { mismatchedMaskRejected = host.querySelectorAll('canvas').length === 0; }
    host.remove(); return { originalPixels, transparentHole, nativePosition, unmodifiedSource, mismatchedMaskRejected };
  });
  check('PNG import preserves authored colors, native dimensions and integer placement', assetChecks.originalPixels && assetChecks.nativePosition && assetChecks.unmodifiedSource);
  check('Straight alpha holes reveal the correct background without color halos', assetChecks.transparentHole);
  check('Mismatched masks are rejected and failed creation cleans up its canvas', assetChecks.mismatchedMaskRejected);
  await page.evaluate(() => { window.atmosphere.dispose(); window.atmosphere.dispose(); });
  check('Disposal is idempotent and removes canvas', await page.locator('.atmosphere-canvas').count() === 0);

  // Author-supplied city: test actual PSD placement separately from synthetic fixtures.
  const manifest = JSON.parse(await readFile('public/assets/nightcity/manifest.json', 'utf8'));
  let hashesMatch = true;
  for (const entry of [...manifest.originals, ...manifest.layersBottomToTop]) {
    const bytes = await readFile(`public/assets/nightcity/${entry.file}`);
    hashesMatch &&= createHash('sha256').update(bytes).digest('hex') === entry.sha256;
  }
  // PSD is retained locally; public source checkouts contain the prepared PNGs.
  result.sourcePsdPresent = existsSync(manifest.sourcePsd.file);
  if (result.sourcePsdPresent) {
    const psdBytes = await readFile(manifest.sourcePsd.file);
    hashesMatch &&= createHash('sha256').update(psdBytes).digest('hex') === manifest.sourcePsd.sha256;
  }
  check('Available original source and exported layer hashes match the import manifest', hashesMatch);
  await page.setViewportSize({ width: 2000, height: 1400 });
  await page.goto(`${siteBase}?paused&view=psd`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.atmosphere);
  const dimensions = await page.evaluate(() => window.atmosphere.getDiagnostics());
  check('Author city uses the PSD canvas 1890x1063 without resizing', dimensions.logicalWidth === 1890 && dimensions.logicalHeight === 1063 && dimensions.integerScale === 1);
  const referenceComparison = await page.evaluate(async () => {
    const e = window.atmosphere;
    const image = new Image(); image.src = 'assets/nightcity/reference-psd.png'; await image.decode();
    const c = document.createElement('canvas'); c.width = image.width; c.height = image.height;
    const ctx = c.getContext('2d'); ctx.drawImage(image, 0, 0);
    const reference = ctx.getImageData(0, 0, c.width, c.height).data, actual = e.readPixels();
    let maxDifference = 0, pixelsOver2 = 0, totalDifference = 0;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const a = ((c.height - 1 - y) * c.width + x) * 4, b = (y * c.width + x) * 4; let pixelMax = 0;
      for (let ch = 0; ch < 3; ch++) { const diff = Math.abs(actual[a + ch] - reference[b + ch]); maxDifference = Math.max(maxDifference, diff); pixelMax = Math.max(pixelMax, diff); totalDifference += diff; }
      if (pixelMax > 2) pixelsOver2++;
    }
    return { maxDifference, pixelsOver2, meanChannelDifference: totalDifference / (c.width * c.height * 3), width: c.width, height: c.height };
  });
  result.cityReferenceComparison = referenceComparison;
  check('GPU city composite matches PSD reference within 2 levels of RGBA8 rounding', referenceComparison.maxDifference <= 2 && referenceComparison.pixelsOver2 === 0);
  check('PSD comparison disables atmosphere controls and animation', await page.locator('#time').isDisabled() && await page.locator('#pause').isDisabled());
  const referenceDownloadPromise = page.waitForEvent('download'); await page.locator('#snapshot').click();
  await (await referenceDownloadPromise).saveAs('artifacts/nightcity-psd.png');
  const exported = await readFile('artifacts/nightcity-psd.png');
  check('Scene snapshot exports the entire native canvas, including offscreen pixels', exported.readUInt32BE(16) === 1890 && exported.readUInt32BE(20) === 1063);
  await page.locator('#room-view').click();
  const liveState = await page.evaluate(() => ({ params: window.atmosphere.getParameters(), diagnostics: window.atmosphere.getDiagnostics() }));
  check('Live sky mode replaces only PSD background and sky, retaining all four city layers', liveState.diagnostics.layers.filter(l => l.id.startsWith('city-')).length === 4 && liveState.diagnostics.layers.filter(l => l.id.startsWith('city-')).every(l => l.visible) && liveState.diagnostics.layers.find(l => l.id === 'sky').visible && !liveState.diagnostics.layers.find(l => l.id === 'reference-sky').visible && !liveState.params.clouds.enabled && !liveState.params.sky.moonEnabled);
  check('Baked city lights cannot be mistaken for editable emissive masks', await page.locator('#city-light').isDisabled() && await page.locator('#location-note').isVisible());
  const liveDownloadPromise = page.waitForEvent('download'); await page.locator('#snapshot').click();
  await (await liveDownloadPromise).saveAs('artifacts/nightcity-procedural.png');
  await page.locator('[data-preset="drifting"]').click();
  const realClouds = await page.evaluate(() => {
    const e = window.atmosphere; e.setParameters({ clouds: { enabled: false } }); const clear = e.readPixels();
    e.setParameters({ clouds: { enabled: true } }); e.seek(8); const cloudy = e.readPixels();
    let changed = 0; for (let i = 0; i < clear.length; i += 4) if (clear[i] !== cloudy[i] || clear[i + 1] !== cloudy[i + 1] || clear[i + 2] !== cloudy[i + 2]) changed++;
    return { changed, visible: e.getDiagnostics().layers.filter(l => l.id.startsWith('cloud-')).every(l => l.visible) };
  });
  result.cityClouds = realClouds;
  check('Both GPU cloud fields render in the author city', realClouds.visible && realClouds.changed > 100);
  const cloudDownloadPromise = page.waitForEvent('download'); await page.locator('#snapshot').click();
  await (await cloudDownloadPromise).saveAs('artifacts/nightcity-clouds.png');
  await page.screenshot({ path: 'artifacts/nightcity-app.png', fullPage: true }); result.screenshots.push('nightcity-app.png', 'nightcity-psd.png', 'nightcity-procedural.png', 'nightcity-clouds.png');
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(600);
  const nativeScroll = await page.evaluate(() => {
    const v = document.querySelector('#viewport'), c = window.atmosphere.canvas;
    v.scrollTop = 0; v.scrollLeft = 0; const canvas = c.getBoundingClientRect(), viewport = v.getBoundingClientRect();
    return { x: canvas.left - viewport.left, y: canvas.top - viewport.top, width: c.width, scrollable: v.scrollWidth > v.clientWidth && v.scrollHeight > v.clientHeight, pageFits: document.documentElement.scrollWidth <= innerWidth };
  });
  result.cityNativeScroll = nativeScroll;
  check('Large panorama starts at an accessible top-left and scrolls locally at 1:1', nativeScroll.width === 1890 && nativeScroll.scrollable && nativeScroll.pageFits && nativeScroll.x >= -0.6 && nativeScroll.y >= -0.6);
  check('Author city has no browser or shader errors', result.errors.length === 0);
  console.log(`PASS: ${result.checks.length} browser/GPU checks (${result.browser})`);
} catch (error) {
  result.errors.push(error.stack || String(error)); console.error(error); process.exitCode = 1;
} finally {
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/browser-report.json', JSON.stringify(result, null, 2));
  if (browser) await browser.close(); server.kill();
}
