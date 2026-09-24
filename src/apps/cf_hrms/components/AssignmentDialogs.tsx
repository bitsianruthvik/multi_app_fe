import { useEffect, useMemo, useState } from 'react';
import { Alert, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material';
import { FormDialog } from '@shared/ui';
import type { AssignmentOptions, AssignmentRow } from '../api/assignments';
import { assignmentsApi } from '../api/assignments';

/**
 * The work-assignment form.
 *
 * Two things it is built to teach, because getting either wrong is how this
 * model gets broken:
 *
 *   POSITION IS OPTIONAL. The field says so, sits after the role, and defaults
 *   to "No sanctioned position". An SME has real people doing real work long
 *   before it writes down seats.
 *
 *   ALLOCATION IS ADVISORY. The form shows what this person is already
 *   committed to and flags an overload in words; it never disables Save over
 *   it. A company whose fitter is 130% committed has a problem worth seeing,
 *   not a form that refuses to record it.
 *
 * Managers are NOT on this form. Adding a manager is its own action on the
 * record (ReportingDialogs.tsx) precisely because a manager is not part of what
 * the work IS — the two are orthogonal (v1.1 §13).
 */

const today = () => new Date().toISOString().slice(0, 10);

export function AssignmentFormDialog({
  open, onClose, onDone, options, assignment, lockedEmployeeId,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (id: number) => void;
  options: AssignmentOptions | null;
  /** null = create. */
  assignment: AssignmentRow | null;
  lockedEmployeeId?: number;
}) {
  const [employeeId, setEmployeeId] = useState<number | ''>('');
  const [roleId, setRoleId] = useState<number | ''>('');
  const [positionId, setPositionId] = useState<number | ''>('');
  const [departmentId, setDepartmentId] = useState<number | ''>('');
  const [locationId, setLocationId] = useState<number | ''>('');
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [allocationPercent, setAllocationPercent] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [demoteOther, setDemoteOther] = useState(false);
  const [defaultShiftId, setDefaultShiftId] = useState<number | ''>('');
  const [status, setStatus] = useState('ACTIVE');
  const [effectiveFrom, setEffectiveFrom] = useState(today());
  const [effectiveTo, setEffectiveTo] = useState('');
  const [reason, setReason] = useState('');
  const [allowRoleException, setAllowRoleException] = useState(false);
  const [existing, setExisting] = useState<{ total: number; count: number } | null>(null);

  const editing = assignment != null;
  const locked = editing && assignment.status !== 'PLANNED';

  useEffect(() => {
    if (!open) return;
    setEmployeeId(assignment?.employeeId ?? lockedEmployeeId ?? '');
    setRoleId(assignment?.roleId ?? '');
    setPositionId(assignment?.positionId ?? '');
    setDepartmentId(assignment?.departmentId ?? '');
    setLocationId(assignment?.locationId ?? '');
    setAssignmentTitle(assignment?.assignmentTitle ?? '');
    setAllocationPercent(assignment?.allocationPercent == null ? '' : String(assignment.allocationPercent));
    setIsPrimary(assignment?.isPrimary ?? false);
    setDemoteOther(false);
    setDefaultShiftId(assignment?.defaultShiftId ?? '');
    setStatus(assignment?.status ?? 'ACTIVE');
    setEffectiveFrom(assignment?.effectiveFrom ?? today());
    setEffectiveTo(assignment?.effectiveTo ?? '');
    setReason(assignment?.reason ?? '');
    setAllowRoleException(false);
    setExisting(null);
  }, [open, assignment, lockedEmployeeId]);

  // What this person is already committed to. Shown, never enforced.
  useEffect(() => {
    if (!open || employeeId === '') { setExisting(null); return; }
    let live = true;
    assignmentsApi.list({ employeeId, liveOnly: true })
      .then((r) => {
        if (!live) return;
        const others = r.items.filter((a) => a.id !== assignment?.id);
        setExisting({ total: others.reduce((n, a) => n + (a.allocationPercent ?? 0), 0), count: others.length });
      })
      .catch(() => { if (live) setExisting(null); });
    return () => { live = false; };
  }, [open, employeeId, assignment?.id]);

  const position = useMemo(
    () => options?.positions.find((p) => p.id === positionId) ?? null,
    [options, positionId],
  );
  const roleClash = position != null && roleId !== '' && position.roleId != null && position.roleId !== roleId;
  const projected = (existing?.total ?? 0) + (Number(allocationPercent) || 0);

  return (
    <FormDialog
      open={open}
      title={editing ? 'Edit work assignment' : 'New work assignment'}
      subtitle="What this person is actually doing. One person may hold several of these at once."
      onClose={onClose}
      maxWidth="sm"
      submitLabel={editing ? 'Save' : 'Create assignment'}
      submitDisabled={employeeId === '' || roleId === ''}
      onSubmit={async () => {
        const body: Record<string, unknown> = {
          employeeId,
          roleId,
          positionId: positionId === '' ? null : positionId,
          departmentId: departmentId === '' ? null : departmentId,
          locationId: locationId === '' ? null : locationId,
          assignmentTitle: assignmentTitle || null,
          allocationPercent: allocationPercent === '' ? null : Number(allocationPercent),
          isPrimary,
          demoteOther,
          defaultShiftId: defaultShiftId === '' ? null : defaultShiftId,
          status,
          effectiveFrom,
          effectiveTo: effectiveTo || null,
          reason: reason || null,
          allowRoleException,
        };
        const res = editing ? await assignmentsApi.update(assignment.id, body) : await assignmentsApi.create(body);
        onDone(res.assignment.id);
      }}
    >
      <Stack spacing={2} sx={{ pt: 0.5 }}>
        <TextField
          select size="small" label="Person" value={employeeId}
          onChange={(e) => setEmployeeId(Number(e.target.value))}
          disabled={locked || lockedEmployeeId != null}
          helperText={locked ? 'A live assignment keeps its person. End it and create a new one instead.' : undefined}
        >
          {(options?.employees ?? []).map((e) => (
            <MenuItem key={e.id} value={e.id}>{e.name}{e.code ? ` · ${e.code}` : ''}</MenuItem>
          ))}
        </TextField>

        <TextField
          select size="small" label="Role" value={roleId}
          onChange={(e) => setRoleId(Number(e.target.value))}
          disabled={locked}
          helperText="Required. This is what says which work this is."
        >
          {(options?.roles ?? []).map((r) => (
            <MenuItem key={r.id} value={r.id}>{r.name}{r.code ? ` · ${r.code}` : ''}</MenuItem>
          ))}
        </TextField>

        <TextField
          select size="small" label="Position (optional)" value={positionId}
          onChange={(e) => {
            const v = e.target.value === '' ? '' : Number(e.target.value);
            setPositionId(v);
            const p = options?.positions.find((x) => x.id === v);
            if (p) {
              if (roleId === '' && p.roleId != null) setRoleId(p.roleId);
              if (departmentId === '' && p.departmentId != null) setDepartmentId(p.departmentId);
              if (locationId === '' && p.locationId != null) setLocationId(p.locationId);
              if (defaultShiftId === '' && p.defaultShiftId != null) setDefaultShiftId(p.defaultShiftId);
            }
          }}
          disabled={locked}
          helperText="Leave blank when the work is real but no sanctioned seat has been written down. That is normal."
        >
          <MenuItem value="">No sanctioned position</MenuItem>
          {(options?.positions ?? []).map((p) => (
            <MenuItem key={p.id} value={p.id}>{p.name}{p.code ? ` · ${p.code}` : ''}</MenuItem>
          ))}
        </TextField>

        {roleClash && (
          <Alert severity="warning" sx={{ fontSize: 13 }}>
            That position sanctions <strong>{position?.roleTitle}</strong>, not the role chosen. If
            that is deliberate, tick the exception below and say why.
            <FormControlLabel
              sx={{ display: 'block', mt: 0.5 }}
              control={<Switch size="small" checked={allowRoleException} onChange={(e) => setAllowRoleException(e.target.checked)} />}
              label={<Typography sx={{ fontSize: 13 }}>This is a deliberate exception</Typography>}
            />
          </Alert>
        )}

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

        <TextField
          size="small" label="Assignment title" value={assignmentTitle}
          onChange={(e) => setAssignmentTitle(e.target.value)}
          placeholder="QC Executive — Unit 2"
        />

        <Stack direction="row" spacing={2}>
          <TextField
            size="small" type="number" label="Allocation %" fullWidth
            value={allocationPercent} onChange={(e) => setAllocationPercent(e.target.value)}
            inputProps={{ min: 0, step: 5 }}
            helperText="Advisory. Never blocks."
          />
          <TextField select size="small" label="Default shift" fullWidth value={defaultShiftId} onChange={(e) => setDefaultShiftId(e.target.value === '' ? '' : Number(e.target.value))}>
            <MenuItem value="">Not set</MenuItem>
            {(options?.shifts ?? []).map((s) => <MenuItem key={s.id} value={s.id}>{s.code} · {s.name}</MenuItem>)}
          </TextField>
        </Stack>

        {existing != null && existing.count > 0 && (
          <Alert severity={projected > 100 ? 'warning' : 'info'} sx={{ fontSize: 13 }}>
            This person already holds {existing.count} live assignment{existing.count === 1 ? '' : 's'} totalling{' '}
            {existing.total}%. With this one they would be at <strong>{projected}%</strong>
            {projected > 100 ? ' — over-committed. Recorded either way; it is a fact to fix, not a form error.' : '.'}
          </Alert>
        )}

        <Stack direction="row" spacing={2}>
          <TextField select size="small" label="Status" fullWidth value={status} onChange={(e) => setStatus(e.target.value)}>
            {(options?.assignmentStatuses ?? ['PLANNED', 'ACTIVE', 'SUSPENDED', 'ENDED']).map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
          <TextField
            size="small" type="date" label="From" fullWidth InputLabelProps={{ shrink: true }}
            value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} disabled={locked}
          />
          <TextField
            size="small" type="date" label="Until" fullWidth InputLabelProps={{ shrink: true }}
            value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)}
          />
        </Stack>

        <TextField
          size="small" label="Why this assignment exists" multiline minRows={2}
          value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="Separately managed responsibility set, 15% of the week."
        />

        <FormControlLabel
          control={<Switch size="small" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} />}
          label={<Typography sx={{ fontSize: 13 }}>Primary assignment (for display and defaults)</Typography>}
        />
        {isPrimary && (
          <FormControlLabel
            control={<Switch size="small" checked={demoteOther} onChange={(e) => setDemoteOther(e.target.checked)} />}
            label={<Typography sx={{ fontSize: 13 }}>Move the primary flag off their current primary assignment</Typography>}
          />
        )}
      </Stack>
    </FormDialog>
  );
}

/** Link a machine, line, area or project to one assignment. */
export function AssignmentContextDialog({
  open, onClose, onDone, assignmentId, options,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  assignmentId: number;
  options: AssignmentOptions | null;
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
      subtitle="A helper covering four machines is ONE assignment with four contexts."
      onClose={onClose}
      submitLabel="Add context"
      submitDisabled={workContextId === ''}
      onSubmit={async () => {
        await assignmentsApi.addContext(assignmentId, { workContextId, isPrimary: isPrimary === '1', notes: notes || null });
        onDone();
      }}
    >
      <Stack spacing={2} sx={{ pt: 0.5 }}>
        <TextField select size="small" label="Work context" value={workContextId} onChange={(e) => setWorkContextId(Number(e.target.value))}>
          {(options?.workContexts ?? []).map((c) => (
            <MenuItem key={c.id} value={c.id}>{c.name} · {c.contextType}</MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Primary context" value={isPrimary} onChange={(e) => setIsPrimary(e.target.value)}>
          <MenuItem value="0">No</MenuItem>
          <MenuItem value="1">Yes</MenuItem>
        </TextField>
        <TextField size="small" label="Notes" multiline minRows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Stack>
    </FormDialog>
  );
}
