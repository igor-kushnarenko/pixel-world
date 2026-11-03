import './style.css';
import { AtmosphereEngine } from '../engine';
import type { AtmosphereParameters, ParameterPatch } from '../engine';
import { createDemoLocation } from './location';
import { createNightCityLocation } from './nightcity';

const query = new URLSearchParams(location.search);
const isDemo = query.get('scene') === 'demo';
const baseUrl = import.meta.env.BASE_URL;
let referenceMode = false;
let resumeAfterReference = false;

const app = document.querySelector<HTMLDivElement>('#app')!;
const icon = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M3 16h18M5 12h4V8h5v4h5v4M7 20h10M11 4h2"/></svg>`;
app.innerHTML = `
  <header class="masthead"><a class="brand" href="./"><span class="brand-mark">${icon}</span><span>ПИКСЕЛЬНЫЙ МИР<small>WORLD BUILDING TOOLS</small></span></a><div class="masthead-right"><span class="version">ENGINE / v0.1</span><a href="https://threejs.org/" target="_blank" rel="noreferrer">THREE.JS ↗</a></div></header>
  <main>
    <div class="intro"><div><p class="eyebrow"><span></span> ATMOSPHERE LAB <b>/ 01</b></p><h1>Тихий город.<br><em>Живое небо.</em></h1><p class="subtitle">Процедурная атмосфера на одной пиксельной сетке.</p></div><div class="intro-note"><span class="note-line"></span><p>Небо. Облака. Свет.<br>Каждый слой — под вашим контролем.</p><span class="tag">WEBGL · REALTIME</span></div></div>
    <div class="workspace">
      <section class="scene-column" aria-label="Просмотр сцены">
        <div class="viewer"><div class="viewer-top"><span><i class="live-dot"></i><b id="scene-name">КАНОНИЧЕСКАЯ НОЧЬ</b></span><span id="pixel-info">480 × 270 / NEAREST</span></div><div id="viewport"><div id="loading">Инициализация атмосферы…</div></div><div class="viewer-bottom"><div class="view-switch" aria-label="Режим просмотра"><button id="room-view" class="active" aria-pressed="true">Через окно</button><button id="city-view" aria-pressed="false">Панорама</button></div><div class="playback"><button id="pause" aria-label="Приостановить анимацию">Ⅱ <span>Пауза</span></button><span class="divider"></span><span id="render-stats">GPU</span></div></div></div>
        <div class="scene-caption"><span id="location-label">01 — УСЛОВНАЯ ГОРОДСКАЯ ЛОКАЦИЯ</span><span id="location-detail">Демонстрационная графика · заменяемые слои</span></div>
        <div class="location-tools"><nav aria-label="Выбор локации"><a href="${baseUrl}">Квартира ↗</a><a href="${baseUrl}?mode=lab" ${!isDemo ? 'aria-current="page"' : ''}>Город PSD</a><a href="${baseUrl}?scene=demo" ${isDemo ? 'aria-current="page"' : ''}>Тестовая сцена</a></nav><div><button id="snapshot">↓ Снимок PNG</button><button id="fullscreen">⛶ Полный экран</button></div></div>
        <p id="location-note" class="location-note" hidden></p>
        <div class="section-heading"><h2>Состояния атмосферы</h2><span>ВЫБРАТЬ ПРЕСЕТ</span></div>
        <div class="presets">
          <button class="preset selected" data-preset="canonical"><span class="preset-art art-night"><i></i></span><b>Тихая ночь</b><small>Канонический старт</small><span class="preset-arrow">↗</span></button>
          <button class="preset" data-preset="drifting"><span class="preset-art art-cloud"><i></i></span><b>Облачный дрейф</b><small>Два плана облаков</small><span class="preset-arrow">↗</span></button>
          <button class="preset" data-preset="storm"><span class="preset-art art-storm"><i></i></span><b>Перед грозой</b><small>Дождь и вспышки</small><span class="preset-arrow">↗</span></button>
          <button class="preset" data-preset="dawn"><span class="preset-art art-dawn"><i></i></span><b>Первый свет</b><small>Рассвет в городе</small><span class="preset-arrow">↗</span></button>
        </div>
        <div class="under-scene"><span class="small-cross">+</span><p>Исходная графика и атмосфера независимы.<br><span>Маска окна и глубина определяют, где виден каждый эффект.</span></p><button id="show-layers">Порядок слоёв ↗</button></div>
        <div id="layer-panel" hidden><h3>От дальнего к ближнему</h3><ol id="layers"></ol></div>
      </section>
      <aside class="controls" aria-label="Параметры атмосферы">
        <div class="control-title"><h2>Параметры</h2><button id="reset" title="Вернуть канонический пресет">↺ <span>Сброс</span></button></div>
        <section class="control-section"><h3><span>01</span> Небо и время</h3><div id="time-control"></div><div class="time-labels"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div><div id="sky-controls"></div></section>
        <section class="control-section"><div class="section-row"><h3><span>02</span> Облачность</h3><label class="toggle"><input id="cloud-enabled" type="checkbox" aria-label="Включить облака"><span></span></label></div><div id="cloud-controls"></div><details><summary>Настройки двух планов <span>+</span></summary><div id="cloud-planes"></div></details></section>
        <section class="control-section"><h3><span>03</span> Ветер</h3><div id="wind-controls"></div><div class="wind-row"><span id="wind-arrow">→</span><p id="wind-caption">На восток · 0°</p><span class="micro">ДИСКРЕТНЫЙ СДВИГ</span></div></section>
        <section class="control-section"><h3><span>04</span> Свет и погода</h3><div id="light-controls"></div><div class="switch-row"><span>Грозовой режим</span><label class="toggle"><input id="storm-enabled" type="checkbox" aria-label="Грозовой режим"><span></span></label></div><button id="lightning" class="outline" disabled>↯ &nbsp; Вспышка молнии</button><details><summary>Комната и дополнительные эффекты <span>+</span></summary><div id="extra-controls"></div></details></section>
        <div class="preset-io"><button id="save">↓ &nbsp; Сохранить JSON</button><button id="load">↑ &nbsp; Загрузить</button><input id="preset-file" type="file" accept=".json,application/json" hidden></div>
        <p class="control-footnote">PRESET V1 <span>·</span> MOON OFF <span>·</span> NO BLUR</p>
      </aside>
    </div>
    <footer><span>ATMOSPHERE ENGINE <b>/</b> ПИКСЕЛЬНЫЙ МИР</span><span>Независимые слои. Одна атмосфера.</span><span class="footer-state"><i></i> <span id="engine-state">ГОТОВ К РАБОТЕ</span></span></footer>
  </main><div id="toast" role="status" aria-live="polite"></div>`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const viewport = $('viewport');
let engine: AtmosphereEngine;
const syncControls: ((p: AtmosphereParameters) => void)[] = [];
let toastTimeout = 0;
function toast(message: string, error = false) {
  $('toast').textContent = message; $('toast').className = `visible ${error ? 'error' : ''}`;
  window.clearTimeout(toastTimeout); toastTimeout = window.setTimeout(() => $('toast').className = '', 4500);
}
function custom() { document.querySelectorAll('.preset').forEach(el => el.classList.remove('selected')); $('scene-name').textContent = 'СВОЯ АТМОСФЕРА'; }
function change(patch: ParameterPatch) { try { engine.setParameters(patch); custom(); sync(); } catch (e) { toast(String(e), true); } }
function range(parent: string, id: string, label: string, min: number, max: number, step: number,
  get: (p: AtmosphereParameters) => number, patch: (v: number) => ParameterPatch, format = (n: number) => `${Math.round(n * 100)}%`) {
  const div = document.createElement('div'); div.className = 'range-control';
  div.innerHTML = `<div class="range-label"><label for="${id}">${label}</label><output id="${id}-value" for="${id}"></output></div><input id="${id}" type="range" min="${min}" max="${max}" step="${step}">`;
  $(parent).append(div);
  const input = $<HTMLInputElement>(id);
  input.addEventListener('input', () => change(patch(Number(input.value))));
  syncControls.push(p => { const value = get(p); input.value = String(value); input.style.setProperty('--fill', `${(value - min) / (max - min) * 100}%`); $(id + '-value').textContent = format(value); });
}
function toggle(parent: string, id: string, label: string, get: (p: AtmosphereParameters) => boolean, patch: (v: boolean) => ParameterPatch) {
  const div = document.createElement('div'); div.className = 'switch-row';
  div.innerHTML = `<label for="${id}">${label}</label><label class="toggle"><input id="${id}" type="checkbox"><span></span></label>`;
  $(parent).append(div); $<HTMLInputElement>(id).onchange = e => change(patch((e.target as HTMLInputElement).checked));
  syncControls.push(p => { $<HTMLInputElement>(id).checked = get(p); });
}
function sync() {
  const p = engine.getParameters(); syncControls.forEach(fn => fn(p));
  $<HTMLInputElement>('cloud-enabled').checked = p.clouds.enabled;
  $<HTMLInputElement>('storm-enabled').checked = p.weather.stormEnabled;
  $<HTMLButtonElement>('lightning').disabled = !p.weather.stormEnabled;
  $('wind-arrow').style.transform = `rotate(${p.clouds.windDirectionDeg}deg)`;
  $('wind-caption').textContent = `${Math.round(p.clouds.windDirectionDeg)}° · ${p.clouds.windSpeed === 0 ? 'штиль' : 'ветер'}`;
  $('cloud-controls').classList.toggle('muted', !p.clouds.enabled);
  const layerList = engine.getDiagnostics().layers;
  $('layers').replaceChildren(...layerList.map(l => { const li = document.createElement('li'); li.textContent = `${String(l.depth).padStart(3, '0')} / ${l.id} ${l.visible ? '●' : '○'}`; return li; }));
}

const atmospherePasses = ['sky', 'cloud-far', 'cloud-low', 'fog', 'rain'];
function syncPlayback() {
  const running = engine.getDiagnostics().running;
  $('pause').innerHTML = running ? 'Ⅱ <span>Пауза</span>' : '▷ <span>Продолжить</span>';
  $('pause').setAttribute('aria-label', running ? 'Приостановить анимацию' : 'Продолжить анимацию');
  $<HTMLButtonElement>('pause').disabled = referenceMode;
}
function setReferenceMode(reference: boolean) {
  const wasReference = referenceMode;
  if (reference && !wasReference) resumeAfterReference = engine.getDiagnostics().running;
  referenceMode = reference;
  engine.setLayerVisible('reference-background', reference);
  engine.setLayerVisible('reference-sky', reference);
  for (const id of atmospherePasses) engine.setLayerVisible(id, !reference);
  engine.canvas.setAttribute('aria-label', reference ? 'Панорама города в расположении слоёв из PSD' : 'Панорама города с процедурным небом');
  for (const [id, active] of [['room-view', !reference], ['city-view', reference]] as const) {
    $(id).classList.toggle('active', active); $(id).setAttribute('aria-pressed', String(active));
  }
  $('atmosphere-settings').toggleAttribute('disabled', reference);
  // A reference frame must not inherit a flash from a preceding storm preview.
  if (reference) { engine.stop(); engine.seek(engine.getDiagnostics().time); }
  else if (wasReference && resumeAfterReference) engine.start();
  $('scene-name').textContent = reference ? 'КОМПОЗИЦИЯ ИЗ PSD' : 'ПРОЦЕДУРНОЕ НЕБО';
  sync();
  syncPlayback();
}
function saveSnapshot() {
  const { width, height } = engine, input = engine.readPixels();
  const c = document.createElement('canvas'); c.width = width; c.height = height;
  const ctx = c.getContext('2d')!, image = ctx.createImageData(width, height);
  for (let y = 0; y < height; y++) image.data.set(input.subarray((height - 1 - y) * width * 4, (height - y) * width * 4), y * width * 4);
  ctx.putImageData(image, 0, 0);
  c.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `${isDemo ? 'atmosphere-demo' : 'nightcity'}-${referenceMode ? 'psd' : 'atmosphere'}.png`; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}

async function main() {
  const scene = isDemo ? createDemoLocation() : createNightCityLocation();
  engine = await AtmosphereEngine.create({ container: viewport, scene, parameters: isDemo ? undefined : { clouds: { scale: 0.3 } }, onError: error => { toast(error.message, true); $('engine-state').textContent = 'РЕНДЕР ПРИОСТАНОВЛЕН'; } });
  $('loading').remove();
  const settings = document.createElement('fieldset'); settings.id = 'atmosphere-settings';
  const sections = Array.from(document.querySelectorAll('.controls > .control-section'));
  sections[0].before(settings); settings.append(...sections);
  range('time-control', 'time', 'Время суток', 0, 24, 0.05, p => p.timeOfDay, v => ({ timeOfDay: v }), n => `${String(Math.floor(n)).padStart(2, '0')}:${String(Math.round((n % 1) * 60) % 60).padStart(2, '0')}`);
  range('sky-controls', 'glow', 'Свечение горизонта', 0, 1, 0.01, p => p.sky.horizonGlow, v => ({ sky: { horizonGlow: v } }));
  range('cloud-controls', 'coverage', 'Покрытие неба', 0, 1, 0.01, p => p.clouds.coverage, v => ({ clouds: { coverage: v } }));
  range('cloud-controls', 'density', 'Плотность', 0, 1, 0.01, p => p.clouds.density, v => ({ clouds: { density: v } }));
  range('cloud-controls', 'scale', 'Масштаб структуры', 0.25, 4, 0.05, p => p.clouds.scale, v => ({ clouds: { scale: v } }), n => `${n.toFixed(2)}×`);
  for (const name of ['far', 'low'] as const) {
    const heading = document.createElement('h4'); heading.textContent = name === 'far' ? 'Дальний план' : 'Низкий план'; $('cloud-planes').append(heading);
    toggle('cloud-planes', `${name}-enabled`, 'Показывать план', p => p.clouds.layers[name].enabled, v => ({ clouds: { layers: { [name]: { enabled: v } } } }));
    for (const [key, label, min, max, step] of [
      ['height', 'Высота от верха', 0, 1, 0.01], ['thickness', 'Толщина полосы', 0.01, 1, 0.01],
      ['speed', 'Скорость плана', 0, 4, 0.05], ['depth', 'Глубина композитинга', 1, 99, 1],
      ['coverage', 'Доля покрытия', 0, 1, 0.01], ['density', 'Плотность плана', 0, 1, 0.01],
      ['scale', 'Масштаб плана', 0.25, 4, 0.05], ['colorSteps', 'Ступени цвета', 2, 16, 1]
    ] as const) {
      range('cloud-planes', `${name}-${key}`, label, min, max, step, p => p.clouds.layers[name][key], v => ({ clouds: { layers: { [name]: { [key]: v } } } }), n => ['depth', 'colorSteps'].includes(key) ? String(n) : n.toFixed(2));
    }
  }
  range('wind-controls', 'wind-speed', 'Скорость', 0, 1, 0.01, p => p.clouds.windSpeed, v => ({ clouds: { windSpeed: v } }));
  range('wind-controls', 'wind-direction', 'Направление', 0, 360, 1, p => p.clouds.windDirectionDeg, v => ({ clouds: { windDirectionDeg: v } }), n => `${n}°`);
  range('light-controls', 'city-light', 'Огни города', 0, 1, 0.01, p => p.lighting.cityLightsIntensity, v => ({ lighting: { cityLightsIntensity: v } }));
  range('light-controls', 'room-fill', 'Свет из окна', 0, 1, 0.01, p => p.lighting.exteriorRoomFill, v => ({ lighting: { exteriorRoomFill: v } }));
  range('extra-controls', 'fog', 'Дымка', 0, 1, 0.01, p => p.weather.fog, v => ({ weather: { fog: v } }));
  range('extra-controls', 'rain', 'Дождь', 0, 1, 0.01, p => p.weather.rain, v => ({ weather: { rain: v } }));
  toggle('extra-controls', 'stars', 'Звёзды', p => p.sky.starsEnabled, v => ({ sky: { starsEnabled: v } }));
  toggle('extra-controls', 'dither', 'Dithering неба', p => p.render.dithering, v => ({ render: { dithering: v } }));
  toggle('extra-controls', 'interior', 'Внутренний свет', p => p.lighting.interiorLightsEnabled, v => ({ lighting: { interiorLightsEnabled: v } }));
  toggle('extra-controls', 'radio', 'Подсветка радио', p => p.lighting.radioBacklightEnabled, v => ({ lighting: { radioBacklightEnabled: v } }));
  toggle('extra-controls', 'computer', 'Экран компьютера', p => p.lighting.computerEnabled, v => ({ lighting: { computerEnabled: v } }));
  $('cloud-enabled').onchange = e => {
    const enabled = (e.target as HTMLInputElement).checked, coverage = engine.getParameters().clouds.coverage;
    change({ clouds: { enabled, coverage: enabled && coverage === 0 ? 0.7 : coverage } });
  };
  $('storm-enabled').onchange = e => change({ weather: { stormEnabled: (e.target as HTMLInputElement).checked } });
  $('lightning').onclick = () => { engine.triggerLightning(); };
  const selectPreset = (name: string) => {
    engine.applyPreset(name);
    if (!isDemo) { engine.setParameters({ clouds: { scale: 0.3 } }); setReferenceMode(false); }
    sync();
    document.querySelectorAll<HTMLElement>('.preset').forEach(el => el.classList.toggle('selected', el.dataset.preset === name));
    $('scene-name').textContent = ({ canonical: 'КАНОНИЧЕСКАЯ НОЧЬ', drifting: 'ОБЛАЧНЫЙ ДРЕЙФ', storm: 'ПЕРЕД ГРОЗОЙ', dawn: 'ПЕРВЫЙ СВЕТ' } as Record<string, string>)[name];
  };
  document.querySelectorAll<HTMLButtonElement>('.preset').forEach(button => button.onclick = () => selectPreset(button.dataset.preset!));
  $('reset').onclick = () => { selectPreset('canonical'); toast('Канонический пресет восстановлен'); };
  $('pause').onclick = () => {
    if (engine.getDiagnostics().running) engine.stop(); else engine.start();
    syncPlayback();
  };
  const view = (room: boolean) => {
    engine.setWindowMaskEnabled(room);
    for (const id of [...scene.layers ?? [], ...scene.lights ?? []].filter(layer => layer.scope === 'room').map(layer => layer.id)) engine.setLayerVisible(id, room);
    for (const [id, active] of [['room-view', room], ['city-view', !room]] as const) { $(id).classList.toggle('active', active); $(id).setAttribute('aria-pressed', String(active)); }
    sync();
  };
  $('room-view').onclick = () => { if (isDemo) view(true); else setReferenceMode(false); };
  $('city-view').onclick = () => { if (isDemo) view(false); else setReferenceMode(true); };
  $('snapshot').onclick = saveSnapshot;
  $('pause').before($('fullscreen'));
  $('fullscreen').textContent = '⛶'; $('fullscreen').title = 'Полный экран'; $('fullscreen').setAttribute('aria-label', 'Полный экран');
  $('fullscreen').onclick = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.querySelector('.viewer')!.requestFullscreen();
    } catch { toast('Полноэкранный режим недоступен в этом браузере', true); }
  };
  document.addEventListener('fullscreenchange', () => {
    engine.resize(); $('fullscreen').setAttribute('aria-label', document.fullscreenElement ? 'Выйти из полного экрана' : 'Полный экран');
  });
  $('show-layers').onclick = () => { $('layer-panel').hidden = !$('layer-panel').hidden; sync(); };
  $('save').onclick = () => {
    const url = URL.createObjectURL(new Blob([engine.exportPreset()], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'atmosphere-preset.json'; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Пресет сохранён');
  };
  $('load').onclick = () => $<HTMLInputElement>('preset-file').click();
  $('preset-file').onchange = async e => {
    const input = e.target as HTMLInputElement, file = input.files?.[0]; if (!file) return;
    try { if (file.size > 65536) throw new Error('Файл пресета слишком большой'); engine.importPreset(await file.text()); if (!isDemo) setReferenceMode(false); custom(); sync(); toast('Пресет загружен'); }
    catch (error) { toast(`Пресет не загружен: ${String(error)}`, true); } finally { input.value = ''; }
  };
  if (!isDemo) {
    $('room-view').textContent = 'Живое небо'; $('city-view').textContent = 'По PSD';
    $('location-label').textContent = '01 — НОЧНОЙ ГОРОД / NIGHTCITY.PSD';
    $('location-detail').textContent = '1890 × 1063 · расположение слоёв из PSD';
    $('pixel-info').textContent = '1890 × 1063 / 1× NEAREST';
    $('location-note').hidden = false;
    $('location-note').textContent = 'Масштаб 1:1: перемещайтесь полосами прокрутки или откройте полный экран. Комната сохранена отдельно — её расположение отсутствует в PSD. Огни в городских PNG уже нарисованы; для отдельного управления нужны световые маски.';
    for (const id of ['city-light', 'room-fill', 'interior', 'radio', 'computer']) {
      const input = $<HTMLInputElement>(id); input.disabled = true;
      if (id !== 'city-light') input.closest('.range-control, .switch-row')!.setAttribute('hidden', '');
    }
    $('city-light').closest('.range-control')!.classList.add('baked-light');
    setReferenceMode(query.get('view') === 'psd');
  }
  sync();
  // Demo-only inspection hook for integration tests and the browser console.
  Object.assign(window, { atmosphere: engine });
  if (!query.has('paused') && !referenceMode) engine.start();
  syncPlayback();
  const statusInterval = window.setInterval(() => {
    const d = engine.getDiagnostics(); $('render-stats').textContent = `${d.drawCalls} PASSES`;
    $('pixel-info').textContent = `${d.logicalWidth} × ${d.logicalHeight} / ${d.integerScale}× NEAREST`;
  }, 500);
  window.addEventListener('pagehide', () => { clearInterval(statusInterval); engine.dispose(); }, { once: true });
}
main().catch(error => {
  $('loading').textContent = 'Не удалось запустить WebGL. Откройте страницу в браузере с WebGL 2.';
  $('engine-state').textContent = 'ОШИБКА ЗАПУСКА'; toast(String(error), true); console.error(error);
});
