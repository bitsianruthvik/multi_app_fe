import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { cfApi, CfApiError } from '../../api/client';
import type { Resolution } from '../../api/types';
import { specsToFill } from './bomModel';

/**
 * The specification values of every node of a BOM, read once and kept.
 *
 * There is no bulk endpoint: `GET /records/:id/specs` answers for one record,
 * and the answer is the resolution — which rules reach it, what each value is
 * and which of them are still empty. A bridge is ~120 nodes, so the tree asks
 * for all of them the moment it opens, a few at a time, and draws each badge as
 * its answer lands. That is the whole point of the column: the gaps have to be
 * visible without opening anything.
 *
 * Answers are cached per record id, so the same catalog item under six parents
 * is one request, and a save folds the fresh resolution the write returns back
 * into the cache instead of reading it again.
 */

/** How many `/specs` reads are in the air at once. Enough to be quick, few enough to be polite. */
const LANES = 5;
/** Past this, the sweep waits to be asked for — a structure this size is not what it was built for. */
const AUTO_SCAN_LIMIT = 300;
/** Answers arrive one by one; the tree redraws on a timer instead of 120 times. */
const FLUSH_MS = 120;

export interface NodeValues {
  resolution: Resolution | null;
  /** Required, typed-in-here and still empty — the values that stop the record being activated. */
  missing: string[];
  /** How many of its specifications can be typed in at all. */
  fillable: number;
  error: CfApiError | null;
  /**
   * Something saved elsewhere can have moved this one's computed values, so it
   * is read again when it is opened. Never its badge: whether a required value
   * is missing depends on typed values alone, and `materialize` never touches
   * those — which is why a save does not cost a sweep of the whole tree.
   */
  stale: boolean;
  /** It rolls something up, or inherits it — the only two rules another record's save can move. */
  computed: boolean;
}

function entryOf(r: Resolution): NodeValues {
  return {
    resolution: r,
    missing: r.missingRequired.map((m) => m.code),
    fillable: specsToFill(r).length,
    error: null,
    stale: false,
    computed: r.specs.some((s) => s.applicable && ['rollup', 'inherited'].includes(s.rule.valueRule)),
  };
}

export interface SpecValues {
  get: (recordId: number) => NodeValues | undefined;
  /** How far the sweep has got — shown while it runs. */
  done: number;
  total: number;
  scanning: boolean;
  /** The structure is too big to sweep unasked; `start` asks for it. */
  tooMany: boolean;
  start: () => void;
  /** Take the resolution a save handed back, and mark every other node's computed values as stale. */
  applySaved: (recordId: number, r: Resolution) => void;
  /** Read one record again — after a save elsewhere moved what it rolls up. */
  refresh: (recordId: number) => Promise<void>;
}

export function useSpecValues(recordIds: number[], enabled = true): SpecValues {
  const key = recordIds.join(',');
  // The caller rebuilds the list every render; the ids themselves say when it changed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const wanted = useMemo(() => [...new Set(recordIds)], [key]);

  const cache = useRef(new Map<number, NodeValues>());
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const [scanning, setScanning] = useState(false);
  const [asked, setAsked] = useState(false);
  const timer = useRef<number | null>(null);

  // Answers land one at a time; the tree is redrawn on a timer so a sweep of
  // 120 records is a handful of renders rather than 120.
  const schedule = useCallback(() => {
    if (timer.current != null) return;
    timer.current = window.setTimeout(() => { timer.current = null; redraw(); }, FLUSH_MS);
  }, []);
  useEffect(() => () => { if (timer.current != null) window.clearTimeout(timer.current); }, []);

  const read = useCallback(async (id: number) => {
    try {
      cache.current.set(id, entryOf(await cfApi.get<Resolution>(`/records/${id}/specs`)));
    } catch (e) {
      cache.current.set(id, { resolution: null, missing: [], fillable: 0, error: e as CfApiError, stale: false, computed: false });
    }
    schedule();
  }, [schedule]);

  const tooMany = wanted.length > AUTO_SCAN_LIMIT && !asked;

  useEffect(() => {
    // A sweep that is replaced mid-flight never reaches its own `finally`, so
    // every path out of here has to put the flag down itself.
    if (!enabled || tooMany) { setScanning(false); return undefined; }
    const todo = wanted.filter((id) => !cache.current.has(id));
    if (!todo.length) { setScanning(false); return undefined; }
    let alive = true;
    setScanning(true);
    let next = 0;
    const lane = async () => {
      for (let i = next++; alive && i < todo.length; i = next++) await read(todo[i]);
    };
    void Promise.all(Array.from({ length: Math.min(LANES, todo.length) }, lane))
      .finally(() => { if (alive) { setScanning(false); redraw(); } });
    return () => { alive = false; };
  }, [wanted, enabled, tooMany, read]);

  const applySaved = useCallback((id: number, r: Resolution) => {
    for (const [other, entry] of cache.current) {
      if (other !== id && entry.computed) cache.current.set(other, { ...entry, stale: true });
    }
    cache.current.set(id, entryOf(r));
    redraw();
  }, []);

  // The old answer stays on screen while the new one is fetched — a jump between
  // nodes must not flash a skeleton — and the flag is cleared first so a node
  // that is being looked at does not ask for itself again on every render.
  const refresh = useCallback(async (id: number) => {
    const had = cache.current.get(id);
    if (had) cache.current.set(id, { ...had, stale: false });
    await read(id);
  }, [read]);

  const done = wanted.filter((id) => cache.current.has(id)).length;
  return {
    get: (id: number) => cache.current.get(id),
    done,
    total: wanted.length,
    scanning,
    tooMany,
    start: () => setAsked(true),
    applySaved,
    refresh,
  };
}
