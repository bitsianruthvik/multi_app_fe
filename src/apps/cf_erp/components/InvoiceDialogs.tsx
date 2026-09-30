import { useEffect, useState } from 'react';
import { TextField } from '@mui/material';
import { addEwayBill, saveIrn, type Invoice } from '../api/gst';
import { FormDialog } from './FormDialog';

/** "2026-09-30T10:15" from a datetime-local box → "2026-09-30 10:15:00", the way the portals write it. */
const portalTime = (v: string) => (v ? `${v.replace('T', ' ')}${v.length === 16 ? ':00' : ''}` : '');
/** And back, for editing what was entered before. */
const boxTime = (v: string | null | undefined) => (v ? v.replace(' ', 'T').slice(0, 16) : '');

const mono = { inputMode: 'text' as const, style: { fontFamily: 'var(--font-mono)' } };

/** What the e-invoice portal sent back: the IRN, the acknowledgement, and the signed QR text. Entered by hand until a direct connection exists. */
export function IrnDialog({ invoice, open, onClose, onSaved }: { invoice: Invoice; open: boolean; onClose: () => void; onSaved: (i: Invoice) => void }) {
  const [form, setForm] = useState({ irn: '', ackNo: '', ackDate: '', signedQr: '' });
  useEffect(() => {
    if (open) setForm({ irn: typeof invoice.irn === 'string' ? invoice.irn : '', ackNo: invoice.ackNo ?? '', ackDate: boxTime(invoice.ackDate), signedQr: invoice.signedQr ?? '' });
  }, [open, invoice]);
  const save = async () => onSaved(await saveIrn(invoice.id, { irn: form.irn.trim(), ackNo: form.ackNo.trim(), ackDate: portalTime(form.ackDate), signedQr: form.signedQr.trim() }));
  return (
    <FormDialog open={open} title="Enter the IRN" onClose={onClose} onSubmit={save} submitLabel="Save IRN" submitDisabled={!form.irn.trim() || !form.ackNo.trim() || !form.ackDate}
      subtitle="Copy these from the e-invoice portal after uploading the file. They are printed on the invoice with its QR code.">
      <TextField label="IRN" required autoFocus value={form.irn} onChange={(e) => setForm({ ...form, irn: e.target.value })} inputProps={mono} helperText="64 characters" />
      <TextField label="Acknowledgement no." required value={form.ackNo} onChange={(e) => setForm({ ...form, ackNo: e.target.value })} inputProps={mono} />
      <TextField label="Acknowledgement date and time" required type="datetime-local" value={form.ackDate} onChange={(e) => setForm({ ...form, ackDate: e.target.value })} InputLabelProps={{ shrink: true }} />
      <TextField label="Signed QR code text" multiline minRows={3} value={form.signedQr} onChange={(e) => setForm({ ...form, signedQr: e.target.value })} inputProps={mono}
        helperText="The long signed text behind the QR — paste it whole. Empty = no QR printed." />
    </FormDialog>
  );
}

/** An e-way bill number from the portal. A big structure can need several, one per vehicle. */
export function EwayDialog({ invoice, open, onClose, onSaved }: { invoice: Invoice; open: boolean; onClose: () => void; onSaved: (i: Invoice) => void }) {
  const [form, setForm] = useState({ ewayNo: '', vehicleNo: '', validUntil: '' });
  useEffect(() => { if (open) setForm({ ewayNo: '', vehicleNo: invoice.transport?.vehicleNo ?? '', validUntil: '' }); }, [open, invoice]);
  const save = async () => onSaved(await addEwayBill(invoice.id, { ewayNo: form.ewayNo.trim(), vehicleNo: form.vehicleNo.trim() || null, validUntil: portalTime(form.validUntil) || null }));
  return (
    <FormDialog open={open} title="Add an e-way bill number" onClose={onClose} onSubmit={save} submitLabel="Add" maxWidth="xs" submitDisabled={!form.ewayNo.trim()}
      subtitle="One per vehicle — add another for each truck.">
      <TextField label="E-way bill no." required autoFocus value={form.ewayNo} onChange={(e) => setForm({ ...form, ewayNo: e.target.value.replace(/\s+/g, '') })} inputProps={{ ...mono, inputMode: 'numeric' }} helperText="12 digits" />
      <TextField label="Vehicle no." value={form.vehicleNo} onChange={(e) => setForm({ ...form, vehicleNo: e.target.value.toUpperCase() })} inputProps={mono} />
      <TextField label="Valid until" type="datetime-local" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} InputLabelProps={{ shrink: true }} />
    </FormDialog>
  );
}
