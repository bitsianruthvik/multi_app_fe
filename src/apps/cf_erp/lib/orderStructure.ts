import type { OrderStage, SalesOrderLine } from '../api/types';
import type { Family } from '../components/ui';

/**
 * Words and small rules for the Structure & values step (components/OrderStructure/OrderStructureStep.tsx), where
 * every line of a sales order is a group of one view (2026-10-18).
 */

/** Which line groups start open: every line while there are a few, else the first — a big order opens tidy. */
export const OPEN_ALL_UP_TO = 3;
export function openGroupsAtStart(lines: Pick<SalesOrderLine, 'id'>[]): Set<number> {
  return new Set((lines.length <= OPEN_ALL_UP_TO ? lines : lines.slice(0, 1)).map((l) => l.id));
}

const KEY = (orderId: number) => `cf_erp.so.groups.${orderId}`;

/**
 * The groups remembered open in this browser (a convenience only — storage that is blocked starts fresh). With
 * `knownOnly`, the lines that were there when it was remembered, so a line added since can open by itself.
 */
export function readOpenGroups(orderId: number, { knownOnly = false } = {}): Set<number> | null {
  try {
    const raw = window.localStorage.getItem(KEY(orderId));
    if (!raw) return null;
    const v = JSON.parse(raw) as { open?: number[]; known?: number[] };
    return new Set((knownOnly ? v.known : v.open) ?? []);
  } catch { return null; }
}

export function writeOpenGroups(orderId: number, open: Set<number>, known: number[]): void {
  try { window.localStorage.setItem(KEY(orderId), JSON.stringify({ open: [...open], known })); } catch { /* private window: not remembered */ }
}

/**
 * Why a line keeps its number when the lines are reordered (backend reorderLines refuses the same): frozen or
 * released (its pieces carry it), or it has cut pieces (their codes carry its line number). Null when it can move.
 */
export function fixedNumberWhy(line: Pick<SalesOrderLine, 'lineNo' | 'release' | 'structure'>, frozen: boolean): string | null {
  if (line.release) return `Line ${line.lineNo} is released, so its number stays.`;
  if (frozen) return `Line ${line.lineNo} is frozen, so its number stays.`;
  if ((line.structure?.cutPieces ?? 0) > 0) return `Line ${line.lineNo} cannot move: its cut pieces carry its line number.`;
  return null;
}

/** The short marks in a line's group header: frozen / released, rows, what is still to do. Plain words. */
export function lineGroupWords(line: Pick<SalesOrderLine, 'lineType' | 'release' | 'structure'> & { lock?: unknown }, stages: OrderStage[]):
  { family: Family; label: string; title?: string }[] {
  const out: { family: Family; label: string; title?: string }[] = [];
  const frozen = !!(line as { lock?: unknown }).lock;
  if (line.release) out.push({ family: 'info', label: 'Released', title: 'Released to production — its structure is fixed.' });
  else if (frozen) out.push({ family: 'info', label: 'Frozen', title: 'Its design is frozen: pieces have their codes. A change needs a revision.' });
  if (line.lineType === 'custom' && line.structure) {
    out.push({ family: 'neutral', label: `${line.structure.temporaryItems} ${line.structure.temporaryItems === 1 ? 'row' : 'rows'}` });
    if (line.structure.unresolvedSelections > 0) out.push({ family: 'warning', label: `${line.structure.unresolvedSelections} to choose`, title: 'Rows whose item is still to be chosen.' });
  }
  const values = stages.find((s) => s.stageKey === 'values');
  if (values && (values.state === 'todo' || values.state === 'partial')) {
    out.push({ family: 'danger', label: values.detail.split(' — ')[0], title: values.detail });
  }
  const structure = stages.find((s) => s.stageKey === 'structure');
  if (structure && structure.state !== 'done' && structure.state !== 'not_applicable' && !(line.structure?.unresolvedSelections)) {
    out.push({ family: 'warning', label: 'To finish', title: structure.detail });
  }
  return out;
}
