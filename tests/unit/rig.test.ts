import { describe, it, expect } from 'vitest';
import { BONES, BONE_IDS, ATTACH, DRAW_ORDER, SWAP_GROUPS, SWAP_DEFAULT } from '../../src/rig/rig';
import { PART_IDS } from '../../src/sheet/layout';

describe('rig', () => {
  it('has one bone per id and every parent exists', () => {
    expect(BONES.map((b) => b.id).sort()).toEqual([...BONE_IDS].sort());
    for (const b of BONES) if (b.parent) expect(BONE_IDS).toContain(b.parent);
    expect(BONES.filter((b) => b.parent === null)).toHaveLength(1);
  });
  it('has no cycles', () => {
    for (const b of BONES) {
      const seen = new Set<string>();
      let cur: string | null = b.id;
      while (cur) {
        expect(seen.has(cur)).toBe(false);
        seen.add(cur);
        cur = BONES.find((x) => x.id === cur)!.parent;
      }
    }
  });
  it('lists parents before children', () => {
    BONES.forEach((b, i) => {
      if (b.parent) expect(BONES.findIndex((x) => x.id === b.parent)).toBeLessThan(i);
    });
  });
  it('attaches every part to a real bone', () => {
    for (const p of PART_IDS) expect(BONE_IDS).toContain(ATTACH[p].bone);
  });
  it('draw order lists every part once', () => {
    expect([...DRAW_ORDER].sort()).toEqual([...PART_IDS].sort());
  });
  it('swap defaults belong to their group', () => {
    expect(SWAP_GROUPS.eyes).toContain(SWAP_DEFAULT.eyes);
    expect(SWAP_GROUPS.mouth).toContain(SWAP_DEFAULT.mouth);
  });
});
