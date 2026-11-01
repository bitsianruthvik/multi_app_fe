import { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, TextField, Typography } from '@mui/material';
import { getLineCurve, setLineCurve, type LineCurve } from '../api/curve';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useToast } from './toastContext';

/**
 * TRACK CURVE (user, 2026-11-01: "in RDSO diagrams they would have given you how to calculate for different angles"):
 * above a line's structure when its standard says which curves it is designed for. The planner types the site's degree
 * of curve; the series' rule (girders laid on chords, its eccentricity at the maximum degree, 100 mm standard on top)
 * gives where to set the track on the deck, the angle between spans and how much the outer gap opens — and the plan.
 * The steel does not change; a curve beyond the series is refused. A series for straight track says so in one line.
 */
export function TrackCurveCard({ lineId, hasStandard }: { lineId: number; hasStandard: boolean }) {
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_orders_manage');
  const [curve, setCurve] = useState<LineCurve | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (!hasStandard) { setCurve(null); return () => { live = false; }; }
    getLineCurve(lineId).then((c) => { if (live) { setCurve(c); setText(c.deg != null ? String(c.deg) : ''); } }).catch(() => { if (live) setCurve(null); });
    return () => { live = false; };
  }, [lineId, hasStandard]);
  if (!curve || !curve.rule) return null;
  if (!curve.available) {
    return <Typography data-testid="curve-straight" sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{curve.note}</Typography>;
  }
  const typed = text.trim() === '' ? null : Number(text);
  const changed = (typed ?? null) !== (curve.deg ?? null);
  const save = async () => {
    setBusy(true); setError(null);
    try { const c = await setLineCurve(lineId, typed); setCurve(c); setText(c.deg != null ? String(c.deg) : ''); toast.success(c.deg ? `Set on a ${c.deg}° curve.` : 'Set straight.'); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const r = curve.results;
  const rule = curve.rule;
  const fact = (label: string, value: string, strong = false) => (
    <Box sx={{ display: 'grid', gap: 0.25 }}>
      <Box sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{label}</Box>
      <Box sx={{ fontSize: 14, fontWeight: strong ? 700 : 500, fontVariantNumeric: 'tabular-nums' }}>{value}</Box>
    </Box>
  );
  return (
    <Box data-testid="track-curve" sx={{ display: 'grid', gap: 1, p: 1.25, px: 1.5, borderRadius: 'var(--r-md)', border: '1px solid var(--c-border)', background: 'var(--c-surface)' }}>
      <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'center', flexWrap: 'wrap' }}>
        <Box component="h3" sx={{ m: 0, fontSize: 14, fontWeight: 600 }}>Track curve</Box>
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
          This series is designed for curves up to {curve.maxDeg}° — the steel is the same; the girders are laid on chords of the curve.
        </Typography>
        <Box sx={{ flex: 1 }} />
        <TextField size="small" type="number" label="Degree of curve" value={text} disabled={!canManage || busy}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && changed) void save(); }}
          slotProps={{ htmlInput: { min: 0, max: curve.maxDeg ?? undefined, step: 0.25, 'aria-label': 'Degree of curve', 'data-testid': 'curve-deg' } }} sx={{ width: 150 }}
          helperText={typed != null && curve.maxDeg != null && typed > curve.maxDeg ? `Over ${curve.maxDeg}° — outside the series` : '0 or empty = straight'} />
        {canManage && changed && <Button size="small" variant="contained" disabled={busy} onClick={save} data-testid="curve-save">{busy ? <CircularProgress size={14} color="inherit" /> : 'Save'}</Button>}
      </Box>
      {error && <Alert severity="error" sx={{ py: 0 }}>{error}</Alert>}
      {r && (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, minmax(0, 1fr))' }, gap: 1.5 }} data-testid="curve-results">
            {fact('Set the track off the girder centre by', `${r.eccentricityTotalMm} mm`, true)}
            {fact('…of which for the curve', `${r.eccentricityCurveMm} mm (+ ${r.standardEccentricityMm} standard)`)}
            {fact('Radius', `${r.radiusM.toLocaleString('en-IN')} m`)}
            {fact('Angle between spans', `${r.angleBetweenSpansDeg}°`)}
            {fact('Outer gap opens by', r.outerGapOpeningMm != null ? `${r.outerGapOpeningMm} mm` : '—')}
          </Box>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
            {curve.deg}° on a {rule.maxDeg}° series: {rule.eccentricityAtMaxMm} mm × {curve.deg}/{rule.maxDeg} for the curve (the drawing&rsquo;s note 4){r.halfVersineMm != null ? ` — the chords' half-versine gives ${r.halfVersineMm} mm` : ''}. The deck slab is trapezoidal at the outer side between spans (note 5).{r.spans > 1 ? ` ${r.spans} spans turn the track by ${r.turnDeg}°.` : ''}
          </Typography>
          {curve.svg && (
            <Box component="img" alt="Plan of the spans on the curve" data-testid="curve-plan" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(curve.svg)}`}
              sx={{ width: '100%', maxHeight: 220, objectFit: 'contain', background: '#fff', borderRadius: 'var(--r-sm)', border: '1px solid var(--c-divider)' }} />
          )}
        </>
      )}
    </Box>
  );
}
