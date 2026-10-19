/**
 * Payroll › Components (CF_HRMS_HIRING_SPEC.md §25.2) — the pieces a salary is
 * made of, grouped by kind: earnings, reimbursements, deductions, employer
 * contributions. Each says how it is treated: taxable, part of the PF / ESI /
 * gratuity wage, paid monthly or yearly, cut for leave without pay.
 *
 * The ready-made components the run works out by law (PF, ESI, professional
 * tax, LWF, TDS, arrears) carry a "worked out by law" chip: their kind and key
 * cannot change, and they are made inactive rather than removed.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, Checkbox, FormControlLabel, MenuItem, Stack, TextField, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import {
  ConfirmDialog, ErrorNotice, FormDialog, ListSkeleton, Mono, PageHeader, SectionCard, ToneBadge, useToast,
} from '@shared/ui';
import { useCan } from '../access/can';
import { payrollApi, type ComponentInput, type ComponentKind, type ComponentList, type PayComponent } from '../api/payroll';
import { RowActions } from '../components/list/RowActions';
import { SetupPayrollCard } from '../components/payroll/SetupPayrollCard';
import { KIND_ORDER, KIND_PLURAL, KIND_WORD, TAXABLE_WORD } from '../components/payroll/payWords';

interface Draft {
  code: string;
  name: string;
  kind: ComponentKind;
  taxable: 'YES' | 'PARTLY' | 'NO';
  exemptionRule: string;
  inPfWage: boolean;
  inEsiWage: boolean;
  inGratuityWage: boolean;
  frequency: 'MONTHLY' | 'YEARLY';
  prorateOnLop: boolean;
  sortOrder: string;
  status: 'ACTIVE' | 'INACTIVE';
  description: string;
}

const blank = (kind: ComponentKind = 'EARNING'): Draft => ({
  code: '', name: '', kind, taxable: kind === 'EARNING' ? 'YES' : 'NO', exemptionRule: '', inPfWage: false, inEsiWage: kind === 'EARNING',
  inGratuityWage: false, frequency: 'MONTHLY', prorateOnLop: kind === 'EARNING', sortOrder: '', status: 'ACTIVE', description: '',
});

const draftOf = (c: PayComponent): Draft => ({
  code: c.code, name: c.name, kind: c.kind, taxable: c.taxable, exemptionRule: c.exemptionRule ?? '', inPfWage: c.inPfWage,
  inEsiWage: c.inEsiWage, inGratuityWage: c.inGratuityWage, frequency: c.frequency, prorateOnLop: c.prorateOnLop,
  sortOrder: String(c.sortOrder), status: c.status, description: c.description ?? '',
});

function bodyOf(d: Draft, editing: PayComponent | null): ComponentInput {
  const out: ComponentInput = {
    name: d.name.trim(), taxable: d.taxable, exemptionRule: d.exemptionRule || null, inPfWage: d.inPfWage, inEsiWage: d.inEsiWage,
    inGratuityWage: d.inGratuityWage, frequency: d.frequency, prorateOnLop: d.prorateOnLop, status: d.status, description: d.description.trim() || null,
  };
  if (!editing || d.code.trim().toUpperCase() !== editing.code) out.code = d.code.trim().toUpperCase();
  if (!editing || d.kind !== editing.kind) out.kind = d.kind;
  if (d.sortOrder.trim() !== '') out.sortOrder = Number(d.sortOrder);
  return out;
}

function Flags({ c, lawWord }: { c: PayComponent; lawWord?: string }) {
  const chip = (label: string, tone: 'neutral' | 'info' | 'warning' = 'neutral', title?: string) => <ToneBadge key={label} tone={tone} label={label} title={title} noIcon />;
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
      {c.statutoryKey && chip('Worked out by law', 'info', lawWord)}
      {c.status === 'INACTIVE' && chip('Inactive', 'warning')}
      {c.kind === 'EARNING' && chip(TAXABLE_WORD[c.taxable] ?? c.taxable)}
      {c.inPfWage && chip('PF wage')}
      {c.inEsiWage && chip('ESI wage')}
      {c.inGratuityWage && chip('Gratuity wage')}
      {c.frequency === 'YEARLY' && chip('Paid yearly')}
      {c.prorateOnLop && chip('Cut for leave without pay')}
    </Box>
  );
}

export default function PayComponents() {
  const can = useCan();
  const toast = useToast();
  const [data, setData] = useState<ComponentList | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [editing, setEditing] = useState<PayComponent | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<PayComponent | null>(null);

  const load = useCallback(() => {
    payrollApi.components().then((d) => { setData(d); setError(null); }).catch(setError);
  }, []);
  useEffect(load, [load]);

  const lawWords = useMemo(() => new Map((data?.statutoryKeys ?? []).map((k) => [k.key, k.label])), [data]);
  const groups = useMemo(() => KIND_ORDER.map((k) => ({ kind: k, items: (data?.components ?? []).filter((c) => c.kind === k) })), [data]);

  const open = (c: PayComponent | null, kind?: ComponentKind) => {
    setEditing(c);
    setDraft(c ? draftOf(c) : blank(kind));
  };
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  if (!data) {
    return (
      <>
        <PageHeader title="Pay components" />
        {error ? <ErrorNotice error={error} onRetry={load} /> : <ListSkeleton rows={8} />}
      </>
    );
  }

  const earning = draft?.kind === 'EARNING';
  const law = !!editing?.statutoryKey;

  return (
    <Box sx={{ maxWidth: 1100 }}>
      <PageHeader
        title="Pay components"
        subtitle="What a salary is made of, and how each part is treated"
        actions={can.payroll.edit && data.components.length > 0 ? (
          <Button variant="contained" startIcon={<AddRounded />} onClick={() => open(null)} data-action="new-component">New component</Button>
        ) : undefined}
      />
      <ErrorNotice error={error} onRetry={load} sx={{ mb: 2 }} />
      {data.components.length === 0 && <SetupPayrollCard canEdit={can.payroll.edit} onDone={load} />}

      <Stack spacing={2}>
        {groups.filter((g) => g.items.length || data.components.length).map((g) => (
          <SectionCard
            key={g.kind}
            title={KIND_PLURAL[g.kind]}
            subtitle={g.kind === 'DEDUCTION' ? 'Taken from the pay — not part of the CTC.' : 'Part of the CTC.'}
            actions={can.payroll.edit ? (
              <Button size="small" startIcon={<AddRounded />} onClick={() => open(null, g.kind)} data-action={`add-component-${g.kind}`}>
                Add {KIND_WORD[g.kind].toLowerCase()}
              </Button>
            ) : undefined}
          >
            {g.items.length === 0 ? (
              <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>None yet.</Typography>
            ) : (
              <Box>
                {g.items.map((c) => (
                  <Box
                    key={c.id}
                    data-component={c.code}
                    sx={{
                      display: 'flex', gap: 1.5, alignItems: 'flex-start', py: 1.1, flexWrap: 'wrap',
                      borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 },
                      opacity: c.status === 'INACTIVE' ? 0.7 : 1,
                    }}
                  >
                    <Box sx={{ flex: '1 1 240px', minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
                        <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{c.name}</Typography>
                        <Mono sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{c.code}</Mono>
                        {!!c.structureCount && (
                          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                            in {c.structureCount} structure{c.structureCount === 1 ? '' : 's'}
                          </Typography>
                        )}
                      </Box>
                      {c.description && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{c.description}</Typography>}
                      <Box sx={{ mt: 0.5 }}><Flags c={c} lawWord={c.statutoryKey ? lawWords.get(c.statutoryKey) : undefined} /></Box>
                    </Box>
                    {(can.payroll.edit || can.payroll.remove) && (
                      <RowActions
                        name={c.name}
                        onEdit={can.payroll.edit ? () => open(c) : undefined}
                        onRemove={can.payroll.remove ? () => setRemoving(c) : undefined}
                        removeDisabledReason={c.statutoryKey ? 'Worked out by law in every run: make it inactive instead.' : null}
                      />
                    )}
                  </Box>
                ))}
              </Box>
            )}
          </SectionCard>
        ))}
      </Stack>

      <FormDialog
        open={!!draft}
        title={editing ? `Change ${editing.name}` : 'New component'}
        subtitle={law ? 'Worked out by law: its kind cannot change.' : undefined}
        onClose={() => setDraft(null)}
        submitDisabled={!draft?.name.trim() || !draft?.code.trim()}
        onSubmit={async () => {
          if (!draft) return;
          if (editing) await payrollApi.updateComponent(editing.id, bodyOf(draft, editing));
          else await payrollApi.createComponent(bodyOf(draft, null));
          toast.success(editing ? 'Component saved.' : 'Component added.');
          load();
        }}
      >
        {draft && (
          <Stack spacing={1.5}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 2fr' }, gap: 1.5 }}>
              <TextField
                size="small" label="Code" required value={draft.code}
                onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })}
                helperText="What a formula names: BASIC, HRA."
                inputProps={{ maxLength: 30 }}
              />
              <TextField size="small" label="Name" required value={draft.name} onChange={(e) => set({ name: e.target.value })} inputProps={{ maxLength: 120 }} />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
              <TextField select size="small" label="Kind" value={draft.kind} disabled={law} onChange={(e) => {
                const kind = e.target.value as ComponentKind;
                set(kind === 'EARNING' ? { kind } : { kind, inPfWage: false, inEsiWage: false });
              }}>
                {KIND_ORDER.map((k) => <MenuItem key={k} value={k}>{KIND_WORD[k]}</MenuItem>)}
              </TextField>
              <TextField select size="small" label="Paid" value={draft.frequency} onChange={(e) => set({ frequency: e.target.value as Draft['frequency'] })}
                helperText={draft.frequency === 'YEARLY' ? 'Part of CTC at a twelfth a month; paid as a one-time item when due.' : undefined}>
                <MenuItem value="MONTHLY">Every month</MenuItem>
                <MenuItem value="YEARLY">Once a year</MenuItem>
              </TextField>
              <TextField select size="small" label="Income tax" value={draft.taxable} onChange={(e) => set({ taxable: e.target.value as Draft['taxable'] })}>
                <MenuItem value="YES">Taxable</MenuItem>
                <MenuItem value="PARTLY">Partly taxable (an exemption applies)</MenuItem>
                <MenuItem value="NO">Not taxable</MenuItem>
              </TextField>
              <TextField select size="small" label="Exemption" value={draft.exemptionRule} disabled={draft.taxable !== 'PARTLY'}
                onChange={(e) => set({ exemptionRule: e.target.value })} SelectProps={{ displayEmpty: true }} slotProps={{ inputLabel: { shrink: true } }}>
                <MenuItem value="">None</MenuItem>
                {data.exemptionRules.map((r) => <MenuItem key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase().replace(/_/g, ' ')}</MenuItem>)}
              </TextField>
            </Box>
            <Box>
              <FormControlLabel control={<Checkbox size="small" checked={draft.inPfWage} disabled={!earning} onChange={(e) => set({ inPfWage: e.target.checked })} />} label="Counts toward the PF wage" />
              <FormControlLabel control={<Checkbox size="small" checked={draft.inEsiWage} disabled={!earning} onChange={(e) => set({ inEsiWage: e.target.checked })} />} label="Counts toward the ESI wage" />
              <FormControlLabel control={<Checkbox size="small" checked={draft.inGratuityWage} onChange={(e) => set({ inGratuityWage: e.target.checked })} />} label="Counts toward the gratuity wage" />
              <FormControlLabel control={<Checkbox size="small" checked={draft.prorateOnLop} onChange={(e) => set({ prorateOnLop: e.target.checked })} />} label="Cut for days of leave without pay" />
              {!earning && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>Only an earning counts toward the PF or ESI wage.</Typography>}
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
              <TextField size="small" label="Order" type="number" value={draft.sortOrder} onChange={(e) => set({ sortOrder: e.target.value })} helperText="Smaller comes first on the payslip." />
              <TextField select size="small" label="Status" value={draft.status} onChange={(e) => set({ status: e.target.value as Draft['status'] })}>
                <MenuItem value="ACTIVE">Active</MenuItem>
                <MenuItem value="INACTIVE">Inactive — not offered for new lines or items</MenuItem>
              </TextField>
            </Box>
            <TextField size="small" label="Description (optional)" multiline minRows={2} value={draft.description} onChange={(e) => set({ description: e.target.value })} inputProps={{ maxLength: 500 }} />
          </Stack>
        )}
      </FormDialog>

      <ConfirmDialog
        open={!!removing}
        title="Remove this component?"
        entityName={removing ? `${removing.code} — ${removing.name}` : undefined}
        body="A component a structure or a payroll run uses cannot be removed; make it inactive instead."
        confirmLabel="Remove"
        danger
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          await payrollApi.removeComponent(removing.id);
          toast.success('Component removed.');
          load();
        }}
      />
    </Box>
  );
}
