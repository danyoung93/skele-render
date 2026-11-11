/** Undo history (sheet editor spec §2.3), shared by the sheet and rig editors. */
import type { EditorDoc } from './model';

export interface History<T = EditorDoc> { past: T[]; present: T; future: T[] }
export const MAX_HISTORY = 200;

export const createHistory = <T = EditorDoc>(doc: T): History<T> => ({ past: [], present: doc, future: [] });
export const canUndo = <T>(h: History<T>) => h.past.length > 0;
export const canRedo = <T>(h: History<T>) => h.future.length > 0;

export function push<T>(h: History<T>, doc: T): History<T> {
  if (doc === h.present) return h;
  return { past: [...h.past, h.present].slice(-MAX_HISTORY), present: doc, future: [] };
}
export function undo<T>(h: History<T>): History<T> {
  if (!canUndo(h)) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}
export function redo<T>(h: History<T>): History<T> {
  if (!canRedo(h)) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
}
