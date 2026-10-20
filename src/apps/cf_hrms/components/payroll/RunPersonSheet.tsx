/**
 * One person in a payroll run, in a side sheet over the run (spec §25.2): the
 * lines by kind with how each was worked out, the days and LOP dates, ESI, the
 * bank account (masked), the one-time items and the month's TDS.
 *
 * While the run is open (draft or calculated) and the login has payroll edit,
 * items and the TDS may change. The run is NOT recalculated by that: the sheet
 * says "Calculate again to include this" and the run page shows the same.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import {
  Callout, ConfirmDialog, ErrorNotice, FormDialog, SideSheet, SkeletonRows, ToneBadge, useToast,
} from '@shared/ui';
import { payrollApi, type PayComponent, type RunItem, type RunPersonDetail } from '../../api/payroll';
import { RowActions } from '../list/RowActions';
import { Amount, Fact } from './PayParts';
import { KIND_ORDER, KIND_PLURAL, LINE_SOURCE_WORD, monthWord, parseAmount, rupees, warningWord } from './payWords';
import { longDay } from '../jobDates';

interface ItemDraft { item: RunItem | null; componentId: string; amount: string; note: string }

export function RunPersonSheet({
  runId, personId, canChange, canRemove, components, onClose, onChanged,
}: {
  runId: number;
  /** The person's row in the run (RunPerson.id); null = closed. */
  personId: number | null;
  /** The run is open and the login has payroll edit. */
  canChange: boolean;
  canRemove: boolean;
  /** The company's components — for the item picker. */
  components: PayComponent[];
  onClose: () => void;
  /** Something changed: `recalculate` = the run was calculated, so it needs calculating again. */
  onChanged: (recalculate: boolean) => void;
}) {
  const toast = useToast();
  const { company } = useParams<{ company: string }>();
  const [data, setData] = useState<RunPersonDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [recalc, setRecalc] = useState(false);
  const [itemDraft, setItemDraft] = useState<ItemDraft | null>(null);
  const [removing, setRemoving] = useState<RunItem | null>(null);
  const [tds, setTds] = useState('');
  const [tdsNote, setTdsNote] = useState('');
  const [tdsBusy, setTdsBusy] = useState(false);
  const [tdsError, setTdsError] = useState<unknown>(null);

  const tdsComp = components.find((c) => c.statutoryKey === 'TDS') ?? null;
  const load = useCallback(() => {
    if (personId == null) return;
    payrollApi.runPerson(runId, personId)
      .then((d) => {
        setData(d);
        setError(null);
        const typed = d.items.filter((i) => tdsComp && i.componentId === tdsComp.id);
        const ov = d.person.tax?.override ?? null;
        setTds(ov ? String(ov.amount) : typed.length ? String(typed.reduce((s, i) => s + i.amount, 0)) : '');
        setTdsNote(ov?.reason ?? typed[0]?.note ?? '');
      })
      .catch(setError);
  }, [runId, personId, tdsComp]);
  // The parent keys the sheet by person, so a new person starts clean.
  useEffect(load, [load]);

  const changed = (r: boolean) => {
    if (r) setRecalc(true);
    onChanged(r);
    load();
  };

  const itemChoices = components.filter((c) => c.status === 'ACTIVE' && !c.statutoryKey && c.kind !== 'EMPLOYER_CONTRIBUTION');
  const items = (data?.items ?? []).filter((i) => !(tdsComp && i.componentId === tdsComp.id));
  const p = data?.person;

  const saveTds = async () => {
    if (!p) return;
    setTdsBusy(true);
    setTdsError(null);
    try {
      const r = tds.trim() === ''
        ? await payrollApi.clearTds(runId, p.employee.id)
        : await payrollApi.setTds(runId, p.employee.id, { amount: parseAmount(tds) ?? 0, reason: tdsNote.trim() });
      toast.success(tds.trim() === '' ? 'Back to the tax engine.' : 'TDS for the month set by hand.');
      changed(r.recalculate);
    } catch (e) {
      setTdsError(e);
    } finally {
      setTdsBusy(false);
    }
  };

  return (
    <SideSheet
      open={personId != null}
      onClose={onClose}
      width={560}
      title={p ? p.employee.name : 'Person'}
      subtitle={p ? `${p.employee.code}${data?.run ? ` · ${data.run.label}` : ''}` : undefined}
    >
      <ErrorNotice error={error} onRetry={load} />
      {!data && !error && <SkeletonRows rows={8} />}
      {data && p && (
        <Stack spacing={2.25} sx={{ pb: 2 }}>
          {recalc && <Callout tone="warning" title="Calculate again to include this">The amounts below are from the last calculation.</Callout>}
          {!p.included && <Callout tone="warning" title="Not paid in this run">{p.warnings[0]?.text ?? 'No salary for this month.'}</Callout>}

          {p.warnings.length > 0 && (
            <Stack spacing={0.75}>
              {p.warnings.map((w, i) => (
                <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                  <ToneBadge tone={warningWord(w.code).tone} label={warningWord(w.code).label} noIcon />
                  <Typography sx={{ fontSize: 13, overflowWrap: 'anywhere' }}>{w.text}</Typography>
                </Box>
              ))}
            </Stack>
          )}

          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 1.5 }}>
            <Fact label="Gross">{rupees(p.gross)}</Fact>
            <Fact label="Deductions">{rupees(p.deductions)}</Fact>
            <Fact label="Net pay">{rupees(p.net)}</Fact>
            <Fact label="Employer cost">{rupees(p.employer)}</Fact>
          </Box>

          <Box>
            <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>Days</Typography>
            <Typography sx={{ fontSize: 13.5 }}>
              Paid for {p.payableDays} of {p.daysInMonth} days
              {p.employedDays < p.daysInMonth ? ` (employed ${p.employedDays})` : ''}
              {p.lopDays > 0 ? ` · ${p.lopDays} day${p.lopDays === 1 ? '' : 's'} without pay` : ''}
            </Typography>
            {p.lopDates.length > 0 && (
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>
                Without pay: {p.lopDates.map((d) => longDay(d)).join(', ')}
              </Typography>
            )}
            {p.segments.length > 1 && (
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                Two salaries this month: {p.segments.map((s) => `${longDay(s.from)} – ${longDay(s.to)} (${s.days} days)`).join('; ')}.
              </Typography>
            )}
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 1.5 }}>
            <Fact label="PF wage">{rupees(p.pfWage)}</Fact>
            <Fact label="ESI">{p.esiCovered ? `Covered · wage ${rupees(p.esiWage)}` : 'Not covered'}</Fact>
            <Fact label="Bank">{p.bank.account ? `${p.bank.account}${p.bank.ifsc ? ` · ${p.bank.ifsc}` : ''}` : 'No bank details'}</Fact>
          </Box>

          {KIND_ORDER.map((k) => {
            const lines = data.lines.filter((l) => l.kind === k);
            if (!lines.length) return null;
            return (
              <Box key={k}>
                <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>{KIND_PLURAL[k]}</Typography>
                {lines.map((l) => (
                  <Box key={l.id} sx={{ display: 'flex', gap: 1.5, py: 0.6, borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 } }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: 13.5 }}>
                        {l.name}{l.forMonth ? ` (${monthWord(l.forMonth)})` : ''}
                        {LINE_SOURCE_WORD[l.source] && <Typography component="span" data-line-source={l.source} sx={{ fontSize: 11.5, color: 'var(--c-text-3)', ml: 0.75 }}>· {LINE_SOURCE_WORD[l.source]}</Typography>}
                      </Typography>
                      {(l.basis || (l.fullAmount != null && l.fullAmount !== l.amount)) && (
                        <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>
                          {l.basis}
                          {l.fullAmount != null && l.fullAmount !== l.amount ? `${l.basis ? ' · ' : ''}${rupees(l.fullAmount)} for the full month` : ''}
                        </Typography>
                      )}
                    </Box>
                    <Typography sx={{ fontSize: 13.5 }}><Amount value={l.amount} /></Typography>
                  </Box>
                ))}
              </Box>
            );
          })}
          {data.lines.length === 0 && p.included && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>No lines: calculate the run.</Typography>}

          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, flex: 1 }}>One-time items</Typography>
              {canChange && (
                <Button size="small" startIcon={<AddRounded />} onClick={() => setItemDraft({ item: null, componentId: '', amount: '', note: '' })} data-action="add-item">
                  Add
                </Button>
              )}
            </Box>
            {items.length === 0 ? (
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>None this month — a bonus, overtime or a loan recovery goes here.</Typography>
            ) : items.map((i) => (
              <Box key={i.id} sx={{ display: 'flex', gap: 1, alignItems: 'center', py: 0.5, borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 } }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 13.5 }}>{i.name}</Typography>
                  {i.note && <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{i.note}</Typography>}
                </Box>
                <Amount value={i.kind === 'DEDUCTION' ? -i.amount : i.amount} />
                {canChange && (
                  <RowActions
                    name={i.name}
                    onEdit={() => setItemDraft({ item: i, componentId: String(i.componentId), amount: String(i.amount), note: i.note ?? '' })}
                    onRemove={canRemove ? () => setRemoving(i) : undefined}
                  />
                )}
              </Box>
            ))}
          </Box>

          <Box>
            <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>TDS this month</Typography>
            {p.tax && (
              <Box sx={{ mb: 1 }}>
                <Typography sx={{ fontSize: 13.5 }}>
                  {rupees(p.tds)}{p.tdsSource === 'MANUAL' ? ' — set by hand' : ' — the tax engine'}
                  {p.tax.regime ? ` · ${p.tax.regime === 'OLD' ? 'old' : 'new'} regime` : ''}
                  {p.tax.engineTds != null && p.tdsSource === 'MANUAL' ? ` · the engine says ${rupees(p.tax.engineTds)}` : ''}
                </Typography>
                {(p.tax.lines ?? []).map((l, i) => <Typography key={i} sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{l.label}{l.amount != null ? `: ${rupees(l.amount)}` : ''}</Typography>)}
                {p.tax.year && company && (
                  <Button size="small" component={RouterLink} to={`/${company}/cf_hrms/tax-sheet/${p.employee.id}?year=${p.tax.year}&month=${data?.run.month ?? ''}`} sx={{ px: 0 }}>Open the tax sheet for this month</Button>
                )}
              </Box>
            )}
            {canChange && tdsComp ? (
              <Stack spacing={1}>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <TextField size="small" label="TDS (₹)" value={tds} onChange={(e) => setTds(e.target.value)} sx={{ width: 150 }}
                    inputProps={{ inputMode: 'decimal', 'data-field': 'tds' }} helperText="Empty: the engine's." />
                  <TextField size="small" label="Reason (kept with the run)" value={tdsNote} onChange={(e) => setTdsNote(e.target.value)} sx={{ flex: '1 1 160px' }} inputProps={{ maxLength: 300 }} />
                  <Button variant="outlined" onClick={() => void saveTds()} disabled={tdsBusy || (tds.trim() !== '' && tdsNote.trim().length < 3)}>{tdsBusy ? 'Saving…' : tds.trim() === '' ? 'Use the engine' : 'Set by hand'}</Button>
                </Box>
                <ErrorNotice error={tdsError} />
              </Stack>
            ) : (
              <Typography sx={{ fontSize: 13.5 }}>{p.tds ? rupees(p.tds) : 'None'}</Typography>
            )}
          </Box>
        </Stack>
      )}

      <FormDialog
        open={!!itemDraft}
        title={itemDraft?.item ? `Change ${itemDraft.item.name}` : 'Add a one-time item'}
        subtitle={p ? `${p.employee.name} · ${data?.run.label ?? ''}` : undefined}
        onClose={() => setItemDraft(null)}
        maxWidth="xs"
        submitDisabled={!itemDraft || !itemDraft.componentId || !(parseAmount(itemDraft.amount) ?? 0)}
        onSubmit={async () => {
          if (!itemDraft || !p) return;
          const amount = parseAmount(itemDraft.amount) ?? 0;
          const r = itemDraft.item
            ? await payrollApi.updateItem(itemDraft.item.id, { amount, note: itemDraft.note.trim() || null })
            : await payrollApi.addItem(runId, { employeeId: p.employee.id, componentId: Number(itemDraft.componentId), amount, note: itemDraft.note.trim() || null });
          toast.success(itemDraft.item ? 'Item saved.' : 'Item added.');
          changed(r.recalculate);
        }}
      >
        {itemDraft && (
          <Stack spacing={1.5}>
            <TextField select size="small" label="Component" required value={itemDraft.componentId} disabled={!!itemDraft.item}
              onChange={(e) => setItemDraft({ ...itemDraft, componentId: e.target.value })}
              helperText={itemDraft.item ? 'To change the component, remove the item and add another.' : 'An earning, a reimbursement or a deduction.'}>
              {(itemDraft.item ? components.filter((c) => c.id === itemDraft.item?.componentId) : itemChoices).map((c) => (
                <MenuItem key={c.id} value={String(c.id)}>{c.name} — {c.kind === 'DEDUCTION' ? 'deduction' : c.kind === 'REIMBURSEMENT' ? 'reimbursement' : 'earning'}</MenuItem>
              ))}
            </TextField>
            <TextField size="small" label="Amount (₹)" required value={itemDraft.amount} onChange={(e) => setItemDraft({ ...itemDraft, amount: e.target.value })} inputProps={{ inputMode: 'decimal' }} />
            <TextField size="small" label="Note (optional)" value={itemDraft.note} onChange={(e) => setItemDraft({ ...itemDraft, note: e.target.value })}
              helperText="As the payslip says it: Diwali bonus." inputProps={{ maxLength: 300 }} />
          </Stack>
        )}
      </FormDialog>
      <ConfirmDialog
        open={!!removing}
        title="Remove this item?"
        entityName={removing ? `${removing.name} · ${rupees(removing.amount)}` : undefined}
        confirmLabel="Remove"
        danger
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          const r = await payrollApi.removeItem(removing.id);
          toast.success('Item removed.');
          changed(r.recalculate);
        }}
      />
    </SideSheet>
  );
}
