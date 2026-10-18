import { Box, Button, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { getPlanHealth } from '../../api/planner3';
import { useCompanySlug, useLoad } from '../../hooks/useLoad';
import { appPath } from '../../navMeta';
import { ErrorNotice, SectionCard, SkeletonRows } from '../ui';
import { REASON_WORDS } from '../../lib/planner3';

/**
 * PLAN HEALTH (Step 5, user 2026-10-18): on the Management dashboard — the SAVED plan against the baseline: how many
 * production orders finish on time, how many slip and by how many days, and why (slip by reason).
 */
export function PlanHealthCard() {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const h = useLoad(() => getPlanHealth(), []);
  const d = h.data;
  return (
    <SectionCard title="Plan health" subtitle={d?.baseline ? `The saved plan against baseline v${d.baseline.version}` : 'No baseline yet'}
      actions={<Button size="small" onClick={() => navigate(appPath(company, 'planner'))}>Open the planner</Button>}>
      <Box data-testid="plan-health" sx={{ display: 'grid', gap: 1 }}>
        <ErrorNotice error={h.error} onRetry={h.reload} />
        {h.loading && !d ? <SkeletonRows rows={3} /> : d && !d.baseline ? (
          <Typography sx={{ fontSize: 13.5 }}>Nothing to compare yet — the first saved plan sets the baseline.</Typography>
        ) : d && (
          <>
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              <Box><Typography sx={{ fontSize: 26, fontWeight: 700 }} data-testid="plan-health-pct">{d.onTimePct == null ? '—' : `${d.onTimePct}%`}</Typography><Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>on time ({d.onTime} of {d.compared})</Typography></Box>
              <Box><Typography sx={{ fontSize: 26, fontWeight: 700, color: d.late ? 'var(--c-danger-700)' : 'inherit' }}>{d.late}</Typography><Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>late against the baseline</Typography></Box>
              <Box><Typography sx={{ fontSize: 26, fontWeight: 700 }}>{d.slipDays}</Typography><Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>days of slip in all</Typography></Box>
            </Box>
            {d.byReason.length > 0 && (
              <Box data-testid="plan-health-reasons" sx={{ display: 'grid', gap: 0.25 }}>
                <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>Slip by reason</Typography>
                {d.byReason.map((r) => (
                  <Box key={r.kind} sx={{ display: 'grid', gridTemplateColumns: '160px 90px 1fr', fontSize: 13 }}>
                    <span>{REASON_WORDS[r.kind] ?? r.label}</span><span>{r.days} days</span><span>{r.orders} production order{r.orders === 1 ? '' : 's'}</span>
                  </Box>
                ))}
              </Box>
            )}
            {d.worst.length > 0 && (
              <Box sx={{ display: 'grid', gap: 0.25 }}>
                <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>Slipping most</Typography>
                {d.worst.map((w) => (
                  <Typography key={w.id} noWrap sx={{ fontSize: 13 }} title={w.reason ?? ''}>{w.label} — {w.slipDays == null ? 'cannot finish' : `+${w.slipDays} d`}{w.reason ? ` · ${w.reason}` : ''}</Typography>
                ))}
              </Box>
            )}
          </>
        )}
      </Box>
    </SectionCard>
  );
}
