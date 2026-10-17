import { useEffect, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import ArchitectureRounded from '@mui/icons-material/ArchitectureRounded';
import { getLineStandard, keepStandard, lineStandardSentence, saveLineToStandard, type LineStandardState } from '../api/standards';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useToast } from './toastContext';

/**
 * Above a line's structure, when the line is tied to a STANDARD DRAWING and there is something to decide
 * (init.sql §69): its BOM is not on the standard yet ("Save this BOM to the standard"), or it was changed since it
 * was copied ("Update the standard too (new version)" / "Keep the standard as it is"). Nothing shows otherwise.
 * `refreshKey` changes when the line may have changed (the order was reloaded after a save).
 */
export function StandardLineBanner({ lineId, hasStandard, refreshKey, onChanged }: { lineId: number; hasStandard: boolean; refreshKey?: unknown; onChanged?: () => void }) {
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_orders_manage');
  const [state, setState] = useState<LineStandardState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setError(null);
    if (!hasStandard) { setState(null); return () => { live = false; }; }
    getLineStandard(lineId).then((s) => { if (live) setState(s); }).catch(() => { if (live) setState(null); });
    return () => { live = false; };
  }, [lineId, hasStandard, refreshKey]);
  if (!state || !state.offer || !canManage) return null;
  const act = async (fn: () => Promise<LineStandardState>, done: string) => {
    setBusy(true); setError(null);
    try { setState(await fn()); toast.success(done); onChanged?.(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <Box role="status" data-testid="standard-banner"
      sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap', p: 1, px: 1.5, borderRadius: 'var(--r-md)', border: '1px solid var(--c-info-300)', background: 'var(--c-info-50)' }}>
      <ArchitectureRounded fontSize="small" sx={{ color: 'var(--c-info-700)' }} />
      <Typography sx={{ fontSize: 13.5, flex: '1 1 260px', minWidth: 0 }}>{lineStandardSentence(state)}</Typography>
      {state.offer === 'save' && (
        <Button size="small" variant="contained" disabled={busy} onClick={() => act(() => saveLineToStandard(lineId), 'The BOM is saved to the standard.')}>Save this BOM to the standard</Button>
      )}
      {state.offer === 'update' && (
        <>
          <Button size="small" variant="contained" disabled={busy} onClick={() => act(() => saveLineToStandard(lineId), 'The standard has a new version.')}>Update the standard too (new version)</Button>
          <Button size="small" variant="outlined" disabled={busy} onClick={() => act(() => keepStandard(lineId), 'The standard stays as it is.')}>Keep the standard as it is</Button>
        </>
      )}
      {error && <Typography role="alert" sx={{ fontSize: 12.5, color: 'var(--c-danger-700)', flexBasis: '100%' }}>{error}</Typography>}
    </Box>
  );
}
