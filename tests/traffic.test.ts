import { expect, it } from 'vitest';
import { airRoute, routeCount, sampleTraffic, sampleCloseTraffic } from '../src/engine/traffic';
it('adds more distant corridors and keeps both directions',()=>{
  expect(routeCount(0)).toBe(6);expect(routeCount(1)).toBe(6);expect(routeCount(2)).toBe(4);
  for(let rank=0;rank<4;rank++){
    const v=sampleTraffic(1672,941,rank,30,1,712);
    expect(v).toHaveLength(rank<2?60:24);
    expect(v.filter(c=>c.dx>0)).toHaveLength(rank<2?30:12);
    expect(v.every(c=>Math.abs(Math.hypot(c.dx,c.dy)-1)<1e-9)).toBe(true);
  }
});
it('provides a dedicated close corridor with all vehicle types and opposing lanes',()=>{
  const v=sampleCloseTraffic(1672,941,0,1,712);
  expect(v).toHaveLength(12);expect(new Set(v.map(c=>c.kind)).size).toBe(3);
  expect(v.filter(c=>c.dx>0)).toHaveLength(6);
  expect(v.every(c=>c.y>941*0.5&&c.y<941*0.64)).toBe(true);
  expect(sampleCloseTraffic(1672,941,0,0,712)).toEqual([]);
});
it('makes reproducible traffic with all nine vehicle variants',()=>{
  const variants=new Set<string>();
  for(let seed=1;seed<20;seed++)for(const v of sampleTraffic(1672,941,2,20,1,seed))variants.add(`${v.kind}-${v.variant}`);
  expect(variants.size).toBe(9);
  expect(sampleTraffic(1672,941,2,20,0,712)).toEqual([]);
  expect(sampleTraffic(1672,941,2,20,0.55,712)).toEqual(sampleTraffic(1672,941,2,20,0.55,712));
});
it('curves routes smoothly and aligns headings to their slopes',()=>{
  expect(airRoute(1,400,1672,941).slope).toBeGreaterThan(0);
  expect(airRoute(2,400,1672,941).slope).toBeLessThan(0);
  for(const route of [3,4,5])for(const x of [200,535,850,1170]){
    const p=airRoute(route,x,1672,941);
    const derivative=(airRoute(route,x+0.001,1672,941).y-airRoute(route,x-0.001,1672,941).y)/0.002;
    expect(p.slope).toBeCloseTo(derivative,6);
  }
  const a=sampleTraffic(1672,941,2,0,1,712),b=sampleTraffic(1672,941,2,0.01,1,712);
  expect(Math.abs(a[0].x-b[0].x)).toBeLessThan(1);
});
