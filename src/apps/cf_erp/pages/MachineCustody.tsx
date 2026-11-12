import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Link, useNavigate } from 'react-router-dom';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import PrecisionManufacturingOutlined from '@mui/icons-material/PrecisionManufacturingOutlined';
import { cfApi, qs } from '../api/client';
import type { Machine } from '../api/types';
import { listCheckouts, listToRegister, type CheckoutRow, type ToRegister } from '../api/machineLife';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useUrlParam } from '../hooks/useUrlState';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { appPath } from '../navMeta';
import { rupeeText } from '../lib/money';
import { Badge, EmptyState, ErrorNotice, InfoTip, Mono, PageHeader, StatStrip } from '../components/ui';
import { DataTable, type DataColumn } from '../components/DataTable';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { CheckInDialog, CheckOutDialog, RegisterDialog, STORES_TAG } from '../components/MachineLife';
import { useToast } from '../components/toastContext';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };
const wallText = (s: string | null) => (s ? new Date(s.replace(' ', 'T')).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

/**
 * STORES › CHECK-IN / OUT (§104, user 2026-11-12): "Store should be able to check in and check out the machines and
 * tools to various people and projects." Out now (overdue first), To register (machines and durable tools received on
 * a GRN, waiting for their serial and type), and the history of every check-out.
 */
export default function MachineCustody() {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const canStores = useIsPermitted()(STORES_TAG);
  const [tab, setTab] = useUrlParam('tab', 'out');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const t = window.setTimeout(() => setDebounced(search), 250); return () => window.clearTimeout(t); }, [search]);
  const out = useLoad(() => listCheckouts({ open: true, search: debounced }), [debounced]);
  const history = useLoad(() => (tab === 'history' ? listCheckouts({ open: false, search: debounced }) : Promise.resolve(null)), [tab, debounced]);
  const todo = useLoad(() => listToRegister(), []);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkingIn, setCheckingIn] = useState<CheckoutRow | null>(null);
  const [registering, setRegistering] = useState<ToRegister | null>(null);
  const reload = () => { out.reload(); history.reload(); todo.reload(); invalidateNavCounts(); };
  const outRows = out.data?.rows ?? [];
  const overdue = outRows.filter((r) => r.overdue).length;
  const toRegister = (todo.data ?? []).reduce((t, l) => t + l.left, 0);

  const outCols: DataColumn<CheckoutRow>[] = [
    { key: 'machine', header: 'Machine or tool', alwaysVisible: true, sortValue: (r) => r.machine.code, exportValue: (r) => r.machine.code,
      render: (r) => <><Box component={Link} to={appPath(company, `machines/${r.machine.id}`)} onClick={(e: React.MouseEvent) => e.stopPropagation()} sx={linkSx}><Mono chip>{r.machine.code}</Mono></Box> <Typography component="span" sx={{ fontSize: 13 }}>{r.machine.name}</Typography>{r.machine.kind === 'tool' && <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)' }}> · tool</Typography>}</> },
    { key: 'to', header: 'With', sortValue: (r) => r.to.name ?? r.to.code, exportValue: (r) => r.to.name ?? r.to.code,
      render: (r) => <Box><Box sx={{ fontWeight: 500 }}>{r.to.name ?? r.to.code}</Box><Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{r.to.kindLabel}{r.to.code && r.to.name ? ` · ${r.to.code}` : ''}</Typography></Box> },
    { key: 'taken', header: 'Taken by', sortValue: (r) => r.takenBy, render: (r) => r.takenBy ?? '—' },
    { key: 'out', header: 'Out since', sortValue: (r) => r.outAt, render: (r) => wallText(r.outAt) },
    { key: 'due', header: 'Due back', sortValue: (r) => r.dueOn ?? '9999', render: (r) => (r.dueOn ? (r.overdue ? <Badge family="danger" noIcon label={`Overdue · ${r.dueOn}`} /> : r.dueOn) : '—') },
    ...(tab === 'history' ? [{ key: 'in', header: 'Back', sortValue: (r: CheckoutRow) => r.inAt, render: (r: CheckoutRow) => (r.inAt ? <Box>{wallText(r.inAt)}{r.inNote ? <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{r.inNote}</Typography> : null}</Box> : <Badge family="info" noIcon label="Out" />) }] : []),
    { key: 'note', header: 'Note', defaultHidden: true, render: (r) => r.note ?? '' },
    ...(canStores && tab === 'out' ? [{ key: 'act', header: '', alwaysVisible: true, align: 'right' as const, render: (r: CheckoutRow) => <Button size="small" onClick={(e) => { e.stopPropagation(); setCheckingIn(r); }} data-testid="custody-check-in">Check in</Button> }] : []),
  ];
  const regCols: DataColumn<ToRegister>[] = [
    { key: 'item', header: 'What arrived', alwaysVisible: true, sortValue: (l) => l.item.code, render: (l) => <><Mono chip>{l.item.code}</Mono> <Typography component="span" sx={{ fontSize: 13 }}>{l.item.name}</Typography> <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>· {l.kind === 'tool' ? 'tool' : 'machine'}</Typography></> },
    { key: 'po', header: 'From', sortValue: (l) => l.purchaseOrder, render: (l) => <Box>{l.purchaseOrder ?? 'GRN'}<Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{l.supplier ?? ''}{l.grnDate ? ` · ${l.grnDate}` : ''}</Typography></Box> },
    { key: 'left', header: 'To register', align: 'right', sortValue: (l) => l.left, render: (l) => <Mono>{l.left} of {l.quantity}</Mono> },
    { key: 'cost', header: 'Each', align: 'right', sortValue: (l) => l.unitCost ?? 0, render: (l) => <Mono>{rupeeText(l.unitCost)}</Mono> },
    { key: 'area', header: 'At', render: (l) => <Mono muted={!l.area}>{l.area?.code ?? '—'}</Mono> },
    ...(canStores ? [{ key: 'act', header: '', alwaysVisible: true, align: 'right' as const, render: (l: ToRegister) => <Button size="small" variant="contained" onClick={(e) => { e.stopPropagation(); setRegistering(l); }} data-testid="custody-register">Register</Button> }] : []),
  ];
  const pick = useMemo(() => async (term: string) => {
    const rows = await cfApi.get<Machine[]>(`/machines${qs({ search: term || undefined, stage: 'live' })}`);
    return rows.filter((m) => !m.withWhom).slice(0, 30).map((m) => ({ id: m.id, code: m.code, name: m.name }));
  }, []);

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, minWidth: 0 }}>
      <PageHeader title={<Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>Check-in / out<InfoTip text="Machines and tools going out to a person, an employee, a contractor, an order or an area, and coming back. A day a machine is out to an order with no run hours that day is charged to that order. Received machines and durable tools are registered here first — then a machine goes to Maintenance for setup." /></Box>}
        subtitle="Who has which machine or tool, and what is still to register."
        actions={canStores && <Button variant="contained" startIcon={<LogoutRounded />} onClick={() => setCheckingOut(true)} data-testid="custody-check-out">Check out</Button>} />
      <StatStrip stats={[
        { label: 'Out now', value: outRows.length, onClick: () => setTab('out') },
        { label: 'Overdue', value: overdue, tone: overdue ? 'danger' as const : undefined, onClick: () => setTab('out') },
        { label: 'To register', value: toRegister, tone: toRegister ? 'warning' as const : undefined, onClick: () => setTab('register') },
      ]} />
      <FilterBar search={tab === 'register' ? undefined : search} onSearch={tab === 'register' ? undefined : setSearch} placeholder="Search machine, person, order">
        <FacetChip label="Out now" active={tab === 'out'} count={outRows.length} onClick={() => setTab('out')} />
        <FacetChip label="To register" active={tab === 'register'} count={toRegister} onClick={() => setTab('register')} />
        <FacetChip label="History" active={tab === 'history'} onClick={() => setTab('history')} />
      </FilterBar>
      {tab === 'out' && <>
        <ErrorNotice error={out.error} onRetry={out.reload} />
        <DataTable rows={[...outRows].sort((a, b) => Number(b.overdue) - Number(a.overdue))} columns={outCols} getRowId={(r) => r.id} loading={out.loading && !out.data}
          onRowClick={(r) => navigate(appPath(company, `machines/${r.machine.id}`))} storageKey="machine-custody-out" exportName="checked-out"
          empty={<EmptyState icon={<PrecisionManufacturingOutlined />} title="Everything is in." hint={canStores ? 'Check out a live machine or tool with the button above.' : undefined} />} />
      </>}
      {tab === 'register' && <>
        <ErrorNotice error={todo.error} onRetry={todo.reload} />
        <DataTable rows={todo.data ?? []} columns={regCols} getRowId={(l) => l.billLineId} loading={todo.loading && !todo.data} storageKey="machine-custody-register" exportName="to-register"
          empty={<EmptyState icon={<Inventory2Outlined />} title="Nothing waits to be registered." hint="A machine or durable tool received on a GRN shows up here for its serial and type." />} />
      </>}
      {tab === 'history' && <>
        <ErrorNotice error={history.error} onRetry={history.reload} />
        <DataTable rows={history.data?.rows ?? []} columns={outCols} getRowId={(r) => r.id} loading={history.loading && !history.data}
          onRowClick={(r) => navigate(appPath(company, `machines/${r.machine.id}`))} storageKey="machine-custody-history" exportName="check-out-history"
          empty={<EmptyState icon={<PrecisionManufacturingOutlined />} title="Nothing has been checked out yet." />} />
      </>}
      <CheckOutDialog open={checkingOut} pick={pick} onClose={() => setCheckingOut(false)} onDone={() => { toast.success('Checked out.'); reload(); }} />
      <CheckInDialog open={!!checkingIn} machine={checkingIn ? { id: checkingIn.machine.id, code: checkingIn.machine.code } : null} currentAreaId={null}
        onClose={() => setCheckingIn(null)} onDone={() => { toast.success('Checked in.'); reload(); }} />
      <RegisterDialog line={registering} open={!!registering} onClose={() => setRegistering(null)}
        onDone={(r) => { toast.success(`${r.machines.map((m) => m.code).join(', ')} registered — ${r.stage === 'setup' ? 'a setup ticket went to Maintenance' : 'live'}.`); reload(); }} />
    </Box>
  );
}
