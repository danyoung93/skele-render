/** Synthetic test images with 4×4 supersampled (antialiased) edges, like exported flat artwork. */
export interface Img { width: number; height: number; data: Uint8ClampedArray }
export type RGBA = [number, number, number, number];
export type Layer = { inside: (x: number, y: number) => boolean; colour: RGBA };

/** Paints layers in order (later on top) over a background. */
export function paint(width: number, height: number, bg: RGBA, layers: Layer[]): Img {
  const data = new Uint8ClampedArray(width * height * 4);
  const S = 4;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const acc = [0, 0, 0, 0];
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const px = x + (sx + 0.5) / S, py = y + (sy + 0.5) / S;
      let c = bg;
      for (const l of layers) if (l.inside(px, py)) c = l.colour;
      for (let k = 0; k < 4; k++) acc[k] += c[k];
    }
    for (let k = 0; k < 4; k++) data[(y * width + x) * 4 + k] = Math.round(acc[k] / (S * S));
  }
  return { width, height, data };
}

export const circle = (cx: number, cy: number, r: number) => (x: number, y: number) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
export const rect = (x0: number, y0: number, x1: number, y1: number) => (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
export function roundRect(x0: number, y0: number, x1: number, y1: number, r: number) {
  return (x: number, y: number) => {
    if (!rect(x0, y0, x1, y1)(x, y)) return false;
    const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
}
export const WHITE: RGBA = [255, 255, 255, 255];
export const RED: RGBA = [200, 40, 40, 255];
