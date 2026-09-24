import { useEffect, useState } from 'react';
import { Alert, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { FormDialog } from '@shared/ui';
import type { LookupRow, PositionOptions, PositionRow } from '../api/positions';
import { positionsApi } from '../api/positions';

/**
 * Position forms, plus the content-override form both detail screens share.
 *
 * A position is the sanctioned seat — the design of the organisation, not the
 * person in it. `sanctionedHeadcount` may be more than one (a grouped seat), so
 * vacancy is a number and not a yes/no.
 */

const today = () => new Date().toISOString().slice(0, 10);

export function PositionFormDialog({
  open, onClose, onDone, options, position,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (id: number) => void;
  options: PositionOptions | null;
  /** null = create. */
  position: PositionRow | null;
}) {
  const [roleId, setRoleId] = useState<number | ''>('');
  const [positionCode, setPositionCode] = useState('');
  const [positionTitle, setPositionTitle] = useState('');
  const [departmentId, setDepartmentId] = useState<number | ''>('');
  const [locationId, setLocationId] = useState<number | ''>('');
  const [sanctionedHeadcount, setSanctionedHeadcount] = useState('1');
  const [defaultShiftId, setDefaultShiftId] = useState<number | ''>('');
  const [status, setStatus] = useState('DRAFT');
  const [effectiveFrom, setEffectiveFrom] = useState(today());
  const [effectiveTo, setEffectiveTo] = useState('');

  useEffect(() => {
    if (!open) return;
    setRoleId(position?.roleId ?? '');
    setPositionCode(position?.positionCode ?? '');
    setPositionTitle(position?.positionTitle ?? '');
    setDepartmentId(position?.departmentId ?? '');
    setLocationId(position?.locationId ?? '');
    setSanctionedHeadcount(String(position?.sanctionedHeadcount ?? 1));
    setDefaultShiftId(position?.defaultShiftId ?? '');
    setStatus(position?.status ?? 'DRAFT');
    setEffectiveFrom(position?.effectiveFrom ?? today());
    setEffectiveTo(position?.effectiveTo ?? '');
  }, [open, position]);

  return (
    <FormDialog
      open={open}
      title={position ? 'Edit position' : 'New position'}
      subtitle="A sanctioned seat. It survives a vacancy and a change of people."
      onClose={onClose}
      submitLabel={position ? 'Save' : 'Create position'}
      submitDisabled={roleId === ''}
      onSubmit={async () => {
        const body = {
          roleId,
          positionCode: positionCode || null,
          positionTitle: positionTitle || null,
          departmentId: departmentId === '' ? null : departmentId,
          locationId: locationId === '' ? null : locationId,
          sanctionedHeadcount: Number(sanctionedHeadcount),
          defaultShiftId: defaultShiftId === '' ? null : defaultShiftId,
          status,
          effectiveFrom: effectiveFrom || null,
          effectiveTo: effectiveTo || null,
        };
        const res = position
          ? await positionsApi.update(position.id, body)
          : await positionsApi.create(body);
        onDone(res.position.id);
      }}
    >
      <Stack spacing={2} sx={{ pt: 0.5 }}>
        <TextField
          select size="small" label="Role" value={roleId}
          onChange={(e) => setRoleId(Number(e.target.value))}
          helperText="Required. The role says what kind of work this seat is for."
        >
          {(options?.roles ?? []).map((r) => (
            <MenuItem key={r.id} value={r.id}>{r.name}{r.code ? ` · ${r.code}` : ''}</MenuItem>
          ))}
        </TextField>

        <Stack direction="row" spacing={2}>
          <TextField size="small" label="Position code" fullWidth value={positionCode} onChange={(e) => setPositionCode(e.target.value)} />
          <TextField
            size="small" label="Title override" fullWidth value={positionTitle}
            onChange={(e) => setPositionTitle(e.target.value)}
            helperText="Only when the seat is called something other than the role."
          />
        </Stack>

        <Stack direction="row" spacing={2}>
          <TextField select size="small" label="Department" fullWidth value={departmentId} onChange={(e) => setDepartmentId(e.target.value === '' ? '' : Number(e.target.value))}>
            <MenuItem value="">Not set</MenuItem>
            {(options?.departments ?? []).map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Location" fullWidth value={locationId} onChange={(e) => setLocationId(e.target.value === '' ? '' : Number(e.target.value))}>
            <MenuItem value="">Not set</MenuItem>
            {(options?.locations ?? []).map((l) => <MenuItem key={l.id} value={l.id}>{l.name}</MenuItem>)}
          </TextField>
        </Stack>

        <Stack direction="row" spacing={2}>
          <TextField
            size="small" type="number" label="Sanctioned headcount" fullWidth
            value={sanctionedHeadcount} onChange={(e) => setSanctionedHeadcount(e.target.value)}
            inputProps={{ min: 0, step: 1 }}
            helperText="How many people this seat is approved for. Vacancy = this minus active assignments."
          />
          <TextField select size="small" label="Default shift" fullWidth value={defaultShiftId} onChange={(e) => setDefaultShiftId(e.target.value === '' ? '' : Number(e.target.value))}>
            <MenuItem value="">Not set</MenuItem>
            {(options?.shifts ?? []).map((s) => <MenuItem key={s.id} value={s.id}>{s.code} · {s.name}</MenuItem>)}
          </TextField>
        </Stack>

        <Stack direction="row" spacing={2}>
          <TextField select size="small" label="Status" fullWidth value={status} onChange={(e) => setStatus(e.target.value)}>
            {(options?.positionStatuses ?? ['DRAFT', 'ACTIVE', 'FROZEN', 'CLOSED']).map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
          <TextField size="small" type="date" label="From" fullWidth InputLabelProps={{ shrink: true }} value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          <TextField size="small" type="date" label="Until" fullWidth InputLabelProps={{ shrink: true }} value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} />
        </Stack>
      </Stack>
    </FormDialog>
  );
}

/** Link a machine, line, area or project to a position. */
export function PositionContextDialog({
  open, onClose, onDone, positionId, options,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  positionId: number;
  options: PositionOptions | null;
}) {
  const [workContextId, setWorkContextId] = useState<number | ''>('');
  const [isPrimary, setIsPrimary] = useState('0');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setWorkContextId(''); setIsPrimary('0'); setNotes('');
  }, [open]);

  return (
    <FormDialog
      open={open}
      title="Add a work context"
      subtitle="One seat may cover several machines. That is a link, never a cloned position."
      onClose={onClose}
      submitLabel="Add context"
      submitDisabled={workContextId === ''}
      onSubmit={async () => {
        await positionsApi.addContext(positionId, { workContextId, isPrimary: isPrimary === '1', notes: notes || null });
        onDone();
      }}
    >
      <Stack spacing={2} sx={{ pt: 0.5 }}>
        <TextField select size="small" label="Work context" value={workContextId} onChange={(e) => setWorkContextId(Number(e.target.value))}>
          {(options?.workContexts ?? []).map((c) => (
            <MenuItem key={c.id} value={c.id}>{c.name} · {c.contextType}</MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Primary context" value={isPrimary} onChange={(e) => setIsPrimary(e.target.value)}
          helperText="Where the person mostly is. At most one per position.">
          <MenuItem value="0">No</MenuItem>
          <MenuItem value="1">Yes</MenuItem>
        </TextField>
        <TextField size="small" label="Notes" multiline minRows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Stack>
    </FormDialog>
  );
}

/**
 * ADD / OVERRIDE / SUPPRESS a piece of inherited role content. Shared by the
 * position and the assignment record, because the row shape and the rule are
 * identical: exactly ONE definition is named, and it must be the kind the
 * content type says.
 */
export function ContentOverrideDialog({
  open, onClose, onSubmit, subtitle, definitions,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => Promise<void>;
  subtitle: string;
  definitions: { KRA: LookupRow[]; RESPONSIBILITY: LookupRow[]; KPI: LookupRow[] };
}) {
  const [contentType, setContentType] = useState<'KRA' | 'RESPONSIBILITY' | 'KPI'>('RESPONSIBILITY');
  const [action, setAction] = useState<'ADD' | 'OVERRIDE' | 'SUPPRESS'>('ADD');
  const [definitionId, setDefinitionId] = useState<number | ''>('');
  const [overrideJson, setOverrideJson] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) return;
    setContentType('RESPONSIBILITY'); setAction('ADD'); setDefinitionId(''); setOverrideJson(''); setReason('');
  }, [open]);

  useEffect(() => { setDefinitionId(''); }, [contentType]);

  const list = definitions[contentType] ?? [];

  return (
    <FormDialog
      open={open}
      title="Add a content overlay"
      subtitle={subtitle}
      onClose={onClose}
      submitLabel="Add overlay"
      submitDisabled={definitionId === ''}
      onSubmit={async () => {
        await onSubmit({
          contentType,
          action,
          kraDefinitionId: contentType === 'KRA' ? definitionId : null,
          responsibilityDefinitionId: contentType === 'RESPONSIBILITY' ? definitionId : null,
          kpiDefinitionId: contentType === 'KPI' ? definitionId : null,
          overrideJson: action === 'OVERRIDE' && overrideJson ? overrideJson : null,
          reason: reason || null,
        });
      }}
    >
      <Stack spacing={2} sx={{ pt: 0.5 }}>
        <Stack direction="row" spacing={2}>
          <TextField select size="small" label="Kind of content" fullWidth value={contentType}
            onChange={(e) => setContentType(e.target.value as 'KRA' | 'RESPONSIBILITY' | 'KPI')}>
            <MenuItem value="KRA">KRA — a result area</MenuItem>
            <MenuItem value="RESPONSIBILITY">Responsibility — an expected activity</MenuItem>
            <MenuItem value="KPI">KPI — a measure</MenuItem>
          </TextField>
          <TextField select size="small" label="What it does" fullWidth value={action}
            onChange={(e) => setAction(e.target.value as 'ADD' | 'OVERRIDE' | 'SUPPRESS')}>
            <MenuItem value="ADD">ADD — something the role does not carry</MenuItem>
            <MenuItem value="OVERRIDE">OVERRIDE — change what the role says</MenuItem>
            <MenuItem value="SUPPRESS">SUPPRESS — remove inherited content</MenuItem>
          </TextField>
        </Stack>

        <TextField
          select size="small" label="Which one" value={definitionId}
          onChange={(e) => setDefinitionId(Number(e.target.value))}
          helperText={
            list.length
              ? 'Exactly one definition per overlay row.'
              : 'No definitions of this kind exist yet — create them under Roles first.'
          }
        >
          {list.map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
        </TextField>

        {action === 'OVERRIDE' && (
          <TextField
            size="small" label="What changes (JSON)" multiline minRows={2}
            value={overrideJson} onChange={(e) => setOverrideJson(e.target.value)}
            placeholder={'{"weightPercent": 15}'}
            helperText="An OVERRIDE that changes nothing is refused, so say what it changes."
          />
        )}

        <TextField
          size="small" label="Why this exception exists" multiline minRows={2}
          value={reason} onChange={(e) => setReason(e.target.value)}
        />

        <Alert severity="info" sx={{ fontSize: 13 }}>
          <Typography sx={{ fontSize: 13 }}>
            Use these sparingly. Content that is true of everyone doing this work belongs on the
            Role — a company that fills this list is describing roles it has not defined yet.
          </Typography>
        </Alert>
      </Stack>
    </FormDialog>
  );
}
