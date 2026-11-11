import { describe, it, expect } from 'vitest';
import { createStore } from '../../../src/editor/store';
import { createSheetBus } from '../../../src/ui/sheet-bus';
import { loadSheet } from '../../../src/sheet/load';
import { templateSvg } from '../../../src/sheet/template';
import { addShape, moveShapes, setReference } from '../../../src/editor/commands';
import { emptyDoc, DEFAULT_STYLE, findShape, type RectShape } from '../../../src/editor/model';

function setup() {
  const store = createStore(createSheetBus(loadSheet(templateSvg(), 't.svg')), emptyDoc('x'));
  const { doc, id } = addShape(store.doc(), 'torso', { kind: 'rect', x: 420, y: 100, w: 50, h: 50, r: 0, rotation: 0, style: DEFAULT_STYLE });
  store.commit(doc);
  const x = () => (findShape(store.doc(), id)!.shape as RectShape).x;
  return { store, id, x };
}

describe('store guards (review #1)', () => {
  it('refuses documents containing non-finite numbers', () => {
    const { store, id, x } = setup();
    store.commit(moveShapes(store.doc(), [id], NaN, 0));
    store.transient(moveShapes(store.doc(), [id], Infinity, 0));
    expect(x()).toBe(420);
  });
});

describe('transient interleaving (review #4, #5)', () => {
  it('commit during an open transient records the gesture and the commit as separate steps', () => {
    const { store, id, x } = setup();
    store.transient(moveShapes(store.doc(), [id], 10, 0));
    store.commit(moveShapes(store.doc(), [id], 5, 0));
    expect(x()).toBe(435);
    store.undo(); expect(x()).toBe(430);
    store.undo(); expect(x()).toBe(420);
  });
  it('undo during an open transient undoes the gesture, and a later endTransient changes nothing', () => {
    const { store, id, x } = setup();
    store.transient(setReference(moveShapes(store.doc(), [id], 10, 0), { scale: 2 }));
    store.undo();
    expect(x()).toBe(420);
    store.endTransient();
    expect(x()).toBe(420);
    store.redo();
    expect(x()).toBe(430);
  });
  it('abortTransient restores the pre-gesture document without a history step', () => {
    const { store, id, x } = setup();
    const before = store.get().history.past.length;
    store.transient(moveShapes(store.doc(), [id], 50, 0));
    store.abortTransient();
    expect(x()).toBe(420);
    expect(store.get().history.past.length).toBe(before);
  });
});
