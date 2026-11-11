/** Outer outline of a coverage field via marching squares (trace tool spec §3.2). */
import type { Vec2 } from '../sheet/layout';

/** `iso` below 0.5 pushes the outline slightly outward (neighbouring traces overlap instead of gapping). */
export function outerContour(field: Float32Array, w: number, h: number, iso = 0.5): Vec2[] {
  // Bounding box of the mask, padded so every loop closes.
  let bx0 = w, by0 = h, bx1 = -1, by1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (field[y * w + x] > 0) {
    if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
  }
  if (bx1 < 0) return [];
  const ox = bx0 - 2, oy = by0 - 2, W = bx1 - bx0 + 5, H = by1 - by0 + 5;
  const v = (x: number, y: number) => { const gx = x + ox, gy = y + oy; return gx >= 0 && gy >= 0 && gx < w && gy < h ? field[gy * w + gx] : 0; };
  const ISO = iso;
  // Grid point (x, y) is the centre of pixel (x + ox, y + oy) → image coords (x + ox + 0.5, y + oy + 0.5).
  const P = (x: number, y: number): Vec2 => [x + ox + 0.5, y + oy + 0.5];
  const lerp = (a: number, b: number) => (ISO - a) / (b - a);
  // Edge points keyed by edge id; segments link edge ids.
  const pt = new Map<string, Vec2>();
  const next = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    (next.get(a) ?? next.set(a, []).get(a)!).push(b);
    (next.get(b) ?? next.set(b, []).get(b)!).push(a);
  };
  for (let y = -1; y < H; y++) for (let x = -1; x < W; x++) {
    const a = v(x, y), b = v(x + 1, y), c = v(x + 1, y + 1), d = v(x, y + 1); // tl, tr, br, bl
    const idx = (a > ISO ? 8 : 0) | (b > ISO ? 4 : 0) | (c > ISO ? 2 : 0) | (d > ISO ? 1 : 0);
    if (idx === 0 || idx === 15) continue;
    const top = `h${x},${y}`, right = `v${x + 1},${y}`, bottom = `h${x},${y + 1}`, left = `v${x},${y}`;
    if (!pt.has(top)) { const t = lerp(a, b); pt.set(top, [P(x, y)[0] + t, P(x, y)[1]]); }
    if (!pt.has(right)) { const t = lerp(b, c); pt.set(right, [P(x + 1, y)[0], P(x + 1, y)[1] + t]); }
    if (!pt.has(bottom)) { const t = lerp(d, c); pt.set(bottom, [P(x, y + 1)[0] + t, P(x, y + 1)[1]]); }
    if (!pt.has(left)) { const t = lerp(a, d); pt.set(left, [P(x, y)[0], P(x, y)[1] + t]); }
    const centre = (a + b + c + d) / 4 > ISO;
    switch (idx) {
      case 1: case 14: link(left, bottom); break;
      case 2: case 13: link(bottom, right); break;
      case 3: case 12: link(left, right); break;
      case 4: case 11: link(top, right); break;
      case 6: case 9: link(top, bottom); break;
      case 7: case 8: link(left, top); break;
      case 5: if (centre) { link(left, top); link(bottom, right); } else { link(left, bottom); link(top, right); } break;
      case 10: if (centre) { link(left, bottom); link(top, right); } else { link(left, top); link(bottom, right); } break;
    }
  }
  // Walk loops; keep the longest (the outer boundary — holes were filled).
  const seen = new Set<string>();
  let best: Vec2[] = [];
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop: Vec2[] = [];
    let prev = '', cur = start;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      loop.push(pt.get(cur)!);
      const ns = next.get(cur)!;
      const nxt = ns[0] !== prev ? ns[0] : ns[1];
      prev = cur; cur = nxt;
    }
    if (loop.length > best.length) best = loop;
  }
  // Clockwise on screen (y down) ⇔ positive shoelace sum.
  let area = 0;
  for (let i = 0; i < best.length; i++) { const p = best[i], q = best[(i + 1) % best.length]; area += p[0] * q[1] - q[0] * p[1]; }
  return area < 0 ? best.reverse() : best;
}
