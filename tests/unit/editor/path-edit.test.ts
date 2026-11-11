import { describe, it, expect } from 'vitest';
import { moveNode, moveHandle, insertNode, removeNode, nearestSegment, segmentPoint } from '../../../src/editor/path-edit';
import { DEFAULT_STYLE, type PathShape } from '../../../src/editor/model';

const shape = (closed = false): PathShape => ({
  id: 'p', kind: 'path', closed, rotation: 0, style: DEFAULT_STYLE,
  nodes: [
    { p: [0, 0], in: [0, 0], out: [0, -50] },
    { p: [100, 0], in: [100, -50], out: [120, 0] },
    { p: [100, 100], in: [120, 100], out: [100, 100] },
  ],
});

describe('path editing', () => {
  it('moveNode moves the point and both handles', () => {
    expect(moveNode(shape(), 1, [10, 5]).nodes[1]).toEqual({ p: [110, 5], in: [110, -45], out: [130, 5] });
  });
  it('moveHandle mirrors the opposite handle direction, keeping its length', () => {
    const n = moveHandle(shape(), 1, 'out', [100, 30], false).nodes[1];
    expect(n.out).toEqual([100, 30]);
    expect(n.in[0]).toBeCloseTo(100); expect(n.in[1]).toBeCloseTo(-50);
  });
  it('moveHandle with independent=true leaves the opposite handle alone', () => {
    expect(moveHandle(shape(), 1, 'out', [100, 30], true).nodes[1].in).toEqual([100, -50]);
  });
  it('insertNode splits a segment without changing its shape (de Casteljau)', () => {
    const s = shape();
    const before = [0.1, 0.3, 0.6, 0.9].map((t) => segmentPoint(s, 0, t));
    const after = insertNode(s, 0, 0.4);
    expect(after.nodes).toHaveLength(4);
    const mid = segmentPoint(s, 0, 0.4);
    expect(after.nodes[1].p[0]).toBeCloseTo(mid[0]); expect(after.nodes[1].p[1]).toBeCloseTo(mid[1]);
    // Points on the old segment lie on one of the two new segments.
    for (const p of before) {
      let best = Infinity;
      for (const seg of [0, 1]) for (let t = 0; t <= 1; t += 0.001) {
        const q = segmentPoint(after, seg, t); best = Math.min(best, Math.hypot(q[0] - p[0], q[1] - p[1]));
      }
      expect(best).toBeLessThan(0.2);
    }
  });
  it('nearestSegment finds the segment and t closest to a point, including the closing segment', () => {
    const s = shape(true);
    const r = nearestSegment(s, segmentPoint(s, 1, 0.5));
    expect(r.segment).toBe(1); expect(r.t).toBeCloseTo(0.5, 1);
    expect(nearestSegment(s, [40, 60]).segment).toBe(2);
  });
  it('removeNode removes a node, or returns null below 2 nodes', () => {
    expect(removeNode(shape(), 1)!.nodes.map((n) => n.p)).toEqual([[0, 0], [100, 100]]);
    expect(removeNode(removeNode(shape(), 0)!, 0)).toBeNull();
  });
});

import { keepFrame } from '../../../src/editor/path-edit';
import { toWorld } from '../../../src/editor/model';

describe('keepFrame', () => {
  it('keeps untouched points of a rotated path in place on screen after an edit moves its centre', () => {
    const before = { ...shape(), rotation: 37 };
    const edited = keepFrame(before, moveNode(before, 2, [80, 40]));
    for (const i of [0, 1]) {
      const a = toWorld(before, before.nodes[i].p), b = toWorld(edited, edited.nodes[i].p);
      expect(b[0]).toBeCloseTo(a[0], 6); expect(b[1]).toBeCloseTo(a[1], 6);
    }
  });
  it('is a no-op without rotation', () => {
    const s = shape();
    const m = moveNode(s, 2, [80, 40]);
    expect(keepFrame(s, m)).toEqual(m);
  });
});
