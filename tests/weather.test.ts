import { expect,it } from 'vitest';
import { DEFAULT_PLACE,validPlace,weatherName } from '../src/experience/weather';
it('validates locations and starts with Anapa in the correct timezone',()=>{
  expect(validPlace(DEFAULT_PLACE)).toBe(true);expect(DEFAULT_PLACE.timezone).toBe('Europe/Moscow');
  expect(validPlace({...DEFAULT_PLACE,latitude:100})).toBe(false);
  expect(validPlace({...DEFAULT_PLACE,timezone:'invalid/zone'})).toBe(false);
  expect(validPlace(null)).toBe(false);
});
it('labels rain, snow, thunderstorms and unknown conditions',()=>{
  expect(weatherName(0)).toBe('Ясно');expect(weatherName(3)).toBe('Облачно');
  expect(weatherName(61)).toBe('Дождь');expect(weatherName(75)).toBe('Снег');expect(weatherName(95)).toBe('Гроза');
  expect(weatherName(NaN)).toBe('Погода');
});
