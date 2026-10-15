/**
 * One person's plan for one period (CF_HRMS_HIRING_SPEC.md §18.3).
 *
 * The same page serves two logins:
 *   mode 'hr'    /plans/:id — performanceApi; may activate, cancel and change
 *                targets when the server's `plan.can` says so.
 *   mode 'team'  /my-place/team-plans/:id — a manager on a team member's plan
 *                (teamPlanApi). They may change a DRAFT (the server sets
 *                `can.edit`), never activate, cancel or change an active target;
 *                those buttons are hidden here whatever comes back.
 *
 * DRAFT is freely editable; ACTIVE locks the list of KRAs and KPIs (a target can
 * still change, from a date, with a reason); CLOSED and CANCELLED are read-only.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Box, Button, InputAdornment, Stack, TextField, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import CheckCircleOutlineRounded from '@mui/icons-material/CheckCircleOutlineRounded';
import {
  Callout, ConfirmDialog, DetailHeader, DetailLayout, DetailSkeleton, ErrorNotice, FactItem, Mono, PromptDialog,
  SectionCard, useDetailTitle, useToast,
} from '@shared/ui';
import {
  performanceApi, teamPlanApi,
  type KpiInput, type Plan, type PlanKpi, type PlanKra, type TargetChangeInput,
} from '../api/performance';
import { KpiRow, PlanStatusBadge } from '../components/performance/PlanParts';
import { KpiFormDialog, TargetChangeDialog } from '../components/performance/KpiDialogs';
import { periodDates, weightWord } from '../components/performance/planWords';
import { longDay } from '../components/jobDates';

export type PlanMode = 'hr' | 'team';

/** What the page may call, by login. Missing = not offered in that mode. */
interface PlanSource {
  plan: (id: number) => Promise<Plan>;
  setKraWeight: (id: number, kraId: number, w: number | null) => Promise<unknown>;
  addKpi: (id: number, body: KpiInput) => Promise<unknown>;
  changeKpi: (id: number, kpiId: number, body: KpiInput) => Promise<unknown>;
  removeKpi: (id: number, kpiId: number) => Promise<unknown>;
  activate?: (id: number) => Promise<unknown>;
  cancel?: (id: number, reason?: string) => Promise<unknown>;
  changeTarget?: (id: number, kpiId: number, body: TargetChangeInput) => Promise<unknown>;
}

const SOURCES: Record<PlanMode, PlanSource> = {
  hr: performanceApi,
  team: {
    plan: teamPlanApi.plan,
    setKraWeight: teamPlanApi.setKraWeight,
    addKpi: teamPlanApi.addKpi,
    changeKpi: teamPlanApi.changeKpi,
    removeKpi: teamPlanApi.removeKpi,
  },
};

/** The weight box of one KRA: saves on blur or Enter, says why when refused. */
function KraWeightInput({ kra, onSave }: { kra: PlanKra; onSave: (w: number | null) => Promise<void> }) {
  const initial = kra.weightPercent != null ? String(kra.weightPercent) : '';
  const [text, setText] = useState(initial);
  const [seen, setSeen] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (initial !== seen) {
    setSeen(initial);
    setText(initial);
  }

  const commit = async () => {
    const t = text.trim();
    if (t === initial) return;
    const value = t === '' ? null : Number(t);
    if (value !== null && (Number.isNaN(value) || value < 0 || value > 100)) {
      setProblem('A number from 0 to 100, or leave it empty.');
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await onSave(value);
    } catch (e) {
      const err = e as { message?: string; problems?: string[] };
      setProblem(err?.problems?.[0] ?? err?.message ?? 'That could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
      <TextField
        size="small"
        value={text}
        disabled={busy}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === 'Escape') {
            setText(initial);
            setProblem(null);
          }
        }}
        error={!!problem}
        placeholder="—"
        sx={{ width: 120 }}
        slotProps={{
          htmlInput: { inputMode: 'decimal', 'aria-label': `Weight of ${kra.name}`, style: { textAlign: 'right' } },
          input: { startAdornment: <InputAdornment position="start">Weight</InputAdornment>, endAdornment: <InputAdornment position="end">%</InputAdornment> },
        }}
      />
      {problem && <Typography role="alert" sx={{ fontSize: 12, color: 'var(--c-danger-600)', mt: 0.5, maxWidth: 260, textAlign: 'right' }}>{problem}</Typography>}
    </Box>
  );
}

export default function PerformancePlan({ mode = 'hr' }: { mode?: PlanMode }) {
  const { company = '', id } = useParams<{ company: string; id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const planId = Number(id);
  const src = SOURCES[mode];

  const [data, setData] = useState<Plan | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  // Dialogs
  const [kpiDialog, setKpiDialog] = useState<{ kpi: PlanKpi | null; kraId: number | null; kraName: string } | null>(null);
  const [removing, setRemoving] = useState<PlanKpi | null>(null);
  const [targetFor, setTargetFor] = useState<PlanKpi | null>(null);
  const [activating, setActivating] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isInteger(planId) || planId <= 0) {
      setError(new Error('That is not a plan id.'));
      setLoading(false);
      return;
    }
    setError(null);
    try {
      setData(await src.plan(planId));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [planId, src]);

  useEffect(() => { void load(); }, [load]);

  const p = data?.plan;
  useDetailTitle(p ? `${p.employeeName} · ${p.period.name}` : undefined);

  const backTo = mode === 'team'
    ? `/${company}/cf_hrms/my-place`
    : `/${company}/cf_hrms/plans${p ? `?frequency=${p.period.frequency}&period=${p.period.start}` : ''}`;
  // Came from the list: go back to it as it was (its filters live in the address).
  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate(backTo));
  const backLabel = mode === 'team' ? 'Back to my place' : 'Back to plans';

  const canEdit = !!p?.can.edit && p.status === 'DRAFT';
  const canActivate = mode === 'hr' && !!p?.can.activate && !!src.activate && p.status === 'DRAFT';
  const canCancel = mode === 'hr' && !!p?.can.cancel && !!src.cancel && (p.status === 'DRAFT' || p.status === 'ACTIVE');
  const canChangeTarget = mode === 'hr' && !!p?.can.changeTarget && !!src.changeTarget && p.status === 'ACTIVE';

  const sections = useMemo(() => {
    if (!data) return [];
    return [
      ...data.kras.map((k) => ({ key: `kra-${k.id}`, kra: k as PlanKra | null, name: k.name, kpis: k.kpis })),
      // "Not under a KRA" shows when it holds something, or when a KPI can be added to it.
      ...(data.ungroupedKpis.length || canEdit ? [{ key: 'none', kra: null as PlanKra | null, name: 'Not under a KRA', kpis: data.ungroupedKpis }] : []),
    ];
  }, [data, canEdit]);

  if (loading && !data) return <DetailSkeleton />;
  if (!data || !p) {
    return (
      <>
        <Button startIcon={<ArrowBackRounded />} size="small" onClick={goBack}>{backLabel}</Button>
        <Box sx={{ mt: 2 }}><ErrorNotice error={error} onRetry={() => void load()} /></Box>
      </>
    );
  }

  const saveWeight = async (kra: PlanKra, w: number | null) => {
    await src.setKraWeight(planId, kra.id, w);
    await load();
  };

  const kpiActions = (k: PlanKpi): ReactNode => {
    const out: ReactNode[] = [];
    if (canEdit) {
      out.push(<Button key="change" size="small" onClick={() => setKpiDialog({ kpi: k, kraId: k.planKraId, kraName: '' })}>Change</Button>);
      out.push(<Button key="remove" size="small" color="error" onClick={() => setRemoving(k)}>Remove</Button>);
    }
    if (canChangeTarget) {
      out.push(<Button key="target" size="small" onClick={() => setTargetFor(k)}>Change target</Button>);
    }
    return out.length ? out : null;
  };

  const readOnlyBanner = p.status === 'CANCELLED'
    ? (
      <Callout tone="neutral" title="This plan was cancelled">
        {[p.cancelledAt ? `Cancelled on ${longDay(p.cancelledAt)}.` : null, p.cancelReason ? `Reason: ${p.cancelReason}` : null, 'It is kept as it was and cannot be changed.']
          .filter(Boolean).join(' ')}
      </Callout>
    )
    : p.status === 'CLOSED'
      ? <Callout tone="neutral" title="This plan is closed">Its period has been closed. It is kept as it was and cannot be changed.</Callout>
      : null;

  return (
    <>
      <Button startIcon={<ArrowBackRounded />} size="small" onClick={goBack} sx={{ mb: 1 }}>{backLabel}</Button>
      {error != null && <ErrorNotice error={error} sx={{ mb: 2 }} />}

      <DetailLayout
        header={(
          <DetailHeader
            code={p.employeeCode ?? undefined}
            title={p.employeeName}
            badges={<PlanStatusBadge status={p.status} />}
            subtitle={[
              [p.positionCode, p.positionTitle ?? p.roleTitle].filter(Boolean).join(' · '),
              p.departmentName,
            ].filter(Boolean).join(' — ') || 'No position recorded'}
            actions={(canActivate || canCancel) && (
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {canActivate && (
                  <Button size="small" variant="contained" startIcon={<CheckCircleOutlineRounded />} onClick={() => setActivating(true)}>
                    Activate
                  </Button>
                )}
                {canCancel && (
                  <Button size="small" variant="outlined" color="error" onClick={() => setCancelling(true)}>Cancel plan</Button>
                )}
              </Stack>
            )}
            facts={(
              <>
                <FactItem label="Period">
                  <Box component="span">{p.period.name}</Box>
                  <Typography component="span" sx={{ display: 'block', fontSize: 12.5, color: 'var(--c-text-2)' }}>{periodDates(p.period.start, p.period.end)}</Typography>
                </FactItem>
                <FactItem label="Department" value={p.departmentName ?? '—'} />
                <FactItem label="Manager">
                  {p.manager
                    ? (
                      <>
                        <Box component="span">{p.manager.name ?? 'Vacant'}</Box>
                        <Typography component="span" sx={{ display: 'block', fontSize: 12.5, color: 'var(--c-text-2)' }}>
                          {[p.manager.positionCode, p.manager.positionTitle].filter(Boolean).join(' · ')}
                        </Typography>
                      </>
                    )
                    : 'None recorded'}
                </FactItem>
                <FactItem label="Copied from the job">
                  <Mono sx={{ fontSize: 13.5 }}>as on {longDay(p.copiedOn)}</Mono>
                </FactItem>
              </>
            )}
          />
        )}
        beforeTabs={(
          <Stack spacing={1.5} sx={{ mb: 1 }}>
            {readOnlyBanner}
            {canActivate && (
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
                Activating locks the list of KRAs and KPIs. Targets can still change after that, from a date and with a reason.
              </Typography>
            )}
            {p.status === 'DRAFT' && mode === 'team' && canEdit && (
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
                You can change this draft. HR activates it.
              </Typography>
            )}
            {p.status === 'ACTIVE' && (
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
                This plan is active: its KRAs and KPIs are locked.{canChangeTarget ? ' A target can still change, from a date and with a reason.' : ''}
              </Typography>
            )}
          </Stack>
        )}
      >
        <Stack spacing={2}>
          {/* The running total of KRA weights. */}
          <Box data-plan-weights="" sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: 14, fontWeight: 500 }}>
              {p.weights.anySet ? `KRA weights add up to ${weightWord(p.weights.total)}` : 'No KRA weights set'}
            </Typography>
            {p.weights.anySet && (
              <Typography sx={{ fontSize: 13, color: p.weights.ok ? 'var(--c-success-600)' : 'var(--c-warning-800)' }}>
                {p.weights.ok ? '— that is right.' : '— they must add up to 100%.'}
              </Typography>
            )}
          </Box>
          {p.weights.problems.length > 0 && (
            <Callout tone="warning" title="Weights to fix before activating">
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                {p.weights.problems.map((w) => <li key={w}>{w}</li>)}
              </Box>
            </Callout>
          )}

          {sections.length === 0 && (
            <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-3)' }}>This plan has no KRAs or KPIs.</Typography>
          )}

          {sections.map((s) => (
            <SectionCard
              key={s.key}
              title={s.name}
              subtitle={s.kra
                ? (s.kra.jobWeightPercent != null && s.kra.jobWeightPercent !== s.kra.weightPercent ? `The job says weight ${weightWord(s.kra.jobWeightPercent)}` : undefined)
                : 'KPIs that do not belong to one of the KRAs above.'}
              actions={(
                <Stack direction="row" spacing={1} alignItems="flex-start" useFlexGap flexWrap="wrap" justifyContent="flex-end">
                  {s.kra && (canEdit
                    ? <KraWeightInput kra={s.kra} onSave={(w) => saveWeight(s.kra!, w)} />
                    : <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', whiteSpace: 'nowrap' }}>Weight {weightWord(s.kra.weightPercent)}</Typography>)}
                  {canEdit && (
                    <Button size="small" startIcon={<AddRounded />} onClick={() => setKpiDialog({ kpi: null, kraId: s.kra?.id ?? null, kraName: s.kra ? `“${s.kra.name}”` : '“Not under a KRA”' })}>
                      Add a KPI
                    </Button>
                  )}
                </Stack>
              )}
            >
              {s.kpis.length === 0 ? (
                <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>No KPIs here.</Typography>
              ) : (
                s.kpis.map((k) => <KpiRow key={k.id} kpi={k} directions={data.directions} actions={kpiActions(k)} />)
              )}
            </SectionCard>
          ))}
        </Stack>
      </DetailLayout>

      <KpiFormDialog
        open={!!kpiDialog}
        kpi={kpiDialog?.kpi ?? null}
        kraName={kpiDialog?.kraName ?? ''}
        directions={data.directions}
        entryFrequencies={data.entryFrequencies}
        onClose={() => setKpiDialog(null)}
        onSubmit={async (body) => {
          if (!kpiDialog) return;
          if (kpiDialog.kpi) {
            await src.changeKpi(planId, kpiDialog.kpi.id, body);
            toast.success('KPI changed for this period.');
          } else {
            await src.addKpi(planId, { ...body, planKraId: kpiDialog.kraId });
            toast.success('KPI added for this period.');
          }
          await load();
        }}
      />

      <ConfirmDialog
        open={!!removing}
        title="Remove this KPI from the plan?"
        entityName={removing?.name}
        body="It is removed from this period's plan only. The job keeps it."
        confirmLabel="Remove"
        danger
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          await src.removeKpi(planId, removing.id);
          toast.success('KPI removed from the plan.');
          await load();
        }}
      />

      {src.changeTarget && (
        <TargetChangeDialog
          open={!!targetFor}
          kpi={targetFor}
          onClose={() => setTargetFor(null)}
          onSubmit={async (body) => {
            if (!targetFor || !src.changeTarget) return;
            await src.changeTarget(planId, targetFor.id, body);
            toast.success('Target changed.');
            await load();
          }}
        />
      )}

      {canActivate && (
        <ConfirmDialog
          open={activating}
          title="Activate this plan?"
          entityName={`${p.employeeName} · ${p.period.name}`}
          body="Activating locks the list of KRAs and KPIs. Targets can still change after that, from a date and with a reason."
          confirmLabel="Activate"
          onClose={() => setActivating(false)}
          onConfirm={async () => {
            await src.activate!(planId);
            toast.success('Plan activated.');
            await load();
          }}
        />
      )}

      {canCancel && (
        <PromptDialog
          open={cancelling}
          title="Cancel this plan?"
          body="A cancelled plan is kept, read-only. Nothing is deleted."
          label="Reason (optional)"
          required={false}
          confirmLabel="Cancel plan"
          danger
          onClose={() => setCancelling(false)}
          onConfirm={async (reason) => {
            await src.cancel!(planId, reason.trim() || undefined);
            toast.success('Plan cancelled.');
            await load();
          }}
        />
      )}
    </>
  );
}
