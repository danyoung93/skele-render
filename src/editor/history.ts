/** Undo history (sheet editor spec §2.3). */
import type { EditorDoc } from './model';

export interface History { past: EditorDoc[]; present: EditorDoc; future: EditorDoc[] }
export const MAX_HISTORY = 200;

export const createHistory = (doc: EditorDoc): History => ({ past: [], present: doc, future: [] });
export const canUndo = (h: History) => h.past.length > 0;
export const canRedo = (h: History) => h.future.length > 0;

export function push(h: History, doc: EditorDoc): History {
  if (doc === h.present) return h;
  return { past: [...h.past, h.present].slice(-MAX_HISTORY), present: doc, future: [] };
}
export function undo(h: History): History {
  if (!canUndo(h)) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}
export function redo(h: History): History {
  if (!canRedo(h)) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
}
