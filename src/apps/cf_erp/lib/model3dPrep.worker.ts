/*
 * The 3D view's builder, off the page's thread (lib/model3dPrep.ts): it fingerprints the model, reads the built copy
 * from the browser's store when there is one, else builds it (saying how far it is) and keeps it.
 *   in:  { id, model: { elements } }
 *   out: { id, progress } … then { id, prepared } or { id, error }
 */
import { hashModel, prepareSteps, transferables } from './model3dPrep';
import { readPrepared, keepPrepared } from './model3dStore';
import type { Model3DElement } from '../api/drawings';

const ctx = self as unknown as { postMessage: (m: unknown, t?: Transferable[]) => void; onmessage: ((ev: MessageEvent) => void) | null };

ctx.onmessage = async (ev: MessageEvent<{ id: number; model: { elements: Model3DElement[] } }>) => {
  const { id, model } = ev.data;
  try {
    const hash = hashModel(model);
    const kept = await readPrepared(hash);
    if (kept) { ctx.postMessage({ id, prepared: kept, fromStore: true }, transferables(kept)); return; }
    const it = prepareSteps(model, hash, 500);
    let r = it.next();
    while (!r.done) { ctx.postMessage({ id, progress: r.value }); r = it.next(); }
    const prepared = r.value;
    await keepPrepared(prepared);
    ctx.postMessage({ id, prepared }, transferables(prepared));
  } catch (e) {
    ctx.postMessage({ id, error: String((e as Error)?.message ?? e) });
  }
};
