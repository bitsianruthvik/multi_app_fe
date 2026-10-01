/**
 * Dashboard › By order. Every confirmed order, the ones in trouble first:
 * how far it is (%, tonnes made, dispatched), its date against a forecast,
 * where in the flow it is and which operation has the most work left, what is
 * blocked and why, material, and money. Expand a card for its lines, each line's piece-code tree (OrderTree) and the
 * material still short.
 *
 * A forecast is an estimate and says so: at the last 14 days' pace, or the
 * planner's latest ship week when every line is planned — the later of the two.
 */
import { useMemo, useState } from 'react';
import { Box, Chip, Collapse, IconButton, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import type { DashOrder, OrdersDashboard, RiskStatus } from '../../api/dashboard';
import {
  MATERIAL_STATUS, RISK, RISK_FILTERS, croreText, dateLabel, daysLeftText, filterOrders, hoursText, pctText, periodLabel, progressBasisText, tonnesText,
} from '../../lib/dashboard';
import { rupeeText } from '../../lib/money';
import { useCompanySlug } from '../../hooks/useLoad';
import { appPath } from '../../navMeta';
import { Badge, EmptyState, Mono, Surface } from '../ui';
import { getOrderTreeRows } from '../../api/dashboard';
import { ordersTables, treeTable } from '../../lib/dashboardExport';
import { ProgressBar, StageStrip } from './charts';
import { DownloadMenu, type ExtraDownload } from './DownloadMenu';
import { EstimateTag, MiniHead, Tile, TileGrid } from './DashParts';
import { OrderTree } from './OrderTree';

export function OrdersTab({ data }: { data: OrdersDashboard }) {
  const [risk, setRisk] = useState<'all' | RiskStatus>('all');
  const [search, setSearch] = useState('');
  const t = data.totals;
  const shown = useMemo(() => filterOrders(data.orders, risk, search), [data.orders, risk, search]);
  const window = periodLabel(data.period.from, data.period.to);
  const year = data.period.today.slice(0, 4);
  // The tab holds orders, lines and stages; the piece tree below them is read only when asked for (a few thousand rows).
  const allLevels: ExtraDownload[] = [
    { key: 'tree-xlsx', as: 'xlsx', label: 'Excel with every piece (all levels)', hint: 'The tables above plus one row per piece and part of the orders shown',
      build: async () => [...ordersTables(shown, data.withMoney), treeTable((await getOrderTreeRows()).rows, new Set(shown.map((o) => o.code)))] },
    { key: 'tree-csv', as: 'csv-all', label: 'CSV — every piece (all levels)', hint: 'One row per piece and part of the orders shown',
      build: async () => [treeTable((await getOrderTreeRows()).rows, new Set(shown.map((o) => o.code)))] },
  ];
  const count: Record<string, number> = { all: t.orders, late: t.late, at_risk: t.atRisk, on_track: t.onTrack, no_forecast: t.noForecast, no_date: t.noDate };

  if (!data.orders.length) {
    return <EmptyState title="No confirmed orders" hint="An order shows here once it is confirmed; its progress follows as its lines are released and worked." />;
  }
  const madePct = t.tonnes > 0 ? (t.tonnesMade / t.tonnes) * 100 : 0;
  const dispPct = t.tonnes > 0 ? (t.tonnesDispatched / t.tonnes) * 100 : 0;

  return (
    <Box data-testid="orders-tab">
      <TileGrid>
        <Tile testId="tile-orders" label="Confirmed orders" value={t.orders} sub={`${t.lines} lines`} />
        <Tile testId="tile-risk" label="Late or at risk" tone={t.late ? 'danger' : t.atRisk ? 'warning' : 'success'} value={t.late + t.atRisk}
          sub={<>{t.late} late · {t.atRisk} at risk · {t.onTrack} on track{t.noForecast ? ` · ${t.noForecast} no forecast` : ''}</>}
          onClick={() => setRisk(t.late ? 'late' : 'at_risk')} estimate
          hint="Against each order's committed date. The forecast is worked out from the last 14 days' pace and the plan — see each card." />
        <Tile testId="tile-tonnes" label="Tonnes made" value={tonnesText(t.tonnesMade, '—')}
          sub={<>of {tonnesText(t.tonnes, '—')}{!t.tonnesComplete ? ' (some lines not weighed)' : ''} · {tonnesText(t.tonnesDispatched, '—')} dispatched</>}>
          <Box sx={{ mt: 0.75 }}><ProgressBar pct={madePct} inner={dispPct} label="Tonnes made and dispatched of the order book" /></Box>
        </Tile>
        <Tile testId="tile-period" label={`This period (${window})`} value={tonnesText(t.periodTonnesMade, '—')}
          sub={`made · ${tonnesText(t.periodTonnesDispatched, '—')} dispatched`} />
        <Tile testId="tile-blocked" label="Blocked now" tone={t.onHold ? 'danger' : t.materialSteps ? 'warning' : 'default'} value={t.onHold + t.materialSteps}
          sub={`${t.onHold} steps on hold · ${t.materialSteps} waiting for material`}
          hint="On hold: someone put the step on hold. Waiting for material: the step's material is not reserved yet (it may be in stock, on order, or still to buy)." />
        {data.withMoney && (
          <Tile testId="tile-money" label="Order book (before tax)" value={croreText(t.value, 'not priced')}
            hint={`Order value ${rupeeText(t.value, 0, 'not priced')} · invoiced ${rupeeText(t.invoiced, 0, '—')} · our material issued ${rupeeText(t.materialCost, 0, '—')}. All before GST.`}
            sub={<>{croreText(t.invoiced)} invoiced · {croreText(t.materialCost)} material issued{t.valueComplete === false ? ' · some lines have no rate' : ''}</>} />
        )}
      </TileGrid>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
        {RISK_FILTERS.map((f) => (count[f.key] || f.key === 'all') ? (
          <Chip key={f.key} size="small" label={`${f.label} ${count[f.key] ?? 0}`} color={risk === f.key ? 'primary' : 'default'} variant={risk === f.key ? 'filled' : 'outlined'} onClick={() => setRisk(f.key)} />
        ) : null)}
        <Box sx={{ flex: 1 }} />
        <TextField size="small" placeholder="Order, customer, title" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ width: 220 }} inputProps={{ 'aria-label': 'Find an order' }} />
        <DownloadMenu tab="orders" from={data.period.from} to={data.period.to} tables={() => ordersTables(shown, data.withMoney)} extra={allLevels} />
      </Box>

      {shown.length === 0
        ? <EmptyState title="No order matches" hint="Clear the filter or the search." />
        : <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>{shown.map((o) => <OrderCard key={o.id} o={o} year={year} withMoney={data.withMoney} window={window} />)}</Box>}
    </Box>
  );
}

function OrderCard({ o, year, withMoney, window }: { o: DashOrder; year: string; withMoney: boolean; window: string }) {
  const company = useCompanySlug();
  const [open, setOpen] = useState(false);
  const r = RISK[o.risk.status];
  const made = o.tonnes.total ? ((o.tonnes.made ?? 0) / o.tonnes.total) * 100 : 0;
  const disp = o.tonnes.total ? ((o.tonnes.dispatched ?? 0) / o.tonnes.total) * 100 : 0;
  const edge = r.family === 'danger' ? 'var(--c-danger-600)' : r.family === 'warning' ? 'var(--c-warning-600)' : r.family === 'success' ? 'var(--c-success-600)' : 'var(--c-border)';
  return (
    <Surface e={1} data-testid="order-card" data-order={o.code} sx={{ borderLeft: `4px solid ${edge}`, overflow: 'hidden' }}>
      <Box sx={{ p: 2, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'minmax(220px, 1.1fr) minmax(200px, 1fr) minmax(240px, 1.3fr) minmax(200px, 1fr)' }, alignItems: 'start' }}>
        {/* Who and when */}
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Mono sx={{ fontWeight: 600, fontSize: 14, color: 'var(--c-text)' }}>
              <Link to={appPath(company, `orders/${o.id}`)} style={{ color: 'inherit' }}>{o.code}</Link>
            </Mono>
            <Badge family={r.family} label={r.label} title={`${r.help} ${o.risk.why}`} />
          </Box>
          <Typography noWrap sx={{ fontSize: 13, color: 'var(--c-text)', mt: 0.5 }} title={o.title ?? ''}>{o.customer?.name ?? (o.orderType === 'stock' ? 'Stock order' : '—')}{o.title ? ` · ${o.title}` : ''}</Typography>
          <Box sx={{ fontSize: 12, color: 'var(--c-text-2)', mt: 0.75, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 1, rowGap: 0.25 }}>
            <span>Committed</span>
            <span><b>{dateLabel(o.committedDate, year)}</b>{o.risk.daysLeft != null && <Box component="span" sx={{ color: o.risk.daysLeft < 0 ? 'var(--c-danger-800)' : 'inherit' }}> · {daysLeftText(o.risk.daysLeft)}</Box>}</span>
            <span>Forecast</span>
            <span data-testid="order-forecast">
              {o.forecast.date ? <><b>{dateLabel(o.forecast.date, year)}</b>{o.risk.slipDays != null && o.risk.slipDays > 0 && <Box component="span" sx={{ color: 'var(--c-warning-800)' }}> · {o.risk.slipDays} d after</Box>}</> : 'not enough data'}
              {' '}<EstimateTag title={`At the last 14 days' pace (${pctText(o.forecast.pacePctPerWeek)} a week): ${o.forecast.pace ? dateLabel(o.forecast.pace, year) : 'no recent progress'}. Plan: ${o.forecast.plan ? `ships in the week of ${dateLabel(o.forecast.plan, year)}` : `${o.forecast.planned} of ${o.lines.total} lines planned`}. The later of the two is shown.`} />
            </span>
          </Box>
        </Box>

        {/* How far */}
        <Box sx={{ minWidth: 0 }}>
          <Tooltip title={progressBasisText(o)}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
              <Typography data-testid="order-pct" sx={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 600, lineHeight: 1 }}>{pctText(o.progress.pct)}</Typography>
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>complete</Typography>
            </Box>
          </Tooltip>
          <Box sx={{ mt: 1 }}><ProgressBar pct={o.progress.pct} label={`${o.code} complete`} /></Box>
          <Box sx={{ fontSize: 12, color: 'var(--c-text-2)', mt: 1 }}>
            <Box>{tonnesText(o.tonnes.made, '—')} made of {tonnesText(o.tonnes.total)} · {tonnesText(o.tonnes.dispatched, '—')} dispatched</Box>
            <Box sx={{ mt: 0.5 }}><ProgressBar pct={made} inner={disp} height={5} label={`${o.code} tonnes made and dispatched`} /></Box>
            <Box sx={{ mt: 0.5 }}>{o.lines.released} of {o.lines.total} lines released{o.period.pctGained > 0 ? ` · +${pctText(o.period.pctGained)} in ${window}` : ''}</Box>
          </Box>
        </Box>

        {/* Where in the flow */}
        <Box sx={{ minWidth: 0 }}>
          <MiniHead>Where it is</MiniHead>
          <StageStrip stages={o.stages} bottleneckId={o.bottleneck?.operationId} />
          {o.bottleneck && (
            <Box data-testid="order-bottleneck" sx={{ fontSize: 12, color: 'var(--c-text-2)', mt: 0.75 }}>
              Most work left: <b>{o.bottleneck.name}</b> — {o.bottleneck.basis === 'work' ? `${hoursText(o.bottleneck.workMinLeft)} (${pctText(o.bottleneck.sharePct)} of what is left)` : `${o.bottleneck.stepsLeft} steps`}
            </Box>
          )}
        </Box>

        {/* What stops it, and money */}
        <Box sx={{ minWidth: 0, fontSize: 12, color: 'var(--c-text-2)', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <MiniHead>Blocked</MiniHead>
          {o.blocked.onHold === 0 && o.blocked.materialSteps === 0 && o.material.toBuy === 0 && <Box sx={{ color: 'var(--c-success-800)' }}>Nothing on hold, material in hand</Box>}
          {o.blocked.onHold > 0 && (
            <Box data-testid="order-holds" sx={{ color: 'var(--c-danger-800)' }}>
              {o.blocked.onHold} on hold — {o.blocked.holdReasons.map((h) => `${h.reason}${h.count > 1 ? ` ×${h.count}` : ''}`).join(', ')}
            </Box>
          )}
          {(o.material.inStock + o.material.onOrder + o.material.toBuy) > 0 && (
            <Box data-testid="order-material">
              Material: {[o.material.inStock && `${o.material.inStock} in stock to reserve`, o.material.onOrder && `${o.material.onOrder} on order`, o.material.toBuy && `${o.material.toBuy} to buy`].filter(Boolean).join(' · ')}
              {o.blocked.materialSteps > 0 && ` (${o.blocked.materialSteps} steps wait)`}
            </Box>
          )}
          {withMoney && o.money && (
            <Box sx={{ mt: 0.5 }}>
              <MiniHead>Money (before tax)</MiniHead>
              <Box>Value <b>{rupeeText(o.money.value, 0, 'not priced')}</b>{!o.money.valueComplete && o.money.value != null ? ' (part)' : ''}</Box>
              <Box>Invoiced {rupeeText(o.money.invoiced)}{o.money.draftInvoices ? ` · ${o.money.draftInvoices} draft` : ''}</Box>
              <Box>Material issued {rupeeText(o.money.materialCost)}{o.money.materialUncostedRows ? ' + some not costed' : ''}</Box>
            </Box>
          )}
        </Box>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 0.5, borderTop: '1px solid var(--c-divider)', background: 'var(--c-surface-2)', cursor: 'pointer' }}
        onClick={() => setOpen((v) => !v)} role="button" aria-expanded={open} tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((v) => !v); } }}>
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', flex: 1 }}>{open ? 'Hide' : 'Show'} {o.lines.total} line{o.lines.total === 1 ? '' : 's'}{o.material.short.length ? ' and short material' : ''}</Typography>
        <IconButton size="small" aria-label={open ? 'Hide lines' : 'Show lines'} sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--t-fast) var(--ease)' }}><ExpandMoreRounded fontSize="small" /></IconButton>
      </Box>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ p: 2, overflowX: 'auto' }} data-testid="order-lines">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Line</TableCell><TableCell>Item</TableCell><TableCell align="right">Done</TableCell><TableCell align="right">Tonnes</TableCell>
                <TableCell align="right">Made / dispatched</TableCell><TableCell>Committed</TableCell><TableCell>Plan ships</TableCell>
                <TableCell align="right">Hours this period</TableCell>{withMoney && <TableCell align="right">Value</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {o.lineRows.map((l) => (
                <TableRow key={l.id}>
                  <TableCell><Mono>{l.lineNo}</Mono></TableCell>
                  <TableCell sx={{ maxWidth: 260 }}>
                    <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.item.code ? <Mono chip>{l.item.code}</Mono> : null} {l.item.name}</Box>
                    {!l.released && <Box sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>not released yet</Box>}
                    {l.noSteps && <Box sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>nothing to make — supplied from stock</Box>}
                  </TableCell>
                  <TableCell align="right"><Mono>{pctText(l.progressPct)}</Mono></TableCell>
                  <TableCell align="right"><Mono>{tonnesText(l.tonnes)}</Mono></TableCell>
                  <TableCell align="right"><Mono>{l.made} / {l.delivered} of {l.quantity}</Mono></TableCell>
                  <TableCell>{dateLabel(l.committedDate ?? o.committedDate, year)}</TableCell>
                  <TableCell>{l.plan ? `week of ${dateLabel(l.plan.last, year)}` : <Box component="span" sx={{ color: 'var(--c-text-3)' }}>not planned</Box>}</TableCell>
                  <TableCell align="right"><Mono>{hoursText(l.period.workMin)}</Mono></TableCell>
                  {withMoney && <TableCell align="right"><Mono>{rupeeText(l.amount, 0, 'no rate')}</Mono></TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <OrderTree order={o} />
          {o.material.short.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <MiniHead>Material not reserved yet</MiniHead>
              <Table size="small">
                <TableHead><TableRow><TableCell>Item</TableCell><TableCell align="right">Short</TableCell><TableCell align="right">Free now</TableCell><TableCell align="right">On order</TableCell><TableCell>State</TableCell></TableRow></TableHead>
                <TableBody>
                  {o.material.short.map((m) => (
                    <TableRow key={m.itemId}>
                      <TableCell>{m.code ? <Mono chip>{m.code}</Mono> : null} {m.name}</TableCell>
                      <TableCell align="right"><Mono>{m.short} {m.uom}</Mono></TableCell>
                      <TableCell align="right"><Mono>{m.freeNow}</Mono></TableCell>
                      <TableCell align="right"><Mono>{m.onOrder}</Mono>{m.expected ? <Box sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>due {dateLabel(m.expected, year)}</Box> : null}</TableCell>
                      <TableCell><Badge family={MATERIAL_STATUS[m.status].family} label={MATERIAL_STATUS[m.status].label} noIcon /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)', mt: 0.75 }}>Free stock and open purchase orders are the plant's, shared by every order — the Tracker reserves them.</Typography>
            </Box>
          )}
        </Box>
      </Collapse>
    </Surface>
  );
}
