import { useEffect, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import { clearAiFlags, getDrawingImport, type DrawingImport } from '../../api/addLine';
import { flagsWord } from '../../lib/addLine';
import { useToast } from '../toastContext';

/**
 * Over a line built FROM A NEW DRAWING by AI (init.sql §77): which file, how many parts, how many rows still to check
 * (each such row has an amber "AI" chip in the grid with its reason), and the three things to do — mark them checked,
 * save the line as a standard drawing, or remove the line when the structure is way off. Nothing shows for a line
 * that was not read from a drawing.
 */
export function AiLineBanner({ lineId, refreshKey, editable, hasStandard, onSaveStandard, onRemove, onChanged }: {
  lineId: number;
  refreshKey: unknown;
  editable: boolean;
  hasStandard: boolean;
  onSaveStandard: () => void;
  onRemove: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [state, setState] = useState<DrawingImport | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    getDrawingImport(lineId).then((s) => { if (live) setState(s); }).catch(() => { if (live) setState(null); });
    return () => { live = false; };
  }, [lineId, refreshKey]);
  if (!state?.import) return null;
  const open = state.open.length;
  const markAll = async () => {
    setBusy(true);
    try { const out = await clearAiFlags(lineId); setState(out); toast.success(`${out.cleared} ${out.cleared === 1 ? 'row' : 'rows'} marked checked.`); onChanged(); } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <Box data-testid="ai-line-banner" sx={{
      display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', px: 1.25, py: 0.75, borderRadius: 'var(--r-md)',
      border: `1px solid ${open ? 'var(--c-warning-200)' : 'var(--c-border)'}`, background: open ? 'var(--c-warning-50)' : 'var(--c-surface-2)',
    }}>
      <AutoAwesomeRounded sx={{ fontSize: 18, color: open ? 'var(--c-warning-800)' : 'var(--c-primary-700)' }} aria-hidden />
      <Typography sx={{ fontSize: 13, flex: '1 1 260px', minWidth: 0, overflowWrap: 'anywhere' }}>
        Built by AI from <b>{state.import.file}</b> · {state.import.parts} parts · <span data-testid="ai-open-count">{flagsWord(open)}</span>
        {open > 0 ? ' — look for the amber “AI” chips in the grid.' : '.'}
      </Typography>
      {editable && open > 0 && <Button size="small" variant="outlined" disabled={busy} onClick={markAll} data-testid="ai-mark-checked">Mark all checked</Button>}
      {editable && !hasStandard && <Button size="small" onClick={onSaveStandard} data-testid="ai-save-standard">Save as a standard drawing</Button>}
      {editable && <Button size="small" color="error" onClick={onRemove} data-testid="ai-remove-line">Remove line</Button>}
    </Box>
  );
}
