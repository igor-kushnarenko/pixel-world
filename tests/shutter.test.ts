import {expect,it}from'vitest';
import {shutterStep,exteriorVisibility}from'../src/experience/shutter';
it('holds, stops and clamps at both physical limits',()=>{
  expect(shutterStep(0.4,0,0.1)).toBe(0.4);
  expect(shutterStep(0.99,1,0.1)).toBe(1);expect(shutterStep(0.01,-1,0.1)).toBe(0);
  expect(shutterStep(0.4,1,0.1)).toBeGreaterThan(0.4);
  expect(exteriorVisibility(0)).toBe(1);expect(exteriorVisibility(1)).toBe(0);
  expect(exteriorVisibility(0.5)).toBeLessThan(0.5);
});
