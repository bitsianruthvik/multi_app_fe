import { useEffect, useState } from 'react';
import { Box, Button, TextField, Typography } from '@mui/material';
import { CfApiError } from '../api/client';
import { getScrapRate, saveScrapRate } from '../api/stockView';
import { useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { ErrorNotice, SectionCard } from './ui';
import { useToast } from './toastContext';

/** Setup › Cutting: the rate our scrap is valued at (GET / PUT /stock/scrap-rate). */
export function ScrapRateCard() {
  const toast = useToast();
  const canEdit = useIsPermitted()('cf_erp_inventory_manage');
  const rate = useLoad(() => getScrapRate(), []);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  useEffect(() => { if (rate.data) setDraft(rate.data.ratePerKg == null ? '' : String(rate.data.ratePerKg)); }, [rate.data]);
  const bad = draft.trim() !== '' && (Number.isNaN(Number(draft)) || Number(draft) < 0);
  const save = async () => {
    setBusy(true); setError(null);
    try {
      const out = await saveScrapRate(draft.trim() === '' ? null : Number(draft));
      rate.setData(out);
      toast.success(out.ratePerKg == null ? 'Scrap rate cleared.' : 'Scrap rate saved.');
    } catch (e) { setError(e instanceof CfApiError ? e : new CfApiError(0, String(e))); } finally { setBusy(false); }
  };
  return (
    <Box data-testid="scrap-rate-card" sx={{ maxWidth: 880, mt: 2 }}>
      <SectionCard title="Scrap rate (₹/kg)" subtitle="Our scrap is valued at this rate. Leave it empty if it is not decided — scrap is then valued at 0.">
        <Box sx={{ display: 'grid', gap: 1.5 }}>
          {rate.error ? <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>The scrap rate could not be read.</Typography> : (
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <TextField label="₹ per kg" size="small" value={draft} disabled={!canEdit || !rate.data} onChange={(e) => setDraft(e.target.value)}
                error={bad} helperText={bad ? 'Enter a number, 0 or more.' : ' '} sx={{ flex: '0 1 200px', minWidth: 0 }}
                inputProps={{ inputMode: 'decimal', 'data-testid': 'scrap-rate-input' }} />
              {canEdit && <Button variant="outlined" onClick={() => { void save(); }} disabled={busy || bad || !rate.data}>{busy ? 'Saving…' : 'Save scrap rate'}</Button>}
            </Box>
          )}
          {rate.data?.note && <Typography data-testid="scrap-rate-note" sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{rate.data.note}</Typography>}
          <ErrorNotice error={error} />
        </Box>
      </SectionCard>
    </Box>
  );
}
