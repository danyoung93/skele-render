/** Rig files: joint positions in character space, and their conversion to the skeleton (rig editor spec §2). */
import { PART_IDS, type PartId, type Vec2 } from '../sheet/layout';
import type { Bone, BoneId } from './rig';

export const JOINT_IDS = [
  'root', 'neck', 'shoulder_L', 'elbow_L', 'wrist_L', 'shoulder_R', 'elbow_R', 'wrist_R', 'brows', 'eyes', 'mouth',
] as const;
export type JointId = (typeof JOINT_IDS)[number];
export interface Rig { name: string; joints: Record<JointId, Vec2> }

export const RIG_FORMAT = 'character-rig/rig';
export const RIG_VERSION = 1;
export const CHAR_SIZE = 512;
export class RigError extends Error {}

const DEG = 180 / Math.PI;
/** Clockwise rotation in a y-down space. */
export function rotate(v: Vec2, deg: number): Vec2 {
  const r = deg / DEG, c = Math.cos(r), s = Math.sin(r);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
}
const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
/** Rounds away floating-point noise so the default rig reproduces the original constants exactly. */
const clean = (n: number) => { const r = Math.round(n * 1e6) / 1e6; return r === 0 ? 0 : r; };

/** Today's skeleton, as positions on the character (computed, not rounded). */
function legacyRig(): Rig {
  const root: Vec2 = [256, 440], neck = add(root, [0, -200]);
  const arm = (shoulderOff: Vec2, angle: number) => {
    const shoulder = add(root, shoulderOff), elbow = add(shoulder, rotate([0, 84], angle));
    return [shoulder, elbow, add(elbow, rotate([0, 76], angle))] as const;
  };
  const [shoulder_L, elbow_L, wrist_L] = arm([-72, -180], 10);
  const [shoulder_R, elbow_R, wrist_R] = arm([72, -180], -10);
  return {
    name: 'default',
    joints: {
      root, neck, shoulder_L, elbow_L, wrist_L, shoulder_R, elbow_R, wrist_R,
      brows: add(neck, [0, -108]), eyes: add(neck, [0, -85]), mouth: add(neck, [0, -40]),
    },
  };
}
export const DEFAULT_RIG: Rig = legacyRig();

/** Clockwise degrees from "straight down" to v; null when v is (almost) zero. */
function angleDown(v: Vec2): number | null {
  return Math.hypot(v[0], v[1]) < 0.001 ? null : Math.atan2(-v[0], v[1]) * DEG;
}

export function rigWarnings(rig: Rig): string[] {
  const out: string[] = [];
  for (const id of JOINT_IDS) {
    const [x, y] = rig.joints[id];
    if (x < 0 || y < 0 || x > CHAR_SIZE || y > CHAR_SIZE) out.push(`${id} is outside the 512 × 512 character area`);
  }
  return out;
}

/** Bone joint used for each bone's position. */
const BONE_JOINT: Record<BoneId, JointId> = {
  root: 'root', torso: 'root', neck: 'neck', head: 'neck', brows: 'brows',
  shoulder_L: 'shoulder_L', elbow_L: 'elbow_L', wrist_L: 'wrist_L',
  shoulder_R: 'shoulder_R', elbow_R: 'elbow_R', wrist_R: 'wrist_R',
};
const PARENT: Record<BoneId, BoneId | null> = {
  root: null, torso: 'root', neck: 'torso', head: 'neck', brows: 'head',
  shoulder_L: 'torso', elbow_L: 'shoulder_L', wrist_L: 'elbow_L',
  shoulder_R: 'torso', elbow_R: 'shoulder_R', wrist_R: 'elbow_R',
};
const BONE_ORDER: BoneId[] = ['root', 'torso', 'neck', 'head', 'brows', 'shoulder_L', 'elbow_L', 'wrist_L', 'shoulder_R', 'elbow_R', 'wrist_R'];
const PART_BONE: Record<PartId, BoneId> = {
  torso: 'torso', head: 'head', eyes_open: 'head', eyes_closed: 'head', brows: 'brows',
  mouth_closed: 'head', mouth_half: 'head', mouth_open: 'head', mouth_wide: 'head',
  upper_arm_L: 'shoulder_L', forearm_L: 'elbow_L', hand_L: 'wrist_L',
  upper_arm_R: 'shoulder_R', forearm_R: 'elbow_R', hand_R: 'wrist_R',
};

export function rigToSkeleton(rig: Rig): { bones: Bone[]; attach: Record<PartId, { bone: BoneId; offset: Vec2 }>; warnings: string[] } {
  const j = rig.joints;
  const warnings = rigWarnings(rig);
  const world: Partial<Record<BoneId, number>> = { root: 0, torso: 0, neck: 0, head: 0, brows: 0 };
  for (const side of ['L', 'R'] as const) {
    const seg = (from: JointId, to: JointId) => {
      const a = angleDown(sub(j[to], j[from]));
      if (a === null) warnings.push(`${from} is on top of ${to}; that arm segment points straight down`);
      return a ?? 0;
    };
    world[`shoulder_${side}`] = seg(`shoulder_${side}`, `elbow_${side}`);
    world[`elbow_${side}`] = seg(`elbow_${side}`, `wrist_${side}`);
    world[`wrist_${side}`] = world[`elbow_${side}`];
  }
  const bones: Bone[] = BONE_ORDER.map((id) => {
    const parent = PARENT[id];
    const pw = parent ? world[parent]! : 0;
    const raw = parent ? rotate(sub(j[BONE_JOINT[id]], j[BONE_JOINT[parent]]), -pw) : j.root;
    return { id, parent, offset: [clean(raw[0]), clean(raw[1])], rotation: clean(world[id]! - pw) };
  });
  const face = (anchor: JointId): Vec2 => { const d = sub(j[anchor], j.neck); return [clean(d[0]), clean(d[1])]; };
  const attach = Object.fromEntries(PART_IDS.map((p) => {
    let offset: Vec2 = [0, 0];
    if (p.startsWith('eyes_')) offset = face('eyes');
    else if (p.startsWith('mouth_')) offset = face('mouth');
    return [p, { bone: PART_BONE[p], offset }];
  })) as Record<PartId, { bone: BoneId; offset: Vec2 }>;
  return { bones, attach, warnings };
}

const cleanName = (n: unknown): string => {
  if (typeof n !== 'string') return 'rig';
  return n.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'rig';
};
const isVec = (v: unknown): v is Vec2 => Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function parseRig(text: string): { rig: Rig; warnings: string[] } {
  let o: unknown;
  try { o = JSON.parse(text); } catch { throw new RigError('Not a rig file (not valid JSON)'); }
  if (!o || typeof o !== 'object') throw new RigError('Not a rig file (not valid JSON)');
  const d = o as Record<string, unknown>;
  if (d.format !== RIG_FORMAT) throw new RigError(`Not a rig file (format should be ${RIG_FORMAT})`);
  if (d.version !== RIG_VERSION) throw new RigError(`Unsupported rig version ${String(d.version)}`);
  const joints = (d.joints ?? {}) as Record<string, unknown>;
  const out = {} as Record<JointId, Vec2>;
  for (const id of JOINT_IDS) {
    if (!(id in joints)) throw new RigError(`Rig is missing joint ${id}`);
    const v = joints[id];
    if (!isVec(v)) throw new RigError(`Joint ${id} must be two finite numbers`);
    out[id] = [v[0], v[1]];
  }
  const rig = { name: cleanName(d.name), joints: out };
  return { rig, warnings: rigToSkeleton(rig).warnings };
}

export function serializeRig(rig: Rig): string {
  const joints = Object.fromEntries(JOINT_IDS.map((id) => [id, rig.joints[id].map(r3)]));
  return JSON.stringify({ format: RIG_FORMAT, version: RIG_VERSION, name: rig.name, joints }, null, 2) + '\n';
}

export function validateRig(x: unknown): Rig | null {
  if (!x || typeof x !== 'object') return null;
  const d = x as Record<string, unknown>;
  const joints = d.joints as Record<string, unknown> | undefined;
  if (typeof d.name !== 'string' || !joints || !JOINT_IDS.every((id) => isVec(joints[id]))) return null;
  return { name: d.name, joints: Object.fromEntries(JOINT_IDS.map((id) => [id, joints[id]])) as Record<JointId, Vec2> };
}

export const rigsEqual = (a: Rig, b: Rig) =>
  a.name === b.name && JOINT_IDS.every((id) => a.joints[id][0] === b.joints[id][0] && a.joints[id][1] === b.joints[id][1]);
