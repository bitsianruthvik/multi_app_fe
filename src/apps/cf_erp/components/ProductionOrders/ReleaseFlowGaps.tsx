import { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import { cfApi } from '../../api/client';
import type { LockFlowRow } from '../../api/lock';
import type { ReleaseCheck } from '../../api/types';
import { useLoad } from '../../hooks/useLoad';
import { releaseRefusesText, rowNames } from '../../lib/releaseFlow';
import { GiveFlowDialog } from '../Lock/GiveFlowDialog';
import { useToast } from '../toastContext';

interface LineGap { lineId: number; lineNo: number; rows: LockFlowRow[] }

/**
 * The made rows release will refuse for having no flow, said on the order's Production step BEFORE anyone clicks
 * "Create production orders" or "Release" (2026-10-24): the freeze only warns of them, release refuses them, and people
 * found out at release. Read from each line's release check (GET /order-lines/:id/release-check → noFlowRows, the same
 * rows the freeze checklist lists); "Give them a flow" is the freeze checklist's own dialog. Nothing when every row has
 * a flow. The rules are unchanged.
 */
export function ReleaseFlowGaps({ lineIds, canGive, onChanged }: { lineIds: number[]; canGive: boolean; onChanged?: () => void }) {
  const toast = useToast();
  const key = lineIds.join(',');
  const checks = useLoad<LineGap[]>(async () => {
    if (!lineIds.length) return [];
    // One line's check failing (a line not built yet) is no reason to hide the others.
    const out = await Promise.all(lineIds.map((id) => cfApi.get<ReleaseCheck>(`/order-lines/${id}/release-check`).catch(() => null)));
    return out.flatMap((c, i) => (c && (c.noFlowRows?.length ?? 0) > 0 ? [{ lineId: lineIds[i], lineNo: c.line.lineNo, rows: c.noFlowRows ?? [] }] : []));
  }, [key]);
  const [giving, setGiving] = useState<LineGap | null>(null);
  const gaps = checks.data ?? [];
  const total = gaps.reduce((s, g) => s + g.rows.length, 0);
  if (!total) return null;
  return (
    <Box role="status" data-testid="release-flow-gaps" sx={{
      display: 'flex', gap: 1, alignItems: 'flex-start', p: 1.25, mb: 1.5, minWidth: 0, fontSize: 13.5,
      borderRadius: 'var(--r-md)', background: 'var(--c-warning-50)', border: '1px solid var(--c-warning-200)', color: 'var(--c-warning-800)',
    }}>
      <ErrorOutlineRounded sx={{ fontSize: 18, flexShrink: 0, mt: '1px' }} aria-hidden />
      <Box sx={{ minWidth: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.75 }}>
        <Box sx={{ fontWeight: 600 }}>{releaseRefusesText(total)}.</Box>
        {gaps.map((g) => (
          <Box key={g.lineId} data-testid="release-flow-gap" sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
            <Typography component="span" sx={{ fontSize: 13.5, flex: '1 1 260px', minWidth: 0, overflowWrap: 'anywhere' }}>
              Line {g.lineNo}: {rowNames(g.rows.map((r) => r.name))}.
            </Typography>
            {canGive && <Button size="small" variant="contained" data-testid="release-give-flow" onClick={() => setGiving(g)}>Give them a flow</Button>}
          </Box>
        ))}
        {!canGive && <Typography sx={{ fontSize: 12.5 }}>Giving a row a flow needs the orders permission.</Typography>}
      </Box>
      <GiveFlowDialog open={!!giving} lineId={giving?.lineId ?? 0} rows={giving?.rows ?? []} onClose={() => setGiving(null)}
        onDone={(n) => { toast.success(`${n} ${n === 1 ? 'row' : 'rows'} given a flow.`); checks.reload(); onChanged?.(); }} />
    </Box>
  );
}
