/**
 * A person's KPIs at a glance — the org chart panel's scorecard (draft v1).
 *
 * Three states, all decided by the server (`GET …/scorecard`):
 *   PLAN   their plan holding the day: a header (period, status, plan score and
 *          band) that opens the plan; one row per KPI — a result dot, the name, its
 *          KRA as a small coloured chip (full name on hover), ▲ / ▼ / = and the
 *          target, the current value with how it is combined, a slim bar of the
 *          achievement and the gap in words ("3 pts short", "behind pace · ₹80,000
 *          short" — the pro-rating on hover). Colour = the result tone (scoring.js
 *          resultTone, the company's at-risk threshold): green met or beaten (on
 *          pace), amber not met but close, red below, grey no actual — never the
 *          only signal: the mark, the gap and the dot's title say it. The header's
 *          score keeps its band words, in the same tone rule;
 *   JOB    no plan yet: the job's KPIs with KRA and target, and one quiet line;
 *   NONE   nothing to show but the line.
 * Every number and every sentence is the server's (scoring.js): nothing is
 * computed here. Rows come in KRA order, so the chips form runs.
 */
import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Skeleton, Tooltip, Typography } from '@mui/material';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import { ToneBadge } from '@shared/ui';
import type { StatusTone } from '@shared/ui';
import type { ResultTone, Scorecard, ScorecardKpi, ScorecardKra } from '../../api/performance';
import { PLAN_STATUS_LABEL, PLAN_STATUS_TONE } from './planWords';

/** Met or beaten · not met but close · below · no actual yet. */
const RESULT_COLOUR: Record<ResultTone, StatusTone> = { MET: 'success', CLOSE: 'warning', BELOW: 'danger', NO_DATA: 'neutral' };

/** Rows shown before "Show all N". */
const VISIBLE = 6;
/** One colour per KRA within the card, in KRA order. */
const KRA_COLOURS = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `var(--c-chart-${n})`);

const pct = (n: number) => `${Math.round(n)}%`;

function KraChip({ kra, colour }: { kra: ScorecardKra | null; colour: string | null }) {
  const label = kra?.short ?? 'No KRA';
  const title = kra
    ? `KRA: ${kra.name}${kra.weightPercent != null ? ` · weight ${kra.weightPercent}%` : ''}`
    : 'This KPI is not under a KRA';
  return (
    <Tooltip title={title} arrow>
      <Box
        component="span"
        data-kra-chip=""
        tabIndex={0}
        aria-label={title}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          maxWidth: 170,
          px: 0.75,
          py: '1px',
          borderRadius: 999,
          border: '1px solid',
          borderColor: colour ?? 'var(--c-border)',
          color: 'var(--c-text-2)',
          fontSize: 11,
          lineHeight: 1.5,
          whiteSpace: 'nowrap',
          '&:focus-visible': { outline: '2px solid var(--c-primary-500)', outlineOffset: 1 },
        }}
      >
        <Box component="span" aria-hidden sx={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: colour ?? 'var(--c-text-3)' }} />
        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</Box>
      </Box>
    </Tooltip>
  );
}

/** The achievement as a slim bar, in the result's colour; capped visually at 100. */
function AchievementBar({ kpi }: { kpi: ScorecardKpi }) {
  const tone = RESULT_COLOUR[kpi.tone];
  const width = kpi.achievement == null ? 0 : Math.max(2, Math.min(100, kpi.achievement));
  return (
    <Box
      role="meter"
      aria-label={`Achievement of ${kpi.name}`}
      aria-valuemin={0}
      aria-valuemax={120}
      aria-valuenow={kpi.achievement ?? undefined}
      aria-valuetext={kpi.achievement == null ? 'No actual yet' : `${pct(kpi.achievement)}, ${kpi.toneLabel}`}
      sx={{ height: 4, borderRadius: 2, background: 'var(--c-surface-3)', overflow: 'hidden' }}
    >
      <Box sx={{ width: `${width}%`, height: '100%', borderRadius: 2, background: `var(--c-${tone}-600)` }} />
    </Box>
  );
}

/** ▲ higher is better · ▼ lower is better · = exactly · ↔ within a range · by a date; a target in words has none ("done or not"). */
const DIRECTION_MARK: Partial<Record<ScorecardKpi['direction'], { mark: string; words: string }>> = {
  HIGHER_BETTER: { mark: '▲', words: 'Higher is better' },
  LOWER_BETTER: { mark: '▼', words: 'Lower is better' },
  EXACT: { mark: '=', words: 'Exactly this' },
  TARGET_RANGE: { mark: '↔', words: 'Within the range' },
  DATE: { mark: 'by', words: 'Done on or before the date' },
};

/** The result's dot: never the only signal — it has a title, and the gap text says the same in words. */
function ResultDot({ kpi }: { kpi: ScorecardKpi }) {
  const tone = RESULT_COLOUR[kpi.tone];
  const words = kpi.achievement == null
    ? 'No actual yet'
    : `${kpi.pace ? (kpi.pace === 'ON_PACE' ? 'On pace' : 'Behind pace') : kpi.toneLabel} · ${pct(kpi.achievement)} achieved`;
  return (
    <Box
      component="span"
      role="img"
      aria-label={words}
      title={words}
      data-tone={kpi.tone}
      sx={{
        width: 9, height: 9, borderRadius: '50%', flexShrink: 0, alignSelf: 'center',
        background: kpi.tone === 'NO_DATA' ? 'transparent' : `var(--c-${tone}-600)`,
        border: kpi.tone === 'NO_DATA' ? '1.5px solid var(--c-neutral-600)' : 'none',
      }}
    />
  );
}

function KpiRow({ kpi, kra, colour, withValues }: { kpi: ScorecardKpi; kra: ScorecardKra | null; colour: string | null; withValues: boolean }) {
  const tone = RESULT_COLOUR[kpi.tone];
  const dir = DIRECTION_MARK[kpi.direction];
  return (
    <Box data-scorecard-kpi={kpi.key} sx={{ py: 0.75, borderTop: '1px solid var(--c-border)' }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
        {withValues && <ResultDot kpi={kpi} />}
        <Typography sx={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, lineHeight: 1.35, overflowWrap: 'anywhere' }}>
          {kpi.name}
        </Typography>
        <KraChip kra={kra} colour={colour} />
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 1, rowGap: 0.25, mt: 0.25, fontSize: 12, color: 'var(--c-text-2)' }}>
        <Box component="span" title={`Target: ${kpi.target}${dir ? ` (${dir.words.toLowerCase()})` : ' (done or not)'}`}>
          {dir && (
            <Box component="span" aria-label={dir.words} sx={{ color: 'var(--c-text)', mr: 0.4, fontSize: 10.5 }}>{dir.mark}</Box>
          )}
          <Box component="span" sx={{ color: 'var(--c-text)' }}>{kpi.targetShort}</Box>
        </Box>
        {withValues && (
          kpi.current ? (
            <Box component="span">
              now <Box component="span" sx={{ color: 'var(--c-text)' }}>{kpi.current}</Box>
            </Box>
          ) : (
            <Box component="span" sx={{ color: 'var(--c-text-3)', fontStyle: 'italic' }}>No actual yet</Box>
          )
        )}
      </Box>
      {withValues && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
          <Box sx={{ flex: 1, minWidth: 60 }}><AchievementBar kpi={kpi} /></Box>
          {kpi.gapText && (
            <Box
              component="span"
              data-gap=""
              title={kpi.paceNote ?? `${pct(kpi.achievement ?? 0)} achieved · ${kpi.toneLabel}`}
              sx={{ fontSize: 12, fontWeight: 600, color: `var(--c-${tone}-800)`, flexShrink: 0, textAlign: 'right', cursor: kpi.paceNote ? 'help' : undefined }}
            >
              {kpi.gapText}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

export function KpiScorecard({
  load,
  planHref,
  reloadKey,
}: {
  /** The read — HR's (`performanceApi.scorecard`) or a manager login's (`getTeamScorecard`). */
  load: () => Promise<Scorecard>;
  /** Where the plan opens, for this login. */
  planHref?: (planId: number) => string | null;
  /** Read again when this changes (the person, the day). */
  reloadKey: string;
}) {
  const [data, setData] = useState<Scorecard | null>(null);
  const [failed, setFailed] = useState(false);
  const [all, setAll] = useState(false);

  useEffect(() => {
    let live = true;
    setData(null);
    setFailed(false);
    setAll(false);
    load()
      .then((d) => { if (live) setData(d); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
    // `load` is a fresh closure on every render; the key says when it means something new.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  // Out of the login's department (403) or any other failure: the section stays away, as the rating line does.
  if (failed) return null;
  if (!data) {
    return (
      <Box aria-busy="true" data-scorecard="loading">
        <Skeleton variant="rounded" height={20} sx={{ mb: 0.75 }} />
        <Skeleton variant="rounded" height={40} />
      </Box>
    );
  }

  const kraOf = new Map(data.kras.map((k, i) => [k.key, { kra: k, colour: KRA_COLOURS[i % KRA_COLOURS.length] }]));
  const rows = all ? data.kpis : data.kpis.slice(0, VISIBLE);
  const withValues = data.source === 'PLAN';
  const plan = data.plan;
  const href = plan && planHref ? planHref(plan.id) : null;

  const header = plan && (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 0.75, rowGap: 0.5 }}>
          <Typography component="span" sx={{ fontSize: 13.5, fontWeight: 600 }}>{plan.period.name}</Typography>
          <ToneBadge tone={PLAN_STATUS_TONE[plan.status]} noIcon label={PLAN_STATUS_LABEL[plan.status]} title={`The plan is ${PLAN_STATUS_LABEL[plan.status].toLowerCase()}`} />
          {plan.score != null && (
            <ToneBadge tone={RESULT_COLOUR[plan.tone]} label={`${plan.score}% · ${plan.bandLabel}`} title="The plan's score so far" />
          )}
        </Box>
        {plan.scoreLine && (
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mt: 0.25 }}>{plan.scoreLine}</Typography>
        )}
      </Box>
      {href && <ChevronRightRounded aria-hidden sx={{ fontSize: 20, color: 'var(--c-text-2)' }} />}
    </Box>
  );

  return (
    <Box data-scorecard={data.source} sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
      {plan && (href ? (
        <Box
          component={RouterLink}
          to={href}
          aria-label={`Open the plan for ${plan.period.name}`}
          sx={{
            display: 'block', px: 1, py: 0.75, color: 'inherit', textDecoration: 'none', background: 'var(--c-surface-2)',
            '&:hover': { background: 'var(--c-surface-3)' },
            '&:focus-visible': { outline: '2px solid var(--c-primary-500)', outlineOffset: -2 },
          }}
        >
          {header}
        </Box>
      ) : (
        <Box sx={{ px: 1, py: 0.75, background: 'var(--c-surface-2)' }}>{header}</Box>
      ))}
      <Box sx={{ px: 1, pb: 0.5 }}>
        {data.line && (
          <Typography data-scorecard-line="" sx={{ fontSize: 12.5, color: 'var(--c-text-2)', lineHeight: 1.5, py: 0.75 }}>
            {data.line}
          </Typography>
        )}
        {data.source === 'JOB' && data.kpis.length === 0 && (
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', pb: 0.75 }}>Their job has no KPIs yet.</Typography>
        )}
        {rows.map((k) => {
          const hit = k.kraKey ? kraOf.get(k.kraKey) : undefined;
          return <KpiRow key={k.key} kpi={k} kra={hit?.kra ?? null} colour={hit?.colour ?? null} withValues={withValues} />;
        })}
        {data.kpis.length > VISIBLE && (
          <Box sx={{ borderTop: '1px solid var(--c-border)', pt: 0.5 }}>
            <Button size="small" onClick={() => setAll((v) => !v)}>
              {all ? 'Show fewer' : `Show all ${data.kpis.length}`}
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  );
}

export default KpiScorecard;
