/** Edit rig state: rig + reference placement with undo, selection and view (rig editor spec §3). */
import { createHistory, push, redo as hRedo, undo as hUndo, type History } from '../editor/history';
import type { ReferenceState } from '../editor/model';
import type { Viewport } from '../editor/viewport';
import { CHAR_SIZE, rigsEqual, rigToSkeleton, type JointId, type Rig } from '../rig/rig-file';
import type { SheetBus } from '../ui/sheet-bus';

export interface RigDoc { rig: Rig; reference: ReferenceState }
export interface RigEditorState {
  history: History<RigDoc>;
  selected: JointId | null;
  viewport: Viewport;
  characterOpacity: number;
  tool: 'joint' | 'reference';
  warnings: string[];
}
export type RigStore = ReturnType<typeof createRigStore>;

export const RIG_PUBLISH_MS = 200;
const DEFAULT_REFERENCE: ReferenceState = { x: 0, y: 0, scale: 1, opacity: 0.5, locked: false, hasImage: false };

export function createRigStore(bus: SheetBus) {
  let state: RigEditorState = {
    history: createHistory<RigDoc>({ rig: bus.getRig(), reference: DEFAULT_REFERENCE }),
    selected: null, viewport: { x: 0, y: 0, zoom: 1 }, characterOpacity: 0.8, tool: 'joint',
    warnings: rigToSkeleton(bus.getRig()).warnings,
  };
  const listeners = new Set<() => void>();
  const docListeners = new Set<(d: RigDoc) => void>();
  let dragBase: RigDoc | null = null;
  let publishTimer: ReturnType<typeof setTimeout> | null = null;
  let applyingExternal = false;

  const notify = () => { for (const f of [...listeners]) f(); };
  const doc = () => state.history.present;

  function publish() {
    publishTimer = null;
    if (!rigsEqual(bus.getRig(), doc().rig)) bus.setRig(doc().rig, 'rig');
  }
  function changed(prev: RigDoc) {
    const d = doc();
    if (d.rig !== prev.rig) {
      state = { ...state, warnings: rigToSkeleton(d.rig).warnings };
      if (!applyingExternal && !publishTimer) publishTimer = setTimeout(publish, RIG_PUBLISH_MS);
    }
    for (const f of [...docListeners]) f(d);
    notify();
  }
  const flush = () => { if (publishTimer) { clearTimeout(publishTimer); publish(); } };

  const store = {
    get: () => state,
    doc,
    subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); },
    onDoc(fn: (d: RigDoc) => void) { docListeners.add(fn); return () => docListeners.delete(fn); },
    set(patch: Partial<RigEditorState>) { state = { ...state, ...patch }; notify(); },
    commit(next: RigDoc) {
      store.endTransient();
      if (next === doc()) return;
      const prev = doc();
      state = { ...state, history: push(state.history, next) };
      changed(prev);
      flush();
    },
    transient(next: RigDoc) {
      if (!dragBase) dragBase = doc();
      const prev = doc();
      state = { ...state, history: { ...state.history, present: next } };
      changed(prev);
    },
    endTransient() {
      if (!dragBase) return;
      const base = dragBase, end = doc();
      dragBase = null;
      if (end !== base) state = { ...state, history: push({ ...state.history, present: base }, end) };
      flush();
      notify();
    },
    abortTransient() {
      if (!dragBase) return;
      const prev = doc();
      state = { ...state, history: { ...state.history, present: dragBase } };
      dragBase = null;
      changed(prev);
      flush();
    },
    undo() { store.endTransient(); const prev = doc(); state = { ...state, history: hUndo(state.history) }; changed(prev); flush(); },
    redo() { store.endTransient(); const prev = doc(); state = { ...state, history: hRedo(state.history) }; changed(prev); flush(); },
    /** Replaces history (autosave restore). Doesn't publish to the bus. */
    reset(next: RigDoc) {
      dragBase = null;
      applyingExternal = true;
      const prev = doc();
      state = { ...state, history: createHistory(next) };
      changed(prev);
      applyingExternal = false;
    },
    /** Fits a reference image of w×h to the character area. */
    fitReference(w: number, h: number): ReferenceState {
      const scale = Math.min(CHAR_SIZE / w, CHAR_SIZE / h);
      return { ...doc().reference, hasImage: true, scale, x: (CHAR_SIZE - w * scale) / 2, y: (CHAR_SIZE - h * scale) / 2 };
    },
  };

  // A rig set elsewhere (dropped file, remembered pair) becomes one undo step here.
  bus.subscribeRig((rig, origin) => {
    if (origin === 'rig' || rigsEqual(rig, doc().rig)) return;
    applyingExternal = true;
    store.endTransient();
    const prev = doc();
    state = { ...state, history: origin === 'restore' ? createHistory({ ...doc(), rig }) : push(state.history, { ...doc(), rig }) };
    changed(prev);
    applyingExternal = false;
  });
  return store;
}
