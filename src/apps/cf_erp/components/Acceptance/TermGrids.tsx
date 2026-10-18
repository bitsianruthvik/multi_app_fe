import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, IconButton, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded';
import FunctionsRounded from '@mui/icons-material/FunctionsRounded';
import type { AcceptanceView, ChargeRow, Estimate, MilestoneRow, Terms, Trigger, TriggerType } from '../../api/acceptance';
import {
  blankCharge, blankLumpSum, blankMilestone, blankScrapCharge, blankStage, chargeRateUnit, linkStage, milestoneOfStage, move, proRataAllowed, triggerWords, termInputSx as inputSx,
} from '../../lib/acceptance';
import { rupeeText } from '../../lib/money';
import { fieldIndex, type BuilderField } from '../../lib/formulaBuilder';
import { Mono } from '../ui';
import { FormulaEditor } from '../FormulaBuilder/FormulaEditor';
import { DialogHeader } from '../FormDialog';

/**
 * The three grids of the customer's terms (§73) — Charges, Payment milestones, Post-production stages — Excel-like:
 * one row per line, a cell per value, Tab from cell to cell. Used by the Customer acceptance step (with the estimate
 * beside each row) and by Setup › Templates (without).
 */
export type TermLists = AcceptanceView['lists'];

const cell = { px: 0.75, py: 0.5, borderBottom: '1px solid var(--c-divider)', verticalAlign: 'top', fontSize: 13 } as const;
const head = { ...cell, fontSize: 11.5, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--c-text-3)', whiteSpace: 'nowrap', verticalAlign: 'bottom' } as const;
const num = (v: string): number | null => (v.trim() === '' ? null : Number(v));
const numText = (v: number | null | undefined) => (v == null ? '' : String(v));

/** A grid: a table that scrolls sideways inside its box, never the page. */
function Grid({ cols, children, testId }: { cols: ReactNode[]; children: ReactNode; testId: string }) {
  return (
    <Box sx={{ overflowX: 'auto', minWidth: 0 }}>
      <Box component="table" data-testid={testId} sx={{ borderCollapse: 'collapse', width: '100%', minWidth: 720 }}>
        <thead><tr>{cols.map((c, i) => <Box component="th" key={i} sx={{ ...head, textAlign: 'left' }}>{c}</Box>)}</tr></thead>
        <tbody>{children}</tbody>
      </Box>
    </Box>
  );
}
const Td = ({ children, right = false, title }: { children?: ReactNode; right?: boolean; title?: string }) => (
  <Box component="td" sx={{ ...cell, ...(right ? { textAlign: 'right', whiteSpace: 'nowrap' } : {}) }} title={title}>{children}</Box>
);

/** The formula of a charge: the formula builder in a dialog (the BOM's number values; read on every part row). */
function FormulaBasisDialog({ open, value, unit, fields, onClose, onSave }: {
  open: boolean; value: string; unit: string; fields: BuilderField[]; onClose: () => void; onSave: (expression: string, unit: string) => void;
}) {
  const [expr, setExpr] = useState(value);
  const [u, setU] = useState(unit);
  useEffect(() => { if (open) { setExpr(value); setU(unit); } }, [open, value, unit]);
  const idx = useMemo(() => fieldIndex([], [], fields), [fields]);
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogHeader title="Charge by a formula" subtitle="Worked out on every part of the order, times its quantity, then added up. A value the part does not have is taken from the order's values." onClose={onClose} />
      <DialogContent>
        <Box sx={{ display: 'grid', gap: 2, mt: 1 }}>
          <FormulaEditor value={expr} onChange={setExpr} idx={idx} itemFields={[]} machineFields={[]} plainFields={fields} timingOnly={false} label="Formula" autoFocus />
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>For example SURFACE_AREA * COATS. Use the part&rsquo;s own values — not SUM(children…).</Typography>
          <TextField label="Unit of the result" size="small" value={u} onChange={(e) => setU(e.target.value)} placeholder="m², nos, m" sx={{ maxWidth: 220 }} inputProps={{ 'data-testid': 'formula-unit' }} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!expr.trim() || !u.trim()} onClick={() => onSave(expr.trim(), u.trim())} data-testid="formula-save">Use this formula</Button>
      </DialogActions>
    </Dialog>
  );
}

/** CHARGES: one row per operation (by weight or a formula, a rate, billed pro-rata or on completion), the material row
 *  when we supply material, and lump sums. */
export function ChargesGrid({ terms, onChange, lists, editable, estimate = null, showMaterial = true, materialTonnes = null }: {
  terms: Terms; onChange: (patch: Partial<Terms>) => void; lists: TermLists; editable: boolean;
  estimate?: Estimate | null; showMaterial?: boolean; materialTonnes?: number | null;
}) {
  const [formulaFor, setFormulaFor] = useState<string | null>(null);
  const opName = (id: number) => lists.operations.find((o) => o.id === id)?.name ?? null;
  const setCharge = (i: number, patch: Partial<ChargeRow>) => onChange({ charges: terms.charges.map((c, k) => (k === i ? { ...c, ...patch } : c)) });
  const estOf = (key: string) => estimate?.charges.find((c) => c.key === key) ?? null;
  const fields: BuilderField[] = lists.formulaFields.map((f) => ({ code: f.code, name: f.name, dataType: 'number', measurementType: null, unit: f.unit }));
  const formulaRow = terms.charges.find((c) => c.key === formulaFor) ?? null;
  const cols = ['Charge', 'Operation the work passes', 'Basis', 'Rate (₹)', 'Billed', ...(estimate ? ['Quantity', 'Amount'] : []), ''];
  return (
    <>
      <Grid testId="acc-charges" cols={cols}>
        {terms.charges.map((c, i) => {
          const est = estOf(c.key);
          const basisValue = c.basis?.type === 'formula' ? 'formula' : c.basis?.type === 'scrap' ? `scrap:${c.basis.of}` : `weight:${c.basis?.type === 'weight' ? c.basis.weight : 'drawing'}`;
          return (
            <tr key={c.key} data-testid="acc-charge-row">
              <Td><TextField size="small" value={c.label} disabled={!editable} sx={{ ...inputSx, minWidth: 140 }} onChange={(e) => setCharge(i, { label: e.target.value })} inputProps={{ 'aria-label': 'Charge', 'data-testid': 'charge-label' }} /></Td>
              <Td>
                <TextField select size="small" value={c.operationId ?? ''} disabled={!editable} sx={{ ...inputSx, minWidth: 170 }} SelectProps={{ displayEmpty: true }}
                  onChange={(e) => { const id = Number(e.target.value); setCharge(i, { operationId: id, ...(c.label.trim() ? {} : { label: opName(id) ?? '' }) }); }} inputProps={{ 'aria-label': 'Operation', 'data-testid': 'charge-op' }}>
                  <MenuItem value="" disabled>Choose…</MenuItem>
                  {lists.operations.map((o) => <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>)}
                </TextField>
              </Td>
              <Td>
                <Box sx={{ display: 'grid', gap: 0.5 }}>
                  <TextField select size="small" value={basisValue} disabled={!editable} sx={{ ...inputSx, minWidth: 170 }} inputProps={{ 'aria-label': 'Basis', 'data-testid': 'charge-basis' }}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === 'formula') { setCharge(i, { basis: { type: 'formula', expression: c.basis?.type === 'formula' ? c.basis.expression : '', unit: c.basis?.type === 'formula' ? c.basis.unit : 'm²' } }); setFormulaFor(c.key); }
                      else if (v.startsWith('scrap:')) setCharge(i, { basis: { type: 'scrap', of: v.slice(6) as 'scrap' | 'offcut' | 'material_pct' } });
                      else setCharge(i, { basis: { type: 'weight', weight: v === 'weight:actual' ? 'actual' : 'drawing' } });
                    }}>
                    <MenuItem value="weight:drawing">Weight — as per drawing</MenuItem>
                    <MenuItem value="weight:actual">Weight — actual</MenuItem>
                    <MenuItem value="formula">Formula…</MenuItem>
                    {/* Scrap & offcuts (2026-10-18): the kg come from the order's nesting. */}
                    <MenuItem value="scrap:scrap">Scrap — kg × rate</MenuItem>
                    <MenuItem value="scrap:offcut">Offcuts — kg × rate</MenuItem>
                    <MenuItem value="scrap:material_pct">Scrap & offcuts — % of material</MenuItem>
                  </TextField>
                  {c.basis?.type === 'formula' && (
                    <Button size="small" startIcon={<FunctionsRounded />} disabled={!editable} onClick={() => setFormulaFor(c.key)} sx={{ justifyContent: 'flex-start', textTransform: 'none' }} data-testid="charge-formula">
                      <Mono>{c.basis.expression || 'write the formula'}</Mono>&nbsp;<Mono muted>({c.basis.unit || 'unit?'})</Mono>
                    </Button>
                  )}
                </Box>
              </Td>
              <Td>
                <TextField size="small" value={numText(c.rate)} disabled={!editable} sx={{ ...inputSx, width: 110 }} onChange={(e) => setCharge(i, { rate: num(e.target.value) })}
                  inputProps={{ inputMode: 'decimal', 'aria-label': 'Rate', 'data-testid': 'charge-rate' }}
                  InputProps={{ endAdornment: <Typography component="span" sx={{ fontSize: 11.5, color: 'var(--c-text-3)', ml: 0.5, whiteSpace: 'nowrap' }}>{chargeRateUnit(c.basis) === '%' ? '%' : `/${chargeRateUnit(c.basis)}`}</Typography> }} />
              </Td>
              <Td>
                <TextField select size="small" value={c.billing ?? ''} disabled={!editable} sx={{ ...inputSx, minWidth: 150 }} onChange={(e) => setCharge(i, { billing: e.target.value as ChargeRow['billing'] })} inputProps={{ 'aria-label': 'Billed', 'data-testid': 'charge-billing' }}>
                  <MenuItem value="pro_rata">Pro-rata (weekly)</MenuItem>
                  <MenuItem value="on_completion">On completion</MenuItem>
                </TextField>
              </Td>
              {estimate && (
                <Td right title={est?.note ?? undefined}>
                  <Mono>{est?.quantity == null ? '—' : est.unit === '₹ material' ? rupeeText(est.quantity) : est.quantity}</Mono> <Mono muted>{est?.unit === '₹ material' ? 'material' : est?.unit ?? ''}</Mono>
                  {/* Scrap & offcuts: where the kilograms came from, said under the figure. */}
                  {est?.basisKind === 'scrap' && est.note && <Box data-testid="charge-scrap-note" sx={{ fontSize: 11, color: est.quantity == null ? 'var(--c-warning-800)' : 'var(--c-text-3)', whiteSpace: 'normal', maxWidth: 220, ml: 'auto' }}>{est.note}</Box>}
                </Td>
              )}
              {estimate && <Td right><span data-testid="charge-amount"><Mono>{est?.amount == null ? '—' : rupeeText(est.amount)}</Mono></span></Td>}
              <Td>{editable && <IconButton size="small" aria-label="Remove charge" onClick={() => onChange({ charges: terms.charges.filter((_, k) => k !== i) })}><DeleteOutlineRounded fontSize="small" /></IconButton>}</Td>
            </tr>
          );
        })}
        {showMaterial && (
          <tr data-testid="acc-material-row">
            <Td><Typography sx={{ fontSize: 13, pt: 0.5 }}>Material (we supply)</Typography></Td>
            <Td><Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', pt: 0.5 }}>Lines we buy</Typography></Td>
            <Td>
              <TextField select size="small" value={terms.material?.weight ?? 'drawing'} disabled={!editable} sx={{ ...inputSx, minWidth: 170 }}
                onChange={(e) => onChange({ material: { rate: terms.material?.rate ?? null, weight: e.target.value as 'drawing' | 'actual' } })} inputProps={{ 'aria-label': 'Material weight' }}>
                <MenuItem value="drawing">Weight — as per drawing</MenuItem>
                <MenuItem value="actual">Weight — actual</MenuItem>
              </TextField>
            </Td>
            <Td>
              <TextField size="small" value={numText(terms.material?.rate)} disabled={!editable} sx={{ ...inputSx, width: 110 }} placeholder="none"
                onChange={(e) => onChange({ material: { rate: num(e.target.value), weight: terms.material?.weight ?? 'drawing' } })}
                inputProps={{ inputMode: 'decimal', 'aria-label': 'Material rate per tonne', 'data-testid': 'material-rate' }}
                InputProps={{ endAdornment: <Typography component="span" sx={{ fontSize: 11.5, color: 'var(--c-text-3)', ml: 0.5 }}>/t</Typography> }} />
            </Td>
            <Td />
            {estimate && <Td right><Mono>{estimate.material?.quantity ?? materialTonnes ?? '—'}</Mono> <Mono muted>t</Mono></Td>}
            {estimate && <Td right><Mono>{estimate.material ? rupeeText(estimate.material.amount) : '—'}</Mono></Td>}
            <Td />
          </tr>
        )}
        {terms.lumpSums.map((l, i) => (
          <tr key={l.key} data-testid="acc-lump-row">
            <Td><TextField size="small" value={l.label} disabled={!editable} sx={{ ...inputSx, minWidth: 140 }} placeholder="Transport, erection…" onChange={(e) => onChange({ lumpSums: terms.lumpSums.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} inputProps={{ 'aria-label': 'Lump sum' }} /></Td>
            <Td><Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', pt: 0.5 }}>Lump sum</Typography></Td>
            <Td />
            <Td>
              <TextField size="small" value={numText(l.amount)} disabled={!editable} sx={{ ...inputSx, width: 110 }} onChange={(e) => onChange({ lumpSums: terms.lumpSums.map((x, k) => (k === i ? { ...x, amount: num(e.target.value) } : x)) })}
                inputProps={{ inputMode: 'decimal', 'aria-label': 'Amount', 'data-testid': 'lump-amount' }} />
            </Td>
            <Td />
            {estimate && <Td />}
            {estimate && <Td right><Mono>{l.amount == null ? '—' : rupeeText(l.amount)}</Mono></Td>}
            <Td>{editable && <IconButton size="small" aria-label="Remove lump sum" onClick={() => onChange({ lumpSums: terms.lumpSums.filter((_, k) => k !== i) })}><DeleteOutlineRounded fontSize="small" /></IconButton>}</Td>
          </tr>
        ))}
      </Grid>
      {editable && (
        <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
          <Button size="small" startIcon={<AddRounded />} onClick={() => onChange({ charges: [...terms.charges, blankCharge(terms.charges)] })} data-testid="add-charge">Charge</Button>
          <Button size="small" startIcon={<AddRounded />} onClick={() => onChange({ lumpSums: [...terms.lumpSums, blankLumpSum(terms.lumpSums)] })} data-testid="add-lump">Lump sum</Button>
          {!terms.charges.some((c) => c.basis?.type === 'scrap') && (
            <Button size="small" startIcon={<AddRounded />} onClick={() => onChange({ charges: [...terms.charges, blankScrapCharge(terms.charges, lists.operations)] })} data-testid="add-scrap-charge"
              title="Charge the customer for the scrap and offcuts their order leaves — by kg from the nesting, or a % of the material">Scrap & offcuts</Button>
          )}
        </Box>
      )}
      <FormulaBasisDialog open={!!formulaRow} fields={fields}
        value={formulaRow?.basis?.type === 'formula' ? formulaRow.basis.expression : ''} unit={formulaRow?.basis?.type === 'formula' ? formulaRow.basis.unit : 'm²'}
        onClose={() => setFormulaFor(null)}
        onSave={(expression, unit) => { const i = terms.charges.findIndex((c) => c.key === formulaFor); if (i >= 0) setCharge(i, { basis: { type: 'formula', expression, unit } }); setFormulaFor(null); }} />
    </>
  );
}

/** One milestone's "when": the trigger and what it needs (operation, mode, stage, days after what, a date, months after which). */
function TriggerCell({ t, row, lists, terms, disabled, onChange, nested = false }: {
  t: Trigger | null; row: MilestoneRow; lists: TermLists; terms: Terms; disabled: boolean; onChange: (t: Trigger) => void;
  /** "N days after …" asks again for one of the triggers that is an event itself (operation, dispatch, stage included). */
  nested?: boolean;
}) {
  const set = (patch: Partial<Trigger>) => onChange({ ...(t ?? { type: '' }), ...patch });
  const type = t?.type ?? '';
  const options = nested ? lists.triggers.filter((x) => lists.afterTriggers.includes(x.key)) : lists.triggers;
  return (
    <Box sx={{ display: 'grid', gap: 0.5, minWidth: nested ? 0 : 230 }}>
      <TextField select size="small" value={type} disabled={disabled} sx={inputSx} onChange={(e) => onChange({ type: e.target.value as TriggerType })}
        inputProps={{ 'aria-label': nested ? 'After what' : `When — ${row.label || 'milestone'}`, 'data-testid': nested ? 'ms-after' : 'ms-trigger' }} SelectProps={{ displayEmpty: true }}>
        <MenuItem value="" disabled>{nested ? 'after…' : 'Choose when…'}</MenuItem>
        {options.map((x) => <MenuItem key={x.key} value={x.key}>{x.label}</MenuItem>)}
      </TextField>
      {type === 'operation_completed' && (
        <TextField select size="small" value={t?.operationId ?? ''} disabled={disabled} sx={inputSx} onChange={(e) => set({ operationId: Number(e.target.value) })} SelectProps={{ displayEmpty: true }} inputProps={{ 'aria-label': 'Which operation' }}>
          <MenuItem value="" disabled>Which operation…</MenuItem>
          {lists.operations.map((o) => <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>)}
        </TextField>
      )}
      {type === 'dispatched' && (
        <TextField select size="small" value={t?.mode ?? ''} disabled={disabled} sx={inputSx} onChange={(e) => set({ mode: e.target.value as 'each' | 'all' })} SelectProps={{ displayEmpty: true }} inputProps={{ 'aria-label': 'Which dispatch' }}>
          <MenuItem value="" disabled>Which dispatch…</MenuItem>
          {(Object.entries(lists.dispatchModes) as ['each' | 'all', string][]).map(([k, label]) => <MenuItem key={k} value={k}>{label}</MenuItem>)}
        </TextField>
      )}
      {type === 'post_stage' && (
        <TextField select size="small" value={t?.stageKey ?? ''} disabled={disabled} sx={inputSx} onChange={(e) => set({ stageKey: e.target.value })} SelectProps={{ displayEmpty: true }} inputProps={{ 'aria-label': 'Which stage' }}>
          <MenuItem value="" disabled>Which stage…</MenuItem>
          {terms.stages.filter((s) => s.name.trim()).map((s) => <MenuItem key={s.key} value={s.key}>{s.name}</MenuItem>)}
          {t?.stageKey && !terms.stages.some((s) => s.key === t.stageKey) && <MenuItem value={t.stageKey}>{t.stageKey} (from the stages template)</MenuItem>}
        </TextField>
      )}
      {type === 'days_after' && !nested && (
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'flex-start' }}>
          <TextField size="small" value={numText(t?.days)} disabled={disabled} sx={{ ...inputSx, width: 70 }} onChange={(e) => set({ days: num(e.target.value) })} inputProps={{ inputMode: 'numeric', 'aria-label': 'Days' }} placeholder="days" />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <TriggerCell nested t={t?.after ?? null} row={row} lists={lists} terms={terms} disabled={disabled} onChange={(after) => set({ after })} />
          </Box>
        </Box>
      )}
      {type === 'fixed_date' && <TextField size="small" type="date" value={t?.date ?? ''} disabled={disabled} sx={inputSx} onChange={(e) => set({ date: e.target.value })} inputProps={{ 'aria-label': 'Date' }} />}
      {type === 'retention' && (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <TextField size="small" value={numText(t?.months)} disabled={disabled} sx={{ ...inputSx, width: 70 }} onChange={(e) => set({ months: num(e.target.value) })} inputProps={{ inputMode: 'numeric', 'aria-label': 'Months' }} placeholder="months" />
          <TextField select size="small" value={t?.milestoneKey ?? ''} disabled={disabled} sx={{ ...inputSx, flex: 1 }} onChange={(e) => set({ milestoneKey: e.target.value })} SelectProps={{ displayEmpty: true }} inputProps={{ 'aria-label': 'After which milestone' }}>
            <MenuItem value="" disabled>after milestone…</MenuItem>
            {terms.milestones.filter((m) => m.key !== row.key && m.trigger?.type !== 'retention').map((m) => <MenuItem key={m.key} value={m.key}>{m.label || m.key}</MenuItem>)}
          </TextField>
        </Box>
      )}
    </Box>
  );
}

/** PAYMENT MILESTONES: % or a fixed amount, when (a trigger the app tracks), pro-rata where allowed, credit days. */
export function MilestonesGrid({ terms, onChange, lists, editable, estimate = null }: {
  terms: Terms; onChange: (patch: Partial<Terms>) => void; lists: TermLists; editable: boolean; estimate?: Estimate | null;
}) {
  const setMs = (i: number, patch: Partial<MilestoneRow>) => onChange({ milestones: terms.milestones.map((m, k) => (k === i ? { ...m, ...patch } : m)) });
  const opName = (id: number) => lists.operations.find((o) => o.id === id)?.name ?? null;
  const stageName = (k: string) => terms.stages.find((s) => s.key === k)?.name ?? null;
  const msName = (k: string) => terms.milestones.find((m) => m.key === k)?.label ?? null;
  const amountOf = (key: string) => estimate?.milestones.find((m) => m.key === key)?.amount ?? null;
  return (
    <>
      <Grid testId="acc-milestones" cols={['Milestone', '% or ₹', 'Value', 'When', 'Pro-rata', 'Credit days', ...(estimate ? ['Amount'] : []), '']}>
        {terms.milestones.map((m, i) => (
          <tr key={m.key} data-testid="acc-ms-row">
            <Td><TextField size="small" value={m.label} disabled={!editable} sx={{ ...inputSx, minWidth: 140 }} onChange={(e) => setMs(i, { label: e.target.value })} inputProps={{ 'aria-label': 'Milestone', 'data-testid': 'ms-label' }} /></Td>
            <Td>
              <TextField select size="small" value={m.kind ?? 'percent'} disabled={!editable} sx={{ ...inputSx, width: 90 }} onChange={(e) => setMs(i, { kind: e.target.value as 'percent' | 'amount' })} inputProps={{ 'aria-label': '% or amount' }}>
                <MenuItem value="percent">%</MenuItem>
                <MenuItem value="amount">₹</MenuItem>
              </TextField>
            </Td>
            <Td><TextField size="small" value={numText(m.value)} disabled={!editable} sx={{ ...inputSx, width: 100 }} onChange={(e) => setMs(i, { value: num(e.target.value) })} inputProps={{ inputMode: 'decimal', 'aria-label': 'Value', 'data-testid': 'ms-value' }} /></Td>
            <Td>
              <TriggerCell t={m.trigger} row={m} lists={lists} terms={terms} disabled={!editable}
                onChange={(t) => setMs(i, { trigger: t, proRata: t.type === 'dispatched' ? t.mode === 'each' : proRataAllowed(t) ? m.proRata : false })} />
              <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mt: 0.25 }} data-testid="ms-words">{triggerWords(m.trigger, { operation: opName, stage: stageName, milestone: msName })}</Typography>
            </Td>
            <Td>
              <Tooltip title={m.trigger?.type === 'dispatched' ? 'Each dispatch is billed for what it carries' : proRataAllowed(m.trigger) ? 'Billed in parts, by tonnage' : 'Not for this trigger'}>
                <span><Checkbox size="small" checked={m.proRata} disabled={!editable || !proRataAllowed(m.trigger)} onChange={(e) => setMs(i, { proRata: e.target.checked })} inputProps={{ 'aria-label': 'Pro-rata' }} /></span>
              </Tooltip>
            </Td>
            <Td><TextField size="small" value={String(m.creditDays ?? 0)} disabled={!editable} sx={{ ...inputSx, width: 80 }} onChange={(e) => setMs(i, { creditDays: Number(e.target.value) || 0 })} inputProps={{ inputMode: 'numeric', 'aria-label': 'Credit days', 'data-testid': 'ms-credit' }} /></Td>
            {estimate && <Td right><Mono>{amountOf(m.key) == null ? '—' : rupeeText(amountOf(m.key))}</Mono></Td>}
            <Td>{editable && <IconButton size="small" aria-label="Remove milestone" onClick={() => onChange({ milestones: terms.milestones.filter((_, k) => k !== i) })}><DeleteOutlineRounded fontSize="small" /></IconButton>}</Td>
          </tr>
        ))}
      </Grid>
      {editable && <Button size="small" startIcon={<AddRounded />} sx={{ mt: 1 }} onClick={() => onChange({ milestones: [...terms.milestones, blankMilestone(terms.milestones)] })} data-testid="add-ms">Milestone</Button>}
    </>
  );
}

/** POST-PRODUCTION STAGES, in order; each optionally billed by a milestone (that milestone's trigger becomes "done"). */
export function StagesGrid({ terms, onChange, editable, linkMilestones = true }: {
  terms: Terms; onChange: (patch: Partial<Terms>) => void; editable: boolean; linkMilestones?: boolean;
}) {
  return (
    <>
      <Grid testId="acc-stages" cols={['#', 'Stage', ...(linkMilestones ? ['Billed by milestone'] : []), '']}>
        {terms.stages.map((s, i) => (
          <tr key={s.key} data-testid="acc-stage-row">
            <Td><Mono muted>{i + 1}</Mono></Td>
            <Td><TextField size="small" value={s.name} disabled={!editable} fullWidth sx={inputSx} placeholder="Inspection by RITES, erection at site…"
              onChange={(e) => onChange({ stages: terms.stages.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} inputProps={{ 'aria-label': 'Stage', 'data-testid': 'stage-name' }} /></Td>
            {linkMilestones && (
              <Td>
                <TextField select size="small" value={milestoneOfStage(terms.milestones, s.key)?.key ?? ''} disabled={!editable} sx={{ ...inputSx, minWidth: 180 }} SelectProps={{ displayEmpty: true }}
                  onChange={(e) => onChange({ milestones: linkStage(terms.milestones, s.key, e.target.value) })} inputProps={{ 'aria-label': 'Billed by', 'data-testid': 'stage-ms' }}>
                  <MenuItem value="">Not billed on it</MenuItem>
                  {terms.milestones.map((m) => <MenuItem key={m.key} value={m.key}>{m.label || m.key}</MenuItem>)}
                </TextField>
              </Td>
            )}
            <Td>
              {editable && (
                <Box sx={{ whiteSpace: 'nowrap' }}>
                  <IconButton size="small" aria-label="Move up" disabled={i === 0} onClick={() => onChange({ stages: move(terms.stages, i, -1) })}><ArrowUpwardRounded fontSize="small" /></IconButton>
                  <IconButton size="small" aria-label="Move down" disabled={i === terms.stages.length - 1} onClick={() => onChange({ stages: move(terms.stages, i, 1) })}><ArrowDownwardRounded fontSize="small" /></IconButton>
                  <IconButton size="small" aria-label="Remove stage" onClick={() => onChange({ stages: terms.stages.filter((_, k) => k !== i) })}><DeleteOutlineRounded fontSize="small" /></IconButton>
                </Box>
              )}
            </Td>
          </tr>
        ))}
      </Grid>
      {editable && <Button size="small" startIcon={<AddRounded />} sx={{ mt: 1 }} onClick={() => onChange({ stages: [...terms.stages, blankStage(terms.stages)] })} data-testid="add-stage">Stage</Button>}
    </>
  );
}
