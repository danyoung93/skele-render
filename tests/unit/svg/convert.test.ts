import { describe, it, expect } from 'vitest';
import { convert, groups, kinds } from './helpers';
import type { Fill, GradFill, PathShape, Stroke } from '../../../src/lottie/types';

describe('convertPart', () => {
  it('emits paths, then stroke, then fill, then transform', () => {
    const r = convert('<g id="p"><rect width="10" height="10" fill="red" stroke="blue" stroke-width="2"/></g>');
    const [g] = groups(r.shapes);
    expect(kinds(g)).toEqual(['sh', 'st', 'fl', 'tr']);
    const st = g.it[1] as Stroke;
    expect(st.c.k).toEqual([0, 0, 1, 1]);
    expect(st.w.k).toBe(2);
  });
  it('lists elements in reverse document order', () => {
    const r = convert('<g id="p"><rect id="a" width="1" height="1"/><rect id="b" width="1" height="1"/></g>');
    expect(groups(r.shapes).map((g) => g.nm)).toEqual(['b', 'a']);
  });
  it('applies transforms to the points, including ancestors outside the part', () => {
    const r = convert('<g transform="translate(100 0)"><g id="p" transform="scale(2)"><rect x="1" y="1" width="1" height="1"/></g></g>');
    const sh = groups(r.shapes)[0].it[0] as PathShape;
    expect(sh.ks.k.v[0]).toEqual([102, 2]);
  });
  it('multiplies group, fill and colour opacity', () => {
    const r = convert('<g opacity="0.5"><g id="p" opacity="0.5"><rect width="1" height="1" fill="#ff000080" fill-opacity="0.5"/></g></g>');
    const fl = groups(r.shapes)[0].it.find((i) => i.ty === 'fl') as Fill;
    expect(fl.o.k).toBeCloseTo(100 * 0.25 * 0.5 * (128 / 255), 1);
  });
  it('keeps evenodd and one path per subpath', () => {
    const r = convert('<g id="p"><path fill-rule="evenodd" d="M0 0H10V10H0Z M2 2H8V8H2Z"/></g>');
    const g = groups(r.shapes)[0];
    expect(kinds(g)).toEqual(['sh', 'sh', 'fl', 'tr']);
    expect((g.it[2] as Fill).r).toBe(2);
  });
  it('scales stroke width and dashes by the transform', () => {
    const r = convert('<g id="p" transform="scale(2)"><line x2="10" stroke="red" stroke-width="3" stroke-dasharray="1 2 3" stroke-linecap="round" stroke-linejoin="bevel"/></g>');
    const st = groups(r.shapes)[0].it.find((i) => i.ty === 'st') as Stroke;
    expect(st.w.k).toBe(6);
    expect(st.lc).toBe(2);
    expect(st.lj).toBe(3);
    expect(st.d!.map((d) => [d.n, d.v.k])).toEqual([['d', 2], ['g', 4], ['d', 6], ['g', 2], ['d', 4], ['g', 6], ['o', 0]]);
  });
  it('linear gradient in objectBoundingBox units, with href stops', () => {
    const r = convert(`<defs>
      <linearGradient id="base"><stop offset="0" stop-color="red"/><stop offset="100%" stop-color="blue" stop-opacity="0.5"/></linearGradient>
      <linearGradient id="g" xlink:href="#base" x1="0" y1="0" x2="0" y2="1"/>
    </defs><g id="p"><rect x="10" y="20" width="100" height="50" fill="url(#g)"/></g>`);
    const gf = groups(r.shapes)[0].it.find((i) => i.ty === 'gf') as GradFill;
    expect(gf.t).toBe(1);
    expect(gf.s.k).toEqual([10, 20]);
    expect(gf.e.k).toEqual([10, 70]);
    expect(gf.g.p).toBe(2);
    expect(gf.g.k.k).toEqual([0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 0.5]);
  });
  it('radial gradient in user space with a focal point', () => {
    const r = convert(`<defs><radialGradient id="g" gradientUnits="userSpaceOnUse" cx="50" cy="50" r="20" fx="60" fy="50">
      <stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient></defs>
      <g id="p"><circle cx="50" cy="50" r="20" fill="url(#g)"/></g>`);
    const gf = groups(r.shapes)[0].it.find((i) => i.ty === 'gf') as GradFill;
    expect(gf.t).toBe(2);
    expect(gf.s.k).toEqual([50, 50]);
    expect(gf.e.k).toEqual([70, 50]);
    expect(gf.h!.k).toBe(50);
    expect(gf.a!.k).toBe(0);
  });
  it('expands <use> of elements and sized symbols', () => {
    const r = convert(`<defs><rect id="r" width="10" height="10" fill="red"/>
      <symbol id="s" viewBox="0 0 10 10"><rect width="10" height="10" fill="blue"/></symbol></defs>
      <g id="p"><use href="#r" x="5" y="5"/><use xlink:href="#s" x="100" width="20" height="20"/></g>`);
    const gs = groups(r.shapes);
    expect(gs).toHaveLength(2);
    const sym = gs[0].it[0] as PathShape, rect = gs[1].it[0] as PathShape;
    expect(rect.ks.k.v[0]).toEqual([5, 5]);
    expect(sym.ks.k.v[2]).toEqual([120, 20]);
  });
  it('stops <use> cycles', () => {
    const r = convert('<g id="p"><g id="loop"><rect width="1" height="1"/><use href="#loop"/></g></g>');
    expect(r.warnings.join()).toMatch(/too deep/);
    expect(groups(r.shapes).length).toBe(11);
  });
  it('skips hidden elements and fill none', () => {
    const r = convert('<g id="p"><rect width="1" height="1" display="none"/><rect width="1" height="1" visibility="hidden"/><rect width="1" height="1" fill="none"/></g>');
    expect(r.shapes).toEqual([]);
  });
  it('uses currentColor', () => {
    const r = convert('<g id="p" color="lime"><rect width="1" height="1" fill="currentColor"/></g>');
    expect((groups(r.shapes)[0].it.find((i) => i.ty === 'fl') as Fill).c.k).toEqual([0, 1, 0, 1]);
  });
});

describe('unsupported features', () => {
  it.each([
    ['<rect width="1" height="1" clip-path="url(#c)"/>', /Clip path/],
    ['<rect width="1" height="1" mask="url(#m)"/>', /Mask/],
    ['<rect width="1" height="1" filter="url(#f)"/>', /Filter/],
    ['<rect width="1" height="1" fill="url(#pat)"/><pattern id="pat"/>', /pattern paint/],
    ['<image href="x.png" width="1" height="1"/>', /image/],
    ['<text>hi</text>', /Text/],
    ['<foreignObject/>', /foreignObject/],
    ['<script>1</script>', /Script/],
    ['<rect width="1mm" height="1"/>', /length unit/],
    ['<rect width="1" height="1" style="transform:scale(2)"/>', /CSS transform/],
    ['<rect width="1" height="1" vector-effect="non-scaling-stroke"/>', /vector-effect/],
    ['<use href="http://evil/x.svg#a"/>', /External reference/],
    ['<rect width="1" height="1" fill="url(https://x/y#g)"/>', /External paint/],
    ['<path d="M0 0 L x"/>', /Bad path/],
  ])('%s', (body, re) => {
    const r = convert(`<g id="p">${body}</g>`);
    expect(r.warnings.join(' | ')).toMatch(re);
  });
  it('spreadMethod reflect falls back to pad with a warning', () => {
    const r = convert('<defs><linearGradient id="g" spreadMethod="reflect"><stop offset="0"/></linearGradient></defs><g id="p"><rect width="1" height="1" fill="url(#g)"/></g>');
    expect(r.warnings.join()).toMatch(/spreadMethod/);
    expect(groups(r.shapes)).toHaveLength(1);
  });
});
