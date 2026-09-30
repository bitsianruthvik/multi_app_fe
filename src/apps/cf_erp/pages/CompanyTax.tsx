import { useEffect, useState } from 'react';
import { Box, Button, Chip, CircularProgress, FormControlLabel, IconButton, MenuItem, Switch, TextField, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import { CfApiError } from '../api/client';
import { checkGstin, getStates, getTaxSettings, saveTaxSettings, type StateRow, type TaxSettings } from '../api/gst';
import { useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { gstRateText } from '../lib/gst';
import { ErrorNotice, PageHeader, SectionCard, SkeletonRows } from '../components/ui';
import { GstinField } from '../components/GstUi';
import { useToast } from '../components/toastContext';

const empty = (s: string | null | undefined) => s ?? '';

/** The rates the company offers on items, as chips: click the cross to drop one, type a number to add one. */
function RatesEditor({ rates, onChange, disabled }: { rates: number[]; onChange: (r: number[]) => void; disabled?: boolean }) {
  const [text, setText] = useState('');
  const n = Number(text);
  const bad = text.trim() !== '' && (!Number.isFinite(n) || n < 0 || n > 100);
  const add = () => {
    if (text.trim() === '' || bad) return;
    const v = Number(n.toFixed(2));
    if (!rates.includes(v)) onChange([...rates, v].sort((a, b) => a - b));
    setText('');
  };
  return (
    <Box>
      <Box data-testid="gst-rates" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1 }}>
        {rates.map((r) => (
          <Chip key={r} label={gstRateText(r)} size="small" onDelete={disabled ? undefined : () => onChange(rates.filter((x) => x !== r))}
            deleteIcon={<span aria-label={`Remove ${gstRateText(r)}`} style={{ fontSize: 14, lineHeight: 1 }}>×</span>} />
        ))}
        {rates.length === 0 && <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>No rates yet — items cannot be given a GST rate.</Typography>}
      </Box>
      {!disabled && (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          <TextField size="small" label="Add a rate (%)" value={text} error={bad} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} inputProps={{ inputMode: 'decimal', style: { fontFamily: 'var(--font-mono)' } }}
            helperText={bad ? 'A percentage between 0 and 100.' : 'Rates change — this list is yours to edit.'} sx={{ width: 200 }} />
          <IconButton aria-label="Add rate" onClick={add} disabled={!text.trim() || bad} sx={{ mt: 0.5 }}><AddRounded /></IconButton>
        </Box>
      )}
    </Box>
  );
}

function TaxForm({ settings, states, canEdit, onSaved }: { settings: TaxSettings; states: StateRow[]; canEdit: boolean; onSaved: (s: TaxSettings) => void }) {
  const toast = useToast();
  const [form, setForm] = useState<TaxSettings>(settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  useEffect(() => { setForm(settings); }, [settings]);
  const set = (patch: Partial<TaxSettings>) => setForm((f) => ({ ...f, ...patch }));
  const save = async () => {
    setBusy(true); setError(null);
    try {
      const { stateName: _name, ...body } = form; // eslint-disable-line @typescript-eslint/no-unused-vars
      onSaved(await saveTaxSettings(body));
      toast.success('Company tax details saved.');
    } catch (e) { setError(e as CfApiError); } finally { setBusy(false); }
  };
  const field = (label: string, key: keyof TaxSettings, extra: object = {}) => (
    <TextField label={label} value={empty(form[key] as string | null)} disabled={!canEdit} onChange={(e) => set({ [key]: e.target.value } as Partial<TaxSettings>)} {...extra} />
  );
  return (
    <>
      <ErrorNotice error={error} />
      <SectionCard title="Who is selling" subtitle="Printed on every tax invoice, and the state decides CGST + SGST or IGST." sx={{ maxWidth: 880 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
          {field('Legal name', 'legalName', { required: true })}
          {field('Trade name', 'tradeName', { helperText: 'If different from the legal name.' })}
          <GstinField value={empty(form.gstin)} disabled={!canEdit} check={checkGstin} label="GSTIN" helperText="15 characters. The state is filled from it."
            onChange={(v) => set({ gstin: v })} onResult={(r) => set({ stateCode: r.stateCode, stateName: r.stateName })} />
          <TextField select label="State" value={empty(form.stateCode)} disabled={!canEdit} onChange={(e) => set({ stateCode: e.target.value || null, stateName: states.find((s) => s.code === e.target.value)?.name ?? null })}
            helperText="Where goods leave from.">
            <MenuItem value="">Not set</MenuItem>
            {states.map((s) => <MenuItem key={s.code} value={s.code}>{s.code} · {s.name}</MenuItem>)}
          </TextField>
          {field('Address', 'address1', { sx: { gridColumn: '1 / -1' } })}
          {field('Address, line 2', 'address2', { sx: { gridColumn: '1 / -1' } })}
          {field('City', 'city')}
          {field('Pincode', 'pincode', { inputProps: { inputMode: 'numeric', maxLength: 6, style: { fontFamily: 'var(--font-mono)' } } })}
        </Box>
      </SectionCard>
      <SectionCard title="Invoices" sx={{ maxWidth: 880 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
          {field('Invoice prefix', 'invoicePrefix', { helperText: 'Numbers read PREFIX/26-27/0001 — at most 16 characters in all.', inputProps: { maxLength: 6, style: { fontFamily: 'var(--font-mono)' } } })}
          {field('LUT number', 'lutNumber', { helperText: 'Only for exports and SEZ supplies. Empty = no LUT.' })}
          <FormControlLabel sx={{ gridColumn: '1 / -1' }} disabled={!canEdit}
            control={<Switch size="small" checked={!!form.einvoiceRequired} onChange={(e) => set({ einvoiceRequired: e.target.checked })} inputProps={{ 'aria-label': 'E-invoice required' }} />}
            label={<Typography sx={{ fontSize: 13.5 }}>E-invoice required — our turnover is above the government threshold</Typography>} />
        </Box>
      </SectionCard>
      <SectionCard title="GST rates" subtitle="The rates an item can be given. Nothing is built into the software — rates move, and this list moves with them." sx={{ maxWidth: 880 }}>
        <RatesEditor rates={form.gstRates ?? []} disabled={!canEdit} onChange={(gstRates) => set({ gstRates })} />
      </SectionCard>
      {canEdit
        ? <Box sx={{ display: 'flex', justifyContent: 'flex-end', maxWidth: 880 }}>
          <Button variant="contained" onClick={save} disabled={busy} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>{busy ? 'Saving…' : 'Save tax details'}</Button>
        </Box>
        : <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>You can read these details but not change them.</Typography>}
    </>
  );
}

/** Setup › Company tax details: the seller's identity on every invoice, and the GST rates on offer. */
export default function CompanyTax() {
  const canEdit = useIsPermitted()('cf_erp_orders_manage');
  const settings = useLoad(() => getTaxSettings(), []);
  const states = useLoad(() => getStates(), []);
  return (
    <Box>
      <PageHeader title="Company tax details" subtitle="Who is selling, for the tax invoice — and the GST rates your items can carry." />
      <ErrorNotice error={settings.error} onRetry={settings.reload} />
      {!settings.data && !settings.error && <SkeletonRows rows={5} height={56} />}
      {settings.data && <TaxForm settings={settings.data} states={states.data ?? []} canEdit={canEdit} onSaved={settings.setData} />}
    </Box>
  );
}
