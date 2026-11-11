/** Mirrored arms: draw one side, the other side is a flipped copy (sheet editor). */
import { AREAS, PART_IDS, type PartId } from '../sheet/layout';
import { addShape, mirrorShapeX } from './commands';
import type { EditorDoc, EditorShape } from './model';

export const MIRROR_PAIRS: [PartId, PartId][] = [['upper_arm_L', 'upper_arm_R'], ['forearm_L', 'forearm_R'], ['hand_L', 'hand_R']];

/** When `part` is the generated side, the part it is copied from; otherwise null. */
export function mirrorTarget(doc: EditorDoc, part: PartId): PartId | null {
  if (!doc.mirrorArms) return null;
  for (const [l, r] of MIRROR_PAIRS) {
    if (doc.mirrorArms === 'L' && part === r) return l;
    if (doc.mirrorArms === 'R' && part === l) return r;
  }
  return null;
}

/** The source part's shapes, flipped into the target part's box (same row, pivots centred). */
export function mirroredShapes(shapes: EditorShape[], from: PartId, to: PartId): EditorShape[] {
  const a = AREAS[from], b = AREAS[to];
  const axis = (a.x + a.w / 2 + b.x + b.w / 2) / 2; // halfway between the two box centres
  return shapes.map((s) => ({ ...mirrorShapeX(s, axis), id: `${s.id}~m` }));
}

/** Every part's shapes as drawn: generated sides filled in from their source. */
export function resolvedParts(doc: EditorDoc): Record<PartId, EditorShape[]> {
  if (!doc.mirrorArms) return doc.parts;
  const parts = { ...doc.parts };
  for (const p of PART_IDS) {
    const from = mirrorTarget(doc, p);
    if (from) parts[p] = mirroredShapes(doc.parts[from], from, p);
  }
  return parts;
}

/** Turns mirroring on (clearing the generated side) or off (keeping the copies as real shapes). */
export function setMirrorArms(doc: EditorDoc, side: 'L' | 'R' | null): EditorDoc {
  if ((doc.mirrorArms ?? null) === side) return doc;
  let d: EditorDoc = doc;
  if (doc.mirrorArms) {
    // Materialise the current copies with fresh ids.
    const copies = resolvedParts(doc);
    for (const p of PART_IDS) {
      if (!mirrorTarget(doc, p)) continue;
      d = { ...d, parts: { ...d.parts, [p]: [] } };
      for (const s of copies[p]) { const { id: _id, ...rest } = s; void _id; d = addShape(d, p, rest as never).doc; }
    }
  }
  d = { ...d, mirrorArms: side };
  if (side) for (const p of PART_IDS) if (mirrorTarget(d, p)) d = { ...d, parts: { ...d.parts, [p]: [] } };
  return d;
}

/** Message for an attempt to draw into the generated side, or null when drawing there is fine. */
export function mirrorRefusal(doc: EditorDoc, part: PartId): string | null {
  const from = mirrorTarget(doc, part);
  return from ? `${part} is mirrored from ${from}. Draw on that side, or set Mirror arms to Off.` : null;
}
