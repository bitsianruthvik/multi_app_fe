/**
 * Moving an org unit — the pure parts (CF_HRMS_HIRING_SPEC.md §34.3, §40.4), kept out of the
 * React files so a node script can test them (multi_app_fe/scripts/cf_hrms_org_move_test.mjs):
 *
 *   zoneOf          where a pointer falls on a row: before / onto / after
 *   planDrop        what a drop means: nothing, a reorder among siblings, or a move to confirm
 *   switchChoiceText the "switch" answer of the keep-or-switch question, in plain words
 */
import type { MoveCheck, PosRef } from '../api/organisation';
import { posLine } from './unitReportingText';

export type DropZone = 'before' | 'after' | 'inside';
export interface UnitDrop {
  unitId: number;
  targetId: number;
  zone: DropZone;
}

/** A move the screen is asking about: the unit, where to, and (between siblings) the place. */
export interface PendingMove {
  unitId: number;
  parentId: number | null;
  sortOrder?: number;
  /**
   * Spec §40.4: a unit whose Reports into was CHOSEN — keep that position, or switch to the
   * default. Set by the confirm; a DEFAULT Reports into follows the new parent by itself.
   */
  reportsInto?: 'KEEP' | 'SWITCH';
}

/** Where a pointer at clientY falls on a row: its top or bottom quarter is "between", the middle "onto". */
export function zoneOf(clientY: number, rect: { top: number; height: number }): DropZone {
  const y = clientY - rect.top;
  if (y < rect.height * 0.25) return 'before';
  if (y > rect.height * 0.75) return 'after';
  return 'inside';
}

interface UnitRow { id: number; parentId?: number | null; sortOrder?: number | null }

export type DropPlan =
  | { kind: 'none'; why: string }
  | { kind: 'confirm'; move: PendingMove }
  | { kind: 'reorder'; parentId: number | null; before: number[]; after: number[] };

/**
 * What a drop means. `rows` are every unit in the list's order. `busy` = a move is already being
 * confirmed: a second drop then does nothing (it must never replace the move the open dialog names).
 */
export function planDrop(drop: UnitDrop, rows: UnitRow[], { busy = false }: { busy?: boolean } = {}): DropPlan {
  if (busy) return { kind: 'none', why: 'a move is already being confirmed' };
  const unit = rows.find((r) => r.id === drop.unitId);
  const target = rows.find((r) => r.id === drop.targetId);
  if (!unit || !target) return { kind: 'none', why: 'unknown unit' };
  if (unit.id === target.id) return { kind: 'none', why: 'onto itself' };
  if (drop.zone === 'inside') {
    if (target.id === (unit.parentId ?? null)) return { kind: 'none', why: 'already there' };
    return { kind: 'confirm', move: { unitId: unit.id, parentId: target.id } };
  }
  const parentId = target.parentId ?? null;
  if (parentId === (unit.parentId ?? null)) {
    const before = rows.filter((r) => (r.parentId ?? null) === parentId).map((r) => r.id);
    const after = before.filter((id) => id !== unit.id);
    after.splice(after.indexOf(target.id) + (drop.zone === 'after' ? 1 : 0), 0, unit.id);
    if (after.join() === before.join()) return { kind: 'none', why: 'same order' };
    return { kind: 'reorder', parentId, before, after };
  }
  // Between two units of ANOTHER parent: a move to that parent, at that place.
  const place = (target.sortOrder || 0) + (drop.zone === 'after' ? 1 : 0);
  return { kind: 'confirm', move: { unitId: unit.id, parentId, sortOrder: place > 0 ? place : undefined } };
}

/**
 * The "switch" answer of the keep-or-switch question (§40.4). The default after a move is the
 * new parent's head — or, when the new parent has no head, the nearest head further up; the
 * words say which, so a grand-parent's head is never called "the new parent's head".
 */
export function switchChoiceText(ri: NonNullable<MoveCheck['reportsInto']>, line: (p: PosRef) => string = posLine): string {
  const parent = ri.newParent ?? null;
  const from = ri.afterMoveFrom ?? null;
  if (!ri.afterMove) {
    return `Switch to the default — nobody for now${parent ? ` (no unit from ${parent.name} up has a head yet)` : ''}`;
  }
  if (parent && from && from.id === parent.id) return `Switch to ${parent.name}’s head — ${line(ri.afterMove)}`;
  const why = parent && !parent.hasHead ? ` (${parent.name} has no head yet)` : '';
  return `Switch to the default — ${line(ri.afterMove)}, the nearest head above${from ? `, in ${from.name}` : ''}${why}`;
}
