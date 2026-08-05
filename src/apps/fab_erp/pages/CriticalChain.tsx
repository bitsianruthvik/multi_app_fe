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
 * Two writes beyond "Replan portfolio", both gated on `fab_erp_cc_manage`:
 *   - manual project ordering (fab_orders.priority_rank), which the drum's
 *     project comparator reads before the required date; and
 *   - a per-project re-baseline (POST /cc/plans/:orderId/baseline), because a
 *     baseline goes stale silently — a calendar, capacity or BOM change does
 *     not invalidate it, and the portfolio replan re-sequences the drum without
 *     rebuilding any project's buffer or committed date.
 * The route itself is gated on `fab_erp_cc_view` in index.ts.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, IconButton, TextField, Tooltip, Typography } from '@mui/material';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import RouteRounded from '@mui/icons-material/RouteRounded';
import RestartAltRounded from '@mui/icons-material/RestartAltRounded';

import { usePermission } from '@core/hooks/usePermission';
import {
  getCcPortfolio, getCcPlan, getCcDrum, getCcAlerts, runCcReplan,
  getCcOrderPlanning, setCcOrderPriorityRank, baselineCcOrder,
  type CcPortfolioProject, type CcPlanDetailResponse, type CcDrumResponse, type CcAlert,
  type CcOrderPlanning,
} from '../api/cc';
import {
  PageHeader, Surface, EmptyState, useToast, ChartSkeleton, FormDialog, ConfirmDialog, Mono,
} from '../components';
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

/**
 * The planner's manual sequencing rank. Shown on every row — with no rank
 * visible the portfolio reads as a risk list only, and the person deciding the
 * order cannot see what they have already decided.
 */
function RankChip({ rank, onClick }: { rank: number | null; onClick?: () => void }) {
  const ranked = rank != null;
  return (
    <Chip
      size="small"
      label={ranked ? `#${rank}` : 'unranked'}
      clickable={onClick != null}
      onClick={onClick}
      aria-label={ranked ? `Priority rank ${rank}. Click to change.` : 'No manual rank. Click to set one.'}
      sx={{
        height: 20, fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
        background: ranked ? 'var(--c-primary-50)' : 'var(--c-surface-2)',
        color: ranked ? 'var(--c-primary-700)' : 'var(--c-text-3)',
      }}
    />
  );
}

/**
 * Set / clear one project's manual rank.
 *
 * Deliberately a numeric field rather than drag-to-reorder: the ranks are
 * sparse (most projects are unranked and fall back to their required date), so
 * a drag list would have to invent a rank for every row it touched.
 */
function RankDialog({
  open, project, currentRank, requiredDate, peers, onClose, onSaved,
}: {
  open: boolean;
  project: CcPortfolioProject;
  currentRank: number | null;
  requiredDate: string | null;
  /** Every OTHER ranked project, for the duplicate-rank warning. */
  peers: { orderNumber: string; rank: number }[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [value, setValue] = useState('');

  // Seed from the saved rank each time the dialog opens, so cancelling and
  // reopening never shows a stale draft.
  useEffect(() => { if (open) setValue(currentRank != null ? String(currentRank) : ''); }, [open, currentRank]);

  const trimmed = value.trim();
  const parsed = trimmed === '' ? null : Number(trimmed);
  const valid = parsed === null || (Number.isInteger(parsed) && parsed > 0);
  const clashes = parsed == null ? [] : peers.filter((p) => p.rank === parsed);

  return (
    <FormDialog
      open={open}
      title={`Rank ${project.orderNumber}`}
      subtitle="Lower number goes first. Leave blank to unrank — unranked projects fall back to their required date."
      maxWidth="xs"
      submitLabel="Save rank"
      submitDisabled={!valid}
      onClose={onClose}
      onSubmit={async () => {
        await setCcOrderPriorityRank(project.orderId, parsed);
        await onSaved();
      }}
    >
      <TextField
        label="Priority rank"
        size="small"
        type="number"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        error={!valid}
        helperText={valid ? 'Whole number, 1 or greater. Blank = unranked.' : 'Rank must be a whole number of 1 or more.'}
        slotProps={{ htmlInput: { min: 1, step: 1 } }}
      />

      <Box sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
        Required date: <Mono>{requiredDate ? requiredDate.slice(0, 10) : '—'}</Mono>
      </Box>

      {/* A shared rank is legal but rarely intended — the sequencer silently
          falls through to the required date, which is not what "same rank"
          usually means to the person typing it. Warn, do not block. */}
      {clashes.length > 0 && (
        <Alert severity="warning" sx={{ fontSize: 12.5 }}>
          Rank #{parsed} is already on {clashes.map((c) => c.orderNumber).join(', ')}. Tied projects are
          then ordered by required date.
        </Alert>
      )}

      <Alert severity="info" sx={{ fontSize: 12.5 }}>
        Ranks only take effect on the next replan.
      </Alert>
    </FormDialog>
  );
}

function PortfolioRow({
  project, planning, canManage, canRank, peers, onRankSaved, onRebaselined,
}: {
  project: CcPortfolioProject;
  planning: CcOrderPlanning | undefined;
  canManage: boolean;
  canRank: boolean;
  peers: { orderNumber: string; rank: number }[];
  onRankSaved: () => void | Promise<void>;
  onRebaselined: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<CcPlanDetailResponse | null>(null);
  const [err, setErr] = useState('');
  const [rankOpen, setRankOpen] = useState(false);
  const [rebaseOpen, setRebaseOpen] = useState(false);

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
  const rank = planning?.priorityRank ?? null;
  // fab_orders.required_date is what drumService compares; p.due_date on the
  // portfolio row is only the snapshot taken when the plan was baselined, so it
  // can already disagree with the order. Prefer the live column.
  const requiredDate = planning?.requiredDate ?? project.dueDate;

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
          {/* Rank and required date sit together: the required date IS the
              tiebreak the sequencer uses when a rank is absent or shared, so
              deciding an order without it visible is guesswork. */}
          <Box
            sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, flexWrap: 'wrap' }}
            // Only swallow the click when the chip is actually interactive —
            // for a read-only viewer this strip should still expand the row.
            onClick={canRank ? (e) => e.stopPropagation() : undefined}
          >
            <RankChip rank={rank} onClick={canRank ? () => setRankOpen(true) : undefined} />
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
              Required {requiredDate ? fmtDate(requiredDate) : '—'}
            </Typography>
          </Box>
        </Box>

        <BufferPill pct={project.bufferConsumedPct} zone={zone} />
        <CommittedFinish committedFinish={project.committedFinish} deltaDays={project.deltaDays} />

        {canManage && (
          <Tooltip title="Re-baseline this project">
            <IconButton
              size="small"
              aria-label={`Re-baseline ${project.orderNumber}`}
              onClick={(e) => { e.stopPropagation(); setRebaseOpen(true); }}
              sx={{ color: 'var(--c-text-3)' }}
            >
              <RestartAltRounded fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
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

      <RankDialog
        open={rankOpen}
        project={project}
        currentRank={rank}
        requiredDate={requiredDate}
        peers={peers}
        onClose={() => setRankOpen(false)}
        onSaved={onRankSaved}
      />

      <ConfirmDialog
        open={rebaseOpen}
        title="Re-baseline this project?"
        entityName={project.orderNumber}
        confirmLabel="Re-baseline"
        body={
          <>
            Rebuilds this project’s critical chain from its tasks now, and recomputes its buffer and
            committed date — run it after a shift-calendar, machine-capacity or BOM change, none of
            which invalidate an existing baseline on their own.
            <Box sx={{ mt: 1, color: 'var(--c-text-3)' }}>
              Committed finish is currently {fmtDate(project.committedFinish)} and may move.
            </Box>
          </>
        }
        onClose={() => setRebaseOpen(false)}
        onConfirm={async () => {
          const res = await baselineCcOrder(project.orderId);
          // created:false is a success with nothing to plan — say so rather than
          // claiming a new baseline the planner would then trust.
          if (res.created === false) {
            toast(`${project.orderNumber} has no tasks to plan yet — baseline unchanged.`, 'info');
          } else {
            toast(
              res.committedFinish
                ? `${project.orderNumber} re-baselined — committed ${fmtDate(res.committedFinish)}.`
                : `${project.orderNumber} re-baselined.`,
              'success',
            );
          }
          await onRebaselined();
        }}
      />
    </Surface>
  );
}

export default function CriticalChain() {
  const { toast } = useToast();
  const canManage = usePermission('fab_erp_cc_manage');
  // Setting a rank writes fab_orders through the generic mutate endpoint, which
  // the backend gates on fab_erp_projects_manage — a different tag from the one
  // that guards replan and re-baseline. Showing the control to someone holding
  // only cc_manage would offer an action that 403s on save.
  const canRank = usePermission('fab_erp_projects_manage');

  const [projects, setProjects] = useState<CcPortfolioProject[]>([]);
  const [planning, setPlanning] = useState<Record<number, CcOrderPlanning>>({});
  const [drum, setDrum] = useState<CcDrumResponse | null>(null);
  const [alerts, setAlerts] = useState<CcAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [replanBusy, setReplanBusy] = useState(false);
  /** A rank was edited since the last replan — nothing has re-sequenced yet. */
  const [ranksPending, setRanksPending] = useState(false);

  /** Ranks + required dates for the listed orders, keyed by orderId. */
  const loadPlanning = useCallback(async (orderIds: number[]) => {
    const rows = await getCcOrderPlanning(orderIds);
    setPlanning(Object.fromEntries(rows.map((r) => [r.id, r])));
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [portfolioRes, drumRes, alertsRes] = await Promise.all([
        getCcPortfolio(),
        getCcDrum(),
        getCcAlerts(),
      ]);
      const list = portfolioRes.projects ?? [];
      setProjects(list);
      setDrum(drumRes);
      setAlerts(alertsRes.alerts ?? []);
      // Second round trip: /cc/portfolio reads fab_cc_plans, and the rank lives
      // on fab_orders. Needs the ids from the first call, so it cannot join the
      // Promise.all above.
      await loadPlanning(list.map((p) => p.orderId));
    } catch (e) {
      const msg = errMsg(e, 'Failed to load the critical chain portfolio.');
      setError(msg);
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [loadPlanning, toast]);

  useEffect(() => { load(); }, [load]);

  const handleReplan = useCallback(async () => {
    setReplanBusy(true);
    try {
      await runCcReplan();
      toast('Portfolio replanned.', 'success');
      setRanksPending(false);
      await load();
    } catch (e) {
      toast(errMsg(e, 'Failed to replan the portfolio.'), 'error');
    } finally {
      setReplanBusy(false);
    }
  }, [load, toast]);

  // A saved rank changes nothing until the drum is re-sequenced, so re-read the
  // ranks (cheap) and raise the nudge instead of reloading the whole page.
  const handleRankSaved = useCallback(async () => {
    setRanksPending(true);
    toast('Rank saved — replan to apply it.', 'success');
    try {
      await loadPlanning(projects.map((p) => p.orderId));
    } catch (e) {
      toast(errMsg(e, 'Saved, but the ranks could not be re-read.'), 'error');
    }
  }, [loadPlanning, projects, toast]);

  /** orderId → the other projects' ranks, for the duplicate-rank warning. */
  const peersByOrder = useMemo(() => {
    const ranked = projects
      .map((p) => ({ orderId: p.orderId, orderNumber: p.orderNumber, rank: planning[p.orderId]?.priorityRank ?? null }))
      .filter((p): p is { orderId: number; orderNumber: string; rank: number } => p.rank != null);
    return (orderId: number) =>
      ranked.filter((p) => p.orderId !== orderId).map(({ orderNumber, rank }) => ({ orderNumber, rank }));
  }, [projects, planning]);

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

          {/* Ranks are read at replan time, not at write time. Without this the
              planner types a rank, sees the list not move, and types it again. */}
          {ranksPending && (
            <Alert
              severity="info"
              sx={{ mb: 2 }}
              action={
                canManage ? (
                  <Button
                    size="small"
                    startIcon={replanBusy ? <CircularProgress size={14} color="inherit" /> : <PlayArrowRounded fontSize="small" />}
                    disabled={replanBusy}
                    onClick={handleReplan}
                  >
                    {replanBusy ? 'Replanning…' : 'Replan now'}
                  </Button>
                ) : undefined
              }
            >
              Ranks changed. The drum still holds its previous sequence until the portfolio is replanned.
            </Alert>
          )}

          <AlertsStrip alerts={alerts} />
          {drum && <DrumStrip slots={drum.slots} />}

          {projects.length === 0 ? (
            <EmptyState
              icon={<RouteRounded />}
              title="No baselined projects"
              hint="Projects appear here once a CCPM baseline exists — baseline an order to see it on the portfolio."
            />
          ) : (
            projects.map((p) => (
              <PortfolioRow
                key={p.planId}
                project={p}
                planning={planning[p.orderId]}
                canManage={canManage}
                canRank={canRank}
                peers={peersByOrder(p.orderId)}
                onRankSaved={handleRankSaved}
                onRebaselined={load}
              />
            ))
          )}
        </>
      )}
    </Box>
  );
}
