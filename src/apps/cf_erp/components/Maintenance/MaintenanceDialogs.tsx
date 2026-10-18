import { useEffect, useMemo, useState } from 'react';
import {
  Autocomplete, Box, Button, Checkbox, FormControlLabel, IconButton, MenuItem, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import { FormDialog } from '../FormDialog';
import { OrderPicker, ServerPicker } from '../ServerPicker';
import { Mono } from '../ui';
import { CfApiError } from '../../api/client';
import type { SalesOrder } from '../../api/types';
import { getReasons } from '../../api/floor';
import { searchResourceItems, type ResourceItem } from '../../api/toolsResources';
import {
  raiseFault, createOrder, closeOrder, getMrLines, raiseMr, createDowntime, updateDowntime, previewDowntime, createPlan, updatePlan,
  type DowntimeRule, type MaintenanceOrder, type Occurrence, type Plan, type StopReason,
} from '../../api/maintenance';
import {
  blankDowntime, downtimeBody, durationText, NTH, PRESETS, ruleText, WEEKDAYS, WEEKDAY_LABEL, whenText, type DowntimeForm,
} from '../../lib/maintenance';

/** A machine as the Maintenance pickers list it (the board's rows). */
export interface MachineOption { id: number; code: string; name: string }

export function MachineSelect({ machines, value, onChange, autoFocus, disabled }: {
  machines: MachineOption[]; value: number | null; onChange: (id: number | null) => void; autoFocus?: boolean; disabled?: boolean;
}) {
  const current = machines.find((m) => m.id === value) ?? null;
  return (
    <Autocomplete size="small" options={machines} value={current} disabled={disabled}
      getOptionLabel={(m) => `${m.code} · ${m.name}`} isOptionEqualToValue={(a, b) => a.id === b.id}
      onChange={(_, m) => onChange(m?.id ?? null)}
      renderInput={(p) => <TextField {...p} label="Machine" autoFocus={autoFocus} inputProps={{ ...p.inputProps, 'data-testid': 'machine-select' }} />} />
  );
}

/**
 * RAISE A FAULT (user 2026-10-18: "anyone on the floor marks a machine down"): machine, reason, note. The machine is
 * down for planning at once and a maintenance order opens. `machine` fixed = from the machine log or a board card.
 */
export function RaiseFaultDialog({ open, onClose, onDone, machines = [], machine = null, reasons: given = null, operatorId = null }: {
  open: boolean; onClose: () => void; onDone: (r: { order: { id: number; code: string }; message: string }) => void;
  machines?: MachineOption[]; machine?: MachineOption | null; reasons?: StopReason[] | null; operatorId?: number | null;
}) {
  const [machineId, setMachineId] = useState<number | null>(machine?.id ?? null);
  const [reasons, setReasons] = useState<{ id: number; code: string; label: string; needsNote: boolean }[]>(given ?? []);
  const [reasonId, setReasonId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!open) return;
    setMachineId(machine?.id ?? null); setNote('');
    const pickDefault = (rs: { id: number; code: string }[]) => setReasonId(rs.find((r) => r.code.toUpperCase() === 'BREAKDOWN')?.id ?? rs[0]?.id ?? null);
    if (given?.length) { setReasons(given); pickDefault(given); return; }
    let alive = true;
    getReasons().then((rs) => { if (alive) { setReasons(rs); pickDefault(rs); } }).catch(() => {});
    return () => { alive = false; };
  }, [open, machine?.id, given]);
  const reason = reasons.find((r) => r.id === reasonId) ?? null;
  return (
    <FormDialog open={open} onClose={onClose} title="Raise a fault" submitLabel="Machine is down" submitColor="error"
      subtitle="The machine stops in the plan at once and a maintenance order opens."
      submitDisabled={!machineId || !reasonId || (!!reason?.needsNote && !note.trim())}
      onSubmit={async () => { const r = await raiseFault({ machineId: machineId!, reasonId, note: note.trim() || null, operatorId }); onDone(r); }}>
      {machine
        ? <Typography sx={{ fontSize: 15, fontWeight: 600 }} data-testid="fault-machine"><Mono>{machine.code}</Mono> {machine.name}</Typography>
        : <MachineSelect machines={machines} value={machineId} onChange={setMachineId} autoFocus />}
      <TextField select size="small" label="What is wrong" value={reasonId ?? ''} onChange={(e) => setReasonId(Number(e.target.value))} inputProps={{ 'data-testid': 'fault-reason' }}>
        {reasons.map((r) => <MenuItem key={r.id} value={r.id}>{r.label}</MenuItem>)}
      </TextField>
      <TextField size="small" label={reason?.needsNote ? 'Note (needed)' : 'Note'} value={note} onChange={(e) => setNote(e.target.value)} autoFocus={!!machine}
        placeholder="e.g. hydraulic leak at the clamp" inputProps={{ 'data-testid': 'fault-note' }} />
    </FormDialog>
  );
}

/** A job maintenance raises itself (the machine stays up until the work starts). */
export function NewOrderDialog({ open, onClose, onDone, machines, machineId: given = null }: {
  open: boolean; onClose: () => void; onDone: (o: { id: number; code: string }) => void; machines: MachineOption[]; machineId?: number | null;
}) {
  const [machineId, setMachineId] = useState<number | null>(given);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => { if (open) { setMachineId(given); setTitle(''); setNote(''); } }, [open, given]);
  return (
    <FormDialog open={open} onClose={onClose} title="New maintenance order" submitLabel="Raise" submitDisabled={!machineId || !title.trim()}
      onSubmit={async () => { const r = await createOrder({ machineId: machineId!, title: title.trim(), note: note.trim() || null }); onDone(r.order); }}>
      <MachineSelect machines={machines} value={machineId} onChange={setMachineId} autoFocus={!given} />
      <TextField size="small" label="The job" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus={!!given} placeholder="e.g. Replace the torch cable" />
      <TextField size="small" label="Note" value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={2} />
    </FormDialog>
  );
}

/** Close: done, the machine is back up; what was done and any other cost (parts come from the stores' issues). */
export function CloseOrderDialog({ order, onClose, onDone }: { order: MaintenanceOrder | null; onClose: () => void; onDone: (r: { order: MaintenanceOrder; message: string }) => void }) {
  const [workDone, setWorkDone] = useState('');
  const [otherCost, setOtherCost] = useState('');
  const [costNote, setCostNote] = useState('');
  useEffect(() => { if (order) { setWorkDone(''); setOtherCost(''); setCostNote(''); } }, [order]);
  const cost = Number(otherCost) || 0;
  return (
    <FormDialog open={!!order} onClose={onClose} title={`Close ${order?.code ?? ''}`} submitLabel="Done — machine is back up" submitColor="success"
      subtitle={order?.machineDown ? `Down for ${durationText(order.downtimeMinutes)} so far. Closing brings ${order.machine.code} back up.` : undefined}
      submitDisabled={cost > 0 && !costNote.trim()}
      onSubmit={async () => { const r = await closeOrder(order!.id, { workDone: workDone.trim() || null, otherCost: cost || null, costNote: costNote.trim() || null }); onDone(r); }}>
      <TextField size="small" label="What was done" value={workDone} onChange={(e) => setWorkDone(e.target.value)} multiline minRows={2} autoFocus inputProps={{ 'data-testid': 'close-work' }} />
      <Box sx={{ display: 'flex', gap: 1.5 }}>
        <TextField size="small" label="Other cost (₹)" type="number" value={otherCost} onChange={(e) => setOtherCost(e.target.value)} sx={{ width: 160 }} inputProps={{ min: 0, 'data-testid': 'close-cost' }} />
        <TextField size="small" label={cost > 0 ? 'What it was for (needed)' : 'What it was for'} value={costNote} onChange={(e) => setCostNote(e.target.value)} sx={{ flex: 1 }}
          placeholder="e.g. outside rewinding" inputProps={{ 'data-testid': 'close-cost-note' }} />
      </Box>
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>Parts issued against this order are added to its cost by the stores.</Typography>
    </FormDialog>
  );
}

interface MrRow { itemId: number; code: string | null; name: string | null; qty: string; uom: string | null }

/**
 * AN MR FROM THE MO — lines prefilled from the machine's tools / spares / consumables (editable), and an optional
 * sales order the spares are for (user 2026-10-18). It goes to Stores like every MR.
 */
export function MrFromOrderDialog({ order, onClose, onDone }: { order: MaintenanceOrder | null; onClose: () => void; onDone: (r: { message: string }) => void }) {
  const [rows, setRows] = useState<MrRow[]>([]);
  const [info, setInfo] = useState<{ resourcesKnown: boolean; canRaise: boolean } | null>(null);
  const [note, setNote] = useState('');
  const [salesOrder, setSalesOrder] = useState<SalesOrder | null>(null);
  const [adding, setAdding] = useState<ResourceItem | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    if (!order) return;
    setRows([]); setNote(''); setSalesOrder(null); setInfo(null); setLoadError(null);
    let alive = true;
    getMrLines(order.id).then((r) => {
      if (!alive) return;
      setInfo({ resourcesKnown: r.resourcesKnown, canRaise: r.canRaise });
      setRows(r.lines.map((l) => ({ itemId: l.itemId, code: l.code, name: l.name, qty: String(l.qty), uom: l.uom })));
    }).catch((e) => { if (alive) setLoadError((e as CfApiError).message); });
    return () => { alive = false; };
  }, [order]);
  const add = (it: ResourceItem | null) => {
    setAdding(null);
    if (!it || rows.some((r) => r.itemId === it.id)) return;
    setRows((rs) => [...rs, { itemId: it.id, code: it.code, name: it.name, qty: '1', uom: it.uom }]);
  };
  const lines = rows.map((r) => ({ itemId: r.itemId, qty: Number(r.qty), uom: r.uom })).filter((l) => l.qty > 0);
  return (
    <FormDialog open={!!order} onClose={onClose} maxWidth="md" title={`Material request for ${order?.code ?? ''}`} submitLabel="Send to Stores"
      subtitle={`${order?.machine.code ?? ''} — the machine's tools, spares and consumables are filled in; change the quantities, remove or add.`}
      submitDisabled={!lines.length || info?.canRaise === false}
      onSubmit={async () => { const r = await raiseMr(order!.id, { lines, note: note.trim() || null, orderId: salesOrder?.id ?? null }); onDone(r); }}>
      {loadError && <Typography color="error">{loadError}</Typography>}
      {info && !info.canRaise && <Typography color="error">Material requests for maintenance come with the Stores update — it is not installed yet.</Typography>}
      {info && rows.length === 0 && <Typography sx={{ color: 'var(--c-text-2)', fontSize: 13.5 }}>{info.resourcesKnown ? 'This machine has no list of tools and spares yet — add the items below.' : 'Add the items below.'}</Typography>}
      <Box data-testid="mr-lines" sx={{ display: 'grid', gap: 0.75 }}>
        {rows.map((r, i) => (
          <Box key={r.itemId} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 110px 60px 36px', gap: 1, alignItems: 'center' }} data-testid="mr-line">
            <Box sx={{ minWidth: 0 }}><Mono>{r.code}</Mono> <Typography component="span" sx={{ fontSize: 13.5 }}>{r.name}</Typography></Box>
            <TextField size="small" type="number" value={r.qty} onChange={(e) => setRows((rs) => rs.map((x, k) => (k === i ? { ...x, qty: e.target.value } : x)))}
              inputProps={{ min: 0, 'aria-label': `Quantity of ${r.code}`, 'data-testid': 'mr-qty' }} />
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{r.uom}</Typography>
            <IconButton size="small" aria-label={`Remove ${r.code}`} onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))}><DeleteOutlineRounded fontSize="small" /></IconButton>
          </Box>
        ))}
      </Box>
      <ServerPicker<ResourceItem> label="Add an item" noun="item" value={adding} onChange={add}
        search={(t) => searchResourceItems(t, { all: true })} getId={(it) => it.id} getLabel={(it) => `${it.code} · ${it.name}`} />
      <OrderPicker value={salesOrder} onChange={setSalesOrder} label="For sales order (optional)" helperText="When the spares are for a project, its cost sheet carries them." />
      <TextField size="small" label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={order ? `${order.code}: ${order.title}` : ''} />
    </FormDialog>
  );
}

const fromRule = (r: DowntimeRule, today: string): DowntimeForm => ({
  ...blankDowntime(today), kind: r.kind, reason: r.reason, startsOn: r.startsOn, endsOn: r.endsOn ?? '', startTime: r.startTime,
  hours: String(Math.round((r.durationMinutes / 60) * 100) / 100), weekdays: r.weekdays.length ? r.weekdays : ['sun'], everyN: String(r.everyN),
  monthMode: r.monthDay ? 'day' : 'nth', monthDay: String(r.monthDay ?? 1), monthWeek: r.monthWeek ?? 1, monthWeekday: r.monthWeekday ?? 'sun', notes: r.notes ?? '',
});

/**
 * PLANNED DOWNTIME — recurring ("every 1st Sunday, 8 h") or once, with a reason. Saved, it is written into the machine
 * calendar the planner reads; the next dates show as you type.
 */
export function DowntimeDialog({ open, rule, today, machines, machineId: given = null, onClose, onDone }: {
  open: boolean; rule: DowntimeRule | null; today: string; machines: MachineOption[]; machineId?: number | null; onClose: () => void; onDone: (msg: string) => void;
}) {
  const [machineId, setMachineId] = useState<number | null>(given);
  const [f, setF] = useState<DowntimeForm>(() => blankDowntime(today));
  const [next, setNext] = useState<Occurrence[] | null>(null);
  useEffect(() => {
    if (!open) return;
    setMachineId(rule?.machineId ?? given);
    setF(rule ? fromRule(rule, today) : blankDowntime(today));
  }, [open, rule, given, today]);
  const set = (patch: Partial<DowntimeForm>) => setF((x) => ({ ...x, ...patch }));
  const { body, problems } = useMemo(() => downtimeBody(machineId, f), [machineId, f]);
  useEffect(() => {
    if (!open || !body) { setNext(null); return undefined; }
    const t = window.setTimeout(() => { previewDowntime(body).then((r) => setNext(r.next)).catch(() => setNext(null)); }, 350);
    return () => window.clearTimeout(t);
  }, [open, body]);
  return (
    <FormDialog open={open} onClose={onClose} maxWidth="md" title={rule ? 'Change planned downtime' : 'Planned downtime'} submitLabel={rule ? 'Save — from today on' : 'Save'}
      subtitle="Written into the machine's calendar — the plan gives it no work in these hours."
      submitDisabled={!body}
      onSubmit={async () => {
        const r = rule ? await updateDowntime(rule.id, body!) : await createDowntime(body!);
        onDone(`Saved: ${ruleText(body!)} (${r.calendarRows} calendar days).`);
      }}>
      {!rule && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {PRESETS.map((p) => <Button key={p.key} size="small" variant="outlined" onClick={() => setF((x) => p.apply(x))} data-testid={`preset-${p.key}`}>{p.label}</Button>)}
        </Box>
      )}
      <MachineSelect machines={machines} value={machineId} onChange={setMachineId} autoFocus={!given && !rule} />
      <TextField size="small" label="Reason" value={f.reason} onChange={(e) => set({ reason: e.target.value })} inputProps={{ 'data-testid': 'dt-reason' }} />
      <ToggleButtonGroup size="small" exclusive value={f.kind} onChange={(_, v) => v && set({ kind: v })} aria-label="How often">
        <ToggleButton value="once" sx={{ textTransform: 'none' }}>Once</ToggleButton>
        <ToggleButton value="weekly" sx={{ textTransform: 'none' }}>Weekly</ToggleButton>
        <ToggleButton value="monthly" sx={{ textTransform: 'none' }}>Monthly</ToggleButton>
      </ToggleButtonGroup>
      {f.kind === 'weekly' && (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <ToggleButtonGroup size="small" value={f.weekdays} onChange={(_, v: string[]) => set({ weekdays: WEEKDAYS.filter((w) => v.includes(w)) })} aria-label="Days">
            {WEEKDAYS.map((w) => <ToggleButton key={w} value={w} sx={{ textTransform: 'none', px: 1.25 }}>{WEEKDAY_LABEL[w]}</ToggleButton>)}
          </ToggleButtonGroup>
          <TextField size="small" type="number" label="Every … weeks" value={f.everyN} onChange={(e) => set({ everyN: e.target.value })} sx={{ width: 130 }} />
        </Box>
      )}
      {f.kind === 'monthly' && (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField select size="small" value={f.monthMode} onChange={(e) => set({ monthMode: e.target.value as 'day' | 'nth' })} sx={{ width: 150 }} label="On">
            <MenuItem value="nth">a weekday</MenuItem>
            <MenuItem value="day">a date</MenuItem>
          </TextField>
          {f.monthMode === 'nth' ? (
            <>
              <TextField select size="small" value={f.monthWeek} onChange={(e) => set({ monthWeek: Number(e.target.value) })} sx={{ width: 100 }} label="Which">
                {NTH.map((x) => <MenuItem key={x.v} value={x.v}>{x.l}</MenuItem>)}
              </TextField>
              <TextField select size="small" value={f.monthWeekday} onChange={(e) => set({ monthWeekday: e.target.value })} sx={{ width: 120 }} label="Day">
                {WEEKDAYS.map((w) => <MenuItem key={w} value={w}>{WEEKDAY_LABEL[w]}</MenuItem>)}
              </TextField>
            </>
          ) : (
            <TextField size="small" type="number" label="Day of month" value={f.monthDay} onChange={(e) => set({ monthDay: e.target.value })} sx={{ width: 130 }} inputProps={{ min: 1, max: 31 }} />
          )}
          <TextField size="small" type="number" label="Every … months" value={f.everyN} onChange={(e) => set({ everyN: e.target.value })} sx={{ width: 140 }} />
        </Box>
      )}
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        <TextField size="small" type="date" label={f.kind === 'once' ? 'Date' : 'From'} value={f.startsOn} onChange={(e) => set({ startsOn: e.target.value })} InputLabelProps={{ shrink: true }} sx={{ width: 160 }} />
        {f.kind !== 'once' && <TextField size="small" type="date" label="Until (optional)" value={f.endsOn} onChange={(e) => set({ endsOn: e.target.value })} InputLabelProps={{ shrink: true }} sx={{ width: 160 }} />}
        <TextField size="small" type="time" label="Starts at" value={f.startTime} onChange={(e) => set({ startTime: e.target.value })} InputLabelProps={{ shrink: true }} sx={{ width: 130 }} />
        <TextField size="small" type="number" label="Hours down" value={f.hours} onChange={(e) => set({ hours: e.target.value })} sx={{ width: 120 }} inputProps={{ min: 0, step: 0.5, 'data-testid': 'dt-hours' }} />
      </Box>
      <Box data-testid="dt-summary" sx={{ p: 1.5, borderRadius: 'var(--r-md)', background: 'var(--c-surface-2, var(--c-primary-50))' }}>
        {body ? <Typography sx={{ fontWeight: 600 }}>{ruleText(body)}</Typography> : <Typography sx={{ color: 'var(--c-text-2)' }}>{problems.join(' ')}</Typography>}
        {next && next.length > 0 && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mt: 0.5 }}>Next: {next.slice(0, 4).map((o) => whenText(o.start)).join(' · ')}</Typography>}
      </Box>
    </FormDialog>
  );
}

/** A PREVENTIVE PLAN — every N days / N run hours / N tonnes (hours and tonnes from the machine log). */
export function PlanDialog({ open, plan, machines, onClose, onDone }: { open: boolean; plan: Plan | null; machines: MachineOption[]; onClose: () => void; onDone: (msg: string) => void }) {
  const [machineId, setMachineId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [days, setDays] = useState('');
  const [hours, setHours] = useState('');
  const [tonnes, setTonnes] = useState('');
  const [lastDone, setLastDone] = useState('');
  const [active, setActive] = useState(true);
  useEffect(() => {
    if (!open) return;
    setMachineId(plan?.machine.id ?? null); setTitle(plan?.title ?? ''); setDays(plan?.everyDays != null ? String(plan.everyDays) : plan ? '' : '30');
    setHours(plan?.everyRunHours != null ? String(plan.everyRunHours) : ''); setTonnes(plan?.everyTonnes != null ? String(plan.everyTonnes) : '');
    setLastDone(''); setActive(plan ? plan.status === 'active' : true);
  }, [open, plan]);
  const n = (s: string) => (s.trim() === '' ? null : Number(s));
  const ok = !!machineId && !!title.trim() && (n(days) != null || n(hours) != null || n(tonnes) != null);
  return (
    <FormDialog open={open} onClose={onClose} title={plan ? `Change ${plan.title}` : 'Preventive plan'} submitLabel="Save" submitDisabled={!ok}
      subtitle="An order opens by itself when any of these is reached. Leave a box empty to not count it."
      onSubmit={async () => {
        const body = { machineId: machineId!, title: title.trim(), everyDays: n(days), everyRunHours: n(hours), everyTonnes: n(tonnes), status: active ? 'active' : 'inactive', lastDoneOn: lastDone || null };
        if (plan) await updatePlan(plan.id, body); else await createPlan(body);
        onDone(`${title.trim()} saved.`);
      }}>
      <MachineSelect machines={machines} value={machineId} onChange={setMachineId} autoFocus={!plan} />
      <TextField size="small" label="The job" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Lubricate the gantry rails" inputProps={{ 'data-testid': 'plan-title' }} />
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        <TextField size="small" type="number" label="Every … days" value={days} onChange={(e) => setDays(e.target.value)} sx={{ width: 140 }} inputProps={{ 'data-testid': 'plan-days' }} />
        <TextField size="small" type="number" label="or … run hours" value={hours} onChange={(e) => setHours(e.target.value)} sx={{ width: 150 }} />
        <TextField size="small" type="number" label="or … tonnes" value={tonnes} onChange={(e) => setTonnes(e.target.value)} sx={{ width: 140 }} />
      </Box>
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField size="small" type="date" label="Last done on (optional)" value={lastDone} onChange={(e) => setLastDone(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: 200 }}
          helperText={plan ? 'Counts again from this date' : 'Empty = counts from today'} />
        {plan && <FormControlLabel control={<Checkbox checked={active} onChange={(e) => setActive(e.target.checked)} />} label="Active" />}
      </Box>
    </FormDialog>
  );
}
