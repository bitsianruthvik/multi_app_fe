import { useState } from 'react';
import { Box, Button, Checkbox, FormControlLabel, MenuItem, TextField, Typography } from '@mui/material';
import { CfApiError } from '../../api/client';
import { getTaxFamilies, setTaxFamily, type TaxFamily } from '../../api/gst';
import { useLoad } from '../../hooks/useLoad';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { gstRateText } from '../../lib/gst';
import { ErrorNotice, Mono, SectionCard, SkeletonRows } from '../ui';
import { useToast } from '../toastContext';
import { FlashOnChange, SuccessCheck, nudge } from '../../motion';

/**
 * Setup › Company tax details › HSN & GST BY FAMILY (2026-10-18). A PO showed "GST ₹0 — no GST rate" because no catalog
 * item had one. Here a whole family is set at once (all MS plates 7208 / 18 % …): its items and templates, only the
 * gaps unless "overwrite". The suggested defaults are only filled in — nothing is saved until "Set" is pressed.
 */
export function TaxByFamilyCard() {
  const toast = useToast();
  // Catalog managers, or Accounts (they own tax; 2026-10-24, backend gst.js the same).
  const canEdit = useIsPermitted()('cf_erp_catalog_manage|cf_erp_accounts_manage');
  const data = useLoad(() => getTaxFamilies(), []);
  const [draft, setDraft] = useState<Record<number, { hsn: string; rate: string; overwrite: boolean }>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [setOk, setSetOk] = useState<{ nodeId: number; n: number } | null>(null); // motion: a check beside the family just set
  const d = data.data;
  const rowOf = (f: TaxFamily) => draft[f.nodeId] ?? { hsn: f.suggestion?.hsnCode ?? (f.hsnCodes.length === 1 ? f.hsnCodes[0] : ''), rate: f.suggestion?.rateOnList ? String(f.suggestion.gstRate) : (f.rates.length === 1 ? String(f.rates[0]) : ''), overwrite: false };
  const edit = (f: TaxFamily, patch: Partial<{ hsn: string; rate: string; overwrite: boolean }>) => setDraft((x) => ({ ...x, [f.nodeId]: { ...rowOf(f), ...patch } }));
  const apply = async (f: TaxFamily, btn?: HTMLElement) => {
    const r = rowOf(f);
    setBusy(f.nodeId);
    try {
      const res = await setTaxFamily(f.nodeId, { hsnCode: r.hsn.trim() || null, gstRate: r.rate === '' ? null : Number(r.rate), overwrite: r.overwrite });
      toast.success(`${res.path}: ${res.items} item${res.items === 1 ? '' : 's'}${res.definitions ? ` and ${res.definitions} template${res.definitions === 1 ? '' : 's'}` : ''} set.`);
      setDraft((x) => { const n = { ...x }; delete n[f.nodeId]; return n; });
      setSetOk((o) => ({ nodeId: f.nodeId, n: (o?.n ?? 0) + 1 }));
      data.reload();
    } catch (e) {
      nudge(btn);
      toast.error(e instanceof CfApiError ? e.message : 'Could not set the family.');
    } finally { setBusy(null); }
  };
  return (
    <SectionCard title="HSN and GST by catalog family" subtitle="Items with no GST rate show GST ₹0 on purchase orders and stop invoices. Set a whole family at once — the suggestions are only filled in; check them and press Set." sx={{ maxWidth: 1100 }}>
      <Box id="families" data-testid="tax-families" sx={{ display: 'grid', gap: 1 }}>
        <ErrorNotice error={data.error} onRetry={data.reload} />
        {!d && !data.error && <SkeletonRows rows={4} height={40} />}
        {d && (
          <Typography data-testid="tax-family-gaps" sx={{ fontSize: 13, color: d.gaps.noRate ? 'var(--c-warning-800)' : 'var(--c-text-2)' }}>
            {d.gaps.items} catalog items · <FlashOnChange value={d.gaps.noHsn}>{d.gaps.noHsn}</FlashOnChange> without an HSN code · <FlashOnChange value={d.gaps.noRate}>{d.gaps.noRate}</FlashOnChange> without a GST rate.
          </Typography>
        )}
        {d && d.families.length === 0 && <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>No catalog items yet.</Typography>}
        {d && d.families.map((f) => {
          const r = rowOf(f);
          return (
            <Box key={f.nodeId} data-testid="tax-family-row" sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1.4fr) 110px 120px auto auto' }, gap: 1, alignItems: 'center', py: 0.75, borderBottom: '1px solid var(--c-divider)' }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 13.5, fontWeight: 500, overflowWrap: 'anywhere' }}>{f.path}</Typography>
                <Typography sx={{ fontSize: 12, color: f.noRate || f.noHsn ? 'var(--c-warning-800)' : 'var(--c-text-3)' }}>
                  {f.items} item{f.items === 1 ? '' : 's'}{f.noHsn ? ` · ${f.noHsn} no HSN` : ''}{f.noRate ? ` · ${f.noRate} no GST rate` : ''}
                  {f.hsnCodes.length ? ` · now ${f.hsnCodes.join(', ')}` : ''}{f.rates.length ? ` / ${f.rates.map((x) => gstRateText(x)).join(', ')}` : ''}
                  {f.suggestion ? ` · suggested ${f.suggestion.why}, ${f.suggestion.gstRate} %${f.suggestion.rateOnList ? '' : ' (not on your rate list)'}` : ''}
                </Typography>
              </Box>
              <TextField size="small" label="HSN" value={r.hsn} disabled={!canEdit} onChange={(e) => edit(f, { hsn: e.target.value })} inputProps={{ 'data-testid': 'tax-family-hsn', inputMode: 'numeric' }} />
              <TextField select size="small" label="GST rate" value={r.rate} disabled={!canEdit} onChange={(e) => edit(f, { rate: e.target.value })} inputProps={{ 'data-testid': 'tax-family-rate' }}>
                <MenuItem value="">—</MenuItem>
                {(d.gstRates ?? []).map((x) => <MenuItem key={x} value={String(x)}>{gstRateText(x)}</MenuItem>)}
              </TextField>
              <FormControlLabel control={<Checkbox size="small" checked={r.overwrite} disabled={!canEdit} onChange={(e) => edit(f, { overwrite: e.target.checked })} />} label={<Typography sx={{ fontSize: 12.5 }}>Overwrite</Typography>} />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Button size="small" variant="outlined" disabled={!canEdit || busy === f.nodeId || (!r.hsn.trim() && r.rate === '')} onClick={(e) => void apply(f, e.currentTarget)} data-testid="tax-family-set">Set</Button>
                {setOk?.nodeId === f.nodeId && <SuccessCheck key={setOk.n} size={18} label="Set" />}
              </Box>
            </Box>
          );
        })}
        {d && !canEdit && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>Setting a family needs the catalog manage or accounts manage permission.</Typography>}
        {d && <Mono muted>Only the gaps are filled unless Overwrite is ticked. Templates in the family are set too (made parts read their template&rsquo;s).</Mono>}
      </Box>
    </SectionCard>
  );
}
