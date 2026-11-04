import './style.css';
import { AtmosphereEngine } from '../engine';
import { ambientLighting } from './lighting';
import { frameDeltaSeconds } from '../engine/clock';
import { createApartmentLocation } from './location';
import { CITY_IDS, CITY_LAYOUTS, HEIGHT, HOTSPOTS, WIDTH, nextCity } from './config';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings';
import type { SkyMood } from './settings';
import { Ambience } from './vendor/audio.js';
import { Tuner } from './vendor/radio.js';

const base = import.meta.env.BASE_URL;
const query = new URLSearchParams(location.search);
const icons = {
  menu: '<path d="M5 7h14M5 12h14M5 17h14"/>', close: '<path d="m6 6 12 12M18 6 6 18"/>',
  sound: '<path d="M11 5 6 9H3v6h3l5 4V5ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>',
  full: '<path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5"/>',
  lamp: '<path d="M9 18h6M10 21h4M8 13a6 6 0 1 1 8 0l-1 3H9l-1-3Z"/>',
  panel: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M10 6h4M10 9h4M10 12h4M10 15h4"/>',
  radio: '<rect x="3" y="9" width="18" height="12" rx="2"/><path d="m6 9 12-6M6 13h7M6 16h7M6 19h7"/><circle cx="17" cy="16" r="2"/>',
  cloud: '<path d="M6 18a4 4 0 0 1-1-8 6 6 0 0 1 11-2 5 5 0 1 1 2 10H6Z"/>',
  rain: '<path d="M6 15a4 4 0 0 1-1-8 6 6 0 0 1 11-2 5 5 0 0 1 2 10M8 18l-1 3M13 18l-1 3M18 18l-1 3"/>',
  arrow: '<path d="m9 5 7 7-7 7"/>'
};
const svg = (name: keyof typeof icons) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`;
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <main class="experience" aria-label="Ночь за окном">
    <div id="scene-stage" class="scene-stage" aria-label="Пиксельная квартира с видом на город"></div>
    <div id="room-hotspots" class="room-hotspots" aria-label="Предметы в квартире">${Object.entries(HOTSPOTS).map(([id, h]) => `<button class="hotspot" id="hit-${id}" aria-label="${h.label}" title="${h.label} · ${h.key}" disabled></button>`).join('')}</div>
    <header class="scene-brand"><span class="brand-symbol"><i></i><i></i><i></i></span><div>ПИКСЕЛЬНЫЙ МИР<small>НОЧЬ ЗА ОКНОМ</small></div></header>
    <div id="scene-status" class="scene-status"><span class="status-dot"></span><span id="mood-status">22:00 · Ясная ночь</span></div>
    <div id="welcome" class="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <section class="welcome-card" aria-labelledby="welcome-title">
        <p class="welcome-kicker">ВАШЕ ТИХОЕ МЕСТО</p><h1 id="welcome-title">Ночь за окном.</h1>
        <p class="welcome-copy">Город не спит.<br>А здесь можно никуда не спешить.</p>
        <div class="welcome-separator"></div><p id="load-status">Собираем свет в окнах…</p>
        <div class="welcome-actions"><button id="enter-sound" class="primary" disabled>${svg('sound')} Войти со звуком</button><button id="enter-quiet" class="quiet" disabled>Побыть в тишине</button></div>
        <p class="welcome-note">Тёплый свет, дождь и радио — в меню или прямо в комнате.</p>
      </section>
    </div>
    <button id="menu-toggle" class="round-button" aria-label="Открыть меню" aria-expanded="false" aria-controls="scene-menu" disabled>${svg('menu')}</button>
    <section id="scene-menu" class="scene-menu" aria-label="Настройки панорамы" hidden inert>
      <div class="menu-heading"><div><span class="menu-kicker">НОЧЬ ЗА ОКНОМ</span><h2>Своё настроение</h2></div><button id="menu-close" class="plain-icon" aria-label="Закрыть меню">${svg('close')}</button></div>
      <div class="mood-switch" aria-label="Время и погода"><button data-mood="night" aria-pressed="true">Ночь</button><button data-mood="dusk" aria-pressed="false">Сумерки</button><button data-mood="day" aria-pressed="false">День</button><button data-mood="storm" aria-pressed="false">Гроза</button></div>
      <div class="menu-section"><p class="section-label">В КВАРТИРЕ</p><div class="device-grid"><button id="lamp-left" class="device" aria-pressed="false">${svg('lamp')}<span>Лампа</span><i></i></button><button id="lamp-right" class="device" aria-pressed="false">${svg('panel')}<span>Панель</span><i></i></button><button id="radio-toggle" class="device" aria-pressed="false">${svg('radio')}<span>Радио</span><i></i></button></div></div>
      <div id="radio-controls" class="radio-controls" hidden><div class="radio-station"><button id="station-prev" class="plain-icon backwards" aria-label="Предыдущая станция">${svg('arrow')}</button><div><small id="radio-state" data-state="off">РАДИО ВЫКЛЮЧЕНО</small><span id="station-name">Тихий эфир</span></div><button id="station-next" class="plain-icon" aria-label="Следующая станция">${svg('arrow')}</button></div><label class="select-label" for="station-select">Станция</label><select id="station-select" aria-label="Радиостанция"></select><label class="slider-row" for="radio-volume"><span>Громкость радио</span><input id="radio-volume" type="range" min="0" max="100" value="50"><output id="radio-volume-value">50%</output></label></div>
      <div class="menu-section"><p class="section-label">ЗА ОКНОМ</p><div class="weather-switches"><button id="cloud-toggle" aria-pressed="false">${svg('cloud')} Облака</button><button id="rain-toggle" aria-pressed="false">${svg('rain')} Дождь</button></div><label class="slider-row" for="rain-level"><span>Сила дождя</span><input id="rain-level" type="range" min="0" max="100" value="0"><output id="rain-level-value">0%</output></label><label class="slider-row" for="city-lights"><span>Огни города</span><input id="city-lights" type="range" min="0" max="100" value="55"><output id="city-lights-value">55%</output></label><details><summary>Облака и ветер <span>+</span></summary><label class="slider-row" for="cloud-coverage"><span>Облачность</span><input id="cloud-coverage" type="range" min="0" max="100" value="70"><output id="cloud-coverage-value">70%</output></label><label class="slider-row" for="wind-speed"><span>Ветер</span><input id="wind-speed" type="range" min="0" max="100" value="25"><output id="wind-speed-value">25%</output></label></details></div>
      <div class="view-selector"><button id="view-prev" class="plain-icon backwards" aria-label="Предыдущий вид города">${svg('arrow')}</button><span id="view-name">Панорама</span><button id="view-next" class="plain-icon" aria-label="Следующий вид города">${svg('arrow')}</button></div>
      <div class="menu-section sound-section"><div class="sound-heading"><button id="sound-toggle" aria-pressed="false">${svg('sound')}<span id="sound-label">Без звука</span></button><button id="fullscreen" class="plain-icon" aria-label="На весь экран">${svg('full')}</button></div><label class="slider-row" for="master-volume"><span>Общая громкость</span><input id="master-volume" type="range" min="0" max="100" value="40"><output id="master-volume-value">40%</output></label><output id="audio-status" class="audio-status" data-state="locked">Звук включается только с вашего разрешения</output></div>
      <div class="menu-footer"><button id="reset-scene">Вернуть тихую ночь</button><a href="${base}?mode=lab">Мастерская ↗</a></div><p class="key-hints">L / K — свет · R — радио · M — звук · Esc — закрыть</p>
    </section>
    <div id="scene-toast" class="scene-toast" role="status" aria-live="polite"></div>
  </main>`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let settings = loadSettings();
if (query.has('fresh')) settings = structuredClone(DEFAULT_SETTINGS);
let engine: AtmosphereEngine;
let entered = false, soundEnabled = false, radioOn = false, disposed = false;
let roomLeft = 0, roomRight = 0, roomRadio = 0;
let toastTimer = 0, idleTimer = 0, closeTimer = 0, frameId = 0;
const audio = new Ambience();
const tuner = new Tuner({ audio, onName: (name: string | null) => {
  if (name && tuner.cur()) { settings.station = tuner.cur().id; saveSettings(settings); }
  updateRadioUI();
} });
const moodNames: Record<SkyMood, string> = { night: 'Ясная ночь', dusk: 'Сумерки', day: 'Дневной город', storm: 'Гроза над городом' };
const timeFor: Record<SkyMood, number> = { night: 22, dusk: 18.4, day: 12, storm: 22 };
let shownTime = timeFor[settings.sky], targetTime = shownTime;
let lastAppliedTime = shownTime;
let lastLightLevel = -1;

function notify(text: string) { $('scene-toast').textContent = text; $('scene-toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = window.setTimeout(() => $('scene-toast').classList.remove('show'), 2300); }
function active(id: string, value: boolean) { $(id).setAttribute('aria-pressed', String(value)); }
function syncUI() {
  document.querySelectorAll<HTMLButtonElement>('[data-mood]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mood === settings.sky)));
  active('lamp-left', settings.left); active('lamp-right', settings.right); active('radio-toggle', radioOn);
  active('cloud-toggle', settings.clouds); active('rain-toggle', settings.rain > 0); active('sound-toggle', soundEnabled);
  $('sound-label').textContent = soundEnabled ? 'Звук включён' : 'Без звука';
  for (const [id, value] of [['rain-level', settings.rain], ['city-lights', settings.lights], ['cloud-coverage', settings.coverage], ['wind-speed', settings.cloudSpeed], ['master-volume', settings.volume], ['radio-volume', settings.radioVolume]] as const) {
    $<HTMLInputElement>(id).value = String(Math.round(value * 100)); $(id + '-value').textContent = `${Math.round(value * 100)}%`;
  }
  $('view-name').textContent = CITY_LAYOUTS[settings.city].name;
  const moodLabel = settings.sky === 'night' && settings.clouds ? 'Облачная ночь' : moodNames[settings.sky];
  $('mood-status').textContent = `${Math.floor(timeFor[settings.sky]).toString().padStart(2, '0')}:${settings.sky === 'dusk' ? '24' : '00'} · ${moodLabel}${settings.rain > 0 && settings.sky !== 'storm' ? ' · Дождь' : ''}`;
  $('hit-left').setAttribute('aria-label', `${settings.left ? 'Выключить' : 'Включить'} лампу`);
  $('hit-right').setAttribute('aria-label', `${settings.right ? 'Выключить' : 'Включить'} настенную панель`);
  $('hit-radio').setAttribute('aria-label', `${radioOn ? 'Выключить' : 'Включить'} радио`);
  $('radio-controls').hidden = !radioOn;
  updateRadioUI(); syncAudio();
}
function updateRadioUI() {
  const state = radioOn ? tuner.state : 'off';
  $('radio-state').dataset.state = state;
  const text = ({ off: 'РАДИО ВЫКЛЮЧЕНО', out: 'ПОИСК ЧАСТОТЫ', loading: 'НАСТРАИВАЕМ ЭФИР', in: 'В ПРЯМОМ ЭФИРЕ', on: 'В ПРЯМОМ ЭФИРЕ', dead: 'НЕТ СИГНАЛА · ПОПРОБУЙТЕ ДРУГУЮ СТАНЦИЮ' } as Record<string, string>)[state] ?? 'ПОИСК СИГНАЛА';
  if ($('radio-state').textContent !== text) $('radio-state').textContent = text;
  const name = radioOn ? tuner.cur()?.name ?? 'Поиск станции…' : 'Тихий эфир';
  if ($('station-name').textContent !== name) $('station-name').textContent = name;
  if (tuner.cur()) $<HTMLSelectElement>('station-select').value = tuner.cur().id;
}
function syncAudio() {
  audio.set(soundEnabled ? settings.volume : 0, settings.rain);
  audio.setRadio(radioOn, settings.radioVolume);
  tuner.setVolume(settings.radioVolume); tuner.setMasterVolume(soundEnabled ? settings.volume : 0);
  $('audio-status').dataset.state = audio.ctx?.state ?? 'locked';
  $('audio-status').textContent = soundEnabled ? 'Городской гул, капли и живой эфир' : 'Сейчас тихо';
}
async function enableSound() {
  try { audio.start(); await audio.ctx?.resume(); soundEnabled = true; syncUI(); }
  catch { soundEnabled = false; syncUI(); notify('Звук недоступен. Панорама продолжает работать в тишине.'); }
}
function applyEnvironment() {
  engine.setParameters({
    clouds: { enabled: settings.clouds, coverage: settings.coverage, density: 0.72, scale: 0.3, windSpeed: settings.cloudSpeed },
    weather: { rain: settings.rain, stormEnabled: settings.sky === 'storm', fog: settings.sky === 'storm' ? 0.12 : 0 },
    lighting: { cityLightsIntensity: settings.lights, interiorLightsEnabled: settings.left || settings.right, radioBacklightEnabled: radioOn }
  });
  lastLightLevel = -1;
  syncUI(); saveSettings(settings);
}
function changeMood(mood: SkyMood) {
  settings.sky = mood; targetTime = timeFor[mood];
  if (mood === 'storm') { settings.clouds = true; settings.coverage = Math.max(0.85, settings.coverage); settings.rain = Math.max(0.5, settings.rain); }
  applyEnvironment(); audio.click(); notify(moodNames[mood]);
}
function setLamp(which: 'left' | 'right') { settings[which] = !settings[which]; applyEnvironment(); audio.click(); notify(`${which === 'left' ? 'Лампа' : 'Панель'} ${settings[which] ? 'включена' : 'выключена'}`); }
async function toggleRadio() {
  if (!soundEnabled) await enableSound();
  if (!soundEnabled) return;
  radioOn = !radioOn; audio.click(); tuner.setOn(radioOn, settings.station); applyEnvironment();
  notify(radioOn ? 'Ищем ваш эфир…' : 'Радио выключено');
}
function changeView(direction: number) {
  settings.city = nextCity(settings.city, direction);
  for (const [id, placement] of Object.entries(CITY_LAYOUTS[settings.city].layers)) engine.setLayerPlacement(id, placement);
  saveSettings(settings); syncUI(); audio.click(); notify(CITY_LAYOUTS[settings.city].name);
}
function menu(open: boolean, focus = false) {
  clearTimeout(closeTimer); $('scene-menu').hidden = !open; $('scene-menu').toggleAttribute('inert', !open);
  $('menu-toggle').setAttribute('aria-expanded', String(open)); document.body.classList.toggle('menu-open', open);
  if (open && focus) $('menu-close').focus();
  if (!open && $('scene-menu').contains(document.activeElement)) $('menu-toggle').focus();
  wake();
}
function wake() {
  document.body.classList.remove('idle'); clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => { if (entered && $('scene-menu').hidden && !document.querySelector(':focus-visible')) document.body.classList.add('idle'); }, 6500);
}
async function enter(sound: boolean) {
  if (entered) return; entered = true;
  if (sound) await enableSound();
  $('welcome').classList.add('gone'); $('welcome').setAttribute('inert', '');
  document.body.classList.add('entered');
  $<HTMLButtonElement>('menu-toggle').disabled = false;
  for (const id of Object.keys(HOTSPOTS)) $<HTMLButtonElement>('hit-' + id).disabled = false;
  $('menu-toggle').focus(); syncUI(); wake();
}
function fitScene() {
  const stage = $('scene-stage'), s = Math.min(stage.clientWidth / WIDTH, stage.clientHeight / HEIGHT);
  const scale = s >= 1 ? Math.floor(s) : s;
  const w = Math.floor(WIDTH * scale), h = Math.floor(HEIGHT * scale);
  const x = Math.floor((stage.clientWidth - w) / 2), y = Math.floor((stage.clientHeight - h) / 2);
  for (const [key, value] of Object.entries({ width: w, height: h, left: x, top: y })) stage.style.setProperty(`--scene-${key}`, `${value}px`);
  const hits = $('room-hotspots'); hits.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
  for (const [id, { rect }] of Object.entries(HOTSPOTS)) {
    $('hit-' + id).style.cssText = `left:${rect[0] / WIDTH * 100}%;top:${rect[1] / HEIGHT * 100}%;width:${(rect[2] - rect[0]) / WIDTH * 100}%;height:${(rect[3] - rect[1]) / HEIGHT * 100}%`;
  }
}

async function main() {
  engine = await AtmosphereEngine.create({ container: $('scene-stage'), scene: await createApartmentLocation(settings.city),
    autoRender: false, parameters: { timeOfDay: shownTime }, onLightning: () => audio.thunder(), onError: e => { $('load-status').textContent = e.message; notify('Рендер приостановлен. Попробуйте обновить страницу.'); } });
  const observer = new ResizeObserver(fitScene); observer.observe($('scene-stage')); fitScene();
  engine.canvas.setAttribute('aria-label', 'Ночная квартира с ноутбуком, кружкой и радио у окна');
  Object.assign(window, { atmosphere: engine });
  applyEnvironment();
  const catalog = tuner.load(`${base}assets/apartment/stations.json`).then(() => {
    const select = $<HTMLSelectElement>('station-select');
    select.replaceChildren(...tuner.list.map((s: { id: string; name: string }) => new Option(s.name, s.id)));
    if (!settings.station && tuner.list.length) settings.station = tuner.list.find((s: { name: string }) => s.name === 'Classic Vinyl HD')?.id ?? tuner.list[0].id;
    select.value = settings.station;
  });
  await catalog;
  $('load-status').textContent = 'Можно включить звук или остаться в тишине.';
  $<HTMLButtonElement>('enter-sound').disabled = false; $<HTMLButtonElement>('enter-quiet').disabled = false;
  $('enter-sound').onclick = () => { void enter(true); }; $('enter-quiet').onclick = () => { void enter(false); };
  $('menu-toggle').onclick = () => menu($('scene-menu').hidden); $('menu-close').onclick = () => menu(false);
  $('scene-menu').addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') closeTimer = window.setTimeout(() => { if (!$('scene-menu').contains(document.activeElement)) menu(false); }, 7000); });
  $('scene-menu').addEventListener('pointerenter', () => clearTimeout(closeTimer));
  document.querySelectorAll<HTMLButtonElement>('[data-mood]').forEach(b => b.onclick = () => changeMood(b.dataset.mood as SkyMood));
  $('lamp-left').onclick = () => setLamp('left'); $('hit-left').onclick = () => setLamp('left');
  $('lamp-right').onclick = () => setLamp('right'); $('hit-right').onclick = () => setLamp('right');
  $('radio-toggle').onclick = () => { void toggleRadio(); }; $('hit-radio').onclick = () => { void toggleRadio(); };
  $('cloud-toggle').onclick = () => { settings.clouds = !settings.clouds; if (settings.clouds && settings.coverage === 0) settings.coverage = 0.7; applyEnvironment(); };
  $('rain-toggle').onclick = () => { settings.rain = settings.rain > 0 ? 0 : 0.5; applyEnvironment(); };
  for (const [id, key] of [['rain-level', 'rain'], ['city-lights', 'lights'], ['cloud-coverage', 'coverage'], ['wind-speed', 'cloudSpeed'], ['master-volume', 'volume'], ['radio-volume', 'radioVolume']] as const) {
    $<HTMLInputElement>(id).oninput = e => { settings[key] = Number((e.target as HTMLInputElement).value) / 100; applyEnvironment(); };
  }
  $('view-prev').onclick = () => changeView(-1); $('view-next').onclick = () => changeView(1);
  $('station-prev').onclick = () => tuner.turn(-1); $('station-next').onclick = () => tuner.turn(1);
  $<HTMLSelectElement>('station-select').onchange = e => { const id = (e.target as HTMLSelectElement).value; settings.station = id; tuner.selectId(id); saveSettings(settings); };
  $('hit-radio').addEventListener('wheel', e => { if (radioOn) { e.preventDefault(); tuner.turn(Math.sign(e.deltaY)); } }, { passive: false });
  $('sound-toggle').onclick = () => { if (!soundEnabled) void enableSound(); else { soundEnabled = false; syncUI(); } };
  $('fullscreen').onclick = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen().catch(() => notify('Полный экран недоступен в этом браузере')); };
  $('reset-scene').onclick = () => {
    settings = structuredClone(DEFAULT_SETTINGS); targetTime = shownTime = 22; lastAppliedTime = -1;
    radioOn = false; tuner.setOn(false); roomLeft = roomRight = roomRadio = 0;
    for (const [id, placement] of Object.entries(CITY_LAYOUTS[settings.city].layers)) engine.setLayerPlacement(id, placement);
    applyEnvironment(); notify('Снова тихая ночь');
  };
  window.addEventListener('pointermove', wake, { passive: true }); window.addEventListener('pointerdown', wake, { passive: true });
  window.addEventListener('keydown', e => {
    if (!entered || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') { menu(false); return; }
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    const key = e.key.toLowerCase();
    if (key === 'l' || key === 'д') setLamp('left'); else if (key === 'k' || key === 'л') setLamp('right');
    else if (key === 'r' || key === 'к') void toggleRadio(); else if (key === 'n' || key === 'т') { if (radioOn) tuner.turn(1); }
    else if (key === 'm' || key === 'ь') $('sound-toggle').click(); else if (key === 'f' || key === 'а') $('fullscreen').click();
    wake();
  });
  let previous = performance.now();
  function frame(now: number) {
    if (disposed) return;
    const dt = frameDeltaSeconds(now, previous); previous = now;
    if (!document.hidden && !query.has('paused')) {
      shownTime += (targetTime - shownTime) * (1 - Math.exp(-dt / 1.8));
      if (Math.abs(shownTime - lastAppliedTime) > 0.005) { lastAppliedTime = shownTime; engine.setParameters({ timeOfDay: shownTime }); }
      const a = 1 - Math.exp(-dt / 0.18);
      roomLeft += ((settings.left ? 1 : 0) - roomLeft) * a;
      roomRight += ((settings.right ? 1 : 0) - roomRight) * a;
      roomRadio += ((radioOn ? 1 : 0) - roomRadio) * a;
      engine.setRoomLightLevels('apartment', roomLeft, roomRight, roomRadio);
      const lighting = ambientLighting(shownTime, settings.sky, settings.city);
      const daylight = lighting.daylight;
      engine.setLayerTint('apartment', lighting.room);
      for (const id of ['far', 'midfar', 'midnear', 'near']) engine.setLayerTint(id, lighting.city);
      const lights = settings.lights * (1 - daylight * 0.65);
      if (Math.abs(lights - lastLightLevel) > 0.002) { lastLightLevel = lights; engine.setParameters({ lighting: { cityLightsIntensity: lights } }); }
      engine.update(dt);
    } else if (query.has('paused')) { engine.setRoomLightLevels('apartment', settings.left ? 1 : 0, settings.right ? 1 : 0, radioOn ? 1 : 0); engine.render(); }
    frameId = requestAnimationFrame(frame);
  }
  frameId = requestAnimationFrame(frame);
  const radioTimer = window.setInterval(() => { if (!disposed) { tuner.update(0.05); updateRadioUI(); $('audio-status').dataset.state = audio.ctx?.state ?? 'locked'; } }, 50);
  window.addEventListener('pagehide', () => { disposed = true; cancelAnimationFrame(frameId); clearInterval(radioTimer); clearTimeout(idleTimer); clearTimeout(closeTimer); clearTimeout(toastTimer); observer.disconnect(); tuner.dispose(); void audio.dispose(); engine.dispose(); }, { once: true });
  syncUI(); wake();
}
main().catch(error => { $('load-status').textContent = 'Не удалось открыть сцену. Обновите страницу в браузере с WebGL 2.'; console.error(error); });
