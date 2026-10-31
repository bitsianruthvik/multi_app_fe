import { useState } from 'react';
import { Box, Button, IconButton, Tooltip, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import ChecklistRounded from '@mui/icons-material/ChecklistRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import { loadLock } from '../../api/lock';
import { useCompanySlug } from '../../hooks/useLoad';
import { appPath } from '../../navMeta';
import { readinessFromLock, readinessHeadline, readinessWhere, type LineReadiness, type ReadinessNeed } from '../../lib/lineReadiness';

/**
 * Above a line's grid, RIGHT AFTER the line is added (demo, 2026-10-31): what it still needs before its design can be
 * frozen — the Freeze checklist's own checks, said now instead of at the freeze. Each need has a button to where it
 * is put right (the line's grid on this Structure step, or Setup › Coding rules); "Check again" reads the checklist
 * afresh. A line from a standard drawing is reminded that the fixes can be saved back to the standard (the banner
 * below offers it once the BOM changed), so the next line comes ready.
 */
export function LineReadinessBanner({ lineId, lineNo, readiness, fromStandard, onShowGrid, onGoFreeze, onDismiss }: {
  lineId: number; lineNo: number; readiness: LineReadiness; fromStandard: boolean;
  /** Opens the line's group and brings its grid into view — the Structure stage, where rows and values are fixed. */
  onShowGrid: () => void;
  /** The Freeze design step, when the order's process has it. */
  onGoFreeze?: (() => void) | null;
  onDismiss: () => void;
}) {
  const company = useCompanySlug();
  const [r, setR] = useState<LineReadiness>(readiness);
  const [busy, setBusy] = useState(false);
  const recheck = async () => {
    setBusy(true);
    try { setR(readinessFromLock(await loadLock(lineId))); } catch (e) { setR({ locked: false, canFreeze: false, blocking: 0, needs: [], error: e instanceof Error ? e.message : String(e) }); } finally { setBusy(false); }
  };
  const ready = !r.error && r.needs.length === 0;
  const tone = r.blocking > 0 ? 'warning' : ready ? 'success' : 'info';
  const go = (n: ReadinessNeed) => (readinessWhere(n) === 'coding'
    ? <Button size="small" component={Link} to={appPath(company, 'coding-rules')}>Coding rules</Button>
    : <Button size="small" onClick={onShowGrid} data-testid="readiness-go">Go to Structure</Button>);
  const item = (n: ReadinessNeed) => (
    <Box component="li" key={n.key} data-testid={`readiness-need-${n.key}`} sx={{ display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap', py: 0.25 }}>
      <Typography component="span" sx={{ fontSize: 13, flex: '1 1 320px', minWidth: 0 }}>
        <strong>{n.title}</strong>{n.detail ? ` — ${n.detail}` : ''}
        {n.todo && <Typography component="span" sx={{ display: 'block', fontSize: 12, color: 'var(--c-text-2)' }}>{n.todo}</Typography>}
      </Typography>
      {go(n)}
    </Box>
  );
  const blocking = r.needs.filter((n) => !n.warning);
  const warnings = r.needs.filter((n) => n.warning);
  return (
    <Box role="status" data-testid="line-readiness"
      sx={{ display: 'grid', gap: 0.5, p: 1, px: 1.5, borderRadius: 'var(--r-md)', border: `1px solid var(--c-${tone}-200)`, background: `var(--c-${tone}-50)` }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <ChecklistRounded fontSize="small" sx={{ color: `var(--c-${tone}-800)` }} aria-hidden />
        <Typography sx={{ fontSize: 13.5, fontWeight: 600, flex: 1, minWidth: 0 }} data-testid="readiness-headline">{readinessHeadline(r, lineNo)}</Typography>
        <Button size="small" onClick={() => void recheck()} disabled={busy} data-testid="readiness-recheck">{busy ? 'Checking…' : 'Check again'}</Button>
        <Tooltip title="Hide — the Freeze checklist still says it"><IconButton size="small" aria-label="Hide what the line needs" onClick={onDismiss}><CloseRounded fontSize="small" /></IconButton></Tooltip>
      </Box>
      {blocking.length > 0 && <Box component="ul" aria-label="Needed before the freeze" sx={{ listStyle: 'none', m: 0, p: 0 }}>{blocking.map(item)}</Box>}
      {warnings.length > 0 && (
        <>
          {blocking.length > 0 && <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)', mt: 0.25 }}>Before release</Typography>}
          <Box component="ul" aria-label="Needed before release" sx={{ listStyle: 'none', m: 0, p: 0 }}>{warnings.map(item)}</Box>
        </>
      )}
      {(r.needs.length > 0 || onGoFreeze) && (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          {fromStandard && r.needs.length > 0 && (
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', flex: '1 1 300px' }} data-testid="readiness-standard-note">
              These come from the standard drawing. Fix them here, then save the fixes back to the standard when it offers — the next line made from it comes ready.
            </Typography>
          )}
          {onGoFreeze && <Button size="small" variant="outlined" onClick={onGoFreeze} data-testid="readiness-freeze">Open the Freeze checklist</Button>}
        </Box>
      )}
    </Box>
  );
}
