/*
 * Getting a model ready to draw, without freezing the page (lib/model3dPrep.ts): once per model object on this page;
 * across reloads from the browser's store (model3dStore.ts); otherwise built in a Web Worker
 * (model3dPrep.worker.ts). Where a worker cannot start, it is built here a slice at a time with a pause between slices.
 */
import type { Model3D } from '../api/drawings';
import { hashModel, prepareSteps, type PreparedModel } from './model3dPrep';
import { keepPrepared, readPrepared } from './model3dStore';

type Progress = (fraction: number) => void;
interface Job { promise: Promise<PreparedModel>; listeners: Set<Progress>; last: number }
const jobs = new WeakMap<object, Job>();
const ready = new WeakMap<object, PreparedModel>();

let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<number, { resolve: (p: PreparedModel) => void; reject: (e: Error) => void; progress: Progress }>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    if (typeof Worker === 'undefined') { worker = null; return worker; }
    worker = new Worker(new URL('./model3dPrep.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<{ id: number; progress?: number; prepared?: PreparedModel; error?: string }>) => {
      const p = pending.get(ev.data.id);
      if (!p) return;
      if (ev.data.prepared) { pending.delete(ev.data.id); p.resolve(ev.data.prepared); }
      else if (ev.data.error) { pending.delete(ev.data.id); p.reject(new Error(ev.data.error)); }
      else if (typeof ev.data.progress === 'number') p.progress(ev.data.progress);
    };
    worker.onerror = () => {
      // The worker could not run: every model it had is built here instead.
      const w = worker; worker = null; w?.terminate();
      for (const [id, p] of pending) { pending.delete(id); p.reject(new Error('worker failed')); }
    };
  } catch { worker = null; }
  return worker;
}

function inWorker(model: Model3D, progress: Progress): Promise<PreparedModel> {
  const w = getWorker();
  if (!w) return Promise.reject(new Error('no worker'));
  const id = nextId++;
  return new Promise<PreparedModel>((resolve, reject) => {
    pending.set(id, { resolve, reject, progress });
    // Only what is drawn goes over (the notes, levels and bolts stay here).
    try { w.postMessage({ id, model: { elements: model.elements } }); } catch (e) { pending.delete(id); reject(e as Error); }
  });
}

const pause = () => new Promise<void>((r) => setTimeout(r, 0));

async function onPage(model: Model3D, progress: Progress): Promise<PreparedModel> {
  const hash = hashModel(model);
  const kept = await readPrepared(hash);
  if (kept) return kept;
  const it = prepareSteps(model, hash, 250);
  let r = it.next();
  while (!r.done) { progress(r.value); await pause(); r = it.next(); }
  void keepPrepared(r.value);
  return r.value;
}

/** The model ready to draw. `onProgress` hears 0…1 while it is built. */
export function prepared(model: Model3D, onProgress?: Progress): Promise<PreparedModel> {
  let job = jobs.get(model);
  if (!job) {
    const listeners = new Set<Progress>();
    const j: Job = { listeners, last: 0, promise: Promise.resolve(null as unknown as PreparedModel) };
    const progress: Progress = (f) => { j.last = f; for (const l of listeners) l(f); };
    j.promise = inWorker(model, progress).catch(() => onPage(model, progress));
    j.promise.then((p) => { ready.set(model, p); }, () => { jobs.delete(model); });
    jobs.set(model, j);
    job = j;
  }
  if (onProgress) { job.listeners.add(onProgress); onProgress(job.last); void job.promise.finally(() => job?.listeners.delete(onProgress)).catch(() => {}); }
  return job.promise;
}

/** Already ready on this page (no wait at all)? */
export const preparedNow = (model: Model3D | null): PreparedModel | null => (model && ready.get(model)) ?? null;
