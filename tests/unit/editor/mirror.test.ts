import { describe, it, expect } from 'vitest';
import { addShape } from '../../../src/editor/commands';
import { DEFAULT_STYLE, emptyDoc, type EditorDoc, type RectShape } from '../../../src/editor/model';
import { mirrorTarget, resolvedParts, setMirrorArms } from '../../../src/editor/mirror';
import { serialize } from '../../../src/editor/serialize';
import { importSheet } from '../../../src/editor/import';
import { validateDoc } from '../../../src/editor/persist';
import { loadSheet } from '../../../src/sheet/load';

const rect = (o: Partial<RectShape>) => ({ kind: 'rect' as const, x: 40, y: 620, w: 30, h: 80, r: 0, rotation: 0, style: DEFAULT_STYLE, ...o });
function armDoc(): EditorDoc {
  let d = emptyDoc('x');
  d = addShape(d, 'upper_arm_L', rect({})).doc;
  d = addShape(d, 'hand_L', rect({ x: 280, y: 620, w: 20, h: 20, rotation: 30 })).doc;
  return d;
}

describe('mirrored arms', () => {
  it('targets the other side only for arm parts', () => {
    const d = { ...armDoc(), mirrorArms: 'L' as const };
    expect(mirrorTarget(d, 'upper_arm_R')).toBe('upper_arm_L');
    expect(mirrorTarget(d, 'upper_arm_L')).toBeNull();
    expect(mirrorTarget(d, 'head')).toBeNull();
    expect(mirrorTarget({ ...d, mirrorArms: null }, 'upper_arm_R')).toBeNull();
  });
  it('flips each source shape into the opposite box, keeping the pivot line', () => {
    const parts = resolvedParts({ ...armDoc(), mirrorArms: 'L' });
    // upper_arm_L box x 32..128 (centre 80) → upper_arm_R box x 512..608 (centre 560).
    expect(parts.upper_arm_R[0]).toMatchObject({ kind: 'rect', x: 570, y: 620, w: 30, h: 80 });
    expect(parts.hand_R[0]).toMatchObject({ rotation: -30 });
    expect(parts.upper_arm_L).toEqual(armDoc().parts.upper_arm_L);
  });
  it('mirroring there and back gives the original', () => {
    const there = resolvedParts({ ...armDoc(), mirrorArms: 'L' });
    const back = resolvedParts({ ...emptyDoc('x'), parts: { ...emptyDoc('x').parts, upper_arm_R: there.upper_arm_R }, mirrorArms: 'R' });
    expect(back.upper_arm_L[0]).toMatchObject({ x: 40, y: 620, w: 30, h: 80 });
  });
  it('turning on clears the target side; turning off keeps the copies as real shapes', () => {
    let d = addShape(armDoc(), 'upper_arm_R', rect({ x: 520 })).doc;
    d = setMirrorArms(d, 'L');
    expect(d.mirrorArms).toBe('L');
    expect(d.parts.upper_arm_R).toEqual([]);
    const off = setMirrorArms(d, null);
    expect(off.mirrorArms).toBeNull();
    expect(off.parts.upper_arm_R).toHaveLength(1);
    expect(off.parts.upper_arm_R[0]).toMatchObject({ x: 570 });
    const ids = Object.values(off.parts).flat().map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('serialises both sides plus the setting, and import restores it', () => {
    const d = setMirrorArms(armDoc(), 'L');
    const text = serialize(d);
    expect(text).toContain('data-mirror-arms="L"');
    const sheet = loadSheet(text, 'x.svg');
    expect(sheet.parts.upper_arm_R).not.toBeNull();
    const { doc } = importSheet(sheet);
    expect(doc.mirrorArms).toBe('L');
    expect(doc.parts.upper_arm_R).toEqual([]);
    expect(doc.parts.upper_arm_L).toHaveLength(1);
  });
  it('autosave validation accepts the setting (and its absence) and rejects nonsense', () => {
    const d = JSON.parse(JSON.stringify(armDoc()));
    expect(validateDoc(d)).not.toBeNull();
    expect(validateDoc({ ...d, mirrorArms: 'R' })).not.toBeNull();
    expect(validateDoc({ ...d, mirrorArms: null })).not.toBeNull();
    expect(validateDoc({ ...d, mirrorArms: 'X' })).toBeNull();
  });
});
