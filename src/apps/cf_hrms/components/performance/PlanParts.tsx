/**
 * The read-only pieces of a performance plan (CF_HRMS_HIRING_SPEC.md §18.3),
 * shared by the plan page (HR and manager), the employee's Performance tab and
 * My place, so a KPI reads the same wherever it is shown.
 */
import type { ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import EditOutlined from '@mui/icons-material/EditOutlined';
import { StatusBadge, ToneBadge } from '@shared/ui';
import type { Direction, Option, Plan, PlanKpi, PlanKra, PlanStatus } from '../../api/performance';
import { longDay } from '../jobDates';
import { DIRECTION_LABEL, PLAN_STATUS_LABEL, PLAN_STATUS_TONE, frequencyWord, weightWord } from './planWords';

export function PlanStatusBadge({ status }: { status: PlanStatus }) {
  return <StatusBadge status={status} map={PLAN_STATUS_TONE} labelMap={PLAN_STATUS_LABEL} />;
}

/** "From the job" (quiet) / "Changed for this period" / "Added for this period". */
export function MarkChip({ mark, label }: { mark: PlanKpi['mark']; label?: string }) {
  if (mark === 'FROM_JOB') {
    return (
      <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)', whiteSpace: 'nowrap' }}>
        {label ?? 'From the job'}
      </Typography>
    );
  }
  if (mark === 'CHANGED') {
    return <ToneBadge tone="info" icon={<EditOutlined sx={{ fontSize: 13 }} />} label={label ?? 'Changed for this period'} />;
  }
  return <ToneBadge tone="info" icon={<AddRounded sx={{ fontSize: 13 }} />} label={label ?? 'Added for this period'} />;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', gap: 0.5, alignItems: 'baseline', minWidth: 0 }}>
      <Box component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)', whiteSpace: 'nowrap' }}>{label}</Box>
      <Box component="span" sx={{ fontSize: 13, color: 'var(--c-text)', overflowWrap: 'anywhere' }}>{children}</Box>
    </Box>
  );
}

const directionWord = (d: Direction, directions?: Option<Direction>[]) =>
  directions?.find((o) => o.value === d)?.label ?? DIRECTION_LABEL[d] ?? d;

/**
 * One KPI of a plan. `actions` sits at the row's end (Change, Remove, Change
 * target) — the caller decides what this login may do. `compact` drops the
 * job comparison and the target history (My place).
 */
export function KpiRow({
  kpi,
  directions,
  actions,
  compact = false,
}: {
  kpi: PlanKpi;
  directions?: Option<Direction>[];
  actions?: ReactNode;
  compact?: boolean;
}) {
  const job = kpi.job;
  const jobWeightDiffers = job && job.weightPercent !== kpi.weightPercent;
  return (
    <Box data-plan-kpi={kpi.id} sx={{ py: 1.25, borderBottom: '1px solid var(--c-border)', '&:last-of-type': { borderBottom: 0 } }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, flexWrap: 'wrap' }}>
        <Box sx={{ flex: '1 1 240px', minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
            <Typography sx={{ fontSize: 14, fontWeight: 500, overflowWrap: 'anywhere' }}>{kpi.name}</Typography>
            {!compact && <MarkChip mark={kpi.mark} label={kpi.markLabel} />}
          </Stack>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2, rowGap: 0.25, mt: 0.5 }}>
            <Fact label="Target">{kpi.target || '—'}</Fact>
            {kpi.unit && <Fact label="Unit">{kpi.unit}</Fact>}
            <Fact label="Direction">{directionWord(kpi.direction, directions)}</Fact>
            <Fact label="Entered">{frequencyWord(kpi.frequency)}</Fact>
            <Fact label="Weight">{weightWord(kpi.weightPercent)}</Fact>
          </Box>
          {!compact && kpi.mark === 'CHANGED' && job && (
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.5 }}>
              The job says: {job.target || job.written || '—'}
              {jobWeightDiffers ? ` · weight ${weightWord(job.weightPercent)}` : ''}
            </Typography>
          )}
        </Box>
        {actions && (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>{actions}</Box>
        )}
      </Box>
      {!compact && kpi.targetChanges.length > 0 && (
        <Box component="ul" data-target-changes="" sx={{ listStyle: 'none', m: 0, mt: 0.75, p: 0, pl: 1.5, borderLeft: '2px solid var(--c-border)', display: 'grid', gap: 0.5 }}>
          {kpi.targetChanges.map((t) => (
            <Box component="li" key={t.id} sx={{ fontSize: 12.5, color: 'var(--c-text-2)', lineHeight: 1.5 }}>
              From {longDay(t.effectiveFrom)}: {t.from} → <b>{t.to}</b>
              {' — '}{t.reason}
              {t.by ? ` (${t.by})` : ''}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

/** A KRA heading for reading: the name and its weight. */
export function KraHeading({ kra, right }: { kra: Pick<PlanKra, 'name' | 'weightPercent'>; right?: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
      <Typography sx={{ fontSize: 14.5, fontWeight: 600, flex: '1 1 200px', minWidth: 0, overflowWrap: 'anywhere' }}>{kra.name}</Typography>
      {right ?? (
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', whiteSpace: 'nowrap' }}>Weight {weightWord(kra.weightPercent)}</Typography>
      )}
    </Box>
  );
}

/**
 * A whole plan, read-only: KRA headings with weights, the KPIs under each with
 * their targets, then the KPIs not under a KRA. For My place.
 */
export function PlanReadOnly({ plan, compact = true }: { plan: Plan; compact?: boolean }) {
  const blocks = [
    ...plan.kras.map((k) => ({ key: `kra-${k.id}`, head: <KraHeading kra={k} />, kpis: k.kpis })),
    ...(plan.ungroupedKpis.length
      ? [{ key: 'none', head: <KraHeading kra={{ name: 'Not under a KRA', weightPercent: null }} right={<span />} />, kpis: plan.ungroupedKpis }]
      : []),
  ];
  if (!blocks.length) {
    return <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-3)' }}>This plan has no KRAs or KPIs yet.</Typography>;
  }
  return (
    <Stack spacing={2}>
      {blocks.map((b) => (
        <Box key={b.key}>
          {b.head}
          {b.kpis.length > 0 ? (
            <Box sx={{ pl: { xs: 0, sm: 1.5 } }}>
              {b.kpis.map((k) => <KpiRow key={k.id} kpi={k} directions={plan.directions} compact={compact} />)}
            </Box>
          ) : (
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)', mt: 0.5, pl: { xs: 0, sm: 1.5 } }}>No KPIs under this KRA.</Typography>
          )}
        </Box>
      ))}
    </Stack>
  );
}
