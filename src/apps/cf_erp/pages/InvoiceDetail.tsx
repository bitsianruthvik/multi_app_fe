import { useEffect, useState } from 'react';
import { Box, Button, CircularProgress, IconButton, Menu, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import { Link, useNavigate, useParams } from 'react-router-dom';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import PrintRounded from '@mui/icons-material/PrintRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import BlockRounded from '@mui/icons-material/BlockRounded';
import FileDownloadRounded from '@mui/icons-material/FileDownloadRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import PeopleRounded from '@mui/icons-material/PeopleRounded';
import {
  cancelInvoice, checkGstin, deleteInvoice, getInvoice, issueInvoice, listAddresses, removeEwayBill, removeInvoiceLine, saveInvoice,
  type Invoice, type InvoiceLine, type PartyAddress, type Transport,
} from '../api/gst';
import type { CfApiError } from '../api/client';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { appPath } from '../navMeta';
import { qtyText } from '../lib/inventory';
import { billedText, dayText, priceText } from '../lib/money';
import { issueConfirmText, ewayHint, gstRateText, invoiceNoText, money2, NO_GST_RATE, TRANSPORT_MODES } from '../lib/gst';
import { fileStem, downloadEinvoice, downloadEwayBill, openInvoicePrint } from '../lib/invoiceFiles';
import { Badge, DetailSkeleton, ErrorNotice, Fact, Mono, SectionCard } from '../components/ui';
import { CrossLink, DetailHeader, DetailLayout } from '../components/DetailLayout';
import { DataTable, type DataColumn } from '../components/DataTable';
import { GstinField } from '../components/GstUi';
import { InvoiceProblems, InvoiceStatusBadge, InvoiceTotals, IssueConfirmBody } from '../components/InvoiceParts';
import { EwayDialog, IrnDialog } from '../components/InvoiceDialogs';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PromptDialog } from '../components/PromptDialog';
import { useDetailTitle } from '../components/shell/detailTitle';
import { useToast } from '../components/toastContext';

const COPIES: { value: 'original' | 'duplicate' | 'triplicate'; label: string }[] = [
  { value: 'original', label: 'Original for Recipient' }, { value: 'duplicate', label: 'Duplicate for Transporter' }, { value: 'triplicate', label: 'Triplicate for Supplier' },
];

const partyLines = (p: Invoice['buyer']) => (p
  ? [p.name, p.address, [p.city, p.pincode].filter(Boolean).join(' '), p.stateName ? `${p.stateName}${p.stateCode ? ` (${p.stateCode})` : ''}` : p.stateCode, p.gstin ? `GSTIN ${p.gstin}` : null].filter(Boolean) as string[]
  : []);

/** A block of address lines: the buyer, or where it is delivered. */
function AddressBlock({ title, party, empty }: { title: string; party: Invoice['buyer']; empty: string }) {
  const lines = partyLines(party);
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 0.25 }}>{title}</Typography>
      {lines.length === 0
        ? <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-3)' }}>{empty}</Typography>
        : lines.map((l, i) => <Typography key={i} sx={{ fontSize: 13.5, fontWeight: i === 0 ? 500 : 400, color: i === 0 ? 'var(--c-text)' : 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{l}</Typography>)}
    </Box>
  );
}

const blankTransport: Transport = { mode: 'road', vehicleNo: null, transporter: null, transporterGstin: null, distanceKm: null, lrNo: null, lrDate: null };

/** The draft's own fields: where it goes, when, and how it travels. An issued invoice shows them and cannot change them. */
function DraftDetails({ invoice, canEdit, onSaved }: { invoice: Invoice; canEdit: boolean; onSaved: (i: Invoice) => void }) {
  const toast = useToast();
  const addresses = useLoad(() => listAddresses(invoice.customer.id), [invoice.customer.id]);
  const start = () => ({
    invoiceDate: dayText(invoice.invoiceDate), shipToAddressId: invoice.shipTo?.addressId ? String(invoice.shipTo.addressId) : '', notes: invoice.notes ?? '',
    t: { ...blankTransport, ...(invoice.transport ?? {}) } as Transport,
  });
  const [form, setForm] = useState(start);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  useEffect(() => { setForm(start()); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice.id, invoice.notes, invoice.invoiceDate, invoice.shipTo?.addressId, JSON.stringify(invoice.transport)]);
  const setT = (patch: Partial<Transport>) => setForm((f) => ({ ...f, t: { ...f.t, ...patch } }));
  const text = (v: string | null) => v ?? '';
  const save = async () => {
    setBusy(true); setError(null);
    try {
      const t = form.t;
      onSaved(await saveInvoice(invoice.id, {
        invoiceDate: form.invoiceDate || null,
        shipToAddressId: form.shipToAddressId ? Number(form.shipToAddressId) : null,
        notes: form.notes || null,
        transport: { ...t, vehicleNo: t.vehicleNo || null, transporter: t.transporter || null, transporterGstin: t.transporterGstin || null, lrNo: t.lrNo || null, lrDate: t.lrDate || null,
          distanceKm: t.distanceKm == null || String(t.distanceKm) === '' ? null : Number(t.distanceKm) },
      }));
      toast.success('Invoice details saved.');
    } catch (e) { setError(e as CfApiError); } finally { setBusy(false); }
  };
  const ro = !canEdit;
  const grid = { display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(3, minmax(0, 1fr))' }, gap: 2 };
  return (
    <SectionCard title="Delivery and transport" subtitle={ro ? 'Frozen with the invoice.' : 'The ship-to decides CGST + SGST or IGST. The transport details go into the e-way bill file.'}>
      <ErrorNotice error={error} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2, mb: 2 }}>
        <AddressBlock title="Billed to" party={invoice.buyer} empty="Customer not set" />
        {ro
          ? <AddressBlock title="Shipped to" party={invoice.shipTo ?? invoice.buyer} empty="Same as billed to" />
          : (
            <TextField select size="small" label="Ship to" value={form.shipToAddressId} onChange={(e) => setForm({ ...form, shipToAddressId: e.target.value })}
              helperText={addresses.error ? 'Could not load their addresses.' : 'Add more on the customer\'s record.'}>
              <MenuItem value="">The customer's own address</MenuItem>
              {(addresses.data ?? []).map((a: PartyAddress) => (
                <MenuItem key={a.id} value={String(a.id)}>{[a.label, a.city, a.stateCode].filter(Boolean).join(' · ') || a.address}</MenuItem>
              ))}
            </TextField>
          )}
      </Box>
      <Box sx={grid}>
        <TextField size="small" label="Invoice date" type="date" disabled={ro} value={form.invoiceDate} onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })} InputLabelProps={{ shrink: true }} helperText="Empty = the day it is issued" />
        <TextField select size="small" label="Transport mode" disabled={ro} value={form.t.mode ?? ''} onChange={(e) => setT({ mode: (e.target.value || null) as Transport['mode'] })}>
          {TRANSPORT_MODES.map((m) => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
        </TextField>
        <TextField size="small" label="Vehicle no." disabled={ro} value={text(form.t.vehicleNo)} onChange={(e) => setT({ vehicleNo: e.target.value.toUpperCase() })} inputProps={{ style: { fontFamily: 'var(--font-mono)' } }} />
        <TextField size="small" label="Transporter" disabled={ro} value={text(form.t.transporter)} onChange={(e) => setT({ transporter: e.target.value })} />
        <GstinField label="Transporter GSTIN" disabled={ro} value={text(form.t.transporterGstin)} check={checkGstin} helperText="Optional — the e-way bill can use it instead of a vehicle."
          onChange={(v) => setT({ transporterGstin: v })} />
        <TextField size="small" label="Distance (km)" disabled={ro} value={form.t.distanceKm == null ? '' : String(form.t.distanceKm)} onChange={(e) => setT({ distanceKm: e.target.value === '' ? null : (e.target.value as unknown as number) })}
          inputProps={{ inputMode: 'numeric', style: { fontFamily: 'var(--font-mono)' } }} helperText="Approximate road distance, for the e-way bill" />
        <TextField size="small" label="LR / RR / airway bill no." disabled={ro} value={text(form.t.lrNo)} onChange={(e) => setT({ lrNo: e.target.value })} inputProps={{ style: { fontFamily: 'var(--font-mono)' } }} />
        <TextField size="small" label="LR date" type="date" disabled={ro} value={text(form.t.lrDate)} onChange={(e) => setT({ lrDate: e.target.value })} InputLabelProps={{ shrink: true }} />
        <TextField size="small" label="Notes" disabled={ro} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} multiline sx={{ gridColumn: { md: '1 / -1' } }} />
      </Box>
      {!ro && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
          <Button variant="contained" onClick={save} disabled={busy} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>{busy ? 'Saving…' : 'Save details'}</Button>
        </Box>
      )}
    </SectionCard>
  );
}

/** One tax invoice: its lines and tax, where it goes, and — once issued — the steps to the government portals. */
export default function InvoiceDetail() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_orders_manage');
  const inv = useLoad(() => getInvoice(id), [id]);
  const [printAnchor, setPrintAnchor] = useState<HTMLElement | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [irn, setIrn] = useState(false);
  const [eway, setEway] = useState(false);
  const [removingLine, setRemovingLine] = useState<InvoiceLine | null>(null);
  const [busyFile, setBusyFile] = useState<string | null>(null);
  const i = inv.data && inv.data.id === id ? inv.data : null;
  useDetailTitle(i ? invoiceNoText(i) : null);
  if (inv.error) return <ErrorNotice error={inv.error} onRetry={inv.reload} />;
  if (!i) return <DetailSkeleton />;

  const draft = i.status === 'draft';
  const issued = i.status === 'issued';
  const done = (next: Invoice, message?: string) => { inv.setData(next); if (message) toast.success(message); };
  const go = (to: string) => navigate(to.startsWith('/') ? to : appPath(company, to));
  const file = async (key: string, run: () => Promise<void>) => {
    setBusyFile(key);
    try { await run(); } catch (e) { const err = e as CfApiError; toast.error([err.message, ...(err.problems ?? [])].join(' — ')); } finally { setBusyFile(null); }
  };
  const print = (copy: 'original' | 'duplicate' | 'triplicate') => { setPrintAnchor(null); void file('print', () => openInvoicePrint(i.id, copy)); };
  const irnText = typeof i.irn === 'string' ? i.irn : null;
  const hasIrn = !!i.irn;
  const hint = ewayHint(i.totals.grandTotal);

  const columns: DataColumn<InvoiceLine>[] = [
    { key: 'no', header: '#', alwaysVisible: true, render: (l) => <Mono muted>{l.lineNo}</Mono> },
    {
      key: 'desc', header: 'Description', alwaysVisible: true, sortValue: (l) => l.description,
      render: (l) => (
        <Box sx={{ py: 0.5 }}>
          <Typography sx={{ fontSize: 13.5, whiteSpace: 'normal' }}>{l.description}</Typography>
          {l.movementCode && <Mono muted sx={{ fontSize: 11.5 }}>{l.movementCode}</Mono>}
        </Box>
      ),
    },
    { key: 'hsn', header: 'HSN / SAC', render: (l) => (l.hsnCode ? <Mono>{l.hsnCode}</Mono> : <Box component="span" sx={{ color: 'var(--c-warning-800)', fontSize: 12 }}>no HSN</Box>), sortValue: (l) => l.hsnCode },
    { key: 'qty', header: 'Qty', numeric: true, alwaysVisible: true, render: (l) => <>{qtyText(l.quantity)}{l.uom && <Mono muted> {l.uom}</Mono>}</> },
    { key: 'billed', header: 'Billed', numeric: true, render: (l) => (l.billedQty != null && l.billedUom && l.billedUom !== l.uom ? <Mono muted>{billedText(l.billedQty, l.billedUom)}</Mono> : <Mono muted>—</Mono>) },
    { key: 'rate', header: 'Rate', numeric: true, sortValue: (l) => l.rate, render: (l) => (l.rate == null ? <Box component="span" sx={{ color: 'var(--c-warning-800)', fontSize: 12 }}>no rate</Box> : <Mono>{priceText(l.rate)}</Mono>) },
    { key: 'taxable', header: 'Taxable', numeric: true, alwaysVisible: true, sortValue: (l) => l.taxable, exportValue: (l) => l.taxable ?? '', render: (l) => <Mono>{money2(l.taxable)}</Mono> },
    { key: 'gst', header: 'GST %', numeric: true, sortValue: (l) => l.gstRate, exportValue: (l) => l.gstRate ?? '', render: (l) => (l.gstRate == null ? <Box component="span" sx={{ color: 'var(--c-warning-800)', fontSize: 12 }}>{NO_GST_RATE}</Box> : <Mono>{gstRateText(l.gstRate)}</Mono>) },
    ...(i.isIgst
      ? [{ key: 'igst', header: 'IGST', numeric: true, exportValue: (l: InvoiceLine) => l.igst ?? '', render: (l: InvoiceLine) => <Mono>{money2(l.igst)}</Mono> }]
      : [
        { key: 'cgst', header: 'CGST', numeric: true, exportValue: (l: InvoiceLine) => l.cgst ?? '', render: (l: InvoiceLine) => <Mono>{money2(l.cgst)}</Mono> },
        { key: 'sgst', header: 'SGST', numeric: true, exportValue: (l: InvoiceLine) => l.sgst ?? '', render: (l: InvoiceLine) => <Mono>{money2(l.sgst)}</Mono> },
      ]),
    { key: 'total', header: 'Total', numeric: true, alwaysVisible: true, sortValue: (l) => l.total, exportValue: (l) => l.total ?? '', render: (l) => <Mono>{money2(l.total)}</Mono> },
  ];
  if (draft && canManage) {
    columns.push({
      key: 'actions', header: '', alwaysVisible: true,
      render: (l) => (
        <Tooltip title="Take this shipment off the invoice — it can go on another">
          <IconButton size="small" aria-label={`Remove line ${l.lineNo}`} onClick={() => setRemovingLine(l)}><DeleteOutlineRounded fontSize="small" /></IconButton>
        </Tooltip>
      ),
    });
  }

  const headerActions = (
    <>
      {draft && canManage && <Button variant="contained" startIcon={<CheckCircleRounded />} onClick={() => setIssuing(true)}
        disabled={i.problems.length > 0 || i.lines.length === 0}>Issue</Button>}
      <Button variant="outlined" startIcon={busyFile === 'print' ? <CircularProgress size={14} /> : <PrintRounded />} onClick={(e) => setPrintAnchor(e.currentTarget)}>Print</Button>
      <Menu anchorEl={printAnchor} open={!!printAnchor} onClose={() => setPrintAnchor(null)}>
        {COPIES.map((c) => <MenuItem key={c.value} onClick={() => print(c.value)}>{c.label}</MenuItem>)}
      </Menu>
      {draft && canManage && <Tooltip title="Delete this draft — its shipments go back to un-invoiced"><IconButton aria-label="Delete draft" onClick={() => setDeleting(true)}><DeleteOutlineRounded /></IconButton></Tooltip>}
      {issued && canManage && <Button color="error" startIcon={<BlockRounded />} onClick={() => setCancelling(true)}>Cancel</Button>}
    </>
  );

  return (
    <DetailLayout
      crossLinks={<>
        <CrossLink icon={<ReceiptLongRounded />} label={`Order ${i.order.code}`} to={appPath(company, `orders/${i.order.id}`)} />
        <CrossLink icon={<PeopleRounded />} label={i.customer.name ?? 'Customer'} to={appPath(company, 'customers')} />
      </>}
      header={
        <DetailHeader code={invoiceNoText(i)} title={i.customer.name ?? 'No customer'}
          subtitle={draft ? 'A draft has no number yet — issuing gives it one and freezes it.' : i.status === 'cancelled' ? `Cancelled${i.cancelledReason ? `: ${i.cancelledReason}` : ''}` : undefined}
          badges={<><InvoiceStatusBadge status={i.status} />{hasIrn && <Badge family="success" noIcon label="IRN" />}{i.ewayBills.length > 0 && <Badge family="info" noIcon label={`${i.ewayBills.length} e-way`} />}</>}
          actions={headerActions}
          facts={<>
            <Fact label="Order"><Mono><Link to={appPath(company, `orders/${i.order.id}`)} style={{ color: 'inherit' }}>{i.order.code}</Link></Mono></Fact>
            <Fact label="Date"><Mono muted={!i.invoiceDate}>{dayText(i.invoiceDate) || 'when issued'}</Mono></Fact>
            <Fact label="Place of supply">{i.placeOfSupply ? `${i.placeOfSupply.name} (${i.placeOfSupply.code})` : <Typography component="span" sx={{ color: 'var(--c-text-3)' }}>not known yet</Typography>}</Fact>
            <Fact label="Tax"><Mono>{i.isIgst ? 'IGST' : 'CGST + SGST'}</Mono></Fact>
            <Fact label="Total"><Mono sx={{ fontWeight: 600 }}>{money2(i.totals.grandTotal)}</Mono></Fact>
            {i.fy && <Fact label="Financial year"><Mono muted>{i.fy}</Mono></Fact>}
          </>} />
      }
    >
      {draft && <InvoiceProblems problems={i.problems} onGo={go} />}
      <SectionCard flush title="Lines" subtitle="One line for each shipment on this invoice, at the order line's rate.">
        <DataTable bare rows={i.lines} columns={columns} getRowId={(l) => l.id} storageKey="invoice-lines" exportName={`${fileStem(i.invoiceNo, i.id)}-lines`}
          empty={<Box sx={{ p: 3, color: 'var(--c-text-2)', fontSize: 13.5 }}>{draft ? 'No lines left. Delete this draft, or ship again to make a new one.' : 'No lines.'}</Box>} />
        {i.lines.length > 0 && <InvoiceTotals totals={i.totals} isIgst={i.isIgst} />}
      </SectionCard>
      <DraftDetails invoice={i} canEdit={draft && canManage} onSaved={(n) => done(n)} />
      {issued && (
        <SectionCard title="Government portals" subtitle="Download the file, upload it by hand on the portal, then bring back what the portal gives you.">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 3 }}>
            <Box data-testid="einvoice-box">
              <Typography sx={{ fontSize: 13.5, fontWeight: 600, mb: 0.5 }}>E-invoice</Typography>
              {hasIrn
                ? <Box sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 1, overflowWrap: 'anywhere' }}>
                  IRN <Mono>{irnText ?? 'entered'}</Mono>{i.ackNo && <> · Ack <Mono>{i.ackNo}</Mono></>}{i.ackDate && <> · <Mono muted>{i.ackDate}</Mono></>}
                </Box>
                : <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 1 }}>No IRN yet. Upload the file on the e-invoice portal, then enter what it returns.</Typography>}
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button size="small" variant="outlined" startIcon={busyFile === 'einv' ? <CircularProgress size={14} /> : <FileDownloadRounded />} onClick={() => void file('einv', () => downloadEinvoice(i.id, i.invoiceNo))}>Download e-invoice file</Button>
                {canManage && <Button size="small" variant={hasIrn ? 'text' : 'contained'} onClick={() => setIrn(true)}>{hasIrn ? 'Change IRN' : 'Enter IRN'}</Button>}
              </Box>
            </Box>
            <Box data-testid="eway-box">
              <Typography sx={{ fontSize: 13.5, fontWeight: 600, mb: 0.5 }}>E-way bill</Typography>
              {hint && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 0.75 }}>{hint}</Typography>}
              {i.ewayBills.length === 0
                ? <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 1 }}>None yet. Fill in the transport details above, download the file, upload it, then add the number.</Typography>
                : <Box sx={{ mb: 1 }}>
                  {i.ewayBills.map((b) => (
                    <Box key={b.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 13, py: 0.25 }}>
                      <Mono>{b.ewayNo}</Mono>
                      {b.vehicleNo && <Mono muted>{b.vehicleNo}</Mono>}
                      {b.validUntil && <Mono muted>until {b.validUntil}</Mono>}
                      {canManage && <IconButton size="small" aria-label={`Remove e-way bill ${b.ewayNo}`} onClick={() => void file('ewbdel', async () => { done(await removeEwayBill(i.id, b.id), 'Removed.'); })}><DeleteOutlineRounded fontSize="small" /></IconButton>}
                    </Box>
                  ))}
                </Box>}
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button size="small" variant="outlined" startIcon={busyFile === 'ewb' ? <CircularProgress size={14} /> : <FileDownloadRounded />} onClick={() => void file('ewb', () => downloadEwayBill(i.id, i.invoiceNo))}>Download e-way bill file</Button>
                {canManage && <Button size="small" startIcon={<AddRounded />} onClick={() => setEway(true)}>Add e-way bill no.</Button>}
              </Box>
            </Box>
          </Box>
        </SectionCard>
      )}

      <ConfirmDialog open={issuing} title={issueConfirmText(i).title} confirmLabel="Issue it" body={<IssueConfirmBody invoice={i} />}
        onClose={() => setIssuing(false)}
        onConfirm={async () => { const n = await issueInvoice(i.id); done(n, `Issued as ${n.invoiceNo ?? 'an invoice'}.`); }} />
      <PromptDialog open={cancelling} danger title={`Cancel ${invoiceNoText(i)}?`} label="Why" confirmLabel="Cancel the invoice"
        body="Its shipments become un-invoiced, so they can go on a new invoice. If it was uploaded to the e-invoice portal, cancel it there too — within 24 hours."
        onClose={() => setCancelling(false)}
        onConfirm={async (reason) => { done(await cancelInvoice(i.id, reason), 'Invoice cancelled.'); }} />
      <ConfirmDialog open={deleting} danger confirmLabel="Delete draft" title="Delete this draft?" entityName={`${i.order.code} · ${i.customer.name ?? ''}`}
        body="Its shipments go back to un-invoiced. Nothing has been numbered, so nothing is lost."
        onClose={() => setDeleting(false)}
        onConfirm={async () => { await deleteInvoice(i.id); toast.success('Draft deleted.'); navigate(appPath(company, 'invoices')); }} />
      <ConfirmDialog open={!!removingLine} danger confirmLabel="Take it off" title="Take this line off the invoice?" entityName={removingLine ? `${removingLine.lineNo} · ${removingLine.description}` : undefined}
        body="The shipment stays shipped — it becomes un-invoiced and can go on another invoice."
        onClose={() => setRemovingLine(null)}
        onConfirm={async () => { if (removingLine) done(await removeInvoiceLine(i.id, removingLine.id), 'Line taken off.'); }} />
      <IrnDialog invoice={i} open={irn} onClose={() => setIrn(false)} onSaved={(n) => done(n, 'IRN saved.')} />
      <EwayDialog invoice={i} open={eway} onClose={() => setEway(false)} onSaved={(n) => done(n, 'E-way bill added.')} />
    </DetailLayout>
  );
}
