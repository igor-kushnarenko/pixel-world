import type { SceneDefinition } from '../engine';
import { CITY_LAYOUTS, HEIGHT, RADIO_DIAL, RADIO_LED, WIDTH } from './config';
import type { CityId } from './config';

/** Extracts a separate binary occlusion mask, without editing source image data. */
async function windowMask(roomUrl: string): Promise<HTMLCanvasElement> {
  const image = new Image(); image.src = roomUrl; await image.decode();
  if (image.width !== WIDTH || image.height !== HEIGHT) throw new Error('Room asset dimensions do not match the authored layout');
  const c = document.createElement('canvas'); c.width = WIDTH; c.height = HEIGHT;
  const ctx = c.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, WIDTH, HEIGHT);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const open = pixels.data[i + 3] < 128 ? 255 : 0;
    pixels.data[i] = open; pixels.data[i + 1] = open; pixels.data[i + 2] = open; pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0); return c;
}
export async function createApartmentLocation(city: CityId, computerScreen?:HTMLCanvasElement): Promise<SceneDefinition> {
  const originals = `${import.meta.env.BASE_URL}assets/nightcity/originals/`;
  const masks = `${import.meta.env.BASE_URL}assets/apartment/masks/`;
  const room = `${originals}room.png`;
  const ids = ['far', 'midfar', 'midnear', 'near'];
  const files = ['city-far', 'city-mid-far', 'city-mid-near', 'city-near'];
  return {
    width: WIDTH, height: HEIGHT, windowMask: await windowMask(room), fogDepth: 50, rainDepth: 90,
    layers: [
      ...ids.map((id, i) => ({
        id, source: `${originals}${files[i]}.png`, depth: 20 + i * 20, scope: 'world' as const,
        receivesLightning: true, placement: CITY_LAYOUTS[city].layers[id], cityLightMask: `${masks}${id}_fx.png`,
        closeTraffic: id === 'midnear'
      })),
      { id: 'apartment', source: room, depth: 100, scope: 'room', receivesLightning: true,
        tint: [0.76, 0.78, 0.84], roomLights: {
          left: `${masks}lit_left.png`, right: `${masks}lit_right.png`, emitters: `${masks}room_emit.png`,
          radioDial: RADIO_DIAL, radioLed: RADIO_LED, computerScreen,computerRect:[394,640,550,744],computerCorners:[400,548,394,549]
        }
      }
    ]
  };
}
