/** Editor state and change notification (sheet editor spec §5). */
import { PART_IDS, type PartId } from '../sheet/layout';
import { loadSheet, SheetError } from '../sheet/load';
import type { SheetBus } from '../ui/sheet-bus';
import { createHistory, push, redo as hRedo, undo as hUndo, type History } from './history';
import { DEFAULT_STYLE, type EditorDoc, type Style } from './model';
import { serialize } from './serialize';
import type { ToolId } from './tools/types';
import type { Viewport } from './viewport';

export interface ReferenceImage { url: string; bitmap: ImageBitmap; w: number; h: number; canvas: OffscreenCanvas | HTMLCanvasElement }

export interface EditorState {
  history: History;
  selection: string[];
  active: PartId;
  tool: ToolId;
  style: Style;
  viewport: Viewport;
  hidden: Set<PartId>;
  reference: ReferenceImage | null;
  dirty: boolean;
  autosave: 'on' | 'off';
  message: { kind: 'info' | 'error'; text: string } | null;
}

export type Store = ReturnType<typeof createStore>;

export const PREVIEW_THROTTLE_MS = 200;

export function createStore(bus: SheetBus, initial: EditorDoc) {
  let state: EditorState = {
    history: createHistory(initial), selection: [], active: 'head', tool: 'select', style: DEFAULT_STYLE,
    viewport: { x: 0, y: 0, zoom: 1 }, hidden: new Set(), reference: null, dirty: false, autosave: 'on', message: null,
  };
  const listeners = new Set<() => void>();
  const docListeners = new Set<(doc: EditorDoc) => void>();
  let dragBase: EditorDoc | null = null;
  let previewTimer: ReturnType<typeof setTimeout> | null = null;

  const notify = () => { for (const f of [...listeners]) f(); };
  const doc = () => state.history.present;

  function publishPreview() {
    previewTimer = null;
    const d = doc();
    try {
      bus.set(loadSheet(serialize(d), `${d.name || 'my-character'}.svg`), 'editor');
    } catch (e) {
      if (!(e instanceof SheetError)) throw e;
    }
  }
  function docChanged() {
    if (!previewTimer) previewTimer = setTimeout(publishPreview, PREVIEW_THROTTLE_MS);
    for (const f of [...docListeners]) f(doc());
  }
  /** Drop selected ids that no longer exist. */
  function pruneSelection(d: EditorDoc) {
    const ids = new Set(PART_IDS.flatMap((p) => d.parts[p].map((s) => s.id)));
    const sel = state.selection.filter((id) => ids.has(id));
    if (sel.length !== state.selection.length) state = { ...state, selection: sel };
  }

  return {
    get: () => state,
    doc,
    subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); },
    /** Called after every document change (for autosave). */
    onDoc(fn: (doc: EditorDoc) => void) { docListeners.add(fn); return () => docListeners.delete(fn); },
    set(patch: Partial<EditorState>) { state = { ...state, ...patch }; notify(); },
    commit(next: EditorDoc) {
      dragBase = null;
      if (next === doc()) return;
      state = { ...state, history: push(state.history, next), dirty: true };
      pruneSelection(next);
      docChanged(); notify();
    },
    /** Updates the present document without a history entry (during drags). */
    transient(next: EditorDoc) {
      if (!dragBase) dragBase = doc();
      state = { ...state, history: { ...state.history, present: next } };
      docChanged(); notify();
    },
    /** Ends a drag: records the whole drag as one undo step. */
    endTransient() {
      if (!dragBase) return;
      const base = dragBase, end = doc();
      dragBase = null;
      if (end === base) return;
      state = { ...state, history: push({ ...state.history, present: base }, end), dirty: true };
      notify();
    },
    /** Replaces the document and history (new sheet, restore). */
    reset(next: EditorDoc, opts: { undoable: boolean; dirty: boolean }) {
      dragBase = null;
      const history = opts.undoable ? push(state.history, next) : createHistory(next);
      state = { ...state, history, selection: [], dirty: opts.dirty };
      docChanged(); notify();
    },
    undo() { state = { ...state, history: hUndo(state.history), dirty: true }; pruneSelection(doc()); docChanged(); notify(); },
    redo() { state = { ...state, history: hRedo(state.history), dirty: true }; pruneSelection(doc()); docChanged(); notify(); },
    setTool(tool: ToolId) { state = { ...state, tool }; notify(); },
    select(ids: string[]) { state = { ...state, selection: ids }; notify(); },
    setActive(active: PartId) { state = { ...state, active }; notify(); },
    setViewport(viewport: Viewport) { state = { ...state, viewport }; notify(); },
    flushPreview() { if (previewTimer) { clearTimeout(previewTimer); publishPreview(); } },
  };
}
