/** The current character: the sheet and the rig, shared by Animate, Edit sheet and Edit rig. */
import { DEFAULT_RIG, type Rig } from '../rig/rig-file';
import type { LoadedSheet } from '../sheet/load';

export type SheetOrigin = 'animate' | 'editor';
export type RigOrigin = 'animate' | 'editor' | 'rig' | 'restore';
export interface SheetBus {
  get(): LoadedSheet;
  set(sheet: LoadedSheet, origin: SheetOrigin): void;
  subscribe(fn: (sheet: LoadedSheet, origin: SheetOrigin) => void): () => void;
  getRig(): Rig;
  setRig(rig: Rig, origin: RigOrigin): void;
  subscribeRig(fn: (rig: Rig, origin: RigOrigin) => void): () => void;
}

export function createSheetBus(initial: LoadedSheet, initialRig: Rig = DEFAULT_RIG): SheetBus {
  let sheet = initial, rig = initialRig;
  const fns = new Set<(s: LoadedSheet, o: SheetOrigin) => void>();
  const rigFns = new Set<(r: Rig, o: RigOrigin) => void>();
  return {
    get: () => sheet,
    set(s, origin) { sheet = s; for (const f of [...fns]) f(s, origin); },
    subscribe(fn) { fns.add(fn); return () => fns.delete(fn); },
    getRig: () => rig,
    setRig(r, origin) { rig = r; for (const f of [...rigFns]) f(r, origin); },
    subscribeRig(fn) { rigFns.add(fn); return () => rigFns.delete(fn); },
  };
}
