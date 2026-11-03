import type { SceneDefinition } from '../engine';

// DEMO ONLY. These canvases are generated once. Replace with untouched production PNGs.
export const WIDTH = 480, HEIGHT = 270;
function surface() {
  const canvas = document.createElement('canvas'); canvas.width = WIDTH; canvas.height = HEIGHT;
  const c = canvas.getContext('2d')!; c.imageSmoothingEnabled = false; return { canvas, c };
}
function random(seed: number) { let state = seed; return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; }; }
export function createDemoLocation(): SceneDefinition {
  const far = surface(), mid = surface(), near = surface(), room = surface(), opening = surface();
  const windows = surface(), neon = surface(), sill = surface(), lamp = surface(), radio = surface(), computer = surface();
  const rng = random(83);
  const rect = (ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
  // Exactly the same white aperture is consumed by sky, clouds, city, fog, rain and city lights.
  rect(opening.c, '#000000', 0, 0, WIDTH, HEIGHT);
  rect(opening.c, '#ffffff', 29, 17, 422, 205);
  rect(opening.c, '#000000', 238, 17, 5, 205);
  rect(opening.c, '#000000', 29, 66, 422, 4);

  let x = -8;
  while (x < WIDTH) {
    const w = 12 + Math.floor(rng() * 26), h = 45 + Math.floor(rng() * 104), y = 234 - h;
    rect(far.c, '#1b2035', x, y, w, h);
    rect(far.c, '#24293e', x, y, w, 2);
    if (rng() > 0.4) rect(far.c, '#252a42', x + Math.floor(w / 2), y - 12, 1, 12);
    for (let wx = x + 3; wx < x + w - 2; wx += 5) for (let wy = y + 5; wy < 232; wy += 6) {
      if (rng() > 0.67) rect(far.c, rng() > 0.5 ? '#30384e' : '#353248', wx, wy, 1, 2);
    }
    x += w + 3;
  }
  const buildings = [
    { x: 8, w: 47, y: 104 }, { x: 69, w: 29, y: 75 }, { x: 109, w: 47, y: 126 },
    { x: 171, w: 41, y: 38 }, { x: 219, w: 42, y: 113 }, { x: 278, w: 34, y: 85 },
    { x: 327, w: 53, y: 117 }, { x: 398, w: 48, y: 53 }, { x: 458, w: 35, y: 119 }
  ];
  for (const b of buildings) {
    rect(mid.c, '#11182b', b.x, b.y, b.w, HEIGHT - b.y);
    rect(mid.c, '#263149', b.x, b.y, b.w, 2);
    rect(mid.c, '#1b263d', b.x + b.w - 4, b.y + 2, 4, HEIGHT - b.y);
    rect(mid.c, '#1c253a', b.x + 5, b.y - 4, b.w - 10, 4);
    for (let wx = b.x + 5; wx < b.x + b.w - 5; wx += 6) for (let wy = b.y + 8; wy < 245; wy += 7) {
      rect(mid.c, '#1d2638', wx, wy, 2, 3);
      if (rng() > 0.49) {
        rect(mid.c, '#292d39', wx, wy, 2, 3);
        rect(windows.c, '#ffffff', wx, wy, 2, 3);
      }
    }
    if (b.y < 90) {
      rect(mid.c, '#1f2c41', b.x + 12, b.y - 19, 2, 15);
      rect(neon.c, '#ffffff', b.x + 12, b.y - 20, 2, 1);
    }
  }
  // These rectangles are explicit source masks, never randomly spawned at runtime.
  rect(mid.c, '#22213b', 112, 150, 9, 28);
  for (let j = 0; j < 4; j++) rect(neon.c, '#ffffff', 114, 153 + j * 6, 5, 3);
  rect(mid.c, '#1c303d', 337, 141, 32, 8);
  rect(neon.c, '#ffffff', 340, 143, 26, 2);
  rect(mid.c, '#253342', 178, 45, 24, 2); rect(neon.c, '#ffffff', 178, 45, 24, 1);
  rect(near.c, '#0a1121', 0, 236, WIDTH, 34);
  rect(near.c, '#1f2e40', 0, 236, WIDTH, 2);
  rect(near.c, '#0c1424', 0, 187, 33, 49); rect(near.c, '#293348', 0, 187, 33, 2);
  rect(near.c, '#0d1425', 431, 198, 49, 38); rect(near.c, '#2b3346', 431, 198, 49, 2);
  for (let i = 0; i < 14; i++) rect(near.c, '#152035', i * 38, 244, 26, 2);
  // An entirely separate example room; no approved production art is being substituted.
  rect(room.c, '#090e17', 0, 0, WIDTH, 17); rect(room.c, '#0a0f19', 0, 17, 29, 205);
  rect(room.c, '#0a101a', 451, 17, 29, 205); rect(room.c, '#0b111c', 0, 222, WIDTH, 48);
  rect(room.c, '#263341', 26, 14, 428, 3); rect(room.c, '#151f2c', 26, 17, 3, 205);
  rect(room.c, '#24313e', 451, 17, 3, 205); rect(room.c, '#1d2b3a', 238, 17, 5, 205);
  rect(room.c, '#273445', 29, 66, 422, 2); rect(room.c, '#0c1422', 29, 68, 422, 2);
  rect(room.c, '#2b3946', 22, 222, 436, 5); rect(room.c, '#192433', 17, 227, 446, 5);
  rect(room.c, '#0d1521', 17, 232, 446, 5); rect(room.c, '#151c26', 0, 256, WIDTH, 3);
  // Dark unpowered devices.
  rect(room.c, '#080c14', 335, 196, 65, 27); rect(room.c, '#1d2631', 335, 196, 65, 2);
  rect(room.c, '#111b27', 340, 201, 24, 9); rect(room.c, '#1b2430', 369, 203, 25, 2);
  for (let j = 0; j < 6; j++) rect(room.c, '#202936', 369 + j * 4, 208, 1, 10);
  rect(room.c, '#151d28', 356, 177, 1, 19);
  rect(room.c, '#080d16', 69, 189, 39, 29); rect(room.c, '#192534', 69, 189, 39, 2);
  rect(room.c, '#0d1622', 73, 193, 31, 21); rect(room.c, '#151e2a', 85, 218, 7, 4);
  rect(room.c, '#202735', 63, 222, 52, 2);
  rect(room.c, '#111a26', 128, 212, 11, 10); rect(room.c, '#29343f', 128, 211, 11, 2);
  rect(room.c, '#1d2833', 139, 214, 3, 5);
  rect(room.c, '#151d29', 279, 201, 12, 21); rect(room.c, '#1d2936', 280, 198, 10, 3);
  rect(room.c, '#172434', 281, 182, 1, 18); rect(room.c, '#1e2b3a', 275, 186, 15, 3);
  rect(room.c, '#1e2b3a', 282, 178, 7, 3);
  // Stepped exterior receiver mask, localized to sill/frame/devices.
  rect(sill.c, '#ffffff', 22, 222, 436, 2); rect(sill.c, '#777777', 17, 227, 446, 2);
  rect(sill.c, '#555555', 26, 17, 3, 205); rect(sill.c, '#555555', 451, 17, 3, 205);
  rect(sill.c, '#444444', 238, 17, 2, 205); rect(sill.c, '#444444', 29, 66, 422, 1);
  rect(sill.c, '#555555', 69, 189, 39, 1); rect(sill.c, '#555555', 335, 196, 65, 1);
  rect(sill.c, '#888888', 128, 211, 11, 1);
  rect(lamp.c, '#999999', 0, 244, WIDTH, 3);
  rect(radio.c, '#ffffff', 340, 201, 24, 9); rect(computer.c, '#ffffff', 73, 193, 31, 21);
  return {
    width: WIDTH, height: HEIGHT, windowMask: opening.canvas, fogDepth: 50, rainDepth: 80,
    layers: [
      { id: 'city-far', source: far.canvas, depth: 20, scope: 'world', receivesLightning: true },
      { id: 'city-mid', source: mid.canvas, depth: 40, scope: 'world', receivesLightning: true },
      { id: 'city-near', source: near.canvas, depth: 60, scope: 'world', receivesLightning: true },
      { id: 'room-0a', source: room.canvas, depth: 100, scope: 'room', receivesLightning: false }
    ],
    lights: [
      { id: 'windows', source: windows.canvas, depth: 41, scope: 'world', group: 'cityWindows', color: '#c7a282', intensity: 0.8 },
      { id: 'neon', source: neon.canvas, depth: 42, scope: 'world', group: 'neon', color: '#67c6dc', intensity: 0.85 },
      { id: 'room-exterior', source: sill.canvas, depth: 110, scope: 'room', group: 'exteriorRoom', color: '#719fce' },
      { id: 'room-lamp', source: lamp.canvas, depth: 111, scope: 'room', group: 'interior', color: '#dc9f64' },
      { id: 'room-radio', source: radio.canvas, depth: 112, scope: 'room', group: 'radio', color: '#6baf9a', intensity: 0.45 },
      { id: 'room-computer', source: computer.canvas, depth: 113, scope: 'room', group: 'computer', color: '#4e9fbd', intensity: 0.6 }
    ]
  };
}
