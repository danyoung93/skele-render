import { describe, it, expect } from 'vitest';
import { DEFAULT_RIG, JOINT_IDS, RigError, parseRig, serializeRig, validateRig, rigToSkeleton, rigWarnings, rigsEqual, type Rig } from '../../../src/rig/rig-file';
import { BONES, ATTACH } from '../../../src/rig/rig';
import { PART_IDS } from '../../../src/sheet/layout';

const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-9);
const withJoint = (id: (typeof JOINT_IDS)[number], v: [number, number]): Rig => ({ ...DEFAULT_RIG, joints: { ...DEFAULT_RIG.joints, [id]: v } });

describe('rigToSkeleton', () => {
  it('the default rig reproduces today\'s bones and attachments', () => {
    const { bones, attach, warnings } = rigToSkeleton(DEFAULT_RIG);
    expect(warnings).toEqual([]);
    expect(bones.map((b) => [b.id, b.parent])).toEqual(BONES.map((b) => [b.id, b.parent]));
    bones.forEach((b, i) => {
      close(b.rotation, BONES[i].rotation);
      close(b.offset[0], BONES[i].offset[0]); close(b.offset[1], BONES[i].offset[1]);
    });
    for (const p of PART_IDS) {
      expect(attach[p].bone).toBe(ATTACH[p].bone);
      close(attach[p].offset[0], ATTACH[p].offset[0]); close(attach[p].offset[1], ATTACH[p].offset[1]);
    }
  });
  it('a moved elbow re-angles the upper arm and sets its length', () => {
    const s = DEFAULT_RIG.joints.shoulder_L;
    const { bones } = rigToSkeleton(withJoint('elbow_L', [s[0] + 40, s[1] + 60]));
    const sh = bones.find((b) => b.id === 'shoulder_L')!, el = bones.find((b) => b.id === 'elbow_L')!;
    // Skeleton values are rounded to 1e-6 px/deg (so the default rig reproduces the old constants exactly).
    expect(sh.rotation).toBeCloseTo((Math.atan2(-40, 60) * 180) / Math.PI, 5);
    expect(el.offset[0]).toBeCloseTo(0, 5); expect(el.offset[1]).toBeCloseTo(Math.sqrt(5200), 5);
  });
  it('a wrist on its elbow points straight down with a warning', () => {
    const r = withJoint('wrist_L', DEFAULT_RIG.joints.elbow_L);
    const { bones, warnings } = rigToSkeleton(r);
    const shoulderWorld = bones.find((b) => b.id === 'shoulder_L')!.rotation;
    close(bones.find((b) => b.id === 'elbow_L')!.rotation, -shoulderWorld);
    expect(warnings).toContain('elbow_L is on top of wrist_L; that arm segment points straight down');
  });
  it('warns about joints outside the character area', () => {
    expect(rigWarnings(withJoint('mouth', [600, 10]))).toContain('mouth is outside the 512 × 512 character area');
  });
});

describe('rig files', () => {
  it('round-trips through serialize/parse, with 2-space indentation', () => {
    const r = withJoint('neck', [250.12345, 241]);
    const text = serializeRig(r);
    expect(text).toContain('\n  "format": "character-rig/rig"');
    const back = parseRig(text).rig;
    expect(back.joints.neck).toEqual([250.123, 241]);
    expect(parseRig(serializeRig(back)).rig).toEqual(back);
  });
  it.each([
    ['not json', 'Not a rig file (not valid JSON)'],
    ['{"format":"x","version":1}', 'Not a rig file (format should be character-rig/rig)'],
    ['{"format":"character-rig/rig","version":2}', 'Unsupported rig version 2'],
    ['{"format":"character-rig/rig","version":1,"joints":{}}', 'Rig is missing joint root'],
  ])('rejects %s', (text, msg) => {
    expect(() => parseRig(text)).toThrow(RigError);
    expect(() => parseRig(text)).toThrow(msg);
  });
  it('rejects non-numeric joints', () => {
    const o = JSON.parse(serializeRig(DEFAULT_RIG)); o.joints.neck = [1, 'x'];
    expect(() => parseRig(JSON.stringify(o))).toThrow('Joint neck must be two finite numbers');
  });
  it('ignores unknown fields and falls back to the name "rig"', () => {
    const o = JSON.parse(serializeRig(DEFAULT_RIG)); o.extra = 1; o.name = 'Bad Name!';
    expect(parseRig(JSON.stringify(o)).rig.name).toBe('bad-name');
    delete o.name;
    expect(parseRig(JSON.stringify(o)).rig.name).toBe('rig');
  });
  it('validateRig accepts rigs and rejects NaN', () => {
    expect(validateRig(JSON.parse(JSON.stringify(DEFAULT_RIG)))).toEqual(DEFAULT_RIG);
    expect(validateRig({ ...DEFAULT_RIG, joints: { ...DEFAULT_RIG.joints, root: [NaN, 0] } })).toBeNull();
    expect(validateRig(null)).toBeNull();
  });
  it('rigsEqual compares names and joints', () => {
    expect(rigsEqual(DEFAULT_RIG, JSON.parse(JSON.stringify(DEFAULT_RIG)))).toBe(true);
    expect(rigsEqual(DEFAULT_RIG, withJoint('eyes', [1, 2]))).toBe(false);
  });
  it('the default rig is named "default"', () => expect(DEFAULT_RIG.name).toBe('default'));
});
