import { describe, it, expect } from 'vitest';
import { buildLottie } from '../../../src/lottie/build';
import { loadSheet } from '../../../src/sheet/load';
import { templateSvg } from '../../../src/sheet/template';
import { ANIMATIONS } from '../../../src/anim';
import { DEFAULT_RIG, JOINT_IDS, type Rig } from '../../../src/rig/rig-file';
import { restPose } from '../../../src/rig/pose';
import { AREAS, PART_IDS } from '../../../src/sheet/layout';
import { apply } from '../../../src/svg/matrix';
import { worldMatrix, jointPosition } from '../pose';
import type { Layer } from '../../../src/lottie/types';

const sheet = loadSheet(templateSvg(), 'template.svg');
const custom: Rig = {
  name: 'chunky',
  joints: {
    root: [250, 450], neck: [252, 220], brows: [250, 110], eyes: [248, 140], mouth: [252, 190],
    shoulder_L: [170, 255], elbow_L: [140, 320], wrist_L: [150, 380],
    shoulder_R: [335, 250], elbow_R: [370, 300], wrist_R: [345, 370],
  },
};
const BONE_FOR: Record<string, string> = {
  root: 'root', neck: 'neck', brows: 'brows', shoulder_L: 'shoulder_L', elbow_L: 'elbow_L', wrist_L: 'wrist_L',
  shoulder_R: 'shoulder_R', elbow_R: 'elbow_R', wrist_R: 'wrist_R',
};

describe('building with a rig', () => {
  it('every bone null sits on its rig joint at frame 0', () => {
    for (const anim of ANIMATIONS) {
      // Animations move bones away from rest during playback; frame 0 must be the rest pose for the
      // bones they don't animate at frame 0, so compare against a static build.
      const doc = buildLottie(sheet, { ...anim, bones: {} }, { debug: false, rig: custom });
      for (const [joint, bone] of Object.entries(BONE_FOR)) {
        const p = jointPosition(doc, `bone:${bone}`);
        const j = custom.joints[joint as keyof Rig['joints']];
        expect(Math.abs(p[0] - j[0]), joint).toBeLessThan(1e-4);
        expect(Math.abs(p[1] - j[1]), joint).toBeLessThan(1e-4);
      }
      const anchorOf = (nm: string) => {
        const l = doc.layers.find((x) => x.nm === nm) as Layer;
        const a = l.ks.a.a === 0 ? (l.ks.a.k as number[]) : [0, 0];
        return apply(worldMatrix(doc, l), [a[0], a[1]]);
      };
      const e = anchorOf('eyes_open'), m = anchorOf('mouth_closed');
      expect(e[0]).toBeCloseTo(custom.joints.eyes[0], 3); expect(e[1]).toBeCloseTo(custom.joints.eyes[1], 3);
      expect(m[0]).toBeCloseTo(custom.joints.mouth[0], 3); expect(m[1]).toBeCloseTo(custom.joints.mouth[1], 3);
    }
  });
  it('a degenerate rig still builds a finite Lottie', () => {
    const flat: Rig = { name: 'flat', joints: Object.fromEntries(JOINT_IDS.map((id) => [id, [256, 256]])) as Rig['joints'] };
    const text = JSON.stringify(buildLottie(sheet, ANIMATIONS[1], { debug: true, rig: flat }));
    expect(text).not.toMatch(/null|NaN|Infinity/);
  });
  it('omitting the rig uses the default rig', () => {
    expect(buildLottie(sheet, ANIMATIONS[0], { debug: false })).toEqual(buildLottie(sheet, ANIMATIONS[0], { debug: false, rig: DEFAULT_RIG }));
  });
});

describe('restPose', () => {
  it('maps each part pivot onto its bone joint plus attachment', () => {
    const pose = restPose(custom);
    const expectAt = (part: (typeof PART_IDS)[number], joint: keyof Rig['joints']) => {
      const a = AREAS[part];
      const p = apply(pose.part[part], [a.x + a.pivot[0], a.y + a.pivot[1]]);
      expect(p[0]).toBeCloseTo(custom.joints[joint][0], 4); expect(p[1]).toBeCloseTo(custom.joints[joint][1], 4);
    };
    expectAt('torso', 'root'); expectAt('head', 'neck'); expectAt('brows', 'brows');
    expectAt('eyes_open', 'eyes'); expectAt('mouth_wide', 'mouth');
    expectAt('upper_arm_L', 'shoulder_L'); expectAt('forearm_R', 'elbow_R'); expectAt('hand_L', 'wrist_L');
  });
});
