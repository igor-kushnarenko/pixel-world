import type { AtmosphereParameters, ParameterPatch, PaletteName } from './types';

export const DEFAULT_PARAMETERS: AtmosphereParameters = {
  presetVersion: 1, seed: 712, timeOfDay: 22,
  sky: { palette: 'cyberpunk_night', starsEnabled: false, moonEnabled: false, horizonGlow: 0.15 },
  clouds: {
    enabled: false, coverage: 0, density: 0.35, scale: 1, windSpeed: 0.25, windDirectionDeg: 0,
    layers: {
      far: { enabled: true, depth: 10, coverage: 0.85, density: 0.7, scale: 1.4, height: 0.23, thickness: 0.25, speed: 0.4, colorSteps: 4 },
      low: { enabled: true, depth: 30, coverage: 1, density: 1, scale: 0.85, height: 0.38, thickness: 0.31, speed: 1, colorSteps: 4 }
    }
  },
  weather: { fog: 0, rain: 0, stormEnabled: false, layers: {} },
  lighting: { cityLightsIntensity: 0.55, exteriorRoomFill: 0.15, interiorLightsEnabled: false, radioBacklightEnabled: false, computerEnabled: false },
  render: { sampling: 'nearest', dithering: false, pixelGrid: 'match_scene_assets', colorSteps: 12 }
};

export const PRESETS: Readonly<Record<string, ParameterPatch>> = {
  canonical: {},
  drifting: { clouds: { enabled: true, coverage: 0.7, density: 0.75 }, sky: { horizonGlow: 0.22 } },
  storm: { clouds: { enabled: true, coverage: 0.95, density: 1, windSpeed: 0.65 }, weather: { stormEnabled: true, fog: 0.23, rain: 0.45 }, sky: { horizonGlow: 0.12 } },
  dawn: { timeOfDay: 5.7, clouds: { enabled: true, coverage: 0.42, density: 0.65 }, sky: { horizonGlow: 0.3 }, lighting: { cityLightsIntensity: 0.25 } },
  day: { timeOfDay: 12, clouds: { enabled: true, coverage: 0.52, density: 0.75 }, lighting: { cityLightsIntensity: 0.08, exteriorRoomFill: 0.4 } }
};

function mergeKnown(base: Record<string, unknown>, patch: Record<string, unknown>, path = ''): void {
  for (const key of Object.keys(patch)) {
    if (!Object.hasOwn(base, key)) throw new Error(`Unknown parameter: ${path}${key}`);
    const value = patch[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (!base[key] || typeof base[key] !== 'object') throw new Error(`Invalid object: ${path}${key}`);
      mergeKnown(base[key] as Record<string, unknown>, value as Record<string, unknown>, `${path}${key}.`);
    } else {
      if (typeof value !== typeof base[key]) throw new Error(`Invalid type: ${path}${key}`);
      base[key] = value;
    }
  }
}
function range(value: number, min: number, max: number, name: string, integer = false) {
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new Error(`${name}: expected ${integer ? 'integer ' : ''}${min}…${max}`);
  }
}
export function resolveParameters(patch: ParameterPatch = {}, base = DEFAULT_PARAMETERS): AtmosphereParameters {
  const p = structuredClone(base);
  for (const id of Object.keys(patch.weather?.layers ?? {})) {
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || ['__proto__', 'constructor', 'prototype'].includes(id)) throw new Error('Invalid atmosphere layer ID');
    if (!Object.hasOwn(p.weather.layers, id)) p.weather.layers[id] = { hazeDensity: 0, fogDensity: 0, fogAmount: 0.5, billowing: 0 };
  }
  mergeKnown(p as unknown as Record<string, unknown>, patch as Record<string, unknown>);
  if (p.presetVersion !== 1) throw new Error('Unsupported presetVersion (expected 1)');
  if (p.sky.moonEnabled !== false) throw new Error('Moon is intentionally unsupported in this prototype');
  if (!['cyberpunk_night', 'coastal', 'forest'].includes(p.sky.palette)) throw new Error('Unknown sky palette');
  if (p.render.sampling !== 'nearest' || p.render.pixelGrid !== 'match_scene_assets') throw new Error('Pixel grid must match scene assets; sampling must be nearest');
  range(p.seed, 0, 65535, 'seed', true); range(p.timeOfDay, 0, 24, 'timeOfDay');
  range(p.sky.horizonGlow, 0, 1, 'sky.horizonGlow');
  for (const key of ['coverage', 'density', 'windSpeed'] as const) range(p.clouds[key], 0, 1, `clouds.${key}`);
  range(p.clouds.scale, 0.25, 4, 'clouds.scale'); range(p.clouds.windDirectionDeg, -360, 360, 'clouds.windDirectionDeg');
  for (const [name, layer] of Object.entries(p.clouds.layers)) {
    range(layer.depth, 1, 999, `${name}.depth`);
    for (const key of ['coverage', 'density', 'height', 'thickness'] as const) range(layer[key], 0, 1, `${name}.${key}`);
    range(layer.scale, 0.25, 4, `${name}.scale`); range(layer.speed, 0, 4, `${name}.speed`);
    range(layer.colorSteps, 2, 16, `${name}.colorSteps`, true);
  }
  for (const key of ['fog', 'rain'] as const) range(p.weather[key], 0, 1, `weather.${key}`);
  for (const [id, layer] of Object.entries(p.weather.layers)) {
    for (const key of ['hazeDensity', 'fogDensity', 'fogAmount', 'billowing'] as const) range(layer[key], 0, 1, `weather.layers.${id}.${key}`);
  }
  range(p.lighting.cityLightsIntensity, 0, 1, 'lighting.cityLightsIntensity');
  range(p.lighting.exteriorRoomFill, 0, 1, 'lighting.exteriorRoomFill');
  range(p.render.colorSteps, 2, 32, 'render.colorSteps', true);
  return p;
}
export function getPreset(name: string): AtmosphereParameters {
  if (!Object.hasOwn(PRESETS, name)) throw new Error(`Unknown preset: ${name}`);
  return resolveParameters(PRESETS[name]);
}
export function parsePreset(json: string): AtmosphereParameters {
  if (json.length > 65536) throw new Error('Preset is too large');
  const value: unknown = JSON.parse(json);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a preset object');
  return resolveParameters(value as ParameterPatch);
}

const stops = [
  { t: 0, top: '#07091b', bottom: '#24233f', cloud: '#34344f', ambient: 0.05 },
  { t: 4.5, top: '#0d1026', bottom: '#34304d', cloud: '#49415a', ambient: 0.12 },
  { t: 6, top: '#33385b', bottom: '#bd7c7f', cloud: '#a3778b', ambient: 0.55 },
  { t: 8, top: '#345d82', bottom: '#9eb8c2', cloud: '#c2ccd4', ambient: 0.9 },
  { t: 16, top: '#355b7e', bottom: '#90a6b3', cloud: '#bbc6cd', ambient: 0.85 },
  { t: 18, top: '#302d53', bottom: '#b76b6e', cloud: '#8f617a', ambient: 0.5 },
  { t: 20, top: '#11132c', bottom: '#44334f', cloud: '#49405e', ambient: 0.13 },
  { t: 22, top: '#080b20', bottom: '#24233e', cloud: '#34354e', ambient: 0.05 },
  { t: 24, top: '#07091b', bottom: '#24233f', cloud: '#34344f', ambient: 0.05 }
];
export function rgb(hex: string): [number, number, number] {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`Expected #rrggbb color: ${hex}`);
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
}
export function paletteAt(time: number, palette: PaletteName) {
  const t = ((time % 24) + 24) % 24;
  const i = Math.max(0, stops.findIndex((s, index) => index < stops.length - 1 && t >= s.t && t < stops[index + 1].t));
  const a = stops[i], b = stops[i + 1];
  let f = (t - a.t) / (b.t - a.t); f = f * f * (3 - 2 * f);
  const tint = palette === 'coastal' ? [0.8, 1.07, 1.1] : palette === 'forest' ? [0.8, 1.05, 0.83] : [1, 1, 1];
  const mix = (x: string, y: string) => rgb(x).map((c, j) => Math.min(1, (c + (rgb(y)[j] - c) * f) * tint[j]));
  return { top: mix(a.top, b.top), bottom: mix(a.bottom, b.bottom), cloud: mix(a.cloud, b.cloud), ambient: a.ambient + (b.ambient - a.ambient) * f };
}
