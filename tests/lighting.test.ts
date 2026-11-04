import { describe, expect, it } from 'vitest';
import { ambientLighting } from '../src/experience/lighting';

describe('apartment ambient illumination', () => {
  it('darkens both buildings and room at night', () => {
    const night = ambientLighting(22, 'night', 'panorama');
    const day = ambientLighting(12, 'day', 'panorama');
    for (let i = 0; i < 3; i++) {
      expect(night.room[i]).toBeLessThan(day.room[i] * 0.5);
      expect(night.city[i]).toBeLessThan(day.city[i] * 0.5);
    }
  });
  it.each(['night', 'day', 'dusk', 'storm'] as const)('keeps the room shaded at the foot of buildings in %s', mood => {
    const time = { night: 22, day: 12, dusk: 18.4, storm: 22 }[mood];
    const open = ambientLighting(time, mood, 'panorama');
    const enclosed = ambientLighting(time, mood, 'panorama2');
    for (let i = 0; i < 3; i++) expect(enclosed.room[i]).toBeCloseTo(open.room[i] * 0.6);
    expect(enclosed.city).toEqual(open.city);
  });
});
