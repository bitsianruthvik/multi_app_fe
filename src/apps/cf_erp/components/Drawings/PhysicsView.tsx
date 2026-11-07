import { useEffect, useState } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { CfApiError } from '../../api/client';
import type { PhysicsInfo, PhysicsSource } from '../../api/drawings';
import { ErrorNotice } from '../ui';
import { physicsCounts } from '../../lib/physics';

/**
 * THE PHYSICS VIEW OF A STRUCTURE, in the drawing tool beside 2D and 3D (user, 2026-11-07: "where is the physics view? … build
 * it into the app"). The page is the physics screen's own (drawing_bom/src/physics, kept with the standard by
 * physics-attach.mjs): the model as the solver sees it, coloured by stress, with its findings. It runs in a sandboxed frame
 * — scripts allowed, never this app's origin — so it cannot read the login.
 */

export function PhysicsView({ source, info }: { source: PhysicsSource; info: PhysicsInfo }) {
  const [page, setPage] = useState<string | null>(null);
  const [error, setError] = useState<CfApiError | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setPage(null); setError(null);
    source.page().then((html) => { if (live) setPage(html); })
      .catch((e) => { if (live) setError(e instanceof CfApiError ? e : new CfApiError(0, e instanceof Error ? e.message : String(e))); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.key, attempt]);
  const counts = physicsCounts(info);
  return (
    <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }} data-testid="physics-view">
      <Box sx={{ px: 1.5, py: 0.75, display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'baseline', fontSize: 12.5, color: 'var(--c-text-2)', borderBottom: '1px solid var(--c-border)' }}>
        <Typography component="span" sx={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text-1)' }}>Physics{counts ? `: ${counts}` : ''}</Typography>
        <span>A screen, not a design check: the loads are assumed and the limits are screening values, not the project’s code. A “look” is a question for the designer.</span>
        {info.generated && <span>Run {info.generated}{info.set ? ` on ${info.set}` : ''}.</span>}
        {info.stale && <Typography component="span" data-testid="physics-stale" sx={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-warning-700, #a15c00)' }}>Out of date: the structure’s model has changed since this was run.</Typography>}
      </Box>
      {error && <Box sx={{ p: 2 }}><ErrorNotice error={error} onRetry={() => setAttempt((n) => n + 1)} sx={{ mb: 0 }} /></Box>}
      {!error && page == null && (
        <Box role="status" sx={{ m: 'auto', display: 'flex', alignItems: 'center', gap: 1, color: 'var(--c-text-2)' }}><CircularProgress size={18} /> Loading the physics view…</Box>
      )}
      {!error && page != null && (
        <Box component="iframe" title="Physics view" srcDoc={page} sandbox="allow-scripts" data-testid="physics-frame"
          sx={{ flex: 1, minHeight: 0, width: '100%', border: 0, background: '#fff' }} />
      )}
    </Box>
  );
}

export default PhysicsView;
