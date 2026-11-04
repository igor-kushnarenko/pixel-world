import { CITY_IDS } from './config';
import type { CityId } from './config';
import type { LayerAtmosphere } from '../engine';
export const ATMOSPHERE_NAMES: Record<string, string> = { far: 'Дальний город', midfar: 'Средний дальний', midnear: 'Средний ближний', near: 'Ближний город' };
export type SkyMood = 'night' | 'dusk' | 'day' | 'storm';
export interface ExperienceSettings {
  version: 1; sky: SkyMood; city: CityId;
  clouds: boolean; cloudSpeed: number; coverage: number; rain: number;
  lights: number; volume: number; radioVolume: number; station: string;
  left: boolean; right: boolean;
  computer:boolean;
  citySound:boolean;cityVolume:number;shutter:number;
  beacons: boolean; traffic: number; windowDrops: boolean;
  atmosphere: Record<string, LayerAtmosphere>;
}
export const SETTINGS_KEY = 'pixel-world.apartment.v1';
export const DEFAULT_SETTINGS: ExperienceSettings = {
  version: 1, sky: 'night', city: 'panorama', clouds: false, cloudSpeed: 0.25, coverage: 0.7,
  rain: 0, lights: 0.55, volume: 0.4, radioVolume: 0.5, station: '', left: false, right: false,
  beacons: true, traffic: 0.55, windowDrops: true,
  computer:false,
  citySound:true,cityVolume:0.65,shutter:0,
  atmosphere: Object.fromEntries(Object.keys(ATMOSPHERE_NAMES).map(id => [id, { hazeDensity: 0, fogDensity: 0, fogAmount: 0.5, billowing: 0 }]))
};
const unit = (v: unknown, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
export function normalizeSettings(value: unknown): ExperienceSettings {
  const r = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const d = DEFAULT_SETTINGS;
  return {
    version: 1, sky: ['night', 'dusk', 'day', 'storm'].includes(String(r.sky)) ? r.sky as SkyMood : d.sky,
    city: CITY_IDS.includes(r.city as CityId) ? r.city as CityId : d.city,
    clouds: typeof r.clouds === 'boolean' ? r.clouds : d.clouds,
    cloudSpeed: unit(r.cloudSpeed, d.cloudSpeed), coverage: unit(r.coverage, d.coverage),
    rain: unit(r.rain, d.rain), lights: unit(r.lights, d.lights),
    beacons: typeof r.beacons === 'boolean' ? r.beacons : true,
    computer:typeof r.computer==='boolean'?r.computer:false,
    citySound:typeof r.citySound==='boolean'?r.citySound:true,cityVolume:unit(r.cityVolume,0.65),shutter:unit(r.shutter,0),
    traffic: unit(r.traffic, d.traffic), windowDrops: typeof r.windowDrops === 'boolean' ? r.windowDrops : true,
    volume: unit(r.volume, d.volume), radioVolume: unit(r.radioVolume, d.radioVolume),
    station: typeof r.station === 'string' ? r.station.slice(0, 128) : '',
    left: typeof r.left === 'boolean' ? r.left : false, right: typeof r.right === 'boolean' ? r.right : false,
    atmosphere: Object.fromEntries(Object.keys(ATMOSPHERE_NAMES).map(id => {
      const saved = r.atmosphere && typeof r.atmosphere === 'object' ? (r.atmosphere as Record<string, unknown>)[id] : null;
      const layer = saved && typeof saved === 'object' ? saved as Record<string, unknown> : {};
      return [id, { hazeDensity: unit(layer.hazeDensity, 0), fogDensity: unit(layer.fogDensity, 0), fogAmount: unit(layer.fogAmount, 0.5), billowing: unit(layer.billowing, 0) }];
    }))
  };
}
export function loadSettings(): ExperienceSettings {
  try { return normalizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null')); }
  catch { return structuredClone(DEFAULT_SETTINGS); }
}
export function saveSettings(settings: ExperienceSettings): void { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* Private mode can disable storage. */ } }
