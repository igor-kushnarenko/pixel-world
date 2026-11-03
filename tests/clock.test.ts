import { expect, it } from 'vitest';
import { frameDeltaSeconds } from '../src/engine/clock';

it('does not stop animation when the first browser frame timestamp predates setup', () => {
  expect(frameDeltaSeconds(1000, 1005)).toBe(0);
  expect(frameDeltaSeconds(1016, 1000)).toBeCloseTo(0.016);
});
it('limits hidden-tab jumps and rejects unusable clock samples', () => {
  expect(frameDeltaSeconds(60000, 1000)).toBe(0.1);
  expect(frameDeltaSeconds(NaN, 1000)).toBe(0);
});
