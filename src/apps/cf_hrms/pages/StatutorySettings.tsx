/**
 * Payroll › Statutory settings (CF_HRMS_HIRING_SPEC.md §25.2, §36.1) — the company's payroll
 * settings (state, the bank account salaries are paid from), its CHOICES within the law (PF basis for
 * new salaries, registration numbers, bonus rate — editable), and the LAW: every published version of
 * PF, ESI, professional tax and LWF, newest first, each with its source and verified flag.
 *
 * The law is READ-ONLY here: it is product-level data kept by the product team for every company
 * (services/law). A change of law is a new version from its date, published there. The company may
 * record its own note and "checked by our CA" mark against a version. Nothing in the run knows a
 * rate: it reads the version in force on the 1st of its month, for the person's state.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Link, MenuItem, Stack, TextField, Typography } from '@mui/material';
import {
  Callout, ErrorNotice, ListSkeleton, PageHeader, SectionCard, ToneBadge, useCompanySlug, useToast,
} from '@shared/ui';
import { useCan } from '../access/can';
import { payrollApi, type PaySettings, type StatutoryKind, type StatutoryList, type StatutoryRow } from '../api/payroll';
import { lawApi, type LawChoices, type LawRule } from '../api/law';
import { STATUTORY_KIND_WORD } from '../components/payroll/payWords';
import { LawChoicesCard, StatutoryValues } from '../components/law/LawParts';
import { longDay } from '../components/jobDates';

const KINDS: StatutoryKind[] = ['PF', 'ESI', 'PT', 'LWF'];
function CompanyCard({ data, canEdit, onSaved }: { data: StatutoryList; canEdit: boolean; onSaved: (c: PaySettings) => void }) {
  const toast = useToast();
  const [d, setD] = useState(() => ({
    stateCode: data.company.stateCode, debitAccountNo: data.company.debitAccountNo ?? '', debitIfsc: data.company.debitIfsc ?? '', narration: data.company.narration ?? 'Salary',
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const dirty = d.stateCode !== data.company.stateCode || d.debitAccountNo !== (data.company.debitAccountNo ?? '')
    || d.debitIfsc !== (data.company.debitIfsc ?? '') || d.narration !== (data.company.narration ?? 'Salary');

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const { company } = await payrollApi.putSettings({
        stateCode: d.stateCode, debitAccountNo: d.debitAccountNo.trim() || null, debitIfsc: d.debitIfsc.trim().toUpperCase() || null, narration: d.narration.trim() || 'Salary',
      });
      toast.success('Payroll settings saved.');
      onSaved(company);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      title="The company’s payroll settings"
      subtitle="The company’s state: its professional tax and LWF apply to anyone whose location has no state of its own (Organisation › Locations). The bank account goes into the bank file."
      actions={canEdit ? <Button variant="contained" size="small" onClick={() => void save()} disabled={!dirty || busy}>{busy ? 'Saving…' : 'Save'}</Button> : undefined}
    >
      <ErrorNotice error={error} sx={{ mb: 1.5 }} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr 1fr' }, gap: 1.5 }}>
        <TextField select size="small" label="State" value={d.stateCode} disabled={!canEdit} onChange={(e) => setD({ ...d, stateCode: e.target.value })}>
          {data.states.filter((s) => s.code !== 'IN').map((s) => <MenuItem key={s.code} value={s.code}>{s.name}</MenuItem>)}
          {!data.states.some((s) => s.code === d.stateCode) && <MenuItem value={d.stateCode}>{d.stateCode}</MenuItem>}
        </TextField>
        <TextField size="small" label="Paid from account" value={d.debitAccountNo} disabled={!canEdit} onChange={(e) => setD({ ...d, debitAccountNo: e.target.value })} inputProps={{ maxLength: 40 }} />
        <TextField size="small" label="IFSC of that account" value={d.debitIfsc} disabled={!canEdit} onChange={(e) => setD({ ...d, debitIfsc: e.target.value.toUpperCase() })} inputProps={{ maxLength: 11 }} placeholder="SBIN0001234" />
        <TextField size="small" label="Narration" value={d.narration} disabled={!canEdit} onChange={(e) => setD({ ...d, narration: e.target.value })} inputProps={{ maxLength: 60 }} helperText="The bank file adds the month." />
      </Box>
    </SectionCard>
  );
}

/** A law version: read-only; the company's own "checked" mark can be set. */
function LawRow({ r, inForce, canNote, onNoted }: { r: StatutoryRow; inForce: boolean; canNote: boolean; onNoted: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const checked = r.companyNote?.verification === 'VERIFIED';
  const mark = async () => {
    setBusy(true);
    try {
      await payrollApi.noteStatutory(r.id, { verification: checked ? 'UNVERIFIED' : 'VERIFIED' });
      toast.success(checked ? 'Your “checked” mark is taken off.' : 'Marked as checked by your company.');
      onNoted();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Box data-statutory={r.id} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', flexWrap: 'wrap', py: 1.25, borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 } }}>
      <Box sx={{ flex: '1 1 280px', minWidth: 0 }}>
        <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap', mb: 0.5 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 600 }}>From {longDay(r.effectiveFrom)}</Typography>
          {r.version != null && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>version {r.version}</Typography>}
          {inForce && <ToneBadge tone="success" label="In force today" noIcon />}
          <ToneBadge tone={r.verification === 'VERIFIED' ? 'success' : 'warning'} label={r.verification === 'VERIFIED' ? 'Verified' : 'Not verified'} noIcon />
          {checked && <ToneBadge tone="info" label="Checked by your company" noIcon />}
        </Box>
        <StatutoryValues kind={r.kind} s={r.settings} />
        {r.source && (
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.75, overflowWrap: 'anywhere' }}>
            Source: {r.source}
            {r.sourceUrl && <> {' '}<Link href={r.sourceUrl} target="_blank" rel="noopener noreferrer">Open the source</Link></>}
          </Typography>
        )}
        {r.note && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mt: 0.5, overflowWrap: 'anywhere' }}>Note: {r.note}</Typography>}
      </Box>
      {canNote && (
        <Button size="small" onClick={() => void mark()} disabled={busy} data-action={`check-statutory-${r.id}`}>
          {checked ? 'Take off our “checked”' : 'Mark checked by us'}
        </Button>
      )}
    </Box>
  );
}

export default function StatutorySettings() {
  const can = useCan();
  const slug = useCompanySlug();
  const [data, setData] = useState<StatutoryList | null>(null);
  const [choices, setChoices] = useState<{ choices: LawChoices; bonus: LawRule | null } | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    payrollApi.statutory().then((d) => { setData(d); setError(null); }).catch(setError);
    lawApi.choices().then((c) => setChoices({ choices: c.choices, bonus: c.law.bonus })).catch(setError);
  }, []);
  useEffect(load, [load]);

  const groups = useMemo(() => {
    const rows = data?.settings ?? [];
    return KINDS.map((kind) => {
      const ofKind = rows.filter((r) => r.kind === kind);
      const states = [...new Set(ofKind.map((r) => r.stateCode))];
      return { kind, states: states.map((st) => ({ st, rows: ofKind.filter((r) => r.stateCode === st).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)) })) };
    });
  }, [data]);
  const stateName = (code: string) => data?.states.find((s) => s.code === code)?.name ?? code;

  if (!data) {
    return (
      <>
        <PageHeader title="Statutory settings" />
        {error ? <ErrorNotice error={error} onRetry={load} /> : <ListSkeleton rows={8} />}
      </>
    );
  }

  return (
    <Box sx={{ maxWidth: 1100 }}>
      <PageHeader title="Statutory settings" subtitle="Your payroll settings and choices; PF, ESI, professional tax and LWF as the law says, each with its source" />
      <ErrorNotice error={error} onRetry={load} sx={{ mb: 2 }} />
      <Stack spacing={2}>
        <CompanyCard key={data.company.updatedAt ?? 'new'} data={data} canEdit={can.payroll.edit} onSaved={(company) => setData({ ...data, company })} />
        {choices && (
          <LawChoicesCard key={JSON.stringify(choices.choices)} choices={choices.choices} bonus={choices.bonus} canEdit={can.payroll.edit}
            onSaved={(c) => setChoices({ ...choices, choices: c })} />
        )}

        <Callout title="The law is kept for you">
          {data.readOnlyWhy ?? 'The law is kept by the product team for every company.'} A change of law is a new version from its date: you are told, and the run takes it from that month.
          {' '}<Link component={RouterLink} to={`/${slug}/cf_hrms/rules-in-force`}>See every rule in force</Link> (minimum wages, bonus, gratuity, overtime, leave, income tax).
        </Callout>
        {data.unverified > 0 && (
          <Callout tone="warning" title={`${data.unverified} rule${data.unverified === 1 ? ' is' : 's are'} not verified`}>
            A value that could not be confirmed on an official page is marked “Not verified”. Check it with your CA; you can mark a version as checked by your company.
          </Callout>
        )}

        {groups.map((g) => (
          <SectionCard key={g.kind} title={STATUTORY_KIND_WORD[g.kind]} subtitle={g.kind === 'PF' || g.kind === 'ESI' ? 'The same in every state.' : 'By the state a person works in (their location), else the company’s state.'}>
            {g.states.length === 0 ? (
              <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>No rule for your states yet.</Typography>
            ) : (
              <Stack spacing={2}>
                {g.states.map(({ st, rows }) => (
                  <Box key={st}>
                    {(g.kind === 'PT' || g.kind === 'LWF') && (
                      <Typography sx={{ fontSize: 12, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 0.5 }}>{stateName(st)}</Typography>
                    )}
                    {rows.map((r) => <LawRow key={r.id} r={r} inForce={data.inForce[r.kind] === r.id} canNote={can.payroll.edit} onNoted={load} />)}
                  </Box>
                ))}
              </Stack>
            )}
          </SectionCard>
        ))}
      </Stack>
    </Box>
  );
}
