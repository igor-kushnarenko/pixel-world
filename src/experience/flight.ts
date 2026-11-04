import { CITY_LAYOUTS } from './config';
import type { CityId } from './config';
import type { LayerPlacement } from '../engine';

type Axis = { value: number; velocity: number; target: number };
function axis(value: number): Axis { return { value, velocity: 0, target: value }; }

// Exact critically damped spring: stable across frame rates, with continuous
// position and velocity when the destination changes during a flight.
function advance(a: Axis, dt: number, tolerance: number) {
  const omega = 4;
  const offset = a.value - a.target;
  const c = a.velocity + omega * offset;
  const decay = Math.exp(-omega * dt);
  a.value = a.target + (offset + c * dt) * decay;
  a.velocity = (a.velocity - omega * c * dt) * decay;
  if (Math.abs(a.value - a.target) < tolerance && Math.abs(a.velocity) < tolerance) {
    a.value = a.target; a.velocity = 0;
  }
}

export class PanoramaFlight {
  private layers: Record<string, { x: Axis; y: Axis; scale: Axis }> = {};
  private ambient: Axis;
  constructor(city: CityId) {
    for (const [id, p] of Object.entries(CITY_LAYOUTS[city].layers)) {
      this.layers[id] = { x: axis(p.x), y: axis(p.y), scale: axis(p.scale) };
    }
    this.ambient = axis(CITY_LAYOUTS[city].roomAmbient);
  }
  get roomAmbient() { return this.ambient.value; }
  get placements(): Record<string, LayerPlacement> {
    return Object.fromEntries(Object.entries(this.layers).map(([id, p]) => [id, {
      x: p.x.value, y: p.y.value, scale: p.scale.value
    }]));
  }
  get moving() {
    return [...Object.values(this.layers).flatMap(p => [p.x, p.y, p.scale]), this.ambient]
      .some(a => a.value !== a.target || a.velocity !== 0);
  }
  target(city: CityId) {
    for (const [id, p] of Object.entries(CITY_LAYOUTS[city].layers)) {
      this.layers[id].x.target = p.x; this.layers[id].y.target = p.y; this.layers[id].scale.target = p.scale;
    }
    this.ambient.target = CITY_LAYOUTS[city].roomAmbient;
  }
  update(dt: number) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    for (const p of Object.values(this.layers)) {
      advance(p.x, dt, 0.01); advance(p.y, dt, 0.01); advance(p.scale, dt, 0.000001);
    }
    advance(this.ambient, dt, 0.000001);
  }
}
