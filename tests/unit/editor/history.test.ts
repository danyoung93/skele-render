import { describe, it, expect } from 'vitest';
import { createHistory, push, undo, redo, canUndo, canRedo } from '../../../src/editor/history';
import { emptyDoc } from '../../../src/editor/model';

describe('history', () => {
  const a = emptyDoc('a'), b = emptyDoc('b'), c = emptyDoc('c');
  it('undo and redo return the exact documents', () => {
    let h = push(push(createHistory(a), b), c);
    h = undo(h); expect(h.present).toBe(b);
    h = undo(h); expect(h.present).toBe(a);
    expect(canUndo(h)).toBe(false);
    h = redo(h); expect(h.present).toBe(b);
    expect(canRedo(h)).toBe(true);
  });
  it('a new push after undo clears the redo list', () => {
    let h = undo(push(createHistory(a), b));
    h = push(h, c);
    expect(h.future).toEqual([]);
    expect(h.present).toBe(c);
  });
  it('caps past at 200 entries', () => {
    let h = createHistory(a);
    for (let i = 0; i < 205; i++) h = push(h, emptyDoc(String(i)));
    expect(h.past).toHaveLength(200);
  });
  it('undo/redo with nothing to do returns the same history', () => {
    const h = createHistory(a);
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });
});
