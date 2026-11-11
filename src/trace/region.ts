/** Flood-fill a flat-colour area (trace tool spec §3.1). */
import { deltaE, rgbToLab } from './colour';

export interface Img { width: number; height: number; data: Uint8ClampedArray }
export interface Limit { x0: number; y0: number; x1: number; y1: number }
export interface Region { mask: Uint8Array; count: number; hitLimit: boolean; colour: [number, number, number] }

/** A pixel's colour composited over white (transparent counts as white). */
function rgb(img: Img, i: number): [number, number, number] {
  const d = img.data, a = d[i * 4 + 3] / 255;
  return [d[i * 4] * a + 255 * (1 - a), d[i * 4 + 1] * a + 255 * (1 - a), d[i * 4 + 2] * a + 255 * (1 - a)];
}

function median(values: number[][]): [number, number, number] {
  return [0, 1, 2].map((k) => {
    const v = values.map((c) => c[k]).sort((a, b) => a - b);
    return Math.round(v[(v.length - 1) >> 1]);
  }) as [number, number, number];
}

export function growRegion(img: Img, seed: [number, number], tol: number, limit: Limit): Region {
  const { width: w, height: h } = img;
  const x0 = Math.max(0, Math.floor(limit.x0)), y0 = Math.max(0, Math.floor(limit.y0));
  const x1 = Math.min(w, Math.ceil(limit.x1)), y1 = Math.min(h, Math.ceil(limit.y1));
  const mask = new Uint8Array(w * h);
  const sx = Math.min(x1 - 1, Math.max(x0, Math.floor(seed[0]))), sy = Math.min(y1 - 1, Math.max(y0, Math.floor(seed[1])));

  // Seed colour: median of the 3×3 around the click, so a click on a soft edge still picks the main colour.
  const around: number[][] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = sx + dx, y = sy + dy;
    if (x >= 0 && y >= 0 && x < w && y < h) around.push(rgb(img, y * w + x));
  }
  const seedLab = rgbToLab(...median(around));
  const inside = (i: number) => deltaE(rgbToLab(...rgb(img, i)), seedLab) <= tol;

  // 4-connected flood fill within the limit, always compared with the seed colour.
  const stack = [sy * w + sx];
  const regionColours: number[][] = [];
  if (inside(stack[0])) mask[stack[0]] = 1; else stack.pop();
  while (stack.length) {
    const i = stack.pop()!, x = i % w, y = (i - x) / w;
    regionColours.push(rgb(img, i));
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < x0 || ny < y0 || nx >= x1 || ny >= y1) continue;
      const j = ny * w + nx;
      if (!mask[j] && inside(j)) { mask[j] = 1; stack.push(j); }
    }
  }
  const colour = regionColours.length ? median(regionColours) : median(around);

  let hitLimit = false;
  for (let y = y0; y < y1 && !hitLimit; y++) for (let x = x0; x < x1; x++) {
    if (!mask[y * w + x]) continue;
    if ((x === x0 && x0 > 0) || (y === y0 && y0 > 0) || (x === x1 - 1 && x1 < w) || (y === y1 - 1 && y1 < h)) { hitLimit = true; break; }
  }

  // Fill holes: anything inside the limit that the outside can't reach becomes part of the region.
  const outside = new Uint8Array(w * h);
  const q: number[] = [];
  const seedOutside = (x: number, y: number) => { const j = y * w + x; if (!mask[j] && !outside[j]) { outside[j] = 1; q.push(j); } };
  for (let x = x0; x < x1; x++) { seedOutside(x, y0); seedOutside(x, y1 - 1); }
  for (let y = y0; y < y1; y++) { seedOutside(x0, y); seedOutside(x1 - 1, y); }
  while (q.length) {
    const i = q.pop()!, x = i % w, y = (i - x) / w;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < x0 || ny < y0 || nx >= x1 || ny >= y1) continue;
      seedOutside(nx, ny);
    }
  }
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const j = y * w + x; if (!outside[j]) mask[j] = 1; }

  // Grow by one pixel (4-neighbour) so neighbouring traces overlap instead of leaving hairline gaps.
  const grown = mask.slice();
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (!mask[y * w + x]) continue;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx >= x0 && ny >= y0 && nx < x1 && ny < y1) grown[ny * w + nx] = 1;
    }
  }
  let count = 0;
  for (let i = 0; i < grown.length; i++) count += grown[i];
  return { mask: grown, count, hitLimit, colour };
}
