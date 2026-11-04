import type { LayerPlacement } from '../engine';

// Authored placements and hit regions adopted from igor-kushnarenko/nightcity,
// commit de3c2e17a88f270af49db2641c76ae79cec78213 (src/config.js).
export const WIDTH = 1672, HEIGHT = 941;
export const CITY_IDS = ['panorama', 'panorama2', 'classic'] as const;
export type CityId = typeof CITY_IDS[number];
export const CITY_LAYOUTS: Record<CityId, { name: string; roomAmbient: number; layers: Record<string, LayerPlacement> }> = {
  panorama: { name: 'Панорама', roomAmbient: 1, layers: {
    far: { x: 65, y: -88, scale: 0.575 }, midfar: { x: -123, y: -195, scale: 1.1023 },
    midnear: { x: 255, y: -49, scale: 1.1041 }, near: { x: 28, y: -44, scale: 1.0934 }
  } },
  panorama2: { name: 'У подножия', roomAmbient: 0.6, layers: {
    far: { x: 73, y: -467, scale: 0.5749 }, midfar: { x: -327, y: -429, scale: 1.1024 },
    // +2px against the reference closes its gap at the window's y=743 edge.
    midnear: { x: -369, y: -267, scale: 1.1038 }, near: { x: -128, y: -270, scale: 1.1536 }
  } },
  classic: { name: 'Широкий город', roomAmbient: 1, layers: {
    far: { x: 0, y: 0, scale: 1.03 }, midfar: { x: 0, y: 0, scale: 1.035 },
    midnear: { x: 0, y: 0, scale: 1.04 }, near: { x: 0, y: 0, scale: 1.05 }
  } }
};
export const HOTSPOTS = {
  left: { label: 'Включить лампу', key: 'L', rect: [174, 546, 216, 602] },
  right: { label: 'Включить настенную панель', key: 'K', rect: [1612, 240, 1662, 462] },
  radio: { label: 'Включить радио', key: 'R', rect: [1218, 676, 1470, 800] },
  computer:{label:'Включить компьютер',key:'C',rect:[360,620,595,817]},
  shutterUp:{label:'Поднимать роллет: удерживайте',key:'Удерживать',rect:[194,40,242,110]},shutterDown:{label:'Опускать роллет: удерживайте',key:'Удерживать',rect:[1575,40,1625,110]}
} as const;
export const RADIO_DIAL: [number, number, number, number] = [1325, 714, 1451, 745];
export const RADIO_LED: [number, number] = [1418, 752];
export function nextCity(id: CityId, direction: number): CityId {
  return CITY_IDS[(CITY_IDS.indexOf(id) + (direction < 0 ? -1 : 1) + CITY_IDS.length) % CITY_IDS.length];
}
