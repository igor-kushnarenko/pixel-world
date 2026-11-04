export interface AirVehicle { x: number; y: number; dx: number; dy: number; kind: number; variant: number; tint: number }
const random = (n: number) => { let h = Math.imul(n ^ (n >>> 16), 2246822519); h = Math.imul(h ^ (h >>> 13), 3266489917); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export function routeCount(rank: number) { return rank < 2 ? 6 : 4; }
/** Authored corridors in source-image coordinates; slopes give vehicle headings. */
export function airRoute(route: number, x: number, width: number, height: number) {
  const t = x / width;
  let bend = 0, slope = 0;
  if (route === 1 || route === 2) {
    slope = (route === 1 ? 0.14 : -0.18) * height / width;
    bend = (t - 0.5) * (route === 1 ? 0.14 : -0.18) * height;
  } else if (route >= 3) {
    // Smooth dogleg: climb around a central block, then rejoin the corridor.
    const a = Math.tanh((t - 0.32) * 12), b = Math.tanh((t - 0.7) * 12);
    const amplitude = (route % 2 ? -0.065 : 0.065) * height;
    bend = amplitude * (a - b);
    slope = amplitude * 12 * ((1 - a * a) - (1 - b * b)) / width;
  }
  return { y: height * (0.18 + route * 0.095) + bend, slope };
}
/** At most 60 distant or 24 middle sprites; evaluated once per frame on CPU. */
export function sampleTraffic(width: number, height: number, rank: number, time: number, density: number, seed: number): AirVehicle[] {
  const result: AirVehicle[] = [];
  const routes = routeCount(rank), count = rank < 2 ? 5 : 3;
  for (let route = 0; route < routes; route++) for (let direction = 0; direction < 2; direction++) for (let car = 0; car < count; car++) {
    const id = seed + rank * 1777 + route * 113 + direction * 37 + car * 7;
    if (random(id + 1) >= density) continue;
    const r = random(id + 2), kind = r < 0.6 ? 0 : r < 0.83 ? 1 : 2;
    const sign = direction === 0 ? 1 : -1;
    const span = width + 80;
    const speed = (kind === 0 ? 23 : kind === 1 ? 16 : 13) * (0.6 + rank * 0.2) * (0.8 + random(id + 3) * 0.4);
    const x = ((random(id + 4) * span + time * speed * sign) % span + span) % span - 40;
    const path = airRoute(route, x, width, height);
    const norm = Math.hypot(1, path.slope);
    result.push({ x, y: path.y + direction * 12, dx: sign / norm, dy: sign * path.slope / norm,
      kind, variant: Math.floor(random(id + 5) * 3), tint: random(id + 6) });
  }
  return result;
}

export function sampleCloseTraffic(width: number, height: number, time: number, density: number, seed: number): AirVehicle[] {
  const cars: AirVehicle[] = [];
  for(let direction=0;direction<2;direction++)for(let i=0;i<6;i++){
    if(random(seed+i*31+direction*223)>=density)continue;
    const sign=direction===0?1:-1;
    const span=width+160, speed=30+(i%3)*5;
    const x=(((i/6+direction*0.07)*span+time*speed*sign)%span+span)%span-80;
    const wave=(x/width-0.5)*Math.PI;
    const slope=Math.cos(wave)*height*0.025*Math.PI/width;
    const norm=Math.hypot(1,slope);
    cars.push({x,y:height*(0.55+direction*0.055)+Math.sin(wave)*height*0.025,
      dx:sign/norm,dy:sign*slope/norm,kind:i%3,variant:Math.floor(i/2)%3,tint:random(seed+i*13+direction*17)});
  }
  return cars;
}
