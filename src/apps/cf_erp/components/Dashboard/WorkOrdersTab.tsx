/**
 * Dashboard › Work orders (2026-10-01): "where are the work orders being handled,
 * and how far are they". The operations handed to contractors, one card per work
 * order: who has it, which order line, operations assigned against done, whether
 * it is overdue, when work started and last moved, and what was done in the period.
 * A contractor summary sits above (click a row or a chip to look at one contractor).
 *
 * Completion is the tracker's: a step is done when it is done, a half-made step
 * counts half. A work order whose line is not released yet has operations assigned
 * and nothing to complete, so it says "not released", never 0 %. Work orders carry
 * no rate or amount, so there is no money here.
 */
import { useMemo, useState } from 'react';
import { Box, Chip, MenuItem, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import type { DashWorkOrder, WorkOrdersDashboard } from '../../api/dashboard';
import { agoText, dateLabel, pctText, periodLabel } from '../../lib/dashboard';
import { workOrdersTables } from '../../lib/dashboardExport';
import {
  NOT_RELEASED_HINT, WO_SORTS, WO_STATUS, WO_STATUS_FILTERS, filterWorkOrders, inWoStatus, opsText, sortWorkOrders, type WoSort, type WoStatusFilter,
} from '../../lib/dashboardWorkOrders';
import { useCompanySlug } from '../../hooks/useLoad';
import { appPath } from '../../navMeta';
import { Badge, EmptyState, Mono, Surface } from '../ui';
import { ProgressBar } from './charts';
import { Tile, TileGrid } from './DashParts';
import { DownloadMenu } from './DownloadMenu';

/** 1.5 → "1.5", 3 → "3": operations done in the period are fractions of steps. */
const opsNum = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

export function WorkOrdersTab({ data }: { data: WorkOrdersDashboard }) {
  const [contractor, setContractor] = useState<number | null>(null);
  const [status, setStatus] = useState<WoStatusFilter>('open');
  const [sort, setSort] = useState<WoSort>('attention');
  const [search, setSearch] = useState('');
  const p = data.plant;
  const shown = useMemo(() => sortWorkOrders(filterWorkOrders(data.workOrders, contractor, status, search), sort), [data.workOrders, contractor, status, sort, search]);
  const window = periodLabel(data.period.from, data.period.to);
  const year = data.period.today.slice(0, 4);
  const countOf = (f: WoStatusFilter) => data.workOrders.filter((w) => (contractor == null || w.contractor.id === contractor) && inWoStatus(w, f)).length;

  if (!data.workOrders.length) {
    return (
      <EmptyState title="No work orders yet"
        hint="Hand operations to a contractor from an order's Production › Contractors tab (the design must be frozen). Each contractor gets a work order per order line, and it shows here with how far it is." />
    );
  }

  return (
    <Box data-testid="work-orders-tab">
      <TileGrid>
        <Tile testId="tile-wo-open" label="Open work orders" value={p.open} sub={`of ${p.workOrders} · ${p.notReleased} not released yet`}
          hint="Draft, issued or in progress. A work order is released when its order line is released to the shop floor." />
        <Tile testId="tile-wo-contractors" label="Contractors active" value={p.contractorsActive} sub={`of ${p.contractors} with work orders`}
          hint="Contractors holding a work order that is issued or in progress." />
        <Tile testId="tile-wo-ops" label="Operations done" value={`${p.operationsDone}`}
          sub={<>of {p.operationsReleased} released · {p.operationsAssigned} assigned</>}
          hint="Operations (a piece × a process step) handed to contractors. Done = finished on the shop floor; assigned includes those on lines not released yet." />
        <Tile testId="tile-wo-pct" label="Complete" value={pctText(p.pct)} sub={p.pct == null ? 'nothing released to complete yet' : 'of the released operations'}
          hint="A half-made operation counts half. Work orders on lines that are not released are left out until they are.">
          {p.pct != null && <Box sx={{ mt: 0.75 }}><ProgressBar pct={p.pct} label="Work orders complete" /></Box>}
        </Tile>
        <Tile testId="tile-wo-overdue" label="Overdue" tone={p.overdue ? 'danger' : 'success'} value={p.overdue}
          sub={p.overdue ? 'open work orders past their due date' : 'none past their due date'}
          onClick={p.overdue ? () => setStatus('overdue') : undefined} />
        <Tile testId="tile-wo-period" label={`Done this period (${window})`} value={opsNum(p.periodOps)}
          sub="operations (part-made counts part)" hint="Progress the contractors' steps recorded inside the period, in whole operations." />
      </TileGrid>

      <Surface e={1} sx={{ mb: 2, overflowX: 'auto' }} data-testid="contractor-summary">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Contractor</TableCell><TableCell align="right">Work orders</TableCell><TableCell align="right">Open</TableCell>
              <TableCell sx={{ minWidth: 150 }}>Complete</TableCell><TableCell align="right">Operations done</TableCell>
              <TableCell align="right">Overdue</TableCell><TableCell align="right">Done this period</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.contractors.map((c) => (
              <TableRow key={c.id} hover selected={contractor === c.id} data-testid="contractor-row" data-contractor={c.name} sx={{ cursor: 'pointer' }}
                onClick={() => setContractor(contractor === c.id ? null : c.id)}>
                <TableCell>{c.name}{c.code ? <> <Mono muted>{c.code}</Mono></> : null}</TableCell>
                <TableCell align="right"><Mono>{c.workOrders}</Mono></TableCell>
                <TableCell align="right"><Mono>{c.open}</Mono></TableCell>
                <TableCell>
                  {c.pct == null ? <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>not released</Typography>
                    : <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Box sx={{ flex: 1 }}><ProgressBar pct={c.pct} height={6} label={`${c.name} complete`} /></Box><Mono>{pctText(c.pct)}</Mono></Box>}
                </TableCell>
                <TableCell align="right"><Mono>{c.done} of {c.steps}</Mono></TableCell>
                <TableCell align="right">{c.overdue ? <Box component="span" sx={{ color: 'var(--c-danger-800)', fontWeight: 600 }}>{c.overdue}</Box> : <Mono muted>0</Mono>}</TableCell>
                <TableCell align="right"><Mono>{opsNum(c.periodOps)}</Mono></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Surface>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
        {WO_STATUS_FILTERS.map((f) => (
          <Chip key={f.key} size="small" label={`${f.label} ${countOf(f.key)}`} color={status === f.key ? 'primary' : 'default'} variant={status === f.key ? 'filled' : 'outlined'}
            onClick={() => setStatus(f.key)} data-testid={`wo-status-${f.key}`} />
        ))}
        <Box sx={{ width: 8 }} />
        <Chip size="small" label="All contractors" color={contractor == null ? 'primary' : 'default'} variant={contractor == null ? 'filled' : 'outlined'} onClick={() => setContractor(null)} data-testid="contractor-chip-all" />
        {data.contractors.map((c) => (
          <Chip key={c.id} size="small" label={c.name} color={contractor === c.id ? 'primary' : 'default'} variant={contractor === c.id ? 'filled' : 'outlined'}
            onClick={() => setContractor(contractor === c.id ? null : c.id)} data-testid="contractor-chip" />
        ))}
        <Box sx={{ flex: 1 }} />
        <TextField size="small" placeholder="Work order, order, contractor" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ width: 220 }} inputProps={{ 'aria-label': 'Find a work order' }} />
        <TextField select size="small" value={sort} onChange={(e) => setSort(e.target.value as WoSort)} sx={{ width: 190 }} inputProps={{ 'aria-label': 'Sort work orders' }}>
          {WO_SORTS.map((s) => <MenuItem key={s.key} value={s.key}>{s.label}</MenuItem>)}
        </TextField>
        <DownloadMenu tab="work-orders" from={data.period.from} to={data.period.to} tables={() => workOrdersTables(shown, data.contractors)} />
      </Box>

      {shown.length === 0
        ? <EmptyState title="No work order matches" hint="Clear a filter or the search." />
        : <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>{shown.map((w) => <WorkOrderCard key={w.id} w={w} year={year} now={data.period.now} window={window} />)}</Box>}
    </Box>
  );
}

function WorkOrderCard({ w, year, now, window }: { w: DashWorkOrder; year: string; now: string; window: string }) {
  const company = useCompanySlug();
  const s = WO_STATUS[w.status];
  const edge = w.overdue ? 'var(--c-danger-600)' : w.status === 'done' ? 'var(--c-success-600)' : w.status === 'in_progress' ? 'var(--c-warning-600)' : 'var(--c-border)';
  return (
    <Surface e={1} data-testid="wo-card" data-wo={w.code} sx={{ borderLeft: `4px solid ${edge}`, overflow: 'hidden' }}>
      <Box sx={{ p: 2, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'minmax(220px, 1.1fr) minmax(240px, 1.3fr) minmax(200px, 1fr) minmax(180px, 0.9fr)' }, alignItems: 'start' }}>
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Mono sx={{ fontWeight: 600, fontSize: 14 }}><Link to={appPath(company, `work-orders/${w.id}`)} style={{ color: 'inherit' }} data-testid="wo-link">{w.code}</Link></Mono>
            <Badge family={s.family} label={s.label} />
            {w.overdue && <Badge family="danger" label={`${w.daysOverdue} day${w.daysOverdue === 1 ? '' : 's'} overdue`} noIcon />}
          </Box>
          <Typography noWrap sx={{ fontSize: 13, mt: 0.5 }} title={w.contractor.name}>{w.contractor.name}</Typography>
          <Box sx={{ fontSize: 12, color: 'var(--c-text-2)', mt: 0.5 }}>
            <Link to={appPath(company, `orders/${w.order.id}?tab=production&line=${w.line.id}`)} style={{ color: 'inherit' }}><Mono>{w.order.code}</Mono> · line {w.line.lineNo}</Link>
            {(w.line.itemName ?? w.line.itemCode) && <Box component="span"> · {w.line.itemName ?? w.line.itemCode}</Box>}
          </Box>
        </Box>

        <Box sx={{ minWidth: 0 }}>
          {w.released ? (
            <>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                <Typography data-testid="wo-pct" sx={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 600, lineHeight: 1 }}>{pctText(w.operations.pct)}</Typography>
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>complete</Typography>
              </Box>
              <Box sx={{ mt: 1 }}><ProgressBar pct={w.operations.pct ?? 0} label={`${w.code} complete`} /></Box>
              <Box data-testid="wo-ops" sx={{ fontSize: 12, color: 'var(--c-text-2)', mt: 0.75 }}>
                {opsText(w)} operations done{w.operations.inProgress ? ` · ${w.operations.inProgress} in progress` : ''}{w.operations.onHold ? ` · ${w.operations.onHold} on hold` : ''}
                {' · '}{w.pieces} piece{w.pieces === 1 ? '' : 's'}
              </Box>
            </>
          ) : (
            <Tooltip title={NOT_RELEASED_HINT}>
              <Box data-testid="wo-not-released">
                <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Not released yet</Typography>
                <Box sx={{ fontSize: 12, color: 'var(--c-text-2)', mt: 0.5 }}>{w.operations.assigned} operations assigned · {w.pieces} piece{w.pieces === 1 ? '' : 's'}</Box>
              </Box>
            </Tooltip>
          )}
        </Box>

        <Box sx={{ minWidth: 0, fontSize: 12, color: 'var(--c-text-2)', display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 1, rowGap: 0.25, alignContent: 'start' }}>
          <span>Due</span><span><b>{dateLabel(w.dueDate, year)}</b></span>
          <span>Started</span><span>{w.firstStartedAt ? dateLabel(w.firstStartedAt, year) : (w.startDate ? `planned ${dateLabel(w.startDate, year)}` : '—')}</span>
          <span>Last activity</span><span>{w.lastActivityAt ? agoText(w.lastActivityAt, now) : '—'}</span>
        </Box>

        <Box sx={{ minWidth: 0, fontSize: 12, color: 'var(--c-text-2)' }}>
          <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 0.5 }}>This period</Typography>
          <Box data-testid="wo-period"><b>{opsNum(w.period.opsDone)}</b> operations done<Box component="span" sx={{ color: 'var(--c-text-3)' }}> · {window}</Box></Box>
        </Box>
      </Box>
    </Surface>
  );
}
