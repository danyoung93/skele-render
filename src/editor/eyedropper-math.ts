import type { ReferenceState, Vec2 } from './model';

/** Sheet point → integer pixel of the reference image, or null outside the image. */
export function sheetToImagePixel(ref: ReferenceState, imgW: number, imgH: number, p: Vec2): [number, number] | null {
  const ix = (p[0] - ref.x) / ref.scale, iy = (p[1] - ref.y) / ref.scale;
  if (ix < 0 || iy < 0 || ix >= imgW || iy >= imgH) return null;
  return [Math.floor(ix), Math.floor(iy)];
}
