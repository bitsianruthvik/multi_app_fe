import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Box, Button, Checkbox, FormControlLabel, MenuItem, TextField, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import CheckRounded from '@mui/icons-material/CheckRounded';
import BuildOutlined from '@mui/icons-material/BuildOutlined';
import PrecisionManufacturingOutlined from '@mui/icons-material/PrecisionManufacturingOutlined';
import EventNoteOutlined from '@mui/icons-material/EventNoteOutlined';
import { cfApi } from '../api/client';
import type { StockingArea, Tree } from '../api/types';
import {
  CHECKOUT_KINDS, STAGE_FAMILY, askCondemn, checkIn, checkOut, listCustodians, moveMachine, recordDisposal, registerReceived,
  setMachineCost, setSetupTreatment, type CheckoutKind, type CustodianOption, type LogRow, type MachineLife, type MachineStage, type ToRegister,
} from '../api/machineLife';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { appPath } from '../navMeta';
import { rupeeText } from '../lib/money';
import { Badge, EmptyState, Fact, InfoTip, Mono, SectionCard } from './ui';
import { FormDialog } from './FormDialog';
import { ServerPicker } from './ServerPicker';
import { ClassificationPicker } from './ClassificationPicker';
import { DataTable, type DataColumn } from './DataTable';
import { useToast } from './toastContext';

/**
 * THE MACHINE LIFECYCLE on screen (§104, user 2026-11-12): the stage bar, the actions each stage allows (by role), the
 * Life tab (place, custody, setup, cost, use by order) and the Log tab. Stores' check-in / out screen reuses the
 * check-out and register dialogs.
 */

export const STORES_TAG = 'cf_erp_stores|cf_erp_inventory_manage';
export const MAINT_TAG = 'cf_erp_maintenance';
export const MONEY_TAG = 'cf_erp_maintenance|cf_erp_accounts_manage';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };
const dateText = (s: string | null | undefined) => (s ? new Date(`${String(s).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const wallText = (s: string | null | undefined) => (s ? new Date(String(s).replace(' ', 'T')).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const today = () => new Date().toISOString().slice(0, 10);

export function StageBadge({ stage, label }: { stage: MachineStage; label: string }) {
  return <Badge family={STAGE_FAMILY[stage]} noIcon label={label} />;
}

/** Received → Setup → Live → Condemned, the current step filled; a condemn waiting for the MD shows amber on the last. */
export function StageBar({ life }: { life: MachineLife }) {
  const steps: { key: string; label: string; sub: string | null }[] = [
    { key: 'received', label: 'Received', sub: life.receivedOn ? dateText(life.receivedOn) : 'before the register' },
    { key: 'setup', label: 'Setup', sub: life.setupTicket ? life.setupTicket.code : life.setupTickets[0]?.code ?? null },
    { key: 'live', label: 'Live', sub: life.liveOn ? `since ${dateText(life.liveOn)}` : null },
    { key: 'condemned', label: life.stage === 'condemn_requested' ? 'Condemn asked' : 'Condemned', sub: life.stage === 'condemn_requested' ? 'waiting for the MD' : life.condemnedOn ? dateText(life.condemnedOn) : null },
  ];
  const at = { setup: 1, live: 2, condemn_requested: 3, condemned: 3 }[life.stage];
  return (
    <Box data-testid="stage-bar" role="list" aria-label="Lifecycle" sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 0.75, my: 1 }}>
      {steps.map((s, i) => {
        const done = i < at;
        const current = i === at;
        const amber = current && life.stage === 'condemn_requested';
        const color = amber ? 'var(--c-warning-600)' : current ? 'var(--c-primary-600)' : done ? 'var(--c-success-600)' : 'var(--c-border)';
        return (
          <Box key={s.key} role="listitem" aria-current={current ? 'step' : undefined} sx={{ minWidth: 0 }}>
            <Box sx={{ height: 4, borderRadius: 2, background: color, mb: 0.75 }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: 13, fontWeight: current ? 600 : 500, color: current || done ? 'var(--c-text)' : 'var(--c-text-3)' }}>
              {done && <CheckRounded sx={{ fontSize: 15, color: 'var(--c-success-600)' }} />}{s.label}
            </Box>
            <Typography noWrap sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{s.sub ?? ' '}</Typography>
          </Box>
        );
      })}
    </Box>
  );
}

/* ── Dialogs ──────────────────────────────────────────────────────────────────────────────────────────── */

function useAreas(open: boolean) {
  const areas = useLoad(() => (open ? cfApi.get<StockingArea[]>('/stocking-areas') : Promise.resolve([] as StockingArea[])), [open]);
  return (areas.data ?? []).filter((a) => a.status === 'active');
}

export function MoveDialog({ life, open, onClose, onDone }: { life: MachineLife; open: boolean; onClose: () => void; onDone: (l: MachineLife) => void }) {
  const areas = useAreas(open);
  const [areaId, setAreaId] = useState<number | ''>('');
  const [note, setNote] = useState('');
  useEffect(() => { if (open) { setAreaId(''); setNote(''); } }, [open]);
  const choices = areas.filter((a) => a.id !== life.area?.id);
  return (
    <FormDialog open={open} onClose={onClose} title={`Move ${life.code}`} subtitle={life.area ? `Now at ${life.area.code} · ${life.area.name}` : 'No place yet'}
      submitLabel="Move" submitDisabled={!areaId} onSubmit={async () => onDone(await moveMachine(life.id, Number(areaId), note.trim() || undefined))}>
      <Box sx={{ display: 'grid', gap: 2 }}>
        <TextField select label="To" value={areaId} onChange={(e) => setAreaId(Number(e.target.value))} inputProps={{ 'data-testid': 'move-area' }}>
          {choices.map((a) => <MenuItem key={a.id} value={a.id}>{a.code} · {a.name}{a.purpose === 'maintenance' ? ' (maintenance bay)' : ''}</MenuItem>)}
        </TextField>
        <TextField label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why it moves" />
      </Box>
    </FormDialog>
  );
}

/** Check a machine or tool out. `machine` fixed (the machine page), or picked (Stores' screen: `pick`). */
export function CheckOutDialog({ open, onClose, onDone, machine, pick }: {
  open: boolean; onClose: () => void; onDone: () => void;
  machine?: { id: number; code: string; name: string } | null;
  pick?: (term: string) => Promise<{ id: number; code: string; name: string }[]>;
}) {
  const [chosen, setChosen] = useState<{ id: number; code: string; name: string } | null>(null);
  const [kind, setKind] = useState<CheckoutKind>('user');
  const [to, setTo] = useState<CustodianOption | null>(null);
  const [takenBy, setTakenBy] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => { if (open) { setChosen(null); setKind('user'); setTo(null); setTakenBy(''); setDueOn(''); setNote(''); } }, [open]);
  const m = machine ?? chosen;
  const person = CHECKOUT_KINDS.find((k) => k.value === kind)?.person ?? false;
  const needsTaker = !person;
  return (
    <FormDialog open={open} onClose={onClose} title={m ? `Check out ${m.code}` : 'Check out a machine or tool'} submitLabel="Check out"
      submitDisabled={!m || !to || (needsTaker && !takenBy.trim())}
      onSubmit={async () => { await checkOut(m!.id, { toKind: kind, toId: to!.id, takenBy: (person ? takenBy.trim() || to!.name : takenBy.trim()) || undefined, dueOn: dueOn || null, note: note.trim() || undefined }); onDone(); }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }} data-testid="checkout-dialog">
        {!machine && pick && (
          <Box sx={{ gridColumn: '1 / -1' }}>
            <ServerPicker label="Machine or tool" noun="live machine or tool" value={chosen} onChange={setChosen} search={pick} getId={(x) => x.id}
              getLabel={(x) => `${x.code} · ${x.name}`} autoFocus />
          </Box>
        )}
        <TextField select label="To" value={kind} onChange={(e) => { setKind(e.target.value as CheckoutKind); setTo(null); }} inputProps={{ 'data-testid': 'checkout-kind' }}>
          {CHECKOUT_KINDS.map((k) => <MenuItem key={k.value} value={k.value}>{k.label}</MenuItem>)}
        </TextField>
        <ServerPicker<CustodianOption> key={kind} label={CHECKOUT_KINDS.find((k) => k.value === kind)?.label.replace(/^An? /, '').replace(/^./, (c) => c.toUpperCase())}
          noun={kind} value={to} onChange={setTo} search={(t) => listCustodians(kind, t)} getId={(x) => x.id}
          getLabel={(x) => [x.code, x.name].filter(Boolean).join(' · ')}
          renderOption={(x) => <Box sx={{ minWidth: 0 }}><Typography noWrap sx={{ fontSize: 14 }}>{[x.code, x.name].filter(Boolean).join(' · ')}</Typography>{x.sub && <Typography noWrap sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{x.sub}</Typography>}</Box>} />
        <TextField label={needsTaker ? 'Taken by' : 'Taken by (if not them)'} required={needsTaker} value={takenBy} onChange={(e) => setTakenBy(e.target.value)}
          helperText={needsTaker ? 'The person who takes it' : undefined} inputProps={{ 'data-testid': 'checkout-taken-by' }} />
        <TextField label="Due back" type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField sx={{ gridColumn: '1 / -1' }} label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Site, job, condition" />
      </Box>
    </FormDialog>
  );
}

export function CheckInDialog({ open, onClose, onDone, machine, currentAreaId }: {
  open: boolean; onClose: () => void; onDone: () => void; machine: { id: number; code: string } | null; currentAreaId: number | null;
}) {
  const areas = useAreas(open);
  const [areaId, setAreaId] = useState<number | ''>('');
  const [note, setNote] = useState('');
  useEffect(() => { if (open) { setAreaId(currentAreaId ?? ''); setNote(''); } }, [open, currentAreaId]);
  return (
    <FormDialog open={open} onClose={onClose} title={`Check in ${machine?.code ?? ''}`} submitLabel="Check in" submitDisabled={!machine}
      onSubmit={async () => { await checkIn(machine!.id, { areaId: areaId || null, note: note.trim() || undefined }); onDone(); }}>
      <Box sx={{ display: 'grid', gap: 2 }}>
        <TextField select label="Back to" value={areaId} onChange={(e) => setAreaId(Number(e.target.value))}>
          {areas.map((a) => <MenuItem key={a.id} value={a.id}>{a.code} · {a.name}</MenuItem>)}
        </TextField>
        <TextField label="Condition / note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Back in good order" inputProps={{ 'data-testid': 'checkin-note' }} />
      </Box>
    </FormDialog>
  );
}

export function CondemnDialog({ life, open, onClose, onDone }: { life: MachineLife; open: boolean; onClose: () => void; onDone: (l: MachineLife) => void }) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (open) setReason(''); }, [open]);
  const dep = life.cost.depreciation;
  return (
    <FormDialog open={open} onClose={onClose} title={`Condemn ${life.code}?`} submitLabel="Ask the MD" submitColor="error" submitDisabled={!reason.trim()}
      subtitle="It goes to the MD for approval. Until then it stays as it is."
      onSubmit={async () => onDone(await askCondemn(life.id, reason.trim()))}>
      <Box sx={{ display: 'grid', gap: 1.5 }}>
        {dep && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Book value today {rupeeText(dep.bookValue)} — the MD sees it with your reason.</Typography>}
        <TextField autoFocus multiline minRows={3} label="Why should it be condemned?" required value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="Beyond repair, unsafe, repair costs more than a new one…" inputProps={{ 'data-testid': 'condemn-reason' }} />
      </Box>
    </FormDialog>
  );
}

export function DisposalDialog({ life, open, onClose, onDone }: { life: MachineLife; open: boolean; onClose: () => void; onDone: (l: MachineLife) => void }) {
  const [kind, setKind] = useState<'scrapped' | 'sold'>('scrapped');
  const [on, setOn] = useState(today());
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => { if (open) { setKind('scrapped'); setOn(today()); setAmount(''); setNote(''); } }, [open]);
  const book = life.cost.depreciation?.bookValue ?? null;
  const amt = amount.trim() === '' ? 0 : Number(amount);
  return (
    <FormDialog open={open} onClose={onClose} title={`Record ${life.code}'s disposal`} submitLabel="Record"
      submitDisabled={!on || !Number.isFinite(amt) || amt < 0 || (kind === 'sold' && !(amt > 0))}
      onSubmit={async () => onDone(await recordDisposal(life.id, { disposal: kind, on, amount: amt, note: note.trim() || undefined }))}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
        <TextField select label="What happened" value={kind} onChange={(e) => setKind(e.target.value as 'scrapped' | 'sold')}>
          <MenuItem value="scrapped">Scrapped</MenuItem>
          <MenuItem value="sold">Sold</MenuItem>
        </TextField>
        <TextField label="On" type="date" value={on} onChange={(e) => setOn(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField label={kind === 'sold' ? 'Sold for (₹)' : 'Scrap realised (₹)'} value={amount} onChange={(e) => setAmount(e.target.value)} inputProps={{ inputMode: 'decimal' }}
          helperText={book != null ? `Written off: ${rupeeText(Math.max(0, book - (Number.isFinite(amt) ? amt : 0)))}` : undefined} />
        <TextField label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Buyer, gate pass…" />
      </Box>
    </FormDialog>
  );
}

export function CostDialog({ life, open, onClose, onDone }: { life: MachineLife; open: boolean; onClose: () => void; onDone: (l: MachineLife) => void }) {
  const [cost, setCost] = useState('');
  const [salvage, setSalvage] = useState('');
  const [years, setYears] = useState('');
  const [liveOn, setLiveOn] = useState('');
  useEffect(() => {
    if (!open) return;
    setCost(life.cost.cost == null ? '' : String(life.cost.cost)); setSalvage(life.cost.salvageValue == null ? '' : String(life.cost.salvageValue));
    setYears(life.cost.lifeYears == null ? '' : String(life.cost.lifeYears)); setLiveOn(life.liveOn ?? '');
  }, [open, life]);
  const num = (s: string) => (s.trim() === '' ? null : Number(s));
  const bad = [cost, salvage, years].some((s) => s.trim() !== '' && !Number.isFinite(Number(s)));
  return (
    <FormDialog open={open} onClose={onClose} title={`Cost and life of ${life.code}`} submitDisabled={bad}
      subtitle="Straight line: (cost + installation − salvage) spread over its life, a day at a time from the day it went live."
      onSubmit={async () => onDone(await setMachineCost(life.id, { cost: num(cost), salvageValue: num(salvage), lifeYears: num(years), ...(life.stage !== 'setup' && liveOn && liveOn !== life.liveOn ? { liveOn } : {}) }))}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
        <TextField label="Cost (₹)" value={cost} onChange={(e) => setCost(e.target.value)} helperText="Landed cost from its GRN" inputProps={{ inputMode: 'decimal', 'data-testid': 'cost-cost' }} />
        <TextField label="Salvage value (₹)" value={salvage} onChange={(e) => setSalvage(e.target.value)} helperText="What it fetches at the end" inputProps={{ inputMode: 'decimal' }} />
        <TextField label="Life (years)" value={years} onChange={(e) => setYears(e.target.value)} inputProps={{ inputMode: 'decimal', 'data-testid': 'cost-life' }} />
        <TextField label="Live since" type="date" value={liveOn} disabled={life.stage === 'setup'} onChange={(e) => setLiveOn(e.target.value)} slotProps={{ inputLabel: { shrink: true } }}
          helperText={life.stage === 'setup' ? 'Set when it goes live' : 'Depreciation starts here'} />
      </Box>
    </FormDialog>
  );
}

/* ── The Life tab ─────────────────────────────────────────────────────────────────────────────────────── */

export function MachineLifeTab({ life, onChanged, openCost }: { life: MachineLife; onChanged: (l?: MachineLife) => void; openCost: (() => void) | null }) {
  const company = useCompanySlug();
  const toast = useToast();
  const canMoney = useIsPermitted()(MONEY_TAG);
  const dep = life.cost.depreciation;
  const use = life.cost.use;
  const itemCols: DataColumn<MachineLife['cost']['setupItems'][number]>[] = [
    { key: 'item', header: 'Item', alwaysVisible: true, sortValue: (i) => i.code, render: (i) => <><Box component={Link} to={appPath(company, `items/${i.itemId}`)} sx={linkSx}>{i.name}</Box> <Mono muted>{i.code}</Mono></> },
    { key: 'qty', header: 'Issued', align: 'right', sortValue: (i) => i.qty, render: (i) => <Mono>{i.qty} {i.uom ?? ''}</Mono> },
    { key: 'value', header: 'Value', align: 'right', sortValue: (i) => i.value ?? 0, render: (i) => <Mono>{rupeeText(i.value)}</Mono> },
    {
      key: 'treat', header: 'Treated as', alwaysVisible: true, render: (i) => (canMoney ? (
        <TextField select size="small" value={i.treatment} sx={{ minWidth: 190 }} inputProps={{ 'aria-label': `How ${i.code} is treated` }}
          onChange={async (e) => { try { onChanged(await setSetupTreatment(life.id, i.itemId, e.target.value as 'capital' | 'expense')); toast.success('Saved.'); } catch (er) { toast.error((er as Error).message); } }}>
          <MenuItem value="capital">Installation (capitalised)</MenuItem>
          <MenuItem value="expense">Consumable (expense)</MenuItem>
        </TextField>
      ) : <Typography sx={{ fontSize: 13 }}>{i.treatment === 'capital' ? 'Installation (capitalised)' : 'Consumable (expense)'}</Typography>),
    },
  ];
  const useCols: DataColumn<NonNullable<typeof use>['orders'][number]>[] = [
    { key: 'order', header: 'Order', alwaysVisible: true, sortValue: (o) => o.code, render: (o) => <><Box component={Link} to={appPath(company, `orders/${o.id}`)} sx={linkSx}><Mono>{o.code}</Mono></Box> <Typography component="span" sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{o.title ?? ''}</Typography></> },
    { key: 'days', header: 'Days', align: 'right', sortValue: (o) => o.days, render: (o) => <Mono>{o.days}</Mono> },
    { key: 'amount', header: 'Charged', align: 'right', sortValue: (o) => o.amount, render: (o) => <Mono>{rupeeText(o.amount)}</Mono> },
  ];
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }} data-testid="life-tab">
      <SectionCard title="Where it is">
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 1.5 }}>
          <Fact label="Place">{life.area ? <>{life.area.code} <Typography component="span" sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{life.area.name}</Typography></> : '—'}</Fact>
          <Fact label="With">{life.checkout ? <>{life.checkout.to.name ?? life.checkout.to.code} <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>({life.checkout.to.kindLabel.toLowerCase()})</Typography></> : 'In store'}</Fact>
          {life.checkout && <Fact label="Out since">{wallText(life.checkout.outAt)}</Fact>}
          {life.checkout?.takenBy && <Fact label="Taken by">{life.checkout.takenBy}</Fact>}
          {life.checkout && <Fact label="Due back">{life.checkout.dueOn ? <Box component="span" sx={{ color: life.checkout.overdue ? 'var(--c-danger-700)' : undefined }}>{dateText(life.checkout.dueOn)}{life.checkout.overdue ? ' · overdue' : ''}</Box> : '—'}</Fact>}
          <Fact label="Last maintenance">{life.lastMaintenance ? wallText(life.lastMaintenance) : '—'}</Fact>
          <Fact label="Maintenance cost">{rupeeText(life.maintenanceCost)}</Fact>
        </Box>
      </SectionCard>

      <SectionCard title={<Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>Cost and depreciation<InfoTip text="Straight line. The base is what it cost plus the installation issued on its setup tickets, less what it fetches at the end, spread over its life one day at a time from the day it went live. Orders pay those days — see Use by order." /></Box>}
        actions={openCost && <Button size="small" onClick={openCost} data-testid="life-edit-cost">Edit</Button>}>
        {!dep ? (
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>
            {life.cost.cost == null || life.cost.lifeYears == null ? 'Give it a cost and a life in years to depreciate it.' : 'Depreciation starts the day it goes live.'}
          </Typography>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 1.5 }}>
            <Fact label="Book value"><Mono>{rupeeText(dep.bookValue)}</Mono></Fact>
            <Fact label="A day"><Mono>{rupeeText(dep.perDay, 2)}</Mono></Fact>
            <Fact label="A year"><Mono>{rupeeText(dep.perYear)}</Mono></Fact>
            <Fact label="So far"><Mono>{rupeeText(dep.accumulated)}</Mono></Fact>
            <Fact label="Base"><Mono>{rupeeText(dep.base)}</Mono></Fact>
            <Fact label="Salvage"><Mono>{rupeeText(dep.salvage)}</Mono></Fact>
            <Fact label="Life">{dep.lifeYears} years</Fact>
            <Fact label="Fully down on">{dateText(dep.endsOn)}</Fact>
          </Box>
        )}
        {dep == null && life.cost.cost != null && <Box sx={{ mt: 1 }}><Fact label="Cost"><Mono>{rupeeText(life.cost.cost)}</Mono></Fact></Box>}
      </SectionCard>

      {(life.stage === 'setup' || life.cost.setupItems.length > 0) && (
        <Box sx={{ gridColumn: '1 / -1', minWidth: 0 }}>
          <SectionCard flush title={<Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>Setup<InfoTip text="What was issued on its setup tickets. Installation (wiring to it, its foundation, mounting) is added to its cost and depreciated with it; consumables are an expense. Consumable families default to expense, the rest to installation — change any line. Your accountant decides the policy." /></Box>}
            subtitle={`Installation ${rupeeText(life.cost.setupCapital)} · consumables ${rupeeText(life.cost.setupExpense)}`}>
            {life.stage === 'setup' && (
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', px: 2, pt: 1.5 }}>
                {life.setupTicket ? <>Maintenance sets it up on <Box component={Link} to={appPath(company, `maintenance-orders/${life.setupTicket.id}`)} sx={linkSx}>{life.setupTicket.code}</Box> — raise an MR there for what it needs. Closing the ticket makes it live.</> : 'No open setup ticket.'}
              </Typography>
            )}
            <DataTable bare rows={life.cost.setupItems} columns={itemCols} getRowId={(i) => i.itemId}
              empty={<Typography sx={{ color: 'var(--c-text-3)', p: 2, fontSize: 13 }}>Nothing issued on its setup tickets yet.</Typography>} />
          </SectionCard>
        </Box>
      )}

      {use && (
        <Box sx={{ gridColumn: '1 / -1', minWidth: 0 }}>
          <SectionCard flush title={<Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>Use by order<InfoTip text="Each day it worked is charged to the orders whose work ran on it that day, shared by run hours. A day with no run hours goes to the order it was checked out to. Days with neither are idle — not recovered from any order." /></Box>}
            subtitle={`${use.usedDays} ${use.usedDays === 1 ? 'day' : 'days'} used · ${use.idleDays} idle · charged ${rupeeText(use.charged)} · not recovered ${rupeeText(use.unrecovered)}`}>
            <DataTable bare rows={use.orders} columns={useCols} getRowId={(o) => o.id}
              empty={<Typography sx={{ color: 'var(--c-text-3)', p: 2, fontSize: 13 }}>No order has used it since it went live.</Typography>} />
          </SectionCard>
        </Box>
      )}

      {life.stage === 'condemned' && (
        <Box sx={{ gridColumn: '1 / -1' }}>
          <SectionCard title="Condemned">
            {life.disposal ? (
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 1.5 }}>
                <Fact label="Condemned on">{dateText(life.condemnedOn)}</Fact>
                <Fact label={life.disposal.kind === 'sold' ? 'Sold on' : 'Scrapped on'}>{dateText(life.disposal.on)}</Fact>
                <Fact label="Realised"><Mono>{rupeeText(life.disposal.amount)}</Mono></Fact>
                <Fact label="Written off"><Mono>{rupeeText(life.disposal.writtenOff)}</Mono></Fact>
                {life.disposal.note && <Fact label="Note">{life.disposal.note}</Fact>}
              </Box>
            ) : <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Condemned on {dateText(life.condemnedOn)}. Record how it went — scrapped or sold.</Typography>}
          </SectionCard>
        </Box>
      )}
    </Box>
  );
}

/* ── The Log tab ──────────────────────────────────────────────────────────────────────────────────────── */

const LOG_ICON: Record<LogRow['kind'], ReactNode> = {
  event: <EventNoteOutlined fontSize="small" />,
  maintenance: <BuildOutlined fontSize="small" />,
  work: <PrecisionManufacturingOutlined fontSize="small" />,
};

export function MachineLogTab({ rows }: { rows: LogRow[] | null }) {
  const company = useCompanySlug();
  const [show, setShow] = useState<'all' | LogRow['kind']>('all');
  const shown = useMemo(() => (rows ?? []).filter((r) => show === 'all' || r.kind === show), [rows, show]);
  if (rows && !rows.length) return <EmptyState icon={<EventNoteOutlined />} title="Nothing has happened to it yet." />;
  return (
    <SectionCard title="Log" subtitle="Everything that happened to it — where it went, who had it, its maintenance and the orders it worked on."
      actions={(
        <TextField select size="small" value={show} onChange={(e) => setShow(e.target.value as typeof show)} sx={{ minWidth: 160 }} inputProps={{ 'aria-label': 'Show' }}>
          <MenuItem value="all">Everything</MenuItem>
          <MenuItem value="event">Moves and custody</MenuItem>
          <MenuItem value="maintenance">Maintenance</MenuItem>
          <MenuItem value="work">Work on orders</MenuItem>
        </TextField>
      )}>
      <Box component="ol" data-testid="machine-log" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0 }}>
        {shown.map((r, i) => (
          <Box component="li" key={`${r.kind}-${r.at}-${i}`} sx={{ display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr) auto', gap: 1, py: 1, borderTop: i ? '1px solid var(--c-border)' : 'none', alignItems: 'start' }}>
            <Box sx={{ color: r.kind === 'work' ? 'var(--c-primary-600)' : r.kind === 'maintenance' ? 'var(--c-warning-700)' : 'var(--c-text-3)', pt: 0.25 }}>{LOG_ICON[r.kind]}</Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>
                {r.label}
                {r.kind === 'work' && r.refId && <> <Box component={Link} to={appPath(company, `orders/${r.refId}`)} sx={linkSx}><Mono>{r.ref}</Mono></Box> · {r.hours} h</>}
                {r.kind === 'maintenance' && r.refId && <> <Box component={Link} to={appPath(company, `maintenance-orders/${r.refId}`)} sx={linkSx}><Mono>{r.ref}</Mono></Box>{r.status ? ` · ${r.status.replace('_', ' ')}` : ''}</>}
                {r.kind === 'event' && r.event === 'moved' && <> {r.fromArea ? `${r.fromArea} → ` : 'to '}{r.area}</>}
                {r.kind === 'event' && r.ref && r.event !== 'moved' && <> <Mono muted>{r.ref}</Mono></>}
              </Typography>
              {(r.note || r.by) && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{[r.note, r.by && (r.kind === 'work' ? `by ${r.by}` : r.by)].filter(Boolean).join(' · ')}</Typography>}
            </Box>
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', whiteSpace: 'nowrap' }}>{r.kind === 'work' && r.day ? dateText(r.day) : wallText(r.at)}</Typography>
          </Box>
        ))}
      </Box>
    </SectionCard>
  );
}

/* ── Register what arrived (Stores) ──────────────────────────────────────────────────────────────────── */

interface UnitDraft { name: string; serialNumber: string; code: string; classificationId: number | null }

export function RegisterDialog({ line, open, onClose, onDone }: { line: ToRegister | null; open: boolean; onClose: () => void; onDone: (r: { machines: { id: number; code: string }[]; stage: MachineStage }) => void }) {
  const tree = useLoad(() => (open ? cfApi.get<Tree>('/classification?screen=machines') : Promise.resolve(null)), [open]);
  const [count, setCount] = useState(1);
  const [units, setUnits] = useState<UnitDraft[]>([]);
  const [needsSetup, setNeedsSetup] = useState(true);
  const [life, setLife] = useState('');
  const [salvage, setSalvage] = useState('');
  useEffect(() => {
    if (!open || !line) return;
    const n = line.left;
    setCount(n); setNeedsSetup(line.kind === 'machine'); setLife(''); setSalvage('');
    setUnits(Array.from({ length: n }, (_, i) => ({ name: n > 1 ? `${line.item.name} #${line.registered + i + 1}` : line.item.name, serialNumber: '', code: '', classificationId: null })));
  }, [open, line]);
  if (!line) return null;
  const shown = units.slice(0, count);
  const set = (i: number, patch: Partial<UnitDraft>) => setUnits((u) => u.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const missingType = line.kind === 'machine' && shown.some((u) => !u.classificationId);
  const serials = shown.map((u) => u.serialNumber.trim().toLowerCase()).filter(Boolean);
  const dup = new Set(serials).size !== serials.length;
  return (
    <FormDialog open={open} onClose={onClose} maxWidth="md" enterSubmits={false}
      title={`Register ${line.item.code} · ${line.item.name}`}
      subtitle={`${line.purchaseOrder ?? 'GRN'}${line.supplier ? ` from ${line.supplier}` : ''} · ${line.left} of ${line.quantity} to register · at ${line.area?.code ?? '—'}${line.unitCost != null ? ` · ${rupeeText(line.unitCost)} each` : ''}`}
      submitLabel={`Register ${count}`} submitDisabled={missingType || dup || count < 1}
      onSubmit={async () => onDone(await registerReceived({
        billLineId: line.billLineId, needsSetup, lifeYears: life.trim() ? Number(life) : null, salvageValue: salvage.trim() ? Number(salvage) : null,
        units: shown.map((u) => ({ name: u.name.trim() || undefined, serialNumber: u.serialNumber.trim() || undefined, code: u.code.trim() || undefined, classificationId: u.classificationId })),
      }))}>
      <Box sx={{ display: 'grid', gap: 2 }} data-testid="register-dialog">
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
          <TextField select label="How many now" value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {Array.from({ length: line.left }, (_, i) => i + 1).map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>)}
          </TextField>
          <TextField label="Life (years)" value={life} onChange={(e) => setLife(e.target.value)} inputProps={{ inputMode: 'decimal', 'data-testid': 'register-life' }} helperText="For depreciation — can be set later" />
          <TextField label="Salvage value each (₹)" value={salvage} onChange={(e) => setSalvage(e.target.value)} inputProps={{ inputMode: 'decimal' }} />
        </Box>
        <FormControlLabel control={<Checkbox checked={needsSetup} onChange={(e) => setNeedsSetup(e.target.checked)} />}
          label={<Typography sx={{ fontSize: 13.5 }}>Needs setup by Maintenance <Box component="span" sx={{ color: 'var(--c-text-2)' }}>— a setup ticket is raised; it goes live when the ticket is closed. Untick for a tool ready to use.</Box></Typography>} />
        <Box sx={{ display: 'grid', gap: 1.5 }}>
          {shown.map((u, i) => (
            <Fragment key={i}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: '1.3fr 1fr 0.8fr 1.5fr' }, gap: 1.25, alignItems: 'start' }}>
                <TextField size="small" label={`Unit ${i + 1} — name`} value={u.name} onChange={(e) => set(i, { name: e.target.value })} />
                <TextField size="small" label="Serial number" value={u.serialNumber} onChange={(e) => set(i, { serialNumber: e.target.value })} inputProps={{ 'data-testid': `register-serial-${i}` }} />
                <TextField size="small" label="Code" placeholder="auto" value={u.code} onChange={(e) => set(i, { code: e.target.value })} />
                <ClassificationPicker tree={tree.data ?? null} scope="machine" screen="machines" value={u.classificationId} onChange={(id) => set(i, { classificationId: id })}
                  label={line.kind === 'machine' ? 'Machine type' : 'Type (optional)'} />
              </Box>
            </Fragment>
          ))}
        </Box>
        {dup && <Typography sx={{ fontSize: 13, color: 'var(--c-danger-700)' }}>Two units have the same serial number.</Typography>}
      </Box>
    </FormDialog>
  );
}
