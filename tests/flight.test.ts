import { describe, expect, it } from 'vitest';
import { PanoramaFlight } from '../src/experience/flight';
import { CITY_IDS, CITY_LAYOUTS } from '../src/experience/config';

describe('panorama flight', () => {
  it('starts at the saved layout and never jumps on retargeting', () => {
    const f = new PanoramaFlight('panorama');
    expect(f.placements).toEqual(CITY_LAYOUTS.panorama.layers);
    f.target('panorama2'); f.update(0.4);
    const halfway = f.placements, light = f.roomAmbient;
    expect(halfway).not.toEqual(CITY_LAYOUTS.panorama2.layers);
    expect(light).toBeGreaterThan(0.6); expect(light).toBeLessThan(1);
    f.target('classic');
    expect(f.placements).toEqual(halfway); expect(f.roomAmbient).toBe(light);
  });
  it.each(CITY_IDS)('settles exactly at %s with independent layer travel', city => {
    const f = new PanoramaFlight('panorama2'); f.target(city);
    for (let i = 0; i < 600; i++) f.update(1 / 60);
    expect(f.placements).toEqual(CITY_LAYOUTS[city].layers);
    expect(f.roomAmbient).toBe(CITY_LAYOUTS[city].roomAmbient);
    expect(f.moving).toBe(false);
  });
  it('preserves motion across refresh rates and ignores invalid time', () => {
    const a = new PanoramaFlight('panorama'), b = new PanoramaFlight('panorama');
    a.target('panorama2'); b.target('panorama2');
    for (let i = 0; i < 60; i++) a.update(1 / 60);
    for (let i = 0; i < 30; i++) b.update(1 / 30);
    for (const id of Object.keys(a.placements)) {
      expect(a.placements[id].x).toBeCloseTo(b.placements[id].x, 8);
      expect(a.placements[id].scale).toBeCloseTo(b.placements[id].scale, 8);
    }
    const before = a.placements;
    for (const dt of [NaN, Infinity, -1, 0]) a.update(dt);
    expect(a.placements).toEqual(before);
  });
});
