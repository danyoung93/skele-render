import { describe, it, expect } from 'vitest';
import { ANIMATIONS } from '../../src/anim';
import { BONE_IDS, SWAP_GROUPS, type SwapGroupId } from '../../src/rig/rig';

describe.each(ANIMATIONS.map((a) => [a.id, a] as const))('%s', (_, anim) => {
  it('tracks target real bones, keys are ordered, in range, and loop', () => {
    for (const [bone, track] of Object.entries(anim.bones)) {
      expect(BONE_IDS).toContain(bone);
      for (const [prop, keys] of Object.entries(track!)) {
        const ks = keys as { frame: number; value: unknown }[];
        expect(ks[0].frame, `${bone}.${prop}`).toBe(0);
        expect(ks[ks.length - 1].frame, `${bone}.${prop}`).toBe(anim.frames);
        expect(ks[ks.length - 1].value, `${bone}.${prop} loops`).toEqual(ks[0].value);
        for (let i = 1; i < ks.length; i++) expect(ks[i].frame).toBeGreaterThan(ks[i - 1].frame);
      }
    }
  });
  it('swap tracks start at 0, stay in range and use their group members', () => {
    for (const g of Object.keys(SWAP_GROUPS) as SwapGroupId[]) {
      const keys = anim.swaps[g];
      expect(keys[0].frame).toBe(0);
      for (let i = 0; i < keys.length; i++) {
        expect(SWAP_GROUPS[g]).toContain(keys[i].sprite);
        expect(keys[i].frame).toBeLessThan(anim.frames);
        if (i) expect(keys[i].frame).toBeGreaterThan(keys[i - 1].frame);
      }
    }
  });
});

it('talking mouth changes every 3–5 frames and uses every shape', () => {
  const t = ANIMATIONS.find((a) => a.id === 'talking')!;
  const m = t.swaps.mouth;
  for (let i = 1; i < m.length; i++) {
    const d = m[i].frame - m[i - 1].frame;
    expect(d).toBeGreaterThanOrEqual(3);
    expect(d).toBeLessThanOrEqual(5);
  }
  expect(new Set(m.map((x) => x.sprite)).size).toBe(4);
});
