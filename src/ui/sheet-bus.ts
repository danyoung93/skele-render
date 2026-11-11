/** The current sheet, shared by the Animate and Edit sheet modes. */
import type { LoadedSheet } from '../sheet/load';

export type SheetOrigin = 'animate' | 'editor';
export interface SheetBus {
  get(): LoadedSheet;
  set(sheet: LoadedSheet, origin: SheetOrigin): void;
  subscribe(fn: (sheet: LoadedSheet, origin: SheetOrigin) => void): () => void;
}

export function createSheetBus(initial: LoadedSheet): SheetBus {
  let sheet = initial;
  const fns = new Set<(s: LoadedSheet, o: SheetOrigin) => void>();
  return {
    get: () => sheet,
    set(s, origin) { sheet = s; for (const f of [...fns]) f(s, origin); },
    subscribe(fn) { fns.add(fn); return () => fns.delete(fn); },
  };
}
