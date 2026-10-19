/**
 * Small parts every payroll screen shares (CF_HRMS_HIRING_SPEC.md §25.2): the
 * run's status chip, a person's warning chips, a salary breakdown table, the
 * "you need the right to see pay" page and the list of problems in words.
 */
import type { ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import LockOutlined from '@mui/icons-material/LockOutlined';
import { EmptyState, ToneBadge } from '@shared/ui';
import type { BreakdownLine, BreakdownTotals, RunStatus, RunWarning } from '../../api/payroll';
import { RUN_STATUS, kindWord, rupees, warningWord } from './payWords';

export function RunStatusBadge({ status }: { status: RunStatus }) {
  const s = RUN_STATUS[status] ?? { label: status, tone: 'neutral' as const, hint: '' };
  return <ToneBadge tone={s.tone} label={s.label} title={s.hint} noIcon />;
}

/** One chip per warning code (the server's sentence on hover). */
export function WarningChips({ warnings, max = 3 }: { warnings: RunWarning[]; max?: number }) {
  if (!warnings.length) return null;
  const byCode = new Map<string, string[]>();
  for (const w of warnings) byCode.set(w.code, [...(byCode.get(w.code) ?? []), w.text]);
  const codes = [...byCode.keys()];
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
      {codes.slice(0, max).map((c) => {
        const w = warningWord(c);
        return <ToneBadge key={c} tone={w.tone} label={w.label} title={byCode.get(c)?.join(' ')} noIcon />;
      })}
      {codes.length > max && <ToneBadge tone="neutral" label={`+${codes.length - max}`} title={codes.slice(max).map((c) => warningWord(c).label).join(', ')} noIcon />}
    </Box>
  );
}

/** A number in a table: tabular figures, right-aligned. */
export function Amount({ value, strong, muted }: { value: number | null | undefined; strong?: boolean; muted?: boolean }) {
  return (
    <Box
      component="span"
      sx={{
        fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', fontWeight: strong ? 600 : undefined,
        color: muted ? 'var(--c-text-3)' : undefined,
      }}
    >
      {rupees(value)}
    </Box>
  );
}

/** The plain refusal when payroll view is held but not the named pay view. */
export function NeedPayView({ what }: { what: string }) {
  return (
    <EmptyState
      icon={<LockOutlined />}
      title="You need the right to see pay"
      hint={`${what} show people’s pay. Ask the person who manages logins for the pay view right.`}
    />
  );
}

/** Problems (it cannot be worked out) and warnings (it can, but look) in words. */
export function ProblemList({ problems = [], warnings = [] }: { problems?: string[]; warnings?: string[] }) {
  if (!problems.length && !warnings.length) return null;
  return (
    <Stack spacing={0.75} data-pay-problems="">
      {problems.map((p) => (
        <Box key={`p${p}`} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          <ToneBadge tone="danger" label="Problem" noIcon />
          <Typography sx={{ fontSize: 13, overflowWrap: 'anywhere' }}>{p}</Typography>
        </Box>
      ))}
      {warnings.map((p) => (
        <Box key={`w${p}`} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          <ToneBadge tone="warning" label="Check" noIcon />
          <Typography sx={{ fontSize: 13, overflowWrap: 'anywhere' }}>{p}</Typography>
        </Box>
      ))}
    </Stack>
  );
}

/**
 * A simple table that scrolls inside its own box on a phone — never the page.
 * `cols` are CSS grid tracks; the first column takes the slack.
 */
export function MiniTable({
  head, rows, cols, foot, minWidth = 420,
}: {
  head: ReactNode[];
  rows: { key: string | number; cells: ReactNode[]; muted?: boolean }[];
  cols: string;
  foot?: ReactNode[];
  minWidth?: number;
}) {
  const rowSx = {
    display: 'grid', gridTemplateColumns: cols, gap: 1.5, alignItems: 'center', px: 1.5, py: 0.9,
    borderBottom: '1px solid var(--c-divider)', fontSize: 13.5,
  } as const;
  const align = (i: number) => (i === 0 ? 'left' : 'right');
  return (
    <Box sx={{ overflowX: 'auto', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', maxWidth: '100%' }}>
      <Box role="table" sx={{ minWidth }}>
        <Box role="row" sx={{ ...rowSx, background: 'var(--c-surface-2)', fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)', py: 0.75 }}>
          {head.map((h, i) => <Box role="columnheader" key={i} sx={{ textAlign: align(i) }}>{h}</Box>)}
        </Box>
        {rows.map((r) => (
          <Box role="row" key={r.key} sx={{ ...rowSx, color: r.muted ? 'var(--c-text-3)' : undefined }}>
            {r.cells.map((c, i) => <Box role="cell" key={i} sx={{ textAlign: align(i), minWidth: 0, overflowWrap: 'anywhere' }}>{c}</Box>)}
          </Box>
        ))}
        {foot && (
          <Box role="row" sx={{ ...rowSx, borderBottom: 0, fontWeight: 600, background: 'var(--c-surface-2)' }}>
            {foot.map((c, i) => <Box role="cell" key={i} sx={{ textAlign: align(i) }}>{c}</Box>)}
          </Box>
        )}
      </Box>
    </Box>
  );
}

/**
 * A salary breakdown: component, kind, a month, a year — and the CTC total.
 * Deductions in a structure are not part of CTC: they are shown, but under the line.
 */
export function BreakdownTable({
  lines, totals, monthlyCtc, annualCtc, showFormula,
}: {
  lines: (Pick<BreakdownLine, 'code' | 'name' | 'kind' | 'monthly' | 'annual' | 'frequency'> & Partial<Pick<BreakdownLine, 'formula' | 'overridden'>>)[];
  totals?: Partial<BreakdownTotals>;
  monthlyCtc?: number;
  annualCtc?: number;
  showFormula?: boolean;
}) {
  if (!lines.length) return <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>No lines to show.</Typography>;
  const ctcMonthly = monthlyCtc ?? totals?.ctcLines;
  return (
    <MiniTable
      cols={showFormula ? 'minmax(150px, 1.4fr) minmax(110px, 1fr) minmax(120px, 1.2fr) 110px 120px' : 'minmax(150px, 1.6fr) minmax(110px, 1fr) 110px 120px'}
      minWidth={showFormula ? 640 : 480}
      head={showFormula ? ['Component', 'Kind', 'Formula', 'A month', 'A year'] : ['Component', 'Kind', 'A month', 'A year']}
      rows={lines.map((l) => ({
        key: l.code,
        cells: [
          <Box key="n">
            <Typography component="span" sx={{ fontSize: 13.5, fontWeight: 500 }}>{l.name}</Typography>
            {l.frequency === 'YEARLY' && <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)' }}> · paid once a year</Typography>}
            {l.overridden && <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-warning-600)' }}> · fixed for this person</Typography>}
          </Box>,
          <Typography key="k" component="span" sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{kindWord(l.kind)}</Typography>,
          ...(showFormula ? [<Box key="f" component="span" sx={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--c-text-2)' }}>{l.formula}</Box>] : []),
          <Amount key="m" value={l.monthly} />,
          <Amount key="a" value={l.annual} />,
        ],
        muted: l.kind === 'DEDUCTION',
      }))}
      foot={ctcMonthly != null ? [
        'Cost to company', '', ...(showFormula ? [''] : []),
        <Amount key="m" value={ctcMonthly} strong />,
        <Amount key="a" value={annualCtc ?? ctcMonthly * 12} strong />,
      ] : undefined}
    />
  );
}

/** A label and a value, stacked — the facts row of a header. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: 11.5, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--c-text-3)' }}>{label}</Typography>
      <Box sx={{ fontSize: 14, fontWeight: 500, overflowWrap: 'anywhere' }}>{children}</Box>
    </Box>
  );
}
