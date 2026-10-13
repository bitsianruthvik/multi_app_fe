import { useEffect, useState } from 'react';
import { Autocomplete, Box, TextField } from '@mui/material';
import { useCan } from '../../access/can';
import { orgApi } from '../../api/organisation';
import { listRoles } from '../../api/roles';
import { positionsApi } from '../../api/positions';
import { peopleApi } from '../../api/people';
import { hiringApi } from '../../api/hiring';

/** A record to try a rule on. */
export interface SampleRow { id: number; code: string | null; name: string }

/**
 * Where the records to try a rule on come from, per kind of thing. All the
 * lists are short, so the person's typing filters them in the browser. An
 * entity this screen does not know yet simply has nothing to try the rule on.
 */
async function loadSamples(entityType: string): Promise<SampleRow[]> {
  switch (entityType) {
    case 'hrms_employee':
      return (await peopleApi.list()).items.map((p) => ({ id: p.id, code: p.employeeCode ?? null, name: p.fullName }));
    case 'hrms_hiring':
      return (await hiringApi.list({ status: 'all' })).hirings.map((h) => ({
        id: h.id,
        code: h.refNo ?? null,
        name: `${h.candidateName ?? 'No candidate yet'} — ${h.roleTitle}`,
      }));
    case 'hrms_department':
      return (await orgApi.departments.list()).map((d) => ({ id: d.id, code: d.code ?? null, name: d.path || d.name }));
    case 'hrms_location':
      return (await orgApi.locations.list()).map((l) => ({ id: l.id, code: l.code ?? null, name: l.path || l.name }));
    case 'hrms_role':
      return (await listRoles()).items.map((r) => ({ id: r.id, code: r.roleCode ?? null, name: r.title }));
    case 'hrms_position':
      return (await positionsApi.list()).items.map((p) => ({ id: p.id, code: p.positionCode ?? null, name: p.displayTitle }));
    default:
      return [];
  }
}

const label = (o: SampleRow) => `${o.code ?? '—'} · ${o.name}`;

/** Picks the real record every part of the builder is shown against. Nothing is saved and no number is taken. */
export function SamplePicker({ entityType, value, onChange }: { entityType: string; value: SampleRow | null; onChange: (row: SampleRow | null) => void }) {
  const can = useCan();
  // Each kind of record belongs to another area, and is asked for only with that area's view.
  const allowed =
    entityType === 'hrms_employee' ? can.employees.view
      : entityType === 'hrms_hiring' ? can.hiring.view
        : entityType === 'hrms_department' || entityType === 'hrms_location' ? can.org.view
          : entityType === 'hrms_role' ? can.roles.view
            : entityType === 'hrms_position' ? can.positions.view
              : true;
  const [rows, setRows] = useState<SampleRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setError(null);
    if (!allowed) {
      setRows([]);
      return undefined;
    }
    setRows(null);
    loadSamples(entityType)
      .then((r) => { if (live) setRows(r); })
      .catch((e: unknown) => {
        if (!live) return;
        setRows([]);
        setError(e instanceof Error ? e.message : 'Could not load records to try this on');
      });
    return () => { live = false; };
  }, [entityType, allowed]);

  const options = rows ?? [];
  const nothing = error ? 'Could not load records to try this on'
    : !allowed ? 'You cannot see these records'
      : rows === null ? 'Loading…' : 'Nothing to try this on yet';

  return (
    <Box sx={{ minWidth: 0 }}>
      <Autocomplete
        key={entityType}
        size="small"
        options={options}
        getOptionLabel={label}
        value={value}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        onChange={(_, o) => onChange(o)}
        noOptionsText={nothing}
        loading={rows === null}
        renderOption={(props, o) => <li {...props} key={o.id}>{label(o)}</li>}
        renderInput={(p) => (
          <TextField
            {...p}
            label="Try it on a record"
            placeholder="Choose a record"
            helperText={error ?? (allowed ? 'Nothing is saved and no number is taken.' : 'You cannot see these records.')}
            error={!!error}
          />
        )}
      />
    </Box>
  );
}
