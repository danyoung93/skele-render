/** Autosave in IndexedDB (sheet editor spec §4.3). */
import { PART_IDS } from '../sheet/layout';
import type { EditorDoc } from './model';

export const DB_NAME = 'character-rig';
export const STORE = 'editor';

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((ok, err) => { r.onsuccess = () => ok(r.result); r.onerror = () => err(r.error); });
}
/**
 * One connection, opened once and reused: when it is already open, a write is issued synchronously,
 * so a save started from a `pagehide` handler reaches the database before the page goes away.
 */
let db: IDBDatabase | null = null;
async function connection(): Promise<IDBDatabase> {
  if (db) return db;
  const open = indexedDB.open(DB_NAME, 1);
  open.onupgradeneeded = () => open.result.createObjectStore(STORE);
  const d = await req(open);
  // Let other tabs (or a reset) upgrade or delete the database.
  d.onversionchange = () => { d.close(); if (db === d) db = null; };
  d.onclose = () => { if (db === d) db = null; };
  db = d;
  return d;
}
async function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => Promise<T>): Promise<T> {
  const d = db ?? (await connection());
  const tx = d.transaction(STORE, mode);
  const done = new Promise<void>((ok, err) => { tx.oncomplete = () => ok(); tx.onerror = () => err(tx.error); tx.onabort = () => err(tx.error); });
  const out = await fn(tx.objectStore(STORE));
  await done;
  return out;
}

export async function persistenceAvailable(): Promise<boolean> {
  try { await withStore('readonly', async () => undefined); return true; } catch { return false; }
}

const isNum = (v: unknown) => typeof v === 'number' && isFinite(v);
const isVec = (v: unknown) => Array.isArray(v) && v.length === 2 && v.every(isNum);
const isPaint = (p: unknown) => p === null || (typeof p === 'object' && typeof (p as { color: unknown }).color === 'string' && isNum((p as { opacity: unknown }).opacity));

function validShape(s: unknown): boolean {
  if (!s || typeof s !== 'object') return false;
  const o = s as Record<string, unknown>;
  const st = o.style as Record<string, unknown> | undefined;
  if (typeof o.id !== 'string' || !isNum(o.rotation) || !st || !isPaint(st.fill) || !isPaint(st.stroke) || !isNum(st.strokeWidth)) return false;
  switch (o.kind) {
    case 'ellipse': return ['cx', 'cy', 'rx', 'ry'].every((k) => isNum(o[k]));
    case 'rect': return ['x', 'y', 'w', 'h', 'r'].every((k) => isNum(o[k]));
    case 'path': return typeof o.closed === 'boolean' && Array.isArray(o.nodes) &&
      (o.nodes as Record<string, unknown>[]).every((n) => n && isVec(n.p) && isVec(n.in) && isVec(n.out));
    default: return false;
  }
}

export function validateDoc(x: unknown): EditorDoc | null {
  if (!x || typeof x !== 'object') return null;
  const d = x as Record<string, unknown>;
  const parts = d.parts as Record<string, unknown> | undefined;
  const ref = d.reference as Record<string, unknown> | undefined;
  if (d.version !== 1 || typeof d.name !== 'string' || !isNum(d.nextId) || !parts || !ref) return null;
  if (!PART_IDS.every((p) => Array.isArray(parts[p]) && (parts[p] as unknown[]).every(validShape))) return null;
  if (!['x', 'y', 'scale', 'opacity'].every((k) => isNum(ref[k])) || typeof ref.locked !== 'boolean' || typeof ref.hasImage !== 'boolean') return null;
  return x as EditorDoc;
}

export async function saveDoc(doc: EditorDoc): Promise<void> {
  const d = db ?? (await connection());
  // Issue the write and request an immediate commit synchronously, so a save started while the page
  // is unloading is committed rather than abandoned with the page.
  const tx = d.transaction(STORE, 'readwrite');
  const done = new Promise<void>((ok, err) => { tx.oncomplete = () => ok(); tx.onerror = () => err(tx.error); tx.onabort = () => err(tx.error); });
  tx.objectStore(STORE).put(JSON.parse(JSON.stringify(doc)), 'doc');
  tx.commit?.();
  await done;
  // Saved for real: an older unload stash must not override this on the next load.
  try { localStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
}

/** Stored as bytes + type: Blob support in IndexedDB varies between engines. */
export async function saveReference(blob: Blob | null): Promise<void> {
  const value = blob ? { type: blob.type, data: await blob.arrayBuffer() } : null;
  await withStore('readwrite', async (s) => {
    if (value) await req(s.put(value, 'reference'));
    else await req(s.delete('reference'));
  });
}

/**
 * IndexedDB writes can't complete while a page unloads (its connections are force-closed), so the
 * document is also stashed synchronously in localStorage on pagehide. The stash wins on the next load.
 */
export const PENDING_KEY = 'character-rig:pending-doc';
export function stashPending(doc: EditorDoc): void {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(doc)); } catch { /* storage full or blocked */ }
}
function takePending(): EditorDoc | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (raw === null) return null;
    localStorage.removeItem(PENDING_KEY);
    return validateDoc(JSON.parse(raw));
  } catch { return null; }
}

export async function loadSaved(): Promise<{ doc: EditorDoc | null; reference: Blob | null; corrupt: boolean }> {
  const pending = takePending();
  if (pending) await saveDoc(pending);
  return withStore('readwrite', async (s) => {
    const raw = await req(s.get('doc'));
    const refRaw = (await req(s.get('reference'))) as { type: string; data: ArrayBuffer } | undefined;
    const reference = refRaw ? new Blob([refRaw.data], { type: refRaw.type }) : null;
    if (raw === undefined) return { doc: null, reference, corrupt: false };
    const doc = validateDoc(raw);
    if (doc) return { doc, reference, corrupt: false };
    await req(s.put(raw, `doc-corrupt-${Date.now()}`));
    await req(s.delete('doc'));
    return { doc: null, reference, corrupt: true };
  });
}

/** Generic records (rig, rig view, pairings) with the same unload stash as the document. */
const stashName = (key: string) => `character-rig:pending-${key}`;
export function stashKey(key: string, value: unknown): void {
  try { localStorage.setItem(stashName(key), JSON.stringify(value)); } catch { /* storage full or blocked */ }
}
export async function saveKey(key: string, value: unknown): Promise<void> {
  const d = db ?? (await connection());
  const tx = d.transaction(STORE, 'readwrite');
  const done = new Promise<void>((ok, err) => { tx.oncomplete = () => ok(); tx.onerror = () => err(tx.error); tx.onabort = () => err(tx.error); });
  tx.objectStore(STORE).put(JSON.parse(JSON.stringify(value)), key);
  tx.commit?.();
  await done;
  try { localStorage.removeItem(stashName(key)); } catch { /* ignore */ }
}
/** Loads a record, preferring an unload stash (which is then written back and cleared). */
export async function loadKey<T>(key: string, validate: (x: unknown) => T | null): Promise<T | null> {
  let stashed: unknown = undefined;
  try {
    const raw = localStorage.getItem(stashName(key));
    if (raw !== null) { localStorage.removeItem(stashName(key)); stashed = JSON.parse(raw); }
  } catch { /* ignore */ }
  if (stashed !== undefined) {
    const v = validate(stashed);
    if (v !== null) { await saveKey(key, v); return v; }
  }
  const raw = await withStore('readonly', (s) => req(s.get(key)));
  return raw === undefined ? null : validate(raw);
}
