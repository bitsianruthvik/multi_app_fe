/**
 * Payroll › Claim types and policy (payroll P3b).
 *
 *   Payroll policy  the company's choices that are not law: what one hour of overtime pays, what one day of
 *                   leave encashed on leaving pays, what one day of notice pay is (formulas in the salary
 *                   structure language, the default shown beside each), what happens to an unclaimed flexible
 *                   balance at the year end, and whether a claim goes to the manager first.
 *   Claim types     the company's list of what people may claim against bills: a yearly limit, how it is taxed,
 *                   bills needed, flexible (part of pay). "Add the usual ones" makes the ready-made types.
 *
 * Payroll view reads; payroll edit changes; payroll remove removes a type nobody has claimed.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import {
  Box, Button, Checkbox, FormControlLabel, IconButton, MenuItem, Stack, Switch, TextField, Tooltip, Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import EditOutlined from '@mui/icons-material/EditOutlined';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import AutoFixHighOutlined from '@mui/icons-material/AutoFixHighOutlined';
import {
  ConfirmDialog, EmptyState, ErrorNotice, FormDialog, ListSkeleton, PageHeader, SectionCard, ToneBadge, errorMessage, useToast,
} from '@shared/ui';
import { useCan } from '../access/can';
import {
  TREATMENT_WORD, claimTypesApi, policyApi,
  type ClaimType, type ClaimTypeInput, type FlexiYearEnd, type PayrollPolicy, type PolicyValues, type TaxTreatment,
} from '../api/payrollExit';
import { parseAmount, rupees, stampDay } from '../components/payroll/payWords';

export default function PayrollClaimTypes() {
  const { company = '' } = useParams<{ company: string }>();
  const can = useCan();
  return (
    <Box sx={{ maxWidth: 1000 }}>
      <PageHeader
        title="Claim types and policy"
        subtitle="What people may claim against bills, and the payroll choices that are the company’s own."
        actions={can.named.payView ? <Button component={RouterLink} to={`/${company}/cf_hrms/payroll-claims`} variant="outlined">Claims</Button> : undefined}
      />
      <Stack spacing={2}>
        <PolicyCard canEdit={can.payroll.edit} />
        <TypesCard canEdit={can.payroll.edit} canRemove={can.payroll.remove} />
      </Stack>
    </Box>
  );
}

/* ── policy ───────────────────────────────────────────────────────────── */

const FORMULAS: { key: 'overtimeRateFormula' | 'encashRateFormula' | 'noticeRateFormula'; label: string; what: string }[] = [
  { key: 'overtimeRateFormula', label: 'One hour of overtime', what: 'at 1× — the attendance policy’s multiplier is applied on top' },
  { key: 'encashRateFormula', label: 'One day of leave encashed on leaving', what: 'in the full and final' },
  { key: 'noticeRateFormula', label: 'One day of notice pay', what: 'recovered for notice not served, or paid when the company cuts it short' },
];

function PolicyCard({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const [policy, setPolicy] = useState<PayrollPolicy | null>(null);
  const [draft, setDraft] = useState<PolicyValues | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const adopt = (p: PayrollPolicy) => {
    setPolicy(p);
    setDraft({ overtimeRateFormula: p.overtimeRateFormula, encashRateFormula: p.encashRateFormula, noticeRateFormula: p.noticeRateFormula, flexiYearEnd: p.flexiYearEnd, claimsManagerFirst: p.claimsManagerFirst });
  };
  const load = useCallback(() => { policyApi.get().then((p) => { adopt(p); setError(null); }).catch(setError); }, []);
  useEffect(load, [load]);

  const changed = !!policy && !!draft && (Object.keys(draft) as (keyof PolicyValues)[]).some((k) => draft[k] !== policy[k]);
  const set = <K extends keyof PolicyValues>(k: K, v: PolicyValues[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  const save = async () => {
    if (!draft || !policy) return;
    setBusy(true);
    setSaveError(null);
    try {
      const body: Partial<PolicyValues> = {};
      (Object.keys(draft) as (keyof PolicyValues)[]).forEach((k) => { if (draft[k] !== policy[k]) (body as Record<string, unknown>)[k] = draft[k]; });
      adopt(await policyApi.save(body));
      toast.success('Payroll policy saved. It counts from the next calculation.');
    } catch (e) {
      setSaveError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      title="Payroll policy"
      subtitle={policy?.updatedAt ? `Changed ${stampDay(policy.updatedAt)}.` : 'The defaults are in use.'}
    >
      <ErrorNotice error={error} onRetry={load} />
      {!policy && !error && <ListSkeleton rows={3} />}
      {policy && draft && (
        <Stack spacing={2} data-payroll-policy="">
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
            Formulas use component codes (their monthly amount in the person’s salary), GROSS, CTC and CTC_ANNUAL, with + − × ÷, %, min, max and round.
          </Typography>
          {FORMULAS.map((f) => (
            <Box key={f.key}>
              <TextField
                size="small"
                fullWidth
                label={`${f.label} pays`}
                value={draft[f.key]}
                disabled={!canEdit}
                onChange={(e) => set(f.key, e.target.value)}
                InputProps={{ sx: { fontFamily: 'var(--font-mono)', fontSize: 13.5 } }}
                helperText={`${f.what}. Default: ${policy.defaults[f.key]}`}
                data-field={f.key}
              />
              {canEdit && draft[f.key] !== policy.defaults[f.key] && (
                <Button size="small" sx={{ ml: -0.75 }} onClick={() => set(f.key, policy.defaults[f.key])}>Use the default</Button>
              )}
            </Box>
          ))}
          <TextField
            select
            size="small"
            label="A flexible balance not claimed by the year end"
            value={draft.flexiYearEnd}
            disabled={!canEdit}
            onChange={(e) => set('flexiYearEnd', e.target.value as FlexiYearEnd)}
            helperText={`Default: ${policy.defaults.flexiYearEnd === 'LAPSE' ? 'lapses' : 'paid, taxed'}.`}
            sx={{ maxWidth: 520 }}
          >
            <MenuItem value="PAY_TAXABLE">Is paid in the March payroll, taxed like salary</MenuItem>
            <MenuItem value="LAPSE">Lapses</MenuItem>
          </TextField>
          <FormControlLabel
            control={<Switch checked={draft.claimsManagerFirst} disabled={!canEdit} onChange={(e) => set('claimsManagerFirst', e.target.checked)} />}
            label={(
              <Box>
                <Typography sx={{ fontSize: 14 }}>A claim goes to the person’s manager first</Typography>
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>The manager looks at it in Approvals; HR approves the amount. Off: claims come straight to HR.</Typography>
              </Box>
            )}
            sx={{ alignItems: 'flex-start', '& .MuiSwitch-root': { mt: -0.5 } }}
          />
          <ErrorNotice error={saveError} />
          {canEdit && (
            <Stack direction="row" spacing={1}>
              <Button variant="contained" disabled={!changed || busy} onClick={() => void save()} data-action="save-policy">{busy ? 'Saving…' : 'Save policy'}</Button>
              {changed && <Button disabled={busy} onClick={() => adopt(policy)}>Undo changes</Button>}
            </Stack>
          )}
        </Stack>
      )}
    </SectionCard>
  );
}

/* ── claim types ──────────────────────────────────────────────────────── */

function TypesCard({ canEdit, canRemove }: { canEdit: boolean; canRemove: boolean }) {
  const toast = useToast();
  const [data, setData] = useState<{ types: ClaimType[]; treatments: TaxTreatment[]; readyMade: string[] } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [edit, setEdit] = useState<{ type: ClaimType | null } | null>(null);
  const [remove, setRemove] = useState<ClaimType | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => { claimTypesApi.list().then((d) => { setData(d); setError(null); }).catch(setError); }, []);
  useEffect(load, [load]);

  const missingReady = (data?.readyMade ?? []).filter((code) => !data?.types.some((t) => t.code === code));
  const setup = async () => {
    setBusy(true);
    try {
      const r = await claimTypesApi.setup();
      toast.success(r.made.length ? `Added: ${r.made.join(', ')}. Check the limits and the tax words with your CA.` : 'The usual types are there already.');
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      title="Claim types"
      subtitle="What people may claim from My pay › Claims."
      actions={canEdit ? (
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          {missingReady.length > 0 && <Button size="small" variant="outlined" startIcon={<AutoFixHighOutlined />} disabled={busy} onClick={() => void setup()} data-action="claim-types-setup">Add the usual ones</Button>}
          <Button size="small" variant="contained" startIcon={<AddRounded />} onClick={() => setEdit({ type: null })}>Add a type</Button>
        </Stack>
      ) : undefined}
    >
      <ErrorNotice error={error} onRetry={load} />
      {!data && !error && <ListSkeleton rows={3} />}
      {data && data.types.length === 0 && (
        <EmptyState title="No claim types yet" hint={canEdit ? '“Add the usual ones” makes fuel, phone, leave travel, meals and books — change their limits after.' : 'Someone with payroll edit adds them.'} />
      )}
      {data && data.types.length > 0 && (
        <Box data-claim-types={data.types.length}>
          {data.types.map((t) => (
            <Box key={t.id} sx={{ py: 1.25, borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 }, opacity: t.status === 'ACTIVE' ? 1 : 0.65 }}>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                <Typography sx={{ flex: '1 1 200px', minWidth: 0, fontSize: 14, fontWeight: 600 }}>
                  {t.name} <Box component="span" sx={{ fontFamily: 'var(--font-mono)', fontWeight: 400, fontSize: 12, color: 'var(--c-text-3)' }}>{t.code}</Box>
                </Typography>
                <ToneBadge tone={t.taxTreatment === 'TAXABLE' ? 'warning' : 'info'} label={TREATMENT_WORD[t.taxTreatment] ?? t.taxTreatment} noIcon />
                {t.status !== 'ACTIVE' && <ToneBadge tone="neutral" label="Not in use" noIcon />}
                {canEdit && <Tooltip title="Change"><IconButton size="small" onClick={() => setEdit({ type: t })}><EditOutlined fontSize="small" /></IconButton></Tooltip>}
                {canRemove && <Tooltip title="Remove"><IconButton size="small" onClick={() => setRemove(t)}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>}
              </Box>
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                {t.yearlyLimit != null ? `Up to ${rupees(t.yearlyLimit)} a year` : 'No yearly limit'}
                {t.billsNeeded ? ' · bills needed' : ' · no bills needed'}
                {t.flexible ? ' · flexible (part of pay)' : ''}
              </Typography>
              {t.description && <Typography sx={{ fontSize: 12.5, overflowWrap: 'anywhere' }}>{t.description}</Typography>}
              {t.taxRule && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', overflowWrap: 'anywhere' }}>{t.taxRule}</Typography>}
            </Box>
          ))}
        </Box>
      )}
      {edit && data && (
        <TypeDialog
          type={edit.type}
          treatments={data.treatments}
          onClose={() => setEdit(null)}
          onSaved={() => { toast.success('Claim type saved.'); load(); }}
        />
      )}
      <ConfirmDialog
        open={!!remove}
        title="Remove this claim type?"
        entityName={remove ? `${remove.name} (${remove.code})` : undefined}
        body="Only a type nobody has claimed can go. Otherwise mark it “not in use”."
        confirmLabel="Remove"
        danger
        onClose={() => setRemove(null)}
        onConfirm={async () => { if (!remove) return; await claimTypesApi.remove(remove.id); toast.success('Removed.'); load(); }}
      />
    </SectionCard>
  );
}

function TypeDialog({ type, treatments, onClose, onSaved }: { type: ClaimType | null; treatments: TaxTreatment[]; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState(type?.code ?? '');
  const [name, setName] = useState(type?.name ?? '');
  const [limit, setLimit] = useState(type?.yearlyLimit != null ? String(type.yearlyLimit) : '');
  const [treatment, setTreatment] = useState<TaxTreatment>(type?.taxTreatment ?? 'EXEMPT');
  const [rule, setRule] = useState(type?.taxRule ?? '');
  const [bills, setBills] = useState(type?.billsNeeded ?? true);
  const [flexible, setFlexible] = useState(type?.flexible ?? false);
  const [active, setActive] = useState((type?.status ?? 'ACTIVE') === 'ACTIVE');
  const [description, setDescription] = useState(type?.description ?? '');

  return (
    <FormDialog
      open
      title={type ? `Change ${type.name}` : 'Add a claim type'}
      maxWidth="sm"
      onClose={onClose}
      enterSubmits={false}
      submitDisabled={!name.trim() || (!type && !code.trim())}
      onSubmit={async () => {
        const amt = parseAmount(limit);
        if (amt != null && !Number.isFinite(amt)) throw new Error('The yearly limit is not a number.');
        const body: ClaimTypeInput = {
          ...(type ? {} : { code: code.trim().toUpperCase() }),
          name: name.trim(), yearlyLimit: amt, taxTreatment: treatment, taxRule: rule.trim() || null,
          billsNeeded: bills, flexible, description: description.trim() || null,
          ...(type ? { status: active ? 'ACTIVE' : 'INACTIVE' } : {}),
        };
        if (type) await claimTypesApi.update(type.id, body); else await claimTypesApi.create(body);
        onSaved();
      }}
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '140px 1fr' }, gap: 1.5 }}>
        <TextField size="small" label="Code" value={code} disabled={!!type} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="FUEL" />
        <TextField size="small" label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Fuel and conveyance" />
      </Box>
      <TextField size="small" label="Yearly limit (empty: no limit)" value={limit} onChange={(e) => setLimit(e.target.value.replace(/[₹,\s]/g, ''))} inputProps={{ inputMode: 'decimal' }} helperText="A person, a tax year. Claims waiting and approved both count." />
      <TextField select size="small" label="Tax" value={treatment} onChange={(e) => setTreatment(e.target.value as TaxTreatment)}>
        {treatments.map((t) => <MenuItem key={t} value={t}>{TREATMENT_WORD[t] ?? t}</MenuItem>)}
      </TextField>
      <TextField size="small" label="The tax rule, in words (for HR and the CA)" value={rule} onChange={(e) => setRule(e.target.value)} multiline minRows={2} />
      <TextField size="small" label="What it covers (people see this)" value={description} onChange={(e) => setDescription(e.target.value)} multiline minRows={2} />
      <Stack>
        <FormControlLabel control={<Checkbox size="small" checked={bills} onChange={(e) => setBills(e.target.checked)} />} label="Bills needed" />
        <FormControlLabel control={<Checkbox size="small" checked={flexible} onChange={(e) => setFlexible(e.target.checked)} />} label="Flexible — part of pay; what is not claimed by the year end follows the policy" />
        {type && <FormControlLabel control={<Checkbox size="small" checked={active} onChange={(e) => setActive(e.target.checked)} />} label="In use (people can claim it)" />}
      </Stack>
    </FormDialog>
  );
}
