/**
 * One salary structure — its formula editor (CF_HRMS_HIRING_SPEC.md §25.2).
 *
 * Lines: a component and its formula, in order. Under them a LIVE PREVIEW: the
 * structure worked out for a sample CTC, by the server (the same code the run
 * uses), ~400 ms after the last keystroke — the amount of every line a month
 * and a year, the totals, and every problem in words. Nothing is saved until
 * "Save"; the server checks the lines again and refuses them whole.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import {
  Autocomplete, Box, Button, IconButton, MenuItem, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import {
  ConfirmDialog, DetailSkeleton, ErrorNotice, Mono, SectionCard, StatusBadge, StickyActionBar, Surface,
  useDetailTitle, useToast,
} from '@shared/ui';
import { useCan } from '../access/can';
import { payrollApi, type PayComponent, type PayStructure } from '../api/payroll';
import { BreakdownTable, Fact, ProblemList } from '../components/payroll/PayParts';
import { usePreview } from '../components/payroll/usePreview';
import { kindWord, parseAmount, rupees } from '../components/payroll/payWords';
import { ComplianceChecks } from '../components/payroll/ComplianceChecks';
import { SKILL_WORD, type SkillCategory } from '../api/law';

interface EditLine { k: number; componentId: number | null; formula: string }
interface Draft { name: string; description: string; lines: EditLine[] }

/** The statutory components a structure may hold: the employer's shares are part of CTC. */
const IN_STRUCTURE = new Set(['PF_ER', 'ESI_ER', 'LWF_ER']);
let nextKey = 1;
const draftOf = (s: PayStructure): Draft => ({
  name: s.name,
  description: s.description ?? '',
  lines: [...s.lines].sort((a, b) => a.sortOrder - b.sortOrder).map((l) => ({ k: nextKey++, componentId: l.componentId, formula: l.formula })),
});
const linesOf = (d: Draft) => d.lines.filter((l) => l.componentId != null).map((l) => ({ componentId: l.componentId as number, formula: l.formula.trim() }));
const payloadOf = (d: Draft) => ({ name: d.name.trim(), description: d.description.trim() || null, lines: linesOf(d) });

function FormulaHelp() {
  const row = (a: string, b: string) => (
    <Box key={a} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '190px 1fr' }, gap: { xs: 0, sm: 1.5 }, py: 0.4 }}>
      <Mono sx={{ fontSize: 12.5 }}>{a}</Mono>
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{b}</Typography>
    </Box>
  );
  return (
    <SectionCard title="How to write a formula" subtitle="Every amount is a month’s.">
      {[
        ['1600', 'A number of rupees. No commas: write 15000.'],
        ['40% of CTC', 'A percent of something. “of” multiplies.'],
        ['+  −  ×  ÷  ( )', 'Add, take away, multiply (* or ×), divide (/ or ÷), brackets.'],
        ['min(BASIC, 15000)', 'The smaller of two or more values. max( … ) the larger.'],
        ['round(x)', 'To the rupee. round(x, 2) to paise, round(x, -2) to the hundred.'],
        ['CTC', 'The monthly cost to company (a year ÷ 12).'],
        ['CTC_ANNUAL', 'The yearly cost to company.'],
        ['PF_CEILING, ESI_CEILING', 'The ceilings in force (Statutory settings).'],
        ['BASIC, HRA …', 'The amount of another line of this structure, by its code.'],
        ['balance', 'Alone: what is left of CTC after every other line of CTC. One line at most.'],
      ].map(([a, b]) => row(a, b))}
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mt: 1 }}>
        Deductions are not part of CTC. PF, ESI, professional tax and TDS of the employee are worked out by each run — leave them out.
      </Typography>
    </SectionCard>
  );
}

export default function PayStructureDetail() {
  const { company = '', id = '' } = useParams<{ company: string; id: string }>();
  const structureId = Number(id);
  const navigate = useNavigate();
  const toast = useToast();
  const can = useCan();
  const canEdit = can.payroll.edit;

  const [structure, setStructure] = useState<PayStructure | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [components, setComponents] = useState<PayComponent[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [sample, setSample] = useState('600000');
  const [removing, setRemoving] = useState(false);
  // Spec §36.2: the live compliance check — for the sample CTC, a skill and a minimum-wage zone.
  const [skill, setSkill] = useState<SkillCategory>('UNSKILLED');
  const [zone, setZone] = useState('');
  const [ackReason, setAckReason] = useState('');

  const adopt = useCallback((s: PayStructure) => { setStructure(s); setDraft(draftOf(s)); }, []);
  const load = useCallback(() => {
    setError(null);
    payrollApi.structure(structureId).then((r) => adopt(r.structure)).catch(setError);
    payrollApi.components().then((r) => setComponents(r.components)).catch(() => setComponents([]));
  }, [structureId, adopt]);
  useEffect(load, [load]);
  useDetailTitle(structure?.name ?? null);

  const dirty = useMemo(() => !!structure && !!draft && JSON.stringify(payloadOf(draft)) !== JSON.stringify(payloadOf(draftOf(structure))), [structure, draft]);
  useEffect(() => {
    if (!dirty) return undefined;
    const ask = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', ask);
    return () => window.removeEventListener('beforeunload', ask);
  }, [dirty]);

  const ctc = parseAmount(sample);
  const place = { skill, zone: zone.trim() || null };
  const previewInput = draft && ctc != null && Number.isFinite(ctc) ? { lines: linesOf(draft), annualCtc: ctc, place } : null;
  const { result: preview, busy: previewBusy, error: previewError } = usePreview(previewInput);

  if (!structure || !draft) {
    return error ? <ErrorNotice error={error} fallback="That salary structure could not be loaded." onRetry={load} /> : <DetailSkeleton />;
  }

  const byId = new Map(components.map((c) => [c.id, c]));
  const choosable = components.filter((c) => (c.status === 'ACTIVE' || draft.lines.some((l) => l.componentId === c.id)) && (!c.statutoryKey || IN_STRUCTURE.has(c.statutoryKey)));
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const setLine = (k: number, patch: Partial<EditLine>) => set({ lines: draft.lines.map((l) => (l.k === k ? { ...l, ...patch } : l)) });
  const move = (i: number, by: number) => {
    const next = [...draft.lines];
    const [x] = next.splice(i, 1);
    next.splice(i + by, 0, x);
    set({ lines: next });
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const reason = ackReason.trim();
      adopt((await payrollApi.updateStructure(structure.id, { ...payloadOf(draft), ...(reason ? { complianceReason: reason, sampleCtc: ctc ?? undefined, place } : {}) })).structure);
      setAckReason('');
      toast.success(reason ? 'Structure saved; its warnings accepted for every salary on it.' : 'Structure saved.');
    } catch (e) {
      setSaveError(e);
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async () => {
    try {
      const next = structure.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      const r = await payrollApi.updateStructure(structure.id, { status: next });
      setStructure(r.structure);
      toast.success(next === 'ACTIVE' ? 'The structure is active.' : 'The structure is inactive: no new salary can use it.');
    } catch (e) {
      setSaveError(e);
    }
  };

  return (
    <Box sx={{ maxWidth: 1100, pb: 8 }}>
      <Button component={RouterLink} to={`/${company}/cf_hrms/pay-structures`} size="small" startIcon={<ArrowBackRounded />} sx={{ ml: -0.75, mb: 0.5 }}>
        Salary structures
      </Button>

      <Surface e={2} sx={{ p: { xs: 2, sm: 2.5 }, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
          <Mono sx={{ fontSize: 15 }}>{structure.code}</Mono>
          <StatusBadge status={structure.status} />
          <Box sx={{ flex: 1 }} />
          {canEdit && <Button size="small" color="inherit" onClick={() => void toggleStatus()}>{structure.status === 'ACTIVE' ? 'Make inactive' : 'Make active'}</Button>}
          {can.payroll.remove && <Button size="small" color="inherit" startIcon={<DeleteOutlineRounded />} onClick={() => setRemoving(true)}>Remove</Button>}
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 2fr' }, gap: 1.5 }}>
          <TextField size="small" label="Name" required value={draft.name} disabled={!canEdit} onChange={(e) => set({ name: e.target.value })} />
          <TextField size="small" label="Description (optional)" value={draft.description} disabled={!canEdit} onChange={(e) => set({ description: e.target.value })} />
        </Box>
      </Surface>

      <ErrorNotice error={saveError} sx={{ mb: 2 }} />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.15fr) minmax(0, 1fr)' }, gap: 2, alignItems: 'start' }}>
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <SectionCard
            title="Lines"
            subtitle="A component and how its monthly amount is worked out."
            actions={canEdit ? (
              <Button size="small" startIcon={<AddRounded />} onClick={() => set({ lines: [...draft.lines, { k: nextKey++, componentId: null, formula: '' }] })} data-action="add-line">
                Add a line
              </Button>
            ) : undefined}
          >
            {draft.lines.length === 0 && <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>No lines yet. Add one for each part of the CTC.</Typography>}
            <Stack spacing={1.25}>
              {draft.lines.map((l, i) => {
                const comp = l.componentId != null ? byId.get(l.componentId) ?? null : null;
                const taken = new Set(draft.lines.filter((x) => x.k !== l.k).map((x) => x.componentId));
                return (
                  <Box key={l.k} data-line={comp?.code ?? i} sx={{
                    display: 'grid', gap: 1, alignItems: 'start',
                    gridTemplateColumns: { xs: '1fr', sm: 'minmax(170px, 0.9fr) minmax(0, 1.4fr) auto' },
                    pb: 1.25, borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0, pb: 0 },
                  }}>
                    <Autocomplete
                      size="small"
                      options={choosable.filter((c) => !taken.has(c.id))}
                      value={comp}
                      disabled={!canEdit}
                      getOptionLabel={(c) => `${c.name} (${c.code})`}
                      groupBy={(c) => kindWord(c.kind)}
                      isOptionEqualToValue={(a, b) => a.id === b.id}
                      onChange={(_, c) => setLine(l.k, { componentId: c?.id ?? null })}
                      renderInput={(p) => <TextField {...p} label="Component" />}
                    />
                    <TextField
                      size="small"
                      label="Formula"
                      value={l.formula}
                      disabled={!canEdit}
                      placeholder="40% of CTC"
                      onChange={(e) => setLine(l.k, { formula: e.target.value })}
                      inputProps={{ maxLength: 300, spellCheck: false, style: { fontFamily: 'var(--font-mono)', fontSize: 13 } }}
                      helperText={comp ? `${kindWord(comp.kind)}${comp.frequency === 'YEARLY' ? ' · paid once a year' : ''}` : undefined}
                    />
                    {canEdit && (
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <Tooltip title="Up"><span><IconButton size="small" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUpwardRounded fontSize="small" /></IconButton></span></Tooltip>
                        <Tooltip title="Down"><span><IconButton size="small" aria-label="Move down" disabled={i === draft.lines.length - 1} onClick={() => move(i, 1)}><ArrowDownwardRounded fontSize="small" /></IconButton></span></Tooltip>
                        <Tooltip title="Remove this line"><IconButton size="small" aria-label="Remove this line" onClick={() => set({ lines: draft.lines.filter((x) => x.k !== l.k) })}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Stack>
          </SectionCard>
          <FormulaHelp />
        </Stack>

        <SectionCard
          title="Preview"
          subtitle={previewBusy ? 'Working it out…' : 'Worked out the way a run would, for a sample CTC.'}
          sx={{ minWidth: 0 }}
        >
          <Stack spacing={1.5}>
            <TextField size="small" label="Sample CTC a year (₹)" value={sample} onChange={(e) => setSample(e.target.value)}
              error={ctc != null && !Number.isFinite(ctc)} helperText={ctc != null && Number.isFinite(ctc) ? `${rupees(ctc)} a year · ${rupees(Math.round(ctc / 12 * 100) / 100)} a month` : 'A number of rupees.'}
              inputProps={{ inputMode: 'decimal', 'data-field': 'sample-ctc' }} sx={{ maxWidth: 280 }} />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '200px 140px' }, gap: 1.25 }}>
              <TextField select size="small" label="Skill (minimum wage)" value={skill} onChange={(e) => setSkill(e.target.value as SkillCategory)} inputProps={{ 'data-field': 'check-skill' }}>
                {(Object.keys(SKILL_WORD) as SkillCategory[]).map((k) => <MenuItem key={k} value={k}>{SKILL_WORD[k]}</MenuItem>)}
              </TextField>
              <TextField size="small" label="Zone" value={zone} onChange={(e) => setZone(e.target.value)} placeholder="I, II, III" helperText="Empty: the company’s zone" inputProps={{ maxLength: 10, 'data-field': 'check-zone' }} />
            </Box>
            <ErrorNotice error={previewError} />
            {preview && (
              <>
                <ProblemList problems={preview.problems} warnings={preview.warnings} />
                {preview.ok && (
                  <>
                    <BreakdownTable lines={preview.lines} totals={preview.totals} monthlyCtc={preview.monthlyCtc} annualCtc={preview.annualCtc} />
                    {preview.totals && (
                      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 1.5 }}>
                        <Fact label="Earnings a month">{rupees(preview.totals.earnings)}</Fact>
                        <Fact label="Employer’s share">{rupees(preview.totals.employer)}</Fact>
                        <Fact label="Reimbursements">{rupees(preview.totals.reimbursements)}</Fact>
                        <Fact label="Lines of CTC">{rupees(preview.totals.ctcLines)}</Fact>
                      </Box>
                    )}
                  </>
                )}
                {preview.compliance && (
                  <Box data-testid="structure-compliance" sx={{ borderTop: '1px solid var(--c-divider)', pt: 1.5 }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.75 }}>
                      Compliance{preview.compliance.summary.hard ? ` — ${preview.compliance.summary.hard} breach${preview.compliance.summary.hard === 1 ? '' : 'es'} of the law` : preview.compliance.summary.warn ? ` — ${preview.compliance.summary.warn} warning${preview.compliance.summary.warn === 1 ? '' : 's'}` : ' — nothing found'}
                    </Typography>
                    <ComplianceChecks results={preview.compliance.results} empty="Nothing found against the law in force for this CTC." />
                    {canEdit && preview.compliance.summary.warn > 0 && dirty && (
                      <TextField size="small" fullWidth label="Accept the warnings for every salary on this structure (reason, optional)" value={ackReason} onChange={(e) => setAckReason(e.target.value)} sx={{ mt: 1.25 }} inputProps={{ maxLength: 500 }} />
                    )}
                  </Box>
                )}
                {preview.vars && (
                  <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                    PF_CEILING = {rupees(preview.vars.PF_CEILING)}, ESI_CEILING = {rupees(preview.vars.ESI_CEILING)} (in force today).
                  </Typography>
                )}
              </>
            )}
          </Stack>
        </SectionCard>
      </Box>

      {canEdit && (
        <StickyActionBar visible={dirty} message="This structure has changes not saved yet.">
          <Button onClick={() => setDraft(draftOf(structure))} disabled={saving}>Undo changes</Button>
          <Button variant="contained" onClick={() => void save()} disabled={saving || !draft.name.trim()}>{saving ? 'Saving…' : 'Save'}</Button>
        </StickyActionBar>
      )}

      <ConfirmDialog
        open={removing}
        title="Remove this structure?"
        entityName={`${structure.code} — ${structure.name}`}
        body="A structure a salary uses (now or in the past) cannot be removed: make it inactive instead."
        confirmLabel="Remove"
        danger
        onClose={() => setRemoving(false)}
        onConfirm={async () => {
          await payrollApi.removeStructure(structure.id);
          toast.success('Structure removed.');
          navigate(`/${company}/cf_hrms/pay-structures`);
        }}
      />
    </Box>
  );
}
