import type { LockCheck, LockFlowRow, LockView } from '../api/lock';

/**
 * What a line still needs before its design can be frozen, said when the line is ADDED (demo, 2026-10-31: a standard
 * drawing's gaps showed only at the Freeze checklist). The facts are the Freeze checklist's own checks, read right
 * after the add from GET /order-lines/:id/lock (without the piece tree) — never inside the add's transaction. Pure.
 */
export interface ReadinessNeed {
  key: string;
  title: string;
  detail: string | null;
  todo: string | null;
  /** The stage where it is put right (null: the coding rules, under Setup). */
  stageKey: string | null;
  /** Does not hold the freeze — release asks for it. */
  warning: boolean;
  rows?: LockFlowRow[];
}

export interface LineReadiness {
  locked: boolean;
  canFreeze: boolean;
  /** How many needs hold the freeze. */
  blocking: number;
  needs: ReadinessNeed[];
  /** The check itself could not run — the line is added all the same. */
  error?: string;
}

/** The checks that fail, the execution plan left out (saving it is a later step, not a gap of the design). */
export function readinessOf(checks: LockCheck[], locked = false): LineReadiness {
  if (locked) return { locked: true, canFreeze: false, blocking: 0, needs: [] };
  const needs: ReadinessNeed[] = (checks ?? [])
    .filter((ch) => ch.applies !== false && !ch.ok && ch.key !== 'execution_plan')
    .map((ch) => ({
      key: ch.key, title: ch.title, detail: ch.detail ?? null, todo: ch.todo ?? null, stageKey: ch.stageKey ?? null,
      warning: !!ch.warning, ...(ch.rows ? { rows: ch.rows } : {}),
    }));
  const blocking = needs.filter((n) => !n.warning).length;
  return { locked: false, canFreeze: blocking === 0, blocking, needs };
}

export const readinessFromLock = (view: Pick<LockView, 'checks' | 'locked'>): LineReadiness => readinessOf(view.checks, !!view.locked);

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The banner's first sentence. */
export function readinessHeadline(r: LineReadiness, lineNo: number): string {
  if (r.error) return `Line ${lineNo} was added, but what it needs before the freeze could not be checked — the Freeze checklist will say.`;
  if (r.locked) return `Line ${lineNo} is frozen.`;
  const warnings = r.needs.length - r.blocking;
  if (r.blocking > 0) return `This line needs ${plural(r.blocking, 'thing')} settled before it can be frozen${warnings ? ` (and ${warnings === 1 ? 'one more' : `${warnings} more`} before release)` : ''}:`;
  if (warnings > 0) return `Line ${lineNo} can be frozen — release will ask for ${warnings === 1 ? 'one more thing' : `${warnings} more things`}:`;
  return `Line ${lineNo} can be frozen as it is.`;
}

/** Where a need is put right, in words — the tab a "Go to" button opens. */
export const readinessWhere = (n: ReadinessNeed): 'structure' | 'coding' => (n.stageKey == null && n.key === 'codes' ? 'coding' : 'structure');
