import { describe, it, expect } from 'vitest';
import { createStyleResolver, INITIAL } from '../../../src/svg/style';
import { doc } from './helpers';

function styleOf(body: string, id = 't') {
  const d = doc(body);
  const r = createStyleResolver(d);
  const chain: Element[] = [];
  for (let e: Element | null = d.getElementById(id); e && e !== d.documentElement; e = e.parentElement) chain.unshift(e);
  let s = r.compute(d.documentElement, INITIAL);
  for (const e of chain) s = r.compute(e, s);
  return { s, warnings: r.warnings };
}

describe('style cascade', () => {
  it('inline beats <style> beats attribute', () => {
    expect(styleOf('<style>.a{fill:blue}</style><rect id="t" class="a" fill="red" style="fill:green"/>').s.fill).toBe('green');
    expect(styleOf('<style>.a{fill:blue}</style><rect id="t" class="a" fill="red"/>').s.fill).toBe('blue');
    expect(styleOf('<rect id="t" fill="red"/>').s.fill).toBe('red');
  });
  it('inherits inheritable properties only', () => {
    const { s } = styleOf('<g fill="red" opacity="0.5" stroke-width="3"><rect id="t"/></g>');
    expect(s.fill).toBe('red');
    expect(s['stroke-width']).toBe('3');
    expect(s.opacity).toBe('1');
  });
  it('specificity: #id > .class > tag, later rule wins ties', () => {
    expect(styleOf('<style>#t{fill:red} .a{fill:blue} rect{fill:green}</style><rect id="t" class="a"/>').s.fill).toBe('red');
    expect(styleOf('<style>.a{fill:blue} rect{fill:green}</style><rect id="t" class="a"/>').s.fill).toBe('blue');
    expect(styleOf('<style>.a{fill:blue} .b{fill:green}</style><rect id="t" class="a b"/>').s.fill).toBe('green');
    expect(styleOf('<style>rect.a{fill:blue} .a{fill:green}</style><rect id="t" class="a"/>').s.fill).toBe('blue');
  });
  it('comma lists and inherit', () => {
    expect(styleOf('<style>.x, .a{fill:blue}</style><rect id="t" class="a"/>').s.fill).toBe('blue');
    expect(styleOf('<g stroke="red"><rect id="t" stroke="inherit"/></g>').s.stroke).toBe('red');
  });
  it('warns about unsupported selectors and @import', () => {
    const { warnings } = styleOf('<style>@import url(http://x/y.css); g > rect{fill:red} rect:hover{fill:blue}</style><rect id="t"/>');
    expect(warnings.join(' ')).toMatch(/@import/);
    expect(warnings.join(' ')).toMatch(/g > rect/);
  });
  it('flags CSS transform', () => {
    expect(styleOf('<rect id="t" style="transform: rotate(4deg)"/>').s.cssTransform).toBe(true);
  });
});
