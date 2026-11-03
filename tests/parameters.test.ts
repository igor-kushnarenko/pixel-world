import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMETERS, getPreset, paletteAt, parsePreset, resolveParameters } from '../src/engine/parameters';

describe('canonical contract and safe preset import', () => {
  it('starts with a clear moonless night and all interior devices off', () => {
    const p = getPreset('canonical');
    expect(p.timeOfDay).toBe(22);
    expect(p.clouds.enabled).toBe(false); expect(p.clouds.coverage).toBe(0);
    expect(p.sky.moonEnabled).toBe(false); expect(p.sky.starsEnabled).toBe(false);
    expect(p.render.dithering).toBe(false);
    expect(p.lighting).toMatchObject({ interiorLightsEnabled: false, radioBacklightEnabled: false, computerEnabled: false });
  });
  it('accepts the canonical minimum JSON and supplies independent layer defaults', () => {
    const p = parsePreset(JSON.stringify({ presetVersion: 1, timeOfDay: 22, clouds: { enabled: false } }));
    expect(p.clouds.layers.far.depth).toBeLessThan(p.clouds.layers.low.depth);
    expect(p.clouds.layers.far.speed).toBeLessThan(p.clouds.layers.low.speed);
  });
  it('does not mutate current parameters or defaults on a partial edit', () => {
    const p = getPreset('canonical');
    const edited = resolveParameters({ clouds: { layers: { far: { height: 0.42 } } } }, p);
    expect(edited.clouds.layers.far.height).toBe(0.42);
    expect(p.clouds.layers.far.height).toBe(0.23);
    expect(DEFAULT_PARAMETERS.clouds.layers.far.height).toBe(0.23);
  });
  it('round-trips the complete storm state', () => {
    const p = getPreset('storm'); expect(parsePreset(JSON.stringify(p))).toEqual(p);
  });
  it.each([
    '{"presetVersion":2}', '{"clouds":{"coverage":2}}', '{"timeOfDay":null}',
    '{"sky":{"moonEnabled":true}}', '{"render":{"sampling":"linear"}}',
    '{"clouds":{"layers":{"far":{"colorSteps":2.5}}}}',
    '{"__proto__":{"polluted":true}}', '{"sky":{"unknown":1}}', '[]', 'null'
  ])('rejects invalid or incompatible input %s', json => {
    expect(() => parsePreset(json)).toThrow();
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
  it('rejects NaN and Infinity without changing a valid state', () => {
    expect(() => resolveParameters({ timeOfDay: NaN })).toThrow();
    expect(() => resolveParameters({ clouds: { windSpeed: Infinity } })).toThrow();
  });
  it('cycles through midnight continuously and daylight changes the sky', () => {
    const a = paletteAt(0, 'cyberpunk_night'), b = paletteAt(24, 'cyberpunk_night');
    expect(a).toEqual(b); expect(paletteAt(12, 'cyberpunk_night').ambient).toBeGreaterThan(a.ambient);
    const before = paletteAt(23.999, 'cyberpunk_night');
    expect(Math.abs(before.top[0] - a.top[0])).toBeLessThan(0.001);
  });
});
