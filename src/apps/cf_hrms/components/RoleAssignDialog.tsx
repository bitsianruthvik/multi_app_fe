/**
 * Assigning content to a role — the one dialog behind all nine content kinds.
 *
 * THE RULE IT ENFORCES IN THE UI: you pick a definition, you do not type one.
 * "Define once, assign to a context" is the spec's reuse rule, and a free-text
 * box here is how a responsibility master turns into 595 near-duplicates. The
 * picker searches the master and offers a link to go and add a missing one; it
 * never accepts a name it has not seen.
 *
 * WHAT THE ASSIGNMENT ROW CARRIES is context only — the KRA it sits under, its
 * order, its weight, whether it is mandatory, its target, and the dates it
 * applies between. The wording belongs to the definition, shared with every
 * other role that carries it.
 *
 * MOVING THE EFFECTIVE-FROM DATE FORWARD on an existing row does not overwrite
 * it: the server closes the current row the day before and opens a successor
 * (plan §2 rule 8). The dialog says so, because otherwise a date field looks
 * like any other field.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Autocomplete, Box, Checkbox, FormControlLabel, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import { FormDialog, Mono, useCompanySlug } from '@shared/ui';
import {
  addContent, updateContent, listMaster, getMeta, pretty,
  type ContentKind, type ContentRow, type KraGroup, type MasterItem, type HrmsMeta, type MasterKind,
} from '../api/roles';

/** Which master a content kind draws on. Three kinds draw on none. */
const MASTER_FOR: Partial<Record<ContentKind, MasterKind>> = {
  kras: 'kras',
  responsibilities: 'responsibilities',
  kpis: 'kpis',
  skills: 'skills',
  qualifications: 'qualifications',
  authorities: 'authorities',
};

const DEFINITION_FIELD: Partial<Record<ContentKind, string>> = {
  kras: 'kraDefinitionId',
  responsibilities: 'responsibilityDefinitionId',
  kpis: 'kpiDefinitionId',
  skills: 'skillDefinitionId',
  qualifications: 'qualificationDefinitionId',
  authorities: 'authorityDefinitionId',
};

const TITLES: Record<ContentKind, { add: string; edit: string; noun: string }> = {
  kras: { add: 'Assign a KRA', edit: 'Edit KRA assignment', noun: 'KRA' },
  responsibilities: { add: 'Assign a responsibility', edit: 'Edit responsibility', noun: 'responsibility' },
  kpis: { add: 'Assign a KPI', edit: 'Edit KPI', noun: 'KPI' },
  skills: { add: 'Require a skill', edit: 'Edit skill requirement', noun: 'skill' },
  qualifications: { add: 'Require a qualification', edit: 'Edit qualification requirement', noun: 'qualification' },
  experience: { add: 'Add an experience requirement', edit: 'Edit experience requirement', noun: 'experience requirement' },
  authorities: { add: 'Grant an authority', edit: 'Edit authority', noun: 'authority' },
  relationships: { add: 'Add a relationship expectation', edit: 'Edit relationship expectation', noun: 'relationship expectation' },
  conditions: { add: 'Add a working condition', edit: 'Edit working condition', noun: 'working condition' },
};

interface State {
  definitionId: string;
  roleKraAssignmentId: string;
  weightPercent: string;
  isMandatory: boolean;
  responsibilityClassOverride: string;
  targetOperator: string;
  targetValue: string;
  targetMin: string;
  targetMax: string;
  frequencyOverride: string;
  requirementLevel: string;
  proficiencyLevel: string;
  minYears: string;
  preferredYears: string;
  experienceArea: string;
  limitAmount: string;
  limitCurrency: string;
  limitScope: string;
  limitCondition: string;
  relationshipScope: string;
  counterparty: string;
  purpose: string;
  conditionType: string;
  description: string;
  effectiveFrom: string;
  effectiveTo: string;
  notes: string;
}

const EMPTY: State = {
  definitionId: '', roleKraAssignmentId: '', weightPercent: '', isMandatory: true,
  responsibilityClassOverride: '', targetOperator: '', targetValue: '', targetMin: '', targetMax: '',
  frequencyOverride: '', requirementLevel: 'REQUIRED', proficiencyLevel: '',
  minYears: '', preferredYears: '', experienceArea: '',
  limitAmount: '', limitCurrency: 'INR', limitScope: '', limitCondition: '',
  relationshipScope: 'INTERNAL', counterparty: '', purpose: '',
  conditionType: 'OTHER', description: '', effectiveFrom: '', effectiveTo: '', notes: '',
};

function fromRow(row: ContentRow): State {
  const t = row.targetValue;
  const range = t && typeof t === 'object' ? t : null;
  return {
    ...EMPTY,
    definitionId: row.definitionId ? String(row.definitionId) : '',
    roleKraAssignmentId: row.roleKraAssignmentId ? String(row.roleKraAssignmentId) : '',
    weightPercent: row.weightPercent === null || row.weightPercent === undefined ? '' : String(row.weightPercent),
    isMandatory: row.isMandatory ?? true,
    responsibilityClassOverride: row.responsibilityClassOverride ?? '',
    targetOperator: row.targetOperator ?? '',
    targetValue: range || t === null || t === undefined ? '' : String(t),
    targetMin: range ? String(range.min) : '',
    targetMax: range ? String(range.max) : '',
    frequencyOverride: row.frequencyOverride ?? '',
    requirementLevel: row.requirementLevel ?? 'REQUIRED',
    proficiencyLevel: row.proficiencyLevel ?? '',
    minYears: row.minYears === null || row.minYears === undefined ? '' : String(row.minYears),
    preferredYears: row.preferredYears === null || row.preferredYears === undefined ? '' : String(row.preferredYears),
    experienceArea: row.experienceArea ?? '',
    limitAmount: row.limitJson?.amount === undefined ? '' : String(row.limitJson.amount),
    limitCurrency: row.limitJson?.currency ?? 'INR',
    limitScope: row.limitJson?.scope ?? '',
    limitCondition: row.limitJson?.condition ?? '',
    relationshipScope: row.relationshipScope ?? 'INTERNAL',
    counterparty: row.counterparty ?? '',
    purpose: row.purpose ?? '',
    conditionType: row.conditionType ?? 'OTHER',
    description: row.description ?? '',
    effectiveFrom: row.effectiveFrom ?? '',
    effectiveTo: row.effectiveTo ?? '',
    notes: row.notes ?? '',
  };
}

export function RoleAssignDialog({
  open,
  roleId,
  kind,
  row,
  kras,
  assigned,
  defaultKraId,
  onClose,
  onSaved,
}: {
  open: boolean;
  roleId: number;
  kind: ContentKind;
  /** Null to assign something new. */
  row: ContentRow | null;
  /** The role's own KRA assignments — the only legal groups for a responsibility or KPI. */
  kras: KraGroup[];
  /** Definition ids this role already carries for this kind. */
  assigned?: number[];
  defaultKraId?: number | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const company = useCompanySlug();
  const masterKind = MASTER_FOR[kind];
  const [form, setForm] = useState<State>(EMPTY);
  const [master, setMaster] = useState<MasterItem[]>([]);
  const [meta, setMeta] = useState<HrmsMeta | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(row ? fromRow(row) : { ...EMPTY, roleKraAssignmentId: defaultKraId ? String(defaultKraId) : '' });
    getMeta().then(setMeta).catch(() => setMeta(null));
    if (masterKind) listMaster(masterKind).then((r) => setMaster(r.items)).catch(() => setMaster([]));
  }, [open, row, kind, masterKind, defaultKraId]);

  const set = <K extends keyof State>(k: K, v: State[K]) => setForm((s) => ({ ...s, [k]: v }));
  const text = (k: keyof State) => (e: { target: { value: string } }) =>
    setForm((s) => ({ ...s, [k]: e.target.value }) as State);

  /**
   * A definition the role already carries is not offered again: the schema
   * allows one live row per (role, definition), so offering it would produce a
   * duplicate-key refusal instead of an explanation.
   */
  const taken = useMemo(() => new Set(assigned ?? []), [assigned]);
  const options = useMemo(
    () => master.filter((m) => m.status === 'ACTIVE' && !taken.has(m.id)),
    [master, taken],
  );
  const chosen = useMemo(
    () => options.find((m) => String(m.id) === form.definitionId) ?? null,
    [options, form.definitionId],
  );
  const kpiMeasurement = kind === 'kpis' ? (row?.definition?.measurementType ?? chosen?.measurementType ?? 'NUMBER') : null;

  const datedChange =
    !!row && !!form.effectiveFrom && form.effectiveFrom !== (row.effectiveFrom ?? '') &&
    (!row.effectiveFrom || form.effectiveFrom > row.effectiveFrom);

  async function submit() {
    const body: Record<string, unknown> = {
      effectiveFrom: form.effectiveFrom || null,
      effectiveTo: form.effectiveTo || null,
    };
    const defField = DEFINITION_FIELD[kind];
    if (defField && !row) body[defField] = form.definitionId ? Number(form.definitionId) : null;
    if (kind !== 'relationships' && kind !== 'conditions') body.notes = form.notes || null;

    if (kind === 'kras') {
      body.weightPercent = form.weightPercent === '' ? null : Number(form.weightPercent);
      body.isMandatory = form.isMandatory;
    }
    if (kind === 'responsibilities') {
      body.roleKraAssignmentId = form.roleKraAssignmentId ? Number(form.roleKraAssignmentId) : null;
      body.responsibilityClassOverride = form.responsibilityClassOverride || null;
      body.isMandatory = form.isMandatory;
    }
    if (kind === 'kpis') {
      body.roleKraAssignmentId = form.roleKraAssignmentId ? Number(form.roleKraAssignmentId) : null;
      body.targetOperator = form.targetOperator || null;
      body.targetValue =
        form.targetOperator === 'BETWEEN'
          ? { min: Number(form.targetMin), max: Number(form.targetMax) }
          : form.targetOperator && form.targetOperator !== 'INFO'
            ? form.targetValue
            : null;
      body.weightPercent = form.weightPercent === '' ? null : Number(form.weightPercent);
      body.frequencyOverride = form.frequencyOverride || null;
      body.isMandatory = form.isMandatory;
    }
    if (kind === 'skills') {
      body.requirementLevel = form.requirementLevel;
      body.proficiencyLevel = form.proficiencyLevel || null;
    }
    if (kind === 'qualifications') body.requirementLevel = form.requirementLevel;
    if (kind === 'experience') {
      body.minYears = form.minYears === '' ? null : Number(form.minYears);
      body.preferredYears = form.preferredYears === '' ? null : Number(form.preferredYears);
      body.experienceArea = form.experienceArea || null;
      body.requirementLevel = form.requirementLevel;
    }
    if (kind === 'authorities') {
      body.limitJson = {
        amount: form.limitAmount === '' ? undefined : Number(form.limitAmount),
        currency: form.limitAmount === '' ? undefined : form.limitCurrency || undefined,
        scope: form.limitScope || undefined,
        condition: form.limitCondition || undefined,
      };
    }
    if (kind === 'relationships') {
      body.relationshipScope = form.relationshipScope;
      body.counterparty = form.counterparty;
      body.purpose = form.purpose || null;
    }
    if (kind === 'conditions') {
      body.conditionType = form.conditionType;
      body.description = form.description;
      body.isMandatory = form.isMandatory;
    }

    if (row) {
      await updateContent(kind, row.id, body);
      onSaved(datedChange ? 'Ended the current row and opened the next one.' : 'Saved.');
    } else {
      await addContent(roleId, kind, body);
      onSaved('Assigned.');
    }
  }

  const titles = TITLES[kind];
  const dates = (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
      <TextField
        label="Effective from"
        type="date"
        value={form.effectiveFrom}
        onChange={text('effectiveFrom')}
        size="small"
        fullWidth
        slotProps={{ inputLabel: { shrink: true } }}
        helperText={
          datedChange
            ? 'This closes the current row the day before and opens a new one from this date.'
            : 'Leave empty for "always".'
        }
      />
      <TextField
        label="Effective to"
        type="date"
        value={form.effectiveTo}
        onChange={text('effectiveTo')}
        size="small"
        fullWidth
        slotProps={{ inputLabel: { shrink: true } }}
        helperText="Leave empty while it still applies."
      />
    </Stack>
  );

  return (
    <FormDialog
      open={open}
      title={row ? titles.edit : titles.add}
      subtitle={
        masterKind && !row
          ? 'Pick from the master. Content is defined once and assigned — never typed into a role.'
          : row?.definition?.name
      }
      onClose={onClose}
      onSubmit={submit}
      submitLabel={row ? 'Save' : 'Assign'}
      submitDisabled={!!masterKind && !row && !form.definitionId}
      enterSubmits={false}
      maxWidth="sm"
    >
      <Stack spacing={2} sx={{ mt: 0.5 }}>
        {masterKind && !row && (
          <>
            <Autocomplete
              options={options}
              value={chosen}
              onChange={(_, v) => set('definitionId', v ? String(v.id) : '')}
              getOptionLabel={(o) => o.name}
              renderOption={(props, o) => (
                <Box component="li" {...props} key={o.id}>
                  <Box sx={{ minWidth: 0 }}>
                    <Box sx={{ fontSize: 14 }}>{o.name}</Box>
                    {(o.description || o.code) && (
                      <Box sx={{ fontSize: 12, color: 'var(--c-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {o.code ? `${o.code} · ` : ''}
                        {o.description}
                      </Box>
                    )}
                  </Box>
                </Box>
              )}
              renderInput={(p) => <TextField {...p} label={pretty(titles.noun)} size="small" required />}
              fullWidth
            />
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: -1 }}>
              Not in the list?{' '}
              <Box component={Link} to={`/${company}/cf_hrms/${masterKind}`} sx={{ color: 'var(--c-primary-700)' }}>
                Add it to the {masterKind === 'kras' ? 'KRA' : titles.noun} master
              </Box>{' '}
              first — then it is available to every role.
            </Typography>
          </>
        )}

        {row?.definition && (
          <Box sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
            {row.definition.code && <Mono sx={{ fontSize: 12, mr: 1 }}>{row.definition.code}</Mono>}
            {row.definition.description}
          </Box>
        )}

        {(kind === 'responsibilities' || kind === 'kpis') && (
          <TextField
            label="Group under KRA"
            value={form.roleKraAssignmentId}
            onChange={text('roleKraAssignmentId')}
            select
            size="small"
            fullWidth
            helperText="Only this role's own KRAs. Ungrouped items stay visible under Additional."
          >
            <MenuItem value="">Additional (no KRA)</MenuItem>
            {kras.map((k) => (
              <MenuItem key={k.id} value={String(k.id)}>
                {k.definition?.name}
              </MenuItem>
            ))}
          </TextField>
        )}

        {kind === 'kras' && (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-start">
            <TextField
              label="Weight %"
              value={form.weightPercent}
              onChange={text('weightPercent')}
              size="small"
              sx={{ width: { sm: 160 } }}
              helperText="Optional. If used, the role's KRAs should total 100."
            />
            <FormControlLabel
              control={<Checkbox checked={form.isMandatory} onChange={(e) => set('isMandatory', e.target.checked)} />}
              label="Mandatory"
              sx={{ mt: 0.5 }}
            />
          </Stack>
        )}

        {kind === 'responsibilities' && (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-start">
            <TextField
              label="Class for this role"
              value={form.responsibilityClassOverride}
              onChange={text('responsibilityClassOverride')}
              select
              size="small"
              fullWidth
              helperText="How this role holds it. Empty means the master's own class."
            >
              <MenuItem value="">Use the master's class</MenuItem>
              {(meta?.responsibilityClasses ?? []).map((v) => (
                <MenuItem key={v} value={v}>{pretty(v)}</MenuItem>
              ))}
            </TextField>
            <FormControlLabel
              control={<Checkbox checked={form.isMandatory} onChange={(e) => set('isMandatory', e.target.checked)} />}
              label="Mandatory"
              sx={{ mt: 0.5 }}
            />
          </Stack>
        )}

        {kind === 'kpis' && (
          <>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Target"
                value={form.targetOperator}
                onChange={text('targetOperator')}
                select
                size="small"
                sx={{ width: { sm: 200 } }}
                helperText={kpiMeasurement ? `Measured as ${pretty(kpiMeasurement)}` : undefined}
              >
                <MenuItem value="">No target</MenuItem>
                {(meta?.targetOperators ?? []).map((v) => (
                  <MenuItem key={v} value={v}>
                    {v === 'GTE' ? 'At least (≥)' : v === 'LTE' ? 'At most (≤)' : v === 'EQ' ? 'Exactly (=)' : v === 'BETWEEN' ? 'Between' : 'Tracked only'}
                  </MenuItem>
                ))}
              </TextField>
              {form.targetOperator === 'BETWEEN' ? (
                <>
                  <TextField label="From" value={form.targetMin} onChange={text('targetMin')} size="small" fullWidth />
                  <TextField label="To" value={form.targetMax} onChange={text('targetMax')} size="small" fullWidth />
                </>
              ) : form.targetOperator && form.targetOperator !== 'INFO' ? (
                <TextField label="Value" value={form.targetValue} onChange={text('targetValue')} size="small" fullWidth />
              ) : null}
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-start">
              <TextField label="Weight %" value={form.weightPercent} onChange={text('weightPercent')} size="small" sx={{ width: { sm: 160 } }} />
              <TextField
                label="Frequency"
                value={form.frequencyOverride}
                onChange={text('frequencyOverride')}
                select
                size="small"
                fullWidth
                helperText="Empty uses the KPI's own default."
              >
                <MenuItem value="">Use the KPI default</MenuItem>
                {(meta?.frequencies ?? []).map((v) => (
                  <MenuItem key={v} value={v}>{pretty(v)}</MenuItem>
                ))}
              </TextField>
              <FormControlLabel
                control={<Checkbox checked={form.isMandatory} onChange={(e) => set('isMandatory', e.target.checked)} />}
                label="Mandatory"
                sx={{ mt: 0.5 }}
              />
            </Stack>
          </>
        )}

        {(kind === 'skills' || kind === 'qualifications' || kind === 'experience') && (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Level" value={form.requirementLevel} onChange={text('requirementLevel')} select size="small" fullWidth>
              {(meta?.requirementLevels ?? ['REQUIRED', 'PREFERRED']).map((v) => (
                <MenuItem key={v} value={v}>{pretty(v)}</MenuItem>
              ))}
            </TextField>
            {kind === 'skills' && (
              <TextField
                label="Proficiency"
                value={form.proficiencyLevel}
                onChange={text('proficiencyLevel')}
                size="small"
                fullWidth
                helperText="Free text — Basic, Working, Independent, Expert."
              />
            )}
          </Stack>
        )}

        {kind === 'experience' && (
          <>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Minimum years" value={form.minYears} onChange={text('minYears')} size="small" fullWidth />
              <TextField label="Preferred years" value={form.preferredYears} onChange={text('preferredYears')} size="small" fullWidth />
            </Stack>
            <TextField
              label="Area of experience"
              value={form.experienceArea}
              onChange={text('experienceArea')}
              size="small"
              fullWidth
              helperText="What the years should be in — flexible packaging printing, plant maintenance."
            />
          </>
        )}

        {kind === 'authorities' && (
          <>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Amount" value={form.limitAmount} onChange={text('limitAmount')} size="small" fullWidth helperText="Leave empty when the authority is not financial." />
              <TextField label="Currency" value={form.limitCurrency} onChange={text('limitCurrency')} size="small" sx={{ width: { sm: 120 } }} />
            </Stack>
            <TextField label="Scope" value={form.limitScope} onChange={text('limitScope')} size="small" fullWidth helperText="What it covers — plant consumables, own shift, any machine in Unit 2." />
            <TextField label="Condition" value={form.limitCondition} onChange={text('limitCondition')} size="small" fullWidth helperText="Any condition on using it." />
          </>
        )}

        {kind === 'relationships' && (
          <>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Scope" value={form.relationshipScope} onChange={text('relationshipScope')} select size="small" sx={{ width: { sm: 180 } }}>
                {(meta?.relationshipScopes ?? ['INTERNAL', 'EXTERNAL']).map((v) => (
                  <MenuItem key={v} value={v}>{pretty(v)}</MenuItem>
                ))}
              </TextField>
              <TextField
                label="Counterparty"
                value={form.counterparty}
                onChange={text('counterparty')}
                size="small"
                fullWidth
                required
                helperText="A function, a team or an outside party — Quality, Maintenance, Customers."
              />
            </Stack>
            <TextField
              label="Purpose"
              value={form.purpose}
              onChange={text('purpose')}
              multiline
              minRows={2}
              size="small"
              fullWidth
              helperText="What the two coordinate about. This is a JD expectation, not a reporting line."
            />
          </>
        )}

        {kind === 'conditions' && (
          <>
            <TextField label="Type" value={form.conditionType} onChange={text('conditionType')} select size="small" fullWidth>
              {(meta?.workingConditionTypes ?? []).map((v) => (
                <MenuItem key={v} value={v}>{pretty(v)}</MenuItem>
              ))}
            </TextField>
            <TextField
              label="Condition"
              value={form.description}
              onChange={text('description')}
              multiline
              minRows={2}
              size="small"
              fullWidth
              required
              helperText="What the person should expect — rotating shifts, PPE, noise, travel."
            />
            <FormControlLabel
              control={<Checkbox checked={form.isMandatory} onChange={(e) => set('isMandatory', e.target.checked)} />}
              label="Mandatory"
            />
          </>
        )}

        {dates}

        {kind !== 'relationships' && kind !== 'conditions' && (
          <TextField
            label="Notes"
            value={form.notes}
            onChange={text('notes')}
            multiline
            minRows={2}
            size="small"
            fullWidth
            helperText="Anything specific to how this role holds it."
          />
        )}
      </Stack>
    </FormDialog>
  );
}

export default RoleAssignDialog;
