/** Editor state and change notification (sheet editor spec §5). */
import { PART_IDS, type PartId } from '../sheet/layout';
import { loadSheet, SheetError } from '../sheet/load';
import type { SheetBus } from '../ui/sheet-bus';
import { createHistory, push, redo as hRedo, undo as hUndo, type History } from './history';
import { setReference } from './commands';
import { DEFAULT_STYLE, type EditorDoc, type Style } from './model';
import { REF_SIZE } from '../sheet/layout';
import { serialize } from './serialize';
import type { ToolId } from './tools/types';
import type { Viewport } from './viewport';

export interface ReferenceImage {
  url: string;
  /** The original file, kept for autosave. */
  blob: Blob;
  w: number;
  h: number;
  /** Pixels for the eyedropper, at display size (≤ 8000 px on the longest side). */
  pixels: CanvasRenderingContext2D;
}
export const MAX_REFERENCE_PX = 8000;

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
  /** Notes from the last 'Edit current sheet' import (lossy conversions). */
  importNotes: { part: PartId; message: string }[];
  /** Keep proportions: W/H edits and handle drags scale both axes together. */
  keepRatio: boolean;
}

export type Store = ReturnType<typeof createStore>;
export type EditorStore = Store;

export const PREVIEW_THROTTLE_MS = 200;

/** A command bug must never put NaN/Infinity into the document: it would make the autosave unreadable. */
export function finiteDoc(d: EditorDoc): boolean {
  let ok = true;
  JSON.stringify(d, (_k, v) => { if (typeof v === 'number' && !Number.isFinite(v)) ok = false; return v; });
  return ok;
}

export function createStore(bus: SheetBus, initial: EditorDoc) {
  let state: EditorState = {
    history: createHistory(initial), selection: [], active: 'head', tool: 'select', style: DEFAULT_STYLE,
    viewport: { x: 0, y: 0, zoom: 1 }, hidden: new Set(), reference: null, dirty: false, autosave: 'on', message: null, importNotes: [], keepRatio: false,
  };
  const listeners = new Set<() => void>();
  const docListeners = new Set<(doc: EditorDoc) => void>();
  let dragBase: EditorDoc | null = null;
  const refListeners = new Set<(blob: Blob | null) => void>();
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
  // Only artwork (parts) or the name is published to the shared sheet. Reference-image changes are
  // editor-only: publishing them would replace a sheet loaded elsewhere with this (possibly blank) doc.
  let published = { parts: initial.parts, name: initial.name };
  function docChanged() {
    const d = doc();
    if ((d.parts !== published.parts || d.name !== published.name) && !previewTimer) {
      published = { parts: d.parts, name: d.name };
      previewTimer = setTimeout(publishPreview, PREVIEW_THROTTLE_MS);
    }
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
      if (!finiteDoc(next)) return;
      this.endTransient();
      if (next === doc()) return;
      state = { ...state, history: push(state.history, next), dirty: true };
      pruneSelection(next);
      docChanged(); notify();
    },
    /** Updates the present document without a history entry (during drags). */
    transient(next: EditorDoc) {
      if (!finiteDoc(next)) return;
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
    /** Abandons an open gesture: the document returns to its pre-gesture state, with no history step. */
    abortTransient() {
      if (!dragBase) return;
      state = { ...state, history: { ...state.history, present: dragBase } };
      dragBase = null;
      pruneSelection(doc()); docChanged(); notify();
    },
    /** Replaces the document and history (new sheet, restore). */
    reset(next: EditorDoc, opts: { undoable: boolean; dirty: boolean }) {
      this.endTransient();
      const history = opts.undoable ? push(state.history, next) : createHistory(next);
      state = { ...state, history, selection: [], dirty: opts.dirty };
      docChanged(); notify();
    },
    undo() { this.endTransient(); state = { ...state, history: hUndo(state.history), dirty: true }; pruneSelection(doc()); docChanged(); notify(); },
    redo() { this.endTransient(); state = { ...state, history: hRedo(state.history), dirty: true }; pruneSelection(doc()); docChanged(); notify(); },
    setTool(tool: ToolId) { state = { ...state, tool }; notify(); },
    select(ids: string[]) { state = { ...state, selection: ids }; notify(); },
    setActive(active: PartId) { state = { ...state, active }; notify(); },
    setViewport(viewport: Viewport) { state = { ...state, viewport }; notify(); },
    flushPreview() { if (previewTimer) { clearTimeout(previewTimer); publishPreview(); } },
    cancelPreview() { if (previewTimer) { clearTimeout(previewTimer); previewTimer = null; } },
    /**
     * Decodes a reference image. With `fit`, places it to fill the sheet (one undo step); otherwise keeps
     * the document's saved placement. On failure keeps the previous image and shows a message.
     */
    async loadReference(blob: Blob, opts: { fit: boolean } = { fit: true }): Promise<boolean> {
      let bitmap: ImageBitmap;
      try { bitmap = await createImageBitmap(blob); } catch {
        state = { ...state, message: { kind: 'error', text: 'Could not read that image. Try a PNG, JPEG or WebP file.' } };
        notify();
        return false;
      }
      const k = Math.min(1, MAX_REFERENCE_PX / Math.max(bitmap.width, bitmap.height));
      const w = Math.round(bitmap.width * k), h = Math.round(bitmap.height * k);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const pixels = canvas.getContext('2d', { willReadFrequently: true })!;
      pixels.drawImage(bitmap, 0, 0, w, h);
      bitmap.close();
      let url: string;
      if (k < 1) {
        const scaled = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/png'));
        url = URL.createObjectURL(scaled ?? blob);
      } else url = URL.createObjectURL(blob);
      if (state.reference) URL.revokeObjectURL(state.reference.url);
      state = {
        ...state, reference: { url, blob, w, h, pixels },
        message: k < 1 ? { kind: 'info', text: `Reference scaled to ${MAX_REFERENCE_PX} px on its longest side.` } : null,
      };
      if (opts.fit) {
        const scale = Math.min(REF_SIZE / w, REF_SIZE / h);
        this.commit(setReference(doc(), { hasImage: true, scale, x: (REF_SIZE - w * scale) / 2, y: (REF_SIZE - h * scale) / 2 }));
      } else notify();
      for (const f of [...refListeners]) f(blob);
      return true;
    },
    /** Called when the reference image file changes (for autosave). */
    onReference(fn: (blob: Blob | null) => void) { refListeners.add(fn); return () => refListeners.delete(fn); },
  };
}
