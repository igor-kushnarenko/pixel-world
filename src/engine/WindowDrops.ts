export interface GlassDrop { x: number; y: number; mass: number; speed: number; phase: number }
/** Small seeded, fixed-step simulation; mass is conserved when droplets merge. */
export class WindowDrops {
  drops: GlassDrop[] = [];
  private state: number;
  private accumulator = 0;
  constructor(private width: number, private height: number, seed: number) { this.state = seed || 1; }
  private random() { this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0; return this.state / 4294967296; }
  reset(seed: number) { this.state = seed || 1; this.drops = []; this.accumulator = 0; }
  update(dt: number, rain: number) {
    this.accumulator += Math.min(1, dt);
    while (this.accumulator >= 1 / 60) { this.accumulator -= 1 / 60; this.step(rain); }
  }
  private step(rain: number) {
    if (this.drops.length < 32 && this.random() < rain * 0.12) {
      this.drops.push({ x: this.random() * this.width, y: this.random() * this.height, mass: 3 + this.random() * 9, speed: 0, phase: this.random() * 30 });
    }
    for (const d of this.drops) {
      d.mass += rain * 0.004;
      const desired = d.mass > 7 ? Math.min(100, (d.mass - 7) * 5) : 0;
      d.speed += (desired - d.speed) * 0.03;
      d.y += d.speed / 60;
      d.x += Math.sin(d.y * 0.035 + d.phase) * d.speed / 180;
      if (rain === 0) d.mass -= 0.006;
    }
    for (let i = 0; i < this.drops.length; i++) for (let j = this.drops.length - 1; j > i; j--) {
      const a = this.drops[i], b = this.drops[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < (Math.sqrt(a.mass) + Math.sqrt(b.mass)) * 0.75) {
        const mass = a.mass + b.mass;
        a.x = (a.x * a.mass + b.x * b.mass) / mass;
        a.y = Math.max(a.y, b.y); a.speed = Math.max(a.speed, b.speed);
        a.mass = mass; this.drops.splice(j, 1);
      }
    }
    this.drops = this.drops.filter(d => d.y < this.height + 20 && d.mass > 0.5);
  }
}
