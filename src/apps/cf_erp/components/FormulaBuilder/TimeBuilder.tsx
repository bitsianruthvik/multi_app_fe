import { useEffect, useMemo, useState } from 'react';
import { Box, Button, CircularProgress, Drawer, IconButton, Tooltip, Typography } from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import { CfApiError } from '../../api/client';
import type { TimeView } from '../../api/types';
import { getBuilderContext, type BuilderCheck } from '../../api/formulaBuilder';
import { useLoad } from '../../hooks/useLoad';
import { fieldIndex, timeStartText } from '../../lib/formulaBuilder';
import { ErrorNotice } from '../ui';
import { FormulaEditor } from './FormulaEditor';
import { PreviewPanel } from './PreviewPanel';

/**
 * The time dialog: sets ONE time of an operation's rule (work per piece, or setup
 * per run) as a formula typed in one editor — a plain number is a fixed time. The
 * time lives on the rule itself; `onSave` gets the text (empty clears the time).
 * A live preview on a real piece and machine runs beside it.
 */
export function TimeBuilder({ open, onClose, operation, subject, which, current, onSave }: {
  open: boolean;
  onClose: () => void;
  operation: { id: number; code: string; name: string };
  /** Who the rule is for — the preview's machines and the charts come from it. */
  subject: { type: 'classification' | 'machine'; id: number; label?: string | null } | null;
  which: 'setup' | 'work';
  /** What the rule holds now; the editor opens with its text. */
  current: TimeView | null;
  onSave: (expression: string) => Promise<void> | void;
}) {
  const ctx = useLoad(() => (open ? getBuilderContext(operation.id, subject) : Promise.resolve(null)), [open, operation.id, subject?.type, subject?.id]);
  const itemFields = useMemo(() => ctx.data?.itemFields ?? [], [ctx.data]);
  const machineFields = useMemo(() => ctx.data?.machineFields ?? [], [ctx.data]);
  const idx = useMemo(() => fieldIndex(itemFields, machineFields), [itemFields, machineFields]);

  const [expression, setExpression] = useState(() => timeStartText(current));
  const [check, setCheck] = useState<BuilderCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);

  // Opened again: start from what the rule holds.
  useEffect(() => {
    if (!open) return;
    setExpression(timeStartText(current));
    setError(null);
    setCheck(null);
    // `current` is read when the dialog opens; a re-render must not wipe what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const text = expression.trim();
  const problems = check?.problems ?? [];
  const blocked = !!text && problems.length > 0;

  const save = async () => {
    setBusy(true); setError(null);
    try {
      await onSave(text);
      setBusy(false);
      onClose();
    } catch (e) {
      setBusy(false);
      setError(e instanceof CfApiError ? e : new CfApiError(0, String(e)));
    }
  };

  const whichText = which === 'setup' ? 'Setup, per run' : 'Work, per piece';

  return (
    <Drawer anchor="right" open={open} onClose={() => !busy && onClose()} PaperProps={{ sx: { width: { xs: '100vw', md: 'min(1120px, 96vw)' }, maxWidth: '100vw' } }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }} data-testid="time-builder">
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, px: 3, pt: 2.5, pb: 1.5, borderBottom: '1px solid var(--c-divider)' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{operation.code} · {operation.name}{subject?.label ? ` · ${subject.label}` : ''}</Typography>
            <Typography component="h2" sx={{ fontSize: 20, fontWeight: 600 }} data-testid="time-builder-title">{whichText}</Typography>
          </Box>
          <Tooltip title="Close without saving"><IconButton aria-label="Close without saving" onClick={onClose} disabled={busy}><CloseRounded /></IconButton></Tooltip>
        </Box>

        <Box sx={{ flex: 1, overflow: 'auto', display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1.5fr) minmax(320px, 1fr)' }, alignItems: 'start' }}>
          <Box sx={{ p: 3, display: 'grid', gap: 2, minWidth: 0 }}>
            <ErrorNotice error={ctx.error} />
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
              {which === 'setup'
                ? 'Minutes once per run, before the pieces start. A number is a fixed time; or work it out from the piece and the machine. Leave empty for no setup.'
                : 'Minutes for each piece. A number is a fixed time; or work it out from the piece and the machine, e.g. item.CUT_LENGTH / machine.CUT_SPEED.'}
            </Typography>
            <FormulaEditor value={expression} onChange={setExpression} idx={idx} itemFields={itemFields} machineFields={machineFields} label="Minutes =" autoFocus minHeight={192} />
            {text && check?.expanded && (
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', fontFamily: 'var(--font-mono)', overflowWrap: 'anywhere' }} data-testid="reads-as">Reads as: {check.expanded}</Typography>
            )}
            <ErrorNotice error={error} />
          </Box>

          <Box sx={{ p: 3, borderLeft: { md: '1px solid var(--c-divider)' }, background: 'var(--c-surface)', position: { md: 'sticky' }, top: 0 }}>
            <PreviewPanel expression={text || null} ctx={ctx.data} idx={idx} which={which} onCheck={setCheck} />
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', alignItems: 'center', px: 3, py: 1.5, borderTop: '1px solid var(--c-divider)' }}>
          {ctx.loading && <CircularProgress size={16} />}
          <Box sx={{ flex: 1 }} />
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={busy || blocked} data-testid="builder-save"
            startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>{busy ? 'Saving…' : 'Save'}</Button>
        </Box>
      </Box>
    </Drawer>
  );
}
