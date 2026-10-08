import type { ReactNode } from 'react';import { Box, Typography } from '@mui/material';import type { TimingRule } from '../api/types';import { timeShort, type FieldIndex } from '../lib/formulaBuilder';import { subjectText } from '../lib/production';

/**
 * The simple way to say "which machine type does this, and how long": a machine-type picker and the
 * two times of ONE rule (setup per run, work per piece), each time edited in the time builder. Used by the
 * Operations list (one row per operation) and the operation page (one card) — the same rule rows the planner,
 * the tracker and the Times grid read; nothing here makes a new kind of row.
 *
 * An operation with no rule gets one the moment a machine type is chosen (or a time is clicked, which asks for
 * the machine type first — a rule belongs to a machine type). Who a rule is for cannot change on the server, so
 * changing the machine type adds the rule for the new type with the same times and then removes the old one.
 */

export interface OpRef { id: number; code: string; name: string }

const amber = { color: 'var(--c-warning-800)', fontWeight: 500 };

/** A cell's face: looks like text, acts like a button when the person may change it. */
function CellButton({ children, onClick, disabled, testId, label, sx }: { children: ReactNode; onClick?: (el: HTMLElement) => void; disabled?: boolean; testId: string; label: string; sx?: object }) {
  return (
    <Box component="button" type="button" data-testid={testId} aria-label={label} title={label} disabled={disabled}
      onClick={(e: React.MouseEvent<HTMLElement>) => { e.stopPropagation(); onClick?.(e.currentTarget); }}
      sx={{
        font: 'inherit', fontSize: 13.5, textAlign: 'left', background: 'transparent', border: '1px solid transparent', borderRadius: 'var(--r-sm)', px: 0.75, py: 0.25, mx: -0.75,
        color: 'var(--c-text)', cursor: disabled ? 'default' : 'pointer', whiteSpace: 'normal', maxWidth: 360,
        '&:hover:not(:disabled)': { borderColor: 'var(--c-primary-200)', background: 'var(--c-primary-50)' }, ...sx,
      }}>
      {children}
    </Box>
  );
}

/** The machine type a rule is for: its name, or "Set machine type" when the operation has no rule yet. */
export function MachineTypeCell({ op, rule, canManage, onPick }: { op: OpRef; rule: TimingRule | null; canManage: boolean; onPick: (anchor: HTMLElement) => void }) {
  const testId = `op-type-${op.id}`;
  if (!rule) {
    return canManage
      ? <CellButton testId={testId} label={`Set the machine type of ${op.code}`} onClick={onPick} sx={amber}>Set machine type</CellButton>
      : <Typography component="span" sx={{ color: 'var(--c-text-3)', fontSize: 13.5 }}>—</Typography>;
  }
  const s = rule.subject;
  const text = s.type === 'machine' ? `${s.code ?? s.name ?? 'Machine'} (one machine)` : s.name ?? s.code ?? '—';
  return (
    <CellButton testId={testId} label={canManage ? `Change the machine type of ${op.code} (${s.level})` : `${s.level}: ${subjectText(s)}`} disabled={!canManage} onClick={onPick}>
      {text}
      {!rule.eligible && <Box component="span" sx={{ ml: 0.75, color: 'var(--c-danger-800)', fontSize: 12 }}>kept out</Box>}
    </CellButton>
  );
}

/** One time of the rule in plain words; amber "Set time" when it is missing and needed. */
export function TimeCell({ op, rule, which, idx, canManage, onEdit }: {
  op: OpRef; rule: TimingRule | null; which: 'setup' | 'work'; idx: FieldIndex | null; canManage: boolean; onEdit: (anchor: HTMLElement) => void;
}) {
  const testId = `op-${which}-${op.id}`;
  const none = <Typography component="span" sx={{ color: 'var(--c-text-3)', fontSize: 13.5 }}>—</Typography>;
  if (rule && !rule.eligible) return none;
  const t = rule ? (which === 'setup' ? rule.setup : rule.work) : null;
  const words = timeShort(t, idx);
  const what = which === 'setup' ? 'setup time' : 'time per quantity';
  if (!words) {
    if (!canManage) return none;
    // Work time is what planning needs, so its absence is flagged; no setup is a normal state.
    return which === 'work'
      ? <CellButton testId={testId} label={`Set the ${what} of ${op.code}`} onClick={onEdit} sx={amber}>Set time</CellButton>
      : <CellButton testId={testId} label={`Set the ${what} of ${op.code}`} onClick={onEdit} sx={{ color: 'var(--c-text-3)' }}>—</CellButton>;
  }
  return (
    <CellButton testId={testId} label={canManage ? `Edit the ${what} of ${op.code}` : words} disabled={!canManage} onClick={onEdit}>
      {words}
      {t?.formula?.code && <Box component="span" sx={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--c-text-3)' }}>{t.formula.code}</Box>}
    </CellButton>
  );
}
