/*
 * The browser's own copy of built 3D models (IndexedDB "cf-erp-3d"), keyed by the model's fingerprint
 * (lib/model3dPrep.ts hashModel): a model opened again — after a reload too — is drawn without building it again.
 * Only the last few are kept. Every failure (private window, storage off, quota) is quiet: the model is just built.
 */
import { PREP_VERSION, type PreparedModel } from './model3dPrep';

const DB = 'cf-erp-3d';
const STORE = 'prepared';
/** fingerprint → when it was last used (so the store is pruned without reading the models) */
const META = 'meta';
const KEEP = 6;

let opened: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  if (opened) return opened;
  opened = new Promise<IDBDatabase | null>((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        for (const s of [STORE, META]) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return opened;
}

const done = <T>(req: IDBRequest<T>) => new Promise<T | null>((resolve) => { req.onsuccess = () => resolve(req.result); req.onerror = () => resolve(null); });

export async function readPrepared(hash: string): Promise<PreparedModel | null> {
  try {
    const d = await db(); if (!d) return null;
    const p = await done(d.transaction(STORE, 'readonly').objectStore(STORE).get(hash)) as PreparedModel | null;
    if (!p || p.version !== PREP_VERSION || p.hash !== hash || !(p.elMat instanceof Float32Array)) return null;
    // Touch it, so the most used stay.
    try { d.transaction(META, 'readwrite').objectStore(META).put(Date.now(), hash); } catch { /* fine */ }
    return { ...p, buildMs: 0 };
  } catch { return null; }
}

/** Keep a built model. The copy is taken before this returns (the caller may then hand its buffers away); it is saved after. */
export async function keepPrepared(p: PreparedModel): Promise<void> {
  try {
    const d = await db(); if (!d) return;
    const tx = d.transaction([STORE, META], 'readwrite');
    tx.objectStore(STORE).put(p, p.hash);
    tx.objectStore(META).put(Date.now(), p.hash);
    tx.oncomplete = () => { prune(d); };
  } catch { /* not kept: built again next time */ }
}

function prune(d: IDBDatabase) {
  try {
    const tx = d.transaction([STORE, META], 'readwrite');
    const meta = tx.objectStore(META); const rows: { key: IDBValidKey; at: number }[] = [];
    const cur = meta.openCursor();
    cur.onsuccess = () => {
      const c = cur.result;
      if (c) { rows.push({ key: c.key, at: Number(c.value) || 0 }); c.continue(); return; }
      rows.sort((a, b) => b.at - a.at);
      for (const r of rows.slice(KEEP)) { meta.delete(r.key); tx.objectStore(STORE).delete(r.key); }
    };
  } catch { /* fine */ }
}
