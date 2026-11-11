/** Autosave in IndexedDB (sheet editor spec §4.3). */
import { PART_IDS } from '../sheet/layout';
import type { EditorDoc } from './model';

export const DB_NAME = 'character-rig';
export const STORE = 'editor';

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((ok, err) => { r.onsuccess = () => ok(r.result); r.onerror = () => err(r.error); });
}
async function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => Promise<T>): Promise<T> {
  const open = indexedDB.open(DB_NAME, 1);
  open.onupgradeneeded = () => open.result.createObjectStore(STORE);
  const db = await req(open);
  try {
    const tx = db.transaction(STORE, mode);
    const out = await fn(tx.objectStore(STORE));
    await new Promise<void>((ok, err) => { tx.oncomplete = () => ok(); tx.onerror = () => err(tx.error); tx.onabort = () => err(tx.error); });
    return out;
  } finally { db.close(); }
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
  await withStore('readwrite', (s) => req(s.put(JSON.parse(JSON.stringify(doc)), 'doc')));
}

/** Stored as bytes + type: Blob support in IndexedDB varies between engines. */
export async function saveReference(blob: Blob | null): Promise<void> {
  const value = blob ? { type: blob.type, data: await blob.arrayBuffer() } : null;
  await withStore('readwrite', async (s) => {
    if (value) await req(s.put(value, 'reference'));
    else await req(s.delete('reference'));
  });
}

export async function loadSaved(): Promise<{ doc: EditorDoc | null; reference: Blob | null; corrupt: boolean }> {
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
