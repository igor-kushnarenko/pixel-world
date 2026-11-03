/** A first rAF timestamp can precede performance.now() sampled during setup. */
export function frameDeltaSeconds(now: number, previous: number): number {
  if (!Number.isFinite(now) || !Number.isFinite(previous)) return 0;
  return Math.max(0, Math.min(0.1, (now - previous) / 1000));
}
