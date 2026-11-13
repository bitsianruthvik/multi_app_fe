import { Box, Button, IconButton, Tooltip, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import CloseRounded from '@mui/icons-material/CloseRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import CheckCircleOutlineRounded from '@mui/icons-material/CheckCircleOutlineRounded';
import { useCompanySlug } from '../../hooks/useLoad';
import { appPath } from '../../navMeta';
import { Badge, Mono } from '../ui';
import { dayText, tonnesText, type ContractorStanding, type Pivot, type PlanAlert, type Reason, type WorkOrderStanding } from '../../api/planning';

/** PLANNING's small shared pieces (§105): the bars of a month's weeks, the orders × operations pivot, alerts, reasons. */

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };

const PLAN_STATUS: Record<string, { label: string; family: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }> = {
  draft: { label: 'Draft', family: 'neutral' }, pending: { label: 'With the MD', family: 'warning' }, frozen: { label: 'Frozen', family: 'success' },
  superseded: { label: 'Replaced', family: 'neutral' }, rejected: { label: 'Sent back', family: 'danger' }, published: { label: 'Published', family: 'info' }, closed: { label: 'Closed', family: 'neutral' },
};
export function PlanStatus({ status }: { status: string | null | undefined }) {
  if (!status) return <Badge family="neutral" noIcon label="Not planned" />;
  const s = PLAN_STATUS[status] ?? { label: status, family: 'neutral' as const };
  return <Badge family={s.family} noIcon label={s.label} />;
}

/**
 * The weeks of a month as bars: up to three figures a week — the frozen plan, the week's own plan, what was done.
 * Tonnes above each group; the scale is the largest figure.
 */
export interface WeekBar { no: number; start: string; end: string; frozen?: number | null; planned?: number | null; done?: number | null; current?: boolean; onClick?: () => void; active?: boolean }
export function WeekBars({ weeks, height = 120 }: { weeks: WeekBar[]; height?: number }) {
  const max = Math.max(1, ...weeks.flatMap((w) => [w.frozen ?? 0, w.planned ?? 0, w.done ?? 0]));
  const bar = (v: number | null | undefined, color: string, title: string) => (v == null ? null : (
    <Tooltip title={`${title}: ${tonnesText(v)}`}><Box sx={{ width: 14, height: `${Math.max(2, (v / max) * height)}px`, background: color, borderRadius: '3px 3px 0 0' }} /></Tooltip>
  ));
  const has = (k: 'frozen' | 'planned' | 'done') => weeks.some((w) => w[k] != null);
  return (
    <Box data-testid="week-bars">
      <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))`, gap: 1, alignItems: 'end' }}>
        {weeks.map((w) => (
          <Box key={w.no} onClick={w.onClick} role={w.onClick ? 'button' : undefined} tabIndex={w.onClick ? 0 : undefined}
            onKeyDown={(e) => { if (w.onClick && (e.key === 'Enter' || e.key === ' ')) w.onClick(); }}
            sx={{ minWidth: 0, cursor: w.onClick ? 'pointer' : 'default', borderRadius: 'var(--r-sm)', p: 0.75, background: w.active ? 'var(--c-primary-50)' : 'transparent', outline: w.current ? '1px dashed var(--c-primary-300)' : 'none', '&:hover': w.onClick ? { background: 'var(--c-primary-50)' } : undefined }}>
            <Typography sx={{ fontSize: 12, textAlign: 'center', color: 'var(--c-text-2)', fontVariantNumeric: 'tabular-nums', minHeight: 18 }}>
              {[w.frozen, w.planned, w.done].filter((x) => x != null).map((x) => Math.round(Number(x))).join(' · ') || '—'}
            </Typography>
            <Box sx={{ display: 'flex', gap: '3px', alignItems: 'flex-end', justifyContent: 'center', height }}>
              {bar(w.frozen, 'var(--c-neutral-300, #cbd5e1)', 'Frozen month plan')}
              {bar(w.planned, 'var(--c-primary-500)', 'Week plan')}
              {bar(w.done, 'var(--c-success-500)', 'Done')}
            </Box>
            <Typography sx={{ fontSize: 12.5, textAlign: 'center', fontWeight: w.current ? 600 : 500, mt: 0.5 }}>Week {w.no}{w.current ? ' · now' : ''}</Typography>
            <Typography noWrap sx={{ fontSize: 11.5, textAlign: 'center', color: 'var(--c-text-3)' }}>{dayText(w.start)}{w.start !== w.end ? ` – ${dayText(w.end)}` : ''}</Typography>
          </Box>
        ))}
      </Box>
      <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mt: 1, fontSize: 12, color: 'var(--c-text-2)' }}>
        {has('frozen') && <Legend color="var(--c-neutral-300, #cbd5e1)" label="Frozen month plan" />}
        {has('planned') && <Legend color="var(--c-primary-500)" label="Week plan" />}
        {has('done') && <Legend color="var(--c-success-500)" label="Done" />}
        <span>tonnes finished</span>
      </Box>
    </Box>
  );
}
const Legend = ({ color, label }: { color: string; label: string }) => (
  <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}><Box component="span" sx={{ width: 10, height: 10, borderRadius: '2px', background: color, display: 'inline-block' }} />{label}</Box>
);

/** Orders × operations (machine types): hours, with the tonnes each order finishes. What the MD reads. */
export function PivotTable({ pivot, tonnesLabel = 'Finishes' }: { pivot: Pivot; tonnesLabel?: string }) {
  const company = useCompanySlug();
  if (!pivot.rows.length) return <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)', p: 2 }}>No work planned in this span.</Typography>;
  const total = (fn: string) => Math.round(pivot.rows.reduce((t, r) => t + (r.hours[fn] ?? 0), 0));
  const max = Math.max(1, ...pivot.rows.flatMap((r) => Object.values(r.hours)));
  const cell = { p: '6px 10px', borderBottom: '1px solid var(--c-divider)', fontSize: 13, textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' };
  const head = { ...cell, fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)', background: 'var(--c-surface-2, #f8fafc)', position: 'sticky' as const, top: 0, whiteSpace: 'nowrap' as const };
  return (
    <Box sx={{ overflowX: 'auto', maxWidth: '100%' }} data-testid="plan-pivot">
      <Box component="table" sx={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: '100%' }}>
        <thead>
          <tr>
            <Box component="th" sx={{ ...head, textAlign: 'left', left: 0, zIndex: 2 }}>Order</Box>
            <Box component="th" sx={head}>{tonnesLabel}</Box>
            {pivot.fns.map((f) => <Box component="th" key={f.fn} sx={head} title={f.name}>{f.name.length > 18 ? `${f.name.slice(0, 17)}…` : f.name}</Box>)}
          </tr>
        </thead>
        <tbody>
          {pivot.rows.map((r) => (
            <tr key={r.orderId}>
              <Box component="td" sx={{ ...cell, textAlign: 'left', position: 'sticky', left: 0, background: 'var(--c-surface, #fff)', whiteSpace: 'nowrap' }}>
                <Box component={Link} to={appPath(company, `orders/${r.orderId}`)} sx={linkSx}><Mono>{r.code}</Mono></Box>
                {r.customer && <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)', ml: 0.75 }}>{r.customer}</Typography>}
              </Box>
              <Box component="td" sx={{ ...cell, fontWeight: 600 }}>{r.tonnes ? tonnesText(r.tonnes) : '—'}</Box>
              {pivot.fns.map((f) => {
                const h = r.hours[f.fn] ?? 0;
                return <Box component="td" key={f.fn} sx={{ ...cell, background: h ? `rgba(37, 99, 235, ${0.06 + 0.3 * (h / max)})` : undefined, color: h ? 'var(--c-text)' : 'var(--c-text-3)' }}>{h ? `${Math.round(h)} h` : '·'}</Box>;
              })}
            </tr>
          ))}
          <tr>
            <Box component="td" sx={{ ...cell, textAlign: 'left', fontWeight: 600, position: 'sticky', left: 0, background: 'var(--c-surface, #fff)' }}>All orders</Box>
            <Box component="td" sx={{ ...cell, fontWeight: 700 }}>{tonnesText(pivot.rows.reduce((t, r) => t + r.tonnes, 0))}</Box>
            {pivot.fns.map((f) => <Box component="td" key={f.fn} sx={{ ...cell, fontWeight: 600 }}>{total(f.fn)} h</Box>)}
          </tr>
        </tbody>
      </Box>
    </Box>
  );
}

const SEV_ICON = { danger: <ErrorOutlineRounded fontSize="small" />, warning: <WarningAmberRounded fontSize="small" />, info: <InfoOutlined fontSize="small" /> };
const SEV_COLOR = { danger: 'var(--c-danger-700)', warning: 'var(--c-warning-700)', info: 'var(--c-info-700, #0369a1)' };

/** What changed against the plan: one row each, the worst first; a link to the thing; dismiss. */
export function AlertList({ alerts, onDismiss, onAct }: { alerts: PlanAlert[]; onDismiss?: (a: PlanAlert) => void; onAct?: (a: PlanAlert) => void }) {
  const company = useCompanySlug();
  if (!alerts.length) {
    return <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'var(--c-success-700)', fontSize: 13.5, p: 0.5 }}><CheckCircleOutlineRounded fontSize="small" />Nothing has changed against the plan.</Box>;
  }
  return (
    <Box data-testid="plan-alerts" sx={{ display: 'grid' }}>
      {alerts.map((a, i) => (
        <Box key={a.id} sx={{ display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr) auto', gap: 1, py: 1, borderTop: i ? '1px solid var(--c-divider)' : 'none', alignItems: 'start', opacity: a.status === 'open' ? 1 : 0.55 }}>
          <Box sx={{ color: SEV_COLOR[a.severity], pt: 0.25 }}>{SEV_ICON[a.severity]}</Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>
              {a.link ? <Box component={Link} to={appPath(company, a.link)} sx={linkSx}>{a.title}</Box> : a.title}
              {a.impactTonnes ? <Box component="span" sx={{ ml: 1, fontWeight: 500, color: SEV_COLOR[a.severity] }}>{tonnesText(a.impactTonnes)} at stake</Box> : null}
            </Typography>
            {a.detail && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{a.detail}</Typography>}
            {a.kind === 'consumable_short' && onAct && a.status === 'open' && <Button size="small" sx={{ mt: 0.5, ml: -0.5 }} onClick={() => onAct(a)}>Raise an MR for it</Button>}
          </Box>
          {onDismiss && a.status === 'open' && <Tooltip title="Seen — hide it"><IconButton size="small" aria-label={`Dismiss: ${a.title}`} onClick={() => onDismiss(a)}><CloseRounded fontSize="small" /></IconButton></Tooltip>}
        </Box>
      ))}
    </Box>
  );
}

const KIND_WORD: Record<string, string> = { material: 'Material', machine: 'Machine', hours: 'Hours', contractor: 'Contractor', changed: 'Order changed', behind: 'Behind', done: 'Done', ahead: 'Ahead' };
export function ReasonList({ rows, tone, empty }: { rows: Reason[]; tone: 'good' | 'bad'; empty: string }) {
  if (!rows.length) return <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>{empty}</Typography>;
  return (
    <Box sx={{ display: 'grid' }}>
      {rows.map((r, i) => (
        <Box key={`${r.kind}-${r.unit}-${i}`} sx={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr) auto', gap: 1, py: 0.75, borderTop: i ? '1px solid var(--c-divider)' : 'none', alignItems: 'baseline' }}>
          <Box><Badge family={tone === 'good' ? 'success' : r.kind === 'material' || r.kind === 'machine' ? 'danger' : 'warning'} noIcon label={KIND_WORD[r.kind] ?? r.kind} /></Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 13.5 }}>{r.unit}{r.order ? <Box component="span" sx={{ color: 'var(--c-text-3)' }}> · {r.order}</Box> : null}</Typography>
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{r.cause}{r.progress != null && r.progress > 0 && r.progress < 1 ? ` — ${Math.round(r.progress * 100)} % done` : ''}</Typography>
          </Box>
          <Mono>{r.tonnes ? tonnesText(r.tonnes) : ''}</Mono>
        </Box>
      ))}
    </Box>
  );
}

/** Contractors: what they hold, what is done, how far behind, the machines they have. */
export function ContractorTable({ contractors, workOrders }: { contractors: ContractorStanding[]; workOrders?: WorkOrderStanding[] }) {
  const company = useCompanySlug();
  if (!contractors.length) return <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>No contractor work orders yet. Give parts of a production order to a contractor from the production order's page.</Typography>;
  const cell = { p: '6px 10px', borderBottom: '1px solid var(--c-divider)', fontSize: 13 };
  const num = { ...cell, textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' };
  return (
    <Box sx={{ overflowX: 'auto' }} data-testid="plan-contractors">
      <Box component="table" sx={{ borderCollapse: 'collapse', minWidth: '100%' }}>
        <thead><tr>{['Contractor', 'Work orders', 'Given', 'Done', '', 'Behind', 'Machines with them'].map((h, i) => <Box component="th" key={h || i} sx={{ ...cell, fontSize: 12, color: 'var(--c-text-2)', textAlign: i > 0 && i < 6 ? 'right' : 'left' }}>{h}</Box>)}</tr></thead>
        <tbody>
          {contractors.map((c) => (
            <tr key={c.id}>
              <Box component="td" sx={{ ...cell, fontWeight: 500 }}>{c.name}</Box>
              <Box component="td" sx={num}>{c.workOrders}{c.overdue ? <Box component="span" sx={{ color: 'var(--c-danger-700)' }}> · {c.overdue} overdue</Box> : null}</Box>
              <Box component="td" sx={num}>{tonnesText(c.tonnes)}</Box>
              <Box component="td" sx={num}>{tonnesText(c.paid)}</Box>
              <Box component="td" sx={{ ...num, width: 110 }}>
                <Box sx={{ height: 6, borderRadius: 3, background: 'var(--c-divider)', overflow: 'hidden' }}><Box sx={{ width: `${Math.min(100, c.donePct ?? 0)}%`, height: '100%', background: c.behind > 0.01 ? 'var(--c-warning-500)' : 'var(--c-success-500)' }} /></Box>
              </Box>
              <Box component="td" sx={{ ...num, color: c.behind > 0.01 ? 'var(--c-danger-700)' : 'var(--c-text-3)' }}>{c.behind > 0.01 ? tonnesText(c.behind) : '—'}</Box>
              <Box component="td" sx={cell}>{c.machines.length ? c.machines.map((m) => <Box key={m.id} component={Link} to={appPath(company, `machines/${m.id}`)} sx={{ ...linkSx, mr: 1 }}><Mono>{m.code}</Mono></Box>) : <Box component="span" sx={{ color: 'var(--c-text-3)' }}>—</Box>}</Box>
            </tr>
          ))}
        </tbody>
      </Box>
      {workOrders && workOrders.length > 0 && (
        <Box sx={{ mt: 1.5, display: 'grid', gap: 0.25 }}>
          {workOrders.slice(0, 12).map((w) => (
            <Typography key={w.id} sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
              <Mono>{w.code}</Mono> · {w.contractor.name}{w.productionOrder ? ` · ${w.productionOrder.code}` : ''} · {tonnesText(w.paid)} of {tonnesText(w.tonnes)}{w.due ? ` · due ${dayText(w.due)}` : ''}
              {w.overdue ? <Box component="span" sx={{ color: 'var(--c-danger-700)' }}> · overdue</Box> : w.behind > 0.01 ? <Box component="span" sx={{ color: 'var(--c-warning-700)' }}> · {tonnesText(w.behind)} behind</Box> : null}
            </Typography>
          ))}
        </Box>
      )}
    </Box>
  );
}
