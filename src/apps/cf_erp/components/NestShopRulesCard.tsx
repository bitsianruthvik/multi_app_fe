import { useEffect, useState } from 'react';
import { Alert, Box, Button, FormControlLabel, IconButton, Switch, TextField, Tooltip, Typography } from '@mui/material';
import { CfApiError } from '../api/client';
import { getNestShopRules, saveNestShopRules, type NestShopResolved, type NestShopRuleRow } from '../api/cutting';
import { useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { ErrorNotice, SectionCard } from './ui';
import { useToast } from './toastContext';
import { SuccessCheck } from '../motion';
import { NestPlateRulesCard } from './NestPlateRulesCard';

/**
 * Setup › Cutting: the AI nesting's shop habits, per plate thickness (init.sql §75, services/shopRules.js),
 * learned from the shop's ProNest job files. A blank field = what the files say for that thickness (shown
 * as the placeholder). The switch lays the shop's SPACING over the AI nesting (edge margin, gap between
 * shared-line blocks); leads, pierce, cut order and marking are used in the AI DXF either way.
 */
const FIELDS: { key: keyof NestShopRuleRow; label: string; title: string }[] = [
  { key: 'kerfMm', label: 'Kerf', title: 'What the files used (the kerf nested with stays the Cut settings band)' },
  { key: 'edgeMarginMm', label: 'Edge', title: 'Plate edge to the nearest part' },
  { key: 'partGapMm', label: 'Part gap', title: 'Between two parts cut separately' },
  { key: 'groupGapMm', label: 'Block gap', title: 'Between two shared-line blocks' },
  { key: 'leadInMm', label: 'Lead-in', title: 'Outline: straight, in line with the first edge, from a corner' },
  { key: 'leadOutMm', label: 'Lead-out', title: 'Outline: straight, in line with the last edge' },
  { key: 'holeLeadRadiusMm', label: 'Hole arc', title: 'Hole: arc lead-in radius, 90 degrees' },
  { key: 'sharedLeadInMm', label: 'CL in', title: 'Common-line stroke lead-in' },
  { key: 'sharedLeadOutMm', label: 'CL out', title: 'Common-line stroke lead-out' },
  { key: 'freeRotationStepDeg', label: 'Free turn °', title: 'Blank = only 0 / 90 / 180 / 270 (all the shop uses); a step (e.g. 15) lets the true-shape nesting turn parts freely' },
];
type Draft = Record<string, string>;
const toDraft = (r: NestShopRuleRow): Draft => Object.fromEntries([['thicknessMm', String(r.thicknessMm)], ...FIELDS.map((f) => [f.key, r[f.key] == null ? '' : String(r[f.key])])]);
const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s));
const badNum = (s: string) => s.trim() !== '' && (Number.isNaN(Number(s)) || Number(s) < 0);

export function NestShopRulesCard() {
  const toast = useToast();
  const canEdit = useIsPermitted()('cf_erp_catalog_manage');
  const rules = useLoad(() => getNestShopRules(), []);
  const [on, setOn] = useState(false);
  // Most plate sizes per thickness (blank = the default, 2; 0 = no limit).
  const [maxSizes, setMaxSizes] = useState('');
  const [rows, setRows] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  const [saved, setSaved] = useState(0); // motion: a check draws after each save
  useEffect(() => { if (rules.data) { setOn(rules.data.on); setRows(rules.data.rows.map(toDraft)); setMaxSizes(rules.data.maxPlateSizes == null ? '' : String(rules.data.maxPlateSizes)); } }, [rules.data]);
  const sizesSchema = !!rules.data?.sizesSchema;
  const badSizes = maxSizes.trim() !== '' && !(/^\d+$/.test(maxSizes.trim()) && Number(maxSizes) <= 20);
  /** The rules as they apply at a thickness (the nearest one the server worked out), for the placeholders. */
  const resolvedAt = (t: string): NestShopResolved | undefined => {
    const n = Number(t);
    return (rules.data?.resolved ?? []).reduce<NestShopResolved | undefined>((best, r) => (best == null || Math.abs(r.thicknessMm - n) < Math.abs(best.thicknessMm - n) ? r : best), undefined);
  };
  const bad = badSizes || rows.some((r) => !(Number(r.thicknessMm) > 0) || FIELDS.some((f) => badNum(r[f.key] ?? '')));
  const save = async () => {
    setBusy(true); setError(null);
    try {
      const out = await saveNestShopRules({
        on,
        ...(sizesSchema ? { maxPlateSizes: maxSizes.trim() === '' ? null : Number(maxSizes) } : {}),
        rows: rows.map((r) => ({ thicknessMm: Number(r.thicknessMm), ...Object.fromEntries(FIELDS.map((f) => [f.key, numOrNull(r[f.key] ?? '')])) }) as NestShopRuleRow),
      });
      rules.setData(out);
      toast.success('Shop cutting habits saved.');
      setSaved((n) => n + 1);
    } catch (e) { setError(e instanceof CfApiError ? e : new CfApiError(0, String(e))); } finally { setBusy(false); }
  };
  const set = (i: number, key: string, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
  const schema = !!rules.data?.schema;
  return (
    <Box data-testid="nest-shop-rules-card" sx={{ maxWidth: 880, mt: 2 }}>
      <SectionCard title="AI nesting — the shop's cutting habits"
        subtitle="Learned from the shop's ProNest files: kerf 3 / 4 / 5 mm for 10–16 / 20–25 / 36–45 mm, 5 mm from the plate edge, 5 mm between parts, 13 mm between shared-line blocks, leads 6 in / 2 out. A blank field keeps that default. All in mm.">
        {rules.error ? <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>The shop rules could not be read.</Typography> : (
          <Box sx={{ display: 'grid', gap: 1.5, minWidth: 0 }}>
            {rules.data && !schema && (
              <Alert severity="info">This database does not have the shop rules yet (init.sql §75). The AI nesting uses the defaults.</Alert>
            )}
            <FormControlLabel
              control={<Switch checked={on} disabled={!canEdit || !schema} onChange={(e) => setOn(e.target.checked)} inputProps={{ 'aria-label': 'Use the shop spacing in AI nesting' }} />}
              label={<Typography sx={{ fontSize: 14 }}>Use the shop&apos;s spacing in AI nesting (edge margin, gap between blocks). Off: one kerf at the edge, 5–8 mm between sequences, as before.</Typography>}
            />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography sx={{ fontSize: 14 }}>Plate sizes per thickness, at most</Typography>
              <TextField size="small" value={maxSizes} disabled={!canEdit || !sizesSchema} error={badSizes} onChange={(e) => setMaxSizes(e.target.value)}
                placeholder={String(rules.data?.maxPlateSizesDefault ?? 2)} sx={{ width: 64 }} inputProps={{ inputMode: 'numeric', 'aria-label': 'Plate sizes per thickness, at most' }} />
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>The AI nesting buys few sizes, like the shop. Blank = 2; 0 = no limit.</Typography>
            </Box>
            <Box sx={{ overflowX: 'auto', minWidth: 0 }}>
              <Box component="table" sx={{ borderCollapse: 'collapse', fontSize: 13, '& td, & th': { p: 0.5, textAlign: 'left', whiteSpace: 'nowrap' } }}>
                <thead><tr><th>Thickness</th>{FIELDS.map((f) => <th key={f.key}><Tooltip title={f.title}><span>{f.label}</span></Tooltip></th>)}<th /></tr></thead>
                <tbody>
                  {rows.map((r, i) => {
                    const res = resolvedAt(r.thicknessMm);
                    return (
                      <tr key={`row-${i}`}>
                        <td><TextField size="small" value={r.thicknessMm} disabled={!canEdit} onChange={(e) => set(i, 'thicknessMm', e.target.value)} sx={{ width: 76 }} inputProps={{ inputMode: 'decimal', 'aria-label': 'Thickness mm' }} /></td>
                        {FIELDS.map((f) => (
                          <td key={f.key}>
                            <TextField size="small" value={r[f.key] ?? ''} disabled={!canEdit} error={badNum(r[f.key] ?? '')} onChange={(e) => set(i, f.key, e.target.value)}
                              placeholder={res?.[f.key] != null ? String(res[f.key]) : '—'} sx={{ width: 72 }} inputProps={{ inputMode: 'decimal', 'aria-label': f.label }} />
                          </td>
                        ))}
                        <td>{canEdit && <IconButton size="small" aria-label="Remove this thickness" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>×</IconButton>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </Box>
            </Box>
            {!rows.length && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>No thickness set: every value is what the shop&apos;s files say.</Typography>}
            {canEdit && (
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button variant="text" onClick={() => setRows((rs) => [...rs, { thicknessMm: '' }])} disabled={!schema}>Add a thickness</Button>
                <Box sx={{ flex: 1 }} />
                {saved > 0 && !busy && <SuccessCheck key={saved} size={18} label="Saved" />}
                <Button variant="outlined" onClick={() => { void save(); }} disabled={busy || bad || !schema}>{busy ? 'Saving…' : 'Save shop habits'}</Button>
              </Box>
            )}
            <ErrorNotice error={error} />
          </Box>
        )}
      </SectionCard>
      {/* §90: grade / impact class and custom plate sizes — the same setting, read and saved here. */}
      {!rules.error && <NestPlateRulesCard rules={rules.data} onSaved={(r) => rules.setData(r)} />}
    </Box>
  );
}
