/**
 * "Finish selected" on the Tracker (2026-10-31) — POST /production-steps/finish, for catching up and go-live data
 * entry. The server takes at most FINISH_BATCH steps a request and finishes them in the order their waits allow
 * (stepBatchService). A bigger selection (a 9 m girder releases ~615 steps) is sent in parts, in the order the list
 * shows them; a step refused only because it waited on a step of a LATER part is sent again once that part is done,
 * for as long as a round finishes something.
 */

/** The server's cap on one request (stepBatchService.MAX_BATCH_STEPS). */
export const FINISH_BATCH = 200;
/** Rounds of "send again what waited on a later part" before giving up. */
const MAX_ROUNDS = 6;

export interface FinishDone { stepId: number; label: string; good: number; wave: number }
export interface FinishRefused { stepId: number; label: string | null; reason: string }
export interface FinishAnswer { done: FinishDone[]; refused: FinishRefused[]; waves: number; message: string }
export interface FinishOutcome { done: FinishDone[]; refused: FinishRefused[]; requests: number }

/** A refusal that may go away once other steps of the selection are done. */
export const waitsOnOthers = (r: FinishRefused) => /^It cannot start yet\./.test(r.reason);

/**
 * Sends the steps in parts of FINISH_BATCH and gathers the answers. `post` is the request (injected for tests);
 * `onProgress(doneSoFar, total)` after each part.
 */
export async function finishInParts(
  stepIds: number[],
  post: (ids: number[]) => Promise<FinishAnswer>,
  onProgress?: (done: number, total: number) => void,
): Promise<FinishOutcome> {
  const ids = [...new Set(stepIds)];
  const done: FinishDone[] = [];
  let refused: FinishRefused[] = [];
  let queue = ids;
  let requests = 0;
  for (let round = 0; round < MAX_ROUNDS && queue.length; round += 1) {
    const before = done.length;
    const again: FinishRefused[] = [];
    for (let i = 0; i < queue.length; i += FINISH_BATCH) {
      const out = await post(queue.slice(i, i + FINISH_BATCH));
      requests += 1;
      done.push(...out.done);
      for (const r of out.refused) (waitsOnOthers(r) ? again : refused).push(r);
      onProgress?.(done.length, ids.length);
    }
    // Nothing more finished this round, or a single part held everything: what still waits waits on something else.
    if (done.length === before || queue.length <= FINISH_BATCH) { refused = [...refused, ...again]; queue = []; break; }
    queue = again.map((r) => r.stepId);
    if (round === MAX_ROUNDS - 1) refused = [...refused, ...again];
  }
  const order = new Map(ids.map((id, i) => [id, i]));
  refused.sort((a, b) => (order.get(a.stepId) ?? 0) - (order.get(b.stepId) ?? 0));
  return { done, refused, requests };
}

/** "Finished 612 steps. 3 were not — each says why." */
export function finishSentence(o: FinishOutcome): string {
  const n = o.done.length;
  const head = n ? `Finished ${n} step${n === 1 ? '' : 's'}.` : 'No step was finished.';
  return o.refused.length ? `${head} ${o.refused.length} ${o.refused.length === 1 ? 'was' : 'were'} not — each says why.` : head;
}
