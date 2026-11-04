import { describe, expect, it } from 'vitest';
import { resolveParameters, parsePreset } from '../src/engine/parameters';
import { normalizeSettings } from '../src/experience/settings';
describe('per-layer atmosphere parameters', () => {
  it('fills partial layers and survives preset serialization', () => {
    const p = resolveParameters({ weather: { layers: { far: { hazeDensity: 0.2 }, near: { fogDensity: 0.6, fogAmount: 0.8 } } } });
    expect(p.weather.layers.far).toEqual({ hazeDensity: 0.2, fogDensity: 0, fogAmount: 0.5, billowing: 0 });
    expect(parsePreset(JSON.stringify(p))).toEqual(p);
    const next = resolveParameters({ weather: { layers: { far: { fogDensity: 0.5 } } } }, p);
    expect(next.weather.layers.far.hazeDensity).toBe(0.2);
    expect(p.weather.layers.far.fogDensity).toBe(0);
  });
  it('rejects invalid settings without changing the original', () => {
    const p = resolveParameters();
    for (const n of [-1, 2, NaN, Infinity]) expect(() => resolveParameters({ weather: { layers: { far: { fogDensity: n } } } }, p)).toThrow();
    expect(() => parsePreset('{"weather":{"layers":{"__proto__":{"fogDensity":1}}}}')).toThrow();
    expect(p.weather.layers).toEqual({});
  });
  it('restores old settings safely and clamps new controls', () => {
    expect(Object.keys(normalizeSettings({}).atmosphere)).toHaveLength(4);
    const s = normalizeSettings({ atmosphere: { far: { hazeDensity: 9, fogAmount: -1 } } });
    expect(s.atmosphere.far.hazeDensity).toBe(1);
    expect(s.atmosphere.far.fogAmount).toBe(0);
    expect(normalizeSettings(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});
