import { useEffect, useMemo, useState } from 'react';
import { Alert, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material';
import { FormDialog } from '@shared/ui';
import type { AssignmentOptions, ManagerAssignmentOption } from '../api/assignments';
import { assignmentsApi } from '../api/assignments';
import type { PositionOptions } from '../api/positions';
import { positionsApi } from '../api/positions';

/**
 * Adding a manager, made cheap on purpose.
 *
 * The taxonomy's §17 rule is that a second manager NEVER justifies a second
 * Role, Position or Work Assignment. That rule only holds if adding a manager —
 * including one whose authority covers a single subject — is the easiest thing
 * on the screen. So this dialog asks four short questions (who · what kind ·
 * over what part of the work · for how long) and nothing else, and the scope
 * fields are right there rather than behind an "advanced" disclosure.
 */

const SCOPE_HELP: Record<string, string> = {
  GENERAL: 'All of this work. The usual case.',
  FUNCTION: 'A function — "Quality standards", "Engineering standards".',
  RESPONSIBILITY: 'One responsibility — "Statutory compliance", "Payroll".',
  WORK_CONTEXT: 'One machine, line, area or cell.',
  PROJECT: 'One project, usually with an end date.',
  OTHER: 'Something the other five do not describe.',
};

const today = () => new Date().toISOString().slice(0, 10);

function ScopeFields({
  scopeType, setScopeType,
  scopeLabel, setScopeLabel,
  scopeWorkContextId, setScopeWorkContextId,
  workContexts,
}: {
  scopeType: string;
  setScopeType: (v: string) => void;
  scopeLabel: string;
  setScopeLabel: (v: string) => void;
  scopeWorkContextId: number | '';
  setScopeWorkContextId: (v: number | '') => void;
  workContexts: { id: number; name: string; contextType: string }[];
}) {
  return (
    <>
      <TextField
        select
        size="small"
        label="What does this manager cover?"
        value={scopeType}
        onChange={(e) => setScopeType(e.target.value)}
        helperText={SCOPE_HELP[scopeType] ?? ''}
      >
        {Object.keys(SCOPE_HELP).map((s) => (
          <MenuItem key={s} value={s}>{s === 'GENERAL' ? 'All of this work (GENERAL)' : s}</MenuItem>
        ))}
      </TextField>
      {scopeType !== 'GENERAL' && (
        <TextField
          size="small"
          label="Scope"
          placeholder="Statutory compliance"
          value={scopeLabel}
          onChange={(e) => setScopeLabel(e.target.value)}
          helperText="Say what part of the work this manager has authority over. This is what stops it becoming a second job."
        />
      )}
      {(scopeType === 'WORK_CONTEXT' || scopeType === 'PROJECT') && (
        <TextField
          select
          size="small"
          label="Work context"
          value={scopeWorkContextId}
          onChange={(e) => setScopeWorkContextId(e.target.value === '' ? '' : Number(e.target.value))}
          helperText="The machine, line, area or project this applies to."
        >
          <MenuItem value="">Not a recorded context</MenuItem>
          {workContexts.map((c) => (
            <MenuItem key={c.id} value={c.id}>{c.name} · {c.contextType}</MenuItem>
          ))}
        </TextField>
      )}
    </>
  );
}

/** Add an ACTUAL (assignment-level) manager. */
export function AssignmentReportingDialog({
  open, onClose, onDone, assignmentId, options, subjectEmployeeId,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  assignmentId: number;
  options: AssignmentOptions | null;
  subjectEmployeeId: number;
}) {
  const [managerEmployeeId, setManagerEmployeeId] = useState<number | ''>('');
  const [managerWorkAssignmentId, setManagerWorkAssignmentId] = useState<number | ''>('');
  const [managerHats, setManagerHats] = useState<ManagerAssignmentOption[]>([]);
  const [relationshipTypeId, setRelationshipTypeId] = useState<number | ''>('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [scopeType, setScopeType] = useState('GENERAL');
  const [scopeLabel, setScopeLabel] = useState('');
  const [scopeWorkContextId, setScopeWorkContextId] = useState<number | ''>('');
  const [scopeNotes, setScopeNotes] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(today());
  const [effectiveTo, setEffectiveTo] = useState('');

  useEffect(() => {
    if (!open) return;
    setManagerEmployeeId(''); setManagerWorkAssignmentId(''); setManagerHats([]);
    setRelationshipTypeId(''); setIsPrimary(false);
    setScopeType('GENERAL'); setScopeLabel(''); setScopeWorkContextId(''); setScopeNotes('');
    setEffectiveFrom(today()); setEffectiveTo('');
  }, [open]);

  // Which hat the manager wears here. Optional by schema, strongly preferred by
  // the model: "reports to Ram Babu as Admin Manager" says more than "reports
  // to Ram Babu", and the matrix is made of that difference.
  useEffect(() => {
    if (managerEmployeeId === '') { setManagerHats([]); return; }
    let live = true;
    assignmentsApi.managerAssignments(managerEmployeeId)
      .then((r) => { if (live) setManagerHats(r.items); })
      .catch(() => { if (live) setManagerHats([]); });
    return () => { live = false; };
  }, [managerEmployeeId]);

  const type = useMemo(
    () => options?.relationshipTypes.find((t) => t.id === relationshipTypeId) ?? null,
    [options, relationshipTypeId],
  );

  return (
    <FormDialog
      open={open}
      title="Add a manager"
      subtitle="A second manager needs no second role, no second position and no second assignment."
      onClose={onClose}
      submitLabel="Add manager"
      submitDisabled={managerEmployeeId === '' || relationshipTypeId === ''}
      onSubmit={async () => {
        await assignmentsApi.addReporting(assignmentId, {
          managerEmployeeId,
          managerWorkAssignmentId: managerWorkAssignmentId === '' ? null : managerWorkAssignmentId,
          relationshipTypeId,
          isPrimary,
          scopeType,
          scopeLabel: scopeType === 'GENERAL' ? null : scopeLabel,
          scopeWorkContextId: scopeWorkContextId === '' ? null : scopeWorkContextId,
          scopeNotes: scopeNotes || null,
          effectiveFrom,
          effectiveTo: effectiveTo || null,
        });
        onDone();
      }}
    >
      <Stack spacing={2} sx={{ pt: 0.5 }}>
        <TextField
          select
          size="small"
          label="Manager"
          value={managerEmployeeId}
          onChange={(e) => { setManagerEmployeeId(Number(e.target.value)); setManagerWorkAssignmentId(''); }}
          helperText="A person. Machines and areas are work contexts, never managers."
        >
          {(options?.employees ?? [])
            .filter((e) => e.id !== subjectEmployeeId)
            .map((e) => <MenuItem key={e.id} value={e.id}>{e.name}{e.code ? ` · ${e.code}` : ''}</MenuItem>)}
        </TextField>

        {managerHats.length > 0 && (
          <TextField
            select
            size="small"
            label="Which of their assignments"
            value={managerWorkAssignmentId}
            onChange={(e) => setManagerWorkAssignmentId(e.target.value === '' ? '' : Number(e.target.value))}
            helperText="Optional, but it records which hat they wear here."
          >
            <MenuItem value="">Not recorded</MenuItem>
            {managerHats.map((h) => (
              <MenuItem key={h.id} value={h.id}>{h.label}{h.isPrimary ? ' (primary)' : ''}</MenuItem>
            ))}
          </TextField>
        )}

        <TextField
          select
          size="small"
          label="Kind of reporting"
          value={relationshipTypeId}
          onChange={(e) => {
            const id = Number(e.target.value);
            setRelationshipTypeId(id);
            const t = options?.relationshipTypes.find((x) => x.id === id);
            setIsPrimary(t ? !t.allowMultiple : false);
          }}
        >
          {(options?.relationshipTypes ?? []).map((t) => (
            <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
          ))}
        </TextField>

        <ScopeFields
          scopeType={scopeType} setScopeType={setScopeType}
          scopeLabel={scopeLabel} setScopeLabel={setScopeLabel}
          scopeWorkContextId={scopeWorkContextId} setScopeWorkContextId={setScopeWorkContextId}
          workContexts={options?.workContexts ?? []}
        />

        <TextField
          size="small"
          label="Notes"
          multiline
          minRows={2}
          value={scopeNotes}
          onChange={(e) => setScopeNotes(e.target.value)}
          placeholder="Anil signs off the statutory quality returns only."
        />

        <Stack direction="row" spacing={2}>
          <TextField
            size="small" type="date" label="From" fullWidth
            InputLabelProps={{ shrink: true }}
            value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)}
          />
          <TextField
            size="small" type="date" label="Until (optional)" fullWidth
            InputLabelProps={{ shrink: true }}
            value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)}
            helperText="A temporary project manager gets an end date, not a deletion later."
          />
        </Stack>

        <FormControlLabel
          control={<Switch checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} size="small" />}
          label={<Typography sx={{ fontSize: 13 }}>Primary for this reporting layer</Typography>}
        />
        {type && !type.allowMultiple && (
          <Alert severity="info" sx={{ fontSize: 13 }}>
            One live {type.name} per assignment. Other kinds of manager sit beside it — a dotted or
            project line is not blocked by this.
          </Alert>
        )}
      </Stack>
    </FormDialog>
  );
}

/** Add a FORMAL (position-to-position) reporting line. */
export function PositionReportingDialog({
  open, onClose, onDone, positionId, options,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  positionId: number;
  options: PositionOptions | null;
}) {
  const [toPositionId, setToPositionId] = useState<number | ''>('');
  const [relationshipTypeId, setRelationshipTypeId] = useState<number | ''>('');
  const [isPrimary, setIsPrimary] = useState(true);
  const [scopeType, setScopeType] = useState('GENERAL');
  const [scopeLabel, setScopeLabel] = useState('');
  const [scopeWorkContextId, setScopeWorkContextId] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(today());
  const [effectiveTo, setEffectiveTo] = useState('');

  useEffect(() => {
    if (!open) return;
    setToPositionId(''); setRelationshipTypeId(''); setIsPrimary(true);
    setScopeType('GENERAL'); setScopeLabel(''); setScopeWorkContextId(''); setNotes('');
    setEffectiveFrom(today()); setEffectiveTo('');
  }, [open]);

  return (
    <FormDialog
      open={open}
      title="Add a formal reporting line"
      subtitle="Between positions, so it survives a vacancy and a change of people."
      onClose={onClose}
      submitLabel="Add line"
      submitDisabled={toPositionId === '' || relationshipTypeId === ''}
      onSubmit={async () => {
        await positionsApi.addReporting(positionId, {
          toPositionId,
          relationshipTypeId,
          isPrimary,
          scopeType,
          scopeLabel: scopeType === 'GENERAL' ? null : scopeLabel,
          scopeWorkContextId: scopeWorkContextId === '' ? null : scopeWorkContextId,
          notes: notes || null,
          effectiveFrom,
          effectiveTo: effectiveTo || null,
        });
        onDone();
      }}
    >
      <Stack spacing={2} sx={{ pt: 0.5 }}>
        <TextField
          select size="small" label="Reports to the position"
          value={toPositionId}
          onChange={(e) => setToPositionId(Number(e.target.value))}
        >
          {(options?.positions ?? [])
            .filter((p) => p.id !== positionId)
            .map((p) => <MenuItem key={p.id} value={p.id}>{p.name}{p.code ? ` · ${p.code}` : ''}</MenuItem>)}
        </TextField>

        <TextField
          select size="small" label="Kind of reporting"
          value={relationshipTypeId}
          onChange={(e) => {
            const id = Number(e.target.value);
            setRelationshipTypeId(id);
            const t = options?.relationshipTypes.find((x) => x.id === id);
            setIsPrimary(t ? !t.allowMultiple : false);
          }}
        >
          {(options?.relationshipTypes ?? []).map((t) => (
            <MenuItem key={t.id} value={t.id}>{t.name}{t.isFormal ? ' · formal' : ''}</MenuItem>
          ))}
        </TextField>

        <ScopeFields
          scopeType={scopeType} setScopeType={setScopeType}
          scopeLabel={scopeLabel} setScopeLabel={setScopeLabel}
          scopeWorkContextId={scopeWorkContextId} setScopeWorkContextId={setScopeWorkContextId}
          workContexts={options?.workContexts ?? []}
        />

        <TextField size="small" label="Notes" multiline minRows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />

        <Stack direction="row" spacing={2}>
          <TextField
            size="small" type="date" label="From" fullWidth
            InputLabelProps={{ shrink: true }}
            value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)}
          />
          <TextField
            size="small" type="date" label="Until (optional)" fullWidth
            InputLabelProps={{ shrink: true }}
            value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)}
          />
        </Stack>

        <FormControlLabel
          control={<Switch checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} size="small" />}
          label={<Typography sx={{ fontSize: 13 }}>Primary formal line</Typography>}
        />
        <Alert severity="info" sx={{ fontSize: 13 }}>
          A formal hierarchy may not contain a loop. A dotted, project or shift line may point
          anywhere — that is what a matrix is.
        </Alert>
      </Stack>
    </FormDialog>
  );
}
