/**
 * The role and the law (CF_HRMS_HIRING_SPEC.md §36.1): the role's SKILL CATEGORY and SCHEDULED
 * EMPLOYMENT (which minimum wage applies to the people in it), and its DEFAULT SALARY STRUCTURE
 * with an optional CTC band (a new salary for a person in the role preselects it; the salary may
 * choose otherwise). The CTC band shows only with pay access.
 */
import { useCallback, useEffect, useState } from 'react';
import { Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { ErrorNotice, FactItem, SectionCard, useToast } from '@shared/ui';
import { lawApi, SKILL_WORD, type RoleLaw, type SkillCategory } from '../../api/law';
import { parseAmount, rupees } from '../payroll/payWords';

export function RoleLawCard({ roleId, canEdit, canSeePay }: { roleId: number; canEdit: boolean; canSeePay: boolean }) {
  const toast = useToast();
  const [data, setData] = useState<RoleLaw | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [editing, setEditing] = useState(false);
  const [d, setD] = useState({ skill: '', employment: '', structureId: '', ctcMin: '', ctcMax: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    lawApi.role(roleId).then((r) => { setData(r); setError(null); }).catch(setError);
  }, [roleId]);
  useEffect(load, [load]);

  const start = () => {
    if (!data) return;
    setD({
      skill: data.skillCategory ?? '', employment: data.scheduledEmployment ?? '', structureId: data.defaultStructure ? String(data.defaultStructure.structureId) : '',
      ctcMin: data.defaultStructure?.ctcMin != null ? String(data.defaultStructure.ctcMin) : '', ctcMax: data.defaultStructure?.ctcMax != null ? String(data.defaultStructure.ctcMax) : '',
    });
    setEditing(true);
  };
  const min = d.ctcMin.trim() ? parseAmount(d.ctcMin) : null;
  const max = d.ctcMax.trim() ? parseAmount(d.ctcMax) : null;
  const bandBad = (min != null && !(min >= 0)) || (max != null && !(max >= 0)) || (min != null && max != null && min > max);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await lawApi.putRole(roleId, {
        skillCategory: (d.skill || null) as SkillCategory | null, scheduledEmployment: d.employment || null, defaultStructureId: d.structureId ? Number(d.structureId) : null,
        ...(canSeePay && d.structureId ? { ctcMin: min, ctcMax: max } : {}),
      });
      setData(r);
      setEditing(false);
      toast.success('Saved.');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  if (!data) return error ? <ErrorNotice error={error} onRetry={load} /> : null;
  const employment = data.options.employments.find((e) => e.key === data.scheduledEmployment);
  const band = data.defaultStructure && (data.defaultStructure.ctcMin != null || data.defaultStructure.ctcMax != null)
    ? `${data.defaultStructure.ctcMin != null ? rupees(data.defaultStructure.ctcMin) : '…'} – ${data.defaultStructure.ctcMax != null ? rupees(data.defaultStructure.ctcMax) : '…'} a year` : null;

  return (
    <SectionCard
      title="Pay and the law"
      subtitle="Which minimum wage applies to the people in this role, and the salary structure a new salary starts from."
      actions={canEdit && !editing ? <Button size="small" onClick={start} data-action="edit-role-law">Edit</Button> : undefined}
    >
      <ErrorNotice error={error} sx={{ mb: 1.5 }} />
      {!editing ? (
        <Stack direction="row" flexWrap="wrap" sx={{ gap: 3 }}>
          <FactItem label="Skill category" value={data.skillCategory ? SKILL_WORD[data.skillCategory] : '—'} />
          <FactItem label="Scheduled employment" value={employment ? `${employment.name}${employment.schedule ? ` (${employment.schedule})` : ''}` : data.scheduledEmployment ?? '—'} />
          <FactItem label="Default salary structure" value={data.defaultStructure?.name ?? '—'} />
          {canSeePay && <FactItem label="CTC band" value={band ?? '—'} />}
        </Stack>
      ) : (
        <Stack spacing={1.5}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
            <TextField select size="small" label="Skill category" value={d.skill} onChange={(e) => setD({ ...d, skill: e.target.value })} inputProps={{ 'data-field': 'role-skill' }}>
              <MenuItem value=""><em>Not set</em></MenuItem>
              {data.options.skills.map((s) => <MenuItem key={s.key} value={s.key}>{s.name}</MenuItem>)}
            </TextField>
            <TextField select size="small" label="Scheduled employment" value={d.employment} onChange={(e) => setD({ ...d, employment: e.target.value })} inputProps={{ 'data-field': 'role-employment' }}
              helperText={data.options.employments.length ? 'From the minimum-wage notifications of your states.' : 'No minimum-wage notification for your states yet.'}>
              <MenuItem value=""><em>Not set</em></MenuItem>
              {data.options.employments.map((e) => <MenuItem key={`${e.state}-${e.key}`} value={e.key}>{e.name}{e.schedule ? ` (${e.schedule})` : ''} — {e.state}</MenuItem>)}
            </TextField>
            <TextField select size="small" label="Default salary structure" value={d.structureId} onChange={(e) => setD({ ...d, structureId: e.target.value })} inputProps={{ 'data-field': 'role-structure' }}
              helperText="A new salary for a person in this role starts from it.">
              <MenuItem value=""><em>None</em></MenuItem>
              {data.options.structures.map((s) => <MenuItem key={s.id} value={String(s.id)}>{s.name}</MenuItem>)}
            </TextField>
            {canSeePay && d.structureId && (
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField size="small" label="CTC from (₹ a year)" value={d.ctcMin} onChange={(e) => setD({ ...d, ctcMin: e.target.value })} error={bandBad} inputProps={{ inputMode: 'decimal' }} />
                <TextField size="small" label="to (₹ a year)" value={d.ctcMax} onChange={(e) => setD({ ...d, ctcMax: e.target.value })} error={bandBad} inputProps={{ inputMode: 'decimal' }} />
              </Box>
            )}
          </Box>
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>The minimum wage follows the state and zone of each person’s location.</Typography>
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Button size="small" onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="small" variant="contained" onClick={() => void save()} disabled={busy || bandBad} data-action="save-role-law">{busy ? 'Saving…' : 'Save'}</Button>
          </Box>
        </Stack>
      )}
    </SectionCard>
  );
}
