import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem,
  TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import FullscreenRounded from '@mui/icons-material/FullscreenRounded';
import FullscreenExitRounded from '@mui/icons-material/FullscreenExitRounded';
import { cfApi, CfApiError } from '../api/client';
import type { Batch, PurchaseLine, PurchaseOrder, Resolution, StockingArea } from '../api/types';
import { bookGrn, getGrnContext, type GrnBody, type GrnContext, type GrnResult } from '../api/grn';
import { getStates, type StateRow } from '../api/gst';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { Link } from 'react-router-dom';
import { appPath } from '../navMeta';
import { useFullScreen } from '../hooks/useFullScreen';
import { qtyText } from '../lib/inventory';
import { rupeeText } from '../lib/money';
import { gstRateText } from '../lib/gst';
import { computeGrn, grnBlockers, supplyKind, type DiscountMode, type GrnLineIn } from '../lib/grnMoney';
import { SpecValueInput } from './SpecValueInput';
import { ErrorNotice, Mono } from './ui';

/**
 * GRN — book a delivery against a purchase order WITH THE MONEY (init.sql §80, services/grnService.js).
 * Every pending line of the PO is on the grid (the one clicked is ticked); per line: quantity, unit price (the PO line's),
 * MRP, discount (% or ₹), HSN/SAC and GST rate (the item's), and the taxable value and tax as you type. Per GRN: where it
 * went, the supplier's invoice number + date (or "Invoice to follow"), freight and other charges (taxable or not).
 * Which tax: the supplier's state against the company's (CGST + SGST, or IGST); if a state is not set it is asked here.
 * Keyboard: Enter moves to the next field, Ctrl+Enter books. Full screen is remembered.
 */

const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(/,/g, '')));
const money = (n: number) => rupeeText(n, 2);
const mono = { fontFamily: 'var(--font-mono)' };
const cell = { px: 0.5, py: 0.5, verticalAlign: 'top' as const };

interface BatchState { mode: 'new' | 'existing'; supplierRef: string; values: Record<number, string>; batchId: string }
interface RowState extends GrnLineIn { included: boolean; hsn: string; batch: BatchState }

/** The batch a batch-kept item arrives in — the same fields the older receipt dialog asked for. */
function BatchEntry({ itemId, label, state, onChange, onMissing }: {
  itemId: number; label: string; state: BatchState; onChange: (b: BatchState) => void; onMissing: (m: string | null) => void;
}) {
  const template = useLoad(() => cfApi.get<Resolution>(`/items/${itemId}/batch-template`), [itemId]);
  const batches = useLoad(() => cfApi.get<Batch[]>(`/batches?itemId=${itemId}`), [itemId]);
  const fields = (template.data?.specs ?? []).filter((s) => s.applicable && s.rule.valueRule === 'entered');
  const needed = new Set((template.data?.missingRequired ?? []).map((m) => m.code));
  const open = (batches.data ?? []).filter((b) => b.status !== 'rejected');
  const missing = state.mode === 'new' ? fields.filter((s) => needed.has(s.spec.code) && !String(state.values[s.spec.id] ?? '').trim()) : [];
  const text = template.loading && !template.data ? `${label}: checking what the batch must record…`
    : state.mode === 'existing' && !state.batchId ? `${label}: choose the batch it is added to.`
      : missing.length ? `${label}: ${missing.map((s) => s.spec.name).join(', ')} required for a new batch.` : null;
  useEffect(() => { onMissing(text); return () => onMissing(null); }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Box sx={{ pl: 1.5, borderLeft: '2px solid var(--c-primary-200)', display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'flex-start', py: 0.5 }} data-testid="grn-batch">
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', alignSelf: 'center' }}>{label} is kept by batch.</Typography>
      <ToggleButtonGroup exclusive size="small" value={state.mode} onChange={(_, v) => v && onChange({ ...state, mode: v })} aria-label="Batch">
        <ToggleButton value="new">New batch</ToggleButton>
        <ToggleButton value="existing" disabled={!open.length}>Add to a batch</ToggleButton>
      </ToggleButtonGroup>
      {state.mode === 'existing' ? (
        <TextField select size="small" label="Batch" value={state.batchId} onChange={(e) => onChange({ ...state, batchId: e.target.value })} sx={{ minWidth: 220 }}>
          {open.map((b) => <MenuItem key={b.id} value={String(b.id)}>{b.code}{b.supplierRef ? ` · ${b.supplierRef}` : ''} · {qtyText(b.onHand)} on hand</MenuItem>)}
        </TextField>
      ) : (
        <>
          <TextField size="small" label="Supplier lot number" value={state.supplierRef} onChange={(e) => onChange({ ...state, supplierRef: e.target.value })} />
          {fields.map((s) => (
            <SpecValueInput key={s.spec.id} dataType={s.spec.dataType} unit={s.spec.unit} options={s.options}
              label={`${s.spec.name}${needed.has(s.spec.code) ? ' *' : ''}`} value={state.values[s.spec.id] ?? ''}
              onChange={(v) => onChange({ ...state, values: { ...state.values, [s.spec.id]: v } })} />
          ))}
        </>
      )}
    </Box>
  );
}

export function GrnDialog({ po, lineId, onClose, onReceived }: {
  po: PurchaseOrder | null; lineId: number | null; onClose: () => void; onReceived: (r: GrnResult) => void;
}) {
  const open = !!po;
  const full = useFullScreen('grn-dialog');
  const ctx = useLoad<GrnContext | null>(() => (po ? getGrnContext(po.id) : Promise.resolve(null)), [po?.id]);
  const company = useCompanySlug();
  const areas = useLoad(() => cfApi.get<StockingArea[]>('/stocking-areas'), []);
  const states = useLoad<StateRow[]>(() => getStates(), []);
  // Goods from a supplier go to a STORE: a dispatch, WIP or scrap area is not where a purchase lands, and
  // production only takes plates from storage / WIP (it once refused a plate received into the dispatch yard).
  const usable = useMemo(() => (areas.data ?? []).filter((a) => a.status === 'active' && a.purpose === 'storage'), [areas.data]);
  const pending = useMemo(() => (po?.lines ?? []).filter((l) => l.outstanding > 1e-6), [po]);

  const [rows, setRows] = useState<Record<number, RowState>>({});
  const [areaId, setAreaId] = useState('');
  const [reference, setReference] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [toFollow, setToFollow] = useState(false);
  const [freight, setFreight] = useState({ amount: '', taxable: false, gstRate: '18' });
  const [other, setOther] = useState({ amount: '', taxable: false, gstRate: '18' });
  const [pickCompany, setPickCompany] = useState('');
  const [pickSupplier, setPickSupplier] = useState('');
  const [missing, setMissing] = useState<Record<number, string | null>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const body = useRef<HTMLDivElement | null>(null);

  // A fresh GRN each time it opens: the clicked line ticked, prices from the PO, HSN / rate from the item.
  useEffect(() => {
    if (!po || !ctx.data) return;
    const next: Record<number, RowState> = {};
    for (const l of pending) {
      const c = ctx.data.lines.find((x) => x.lineId === l.id);
      next[l.id] = {
        included: l.id === lineId, quantity: String(l.outstanding), unitPrice: l.unitPrice == null ? (c?.unitPrice == null ? '' : String(c.unitPrice)) : String(l.unitPrice),
        mrp: '', discountMode: 'pct', discountValue: '', gstRate: c?.gstRate == null ? '' : String(c.gstRate), hsn: c?.hsnCode ?? '',
        batch: { mode: 'new', supplierRef: '', values: {}, batchId: '' },
      };
    }
    setRows(next); setReference(''); setInvoiceNo(''); setInvoiceDate(''); setToFollow(false);
    setFreight({ amount: '', taxable: false, gstRate: '18' }); setOther({ amount: '', taxable: false, gstRate: '18' });
    setPickCompany(''); setPickSupplier(''); setMissing({}); setError(null); setWarnings([]);
  }, [po?.id, ctx.data, lineId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setAreaId((a) => a || String(usable[0]?.id ?? '')); }, [usable]);

  const c = ctx.data;
  const companyState = c?.company.stateCode ?? (pickCompany || null);
  const supplierState = c?.supplier?.stateCode ?? (pickSupplier || null);
  const kind = c ? supplyKind({ companyState, supplierState, registration: c.supplier?.registration }) : null;
  const needsState = !c ? 'Loading the tax details…'
    : c.needsCompanyState && !pickCompany ? 'Pick the company\'s GST state so the tax can be split.'
      : c.needsSupplierState && !pickSupplier ? 'Pick the supplier\'s GST state so the tax can be split.' : null;
  const chosen = pending.filter((l) => rows[l.id]?.included);
  const money_ = useMemo(() => computeGrn({
    lines: chosen.map((l) => rows[l.id]), freight, other, kind, reverseCharge: !!c?.purchaseOrder.reverseCharge,
  }), [chosen.map((l) => l.id).join(','), rows, freight, other, kind, c?.purchaseOrder.reverseCharge]); // eslint-disable-line react-hooks/exhaustive-deps
  const blockers = grnBlockers({
    header: { invoiceNo, invoiceDate, invoicePending: toFollow, areaId },
    lines: pending.map((l) => ({ included: !!rows[l.id]?.included, label: l.item.code ?? l.item.name, outstanding: l.outstanding, in: rows[l.id] ?? { quantity: '', unitPrice: '', mrp: '', discountMode: 'pct', discountValue: '', gstRate: '' } })),
    kind, needsState, freight, other,
    batchMissing: chosen.map((l) => missing[l.id]).find(Boolean) ?? null,
  });

  const patch = (id: number, p: Partial<RowState>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...p } }));
  const rateChoices = (cur: string) => {
    const list = c?.gstRates ?? [];
    const n = num(cur);
    return n != null && !list.includes(n) ? [...list, n].sort((a, b) => a - b) : list;
  };

  const save = async () => {
    if (!po || busy || blockers.length) return;
    setBusy(true); setError(null);
    try {
      const payload: GrnBody = {
        stockingAreaId: areaId, reference: reference.trim() || null,
        invoice: toFollow ? { pending: true, no: invoiceNo.trim() || undefined, date: invoiceDate || undefined } : { no: invoiceNo.trim(), date: invoiceDate },
        charges: {
          freight: { amount: freight.amount || '0', taxable: freight.taxable, ...(freight.taxable ? { gstRate: freight.gstRate } : {}) },
          other: { amount: other.amount || '0', taxable: other.taxable, ...(other.taxable ? { gstRate: other.gstRate } : {}) },
        },
        ...(pickCompany && c?.needsCompanyState ? { companyStateCode: pickCompany } : {}),
        ...(pickSupplier && c?.needsSupplierState ? { supplierStateCode: pickSupplier } : {}),
        lines: chosen.map((l) => {
          const r = rows[l.id];
          const byBatch = l.item.trackedBy === 'batch';
          return {
            lineId: l.id, quantity: r.quantity, unitPrice: r.unitPrice, mrp: r.mrp || undefined,
            ...(r.discountValue.trim() ? { discountMode: r.discountMode, discountValue: r.discountValue } : {}),
            hsnCode: r.hsn || undefined, gstRate: r.gstRate === '' ? '0' : r.gstRate,
            ...(byBatch && r.batch.mode === 'existing' ? { batchId: Number(r.batch.batchId) } : {}),
            ...(byBatch && r.batch.mode === 'new' ? { batch: { supplierRef: r.batch.supplierRef || null, values: Object.entries(r.batch.values).filter(([, v]) => v !== '').map(([id, value]) => ({ specificationId: Number(id), value })) } } : {}),
          };
        }),
      };
      const res = await bookGrn(po.id, payload);
      setWarnings(res.warnings);
      onReceived(res);
    } catch (e) {
      setError(e instanceof CfApiError ? e : new CfApiError(0, e instanceof Error ? e.message : String(e)));
    } finally { setBusy(false); }
  };

  // Enter moves to the next field (a grid is typed across); Ctrl+Enter books.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' || e.defaultPrevented) return;
    const t = e.target as HTMLElement;
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); void save(); return; }
    if (t.tagName !== 'INPUT' || t.getAttribute('aria-expanded') === 'true' || (t as HTMLInputElement).type === 'checkbox') return;
    const all = [...(body.current?.querySelectorAll<HTMLElement>('input:not([type=hidden]):not([disabled]):not([type=checkbox]), [role=combobox]') ?? [])];
    const i = all.indexOf(t);
    if (i >= 0 && all[i + 1]) { e.preventDefault(); all[i + 1].focus(); }
  };

  const supplyText = !c ? null
    : kind === 'intra' ? `Supplier is in the company's state (${c.company.stateName ?? companyState}) — CGST + SGST.`
      : kind === 'inter' ? 'Supplier is in another state — IGST.'
        : kind === 'none' ? (c.supply?.note ?? 'The supplier charges no GST.') : null;
  const rateSelect = (value: string, onChange: (v: string) => void, label: string, testid?: string) => (
    <TextField select size="small" label={label} value={value} onChange={(e) => onChange(e.target.value)} sx={{ minWidth: 84 }} inputProps={{ 'data-testid': testid }}>
      {rateChoices(value).map((r) => <MenuItem key={r} value={String(r)}>{gstRateText(r)}</MenuItem>)}
    </TextField>
  );

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xl" fullScreen={full.on} onKeyDown={onKeyDown} PaperProps={{ 'data-testid': 'grn-dialog' } as object}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          Book a delivery — GRN
          <Box sx={{ fontSize: 13, fontWeight: 400, color: 'var(--c-text-2)', mt: 0.5 }}>
            {po?.code} · {c?.supplier?.name ?? po?.supplier?.name ?? 'no supplier'}. Ctrl+Enter books; Enter moves to the next field.
          </Box>
        </Box>
        <Box sx={{ flex: 1 }} />
        <Tooltip title={full.on ? 'Exit full screen' : 'Full screen'}>
          <IconButton size="small" onClick={full.toggle} aria-label={full.on ? 'Exit full screen' : 'Full screen'} data-testid="grn-full-screen">
            {full.on ? <FullscreenExitRounded fontSize="small" /> : <FullscreenRounded fontSize="small" />}
          </IconButton>
        </Tooltip>
        <IconButton size="small" onClick={onClose} disabled={busy} aria-label="Close without saving"><CloseRounded fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent ref={body}>
        <ErrorNotice error={ctx.error ?? areas.error ?? error} onRetry={ctx.error ? ctx.reload : undefined} />
        {!c && !ctx.error && <Box sx={{ p: 3, textAlign: 'center' }}><CircularProgress size={22} /></Box>}
        {c && (
          <Box sx={{ display: 'grid', gap: 2, pt: 0.5 }}>
            {/* 2026-10-18: an item with no GST rate is the gap to fix once, for its whole family — not on every GRN. */}
            {c.lines.some((x) => x.gstRate == null) && (
              <Alert severity="info" data-testid="grn-gst-gap">
                {c.lines.filter((x) => x.gstRate == null).length} item{c.lines.filter((x) => x.gstRate == null).length === 1 ? ' has' : 's have'} no GST rate in the catalog — pick it on the line below.{' '}
                <Box component={Link} to={appPath(company, 'company-tax#families')} sx={{ color: 'inherit' }}>Set HSN / GST for the whole family</Box> so the next PO and GRN have it.
              </Alert>
            )}
            {(c.needsCompanyState || c.needsSupplierState) && (
              <Alert severity="warning" data-testid="grn-state-warning" sx={{ alignItems: 'center' }}>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span>{c.needsCompanyState ? 'The company\'s GST state is not set (Setup › Company tax details).' : `${c.supplier?.name ?? 'The supplier'} has no GST state.`} Pick one so the tax can be split; it is used for this GRN only.</span>
                  {c.needsCompanyState && (
                    <TextField select size="small" label="Company GST state" value={pickCompany} onChange={(e) => setPickCompany(e.target.value)} sx={{ minWidth: 220 }} inputProps={{ 'data-testid': 'grn-company-state' }}>
                      {(states.data ?? []).map((s) => <MenuItem key={s.code} value={s.code}>{s.code} · {s.name}</MenuItem>)}
                    </TextField>
                  )}
                  {c.needsSupplierState && (
                    <TextField select size="small" label="Supplier GST state" value={pickSupplier} onChange={(e) => setPickSupplier(e.target.value)} sx={{ minWidth: 220 }} inputProps={{ 'data-testid': 'grn-supplier-state' }}>
                      {(states.data ?? []).map((s) => <MenuItem key={s.code} value={s.code}>{s.code} · {s.name}</MenuItem>)}
                    </TextField>
                  )}
                </Box>
              </Alert>
            )}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(5, minmax(0, 1fr))' }, gap: 1.5, alignItems: 'start' }}>
              <TextField select size="small" label="Into" value={areaId} onChange={(e) => setAreaId(e.target.value)} autoFocus helperText={usable.length ? ' ' : 'No storage area is set up.'}>
                {usable.map((a) => <MenuItem key={a.id} value={String(a.id)}>{a.code} · {a.name}</MenuItem>)}
              </TextField>
              <TextField size="small" label="Delivery note" value={reference} onChange={(e) => setReference(e.target.value)} helperText=" " />
              <TextField size="small" required={!toFollow} label="Supplier invoice no." value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} inputProps={{ maxLength: 40, 'data-testid': 'grn-invoice-no' }} helperText=" " />
              <TextField size="small" required={!toFollow} type="date" label="Invoice date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} InputLabelProps={{ shrink: true }} inputProps={{ 'data-testid': 'grn-invoice-date' }} helperText=" " />
              <FormControlLabel control={<Checkbox checked={toFollow} onChange={(e) => setToFollow(e.target.checked)} inputProps={{ 'aria-label': 'Invoice to follow' }} />}
                label={<Typography sx={{ fontSize: 13 }}>Invoice to follow</Typography>} />
            </Box>
            {toFollow && <Alert severity="info" sx={{ py: 0 }}>The GRN is booked now; Accounts will see it flagged until the invoice number and date are entered.</Alert>}
            {supplyText && <Typography data-testid="grn-supply" sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{supplyText}</Typography>}

            <Box sx={{ overflowX: 'auto' }}>
              <Box component="table" data-testid="grn-lines" sx={{ borderCollapse: 'collapse', width: '100%', minWidth: 1100, '& th': { fontSize: 11.5, fontWeight: 600, color: 'var(--c-text-2)', textAlign: 'left', px: 0.5, py: 0.5 }, '& td.n': { textAlign: 'right', ...mono, fontSize: 12.5, whiteSpace: 'nowrap' } }}>
                <thead>
                  <tr><th /><th>Item</th><th>Qty</th><th>Unit price ₹</th><th>MRP ₹</th><th>Discount</th><th>HSN / SAC</th><th>GST</th><th style={{ textAlign: 'right' }}>Taxable ₹</th>
                    <th style={{ textAlign: 'right' }}>{kind === 'inter' ? 'IGST ₹' : 'CGST + SGST ₹'}</th><th style={{ textAlign: 'right' }}>Landed / unit ₹</th></tr>
                </thead>
                <tbody>
                  {pending.map((l: PurchaseLine) => {
                    const r = rows[l.id];
                    if (!r) return null;
                    const idx = chosen.findIndex((x) => x.id === l.id);
                    const out = idx >= 0 ? money_.lines[idx] : null;
                    const off = !r.included;
                    return [
                      <Box component="tr" key={l.id} data-testid="grn-row" sx={{ opacity: off ? 0.55 : 1, borderTop: '1px solid var(--c-border)' }}>
                        <td style={{ ...cell }}><Checkbox size="small" checked={r.included} onChange={(e) => patch(l.id, { included: e.target.checked })} inputProps={{ 'aria-label': `Include ${l.item.code ?? l.item.name}` }} /></td>
                        <td style={{ ...cell, minWidth: 170 }}><Mono>{l.item.code ?? '—'}</Mono><Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', whiteSpace: 'normal' }}>{l.item.name} · {qtyText(l.outstanding)} {l.item.uom} to come</Typography></td>
                        <td style={cell}><TextField size="small" value={r.quantity} disabled={off} onChange={(e) => patch(l.id, { quantity: e.target.value })} sx={{ width: 92 }} inputProps={{ inputMode: 'decimal', style: mono, 'data-testid': 'grn-qty' }} /></td>
                        <td style={cell}><TextField size="small" value={r.unitPrice} disabled={off} error={!off && num(r.unitPrice) == null} onChange={(e) => patch(l.id, { unitPrice: e.target.value })} sx={{ width: 104 }} inputProps={{ inputMode: 'decimal', style: mono, 'data-testid': 'grn-price' }} /></td>
                        <td style={cell}><TextField size="small" value={r.mrp} disabled={off} onChange={(e) => patch(l.id, { mrp: e.target.value })} sx={{ width: 92 }} inputProps={{ inputMode: 'decimal', style: mono, 'data-testid': 'grn-mrp' }} /></td>
                        <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                          <TextField size="small" value={r.discountValue} disabled={off} onChange={(e) => patch(l.id, { discountValue: e.target.value })} sx={{ width: 78 }} inputProps={{ inputMode: 'decimal', style: mono, 'data-testid': 'grn-discount' }} />
                          <ToggleButtonGroup exclusive size="small" value={r.discountMode} disabled={off} onChange={(_, v: DiscountMode | null) => v && patch(l.id, { discountMode: v })} aria-label="Discount is" sx={{ ml: 0.5, verticalAlign: 'top', '& .MuiToggleButton-root': { py: 0.9, px: 1 } }}>
                            <ToggleButton value="pct" aria-label="Percent">%</ToggleButton>
                            <ToggleButton value="amt" aria-label="Rupees">₹</ToggleButton>
                          </ToggleButtonGroup>
                        </td>
                        <td style={cell}><TextField size="small" value={r.hsn} disabled={off} onChange={(e) => patch(l.id, { hsn: e.target.value })} sx={{ width: 100 }} inputProps={{ inputMode: 'numeric', style: mono, 'data-testid': 'grn-hsn' }} /></td>
                        <td style={cell}>{kind === 'none' ? <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', pt: 1 }}>none</Typography> : rateSelect(r.gstRate, (v) => patch(l.id, { gstRate: v }), 'Rate', 'grn-rate')}</td>
                        <td className="n" style={cell}>{out ? money(out.taxable) : '—'}</td>
                        <td className="n" style={cell}>{out ? (kind === 'inter' ? money(out.igst) : `${money(out.cgst)} + ${money(out.sgst)}`) : '—'}</td>
                        <td className="n" style={cell}>{out?.landedUnitCost != null ? out.landedUnitCost.toFixed(4) : '—'}</td>
                      </Box>,
                      r.included && l.item.trackedBy === 'batch' ? (
                        <tr key={`${l.id}-b`}><td /><td colSpan={10}>
                          <BatchEntry itemId={l.item.id} label={l.item.code ?? l.item.name} state={r.batch} onChange={(b) => patch(l.id, { batch: b })} onMissing={(m) => setMissing((x) => (x[l.id] === m ? x : { ...x, [l.id]: m }))} />
                        </td></tr>
                      ) : null,
                    ];
                  })}
                </tbody>
              </Box>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1.4fr) minmax(0, 1fr)' }, gap: 2, alignItems: 'start' }}>
              <Box sx={{ display: 'grid', gap: 1 }} data-testid="grn-charges">
                {([['Freight', freight, setFreight], ['Other charges', other, setOther]] as const).map(([name, v, set]) => (
                  <Box key={name} sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
                    <TextField size="small" label={`${name} ₹`} value={v.amount} onChange={(e) => set({ ...v, amount: e.target.value })} sx={{ width: 140 }} inputProps={{ inputMode: 'decimal', style: mono, 'data-testid': `grn-${name === 'Freight' ? 'freight' : 'other'}` }} />
                    <FormControlLabel control={<Checkbox size="small" checked={v.taxable} onChange={(e) => set({ ...v, taxable: e.target.checked })} inputProps={{ 'aria-label': `${name} is taxable` }} />} label={<Typography sx={{ fontSize: 13 }}>GST on it</Typography>} />
                    {v.taxable && kind !== 'none' && rateSelect(v.gstRate, (g) => set({ ...v, gstRate: g }), 'GST rate')}
                  </Box>
                ))}
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>Freight and other charges are shared over the lines by value and go into the stock cost; the GST on them is claimed back, not costed.</Typography>
              </Box>
              <Box data-testid="grn-totals" sx={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '2px 16px', justifyContent: 'end', fontSize: 13 }}>
                {([
                  ['Goods (after discount)', money_.totals.taxable],
                  ['Freight and other charges', money_.totals.charges],
                  ...(kind === 'inter' ? [['IGST', money_.totals.igst]] : kind === 'none' ? [] : [['CGST', money_.totals.cgst], ['SGST', money_.totals.sgst]]),
                ] as [string, number][]).map(([k, v]) => (<Box key={k} sx={{ display: 'contents' }}><span>{k}</span><Mono>{money(v)}</Mono></Box>))}
                <Box sx={{ display: 'contents', fontWeight: 700 }}><span>Bill total</span><span data-testid="grn-total"><Mono>{money(money_.totals.total)}</Mono></span></Box>
                <Box sx={{ display: 'contents', color: 'var(--c-text-2)' }}><span>Stock value (landed, no GST)</span><span data-testid="grn-landed"><Mono>{money(money_.totals.landed)}</Mono></span></Box>
              </Box>
            </Box>
            {warnings.map((w) => <Alert key={w} severity="warning" sx={{ py: 0 }}>{w}</Alert>)}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Typography data-testid="grn-blocker" sx={{ fontSize: 12.5, color: 'var(--c-warning-800)', flex: 1, pl: 1 }}>{blockers[0] ?? ''}{blockers.length > 1 ? ` (+${blockers.length - 1} more)` : ''}</Typography>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={() => void save()} disabled={busy || blockers.length > 0} data-testid="grn-receive"
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>{busy ? 'Booking…' : 'Receive'}</Button>
      </DialogActions>
    </Dialog>
  );
}
