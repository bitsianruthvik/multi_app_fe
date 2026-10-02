import type { StructureNode } from '../../api/types';

/**
 * A selection row's item, as the Structure grid shows it on the row itself
 * (init.sql §42, 2026-10-02):
 *   choose  still the selection — nobody (and nothing) has picked its item: an amber "Choose item ▾"
 *   auto    the SYSTEM picked it (the selection's default, or its only candidate): "default · change"
 *   chosen  a person picked it: a quiet "Change"
 *   null    not a selection row — or a cut plate's raw plate, which NESTING chooses
 *           (never "to choose" on the structure; processService's underCutPlate rule)
 */
export type ChoiceState = 'choose' | 'auto' | 'chosen' | null;

export function choiceState(node: StructureNode): ChoiceState {
  if (!node.selection || node.underCutPlate || node.lineId == null) return null;
  if (!node.resolved) return 'choose';
  return node.autoChosen ? 'auto' : 'chosen';
}

/** One row still to choose: where it is, and the rows above it (opened before a jump, so a folded branch is reached). */
export interface ChoiceTarget { key: string; lineId: number; ancestors: string[] }

/** Every row a person still has to choose, in the order the tree draws them. */
export function unchosenTargets(root: StructureNode): ChoiceTarget[] {
  const out: ChoiceTarget[] = [];
  const walk = (n: StructureNode, above: string[]) => {
    if (choiceState(n) === 'choose' && n.lineId != null) out.push({ key: n.key, lineId: n.lineId, ancestors: above });
    for (const k of n.children) walk(k, [...above, n.key]);
  };
  walk(root, []);
  return out;
}

/** The next one after the last jumped to; wraps round. -1 when there is nothing to choose. */
export function nextTarget(count: number, at: number): number {
  if (count <= 0) return -1;
  return (at + 1) % count;
}

export const CHOICE_TEXT = {
  choose: 'Choose item',
  auto: 'default · change',
  chosen: 'Change',
  autoWhy: 'Chosen automatically — the selection’s default (or its only candidate). Click to choose another.',
  chooseWhy: 'This selection has no item yet. Click to choose one.',
} as const;
