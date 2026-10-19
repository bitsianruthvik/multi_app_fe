import { useEffect, useState } from 'react';
import { Alert, Box, Button, FormControlLabel, MenuItem, Switch, TextField, Typography } from '@mui/material';
import { CfApiError } from '../api/client';
import { saveNestShopRules, type NestGradeRule, type NestShopRules } from '../api/cutting';
import { GRADE_RULE_WORDS, PLATE_LIMITS, badMm, limitsDraft, plateRulesBody, type PlateLimitsDraft } from '../lib/plateRules';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { ErrorNotice, SectionCard } from './ui';
import { useToast } from './toastContext';

/**
 * Setup › Cutting (§90, 2026-10-19): which plate the AI nesting may put a piece on — by grade and impact class — and the
 * custom plate sizes it may propose (within the mill's sizes; a size is added to the catalog when that nesting is used).
 * Shown inside the shop-habits card, which reads and saves the same setting (GET / PUT /nest-shop-rules).
 */
export function NestPlateRulesCard({ rules, onSaved }: { rules: NestShopRules | null | undefined; onSaved: (r: NestShopRules) => void }) {
  const toast = useToast();
  const canEdit = useIsPermitted()('cf_erp_catalog_manage');
  const [rule, setRule] = useState<NestGradeRule | ''>('');
  const [on, setOn] = useState(false);
  const [draft, setDraft] = useState<PlateLimitsDraft>(limitsDraft(null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  useEffect(() => {
    if (!rules) return;
    setRule(rules.gradeRule ?? '');
    setOn(!!rules.customPlates?.on);
    setDraft(limitsDraft(rules.customPlates));
  }, [rules]);
  const schema = !!rules?.plateSchema;
  const bad = PLATE_LIMITS.some((f) => badMm(draft[f.key]));
  const save = async () => {
    setBusy(true); setError(null);
    try {
      const out = await saveNestShopRules(plateRulesBody(rule, on, draft));
      onSaved(out);
      toast.success('Plate rules saved.');
    } catch (e) { setError(e instanceof CfApiError ? e : new CfApiError(0, String(e))); } finally { setBusy(false); }
  };
  return (
    <Box data-testid="nest-plate-rules-card" sx={{ maxWidth: 880, mt: 2 }}>
      <SectionCard title="AI nesting — grade, impact class and custom plate sizes"
        subtitle={`A piece is nested only on a plate of its grade and impact class — exactly, by default (the order of classes for the other rules: ${rules?.impactOrder ?? 'A < BR < BO / B0 < C'}). The AI may also propose one custom plate size per steel, within the mill's sizes; it is added to the catalog when that nesting is used.`}>
        <Box sx={{ display: 'grid', gap: 1.5, minWidth: 0 }}>
          {rules && !schema && <Alert severity="info">This database does not have these settings yet (init.sql §90). Nesting uses the default rule and proposes no custom size.</Alert>}
          <TextField select size="small" label="Which plate may carry a piece" value={rule} disabled={!canEdit || !schema} onChange={(e) => setRule(e.target.value as NestGradeRule | '')}
            sx={{ maxWidth: 520 }} slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true }, htmlInput: { 'aria-label': 'Grade and impact rule' } }}>
            <MenuItem value="">{`Default — ${GRADE_RULE_WORDS[(rules?.gradeRuleDefault ?? 'exact') as NestGradeRule] ?? 'exact'}`}</MenuItem>
            {(rules?.gradeRules ?? ['better', 'exact', 'higher']).map((r) => <MenuItem key={r} value={r}>{GRADE_RULE_WORDS[r] ?? r}</MenuItem>)}
          </TextField>
          <FormControlLabel
            control={<Switch checked={on} disabled={!canEdit || !schema} onChange={(e) => setOn(e.target.checked)} slotProps={{ input: { 'aria-label': 'Let the AI propose custom plate sizes' } }} />}
            label={<Typography sx={{ fontSize: 14 }}>Let the AI propose a custom plate size (one per steel) when it saves steel. Off: catalog sizes only.</Typography>}
          />
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            {PLATE_LIMITS.map((f) => (
              <TextField key={f.key} size="small" label={`${f.label} mm`} value={draft[f.key]} disabled={!canEdit || !schema || !on} error={badMm(draft[f.key])}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} placeholder={f.key === 'step' ? 'band' : 'catalog'}
                sx={{ width: 120 }} inputProps={{ inputMode: 'decimal', 'aria-label': `${f.label} custom plate mm` }} />
            ))}
          </Box>
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>The mill&apos;s sizes. Blank = the catalog&apos;s own range for that thickness; a blank step = the cut-settings band&apos;s order step.</Typography>
          {canEdit && (
            <Box sx={{ display: 'flex' }}>
              <Box sx={{ flex: 1 }} />
              <Button variant="outlined" onClick={() => { void save(); }} disabled={busy || bad || !schema}>{busy ? 'Saving…' : 'Save plate rules'}</Button>
            </Box>
          )}
          <ErrorNotice error={error} />
        </Box>
      </SectionCard>
    </Box>
  );
}
