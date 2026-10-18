import { useEffect, useState } from 'react';
import { Alert, Box, Button, IconButton, MenuItem, Popover, TextField, Tooltip, Typography } from '@mui/material';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import MoreHorizRounded from '@mui/icons-material/MoreHorizRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import ShoppingCartRounded from '@mui/icons-material/ShoppingCartRounded';
import { CfApiError } from '../api/client';
import type { Party } from '../api/types';
import {
  addVendor, getPurchaseRequest, pendingPosOfVendor, raisePurchaseOrder, removeVendor, setQuotes, setVendor,
  type PrLine, type PrVendor, type PurchaseRequest,
} from '../api/purchaseRequests';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { appPath } from '../navMeta';
import { qtyText } from '../lib/inventory';
import { cheapestOf, latestDelivery, poDraftOf, poQtyProblem, quoteWords } from '../lib/purchaseRequest';
import { DetailSkeleton, ErrorNotice, Fact, Mono, SectionCard } from '../components/ui';
import { DetailHeader, DetailLayout } from '../components/DetailLayout';
import { FormDialog } from '../components/FormDialog';
import { PartyPicker } from '../components/ServerPicker';
import { useDetailTitle } from '../components/shell/detailTitle';
import { useToast } from '../components/toastContext';
import { FullScreenFrame, FullScreenToggle } from '../components/FullScreen';
import { useFullScreen } from '../hooks/useFullScreen';
import { PoStageBadge, PrStatusBadge } from '../components/Purchase/purchaseFlowUi';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };
/** A new PR shows this many vendor columns, empty, ready for a vendor to be picked. */
const MIN_COLUMNS = 3;
const cellSx = { borderBottom: '1px solid var(--c-border)', padding: '8px 10px', verticalAlign: 'top', textAlign: 'left' as const };
const headSx = { ...cellSx, background: 'var(--c-surface-2, var(--c-surface))', fontSize: 12.5, fontWeight: 600, color: 'var(--c-text-2)' };

/**
 * Purchase › Purchase request (§71). THE PR IS THE RFQ: rows = what is to buy, columns = vendors (three empty ones to
 * start, "+ vendor" for more; pick the vendor in the column's head). A cell is that vendor's quote for that line: the
 * rate per the line's unit, and in the small popover the delivery days and a remark. "Raise PO" on a column makes one
 * purchase order to that vendor — it waits for Management approval. "PO raised" per line is what live purchase orders hold for
 * it; a PO closed short gives the rest back, and a new PO can be raised for it. The grid scrolls sideways inside its
 * own box when there are many vendors; the page itself does not.
 */
export default function PurchaseRequestDetail() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const company = useCompanySlug();
  const toast = useToast();
  const navigate = useNavigate();
  const canManage = useIsPermitted()('cf_erp_inventory_manage');
  const pr = useLoad(() => getPurchaseRequest(id), [id]);
  const full = useFullScreen('pr-grid');
  const p = pr.data;
  useDetailTitle(p?.code ?? null);
  const [extra, setExtra] = useState(0);
  const [error, setError] = useState<CfApiError | null>(null);
  const [raising, setRaising] = useState<PrVendor | null>(null);
  if (pr.error) return <ErrorNotice error={pr.error} onRetry={pr.reload} />;
  if (!p) return <DetailSkeleton />;
  const editable = canManage && p.canEdit;
  const run = async (fn: () => Promise<PurchaseRequest>, done?: string) => {
    setError(null);
    try { pr.setData(await fn()); if (done) toast.success(done); } catch (e) { setError(e as CfApiError); }
  };
  const lines = p.lines.filter((l) => l.needed > 0 || l.poRaised > 0);
  const empties = Math.max(0, MIN_COLUMNS - p.vendors.length) + extra;

  return (
    <FullScreenFrame on={full.on} onExit={() => full.set(false)}>
    <DetailLayout
      header={
        <DetailHeader
          code={p.code}
          title={`${p.order.code} · line ${p.line.lineNo}`}
          badges={<PrStatusBadge status={p.status} />}
          actions={<FullScreenToggle on={full.on} onToggle={full.toggle} />}
          facts={<>
            <Fact label="Material request"><Mono chip><Box component={Link} to={appPath(company, `material-requests/${p.requisition.id}`)} sx={linkSx}>{p.requisition.code}</Box></Mono></Fact>
            <Fact label="Sales order"><Mono chip><Box component={Link} to={appPath(company, `orders/${p.order.id}`)} sx={linkSx}>{p.order.code}</Box></Mono></Fact>
            {p.order.customer && <Fact label="Customer">{p.order.customer.name}</Fact>}
            <Fact label="Lines to order"><Mono>{p.counts.open} of {p.counts.lines}</Mono></Fact>
          </>}
        />
      }
    >
      {!canManage && <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)', mb: 1.5 }}>You can see this PR. Quotes and purchase orders need the inventory manage permission.</Typography>}
      {error && (
        <Alert severity="warning" data-testid="pr-refusal" sx={{ mb: 1.5 }} onClose={() => setError(null)}>
          <Box>{error.message}</Box>
          {error.problems.filter((x) => x !== error.message).map((x) => <Box key={x} sx={{ fontSize: 12.5 }}>{x}</Box>)}
        </Alert>
      )}
      <SectionCard title="Quotes" subtitle="One column per vendor. Type the rate per unit; the ⋯ holds the delivery days and a remark. The lowest rate of a line is green."
        actions={editable && <Button size="small" startIcon={<AddRounded />} onClick={() => setExtra((n) => n + 1)} data-testid="pr-add-vendor">Vendor</Button>}>
        <Box data-testid="pr-grid-scroll" sx={{ overflowX: 'auto', maxWidth: '100%', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)' }}>
          <Box component="table" data-testid="pr-grid" sx={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                <Box component="th" sx={{ ...headSx, position: 'sticky', left: 0, zIndex: 1, minWidth: 180 }}>Line</Box>
                <Box component="th" sx={{ ...headSx, textAlign: 'right', minWidth: 80 }}>Needed</Box>
                <Box component="th" sx={{ ...headSx, textAlign: 'right', minWidth: 80 }}>PO raised</Box>
                {p.vendors.map((v) => (
                  <VendorHead key={v.id} pr={p} vendor={v} editable={editable}
                    onChange={(s) => void run(() => setVendor(v.id, s.id), `${s.name} is in this column.`)}
                    onRemove={() => void run(() => removeVendor(v.id), 'Column removed.')}
                    onRaise={() => setRaising(v)} />
                ))}
                {Array.from({ length: editable ? empties : 0 }, (_, i) => (
                  <Box component="th" key={`empty-${i}`} data-testid="pr-empty-column" sx={{ ...headSx, minWidth: 200 }}>
                    <PartyPicker role="supplier" value={null} label="Pick a vendor" size="small"
                      onChange={(s: Party | null) => { if (s) { setExtra((n) => Math.max(0, n - 1)); void run(() => addVendor(p.id, s.id), `${s.name} added.`); } }} />
                  </Box>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} data-testid="pr-row" data-line={l.id}>
                  <Box component="td" sx={{ ...cellSx, position: 'sticky', left: 0, background: 'var(--c-surface)', zIndex: 1 }}>
                    <Mono>{l.item.code ?? '—'}</Mono>
                    <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', whiteSpace: 'normal' }}>{l.item.name}</Typography>
                    <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>{l.statusLabel}</Typography>
                  </Box>
                  <Box component="td" sx={{ ...cellSx, textAlign: 'right' }}><Mono>{qtyText(l.needed)}</Mono> <Mono muted>{l.item.uom}</Mono></Box>
                  <Box component="td" data-testid="pr-po-raised" sx={{ ...cellSx, textAlign: 'right' }}>
                    <Mono muted={!l.poRaised}>{qtyText(l.poRaised)}</Mono>
                    {l.received > 0 && <Box sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>{qtyText(l.received)} in</Box>}
                  </Box>
                  {p.vendors.map((v) => (
                    <QuoteCell key={v.id} line={l} vendor={v} cheapest={cheapestOf(p, l.id)} editable={editable}
                      onSave={(q) => run(() => setQuotes(v.id, [{ lineId: l.id, ...q }]))} />
                  ))}
                  {Array.from({ length: editable ? empties : 0 }, (_, i) => <Box component="td" key={`e-${i}`} sx={cellSx} />)}
                </tr>
              ))}
            </tbody>
          </Box>
        </Box>
        {!lines.length && <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)', mt: 1 }}>Nothing is left to buy on this PR.</Typography>}
      </SectionCard>
      {p.purchaseOrders.length > 0 && (
        <SectionCard title="Purchase orders raised" subtitle="Each waits for Management approval, then for the goods.">
          <Box data-testid="pr-pos" sx={{ display: 'grid', gap: 0.75 }}>
            {p.purchaseOrders.map((po) => (
              <Box key={po.id} sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                <Mono chip><Box component={Link} to={appPath(company, `purchase-orders/${po.id}`)} sx={linkSx}>{po.code}</Box></Mono>
                <PoStageBadge stage={po.stage} label={po.stageLabel} />
                {po.supplier && <Typography component="span" sx={{ fontSize: 13 }}>{po.supplier.name}</Typography>}
              </Box>
            ))}
          </Box>
        </SectionCard>
      )}
      <RaisePoDialog pr={p} vendor={raising} onClose={() => setRaising(null)}
        onRaised={(next, poId, code) => { pr.setData(next); invalidateNavCounts(); toast.success(`${code} raised — it waits for Management approval.`); void poId; }}
        onOpenPo={(poId) => navigate(appPath(company, `purchase-orders/${poId}`))} />
    </DetailLayout>
    </FullScreenFrame>
  );
}

/** A vendor column's head: who, the POs raised from it, and its actions. */
function VendorHead({ pr, vendor, editable, onChange, onRemove, onRaise }: {
  pr: PurchaseRequest; vendor: PrVendor; editable: boolean; onChange: (s: Party) => void; onRemove: () => void; onRaise: () => void;
}) {
  const [changing, setChanging] = useState(false);
  const quoted = pr.lines.filter((l) => vendor.quotes[l.id] && l.open > 0).length;
  return (
    <Box component="th" data-testid="pr-vendor" data-vendor={vendor.supplier.id} sx={{ ...headSx, minWidth: 200 }}>
      {changing
        ? <PartyPicker role="supplier" value={null} label="Another vendor" size="small" autoFocus onChange={(s) => { setChanging(false); if (s) onChange(s); }} />
        : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{vendor.supplier.name}</Typography>
            {editable && !vendor.purchaseOrders.length && (
              <>
                <Tooltip title="Another vendor in this column"><IconButton size="small" aria-label={`Change ${vendor.supplier.name}`} onClick={() => setChanging(true)}><MoreHorizRounded sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                <Tooltip title="Remove this column"><IconButton size="small" aria-label={`Remove ${vendor.supplier.name}`} onClick={onRemove}><DeleteOutlineRounded sx={{ fontSize: 16 }} /></IconButton></Tooltip>
              </>
            )}
          </Box>
        )}
      {vendor.purchaseOrders.length > 0 && (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
          {vendor.purchaseOrders.map((po) => <Mono key={po.id} chip>{po.code}</Mono>)}
        </Box>
      )}
      {editable && (
        <Button size="small" variant="outlined" startIcon={<ShoppingCartRounded />} disabled={!quoted} onClick={onRaise} sx={{ mt: 0.75 }} data-testid="pr-raise-po">
          Raise PO
        </Button>
      )}
    </Box>
  );
}

/** One cell: the rate inline; delivery days and a remark in a small popover. Empty = no quote. */
function QuoteCell({ line, vendor, cheapest, editable, onSave }: {
  line: PrLine; vendor: PrVendor; cheapest: number | null; editable: boolean;
  onSave: (q: { rate: number | null; deliveryDays?: number | null; remark?: string | null }) => Promise<void>;
}) {
  const q = vendor.quotes[line.id];
  const [rate, setRate] = useState(q ? String(q.rate) : '');
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [days, setDays] = useState(q?.deliveryDays != null ? String(q.deliveryDays) : '');
  const [remark, setRemark] = useState(q?.remark ?? '');
  useEffect(() => { setRate(q ? String(q.rate) : ''); setDays(q?.deliveryDays != null ? String(q.deliveryDays) : ''); setRemark(q?.remark ?? ''); }, [q]);
  const best = q && cheapest != null && q.rate <= cheapest;
  const saveRate = () => {
    const was = q ? String(q.rate) : '';
    if (rate.trim() === was) return;
    void onSave(rate.trim() === '' ? { rate: null } : { rate: Number(rate), deliveryDays: q?.deliveryDays ?? null, remark: q?.remark ?? null });
  };
  if (!editable) {
    return (
      <Box component="td" data-testid="pr-cell" sx={{ ...cellSx, color: best ? 'var(--c-success-700)' : undefined }}>
        {q ? <><Mono>{quoteWords(q, line.item.uom)}</Mono>{q.remark && <Box sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>{q.remark}</Box>}</> : <Mono muted>—</Mono>}
      </Box>
    );
  }
  return (
    <Box component="td" data-testid="pr-cell" data-vendor={vendor.supplier.id} sx={{ ...cellSx, background: best ? 'var(--c-success-50)' : undefined }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
        <TextField size="small" value={rate} placeholder="₹ rate" onChange={(e) => setRate(e.target.value)} onBlur={saveRate}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          inputProps={{ inputMode: 'decimal', 'aria-label': `Rate of ${vendor.supplier.name} for ${line.item.code ?? line.item.name}`, 'data-testid': 'pr-rate' }}
          InputProps={{ endAdornment: <Typography component="span" sx={{ fontSize: 11.5, color: 'var(--c-text-3)', whiteSpace: 'nowrap' }}>/{line.item.uom}</Typography> }}
          sx={{ width: 140 }} />
        <Tooltip title="Delivery days and a remark">
          <span>
            <IconButton size="small" disabled={!q} aria-label="Delivery days and remark" onClick={(e) => setAnchor(e.currentTarget)}><MoreHorizRounded sx={{ fontSize: 16 }} /></IconButton>
          </span>
        </Tooltip>
      </Box>
      {q && (q.deliveryDays != null || q.remark) && (
        <Box sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mt: 0.25 }}>{[q.deliveryDays != null ? `${q.deliveryDays} days` : null, q.remark].filter(Boolean).join(' · ')}</Box>
      )}
      <Popover open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        <Box sx={{ p: 1.5, display: 'grid', gap: 1, width: 240 }}>
          <TextField size="small" label="Delivery days" value={days} onChange={(e) => setDays(e.target.value)} inputProps={{ inputMode: 'numeric', 'data-testid': 'pr-days' }} />
          <TextField size="small" label="Remark" value={remark} onChange={(e) => setRemark(e.target.value)} inputProps={{ 'data-testid': 'pr-remark' }} />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
            <Button size="small" onClick={() => setAnchor(null)}>Cancel</Button>
            <Button size="small" variant="contained" data-testid="pr-cell-save"
              onClick={() => { setAnchor(null); void onSave({ rate: q ? q.rate : Number(rate), deliveryDays: days.trim() === '' ? null : Number(days), remark: remark.trim() || null }); }}>Save</Button>
          </Box>
        </Box>
      </Popover>
    </Box>
  );
}

/** "Raise PO" for one vendor: their quoted lines, quantity filled in (needed − PO raised), editable, 0 = skip. */
function RaisePoDialog({ pr, vendor, onClose, onRaised, onOpenPo }: {
  pr: PurchaseRequest; vendor: PrVendor | null; onClose: () => void;
  onRaised: (next: PurchaseRequest, poId: number, code: string) => void; onOpenPo: (poId: number) => void;
}) {
  const [rows, setRows] = useState<{ lineId: number; quantity: string; max: number }[]>([]);
  const [addTo, setAddTo] = useState('');
  const [expected, setExpected] = useState('');
  const pending = useLoad(() => (vendor ? pendingPosOfVendor(vendor.id) : Promise.resolve(null)), [vendor?.id]);
  useEffect(() => {
    if (!vendor) return;
    setRows(poDraftOf(pr, vendor).map((d) => ({ lineId: d.line.id, quantity: d.quantity, max: d.max })));
    setAddTo('');
    setExpected(latestDelivery(pr.today, poDraftOf(pr, vendor).map((d) => d.quote.deliveryDays)) ?? '');
    // A new vendor opens a fresh draft; a re-read of the PR while it is open does not wipe what is typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendor?.id]);
  if (!vendor) return null;
  const draft = poDraftOf(pr, vendor);
  const problems = rows.map((r) => { const l = pr.lines.find((x) => x.id === r.lineId); return l ? poQtyProblem(r.quantity, r.max, l.item.uom) : null; });
  const any = rows.some((r) => Number(r.quantity) > 0);
  return (
    <FormDialog open={!!vendor} title={`Raise PO — ${vendor.supplier.name}`} onClose={onClose} maxWidth="md" submitLabel="Raise PO"
      subtitle="The quoted lines of this vendor, at their rates. The quantity is what is still to order; change it, or 0 to leave a line out. The PO waits for Management approval."
      submitDisabled={!any || problems.some(Boolean)}
      onSubmit={async () => {
        const r = await raisePurchaseOrder(vendor.id, { lines: rows.map((x) => ({ lineId: x.lineId, quantity: Number(x.quantity) || 0 })), addToPoId: addTo ? Number(addTo) : null, expectedDate: !addTo && expected ? expected : null });
        onRaised(r.purchaseRequest, r.purchaseOrder.id, r.purchaseOrder.code);
        if (addTo) onOpenPo(r.purchaseOrder.id);
      }}>
      <Box sx={{ display: 'grid', gap: 1 }}>
        {draft.map((d, i) => (
          <Box key={d.line.id} data-testid="raise-row" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 2fr) minmax(0, 1fr) 140px' }, gap: 1, alignItems: 'center' }}>
            <Box sx={{ minWidth: 0 }}>
              <Mono>{d.line.item.code ?? d.line.item.name}</Mono>
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', overflowWrap: 'anywhere' }}>{d.line.item.name}</Typography>
            </Box>
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
              {quoteWords(d.quote, d.line.item.uom)} · {qtyText(d.max)} {d.line.item.uom} to order
            </Typography>
            <TextField size="small" label="Quantity" value={rows[i]?.quantity ?? ''} error={!!problems[i]} helperText={problems[i] ?? undefined}
              onChange={(e) => setRows((rs) => rs.map((x, k) => (k === i ? { ...x, quantity: e.target.value } : x)))}
              inputProps={{ inputMode: 'decimal', 'data-testid': 'raise-qty' }}
              InputProps={{ endAdornment: <Typography component="span" sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>{d.line.item.uom}</Typography> }} />
          </Box>
        ))}
        {!addTo && (
          <TextField size="small" type="date" label="Expected delivery" value={expected} onChange={(e) => setExpected(e.target.value)} sx={{ mt: 1, maxWidth: 220 }}
            InputLabelProps={{ shrink: true }} inputProps={{ 'data-testid': 'raise-expected' }}
            helperText="For the whole PO; each line keeps its quote's date." />
        )}
        {(pending.data?.purchaseOrders.length ?? 0) > 0 && (
          <TextField select size="small" label="Put it on" value={addTo} onChange={(e) => setAddTo(e.target.value)} sx={{ mt: 1 }}
            helperText="A PO of this vendor still waiting for Management approval can take these lines too — one PO for several orders."
            SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}>
            <MenuItem value="">A new purchase order</MenuItem>
            {pending.data!.purchaseOrders.map((po) => <MenuItem key={po.id} value={String(po.id)}>{po.code} (waiting for Management approval)</MenuItem>)}
          </TextField>
        )}
      </Box>
    </FormDialog>
  );
}
