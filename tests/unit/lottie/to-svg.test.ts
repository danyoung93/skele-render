import { describe, it, expect } from 'vitest';
import { shapeItemsToSvg } from '../../../src/lottie/to-svg';
import { identityTr, stat, type Group, type ShapeItem } from '../../../src/lottie/types';

const sq = (x: number, closed = true) => ({ ty: 'sh' as const, ks: stat({ c: closed, v: [[x, 0], [x + 10, 0], [x + 10, 10]] as [number, number][], i: [[0, 0], [0, 0], [0, 0]] as [number, number][], o: [[0, 0], [0, 0], [0, 0]] as [number, number][] }) });
const group = (...it: ShapeItem[]): Group => ({ ty: 'gr', it: [...it, identityTr()] });
const parse = (svg: string) => new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${svg}</svg>`, 'image/svg+xml').documentElement;

describe('shapeItemsToSvg', () => {
  it('draws paths with fill and stroke, back to front', () => {
    const svg = parse(shapeItemsToSvg([
      group(sq(0), { ty: 'fl', c: stat([1, 0, 0, 1]), o: stat(50), r: 2 }),
      group(sq(20, false), { ty: 'st', c: stat([0, 0, 1, 1]), o: stat(100), w: stat(3), lc: 2, lj: 3, ml: 4,
        d: [{ n: 'd', nm: 'dash', v: stat(4) }, { n: 'g', nm: 'gap', v: stat(2) }, { n: 'o', nm: 'offset', v: stat(1) }] }),
    ], 't'));
    const paths = svg.querySelectorAll('path');
    expect(paths).toHaveLength(2);
    // Lottie's first item is on top, so it is drawn last.
    expect(paths[1].getAttribute('d')).toBe('M0 0 C0 0 10 0 10 0 C10 0 10 10 10 10 C10 10 0 0 0 0 Z');
    expect(paths[1].getAttribute('fill')).toBe('#ff0000');
    expect(paths[1].getAttribute('fill-opacity')).toBe('0.5');
    expect(paths[1].getAttribute('fill-rule')).toBe('evenodd');
    expect(paths[0].getAttribute('fill')).toBe('none');
    expect(paths[0].getAttribute('stroke')).toBe('#0000ff');
    expect(paths[0].getAttribute('stroke-width')).toBe('3');
    expect(paths[0].getAttribute('stroke-linecap')).toBe('round');
    expect(paths[0].getAttribute('stroke-linejoin')).toBe('bevel');
    expect(paths[0].getAttribute('stroke-dasharray')).toBe('4 2');
    expect(paths[0].getAttribute('stroke-dashoffset')).toBe('1');
    expect(paths[0].getAttribute('d')!.endsWith('Z')).toBe(false);
  });
  it('emits linear and radial gradients with prefixed ids and opacity stops', () => {
    const svg = parse(shapeItemsToSvg([
      group(sq(0), { ty: 'gf', t: 1, s: stat([0, 0]), e: stat([10, 0]), o: stat(100), r: 1, g: { p: 2, k: stat([0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 0.5]) } }),
      group(sq(20), { ty: 'gf', t: 2, s: stat([25, 5]), e: stat([35, 5]), o: stat(100), r: 1, h: stat(50), a: stat(0), g: { p: 2, k: stat([0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1]) } }),
    ], 'pfx'));
    const lin = svg.querySelector('linearGradient')!, rad = svg.querySelector('radialGradient')!;
    expect(lin.getAttribute('id')).toMatch(/^pfx/);
    expect(lin.getAttribute('gradientUnits')).toBe('userSpaceOnUse');
    expect([lin.getAttribute('x1'), lin.getAttribute('x2')]).toEqual(['0', '10']);
    const stops = lin.querySelectorAll('stop');
    expect(stops[1].getAttribute('stop-color')).toBe('#0000ff');
    expect(stops[1].getAttribute('stop-opacity')).toBe('0.5');
    expect([rad.getAttribute('cx'), rad.getAttribute('r'), rad.getAttribute('fx')]).toEqual(['25', '10', '30']);
    const fills = [...svg.querySelectorAll('path')].map((p) => p.getAttribute('fill'));
    expect(fills).toContain(`url(#${lin.getAttribute('id')})`);
  });
});
