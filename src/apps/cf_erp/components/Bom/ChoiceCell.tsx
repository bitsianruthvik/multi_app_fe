import { definitionLabel } from '../../lib/displayCode';
import type { MouseEvent } from 'react';
import { Box } from '@mui/material';
import ArrowDropDownRounded from '@mui/icons-material/ArrowDropDownRounded';
import type { StructureNode } from '../../api/types';
import { CHOICE_TEXT, choiceState } from './selectionChoice';

/**
 * A selection row's item, ON THE ROW (beside its flow): amber like a missing
 * value while unchosen, a small "default · change" tag while the system's pick
 * stands, a quiet "Change" once a person chose. Clicking opens the candidate
 * list (ChooseItemDialog, with server search) and writes through the resolve
 * path. Read-only rows still say "Not chosen", so the gap is never hidden.
 */
export function ChoiceCell({ node, editable, why, onChoose }: {
  node: StructureNode;
  /** Whether this person may choose here (the row's BOM is theirs, nothing unsaved). */
  editable: boolean;
  /** Why it cannot be chosen from here, when it cannot. */
  why?: string;
  onChoose: (lineId: number) => void;
}) {
  const state = choiceState(node);
  if (!state || node.lineId == null) return null;
  const lineId = node.lineId;
  const name = (node.selection ? definitionLabel(node.selection) : node.name);
  const click = (e: MouseEvent) => { e.stopPropagation(); onChoose(lineId); };
  const stop = (e: MouseEvent) => e.stopPropagation();
  const base = {
    all: 'unset', boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', gap: 0.25, whiteSpace: 'nowrap',
    fontSize: 10.5, lineHeight: '16px', px: 0.75, borderRadius: 'var(--r-sm)', flexShrink: 0,
  } as const;

  if (state === 'choose') {
    return editable ? (
      <Box component="button" type="button" data-testid="choose-item" onClick={click} onMouseDown={stop} onDoubleClick={stop}
        aria-label={`Choose the item for ${name}`} title={CHOICE_TEXT.chooseWhy}
        sx={{ ...base, cursor: 'pointer', fontWeight: 600, background: 'var(--c-warning-200)', color: 'var(--c-warning-800)', '&:hover': { background: 'var(--c-warning-300, var(--c-warning-200))' }, '&:focus-visible': { outline: '2px solid var(--c-primary-400)' } }}>
        {CHOICE_TEXT.choose}<ArrowDropDownRounded sx={{ fontSize: 14, mr: -0.5 }} />
      </Box>
    ) : (
      <Box component="span" data-testid="choose-item" title={why ?? 'No item chosen yet.'}
        sx={{ ...base, fontWeight: 600, background: 'var(--c-warning-200)', color: 'var(--c-warning-800)' }}>Not chosen</Box>
    );
  }
  if (state === 'auto') {
    return editable ? (
      <Box component="button" type="button" data-testid="auto-chosen" onClick={click} onMouseDown={stop} onDoubleClick={stop}
        aria-label={`${name}: chosen automatically — choose another`} title={CHOICE_TEXT.autoWhy}
        sx={{ ...base, cursor: 'pointer', border: '1px dashed var(--c-border-strong, var(--c-text-3))', color: 'var(--c-text-2)', '&:hover': { color: 'var(--c-primary-700)' }, '&:focus-visible': { outline: '2px solid var(--c-primary-400)' } }}>
        {CHOICE_TEXT.auto}
      </Box>
    ) : (
      <Box component="span" data-testid="auto-chosen" title="Chosen automatically — the selection’s default (or its only candidate)."
        sx={{ ...base, border: '1px dashed var(--c-border-strong, var(--c-text-3))', color: 'var(--c-text-3)' }}>default</Box>
    );
  }
  return editable ? (
    <Box component="button" type="button" data-testid="change-item" onClick={click} onMouseDown={stop} onDoubleClick={stop}
      aria-label={`Change the item for ${name}`} title="Choose another item for this selection"
      sx={{ ...base, cursor: 'pointer', color: 'var(--c-primary-700)', textDecoration: 'underline', px: 0.25 }}>
      {CHOICE_TEXT.chosen}
    </Box>
  ) : null;
}
