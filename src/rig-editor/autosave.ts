/** Rig autosave and remembered sheet/rig pairs (rig editor spec §4.3–4.4). */
import { loadKey, persistenceAvailable, saveKey, stashKey } from '../editor/persist';
import type { ReferenceState } from '../editor/model';
import { rigsEqual, validateRig, type Rig } from '../rig/rig-file';
import type { AppBanner } from '../ui/app';
import type { SheetBus } from '../ui/sheet-bus';
import type { RigStore } from './store';

interface RigView { reference: ReferenceState; characterOpacity: number }
const AUTOSAVE_MS = 500;

function validateView(x: unknown): RigView | null {
  const v = x as RigView | null;
  const r = v?.reference as unknown as Record<string, unknown> | undefined;
  const num = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
  if (!v || !r || !['x', 'y', 'scale', 'opacity'].every((k) => num(r[k])) || typeof r.locked !== 'boolean' || typeof r.hasImage !== 'boolean' || !num(v.characterOpacity)) return null;
  return v;
}
function validatePairings(x: unknown): Record<string, Rig> | null {
  if (!x || typeof x !== 'object') return null;
  const out: Record<string, Rig> = {};
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) { const r = validateRig(v); if (r) out[k] = r; }
  return out;
}

export async function startRigAutosave(store: RigStore, bus: SheetBus, banner: AppBanner, onOff: () => void) {
  let pairings: Record<string, Rig> = {};
  const on = await persistenceAvailable();
  if (on) {
    try {
      const rig = await loadKey('rig', validateRig);
      if (rig) bus.setRig(rig, 'restore');
      const view = await loadKey('rig-view', validateView);
      if (view) { store.reset({ rig: bus.getRig(), reference: view.reference }); store.set({ characterOpacity: view.characterOpacity }); }
      pairings = (await loadKey('pairings', validatePairings)) ?? {};
    } catch { /* fall back to defaults */ }
  }

  // Remembered pairs: offer the remembered rig when a sheet is loaded from a file.
  const remember = () => { pairings = { ...pairings, [bus.get().name]: bus.getRig() }; schedule('pairings'); };
  let offerFor: string | null = null;
  bus.subscribe((sheet, origin) => {
    if (offerFor !== null && sheet.name !== offerFor) { banner.hide(); offerFor = null; }
    const known = pairings[sheet.name];
    if (origin === 'animate' && known && !rigsEqual(known, bus.getRig())) {
      const name = sheet.name;
      offerFor = name;
      const stillCurrent = () => bus.get().name === name;
      banner.show(`This sheet was last used with the rig ${known.name}.`, 'info', [
        { id: 'pair-use', label: 'Use it', run: () => { offerFor = null; if (stillCurrent()) bus.setRig(known, 'animate'); } },
        { id: 'pair-keep', label: 'Keep current rig', run: () => { offerFor = null; if (stillCurrent()) remember(); } },
      ]);
      return;
    }
    remember();
  });
  bus.subscribeRig(() => remember());

  if (!on) { onOff(); return; }
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const value = (key: string): unknown =>
    key === 'rig' ? bus.getRig()
      : key === 'rig-view' ? { reference: store.doc().reference, characterOpacity: store.get().characterOpacity }
        : pairings;
  function schedule(key: string) {
    if (timers.has(key)) clearTimeout(timers.get(key)!);
    timers.set(key, setTimeout(() => { timers.delete(key); saveKey(key, value(key)).catch(() => {}); }, AUTOSAVE_MS));
  }
  bus.subscribeRig(() => schedule('rig'));
  store.onDoc(() => schedule('rig-view'));
  let lastOpacity = store.get().characterOpacity;
  store.subscribe(() => { if (store.get().characterOpacity !== lastOpacity) { lastOpacity = store.get().characterOpacity; schedule('rig-view'); } });
  // Unload: stash pending records synchronously (IndexedDB writes can't finish during unload).
  const flush = () => {
    for (const key of [...timers.keys()]) { clearTimeout(timers.get(key)!); timers.delete(key); stashKey(key, value(key)); saveKey(key, value(key)).catch(() => {}); }
  };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
}
