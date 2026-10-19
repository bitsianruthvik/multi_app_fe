import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert, Autocomplete, Box, Button, IconButton, TextField, Tooltip, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import {
  clearCustomerAllowance, clearOrderAllowance, clearRowAllowance, getCustomerAllowances, getOrderAllowances, getPartNames, getRowAllowance,
  setCustomerAllowance, setOrderAllowance, setRowAllowance,
  type AllowanceFollowUp, type AllowanceRule, type OrderPartName, type PartName, type RuleInput,
} from '../api/cutAllowances';
import { exampleText, readInputs, ruleText, sourceText } from '../lib/cutAllowance';
import { useLoad } from '../hooks/useLoad';
import { FormDialog } from './FormDialog';
import { Badge, ErrorNotice, Mono, SectionCard } from './ui';
import { useToast } from './toastContext';
import { FlashOnChange } from '../motion';

/**
 * CUTTING ALLOWANCE (init.sql §64, 2026-10-16). Customers cut flanges and webs a little long, so welding
 * shrinkage and end trimming can be absorbed. A rule is mm at each end (× 2) plus mm a metre, on the length only.
 * It changes only the cut pieces — the rows keep their drawn length, and the order weight stays as drawn.
 * Three places set it: the customer (per part name), the order (per part name in its BOM), one row.
 */

const LOCK_NOTE = 'A line whose design is frozen keeps its cut pieces. A revision of the order takes the new allowance.';

/** The two inputs and what they do to a length — the one editor every level uses. */
function RuleFields({ perEnd, perMetre, onPerEnd, onPerMetre, length, autoFocus = false }: {
  perEnd: string; perMetre: string; onPerEnd: (v: string) => void; onPerMetre: (v: string) => void; length: number | null; autoFocus?: boolean;
}) {
  const read = readInputs(perEnd, perMetre);
  const example = 'rule' in read ? exampleText(read.rule, length ?? 12000) : null;
  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
        <TextField label="mm at each end" value={perEnd} onChange={(e) => onPerEnd(e.target.value)} autoFocus={autoFocus}
          inputProps={{ inputMode: 'decimal', 'data-testid': 'allowance-per-end' }} helperText="Added at both ends" />
        <TextField label="mm a metre (optional)" value={perMetre} onChange={(e) => onPerMetre(e.target.value)}
          inputProps={{ inputMode: 'decimal', 'data-testid': 'allowance-per-metre' }} helperText="Added for every metre of length" />
      </Box>
      {'error' in read
        ? <Typography sx={{ fontSize: 13, color: 'var(--c-danger-700)' }}>{read.error}</Typography>
        : (
          <Typography data-testid="allowance-example" sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
            {length ? 'This row: ' : 'A 12 m part: '}<Mono>{example}</Mono>. Width stays the same.
          </Typography>
        )}
    </Box>
  );
}

/** One rule, edited in a dialog. `levels` says what it overrides; `onClear` (when set) takes it away. */
function RuleDialog({ open, title, subtitle, initial, length, levels, picker, onClose, onSave, onClear, clearLabel }: {
  open: boolean; title: string; subtitle?: ReactNode; initial: RuleInput | null; length: number | null; levels?: ReactNode; picker?: ReactNode;
  onClose: () => void; onSave: (rule: RuleInput) => Promise<unknown>; onClear?: () => Promise<unknown>; clearLabel?: string;
}) {
  const [perEnd, setPerEnd] = useState('');
  const [perMetre, setPerMetre] = useState('');
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setClearError(null);
    setPerEnd(initial ? String(initial.perEndMm) : '');
    setPerMetre(initial && initial.perMetreMm ? String(initial.perMetreMm) : '');
  }, [open, initial]);
  const read = readInputs(perEnd, perMetre);
  return (
    <FormDialog open={open} title={title} subtitle={subtitle} onClose={onClose} submitLabel="Save" submitDisabled={'error' in read || clearing}
      onSubmit={async () => { if ('rule' in read) await onSave(read.rule); }}
      extraActions={onClear ? (
        <Button color="inherit" disabled={clearing} data-testid="allowance-clear"
          onClick={async () => { setClearing(true); setClearError(null); try { await onClear(); onClose(); } catch (e) { setClearError((e as Error).message); } finally { setClearing(false); } }}>
          {clearLabel ?? 'Remove'}
        </Button>
      ) : undefined}>
      {picker}
      {levels}
      {clearError && <Alert severity="error">{clearError}</Alert>}
      <RuleFields perEnd={perEnd} perMetre={perMetre} onPerEnd={setPerEnd} onPerMetre={setPerMetre} length={length} autoFocus={!picker} />
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>Only the cut pieces get longer. The order weight stays as drawn. {LOCK_NOTE}</Typography>
    </FormDialog>
  );
}

/** "Customer: 7.5 mm at each end · This order: none" — the levels above the one being edited. */
function Levels({ items }: { items: { label: string; rule: AllowanceRule | null }[] }) {
  return (
    <Box sx={{ display: 'grid', gap: 0.25, fontSize: 13, color: 'var(--c-text-2)' }}>
      {items.map((x) => <Box key={x.label}>{x.label}: <strong>{x.rule ? ruleText(x.rule) : 'not set'}</strong></Box>)}
    </Box>
  );
}

const toastAfter = (toast: ReturnType<typeof useToast>, r: AllowanceFollowUp, saved: string) => toast.success(r.message ? `${saved} ${r.message}` : saved);

/* ─────────────────────────────── the customer ─────────────────────────────── */

/** The customer's defaults, per part name — inside the customer's edit dialog. */
export function CustomerCutAllowance({ customerId, canEdit = true }: { customerId: number; canEdit?: boolean }) {
  const toast = useToast();
  const list = useLoad(() => getCustomerAllowances(customerId), [customerId]);
  const [editing, setEditing] = useState<{ definitionId: number | null; name: string | null; rule: RuleInput | null } | null>(null);
  const [names, setNames] = useState<PartName[]>([]);
  const [picked, setPicked] = useState<PartName | null>(null);
  useEffect(() => {
    if (!editing || editing.definitionId != null) return;
    let alive = true;
    getPartNames().then((r) => { if (alive) setNames(r.partNames); }).catch(() => { if (alive) setNames([]); });
    return () => { alive = false; };
  }, [editing]);
  const rules = list.data?.rules ?? [];
  const taken = new Set(rules.map((r) => r.definitionId));
  const definitionId = editing?.definitionId ?? picked?.id ?? null;
  return (
    <Box data-testid="customer-cut-allowance">
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Cutting allowance</Typography>
        {canEdit && <Button size="small" startIcon={<AddRounded />} onClick={() => { setPicked(null); setEditing({ definitionId: null, name: null, rule: null }); }}>Add part name</Button>}
      </Box>
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mb: 1 }}>
        Cut some parts a little long, for welding shrinkage and trimming. Chosen by part name. Only the cut pieces get longer; the order weight stays as drawn.
      </Typography>
      <ErrorNotice error={list.error} onRetry={list.reload} />
      {rules.length === 0 && list.data && <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>No allowance — parts are cut as drawn.</Typography>}
      {rules.map((r) => (
        <Box key={r.id} data-testid="customer-allowance-row" sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, borderTop: '1px solid var(--c-border)', flexWrap: 'wrap' }}>
          <Box sx={{ flex: '1 1 160px', minWidth: 0, fontWeight: 500, overflowWrap: 'anywhere' }}>{r.definition.name ?? r.definition.code}</Box>
          <Box sx={{ flex: '2 1 200px', minWidth: 0, fontSize: 13 }}>
            {r.words}{r.example && <Box component="span" sx={{ color: 'var(--c-text-3)' }}> · 12 m part: <Mono>{r.example.words}</Mono></Box>}
          </Box>
          {canEdit && (
            <Box sx={{ display: 'flex' }}>
              <Tooltip title="Change"><IconButton size="small" aria-label={`Change the allowance for ${r.definition.name}`} onClick={() => setEditing({ definitionId: r.definitionId, name: r.definition.name, rule: r })}><EditRounded fontSize="small" /></IconButton></Tooltip>
              <Tooltip title="Remove"><IconButton size="small" aria-label={`Remove the allowance for ${r.definition.name}`}
                onClick={async () => { try { const out = await clearCustomerAllowance(customerId, r.definitionId); list.setData(out); toastAfter(toast, out, 'Allowance removed.'); } catch (e) { toast.error((e as Error).message); } }}>
                <DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
            </Box>
          )}
        </Box>
      ))}
      <RuleDialog open={!!editing} title={editing?.name ? `Allowance for ${editing.name}` : 'Add a cutting allowance'}
        subtitle={`Every order of ${list.data?.customer.name ?? 'this customer'} starts from this. An order can override it.`}
        initial={editing?.rule ?? null} length={null} onClose={() => setEditing(null)}
        picker={editing && editing.definitionId == null ? (
          <Autocomplete options={names.filter((n) => !taken.has(n.id))} value={picked} onChange={(_, v) => setPicked(v)}
            getOptionLabel={(o) => o.name ?? o.code ?? String(o.id)} isOptionEqualToValue={(a, b) => a.id === b.id}
            renderInput={(params) => <TextField {...params} label="Part name" autoFocus helperText="The catalog's plate parts" inputProps={{ ...params.inputProps, 'data-testid': 'allowance-part-name' }} />} />
        ) : undefined}
        onSave={async (rule) => {
          if (definitionId == null) throw new Error('Choose a part name.');
          const out = await setCustomerAllowance(customerId, definitionId, rule);
          list.setData(out);
          toastAfter(toast, out, 'Allowance saved.');
        }} />
    </Box>
  );
}

/* ─────────────────────────────── the order ─────────────────────────────── */

/** The order's allowance: each part name in its BOM — the customer's rule, this order's override — and its row overrides. */
export function OrderCutAllowancePanel({ orderId, canEdit = true, onChanged }: { orderId: number; canEdit?: boolean; onChanged?: () => void }) {
  const toast = useToast();
  const view = useLoad(() => getOrderAllowances(orderId), [orderId]);
  const [editing, setEditing] = useState<OrderPartName | null>(null);
  const [rowOpen, setRowOpen] = useState<{ lineId: number; rowId: number } | null>(null);
  const v = view.data;
  const editable = canEdit && !!v?.order.editable;
  const frozen = (v?.lines ?? []).filter((l) => l.frozen);
  const after = (out: AllowanceFollowUp, saved: string) => { toastAfter(toast, out, saved); onChanged?.(); };
  return (
    <SectionCard title="Cutting allowance" subtitle="Parts cut a little long, for welding shrinkage and trimming. Only the cut pieces get longer; the order weight stays as drawn.">
      <Box data-testid="order-cut-allowance" sx={{ display: 'grid', gap: 1.5 }}>
        <ErrorNotice error={view.error} onRetry={view.reload} />
        {v && !v.order.editable && v.order.reason && <Alert severity="info">{v.order.reason}</Alert>}
        {frozen.length > 0 && (
          <Alert severity="info" data-testid="allowance-frozen">
            {frozen.length === 1 ? `Line ${frozen[0].lineNo} is frozen` : `Lines ${frozen.map((l) => l.lineNo).join(', ')} are frozen`}: {frozen.length === 1 ? 'its' : 'their'} cut pieces stay as they are. A change here reaches {frozen.length === 1 ? 'it' : 'them'} through a revision of the order.
          </Alert>
        )}
        {v && !v.order.customer && <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>This order has no customer, so nothing comes from a customer. Set an allowance here.</Typography>}
        {v && v.partNames.length === 0 && <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>This order has no part cut from plate yet.</Typography>}
        {v?.partNames.map((p) => (
          <Box key={p.definitionId} data-testid="order-allowance-part" sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', py: 0.75, borderTop: '1px solid var(--c-border)' }}>
            <Box sx={{ flex: '1 1 180px', minWidth: 0 }}>
              <Box sx={{ fontWeight: 500, overflowWrap: 'anywhere' }}>{p.definition.name ?? p.definition.code}</Box>
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{p.rows} {p.rows === 1 ? 'row' : 'rows'}{p.rowOverrides ? ` · ${p.rowOverrides} with its own` : ''}</Typography>
            </Box>
            <Box sx={{ flex: '2 1 240px', minWidth: 0, fontSize: 13 }}>
              <Box><FlashOnChange value={p.effective ? `${ruleText(p.effective)} · ${sourceText(p.effective)}` : ''}>{p.effective ? <><strong>{ruleText(p.effective)}</strong> · {sourceText(p.effective)}</> : <span>Cut as drawn</span>}</FlashOnChange></Box>
              {p.order && p.customer && <Box sx={{ color: 'var(--c-text-3)' }}>Customer: {ruleText(p.customer)}</Box>}
              {p.example && p.effective && <Box sx={{ color: 'var(--c-text-2)' }}>Longest row: <Mono>{p.example.words}</Mono></Box>}
            </Box>
            {editable && (
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                <Button size="small" variant="outlined" onClick={() => setEditing(p)}>{p.order ? 'Change' : 'Override'}</Button>
              </Box>
            )}
          </Box>
        ))}
        {v && v.rows.length > 0 && (
          <Box>
            <Typography sx={{ fontSize: 13, fontWeight: 600, mt: 1 }}>Rows with their own allowance</Typography>
            {v.rows.map((r) => (
              <Box key={r.partId} data-testid="order-allowance-row" sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', py: 0.5, borderTop: '1px solid var(--c-border)' }}>
                <Box sx={{ flex: '1 1 180px', minWidth: 0, overflowWrap: 'anywhere' }}>Line {r.lineNo} · {r.name ?? r.code ?? `#${r.partId}`}{r.definition ? <Box component="span" sx={{ color: 'var(--c-text-3)' }}> ({r.definition.name})</Box> : null}</Box>
                <Box sx={{ flex: '2 1 200px', minWidth: 0, fontSize: 13 }}><strong>{ruleText(r.rule)}</strong>{r.example && <> · <Mono>{r.example.words}</Mono></>}</Box>
                {editable && <Button size="small" onClick={() => setRowOpen({ lineId: r.lineId, rowId: r.partId })}>Change</Button>}
              </Box>
            ))}
          </Box>
        )}
        {v && v.noPartName > 0 && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{v.noPartName} plate {v.noPartName === 1 ? 'part has' : 'parts have'} no part name. Set {v.noPartName === 1 ? 'its' : 'their'} allowance on the row (Structure › row menu).</Typography>}
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>A row can have its own allowance: open its menu on the Structure tab. {LOCK_NOTE}</Typography>
      </Box>
      <RuleDialog open={!!editing} title={editing ? `${editing.definition.name ?? 'Part'} on this order` : ''}
        subtitle="Overrides the customer's allowance for this part name, on this order only."
        initial={editing?.order ?? editing?.customer ?? null} length={editing?.lengths?.max ?? null}
        levels={editing ? <Levels items={[{ label: 'Customer', rule: editing.customer }]} /> : undefined}
        onClose={() => setEditing(null)}
        onSave={async (rule) => { if (!editing) return; const out = await setOrderAllowance(orderId, editing.definitionId, rule); view.setData(out); after(out, 'Allowance saved.'); }}
        onClear={editing?.order ? async () => { const out = await clearOrderAllowance(orderId, editing.definitionId); view.setData(out); after(out, 'Back to the customer\'s allowance.'); } : undefined}
        clearLabel={v?.order.customer ? "Use the customer's" : 'Remove'} />
      {rowOpen && (
        <RowCutAllowanceDialog open orderId={orderId} lineId={rowOpen.lineId} rowId={rowOpen.rowId}
          onClose={() => setRowOpen(null)} onSaved={() => { view.reload(); onChanged?.(); }} />
      )}
    </SectionCard>
  );
}

/* ─────────────────────────────── one row ─────────────────────────────── */

/** One row's own allowance — from the Structure tab's row menu. */
export function RowCutAllowanceDialog({ open, orderId, lineId, rowId, onClose, onSaved }: {
  open: boolean; orderId: number; lineId: number; rowId: number; onClose: () => void; onSaved?: () => void;
}) {
  const toast = useToast();
  const row = useLoad(() => (open ? getRowAllowance(orderId, lineId, rowId) : Promise.resolve(null)), [open, orderId, lineId, rowId]);
  const r = row.data;
  const initial = useMemo(() => r?.own ?? r?.effective ?? null, [r]);
  if (open && row.error) {
    return (
      <FormDialog open title="Cutting allowance" onClose={onClose} onSubmit={() => undefined} submitDisabled submitLabel="Save">
        <ErrorNotice error={row.error} />
      </FormDialog>
    );
  }
  if (!r) return null;
  const name = r.row.name ?? r.row.code ?? 'This row';
  return (
    <RuleDialog open={open && !!r} title={`Allowance for ${name}`}
      subtitle={<>This row only. {r.row.definition ? `Part name: ${r.row.definition.name}.` : 'It has no part name.'}{r.lineFrozen ? ` ${r.lineFrozen.message}` : ''}</>}
      initial={initial} length={r.row.drawnLength}
      levels={(
        <Box sx={{ display: 'grid', gap: 0.75 }}>
          <Levels items={[{ label: 'Customer', rule: r.customer }, { label: 'This order', rule: r.order }]} />
          <Box sx={{ fontSize: 13 }}>
            Now: <strong>{r.effective ? ruleText(r.effective) : 'cut as drawn'}</strong>{r.effective && <> · {sourceText(r.effective)}</>}{r.example && <> · <Mono>{r.example.words}</Mono></>}
          </Box>
          {r.lineFrozen && <Badge family="warning" label="Its line is frozen — its cut pieces stay as they are" />}
        </Box>
      )}
      onClose={onClose}
      onSave={async (rule) => { const out = await setRowAllowance(orderId, lineId, rowId, rule); toastAfter(toast, out, 'Row allowance saved.'); onSaved?.(); }}
      onClear={r.own ? async () => { const out = await clearRowAllowance(orderId, lineId, rowId); toastAfter(toast, out, 'Back to the part name\'s allowance.'); onSaved?.(); } : undefined}
      clearLabel="Use the part name's" />
  );
}
