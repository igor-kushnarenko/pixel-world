import { paletteAt } from '../engine';
import { CITY_LAYOUTS } from './config';
import type { CityId } from './config';
import type { SkyMood } from './settings';

/** Ambient light only: local lamps and city emitters keep their own intensity. */
export function ambientLighting(time: number, mood: SkyMood, city: CityId, roomAmbient = CITY_LAYOUTS[city].roomAmbient) {
  const daylight = paletteAt(time, 'cyberpunk_night').ambient;
  const storm = mood === 'storm' ? 0.8 : 1;
  const room = (0.36 + daylight * 0.64) * storm * roomAmbient;
  const buildings = (0.38 + daylight * 0.62) * storm;
  return {
    daylight,
    room: [room * 0.88, room * 0.94, room] as [number, number, number],
    city: [buildings * 0.88, buildings * 0.94, buildings] as [number, number, number]
  };
}
