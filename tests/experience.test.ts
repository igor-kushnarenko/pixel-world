import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/experience/settings';
import { CITY_IDS, CITY_LAYOUTS, HOTSPOTS, HEIGHT, WIDTH, nextCity } from '../src/experience/config';
import { nextIndex } from '../src/experience/vendor/radio.js';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

describe('apartment controls and restoration', () => {
  it('starts with the canonical night, dry sky and powered-off lamps', () => {
    const s = normalizeSettings(null);
    expect(s.sky).toBe('night'); expect(s.rain).toBe(0); expect(s.clouds).toBe(false);
    expect(s.left).toBe(false); expect(s.right).toBe(false);
  });
  it('rejects invalid saved moods/layouts and clamps volume without coercing text', () => {
    const s = normalizeSettings({ sky: 'unknown', city: '__proto__', volume: 9, rain: -1, radioVolume: '1', cloudSpeed: NaN });
    expect(s.sky).toBe('night'); expect(s.city).toBe('panorama');
    expect(s.volume).toBe(1); expect(s.rain).toBe(0); expect(s.radioVolume).toBe(0.5); expect(s.cloudSpeed).toBe(DEFAULT_SETTINGS.cloudSpeed);
  });
  it('round-trips the user’s mix, lamps and selected station', () => {
    const saved = { ...DEFAULT_SETTINGS, left: true, rain: 0.4, station: 'test-station', city: 'panorama2' };
    expect(normalizeSettings(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });
  it('every authored city view covers the bottom of the window', () => {
    for (const layout of Object.values(CITY_LAYOUTS)) {
      const near = layout.layers.near;
      expect(HEIGHT / 2 + near.y + HEIGHT * near.scale / 2).toBeGreaterThanOrEqual(743);
    }
    expect(nextCity(CITY_IDS[0], -1)).toBe(CITY_IDS.at(-1));
  });
  it('radio and lamp hit zones fit native art and do not overlap', () => {
    const entries = Object.values(HOTSPOTS);
    for (const { rect } of entries) { expect(rect[0]).toBeGreaterThanOrEqual(0); expect(rect[2]).toBeLessThanOrEqual(WIDTH); expect(rect[3]).toBeLessThanOrEqual(HEIGHT); }
    const r = HOTSPOTS.radio.rect;
    for (const id of ['left', 'right'] as const) { const l = HOTSPOTS[id].rect; expect(r[2] < l[0] || r[0] > l[2] || r[3] < l[1] || r[1] > l[3]).toBe(true); }
  });
});
describe('borrowed radio station contract', () => {
  it('imported masks and station catalog match their recorded source hashes', () => {
    const manifest = JSON.parse(readFileSync('public/assets/apartment/provenance.json', 'utf8')) as { assets: { file: string; sha256: string }[] };
    for (const asset of manifest.assets) expect(createHash('sha256').update(readFileSync(`public/assets/apartment/${asset.file}`)).digest('hex')).toBe(asset.sha256);
  });
  it('skips unavailable stations in either direction and terminates when all fail', () => {
    expect(nextIndex(4, 0, 1, new Set([1, 2]))).toBe(3);
    expect(nextIndex(4, 0, -1, new Set([3]))).toBe(2);
    expect(nextIndex(2, 0, 1, new Set([0, 1]))).toBe(-1);
    expect(nextIndex(0, 0, 1, new Set())).toBe(-1);
  });
  it('catalog contains unique HTTPS audio endpoints without HLS playlists', () => {
    const list = JSON.parse(readFileSync('public/assets/apartment/stations.json', 'utf8')) as { id: string; url: string; name: string }[];
    expect(list.length).toBeGreaterThan(0); expect(new Set(list.map(s => s.url)).size).toBe(list.length);
    for (const s of list) { expect(s.url.startsWith('https://')).toBe(true); expect(s.url.includes('.m3u8')).toBe(false); expect(s.id && s.name).toBeTruthy(); }
  });
});
