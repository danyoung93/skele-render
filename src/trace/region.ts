/** Flood-fill a flat-colour area and build a sub-pixel coverage field (trace tool spec §3.1). */
import { deltaE, rgbToLab } from './colour';

export interface Img { width: number; height: number; data: Uint8ClampedArray }
export interface Limit { x0: number; y0: number; x1: number; y1: number }
export interface Region {
  /** 1 for the area (holes filled), 0 elsewhere. */
  mask: Uint8Array;
  /** 1 only where the colour matched (before holes were filled). */
  coreMask: Uint8Array;
  /** Coverage 0..1: 1 inside, a fraction on the antialiased edge, 0 outside. Outlined by marching squares. */
  field: Float32Array;
  /** Pixels in `mask`. */
  count: number;
  /** Pixels that matched the colour, before filling holes. */
  core: number;
  hitLimit: boolean;
  colour: [number, number, number];
}

function medianOf(hist: Uint32Array[], total: number): [number, number, number] {
  return hist.map((h) => {
    let acc = 0;
    for (let v = 0; v < 256; v++) { acc += h[v]; if (acc * 2 > total) return v; }
    return 255;
  }) as [number, number, number];
}

/** Packed 0xRRGGBB colours, composited over white (transparent counts as white), for the limit window. */
function compositeColours(img: Img, x0: number, y0: number, x1: number, y1: number): Int32Array {
  const { width: w, data: d } = img;
  const out = new Int32Array(img.width * img.height).fill(-1);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = y * w + x, k = i * 4, a = d[k + 3] / 255, b = 255 * (1 - a);
    out[i] = (Math.round(d[k] * a + b) << 16) | (Math.round(d[k + 1] * a + b) << 8) | Math.round(d[k + 2] * a + b);
  }
  return out;
}
/** The packed colour of any pixel (computed on demand outside the window). */
function colourAt(img: Img, cols: Int32Array, i: number): number {
  if (cols[i] >= 0) return cols[i];
  const d = img.data, k = i * 4, a = d[k + 3] / 255, b = 255 * (1 - a);
  return (Math.round(d[k] * a + b) << 16) | (Math.round(d[k + 1] * a + b) << 8) | Math.round(d[k + 2] * a + b);
}
const R = (c: number) => (c >> 16) & 255, G = (c: number) => (c >> 8) & 255, B = (c: number) => c & 255;

/** Which edges of the limit count as a search limit (default: any edge that isn't the image's own edge). */
export interface LimitEdges { left: boolean; top: boolean; right: boolean; bottom: boolean }

export function growRegion(img: Img, seed: [number, number], tol: number, limit: Limit, edges?: LimitEdges): Region {
  const { width: w, height: h } = img;
  const x0 = Math.max(0, Math.floor(limit.x0)), y0 = Math.max(0, Math.floor(limit.y0));
  const x1 = Math.min(w, Math.ceil(limit.x1)), y1 = Math.min(h, Math.ceil(limit.y1));
  const mask = new Uint8Array(w * h);
  const sx = Math.min(x1 - 1, Math.max(x0, Math.floor(seed[0]))), sy = Math.min(y1 - 1, Math.max(y0, Math.floor(seed[1])));
  const cols = compositeColours(img, x0, y0, x1, y1);

  // Seed colour: median of the 3×3 around the click, so a click on a soft edge still picks the main colour.
  const sh = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  let sn = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = sx + dx, y = sy + dy;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const c = colourAt(img, cols, y * w + x); sh[0][R(c)]++; sh[1][G(c)]++; sh[2][B(c)]++; sn++;
  }
  let seedRgb = medianOf(sh, sn), seedLab = rgbToLab(...seedRgb);
  // Flat artwork has few distinct colours: cache the colour test per colour.
  const cache = new Map<number, boolean>();
  const matches = (c: number) => {
    let v = cache.get(c);
    if (v === undefined) { v = deltaE(rgbToLab(R(c), G(c), B(c)), seedLab) <= tol; cache.set(c, v); }
    return v;
  };
  const s0 = sy * w + sx;
  // On a thin line or a corner the 3×3 median is the surrounding colour: use the clicked pixel's own.
  if (!matches(cols[s0])) {
    const c = cols[s0];
    seedRgb = [R(c), G(c), B(c)]; seedLab = rgbToLab(...seedRgb); cache.clear();
  }

  // 4-connected flood fill within the limit, always compared with the seed colour.
  const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  let core = 0;
  const stack = new Int32Array(w * h);
  let top = 0;
  if (matches(cols[s0])) { mask[s0] = 1; stack[top++] = s0; }
  while (top) {
    const i = stack[--top], x = i % w, y = (i - x) / w, c = cols[i];
    hist[0][R(c)]++; hist[1][G(c)]++; hist[2][B(c)]++; core++;
    if (x + 1 < x1) { const j = i + 1; if (!mask[j] && matches(cols[j])) { mask[j] = 1; stack[top++] = j; } }
    if (x - 1 >= x0) { const j = i - 1; if (!mask[j] && matches(cols[j])) { mask[j] = 1; stack[top++] = j; } }
    if (y + 1 < y1) { const j = i + w; if (!mask[j] && matches(cols[j])) { mask[j] = 1; stack[top++] = j; } }
    if (y - 1 >= y0) { const j = i - w; if (!mask[j] && matches(cols[j])) { mask[j] = 1; stack[top++] = j; } }
  }
  const colour = core ? medianOf(hist, core) : seedRgb;

  const L = edges ?? { left: x0 > 0, top: y0 > 0, right: x1 < w, bottom: y1 < h };
  let hitLimit = false;
  if (L.left || L.right) for (let y = y0; y < y1 && !hitLimit; y++) hitLimit = (L.left && !!mask[y * w + x0]) || (L.right && !!mask[y * w + x1 - 1]);
  if (!hitLimit && (L.top || L.bottom)) for (let x = x0; x < x1 && !hitLimit; x++) hitLimit = (L.top && !!mask[y0 * w + x]) || (L.bottom && !!mask[(y1 - 1) * w + x]);

  const coreMask = mask.slice();
  // Fill holes: anything inside the limit that the outside can't reach becomes part of the area.
  const outside = new Uint8Array(w * h);
  top = 0;
  const reach = (j: number) => { if (!mask[j] && !outside[j]) { outside[j] = 1; stack[top++] = j; } };
  for (let x = x0; x < x1; x++) { reach(y0 * w + x); reach((y1 - 1) * w + x); }
  for (let y = y0; y < y1; y++) { reach(y * w + x0); reach(y * w + x1 - 1); }
  while (top) {
    const i = stack[--top], x = i % w, y = (i - x) / w;
    if (x + 1 < x1) reach(i + 1);
    if (x - 1 >= x0) reach(i - 1);
    if (y + 1 < y1) reach(i + w);
    if (y - 1 >= y0) reach(i - w);
  }
  let count = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const j = y * w + x; if (!outside[j]) { mask[j] = 1; count++; } }

  // Coverage field: 1 inside; on the antialiased edge, how far the pixel's colour lies from the
  // neighbouring "other" colour towards the area's colour (antialiasing blends linearly).
  const field = new Float32Array(w * h);
  const [cr, cg, cb] = colour;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = y * w + x;
    if (mask[i]) { field[i] = 1; continue; }
    const nearArea = (x + 1 < x1 && mask[i + 1]) || (x - 1 >= x0 && mask[i - 1]) || (y + 1 < y1 && mask[i + w]) || (y - 1 >= y0 && mask[i - w]);
    if (!nearArea) continue;
    // The most different non-area neighbour is the "other" colour on this edge.
    let other = -1, far = -1;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= w || ny >= h || mask[ny * w + nx]) continue;
      const c = colourAt(img, cols, ny * w + nx);
      const d = (R(c) - cr) ** 2 + (G(c) - cg) ** 2 + (B(c) - cb) ** 2;
      if (d > far) { far = d; other = c; }
    }
    if (other < 0 || far < 1) continue;
    const c = cols[i];
    const t = ((R(c) - R(other)) * (cr - R(other)) + (G(c) - G(other)) * (cg - G(other)) + (B(c) - B(other)) * (cb - B(other))) / far;
    field[i] = Math.min(1, Math.max(0, t));
  }
  return { mask, coreMask, field, count, core, hitLimit, colour };
}
