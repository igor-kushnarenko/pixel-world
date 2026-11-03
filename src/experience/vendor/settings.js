// rainParams adapted from igor-kushnarenko/nightcity src/settings.js.
// Audio only: procedural sky and visual weather remain owned by Atmosphere Engine.
export function rainParams(level) {
  const l = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
  return { soundGain: l < 0.01 ? 0 : 0.015 + 0.055 * l, soundCutoff: 2500 + 3500 * l };
}
