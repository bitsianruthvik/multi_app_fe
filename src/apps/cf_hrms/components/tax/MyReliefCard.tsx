/**
 * My tax › Forms — one Form 10E / Form No. 39 worksheet of mine (CF_HRMS_HIRING_SPEC.md §25.5): the relief
 * for arrears of earlier years paid to me this year, the PDF to fill the form on the e-filing portal, and —
 * for an earlier year this app has no tax rules for — the figures I type from that year's return.
 */
import { useState } from 'react';
import { Box, Button, CircularProgress, MenuItem, Stack, TextField, Typography } from '@mui/material';
import PictureAsPdfOutlined from '@mui/icons-material/PictureAsPdfOutlined';
import { ToneBadge, errorMessage, useToast } from '@shared/ui';
import { myReliefApi, type EarlierInput, type MyRelief } from '../../api/payrollExtras';
import { saveBase64File } from '../../api/excel';
import { rupees } from '../payroll/payWords';

export function MyReliefCard({ relief, onChanged }: { relief: MyRelief; onChanged: () => void }) {
  const toast = useToast();
  const typed = relief.earlier.filter((e) => !e.rules);
  const [open, setOpen] = useState(relief.status === 'INCOMPLETE');
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState<Record<string, EarlierInput>>(Object.fromEntries(typed.map((e) => [e.year, { regime: e.regime ?? 'OLD', totalIncome: e.totalIncome ?? '', taxWithout: e.taxWithout ?? '', taxWith: e.taxWith ?? '' }])));
  const upd = (y: string, k: keyof EarlierInput, v: string) => setValues((x) => ({ ...x, [y]: { ...x[y], [k]: k === 'regime' ? v : v.replace(/[₹,\s]/g, '') } }));
  const save = async () => {
    setBusy(true);
    try {
      const r = await myReliefApi.save(relief.year, values);
      toast.success(r.worksheet.status === 'READY' ? `Worked out: relief ${rupees(r.worksheet.relief)}.` : 'Saved. Some figures are still missing.');
      onChanged();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Box sx={{ p: 1.5, border: '1px solid var(--c-divider)', borderRadius: 1.5 }}>
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
        <Box sx={{ flex: '1 1 220px', minWidth: 0 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{relief.form} — {relief.year}</Typography>
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>Relief for arrears of {relief.earlier.map((e) => `${e.year} (${rupees(e.arrears)})`).join(', ')}</Typography>
        </Box>
        <ToneBadge tone={relief.status === 'READY' ? 'success' : 'warning'} label={relief.status === 'READY' ? `Relief ${rupees(relief.relief)}` : 'Figures needed'} noIcon />
        <Button variant="outlined" size="small" startIcon={<PictureAsPdfOutlined fontSize="small" />} onClick={async () => { try { saveBase64File(await myReliefApi.file(relief.year)); } catch (e) { toast.error(errorMessage(e)); } }}>Download</Button>
        {typed.length > 0 && <Button size="small" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Earlier years'}</Button>}
      </Box>
      {relief.sentence && <Typography sx={{ fontSize: 13, mt: 1 }}>{relief.sentence}</Typography>}
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.5 }}>File the form yourself on incometax.gov.in › e-File › Income Tax Forms before your return; the PDF is a worksheet of the figures.</Typography>
      {open && typed.length > 0 && (
        <Stack spacing={1.25} sx={{ mt: 1.5 }}>
          {typed.map((e) => (
            <Box key={e.year}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.75 }}>{e.year}: from your return or Form 16 of that year</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(4, 1fr)' }, gap: 1 }}>
                <TextField select size="small" label="Regime" value={String(values[e.year]?.regime ?? 'OLD')} onChange={(ev) => upd(e.year, 'regime', ev.target.value)}>
                  <MenuItem value="OLD">Old</MenuItem><MenuItem value="NEW">New</MenuItem>
                </TextField>
                <TextField size="small" label="Total income" value={String(values[e.year]?.totalIncome ?? '')} onChange={(ev) => upd(e.year, 'totalIncome', ev.target.value)} inputProps={{ inputMode: 'decimal' }} />
                <TextField size="small" label="Tax on it" value={String(values[e.year]?.taxWithout ?? '')} onChange={(ev) => upd(e.year, 'taxWithout', ev.target.value)} inputProps={{ inputMode: 'decimal' }} />
                <TextField size="small" label={`Tax with ${rupees(e.arrears)} added`} value={String(values[e.year]?.taxWith ?? '')} onChange={(ev) => upd(e.year, 'taxWith', ev.target.value)} inputProps={{ inputMode: 'decimal' }} />
              </Box>
            </Box>
          ))}
          <Button variant="contained" size="small" disabled={busy} onClick={() => void save()} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined} sx={{ alignSelf: 'flex-start' }}>Save and work it out</Button>
        </Stack>
      )}
    </Box>
  );
}
