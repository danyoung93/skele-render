import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { saveDoc, saveReference, loadSaved, validateDoc, persistenceAvailable, DB_NAME, STORE } from '../../../src/editor/persist';

function req<T>(r: IDBRequest<T>): Promise<T> { return new Promise((ok, err) => { r.onsuccess = () => ok(r.result); r.onerror = () => err(r.error); }); }
async function rawStore(mode: IDBTransactionMode) {
  const open = indexedDB.open(DB_NAME, 1);
  open.onupgradeneeded = () => open.result.createObjectStore(STORE);
  const db = await req(open);
  return { store: db.transaction(STORE, mode).objectStore(STORE), db };
}
const _putRaw = async (k: string, v: unknown) => { const { store, db } = await rawStore('readwrite'); await req(store.put(v, k)); db.close(); };
const _rawKeys = async () => { const { store, db } = await rawStore('readonly'); const k = (await req(store.getAllKeys())).map(String); db.close(); return k; };
const _resetForTests = async () => { await req(indexedDB.deleteDatabase(DB_NAME) as unknown as IDBRequest<unknown>); };
import { fixtureDoc } from './fixture-doc';

beforeEach(async () => { await _resetForTests(); });

describe('persistence', () => {
  it('is available', async () => expect(await persistenceAvailable()).toBe(true));
  it('round-trips the document and the reference image', async () => {
    const doc = fixtureDoc();
    await saveDoc(doc);
    await saveReference(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }));
    const r = await loadSaved();
    expect(r.doc).toEqual(doc);
    expect(r.corrupt).toBe(false);
    expect(r.reference!.type).toBe('image/png');
    expect(new Uint8Array(await r.reference!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });
  it('restore without reference blob', async () => {
    await saveDoc(fixtureDoc());
    const r = await loadSaved();
    expect(r.doc).not.toBeNull();
    expect(r.reference).toBeNull();
  });
  it('clearing the reference removes it', async () => {
    await saveReference(new Blob(['x']));
    await saveReference(null);
    expect((await loadSaved()).reference).toBeNull();
  });
  it('moves a bad document aside', async () => {
    await _putRaw('doc', { version: 2 });
    const r = await loadSaved();
    expect(r).toMatchObject({ doc: null, corrupt: true });
    const keys = await _rawKeys();
    expect(keys.some((k) => k.startsWith('doc-corrupt-'))).toBe(true);
    expect(keys).not.toContain('doc');
  });
  it('nothing saved gives an empty result', async () => {
    expect(await loadSaved()).toEqual({ doc: null, reference: null, corrupt: false });
  });
});

describe('validateDoc', () => {
  it('accepts a valid document and rejects bad ones', () => {
    const d = fixtureDoc();
    expect(validateDoc(JSON.parse(JSON.stringify(d)))).toEqual(d);
    expect(validateDoc({ ...d, version: 2 })).toBeNull();
    const bad = JSON.parse(JSON.stringify(d)); bad.parts.head[0].kind = 'star';
    expect(validateDoc(bad)).toBeNull();
    const missing = JSON.parse(JSON.stringify(d)); delete missing.parts.torso;
    expect(validateDoc(missing)).toBeNull();
    expect(validateDoc('nope')).toBeNull();
  });
});

import { stashPending, PENDING_KEY } from '../../../src/editor/persist';

describe('unload stash (review #9)', () => {
  it('a stashed document wins on the next load, is written to IndexedDB and is removed', async () => {
    const older = fixtureDoc();
    await saveDoc(older);
    const newer = { ...fixtureDoc(), name: 'newer' };
    stashPending(newer);
    expect(localStorage.getItem(PENDING_KEY)).not.toBeNull();
    const r = await loadSaved();
    expect(r.doc!.name).toBe('newer');
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
    expect((await loadSaved()).doc!.name).toBe('newer');
  });
  it('an invalid stash is ignored and removed', async () => {
    await saveDoc(fixtureDoc());
    localStorage.setItem(PENDING_KEY, '{"version":9}');
    expect((await loadSaved()).doc!.name).toBe('test-character');
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
  });
});
