/**
 * CriticalChain.tsx — Critical Chain (CCPM) cockpit for fab_erp.
 *
 * Combines EU-7 (buffers), EU-8 (fever chart / chain Gantt), EU-11 (drum) and
 * EU-14's frontend half (alerts) into one page:
 *   1. Constraint banner (GET /cc/drum) + a gated "Replan portfolio" button
 *      (POST /cc/replan), which re-detects the drum and re-sequences every
 *      baselined project.
 *   2. Alerts strip (GET /cc/alerts) — zone-worsening transitions + near-term
 *      drum wake-ups. Hidden when empty.
 *   3. Portfolio (GET /cc/portfolio) — one row per baselined project, already
 *      sorted most-at-risk-first by the API. Expanding a row lazily loads
 *      that project's plan detail (GET /cc/plans/:orderId) and renders its
 *      FeverChart + CriticalChainGantt + a buffers summary.
 *   4. Drum rope strip (GET /cc/drum → slots) — the sequenced queue on the
 *      current constraint.
 *
 * Read-only except "Replan portfolio", gated on `fab_erp_cc_manage`. The
 * route itself is gated on `fab_erp_cc_view` in index.ts.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Typography } from '@mui/material';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import RouteRounded from '@mui/icons-material/RouteRounded';

import { usePermission } from '@core/hooks/usePermission';
import {
  getCcPortfolio, getCcPlan, getCcDrum, getCcAlerts, runCcReplan,
  type CcPortfolioProject, type CcPlanDetailResponse, type CcDrumResponse, type CcAlert,
} from '../api/cc';
import { PageHeader, Surface, EmptyState, useToast, ChartSkeleton } from '../components';
import FeverChart from '../components/cc/FeverChart';
import CriticalChainGantt from '../components/cc/CriticalChainGantt';
import AlertsStrip from '../components/cc/AlertsStrip';
import DrumStrip from '../components/cc/DrumStrip';
import { ZONE_COLOR, ZONE_BG } from '../components/cc/zone';
import { errMsg, fmtDate, fmtMinutesAsHours } from '../components/cc/format';

function ConstraintBanner({
  drum,
  canManage,
  busy,
  onReplan,
}: {
  drum: CcDrumResponse['drum'];
  canManage: boolean;
  busy: boolean;
  onReplan: () => void;
}) {
  if (!drum) {
    return (
      <Surface e={1} sx={{ p: 2, mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-3)' }}>
          No constraint detected yet — baseline some orders.
        </Typography>
        {canManage && (
          <Button
            size="small"
            variant="outlined"
            startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <PlayArrowRounded fontSize="small" />}
            disabled={busy}
            onClick={onReplan}
          >
            {busy ? 'Replanning…' : 'Replan portfolio'}
          </Button>
        )}
      </Surface>
    );
  }

  const hours = drum.loadMinutes != null ? Math.round(drum.loadMinutes / 6) / 10 : null;

  return (
    <Surface e={2} sx={{ p: 2, mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
      <Box>
        <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)' }}>
          Constraint this cycle
        </Typography>
        <Typography sx={{ fontSize: 16, fontWeight: 600, color: 'var(--c-text)', mt: 0.25 }}>
          {drum.resourceTypeName ?? 'Unknown resource'} · {hours != null ? `${hours}h` : '—'} backlog
        </Typography>
      </Box>
      {canManage && (
        <Button
          variant="contained"
          size="small"
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <PlayArrowRounded fontSize="small" />}
          disabled={busy}
          onClick={onReplan}
        >
          {busy ? 'Replanning…' : 'Replan portfolio'}
        </Button>
      )}
    </Surface>
  );
}

function BufferPill({ pct, zone }: { pct: number | null; zone: CcPortfolioProject['feverZone'] }) {
  const rounded = pct != null ? Math.round(pct) : null;
  return (
    <Chip
      size="small"
      label={rounded != null ? `${rounded}% buffer` : '— buffer'}
      sx={{
        height: 20, fontSize: 11, fontWeight: 600,
        background: zone ? ZONE_BG[zone] : 'var(--c-surface-2)',
        color: zone ? ZONE_COLOR[zone] : 'var(--c-text-2)',
      }}
    />
  );
}

function CommittedFinish({ committedFinish, deltaDays }: { committedFinish: string | null; deltaDays: number | null }) {
  if (!committedFinish) return <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>—</Typography>;
  const dateText = fmtDate(committedFinish);
  if (deltaDays == null) {
    return <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{dateText}</Typography>;
  }
  const r = Math.round(deltaDays);
  const deltaText = r === 0 ? 'on plan' : r > 0 ? `+${r}d` : `${r}d`;
  const color = r > 0 ? 'var(--c-danger-600)' : r < 0 ? 'var(--c-success-600)' : 'var(--c-text-3)';
  return (
    <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
      {dateText} <Box component="span" sx={{ color, fontWeight: 600 }}>({deltaText})</Box>
    </Typography>
  );
}

function PortfolioRow({ project }: { project: CcPortfolioProject }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<CcPlanDetailResponse | null>(null);
  const [err, setErr] = useState('');

  const fetchDetail = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const res = await getCcPlan(project.orderId);
      setDetail(res);
    } catch (e) {
      setErr(errMsg(e, 'Failed to load this project’s critical chain.'));
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [project.orderId]);

  useEffect(() => { if (expanded) fetchDetail(); }, [expanded, fetchDetail]);

  const zone = project.feverZone;

  return (
    <Surface e={1} sx={{ mb: 1.5, overflow: 'hidden' }}>
      <Box
        onClick={() => setExpanded((v) => !v)}
        sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2, cursor: 'pointer', '&:hover': { bgcolor: 'var(--c-surface-2)' } }}
      >
        {expanded ? <ExpandMoreRounded sx={{ color: 'var(--c-text-3)' }} /> : <ChevronRightRounded sx={{ color: 'var(--c-text-3)' }} />}

        <Box sx={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: zone ? ZONE_COLOR[zone] : 'var(--c-text-3)' }} />

        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: 15, fontWeight: 600, color: 'var(--c-text)' }}>{project.orderNumber}</Typography>
            {project.customerName && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>· {project.customerName}</Typography>}
          </Box>
        </Box>

        <BufferPill pct={project.bufferConsumedPct} zone={zone} />
        <CommittedFinish committedFinish={project.committedFinish} deltaDays={project.deltaDays} />
      </Box>

      {expanded && (
        <Box sx={{ p: 2, pt: 1.5, borderTop: '1px solid var(--c-divider)' }}>
          {err && <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setErr('')}>{err}</Alert>}
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress size={24} /></Box>
          ) : !detail ? null : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Box>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)', mb: 1 }}>Fever chart</Typography>
                <FeverChart
                  trail={detail.feverTrail}
                  current={
                    detail.plan.chainCompletePct != null && detail.plan.bufferConsumedPct != null
                      ? { chainCompletePct: detail.plan.chainCompletePct, bufferConsumedPct: detail.plan.bufferConsumedPct }
                      : null
                  }
                />
              </Box>

              <Box>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)', mb: 1 }}>Critical chain</Typography>
                <CriticalChainGantt chainTasks={detail.chainTasks} buffers={detail.buffers} />
              </Box>

              {detail.buffers.length > 0 && (
                <Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)', mb: 1 }}>Buffers</Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                    {detail.buffers.map((b, i) => (
                      <Box
                        key={i}
                        sx={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          px: 1.25, py: 0.75, background: 'var(--c-surface-2)', borderRadius: 'var(--r-sm)',
                        }}
                      >
                        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text)' }}>
                          {b.kind === 'project' ? 'Project buffer' : 'Feeding buffer'}
                        </Typography>
                        <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', fontVariantNumeric: 'tabular-nums' }}>
                          {fmtMinutesAsHours(b.consumedMinutes)} / {fmtMinutesAsHours(b.sizeMinutes)} · {Math.round(b.consumedPct)}%
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}
            </Box>
          )}
        </Box>
      )}
    </Surface>
  );
}

export default function CriticalChain() {
  const { toast } = useToast();
  const canManage = usePermission('fab_erp_cc_manage');

  const [projects, setProjects] = useState<CcPortfolioProject[]>([]);
  const [drum, setDrum] = useState<CcDrumResponse | null>(null);
  const [alerts, setAlerts] = useState<CcAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [replanBusy, setReplanBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [portfolioRes, drumRes, alertsRes] = await Promise.all([
        getCcPortfolio(),
        getCcDrum(),
        getCcAlerts(),
      ]);
      setProjects(portfolioRes.projects ?? []);
      setDrum(drumRes);
      setAlerts(alertsRes.alerts ?? []);
    } catch (e) {
      const msg = errMsg(e, 'Failed to load the critical chain portfolio.');
      setError(msg);
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleReplan = useCallback(async () => {
    setReplanBusy(true);
    try {
      await runCcReplan();
      toast('Portfolio replanned.', 'success');
      await load();
    } catch (e) {
      toast(errMsg(e, 'Failed to replan the portfolio.'), 'error');
    } finally {
      setReplanBusy(false);
    }
  }, [load, toast]);

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <PageHeader
        title="Critical chain"
        subtitle="Portfolio drum, buffers, and fever status across every baselined project — most at-risk first."
        actions={
          <Button size="small" startIcon={<RefreshRounded fontSize="small" />} onClick={load} disabled={loading}>
            Refresh
          </Button>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {loading ? (
        <ChartSkeleton />
      ) : (
        <>
          <ConstraintBanner drum={drum?.drum ?? null} canManage={canManage} busy={replanBusy} onReplan={handleReplan} />
          <AlertsStrip alerts={alerts} />
          {drum && <DrumStrip slots={drum.slots} />}

          {projects.length === 0 ? (
            <EmptyState
              icon={<RouteRounded />}
              title="No baselined projects"
              hint="Projects appear here once a CCPM baseline exists — baseline an order to see it on the portfolio."
            />
          ) : (
            projects.map((p) => <PortfolioRow key={p.planId} project={p} />)
          )}
        </>
      )}
    </Box>
  );
}
