/**
 * Generating a document is a RUN (DESIGN_SYSTEM.md §4.6): params → Preview →
 * review the result → commit.
 *
 * WHY IT IS NOT A DIALOG. What gets committed here is a frozen record of what a
 * job is — the thing HR hands to a person, and the thing that answers "what did
 * this role say in March" two years later. Approving that through a form with an
 * OK button asks someone to vouch for a document they have not read. So the
 * middle state is the document itself, full width, drawn by the SAME component
 * the stored snapshot uses (`DocumentSnapshotView`), and Generate is only
 * reachable once it has been drawn.
 *
 * The preview writes nothing — `/documents/preview` resolves and returns. The
 * generate call resolves again on the server at the same as-of date, so what was
 * approved and what is frozen are the same resolution of the same layers.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Autocomplete, Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import SaveRounded from '@mui/icons-material/SaveRounded';
import {
  Callout,
  ErrorNotice,
  RunPanel,
  Surface,
  ToneBadge,
  useToast,
  type RunState,
} from '@shared/ui';
import {
  DOCUMENT_TYPES,
  documentHeadline,
  documentsApi,
  snapshotCounts,
  type DocumentSnapshot,
  type DocumentType,
} from '../api/documents';
import { listRoles, type Role } from '../api/roles';
import { peopleApi, type EmployeeRow } from '../api/people';
import { positionsApi, type PositionRow } from '../api/positions';
import { DocumentSnapshotView } from './DocumentRender';

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * What this run will produce, in a sentence, BEFORE it runs — §4.6's rule.
 *
 * For Karni today the honest sentence is unflattering: a JD from a role with no
 * purpose and no KRAs is a title and a list of duties. Saying so here is the
 * point (plan §17.5); a button that promises a job description and delivers a
 * list teaches people the tool is unreliable, when in fact the data is thin.
 */
function summaryFor(
  type: DocumentType,
  role: Role | null,
  position: PositionRow | null,
  employee: EmployeeRow | null,
  on: string,
): string {
  if (type === 'ROLE_JD') {
    if (!role) return 'Pick a role. A job description is resolved from the role, and optionally for one position.';
    const gaps: string[] = [];
    if (!role.hasPurpose) gaps.push('no purpose statement');
    if (role.kraCount === 0) gaps.push('no key result areas');
    if (role.kpiCount === 0) gaps.push('no indicators');
    const where = position
      ? `for the seat ${position.positionCode ?? position.displayTitle}, so this position's overlays apply`
      : 'for the role as held anywhere, with no position overlay';
    const thin = gaps.length
      ? ` This role has ${gaps.join(', ')}, so those sections will say so rather than be left out.`
      : '';
    return `Resolves ${role.title} ${where}, as at ${on}.${thin}`;
  }
  if (!employee) return 'Pick a person. Their profile covers every work assignment they hold.';
  const n = employee.activeAssignmentCount;
  return `Resolves every work assignment ${employee.fullName} holds on ${on}${
    n ? ` — ${n} of them` : ''
  }, each with its own role, its own managers and its own responsibilities.`;
}

export function DocumentGeneratePanel({
  companySlug,
  canGenerate,
  onCancel,
  onGenerated,
}: {
  companySlug: string;
  canGenerate: boolean;
  onCancel: () => void;
  onGenerated: (id: number) => void;
}) {
  const toast = useToast();

  const [type, setType] = useState<DocumentType>('ROLE_JD');
  const [on, setOn] = useState(todayIso());
  const [role, setRole] = useState<Role | null>(null);
  const [position, setPosition] = useState<PositionRow | null>(null);
  const [employee, setEmployee] = useState<EmployeeRow | null>(null);

  const [roles, setRoles] = useState<Role[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [positions, setPositions] = useState<PositionRow[]>([]);

  const [state, setState] = useState<RunState>('idle');
  const [snapshot, setSnapshot] = useState<DocumentSnapshot | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listRoles()
      .then((r) => setRoles(r.items))
      .catch(() => setRoles([]));
    peopleApi
      .list()
      .then((r) => setEmployees(r.items))
      .catch(() => setEmployees([]));
  }, []);

  // The position picker is narrowed to the chosen role: a position-specific JD
  // is a version of THAT role, and offering every seat in the company would
  // invite a combination the resolver would reject.
  useEffect(() => {
    setPosition(null);
    if (!role) {
      setPositions([]);
      return;
    }
    positionsApi
      .list({ roleId: role.id })
      .then((r) => setPositions(r.items))
      .catch(() => setPositions([]));
  }, [role]);

  // Any change to the params invalidates the drawn document. Leaving a stale
  // preview on screen beside a changed date is how someone commits the wrong one.
  useEffect(() => {
    setSnapshot(null);
    setState('idle');
  }, [type, on, role, position, employee]);

  const target = type === 'ROLE_JD' ? role?.id : employee?.id;
  const ready = !!target;

  const request = useMemo(
    () => ({
      type,
      on,
      ...(type === 'ROLE_JD'
        ? { roleId: role?.id, positionId: position?.id }
        : { employeeId: employee?.id }),
    }),
    [type, on, role, position, employee],
  );

  const preview = useCallback(async () => {
    if (!ready) return;
    setState('running');
    setError(null);
    try {
      const r = await documentsApi.preview(request);
      setSnapshot(r.snapshot);
      setState('results');
    } catch (e) {
      setError(e);
      setState('idle');
    }
  }, [ready, request]);

  const generate = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await documentsApi.generate(request);
      toast.success('Document generated. The snapshot it was rendered from is stored with it.');
      onGenerated(r.document?.id ?? r.id ?? 0);
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  }, [request, toast, onGenerated]);

  const counts = snapshot ? snapshotCounts(snapshot) : null;

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <Button size="small" startIcon={<ArrowBackRounded />} onClick={onCancel}>
          All documents
        </Button>
      </Stack>

      <RunPanel
        title={`Generate a ${type === 'ROLE_JD' ? 'job description' : 'responsibility profile'}`}
        summary={summaryFor(type, role, position, employee, on)}
        state={state}
        onRun={() => void preview()}
        runLabel="Preview"
        runningLabel="Resolving…"
        busyMessage="Resolving role content, then the position and assignment overlays…"
        disabled={!ready}
        commit={
          canGenerate ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                Nothing is stored until you generate.
              </Typography>
              <Button
                variant="contained"
                size="small"
                startIcon={<SaveRounded />}
                disabled={saving || !snapshot}
                onClick={() => void generate()}
              >
                {saving ? 'Generating…' : 'Generate and save'}
              </Button>
            </Stack>
          ) : (
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
              You can preview this but not save it — saving needs the documents permission.
            </Typography>
          )
        }
        params={
          <>
            <TextField
              select
              size="small"
              label="Document"
              value={type}
              onChange={(e) => {
                setType(e.target.value as DocumentType);
                setRole(null);
                setEmployee(null);
              }}
              sx={{ minWidth: 240 }}
              InputLabelProps={{ shrink: true }}
            >
              {DOCUMENT_TYPES.map((d) => (
                <MenuItem key={d.value} value={d.value}>
                  {d.label}
                </MenuItem>
              ))}
            </TextField>

            {type === 'ROLE_JD' ? (
              <>
                <Autocomplete
                  options={roles}
                  value={role}
                  onChange={(_, v) => setRole(v)}
                  getOptionLabel={(o) => o.title}
                  isOptionEqualToValue={(a, b) => a.id === b.id}
                  sx={{ minWidth: 280, flex: '1 1 280px' }}
                  renderOption={(props, o) => (
                    <Box component="li" {...props} key={o.id}>
                      <Box sx={{ minWidth: 0 }}>
                        <Box sx={{ fontSize: 14 }}>{o.title}</Box>
                        <Box sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                          {o.roleCode ? `${o.roleCode} · ` : ''}
                          {o.responsibilityCount} responsibilities · {o.kraCount} KRAs
                          {o.hasPurpose ? '' : ' · no purpose'}
                        </Box>
                      </Box>
                    </Box>
                  )}
                  renderInput={(p) => <TextField {...p} label="Role" size="small" required />}
                />
                <Autocomplete
                  options={positions}
                  value={position}
                  onChange={(_, v) => setPosition(v)}
                  getOptionLabel={(o) => o.positionCode ?? o.displayTitle}
                  isOptionEqualToValue={(a, b) => a.id === b.id}
                  disabled={!role}
                  sx={{ minWidth: 240, flex: '1 1 240px' }}
                  renderOption={(props, o) => (
                    <Box component="li" {...props} key={o.id}>
                      <Box sx={{ minWidth: 0 }}>
                        <Box sx={{ fontSize: 14 }}>{o.positionCode ?? o.displayTitle}</Box>
                        <Box sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                          {[o.departmentName, o.locationName].filter(Boolean).join(' · ') ||
                            'No department recorded'}
                        </Box>
                      </Box>
                    </Box>
                  )}
                  renderInput={(p) => (
                    <TextField
                      {...p}
                      label="Position (optional)"
                      size="small"
                      helperText={
                        role
                          ? positions.length
                            ? 'Adds this seat’s context and overlays'
                            : 'This role has no positions'
                          : 'Pick a role first'
                      }
                    />
                  )}
                />
              </>
            ) : (
              <Autocomplete
                options={employees}
                value={employee}
                onChange={(_, v) => setEmployee(v)}
                getOptionLabel={(o) => o.fullName}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                sx={{ minWidth: 300, flex: '1 1 300px' }}
                renderOption={(props, o) => (
                  <Box component="li" {...props} key={o.id}>
                    <Box sx={{ minWidth: 0 }}>
                      <Box sx={{ fontSize: 14 }}>{o.fullName}</Box>
                      <Box sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                        {o.employeeCode} ·{' '}
                        {o.activeAssignmentCount === 1
                          ? '1 assignment'
                          : `${o.activeAssignmentCount} assignments`}
                        {o.primaryRoleTitle ? ` · ${o.primaryRoleTitle}` : ''}
                      </Box>
                    </Box>
                  </Box>
                )}
                renderInput={(p) => <TextField {...p} label="Person" size="small" required />}
              />
            )}

            <TextField
              type="date"
              size="small"
              label="As at"
              value={on}
              onChange={(e) => setOn(e.target.value || todayIso())}
              sx={{ minWidth: 165 }}
              InputLabelProps={{ shrink: true }}
              helperText="Every layer is filtered on this date"
            />
          </>
        }
      >
        {snapshot && (
          <>
            <Callout
              label="Draft"
              title="Nothing has been saved yet"
              tone="accent"
              sx={{ mb: 2 }}
            >
              This is the resolved content as at {snapshot.asOf ?? on}, rendered by the same
              component that renders a stored document — so what you are reading is what gets
              frozen. Press <strong>Generate and save</strong> to store it with its snapshot and
              render the DOCX and PDF.
            </Callout>

            <Surface e={1} sx={{ p: { xs: 2, sm: 3 }, mb: 2 }}>
              <Stack
                direction="row"
                spacing={1}
                alignItems="baseline"
                sx={{ flexWrap: 'wrap', rowGap: 1, mb: 2 }}
              >
                <Typography sx={{ fontSize: 17, fontWeight: 600, color: 'var(--c-text)' }}>
                  {documentHeadline(snapshot)}
                </Typography>
                <ToneBadge
                  tone="neutral"
                  noIcon
                  label={
                    snapshot.documentType === 'EMPLOYEE_RESPONSIBILITY_PROFILE'
                      ? 'Responsibility profile'
                      : 'Role JD'
                  }
                />
                {counts && counts.total === 0 && (
                  <ToneBadge tone="warning" noIcon label="No content written yet" />
                )}
                {counts && counts.suppressed > 0 && (
                  <ToneBadge tone="info" noIcon label={`${counts.suppressed} removed`} />
                )}
              </Stack>
              <DocumentSnapshotView snapshot={snapshot} companySlug={companySlug} />
            </Surface>
          </>
        )}
      </RunPanel>

      {error ? (
        <ErrorNotice
          error={error}
          fallback="That document could not be resolved."
          sx={{ mt: 2 }}
          onRetry={() => void preview()}
        />
      ) : null}
    </Box>
  );
}

export default DocumentGeneratePanel;
