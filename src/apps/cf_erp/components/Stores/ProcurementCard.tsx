import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, MenuItem, TextField, Typography } from '@mui/material';
import { CfApiError } from '../../api/client';
import { getProcurement, PROCUREMENT_LABEL, PROCUREMENT_METHODS, setProcurement, type ProcurementMethod } from '../../api/stores';
import { searchParties } from '../../api/pickers';
import type { Party } from '../../api/types';
import { useLoad } from '../../hooks/useLoad';
import { procurementBody, procurementFields, procurementForm, procurementProblems, type ProcurementForm } from '../../lib/stores';
import { ServerMultiPicker } from '../ServerMultiPicker';
import { Badge, ErrorNotice, SectionCard, SkeletonBlock } from '../ui';
import { useToast } from '../toastContext';

/**
 * PROCUREMENT (§79, user 2026-10-18) — a compact card on every catalog item and definition: how it is procured (make, buy on
 * requirement, buy to min / max, buy periodically, customer supplies, subcontract), lead time, order multiple / minimum order
 * and preferred vendors. A temporary item shows its definition's and may override it; "Follow the definition" (or "Use the
 * default") clears its own. Min / max and periodic items feed Stores › To reorder.
 */
export function ProcurementCard({ masterId, canEdit }: { masterId: number; canEdit: boolean }) {
  const toast = useToast();
  const load = useLoad(() => getProcurement(masterId), [masterId]);
  const p = load.data;
  const [form, setForm] = useState<ProcurementForm>(procurementForm(null));
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<CfApiError | null>(null);
  useEffect(() => { if (p) setForm(procurementForm(p.own ?? p.effective)); }, [p]);
  const problems = useMemo(() => procurementProblems(form), [form]);
  if (load.error) return <ErrorNotice error={load.error} onRetry={load.reload} />;
  if (!p) return <SkeletonBlock h={120} r={8} />;
  const shown = procurementFields(form.method || null);
  const set = (patch: Partial<ProcurementForm>) => setForm((f) => ({ ...f, ...patch }));
  const save = async (clear = false) => {
    setBusy(true); setRefusal(null);
    try {
      const next = await setProcurement(masterId, clear ? { method: null } : procurementBody(form));
      load.setData(next);
      toast.success(clear ? (p.inherited ? 'Cleared — it follows its definition again.' : 'Cleared — the default applies again.') : 'Procurement saved.');
    } catch (e) { setRefusal(e instanceof CfApiError ? e : new CfApiError(0, e instanceof Error ? e.message : String(e))); } finally { setBusy(false); }
  };
  const field = (key: keyof ProcurementForm, label: string, unit?: string, testId?: string) => (
    <TextField size="small" label={label} value={form[key] as string} disabled={!canEdit} onChange={(e) => set({ [key]: e.target.value } as Partial<ProcurementForm>)}
      onKeyDown={(e) => { if (e.key === 'Enter' && canEdit && !problems.length) void save(); }}
      inputProps={{ inputMode: 'decimal', 'data-testid': testId ?? `proc-${String(key)}` }} sx={{ width: 160 }}
      InputProps={unit ? { endAdornment: <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)', ml: 0.5 }}>{unit}</Typography> } : undefined} />
  );
  const clearLabel = p.inherited ? 'Follow the definition' : 'Use the default';

  return (
    <SectionCard title="Procurement" subtitle="How it is procured — Stores and the reorder list (by AI) read it." sx={{ maxWidth: 880, mt: 2 }}
      actions={<Badge family={p.source === 'own' ? 'info' : 'neutral'} noIcon label={p.sourceWords} />}>
      <Box data-testid="procurement-card" sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {refusal && (
          <Alert severity="warning" onClose={() => setRefusal(null)}>
            <Box>{refusal.message}</Box>
            {refusal.problems.filter((x) => x !== refusal.message).map((x) => <Box key={x} sx={{ fontSize: 12.5 }}>{x}</Box>)}
          </Alert>
        )}
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField select size="small" label="Method" value={form.method} disabled={!canEdit} sx={{ minWidth: 240 }}
            onChange={(e) => set({ method: e.target.value as ProcurementMethod })} inputProps={{ 'data-testid': 'proc-method' }}>
            {PROCUREMENT_METHODS.map((m) => <MenuItem key={m} value={m}>{PROCUREMENT_LABEL[m]}{m === p.defaultMethod ? ' (default)' : ''}</MenuItem>)}
          </TextField>
          {shown.minMax && <>{field('minQty', 'Minimum stock')}{field('maxQty', 'Maximum stock')}</>}
          {shown.period && field('periodDays', 'Every', 'days')}
          {shown.buying && <>{field('leadTimeDays', 'Lead time', 'days')}{field('minOrderQty', 'Minimum order')}{field('orderMultiple', 'Order multiple')}</>}
        </Box>
        {shown.buying && (
          <Box sx={{ maxWidth: 560 }}>
            <ServerMultiPicker<{ id: number; name: string }>
              label="Preferred vendors" noun="supplier" value={form.vendors} onChange={(v) => set({ vendors: v })}
              search={async (t) => (await searchParties(t, { role: 'supplier', status: 'active' })).map((x: Party) => ({ id: x.id, name: x.name }))}
              getId={(v) => v.id} getLabel={(v) => v.name} />
          </Box>
        )}
        {p.inherited?.settings && p.source === 'own' && (
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>
            Its definition {p.inherited.from.code ?? p.inherited.from.name} says: {p.inherited.settings.methodLabel}. This item overrides it.
          </Typography>
        )}
        {problems.length > 0 && <Typography sx={{ fontSize: 12.5, color: 'var(--c-warning-700, #b45309)' }}>{problems.join(' ')}</Typography>}
        {canEdit && (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button size="small" variant="contained" disabled={busy || !form.method || problems.length > 0} onClick={() => void save()} data-testid="proc-save">Save</Button>
            {p.own && <Button size="small" disabled={busy} onClick={() => void save(true)} data-testid="proc-clear">{clearLabel}</Button>}
          </Box>
        )}
      </Box>
    </SectionCard>
  );
}
