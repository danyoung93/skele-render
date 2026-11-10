/** 2D affine matrices in SVG order [a b c d e f]: x' = a x + c y + e, y' = b x + d y + f. */
import type { Vec2 } from '../lottie/types';

export type Mat = [number, number, number, number, number, number];
export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

export function mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}
export const apply = (m: Mat, p: Vec2): Vec2 => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
export const translate = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];
export const scale = (sx: number, sy = sx): Mat => [sx, 0, 0, sy, 0, 0];
export function rotate(deg: number, cx = 0, cy = 0): Mat {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return mul(mul(translate(cx, cy), [c, s, -s, c, 0, 0]), translate(-cx, -cy));
}
export const det = (m: Mat) => m[0] * m[3] - m[1] * m[2];
/** Uniform scale factor of a matrix: sqrt(|det|). */
export const scaleFactor = (m: Mat) => Math.sqrt(Math.abs(det(m)));

/** Parses an SVG `transform` attribute. Unknown functions are ignored. */
export function parseTransform(s: string | null | undefined): Mat {
  let m: Mat = IDENTITY;
  if (!s) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let t: RegExpExecArray | null;
  while ((t = re.exec(s))) {
    const a = t[2].split(/[\s,]+/).filter(Boolean).map(Number);
    let n: Mat = IDENTITY;
    switch (t[1]) {
      case 'matrix': if (a.length === 6) n = a as Mat; break;
      case 'translate': n = translate(a[0] ?? 0, a[1] ?? 0); break;
      case 'scale': n = scale(a[0] ?? 1, a[1] ?? a[0] ?? 1); break;
      case 'rotate': n = rotate(a[0] ?? 0, a[1] ?? 0, a[2] ?? 0); break;
      case 'skewX': n = [1, 0, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 1, 0, 0]; break;
      case 'skewY': n = [1, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0]; break;
    }
    m = mul(m, n);
  }
  return m;
}
