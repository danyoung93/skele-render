import { describe, it, expect } from 'vitest';
import { tidyName, matchPart, findParts } from '../../src/sheet/names';

const g = (attrs: string) =>
  new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:serif="http://www.serif.com/"><g ${attrs}/></svg>`,
    'image/svg+xml').documentElement.firstElementChild!;

describe('tidyName / matchPart', () => {
  it.each([
    ['head', 'head'], ['Head', 'head'], ['HEAD', 'head'], ['head_1_', 'head'], ['head_2', 'head'],
    ['upper_x5F_arm_x5F_L', 'upper_arm_l'], ['upper arm L', 'upper_arm_l'], ['upper-arm-L', 'upper_arm_l'],
    ['upper_x5F_arm_x5F_L_1_', 'upper_arm_l'],
  ])('%s → %s', (raw, tidy) => expect(tidyName(raw)).toBe(tidy));

  it.each([
    ['id="head_1_"', 'head'],
    ['id="Layer_3" data-name="mouth_open"', 'mouth_open'],
    ['id="layer1" inkscape:label="Eyes Open"', 'eyes_open'],
    ['id="Forearm-L" serif:id="forearm_L"', 'forearm_L'],
    ['id="upper_x5F_arm_x5F_R"', 'upper_arm_R'],
    ['id="guides"', 'guides'],
    ['id="g123"', null],
  ])('%s → %s', (attrs, part) => expect(matchPart(g(attrs))).toBe(part));
});

describe('findParts', () => {
  const parse = (body: string) => new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`, 'image/svg+xml');
  it('finds nested groups, skips guides, warns on near misses, duplicates and strays', () => {
    const r = findParts(parse(`
      <g id="frame"><g id="head"><circle r="1"/></g></g>
      <g id="head_2"><circle r="1"/></g>
      <g id="mouht_open"><circle r="1"/></g>
      <g id="guides"><g id="torso"/></g>
      <rect width="1" height="1"/>`));
    expect([...r.parts.keys()]).toEqual(['head']);
    const msgs = r.warnings.map((w) => w.message).join(' | ');
    expect(msgs).toMatch(/Duplicate layer for head/);
    expect(msgs).toMatch(/Did you mean mouth_open/);
    expect(msgs).toMatch(/2 element\(s\) outside/); // circle in mouht_open + rect
  });
});
