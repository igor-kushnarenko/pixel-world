import type { SceneDefinition } from '../engine';

/** Author-approved placement, baked into full-canvas exports without resampling.
 * Original PSD offsets and source hashes: public/assets/nightcity/manifest.json.
 * The room is deliberately separate: it has no placement in the supplied PSD.
 */
export function createNightCityLocation(): SceneDefinition {
  const base = `${import.meta.env.BASE_URL}assets/nightcity/psd/`;
  return {
    width: 1890, height: 1063, fogDepth: 50, rainDepth: 90,
    layers: [
      { id: 'reference-background', source: `${base}reference-background.png`, depth: 0.25, scope: 'world' },
      { id: 'reference-sky', source: `${base}reference-sky.png`, depth: 0.5, scope: 'world' },
      { id: 'city-far', source: `${base}city-far.png`, depth: 20, scope: 'world', receivesLightning: true },
      { id: 'city-mid-far', source: `${base}city-mid-far.png`, depth: 40, scope: 'world', receivesLightning: true },
      { id: 'city-mid-near', source: `${base}city-mid-near.png`, depth: 60, scope: 'world', receivesLightning: true },
      { id: 'city-near', source: `${base}city-near.png`, depth: 80, scope: 'world', receivesLightning: true }
    ]
  };
}
