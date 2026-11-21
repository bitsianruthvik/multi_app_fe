import { useEffect, useState } from 'react';
import { Box, Button, Checkbox, FormControlLabel, IconButton, MenuItem, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import { cfApi, qs } from '../../api/client';
import type { Machine, Party, SalesOrder } from '../../api/types';
import {
  addDepartment, addPerson, getDepartments, getDeskSettings, giveOut, qtyText, searchPeople,
  type Department, type GivenType, type LedgerRow, type StoreArea, type StorePerson,
} from '../../api/storesDesk';
import { FormDialog } from '../FormDialog';
import { OrderPicker, PartyPicker, ServerPicker } from '../ServerPicker';

export interface GiveOutItem { id: number; name: string; uom: string; returnable: boolean; inStock: number; issueConditions?: string | null }
interface Line { item: GiveOutItem; qty: string; checked: boolean }

/** What the storekeeper chose last time, so the usual give-out is a quantity and Enter. Kept in this browser only. */
const LAST = 'cf_erp.stores.givenFor';
const readLast = (): { type?: GivenType; departmentId?: number } => { try { return JSON.parse(localStorage.getItem(LAST) ?? '{}') ?? {}; } catch { return {}; } };
const keepLast = (v: { type: GivenType; departmentId?: number }) => { try { localStorage.setItem(LAST, JSON.stringify(v)); } catch { /* a private window: nothing is remembered */ } };
const itemOf = (r: LedgerRow): GiveOutItem => ({ id: r.item.id, name: r.item.name, uom: r.item.uom, returnable: r.item.returnable, inStock: r.now, issueConditions: r.item.issueConditions ?? null });

/**
 * GIVE OUT (init.sql §111). It is for a SALES ORDER or goes to a CONTRACTOR (user, 2026-11-22) — exactly one. A
 * department and "collected by" show only on a company that switched them on (Setup › Settings › Stores: the day). ONE OR SEVERAL ITEMS go out together (user, 2026-11-22): it opens with the
 * item of the row pressed (or empty, from the page's own button) and more are added by search; all of them are one
 * entry in the stock book. Who collected it and the machine are optional; a returnable item given for an order needs
 * the person, since it comes back from someone. What Maintenance wants checked for a tool is shown on its line and
 * ticked. The stock's own refusals (not enough, a batch on hold, a closed order, reserved for an order) come back in
 * words, with the line number, and are shown under the form.
 */
export function GiveOutDialog({ open, item, areas, onClose, onDone }: {
  /** Open with no item yet (the page's "Give out" button). With `item` it opens on that item. */
  open?: boolean; item: GiveOutItem | null; areas: StoreArea[]; onClose: () => void; onDone: (text: string) => void;
}) {
  const shown = !!item || !!open;
  const [lines, setLines] = useState<Line[]>([]);
  const [type, setType] = useState<GivenType>('order');
  const [allowDept, setAllowDept] = useState(false);
  const [allowPerson, setAllowPerson] = useState(false);
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
  const storage = areas.filter((a) => a.purpose === 'storage');

  useEffect(() => {
    if (!shown) return;
    const last = readLast();
    setLines(item ? [{ item, qty: '', checked: false }] : []);
    setOrder(null); setVendor(null); setPerson(null); setMachine(null); setNotes(''); setAreaId(''); setAdding(null); setNewName('');
    setType(last.type && last.type !== 'department' ? last.type : 'order');
    void getDeskSettings().then((s) => {
      setAllowDept(!!s.giveOutDepartments); setAllowPerson(!!s.giveOutPerson);
      if (s.giveOutDepartments) {
        if (last.type === 'department') setType('department');
        void getDepartments().then((d) => { setDepartments(d); setDepartmentId(d.some((x) => x.id === last.departmentId) ? last.departmentId! : ''); }).catch(() => setDepartments([]));
      }
    }).catch(() => { setAllowDept(false); setAllowPerson(false); });
  }, [shown, item]);

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

  const setLine = (id: number, patch: Partial<Line>) => setLines((cur) => cur.map((l) => (l.item.id === id ? { ...l, ...patch } : l)));
  const addItem = (r: LedgerRow | null) => { if (r) setLines((cur) => (cur.some((l) => l.item.id === r.item.id) ? cur : [...cur, { item: itemOf(r), qty: '', checked: false }])); };
  const lineOk = (l: Line) => { const n = Number(l.qty); return Number.isFinite(n) && n > 0 && (!l.item.issueConditions || l.checked); };
  const anyReturnable = lines.some((l) => l.item.returnable);
  const ready = lines.length > 0 && lines.every(lineOk)
    && (type === 'order' ? !!order : type === 'department' ? departmentId !== '' : !!vendor);
  const save = async () => {
    const r = await giveOut({
      givenFor: { type, ...(type === 'order' ? { orderId: order!.id } : type === 'department' ? { departmentId: Number(departmentId) } : { partyId: vendor!.id }) },
      personId: allowPerson ? person?.id ?? null : null, machineId: machine?.id ?? null, notes: notes.trim() || null,
      lines: lines.map((l) => ({ itemId: l.item.id, quantity: Number(l.qty), ...(areaId === '' ? {} : { areaId }), ...(l.item.issueConditions ? { conditionsChecked: l.checked } : {}) })),
    });
    keepLast({ type, ...(type === 'department' ? { departmentId: Number(departmentId) } : {}) });
    const what = lines.length === 1 ? `${qtyText(Number(lines[0].qty))} ${lines[0].item.uom} of ${lines[0].item.name}` : `${lines.length} items`;
    onDone(`${what} given out${r.movement.code ? ` (${r.movement.code})` : ''}${r.outWith ? ` — ${r.outWith === 1 ? 'one is' : `${r.outWith} are`} on the Out with list until ${r.outWith === 1 ? 'it comes' : 'they come'} back` : ''}.`);
  };

  return (
    <FormDialog open={shown} title={lines.length === 1 ? `Give out · ${lines[0].item.name}` : 'Give out'} onClose={onClose} onSubmit={save} submitLabel={lines.length > 1 ? `Give out ${lines.length} items` : 'Give out'} busyLabel="Giving out…" submitDisabled={!ready}
      subtitle="One or several items, given for one thing. It is one entry in the stock book." maxWidth="md">
      <Box data-testid="giveout-lines" sx={{ display: 'grid', gap: 1 }}>
        {lines.map((l, k) => (
          <Box key={l.item.id} sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', p: 1.25, display: 'grid', gap: 0.75 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 130px auto', gap: 1, alignItems: 'center' }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 500, overflowWrap: 'anywhere' }}>{l.item.name}</Typography>
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{qtyText(l.item.inStock)} {l.item.uom} in the store{l.item.returnable ? ' · a tool: it will be on Out with' : ''}</Typography>
              </Box>
              <TextField size="small" label={`Qty (${l.item.uom})`} value={l.qty} onChange={(e) => setLine(l.item.id, { qty: e.target.value })} autoFocus={k === 0}
                error={Number(l.qty) > l.item.inStock} inputProps={{ inputMode: 'decimal', 'data-testid': 'giveout-qty' }} />
              <IconButton size="small" aria-label={`Remove ${l.item.name}`} onClick={() => setLines((cur) => cur.filter((x) => x.item.id !== l.item.id))}><CloseRounded fontSize="small" /></IconButton>
            </Box>
            {l.item.issueConditions && (
              <Box data-testid="giveout-conditions" sx={{ p: 1, border: '1px solid var(--c-warning-300, var(--c-border))', background: 'var(--c-warning-50, transparent)', borderRadius: 'var(--r-sm)' }}>
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>Before giving it out (from Maintenance)</Typography>
                <Typography sx={{ fontSize: 13.5, whiteSpace: 'pre-line' }}>{l.item.issueConditions}</Typography>
                <FormControlLabel control={<Checkbox size="small" checked={l.checked} onChange={(e) => setLine(l.item.id, { checked: e.target.checked })} inputProps={{ 'aria-label': `Checked with the person collecting ${l.item.name}` }} />} label="Checked with the person collecting" />
              </Box>
            )}
          </Box>
        ))}
        <ServerPicker<LedgerRow> label={lines.length ? 'Add another item' : 'Item'} noun="item" value={null} onChange={addItem}
          search={(t) => cfApi.get<{ rows: LedgerRow[] }>(`/stores-desk/ledger${qs({ paged: 1, limit: 15, show: t ? 'all' : 'stock', search: t || undefined })}`).then((r) => r.rows.filter((x) => x.now > 0 && !lines.some((l) => l.item.id === x.item.id)))}
          getId={(r) => r.item.id} getLabel={(r) => `${r.item.name} · ${qtyText(r.now)} ${r.item.uom}`} />
      </Box>
      <Box>
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 0.5 }}>Given for</Typography>
        <ToggleButtonGroup exclusive size="small" value={type} onChange={(_, v) => v && setType(v)} aria-label="Given for" sx={{ flexWrap: 'wrap' }}>
          <ToggleButton value="order" data-testid="giveout-order">Sales order</ToggleButton>
          {allowDept && <ToggleButton value="department" data-testid="giveout-department">Department</ToggleButton>}
          <ToggleButton value="vendor" data-testid="giveout-vendor">Contractor</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      {type === 'order' && <OrderPicker value={order} onChange={setOrder} label="Sales order" helperText="It counts against this order's material and cost." />}
      {type === 'vendor' && <PartyPicker role="subcontractor" value={vendor} onChange={setVendor} label="Contractor" helperText="Only parties marked as contractors are listed. A tool sent to one is on Out with until it comes back; a consumable is used up." />}
      {allowDept && type === 'department' && (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <TextField select label="Department" value={departmentId} onChange={(e) => setDepartmentId(e.target.value === '' ? '' : Number(e.target.value))} sx={{ flex: '1 1 200px', minWidth: 0 }}
            helperText={departments.length ? undefined : 'No departments yet — add the first one.'}>
            {departments.map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
          </TextField>
          <Button onClick={() => { setAdding('department'); setNewName(''); }} sx={{ mt: 0.25, whiteSpace: 'nowrap' }}>New department</Button>
        </Box>
      )}
      {allowPerson && <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <ServerPicker<StorePerson> label={anyReturnable ? 'Collected by' : 'Collected by (optional)'} noun="person" value={person} onChange={setPerson}
          search={(t) => searchPeople(t)} getId={(p) => p.id} getLabel={(p) => `${p.name}${p.department ? ` · ${p.department.name}` : ''}`} sx={{ flex: '1 1 200px', minWidth: 0 }} />
        <Button onClick={() => { setAdding('person'); setNewName(''); }} sx={{ mt: 0.25, whiteSpace: 'nowrap' }}>New person</Button>
      </Box>}
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
        <TextField select label="From" value={areaId} onChange={(e) => setAreaId(e.target.value === '' ? '' : Number(e.target.value))} helperText="Left empty: for each item, the area that holds most of it.">
          <MenuItem value="">The area that holds most of it</MenuItem>
          {storage.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
        </TextField>
      )}
      <TextField label="Note (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
    </FormDialog>
  );
}
