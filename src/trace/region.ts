/** Flood-fill a flat-colour area and build a sub-pixel coverage field (trace tool spec §3.1). */
import { deltaE, rgbToLab } from './colour';

export interface Img { width: number; height: number; data: Uint8ClampedArray }
export interface Limit { x0: number; y0: number; x1: number; y1: number }
export interface Region {
  /** 1 for the area (holes filled), 0 elsewhere. */
  mask: Uint8Array;
  /** Coverage 0..1: 1 inside, a fraction on the antialiased edge, 0 outside. Outlined by marching squares. */
  field: Float32Array;
  /** Pixels in `mask`. */
  count: number;
  /** Pixels that matched the colour, before filling holes. */
  core: number;
  hitLimit: boolean;
  colour: [number, number, number];
}

/** A pixel's colour composited over white (transparent counts as white), rounded to 8 bits. */
function rgb(img: Img, i: number): [number, number, number] {
  const d = img.data, a = d[i * 4 + 3] / 255;
  return [Math.round(d[i * 4] * a + 255 * (1 - a)), Math.round(d[i * 4 + 1] * a + 255 * (1 - a)), Math.round(d[i * 4 + 2] * a + 255 * (1 - a))];
}

function medianOf(hist: Uint32Array[], total: number): [number, number, number] {
  return hist.map((h) => {
    let acc = 0;
    for (let v = 0; v < 256; v++) { acc += h[v]; if (acc * 2 > total) return v; }
    return 255;
  }) as [number, number, number];
}

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

export function growRegion(img: Img, seed: [number, number], tol: number, limit: Limit): Region {
  const { width: w, height: h } = img;
  const x0 = Math.max(0, Math.floor(limit.x0)), y0 = Math.max(0, Math.floor(limit.y0));
  const x1 = Math.min(w, Math.ceil(limit.x1)), y1 = Math.min(h, Math.ceil(limit.y1));
  const mask = new Uint8Array(w * h);
  const sx = Math.min(x1 - 1, Math.max(x0, Math.floor(seed[0]))), sy = Math.min(y1 - 1, Math.max(y0, Math.floor(seed[1])));

  // Seed colour: median of the 3×3 around the click, so a click on a soft edge still picks the main colour.
  const sh = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  let sn = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = sx + dx, y = sy + dy;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const c = rgb(img, y * w + x); sh[0][c[0]]++; sh[1][c[1]]++; sh[2][c[2]]++; sn++;
  }
  const seedRgb = medianOf(sh, sn), seedLab = rgbToLab(...seedRgb);
  // Flat artwork has few distinct colours: cache the colour test per colour.
  const cache = new Map<number, boolean>();
  const inside = (i: number) => {
    const c = rgb(img, i), key = (c[0] << 16) | (c[1] << 8) | c[2];
    let v = cache.get(key);
    if (v === undefined) { v = deltaE(rgbToLab(c[0], c[1], c[2]), seedLab) <= tol; cache.set(key, v); }
    return v;
  };

  // 4-connected flood fill within the limit, always compared with the seed colour.
  const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  let core = 0;
  const stack: number[] = [];
  const s0 = sy * w + sx;
  if (inside(s0)) { mask[s0] = 1; stack.push(s0); }
  while (stack.length) {
    const i = stack.pop()!, x = i % w, y = (i - x) / w;
    const c = rgb(img, i); hist[0][c[0]]++; hist[1][c[1]]++; hist[2][c[2]]++; core++;
    for (const [dx, dy] of N4) {
      const nx = x + dx, ny = y + dy;
      if (nx < x0 || ny < y0 || nx >= x1 || ny >= y1) continue;
      const j = ny * w + nx;
      if (!mask[j] && inside(j)) { mask[j] = 1; stack.push(j); }
    }
  }
  const colour = core ? medianOf(hist, core) : seedRgb;

  let hitLimit = false;
  for (let y = y0; y < y1 && !hitLimit; y++) for (let x = x0; x < x1; x++) {
    if (!mask[y * w + x]) continue;
    if ((x === x0 && x0 > 0) || (y === y0 && y0 > 0) || (x === x1 - 1 && x1 < w) || (y === y1 - 1 && y1 < h)) { hitLimit = true; break; }
  }

  // Fill holes: anything inside the limit that the outside can't reach becomes part of the area.
  const outside = new Uint8Array(w * h);
  const q: number[] = [];
  const reach = (x: number, y: number) => { const j = y * w + x; if (!mask[j] && !outside[j]) { outside[j] = 1; q.push(j); } };
  for (let x = x0; x < x1; x++) { reach(x, y0); reach(x, y1 - 1); }
  for (let y = y0; y < y1; y++) { reach(x0, y); reach(x1 - 1, y); }
  while (q.length) {
    const i = q.pop()!, x = i % w, y = (i - x) / w;
    for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy; if (nx >= x0 && ny >= y0 && nx < x1 && ny < y1) reach(nx, ny); }
  }
  let count = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const j = y * w + x; if (!outside[j]) { mask[j] = 1; count++; } }

  // Coverage field: 1 inside; on the antialiased edge, how far the pixel's colour lies from the
  // neighbouring "other" colour towards the area's colour (antialiasing blends linearly).
  const field = new Float32Array(w * h);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = y * w + x;
    if (mask[i]) { field[i] = 1; continue; }
    if (!N4.some(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= x0 && ny >= y0 && nx < x1 && ny < y1 && mask[ny * w + nx]; })) continue;
    // The most different non-area neighbour is the "other" colour on this edge.
    let other: [number, number, number] | null = null, far = -1;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= w || ny >= h || mask[ny * w + nx]) continue;
      const c = rgb(img, ny * w + nx);
      const d = (c[0] - colour[0]) ** 2 + (c[1] - colour[1]) ** 2 + (c[2] - colour[2]) ** 2;
      if (d > far) { far = d; other = c; }
    }
    const c = rgb(img, i);
    if (!other || far < 1) continue;
    const t = ((c[0] - other[0]) * (colour[0] - other[0]) + (c[1] - other[1]) * (colour[1] - other[1]) + (c[2] - other[2]) * (colour[2] - other[2])) / far;
    field[i] = Math.min(1, Math.max(0, t));
  }
  return { mask, field, count, core, hitLimit, colour };
}
