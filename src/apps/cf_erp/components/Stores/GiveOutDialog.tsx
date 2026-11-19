import { useEffect, useState } from 'react';
import { Box, Button, Checkbox, FormControlLabel, MenuItem, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { cfApi, qs } from '../../api/client';
import type { Machine, Party, SalesOrder } from '../../api/types';
import {
  addDepartment, addPerson, getDepartments, giveOut, qtyText, searchPeople,
  type Department, type GivenType, type StoreArea, type StorePerson,
} from '../../api/storesDesk';
import { FormDialog } from '../FormDialog';
import { OrderPicker, PartyPicker, ServerPicker } from '../ServerPicker';

export interface GiveOutItem { id: number; name: string; uom: string; returnable: boolean; inStock: number; issueConditions?: string | null }

/** What the storekeeper chose last time, so the usual give-out is a quantity and Enter. Kept in this browser only. */
const LAST = 'cf_erp.stores.givenFor';
const readLast = (): { type?: GivenType; departmentId?: number } => { try { return JSON.parse(localStorage.getItem(LAST) ?? '{}') ?? {}; } catch { return {}; } };
const keepLast = (v: { type: GivenType; departmentId?: number }) => { try { localStorage.setItem(LAST, JSON.stringify(v)); } catch { /* a private window: nothing is remembered */ } };

/**
 * GIVE OUT (init.sql §111). One question with three answers — a sales order, a department or a vendor — because an
 * issue is charged to exactly one thing. Who collected it and the machine are optional; a returnable item given for an
 * order needs the person, since it comes back from someone. The stock's own refusals (not enough, a batch on hold, a
 * closed order) come back in words and are shown under the form.
 */
export function GiveOutDialog({ item, areas, onClose, onDone }: { item: GiveOutItem | null; areas: StoreArea[]; onClose: () => void; onDone: (text: string) => void }) {
  const [qty, setQty] = useState('');
  const [type, setType] = useState<GivenType>('department');
  const [order, setOrder] = useState<SalesOrder | null>(null);
  const [vendor, setVendor] = useState<Party | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentId, setDepartmentId] = useState<number | ''>('');
  const [person, setPerson] = useState<StorePerson | null>(null);
  const [machine, setMachine] = useState<Machine | null>(null);
  const [areaId, setAreaId] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [adding, setAdding] = useState<'department' | 'person' | null>(null);
  const [newName, setNewName] = useState('');
  // §114: what maintenance wants checked before this tool goes out; the storekeeper confirms it.
  const [checked, setChecked] = useState(false);
  const storage = areas.filter((a) => a.purpose === 'storage');

  useEffect(() => {
    if (!item) return;
    const last = readLast();
    setQty(''); setOrder(null); setVendor(null); setPerson(null); setMachine(null); setNotes(''); setAreaId(''); setAdding(null); setNewName(''); setChecked(false);
    setType(last.type ?? 'department');
    void getDepartments().then((d) => { setDepartments(d); setDepartmentId(d.some((x) => x.id === last.departmentId) ? last.departmentId! : ''); }).catch(() => setDepartments([]));
  }, [item]);

  const addNew = async () => {
    const name = newName.trim();
    if (!name) return;
    if (adding === 'department') {
      const d = await addDepartment(name);
      setDepartments((cur) => (cur.some((x) => x.id === d.id) ? cur : [...cur, d].sort((a, b) => a.name.localeCompare(b.name))));
      setDepartmentId(d.id);
    } else if (adding === 'person') {
      const p = await addPerson(name, departmentId === '' ? null : departmentId);
      setPerson({ id: p.id, name: p.name, department: departments.find((d) => d.id === departmentId) ?? null });
    }
    setAdding(null); setNewName('');
  };

  const n = Number(qty);
  const ready = !!item && Number.isFinite(n) && n > 0 && (!item.issueConditions || checked)
    && (type === 'order' ? !!order : type === 'department' ? departmentId !== '' : !!vendor);
  const save = async () => {
    if (!item) return;
    const r = await giveOut({
      givenFor: { type, ...(type === 'order' ? { orderId: order!.id } : type === 'department' ? { departmentId: Number(departmentId) } : { partyId: vendor!.id }) },
      personId: person?.id ?? null, machineId: machine?.id ?? null, notes: notes.trim() || null,
      lines: [{ itemId: item.id, quantity: n, ...(areaId === '' ? {} : { areaId }), ...(item.issueConditions ? { conditionsChecked: checked } : {}) }],
    });
    keepLast({ type, ...(type === 'department' ? { departmentId: Number(departmentId) } : {}) });
    onDone(`${qtyText(n)} ${item.uom} of ${item.name} given out${r.movement.code ? ` (${r.movement.code})` : ''}${r.outWith ? ' — it is on the Out with list until it comes back' : ''}.`);
  };

  return (
    <FormDialog open={!!item} title={item ? `Give out · ${item.name}` : 'Give out'} onClose={onClose} onSubmit={save} submitLabel="Give out" busyLabel="Giving out…" submitDisabled={!ready}
      subtitle={item ? `${qtyText(item.inStock)} ${item.uom} in the store${item.returnable ? ' · this item comes back' : ''}` : undefined}>
      {item?.issueConditions && (
        <Box data-testid="giveout-conditions" sx={{ p: 1.25, border: '1px solid var(--c-warning-300, var(--c-border))', background: 'var(--c-warning-50, transparent)', borderRadius: 'var(--r-sm)' }}>
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>Before giving it out (from Maintenance)</Typography>
          <Typography sx={{ fontSize: 14, whiteSpace: 'pre-line' }}>{item.issueConditions}</Typography>
          <FormControlLabel control={<Checkbox checked={checked} onChange={(e) => setChecked(e.target.checked)} inputProps={{ 'aria-label': 'Checked with the person collecting' }} />} label="Checked with the person collecting" />
        </Box>
      )}
      <TextField label={`Quantity (${item?.uom ?? ''})`} value={qty} onChange={(e) => setQty(e.target.value)} autoFocus inputProps={{ inputMode: 'decimal', 'data-testid': 'giveout-qty' }} />
      <Box>
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 0.5 }}>Given for</Typography>
        <ToggleButtonGroup exclusive size="small" value={type} onChange={(_, v) => v && setType(v)} aria-label="Given for" sx={{ flexWrap: 'wrap' }}>
          <ToggleButton value="order" data-testid="giveout-order">Sales order</ToggleButton>
          <ToggleButton value="department" data-testid="giveout-department">Department</ToggleButton>
          <ToggleButton value="vendor" data-testid="giveout-vendor">Vendor</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      {type === 'order' && <OrderPicker value={order} onChange={setOrder} label="Sales order" helperText="It counts against this order's material and cost." />}
      {type === 'vendor' && <PartyPicker value={vendor} onChange={setVendor} label="Vendor" helperText="Sent out for work: it stays ours and is expected back." />}
      {type === 'department' && (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <TextField select label="Department" value={departmentId} onChange={(e) => setDepartmentId(e.target.value === '' ? '' : Number(e.target.value))} sx={{ flex: '1 1 200px', minWidth: 0 }}
            helperText={departments.length ? undefined : 'No departments yet — add the first one.'}>
            {departments.map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
          </TextField>
          <Button onClick={() => { setAdding('department'); setNewName(''); }} sx={{ mt: 0.25, whiteSpace: 'nowrap' }}>New department</Button>
        </Box>
      )}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <ServerPicker<StorePerson> label={item?.returnable ? 'Collected by' : 'Collected by (optional)'} noun="person" value={person} onChange={setPerson}
          search={(t) => searchPeople(t)} getId={(p) => p.id} getLabel={(p) => `${p.name}${p.department ? ` · ${p.department.name}` : ''}`} sx={{ flex: '1 1 200px', minWidth: 0 }} />
        <Button onClick={() => { setAdding('person'); setNewName(''); }} sx={{ mt: 0.25, whiteSpace: 'nowrap' }}>New person</Button>
      </Box>
      {adding && (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', p: 1.25, border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)' }}>
          <TextField size="small" label={adding === 'department' ? 'New department' : 'New person'} value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus sx={{ flex: '1 1 180px' }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); void addNew(); } }} />
          <Button variant="outlined" onClick={() => void addNew()} disabled={!newName.trim()}>Add</Button>
          <Button onClick={() => setAdding(null)} sx={{ color: 'var(--c-text-2)' }}>Cancel</Button>
        </Box>
      )}
      <ServerPicker<Machine> label="Machine (optional)" noun="machine" value={machine} onChange={setMachine}
        search={(t) => cfApi.get<Machine[]>(`/machines${qs({ search: t || undefined })}`)} getId={(m) => m.id} getLabel={(m) => `${m.code} · ${m.name}`} />
      {storage.length > 1 && (
        <TextField select label="From" value={areaId} onChange={(e) => setAreaId(e.target.value === '' ? '' : Number(e.target.value))} helperText="Left empty: the area that holds most of it.">
          <MenuItem value="">The area that holds most of it</MenuItem>
          {storage.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
        </TextField>
      )}
      <TextField label="Note (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
    </FormDialog>
  );
}
