import { describe, it, expect } from 'vitest';
import { parseColor } from '../../../src/svg/colors';
import { parseTransform, apply } from '../../../src/svg/matrix';

describe('parseColor', () => {
  it.each([
    ['#f00', [1, 0, 0, 1]], ['#ff000080', [1, 0, 0, 128 / 255]], ['#00FF00', [0, 1, 0, 1]],
    ['#0f08', [0, 1, 0, 0x88 / 255]], ['rgb(255, 0, 0)', [1, 0, 0, 1]], ['rgb(100%,50%,0%)', [1, 0.5, 0, 1]],
    ['rgba(0,0,255,0.5)', [0, 0, 1, 0.5]], ['rebeccapurple', [0x66 / 255, 0x33 / 255, 0x99 / 255, 1]],
    ['transparent', [0, 0, 0, 0]], ['RED', [1, 0, 0, 1]],
  ])('%s', (s, exp) => {
    const c = parseColor(s)!;
    [c.r, c.g, c.b, c.a].forEach((v, i) => expect(v).toBeCloseTo(exp[i], 3));
  });
  it('rejects garbage and none', () => {
    expect(parseColor('none')).toBeNull();
    expect(parseColor('#12')).toBeNull();
    expect(parseColor('blurple')).toBeNull();
  });
});

describe('parseTransform', () => {
  const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6));
  it('translate, scale, rotate, skew, matrix', () => {
    close(apply(parseTransform('translate(10 20)'), [1, 1]), [11, 21]);
    close(apply(parseTransform('scale(2,3)'), [1, 1]), [2, 3]);
    close(apply(parseTransform('scale(2)'), [1, 1]), [2, 2]);
    close(apply(parseTransform('rotate(90)'), [1, 0]), [0, 1]);
    close(apply(parseTransform('rotate(90 10 10)'), [20, 10]), [10, 20]);
    close(apply(parseTransform('skewX(45)'), [0, 1]), [1, 1]);
    close(apply(parseTransform('skewY(45)'), [1, 0]), [1, 1]);
    close(apply(parseTransform('matrix(1 0 0 1 5 6)'), [0, 0]), [5, 6]);
  });
  it('nests left to right', () => {
    close(apply(parseTransform('translate(10,0) scale(2)'), [1, 1]), [12, 2]);
  });
});
