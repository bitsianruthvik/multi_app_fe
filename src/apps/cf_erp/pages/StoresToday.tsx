import { useState, type ReactNode } from 'react';
import { Box, Button, TextField, Typography } from '@mui/material';
import TaskAltRounded from '@mui/icons-material/TaskAltRounded';
import { Link } from 'react-router-dom';
import type { CfApiError } from '../api/client';
import { applyLevel, getToday, nightCheck, putDeskSettings, qtyText, type LevelSuggestion } from '../api/storesDesk';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { appPath } from '../navMeta';
import { Badge, EmptyState, ErrorNotice, Mono, PageHeader, SkeletonRows, type Family } from '../components/ui';
import { FormDialog } from '../components/FormDialog';
import { useToast } from '../components/toastContext';

const KIND: Record<LevelSuggestion['kind'], { family: Family; label: string }> = {
  raise: { family: 'danger', label: 'Raise' }, new: { family: 'info', label: 'Set' }, lower: { family: 'warning', label: 'Lower' }, unused: { family: 'neutral', label: 'Not used' },
};
const MOVE: Record<string, string> = { receipt: 'Received', issue: 'Given out', transfer: 'Moved', adjustment: 'Count', scrap: 'Scrapped', return: 'Returned' };
const dayText = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

/** One line of the page: a heading with its number, what to do about it, and the few rows behind it. */
function Line({ testid, tone = 'neutral', title, count, hint, action, children }: {
  testid: string; tone?: Family; title: string; count?: ReactNode; hint?: ReactNode; action?: ReactNode; children?: ReactNode;
}) {
  const edge = tone === 'danger' ? 'var(--c-danger, #c62828)' : tone === 'warning' ? 'var(--c-warning, #b26a00)' : 'var(--c-border)';
  return (
    <Box data-testid={testid} sx={{ border: '1px solid var(--c-border)', borderLeft: `4px solid ${edge}`, borderRadius: 'var(--r-md)', background: 'var(--c-surface)', minWidth: 0 }}>
      <Box sx={{ p: 1.5, display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
        <Box sx={{ flex: '1 1 240px', minWidth: 0 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{title}</Typography>
            {count != null && <Mono sx={{ fontSize: 15, fontWeight: 600 }}>{count}</Mono>}
          </Box>
          {hint && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mt: 0.25 }}>{hint}</Typography>}
        </Box>
        {action && <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>{action}</Box>}
      </Box>
      {children && <Box sx={{ borderTop: '1px solid var(--c-divider)' }}>{children}</Box>}
    </Box>
  );
}
function Row({ children }: { children: ReactNode }) {
  return <Box sx={{ px: 1.5, py: 1, display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', fontSize: 13.5, borderBottom: '1px solid var(--c-divider)', '&:last-child': { borderBottom: 0 }, minWidth: 0 }}>{children}</Box>;
}

/**
 * STORES › TODAY (init.sql §112) — what needs doing, each line opening the screen that does it. A line with nothing to
 * do is not shown. Everything is read from what the other screens keep; the only things written here are the morning
 * check, an applied level, and (Management) the closed period.
 */
export default function StoresToday() {
  const toast = useToast();
  const company = useCompanySlug();
  const may = useIsPermitted();
  const canStore = may('cf_erp_stores|cf_erp_inventory_manage');
  const canCheck = may('cf_erp_stores|cf_erp_inventory_manage|cf_erp_production_manage|cf_erp_approve_stock_count');
  const canApply = may('cf_erp_catalog_manage|cf_erp_purchase|cf_erp_approve_stock_count');
  const canClose = may('cf_erp_approve_stock_count');
  const page = useLoad(() => getToday(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<CfApiError | null>(null);
  const [closing, setClosing] = useState(false);
  const [closeDate, setCloseDate] = useState('');
  const d = page.data;

  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key); setError(null);
    try { await fn(); toast.success(done); page.reload(); } catch (e) { setError(e as CfApiError); } finally { setBusy(null); }
  };
  const to = (path: string) => appPath(company, path);

  const po = d?.purchaseOrders;
  const night = d?.afterHours;
  const cnt = d?.count;
  const out = d?.outTooLong;
  const low = d?.belowMinimum;
  const lv = d?.levels;
  const countOpen = !!cnt && (cnt.dailyDue || !cnt.weeklyDone || cnt.pending > 0 || cnt.rejected > 0);
  const nothing = !!d && !po!.rows.length && !night!.entries.length && !countOpen && !out!.count && !low!.count && !lv!.rows.length;

  return (
    <Box sx={{ minWidth: 0 }}>
      <PageHeader title="Today" subtitle="What the store needs to do today. Each line opens the screen that does it; a line with nothing to do is not shown." />
      <ErrorNotice error={page.error ?? error} onRetry={page.error ? page.reload : undefined} />
      {!d && !page.error && <SkeletonRows rows={6} />}
      {d && (
        <Box sx={{ display: 'grid', gap: 1.5 }} data-testid="stores-today">
          {nothing && <EmptyState icon={<TaskAltRounded />} title="Nothing is waiting" hint="No purchase order to chase, nothing entered after hours, the counts are done and nothing is out too long." />}

          {po!.rows.length > 0 && (
            <Line testid="today-po" tone={po!.late ? 'danger' : 'warning'} title="Purchase orders to follow up" count={po!.late + po!.dueSoon}
              hint={[po!.late ? `${po!.late} late` : null, po!.dueSoon ? `${po!.dueSoon} due within ${dayText(po!.followDays ?? 3)}` : null].filter(Boolean).join(' · ')}
              action={<Button component={Link} to={to('receive')} variant="outlined" size="small">Receive</Button>}>
              {po!.rows.slice(0, 10).map((p) => (
                <Row key={p.id}>
                  <Box component={Link} to={to(`purchase-orders/${p.id}`)} sx={{ flex: '0 0 auto', textDecoration: 'none' }}><Mono>{p.code}</Mono></Box>
                  <Box sx={{ flex: '2 1 200px', minWidth: 0, overflowWrap: 'anywhere' }}>
                    {p.supplier ?? '—'}
                    <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{p.items.join(', ')}{p.lines > p.items.length ? ` and ${p.lines - p.items.length} more` : ''}</Typography>
                  </Box>
                  <Box sx={{ ml: 'auto' }}>{p.daysLate > 0 ? <Badge family="danger" label={`${dayText(p.daysLate)} late`} noIcon /> : <Badge family="warning" label={p.dueIn === 0 ? 'due today' : `due in ${dayText(p.dueIn)}`} noIcon />}</Box>
                </Row>
              ))}
            </Line>
          )}

          {night!.entries.length > 0 && (
            <Line testid="today-night" tone="warning" title="Entered after hours" count={night!.entries.length}
              hint={`Outside ${night!.hours.open}–${night!.hours.close}. Look at each against the shelf, then mark them checked.`}
              action={canCheck ? <Button variant="contained" size="small" disabled={busy === 'night'} onClick={() => void run('night', () => nightCheck(), 'Marked as checked.')} data-testid="night-check">{busy === 'night' ? 'Saving…' : 'Checked'}</Button> : undefined}>
              {night!.entries.slice(0, 15).map((e) => (
                <Row key={e.id}>
                  <Box component={Link} to={to(`movements/${e.id}`)} sx={{ flex: '0 0 auto', textDecoration: 'none' }}><Mono>{e.code}</Mono></Box>
                  <Box sx={{ flex: '2 1 200px', minWidth: 0, overflowWrap: 'anywhere' }}>
                    {MOVE[e.type] ?? e.type}: {e.item ?? '—'}{e.lines > 1 ? ` and ${e.lines - 1} more` : ''}
                    <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{[e.given?.label, e.person, e.by ? `entered by ${e.by}` : null].filter(Boolean).join(' · ')}</Typography>
                  </Box>
                  <Box sx={{ ml: 'auto', fontSize: 12.5, color: 'var(--c-text-2)' }}>{e.at}</Box>
                </Row>
              ))}
            </Line>
          )}

          {countOpen && (
            <Line testid="today-count" tone={cnt!.rejected ? 'danger' : 'warning'} title="Count"
              hint={[
                cnt!.dailyDue ? `Today's count is not done: ${cnt!.toCount} item${cnt!.toCount === 1 ? '' : 's'} moved since ${cnt!.lastCount ?? 'the start'}` : null,
                !cnt!.weeklyDone ? "this week's group is not counted yet" : null,
                cnt!.pending ? `${cnt!.pending} waiting for approval` : null,
                cnt!.rejected ? `${cnt!.rejected} sent back` : null,
              ].filter(Boolean).join(' · ')}
              action={canStore ? <>
                {cnt!.dailyDue && <Button component={Link} to={to('stores-count')} variant="contained" size="small">Count today</Button>}
                {!cnt!.weeklyDone && <Button component={Link} to={to('stores-count?kind=weekly')} variant="outlined" size="small">Weekly group</Button>}
              </> : undefined} />
          )}

          {out!.count > 0 && (
            <Line testid="today-out" tone="danger" title="Out too long" count={out!.count}
              hint={`Past its due date, or out more than ${out!.longDays} days. Ask for it back, or record it worn out or lost.`}
              action={<Button component={Link} to={to('stores-out?holder=overdue')} variant="outlined" size="small">Open the list</Button>}>
              {out!.rows.map((r) => (
                <Row key={r.id}>
                  <Box sx={{ flex: '2 1 200px', minWidth: 0, overflowWrap: 'anywhere' }}>{r.item.name}
                    <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{r.holder ?? '—'} · since {r.issuedOn}</Typography></Box>
                  <Mono>{qtyText(r.left)} {r.item.uom}</Mono>
                  <Box sx={{ ml: 'auto' }}><Badge family="danger" label={`${dayText(r.daysOut)} out`} noIcon /></Box>
                </Row>
              ))}
            </Line>
          )}

          {low!.count > 0 && (
            <Line testid="today-low" tone="warning" title="Below minimum, nothing on order" count={low!.count}
              hint="Raise a request so Purchase can order."
              action={<Button component={Link} to={to('stores?show=low')} variant="outlined" size="small">Open the list</Button>}>
              {low!.rows.map((r) => (
                <Row key={r.item.id}>
                  <Box sx={{ flex: '2 1 200px', minWidth: 0, overflowWrap: 'anywhere' }}>{r.item.name}</Box>
                  <Box sx={{ ml: 'auto' }}><Mono>{qtyText(r.balance)}</Mono> <Typography component="span" sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>of a minimum of {qtyText(r.min)} {r.item.uom}</Typography></Box>
                </Row>
              ))}
            </Line>
          )}

          {/* Levels: always shown, because until the data is there it says how far it is. */}
          <Line testid="today-levels" title="Minimum and maximum, from actual use" count={lv!.rows.length || undefined}
            hint={lv!.rows.length
              ? `Worked out from what was given out. ${canApply ? 'Apply sets the item to these levels.' : 'Purchase or Management applies them.'}${lv!.summary.waiting ? ` ${lv!.summary.waiting} more item${lv!.summary.waiting === 1 ? '' : 's'} do not have enough history yet.` : ''}`
              : lv!.summary.itemsWithUse
                ? `Not enough history yet: an item needs ${lv!.gate.weeks} weeks of records and use in ${lv!.gate.usedWeeks} of them. The longest so far is ${lv!.summary.longestHistoryWeeks} week${lv!.summary.longestHistoryWeeks === 1 ? '' : 's'}${lv!.summary.weeksToFirst ? `; the first suggestions are about ${lv!.summary.weeksToFirst} week${lv!.summary.weeksToFirst === 1 ? '' : 's'} away` : ''}.`
                : `Suggestions start on their own once an item has ${lv!.gate.weeks} weeks of records and was given out in ${lv!.gate.usedWeeks} of them. Nothing has been given out yet.`}>
            {lv!.rows.length > 0 && lv!.rows.slice(0, 25).map((s) => (
              <Row key={s.item.id}>
                <Badge family={KIND[s.kind].family} label={KIND[s.kind].label} noIcon />
                <Box sx={{ flex: '3 1 240px', minWidth: 0, overflowWrap: 'anywhere' }}>{s.item.name}
                  <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{s.why}</Typography></Box>
                <Box sx={{ flex: '0 0 auto', textAlign: 'right' }}>
                  <Mono>{qtyText(s.suggested.min)} / {qtyText(s.suggested.max)}</Mono> <Typography component="span" sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{s.item.uom}</Typography>
                  <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>now {s.current.min == null ? 'not set' : `${qtyText(s.current.min)} / ${qtyText(s.current.max)}`}</Typography>
                </Box>
                {canApply && <Button size="small" variant="outlined" disabled={busy === `lv${s.item.id}`} data-testid="level-apply"
                  onClick={() => void run(`lv${s.item.id}`, () => applyLevel(s.item.id, s.suggested), `${s.item.name}: minimum ${qtyText(s.suggested.min)}, maximum ${qtyText(s.suggested.max)}.`)}>Apply</Button>}
              </Row>
            ))}
          </Line>

          {/* The book: closed up to a date; entries may be dated a few days back. */}
          <Line testid="today-period" title="The stock book"
            hint={`${d.settings.closedThrough ? `Closed up to ${d.settings.closedThrough}: nothing can be dated on or before it.` : 'No period is closed yet.'} An entry can be dated at most ${dayText(d.settings.backdateDays)} back.`}
            action={canClose ? <Button size="small" variant="outlined" onClick={() => { setCloseDate(d.settings.closedThrough ?? ''); setClosing(true); }} data-testid="period-close">Close a period</Button> : undefined} />
        </Box>
      )}
      <FormDialog open={closing} title="Close the stock book" subtitle="No receipt, give-out, count or transfer can be dated on or before this date. Leave it empty to reopen everything." maxWidth="xs"
        onClose={() => setClosing(false)} submitLabel="Save"
        onSubmit={async () => { await putDeskSettings({ closedThrough: closeDate || null }); toast.success(closeDate ? `Closed up to ${closeDate}.` : 'Nothing is closed.'); page.reload(); }}>
        <TextField label="Closed up to and including" type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} InputLabelProps={{ shrink: true }} inputProps={{ max: d?.date }} />
      </FormDialog>
    </Box>
  );
}
