import { useState, type ReactNode } from 'react';
import { Box, Button, TextField, Typography } from '@mui/material';
import TaskAltRounded from '@mui/icons-material/TaskAltRounded';
import { Link } from 'react-router-dom';
import type { CfApiError } from '../api/client';
import { applyLevel, getDashboard, nightCheck, putDeskSettings, qtyText, type DashTone, type LevelSuggestion } from '../api/storesDesk';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { appPath } from '../navMeta';
import { Badge, EmptyState, ErrorNotice, Mono, PageHeader, SkeletonRows, type Family } from '../components/ui';
import { FormDialog } from '../components/FormDialog';
import { useToast } from '../components/toastContext';

const KIND: Record<LevelSuggestion['kind'], { family: Family; label: string }> = {
  raise: { family: 'danger', label: 'Raise' }, new: { family: 'info', label: 'Set' }, lower: { family: 'warning', label: 'Lower' }, unused: { family: 'neutral', label: 'Not used' },
};
const MOVE: Record<string, string> = { receipt: 'Received', issue: 'Given out', transfer: 'Moved', adjustment: 'Audit', scrap: 'Scrapped', return: 'Returned' };
const TONE: Record<DashTone, Family> = { danger: 'danger', warning: 'warning', info: 'info' };
const dayText = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One block of the page: a heading with its number, what to do about it, and the few rows behind it. */
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
/** A number at the top of the page; a click opens its list. */
function Tile({ label, value, sub, tone, to, testid }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Family; to: string; testid: string }) {
  const color = tone === 'danger' ? 'var(--c-danger-700, #b42318)' : tone === 'warning' ? 'var(--c-warning-700, #b26a00)' : 'inherit';
  return (
    <Box component={Link} to={to} data-testid={testid} sx={{ display: 'block', textDecoration: 'none', color: 'inherit', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', background: 'var(--c-surface)', p: 1.5, minWidth: 0, '&:hover': { borderColor: 'var(--c-text-3)' } }}>
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{label}</Typography>
      <Box sx={{ fontSize: 24, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color, lineHeight: 1.3 }}>{value}</Box>
      {sub && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{sub}</Typography>}
    </Box>
  );
}

/**
 * STORES › DASHBOARD (user, 2026-11-23: "a proper dashboard for the stores with a bunch of alerts and notifications and
 * actions to be taken … checking on PRs, checking on out machines/tools, monthly audits") — it replaces Today
 * (same address, stores-today). The numbers on top; then what has to be done, worst first, each opening the screen that
 * does it; then the month's audit, purchase requests, material requests and what is out; then purchase orders to follow,
 * after-hours entries, levels from use and the stock book, as Today had them. Every limit is a company setting
 * (Setup › Settings › Stores). The only things written here are the morning check, an applied level and (Management) the
 * closed period.
 */
export default function StoresToday() {
  const toast = useToast();
  const company = useCompanySlug();
  const may = useIsPermitted();
  const canStore = may('cf_erp_stores|cf_erp_inventory_manage');
  const canCheck = may('cf_erp_stores|cf_erp_inventory_manage|cf_erp_production_manage|cf_erp_approve_stock_count');
  const canApply = may('cf_erp_catalog_manage|cf_erp_purchase|cf_erp_approve_stock_count');
  const canClose = may('cf_erp_approve_stock_count');
  const page = useLoad(() => getDashboard(), []);
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

  return (
    <Box sx={{ minWidth: 0 }}>
      <PageHeader title="Stores dashboard" subtitle="What needs doing, worst first — each line opens the screen that does it. Below it: the month's audit, requests, purchase requests and what is out." />
      <ErrorNotice error={page.error ?? error} onRetry={page.error ? page.reload : undefined} />
      {!d && !page.error && <SkeletonRows rows={6} />}
      {d && (() => {
        const { tiles: tl, audit: au, purchaseOrders: po, afterHours: night, outTooLong: out, belowMinimum: low, levels: lv } = d;
        return (
          <Box sx={{ display: 'grid', gap: 1.5 }} data-testid="stores-today">
            {/* the numbers */}
            <Box data-testid="dash-tiles" sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))', xl: 'repeat(8, minmax(0, 1fr))' }, gap: 1 }}>
              <Tile testid="tile-mrs" label="Material requests open" value={tl.mrsOpen} sub={d.mrs.stale ? `${d.mrs.stale} past ${dayText(d.mrs.staleDays)}` : undefined} tone={d.mrs.stale ? 'warning' : undefined} to={to('material-requests')} />
              <Tile testid="tile-prs" label="PRs with something to order" value={tl.prsToOrder} sub={d.prs.stale ? `${d.prs.stale} past ${dayText(d.prs.staleDays)}` : undefined} tone={d.prs.stale ? 'warning' : undefined} to={to('purchase-requests')} />
              <Tile testid="tile-po" label="Purchase orders late" value={tl.posLate} sub={po.dueSoon ? `${po.dueSoon} due soon` : undefined} tone={tl.posLate ? 'danger' : undefined} to={to('receive')} />
              <Tile testid="tile-out" label="Tools and returnables out" value={tl.outWith} sub={tl.outLong ? `${tl.outLong} out too long` : undefined} tone={tl.outLong ? 'warning' : undefined} to={to('stores-out')} />
              <Tile testid="tile-machines" label="Machines checked out" value={tl.machinesOut} sub={tl.machinesLate ? `${tl.machinesLate} past due` : undefined} tone={tl.machinesLate ? 'warning' : undefined} to={to('machine-custody')} />
              <Tile testid="tile-audit" label="Audit lines left this month" value={tl.auditLeft} sub={`of ${tl.auditTotal} · ${dayText(au.daysLeft)} left`} tone={au.late ? 'danger' : tl.auditLeft ? 'warning' : undefined} to={to('stores-count')} />
              <Tile testid="tile-low" label="Below minimum" value={tl.belowMin} tone={tl.belowMin ? 'warning' : undefined} to={to('stores?show=low')} />
              <Tile testid="tile-approval" label="Audits awaiting approval" value={au.pending} tone={au.pending ? 'warning' : undefined} to={to('approvals')} />
            </Box>

            {/* what has to be done */}
            <Line testid="dash-actions" title="To do" count={d.actions.length || undefined} hint={d.actions.length ? 'Worst first. Each opens the screen that does it.' : undefined}>
              {d.actions.length === 0 && <Box sx={{ p: 1.5 }}><EmptyState icon={<TaskAltRounded />} title="Nothing is waiting" hint="No request or PR is waiting, nothing is out too long, and the month's audit is done." /></Box>}
              {d.actions.map((a) => (
                <Row key={a.key}>
                  <Badge family={TONE[a.tone]} label={a.tone === 'danger' ? 'Now' : a.tone === 'warning' ? 'Soon' : 'Note'} noIcon />
                  <Box data-testid={`action-${a.key}`} sx={{ flex: '3 1 260px', minWidth: 0, overflowWrap: 'anywhere' }}>
                    <Box sx={{ fontWeight: 500 }}>{a.title}</Box>
                    <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{a.detail}</Typography>
                  </Box>
                  {a.link && <Button component={Link} to={to(a.link)} size="small" variant="outlined" sx={{ ml: 'auto' }}>Open</Button>}
                  {a.key === 'after-hours' && canCheck && <Button size="small" variant="contained" sx={{ ml: 'auto' }} disabled={busy === 'night'} onClick={() => void run('night', () => nightCheck(), 'Marked as checked.')} data-testid="night-check-top">Checked</Button>}
                </Row>
              ))}
            </Line>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5, alignItems: 'start' }}>
              {/* this month's audit */}
              <Line testid="dash-audit" tone={au.late ? 'danger' : au.left ? 'warning' : 'neutral'} title="This month's audit"
                hint={au.total ? `${au.audited} of ${au.total} lines audited · ${dayText(au.daysLeft)} left (to ${au.monthEnd})${au.lastCount ? ` · last saved ${au.lastCount}` : ''}` : 'Nothing in the store to audit this month.'}
                action={canStore && au.left > 0 ? <Button component={Link} to={to('stores-count')} variant="contained" size="small">Go to the audit</Button> : undefined}>
                <Box sx={{ p: 1.5, display: 'grid', gap: 0.75 }}>
                  <Box sx={{ height: 8, borderRadius: 4, background: 'var(--c-divider)', overflow: 'hidden' }} aria-label="Audited this month">
                    <Box sx={{ height: '100%', width: `${au.total ? Math.round((100 * au.audited) / au.total) : 100}%`, background: au.done ? 'var(--c-success, #2e7d32)' : au.late ? 'var(--c-danger, #c62828)' : 'var(--c-primary, #3b5bdb)' }} />
                  </Box>
                  <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                    {[au.done ? 'Done for the month.' : null, au.pending ? `${au.pending} waiting for approval` : null, au.rejected ? `${au.rejected} sent back this week` : null].filter(Boolean).join(' · ') || 'Saved in parts — every line once a month.'}
                  </Typography>
                </Box>
              </Line>

              {/* purchase requests */}
              <Line testid="dash-prs" tone={d.prs.stale ? 'warning' : 'neutral'} title="Purchase requests with something to order" count={d.prs.rows.length || undefined}
                hint={d.prs.rows.length ? `Oldest first; followed up after ${dayText(d.prs.staleDays)}.${d.prs.noVendor ? ` ${plural(d.prs.noVendor, 'has', 'have')} no vendor asked yet.` : ''}` : 'Every purchase request is ordered.'}
                action={<Button component={Link} to={to('purchase-requests')} variant="outlined" size="small">All PRs</Button>}>
                {d.prs.rows.map((p) => (
                  <Row key={p.id}>
                    <Box component={Link} to={to(`purchase-requests/${p.id}`)} sx={{ textDecoration: 'none' }}><Mono>{p.code}</Mono></Box>
                    <Box sx={{ flex: '2 1 160px', minWidth: 0, overflowWrap: 'anywhere' }}>{p.order?.code ?? '—'}
                      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{p.toOrder} of {plural(p.lines, 'line')} to order · {p.vendors ? `${plural(p.vendors, 'vendor')} asked` : 'no vendor yet'}{p.purchaseOrders ? ` · ${plural(p.purchaseOrders, 'PO')}` : ''}</Typography>
                    </Box>
                    <Box sx={{ ml: 'auto' }}><Badge family={p.age >= d.prs.staleDays ? 'warning' : 'neutral'} label={p.age ? `${dayText(p.age)} old` : 'today'} noIcon /></Box>
                  </Row>
                ))}
              </Line>

              {/* material requests */}
              <Line testid="dash-mrs" tone={d.mrs.stale ? 'warning' : 'neutral'} title="Material requests open" count={d.mrs.rows.length || undefined}
                hint={d.mrs.rows.length ? `Oldest first: give out what is in store, raise a PR for the rest. Followed up after ${dayText(d.mrs.staleDays)}.` : 'No material request is waiting.'}
                action={<Button component={Link} to={to('material-requests')} variant="outlined" size="small">All requests</Button>}>
                {d.mrs.rows.map((m) => (
                  <Row key={m.id}>
                    <Box component={Link} to={to(`material-requests/${m.id}`)} sx={{ textDecoration: 'none' }}><Mono>{m.code}</Mono></Box>
                    <Box sx={{ flex: '2 1 160px', minWidth: 0, overflowWrap: 'anywhere' }}>{m.order?.code ?? m.forLabel}
                      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{[m.statusLabel, m.contractor?.name ? `for ${m.contractor.name}` : null, m.purchaseRequest?.code].filter(Boolean).join(' · ')}</Typography>
                    </Box>
                    <Box sx={{ ml: 'auto' }}><Badge family={m.age >= d.mrs.staleDays ? 'warning' : 'neutral'} label={m.age ? `${dayText(m.age)} old` : 'today'} noIcon /></Box>
                  </Row>
                ))}
              </Line>

              {/* out: tools and returnables (Out with), machines checked out (Check-in / out) */}
              <Line testid="dash-out" tone={out.count || d.out.machinesLate ? 'warning' : 'neutral'} title="Out: tools, returnables and machines"
                hint={`${d.out.counts.all ?? 0} out with contractors, orders and people · ${out.count} out more than ${dayText(d.out.longDays)} · ${plural(d.out.machines.length, 'machine')} checked out${d.out.machinesLate ? `, ${d.out.machinesLate} past due` : ''}.`}
                action={<><Button component={Link} to={to('stores-out')} variant="outlined" size="small">Out with</Button><Button component={Link} to={to('machine-custody')} variant="outlined" size="small">Check-in / out</Button></>}>
                {out.rows.map((r) => (
                  <Row key={`c${r.id}`}>
                    <Box sx={{ flex: '2 1 200px', minWidth: 0, overflowWrap: 'anywhere' }}>{r.item.name}
                      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{r.holder ?? r.order ?? '—'} · since {r.issuedOn}</Typography></Box>
                    <Mono>{qtyText(r.left)} {r.item.uom}</Mono>
                    <Box sx={{ ml: 'auto' }}><Badge family="danger" label={`${dayText(r.daysOut)} out`} noIcon /></Box>
                  </Row>
                ))}
                {[...d.out.machines.filter((x) => x.overdue), ...d.out.machines.filter((x) => !x.overdue)].slice(0, 8).map((x) => (
                  <Row key={`m${x.id}`}>
                    <Box component={Link} to={to(`machines/${x.machine.id}`)} sx={{ textDecoration: 'none' }}><Mono>{x.machine.code ?? x.machine.name}</Mono></Box>
                    <Box sx={{ flex: '2 1 160px', minWidth: 0, overflowWrap: 'anywhere' }}>{x.machine.name}
                      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{[x.to?.kindLabel, x.to?.name, x.takenBy ? `taken by ${x.takenBy}` : null].filter(Boolean).join(' · ')}</Typography></Box>
                    <Box sx={{ ml: 'auto' }}>{x.overdue ? <Badge family="danger" label={`due ${x.dueOn}`} noIcon /> : <Badge family="neutral" label={x.dueOn ? `due ${x.dueOn}` : 'no due date'} noIcon />}</Box>
                  </Row>
                ))}
              </Line>
            </Box>

            {po.rows.length > 0 && (
              <Line testid="today-po" tone={po.late ? 'danger' : 'warning'} title="Purchase orders to follow up" count={po.late + po.dueSoon}
                hint={[po.late ? `${po.late} late` : null, po.dueSoon ? `${po.dueSoon} due within ${dayText(po.followDays ?? 3)}` : null].filter(Boolean).join(' · ')}
                action={<Button component={Link} to={to('receive')} variant="outlined" size="small">Receive</Button>}>
                {po.rows.slice(0, 10).map((p) => (
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

            {night.entries.length > 0 && (
              <Line testid="today-night" tone="warning" title="Entered after hours" count={night.entries.length}
                hint={`Outside ${night.hours.open}–${night.hours.close}. Look at each against the shelf, then mark them checked.`}
                action={canCheck ? <Button variant="contained" size="small" disabled={busy === 'night'} onClick={() => void run('night', () => nightCheck(), 'Marked as checked.')} data-testid="night-check">{busy === 'night' ? 'Saving…' : 'Checked'}</Button> : undefined}>
                {night.entries.slice(0, 15).map((e) => (
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

            {low.count > 0 && (
              <Line testid="today-low" tone="warning" title="Below minimum, nothing on order" count={low.count}
                hint="Raise a request so Purchase can order."
                action={<Button component={Link} to={to('stores?show=low')} variant="outlined" size="small">Open the list</Button>}>
                {low.rows.map((r) => (
                  <Row key={r.item.id}>
                    <Box sx={{ flex: '2 1 200px', minWidth: 0, overflowWrap: 'anywhere' }}>{r.item.name}</Box>
                    <Box sx={{ ml: 'auto' }}><Mono>{qtyText(r.balance)}</Mono> <Typography component="span" sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>of a minimum of {qtyText(r.min)} {r.item.uom}</Typography></Box>
                  </Row>
                ))}
              </Line>
            )}

            {/* Levels: always shown, because until the data is there it says how far it is. */}
            <Line testid="today-levels" title="Minimum and maximum, from actual use" count={lv.rows.length || undefined}
              hint={lv.rows.length
                ? `Worked out from what was given out. ${canApply ? 'Apply sets the item to these levels.' : 'Purchase or Management applies them.'}${lv.summary.waiting ? ` ${lv.summary.waiting} more item${lv.summary.waiting === 1 ? '' : 's'} do not have enough history yet.` : ''}`
                : lv.summary.itemsWithUse
                  ? `Not enough history yet: an item needs ${lv.gate.weeks} weeks of records and use in ${lv.gate.usedWeeks} of them. The longest so far is ${lv.summary.longestHistoryWeeks} week${lv.summary.longestHistoryWeeks === 1 ? '' : 's'}${lv.summary.weeksToFirst ? `; the first suggestions are about ${lv.summary.weeksToFirst} week${lv.summary.weeksToFirst === 1 ? '' : 's'} away` : ''}.`
                  : `Suggestions start on their own once an item has ${lv.gate.weeks} weeks of records and was given out in ${lv.gate.usedWeeks} of them. Nothing has been given out yet.`}>
              {lv.rows.length > 0 && lv.rows.slice(0, 25).map((s) => (
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
        );
      })()}
      <FormDialog open={closing} title="Close the stock book" subtitle="No receipt, give-out, audit or transfer can be dated on or before this date. Leave it empty to reopen everything." maxWidth="xs"
        onClose={() => setClosing(false)} submitLabel="Save"
        onSubmit={async () => { await putDeskSettings({ closedThrough: closeDate || null }); toast.success(closeDate ? `Closed up to ${closeDate}.` : 'Nothing is closed.'); page.reload(); }}>
        <TextField label="Closed up to and including" type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} InputLabelProps={{ shrink: true }} inputProps={{ max: d?.date }} />
      </FormDialog>
    </Box>
  );
}
