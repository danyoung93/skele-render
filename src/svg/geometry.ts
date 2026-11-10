/**
 * SVG geometry → cubic Bézier subpaths (spec 6.1 step 2).
 * Internally handles are absolute positions; `toLottiePath` makes them
 * relative to their vertex, as Lottie expects.
 */
import type { PathData, Vec2 } from '../lottie/types';
import { apply, type Mat } from './matrix';

export interface Vertex { p: Vec2; in: Vec2; out: Vec2 }
export interface Subpath { verts: Vertex[]; closed: boolean }

const KAPPA = 0.5522847498307936;
const EPS = 1e-6;
const v = (p: Vec2): Vertex => ({ p, in: [p[0], p[1]], out: [p[0], p[1]] });
const same = (a: Vec2, b: Vec2) => Math.abs(a[0] - b[0]) < 1e-4 && Math.abs(a[1] - b[1]) < 1e-4;

class Scanner {
  i = 0;
  constructor(private s: string) {}
  private skip() { while (this.i < this.s.length && /[\s,]/.test(this.s[this.i])) this.i++; }
  command(): string | null {
    this.skip();
    const c = this.s[this.i];
    if (c && /[MmLlHhVvCcSsQqTtAaZz]/.test(c)) { this.i++; return c; }
    return null;
  }
  hasNumber(): boolean {
    this.skip();
    return this.i < this.s.length && /[-+.\d]/.test(this.s[this.i]);
  }
  number(): number {
    this.skip();
    const m = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(this.s.slice(this.i));
    if (!m) throw new Error(`Bad path data near "${this.s.slice(this.i, this.i + 10)}"`);
    this.i += m[0].length;
    return parseFloat(m[0]);
  }
  flag(): boolean {
    this.skip();
    const c = this.s[this.i++];
    if (c !== '0' && c !== '1') throw new Error('Bad arc flag');
    return c === '1';
  }
  done() { this.skip(); return this.i >= this.s.length; }
}

/** Converts an SVG elliptical arc to cubic segments (SVG spec F.6.5), at most 90° each. */
export function arcToCubics(
  p0: Vec2, rx: number, ry: number, phiDeg: number, large: boolean, sweep: boolean, p1: Vec2,
): [Vec2, Vec2, Vec2][] {
  if (same(p0, p1)) return [];
  rx = Math.abs(rx); ry = Math.abs(ry);
  if (rx < EPS || ry < EPS) return [[p0, p1, p1]];
  const phi = (phiDeg * Math.PI) / 180, cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (p0[0] - p1[0]) / 2, dy = (p0[1] - p1[1]) / 2;
  const x1 = cos * dx + sin * dy, y1 = -sin * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) { const s = Math.sqrt(lambda); rx *= s; ry *= s; }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  let co = Math.sqrt(Math.max(0, num / den));
  if (large === sweep) co = -co;
  const cx1 = (co * rx * y1) / ry, cy1 = (-co * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (p0[0] + p1[0]) / 2;
  const cy = sin * cx1 + cos * cy1 + (p0[1] + p1[1]) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9));
  const seg = dt / n, k = (4 / 3) * Math.tan(seg / 4);
  const pt = (t: number): Vec2 => [
    cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin,
    cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos,
  ];
  const deriv = (t: number): Vec2 => [
    -rx * Math.sin(t) * cos - ry * Math.cos(t) * sin,
    -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos,
  ];
  const out: [Vec2, Vec2, Vec2][] = [];
  for (let i = 0; i < n; i++) {
    const a = t1 + i * seg, b = a + seg;
    const pa = pt(a), pb = i === n - 1 ? p1 : pt(b), da = deriv(a), db = deriv(b);
    out.push([[pa[0] + k * da[0], pa[1] + k * da[1]], [pb[0] - k * db[0], pb[1] - k * db[1]], pb]);
  }
  return out;
}

/** Parses SVG path data into absolute cubic subpaths. Throws on malformed data. */
export function parsePathData(d: string): Subpath[] {
  const sc = new Scanner(d);
  const paths: Subpath[] = [];
  let cur: Subpath | null = null;
  let pt: Vec2 = [0, 0], start: Vec2 = [0, 0];
  let lastC: Vec2 | null = null, lastQ: Vec2 | null = null;
  let cmd: string | null = null;

  const last = () => cur!.verts[cur!.verts.length - 1];
  const ensure = () => {
    if (!cur) { cur = { verts: [v([pt[0], pt[1]])], closed: false }; paths.push(cur); start = pt; }
  };
  const cubic = (c1: Vec2, c2: Vec2, p: Vec2) => {
    ensure();
    last().out = c1;
    cur!.verts.push({ p, in: c2, out: [p[0], p[1]] });
    pt = p;
  };
  const line = (p: Vec2) => { ensure(); cur!.verts.push(v(p)); pt = p; };

  while (!sc.done()) {
    const c = sc.command();
    if (c) cmd = c;
    else if (!cmd || !sc.hasNumber()) throw new Error('Bad path data');
    if (!cmd) break;
    if (!c && (cmd === 'Z' || cmd === 'z')) throw new Error('Bad path data after Z');
    const rel: boolean = cmd === cmd.toLowerCase();
    const C: string = cmd.toUpperCase();
    const P = (): Vec2 => { const x = sc.number(), y = sc.number(); return rel ? [pt[0] + x, pt[1] + y] : [x, y]; };
    let nextC: Vec2 | null = null, nextQ: Vec2 | null = null;
    switch (C) {
      case 'M': {
        const p = P();
        cur = { verts: [v(p)], closed: false }; paths.push(cur);
        pt = p; start = p;
        cmd = rel ? 'l' : 'L';
        break;
      }
      case 'L': line(P()); break;
      case 'H': { const x = sc.number(); line([rel ? pt[0] + x : x, pt[1]]); break; }
      case 'V': { const y = sc.number(); line([pt[0], rel ? pt[1] + y : y]); break; }
      case 'C': { const c1 = P(), c2 = P(), p = P(); cubic(c1, c2, p); nextC = c2; break; }
      case 'S': {
        const c1: Vec2 = lastC ? [2 * pt[0] - lastC[0], 2 * pt[1] - lastC[1]] : [pt[0], pt[1]];
        const c2 = P(), p = P(); cubic(c1, c2, p); nextC = c2; break;
      }
      case 'Q': case 'T': {
        const q: Vec2 = C === 'Q' ? P() : lastQ ? [2 * pt[0] - lastQ[0], 2 * pt[1] - lastQ[1]] : [pt[0], pt[1]];
        const p = P(), p0 = pt;
        cubic([p0[0] + (2 / 3) * (q[0] - p0[0]), p0[1] + (2 / 3) * (q[1] - p0[1])],
          [p[0] + (2 / 3) * (q[0] - p[0]), p[1] + (2 / 3) * (q[1] - p[1])], p);
        nextQ = q; break;
      }
      case 'A': {
        const rx = sc.number(), ry = sc.number(), rot = sc.number(), large = sc.flag(), sweep = sc.flag();
        const p = P();
        ensure();
        const segs = arcToCubics(pt, rx, ry, rot, large, sweep, p);
        for (const [c1, c2, e] of segs) cubic(c1, c2, e);
        pt = p;
        break;
      }
      case 'Z': {
        if (cur) {
          const sp: Subpath = cur;
          sp.closed = true;
          if (sp.verts.length > 1 && same(sp.verts[sp.verts.length - 1].p, sp.verts[0].p)) {
            sp.verts[0].in = sp.verts.pop()!.in;
          }
        }
        cur = null; pt = start;
        break;
      }
    }
    lastC = nextC; lastQ = nextQ;
  }
  return paths.filter((p) => p.verts.length > 1 || p.closed);
}

const pts = (s: string): Vec2[] => {
  const n = s.split(/[\s,]+/).filter(Boolean).map(Number);
  const out: Vec2[] = [];
  for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i], n[i + 1]]);
  return out;
};

/** Ellipse as 4 cubic segments, starting at the rightmost point, clockwise on screen. */
export function ellipse(cx: number, cy: number, rx: number, ry: number): Subpath {
  const kx = rx * KAPPA, ky = ry * KAPPA;
  const mk = (p: Vec2, i: Vec2, o: Vec2): Vertex => ({ p, in: i, out: o });
  return {
    closed: true,
    verts: [
      mk([cx + rx, cy], [cx + rx, cy - ky], [cx + rx, cy + ky]),
      mk([cx, cy + ry], [cx + kx, cy + ry], [cx - kx, cy + ry]),
      mk([cx - rx, cy], [cx - rx, cy + ky], [cx - rx, cy - ky]),
      mk([cx, cy - ry], [cx - kx, cy - ry], [cx + kx, cy - ry]),
    ],
  };
}

export function rect(x: number, y: number, w: number, h: number, rx: number, ry: number): Subpath {
  rx = Math.min(Math.max(rx, 0), w / 2); ry = Math.min(Math.max(ry, 0), h / 2);
  if (rx < EPS || ry < EPS) {
    return { closed: true, verts: [v([x, y]), v([x + w, y]), v([x + w, y + h]), v([x, y + h])] };
  }
  const kx = rx * (1 - KAPPA), ky = ry * (1 - KAPPA);
  const mk = (p: Vec2, i: Vec2, o: Vec2): Vertex => ({ p, in: i, out: o });
  return {
    closed: true,
    verts: [
      mk([x + rx, y], [x + kx, y], [x + rx, y]),
      mk([x + w - rx, y], [x + w - rx, y], [x + w - kx, y]),
      mk([x + w, y + ry], [x + w, y + ky], [x + w, y + ry]),
      mk([x + w, y + h - ry], [x + w, y + h - ry], [x + w, y + h - ky]),
      mk([x + w - rx, y + h], [x + w - kx, y + h], [x + w - rx, y + h]),
      mk([x + rx, y + h], [x + rx, y + h], [x + kx, y + h]),
      mk([x, y + h - ry], [x, y + h - ky], [x, y + h - ry]),
      mk([x, y + ry], [x, y + ry], [x, y + ky]),
    ],
  };
}

/** Parses a length that is unitless or px. Returns null for other units or garbage. */
export function parseLength(s: string | null | undefined, fallback: number | null = 0): number | null {
  if (s === null || s === undefined || s.trim() === '') return fallback;
  const m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)(px)?\s*$/.exec(s);
  return m ? parseFloat(m[1]) : null;
}

export class UnsupportedLength extends Error {}

/**
 * Geometry of a basic shape or path element, in its own user space.
 * Returns null for non-geometry elements. Throws UnsupportedLength for non-px units.
 */
export function elementToSubpaths(el: Element): Subpath[] | null {
  const L = (name: string, fb: number | null = 0) => {
    const raw = el.getAttribute(name);
    const n = parseLength(raw, fb);
    if (n === null) throw new UnsupportedLength(`${name}="${raw}"`);
    return n;
  };
  switch (el.localName) {
    case 'path': return parsePathData(el.getAttribute('d') ?? '');
    case 'rect': {
      const w = L('width'), h = L('height');
      if (w <= 0 || h <= 0) return [];
      let rx = el.hasAttribute('rx') ? L('rx') : NaN, ry = el.hasAttribute('ry') ? L('ry') : NaN;
      if (isNaN(rx)) rx = isNaN(ry) ? 0 : ry;
      if (isNaN(ry)) ry = rx;
      return [rect(L('x'), L('y'), w, h, rx, ry)];
    }
    case 'circle': { const r = L('r'); return r > 0 ? [ellipse(L('cx'), L('cy'), r, r)] : []; }
    case 'ellipse': {
      const rx = L('rx'), ry = L('ry');
      return rx > 0 && ry > 0 ? [ellipse(L('cx'), L('cy'), rx, ry)] : [];
    }
    case 'line': return [{ closed: false, verts: [v([L('x1'), L('y1')]), v([L('x2'), L('y2')])] }];
    case 'polyline': case 'polygon': {
      const p = pts(el.getAttribute('points') ?? '');
      if (p.length < 2) return [];
      return [{ closed: el.localName === 'polygon', verts: p.map(v) }];
    }
    default: return null;
  }
}

export function transformSubpath(sp: Subpath, m: Mat): Subpath {
  return {
    closed: sp.closed,
    verts: sp.verts.map((x) => ({ p: apply(m, x.p), in: apply(m, x.in), out: apply(m, x.out) })),
  };
}

export function toLottiePath(sp: Subpath): PathData {
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return {
    c: sp.closed,
    v: sp.verts.map((x) => [r(x.p[0]), r(x.p[1])]),
    i: sp.verts.map((x) => [r(x.in[0] - x.p[0]), r(x.in[1] - x.p[1])]),
    o: sp.verts.map((x) => [r(x.out[0] - x.p[0]), r(x.out[1] - x.p[1])]),
  };
}

/** Control-point bounding box (conservative). */
export function bbox(sps: Subpath[]): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const sp of sps) for (const vt of sp.verts) for (const p of [vt.p, vt.in, vt.out]) {
    x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
  }
  return x0 === Infinity ? null : { x0, y0, x1, y1 };
}
