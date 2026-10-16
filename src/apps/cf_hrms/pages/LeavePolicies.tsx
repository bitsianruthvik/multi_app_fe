import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Autocomplete, Box, Button, IconButton, MenuItem, Stack, Tab, Tabs, TextField, Tooltip, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import EventAvailableRounded from '@mui/icons-material/EventAvailableRounded';
import {
  Callout, ConfirmDialog, EmptyState, ErrorNotice, FormDialog, ListSkeleton, PageHeader, SectionCard, ToneBadge,
  errorMessage, useToast,
} from '@shared/ui';
import { ListToolbar, type FilterDef } from '../components/list/ListToolbar';
import { RowActions } from '../components/list/RowActions';
import { matchesFlag, matchesQuery, useListFilters, YES_NO_OPTIONS } from '../components/list/useListFilters';
import { useCan } from '../access/can';
import {
  POLICY_STATUS_LABEL, POLICY_STATUS_TONE, leaveApi, usedByLine,
  type AssignmentLabel, type Assignments, type AssignmentScope, type PolicySummary, type PolicyTemplate,
} from '../api/leave';
import { listRoles, type Role } from '../api/roles';

/**
 * Leave policies (CF_HRMS_HIRING_SPEC.md §8.4) — two questions, two tabs:
 *
 *   Policies           WHAT leave there is: each policy as a card, with the
 *                      leave it grants in one line and where it is used.
 *   Where it applies   WHO gets which policy: the company default, then any
 *                      location that differs, then any department label that
 *                      differs (spec §17), then any role that differs.
 *                      The most specific wins: role, label, location, company.
 *
 * A NEW POLICY STARTS FROM SOMETHING: one of the ready-made starting points,
 * a copy of a policy the company already has, or blank. The starting points
 * are the server's, and so is the caution that comes with them — they are a
 * place to begin, to be checked against the state's rules and the company's
 * standing orders, and this screen never calls them anything more.
 *
 * Not here: balances, accrual and applying for leave. This round defines the
 * policies; nothing yet is counted against them.
 */

type TabKey = 'policies' | 'applies';

interface NewPolicy {
  name: string;
  /** `t:<key>` a starting point · `c:<id>` a copy · `blank`. */
  from: string;
}


/**
 * By label (spec §17.1): per group, each label with its own policy select, the
 * positions it reaches (their policy comes from it), and the positions whose
 * department carries two labels pointing to different policies — the label of
 * the group that comes first wins, and the server's line says so.
 * A label does not pass to the departments under one that carries it.
 */
function LabelAssignments({
  assignments, busy, policySelect, canRemove, onAssign,
}: {
  assignments: Assignments;
  busy: string | null;
  policySelect: (value: number | '', onChange: (v: number | null) => void, emptyLabel: string, key: string, label: string) => ReactNode;
  canRemove: boolean;
  onAssign: (labelId: number, policyId: number | null) => void;
}) {
  const labels = assignments.labels ?? [];
  const groups: { groupId: number; groupName: string; labels: AssignmentLabel[] }[] = [];
  for (const l of labels) {
    let g = groups.find((x) => x.groupId === l.groupId);
    if (!g) { g = { groupId: l.groupId, groupName: l.groupName, labels: [] }; groups.push(g); }
    g.labels.push(l);
  }
  // One position is listed once, however many of its labels are in the conflict.
  const conflicts = new Map<number, AssignmentLabel['conflicts'][number]>();
  for (const l of labels) for (const c of l.conflicts) conflicts.set(c.positionId, c);
  return (
    <SectionCard
      title="By label"
      subtitle="A department label can have its own policy: every position in a department carrying it gets it, unless its role has one. Departments under it do not."
    >
      {groups.length === 0 ? (
        <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>The company has no department labels.</Typography>
      ) : (
        <Stack spacing={2}>
          {conflicts.size > 0 && (
            <Callout tone="warning" title={`${conflicts.size} position${conflicts.size === 1 ? ' is' : 's are'} in a department whose labels point to different policies`} sx={{ mb: 0 }}>
              <Typography sx={{ fontSize: 13, lineHeight: 1.55, mb: 0.75 }}>
                The label whose group comes first in the group order wins. Move the groups up or down under Departments › Labels, or give these labels the same policy.
              </Typography>
              <Stack component="ul" spacing={0.25} sx={{ m: 0, pl: 2.5 }} data-label-conflicts="">
                {[...conflicts.values()].slice(0, 30).map((c) => (
                  <Typography component="li" key={c.positionId} sx={{ fontSize: 13, overflowWrap: 'anywhere' }}>
                    <b>{c.positionCode ?? c.title}</b>{c.title && c.positionCode ? ` ${c.title}` : ''}{c.departmentName ? ` · ${c.departmentName}` : ''} — {c.line}
                  </Typography>
                ))}
                {conflicts.size > 30 && <Typography component="li" sx={{ fontSize: 13 }}>and {conflicts.size - 30} more</Typography>}
              </Stack>
            </Callout>
          )}
          {groups.map((g) => (
            <Box key={g.groupId} data-assign-group={g.groupId}>
              <Typography sx={{ fontSize: 12, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--c-text-2)', mb: 0.75 }}>{g.groupName}</Typography>
              <Stack spacing={1}>
                {g.labels.map((l) => (
                  <Box key={l.labelId} data-assign={`label-${l.labelId}`} sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 1.5, rowGap: 0.75 }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 500, flex: '1 1 160px', minWidth: 0, overflowWrap: 'anywhere' }}>{l.name}</Typography>
                    {policySelect(l.policy?.id ?? '', (policyId) => onAssign(l.labelId, policyId), 'No policy of its own', `b${l.labelId}`, `Leave policy for the label ${l.name}`)}
                    {canRemove && l.policy && (
                      <Tooltip title="Take the policy off this label">
                        <IconButton size="small" aria-label={`Remove the policy of the label ${l.name}`} disabled={busy === `b${l.labelId}`} onClick={() => onAssign(l.labelId, null)}>
                          <CloseRounded fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', flex: '1 1 200px', minWidth: 0 }}>
                      {l.policy
                        ? `Reaches ${l.positionCount} position${l.positionCount === 1 ? '' : 's'}${l.conflicts.length ? ` · ${l.conflicts.length} with a label conflict` : ''}`
                        : 'Positions follow their location or the company'}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Box>
          ))}
        </Stack>
      )}
    </SectionCard>
  );
}

export default function LeavePolicies() {
  const { company = '' } = useParams<{ company: string }>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const can = useCan();
  const canManage = can.leave.edit;
  const canRemove = can.leave.remove;
  // The role list belongs to Roles: it is only asked for by someone who may see it.
  const canPickRole = canManage && can.roles.view;
  const tab: TabKey = params.get('tab') === 'applies' ? 'applies' : 'policies';

  const [policies, setPolicies] = useState<PolicySummary[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [templates, setTemplates] = useState<{ note: string; templates: PolicyTemplate[] } | null>(null);
  const [creating, setCreating] = useState<NewPolicy | null>(null);

  const [assignments, setAssignments] = useState<Assignments | null>(null);
  const [assignError, setAssignError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [roleDraft, setRoleDraft] = useState<{ role: Role | null; policyId: number | '' } | null>(null);

  const load = useCallback(() => {
    leaveApi
      .policies()
      .then((list) => {
        setPolicies(list);
        setError(null);
      })
      .catch((e) => {
        setError(e);
        setPolicies((cur) => cur ?? []);
      });
  }, []);
  const loadAssignments = useCallback(() => {
    leaveApi
      .assignments()
      .then((a) => {
        setAssignments(a);
        setAssignError(null);
      })
      .catch(setAssignError);
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (tab === 'applies') loadAssignments();
  }, [tab, loadAssignments]);

  const openCreate = () => {
    setCreating({ name: '', from: '' });
    if (!templates) leaveApi.templates().then(setTemplates).catch(() => setTemplates({ note: '', templates: [] }));
  };

  const create = async () => {
    if (!creating) return;
    const body: Parameters<typeof leaveApi.createPolicy>[0] = { name: creating.name.trim() };
    if (creating.from.startsWith('t:')) body.fromTemplate = creating.from.slice(2);
    if (creating.from.startsWith('c:')) body.copyOf = Number(creating.from.slice(2));
    const policy = await leaveApi.createPolicy(body);
    toast.success('Leave policy created. Check each leave type, then save.');
    navigate(`/${company}/cf_hrms/leave-policies/${policy.id}`);
  };

  const usable = useMemo(() => (policies ?? []).filter((p) => p.status !== 'ARCHIVED'), [policies]);

  const filters = useListFilters(['status', 'used']);
  const [doomed, setDoomed] = useState<PolicySummary | null>(null);
  // Applied somewhere = the company default, a location or a role (the same test as the policy page).
  const appliedAnywhere = (p: PolicySummary) => !!p.usedBy && (p.usedBy.company || p.usedBy.locations > 0 || (p.usedBy.labels ?? 0) > 0 || p.usedBy.roles > 0);
  const defs: FilterDef[] = useMemo(
    () => [
      {
        key: 'status',
        label: 'Status',
        options: [
          { value: 'DRAFT', label: POLICY_STATUS_LABEL.DRAFT ?? 'Draft' },
          { value: 'ACTIVE', label: POLICY_STATUS_LABEL.ACTIVE ?? 'Active' },
          { value: 'ARCHIVED', label: POLICY_STATUS_LABEL.ARCHIVED ?? 'Archived' },
        ],
      },
      {
        key: 'used',
        label: 'Applied somewhere',
        options: YES_NO_OPTIONS,
      },
    ],
    [],
  );
  const searchText = filters.params.q ?? '';
  const statusParam = filters.values.status;
  const usedParam = filters.values.used;
  const shown = useMemo(
    () =>
      (policies ?? []).filter((p) => {
        // The server's rules for GET /leave/policies: the search is in the name or the code.
        if (statusParam && p.status.toLowerCase() !== statusParam.toLowerCase()) return false;
        if (!matchesFlag(usedParam, appliedAnywhere(p))) return false;
        return matchesQuery([p.name, p.code], searchText);
      }),
    [policies, statusParam, usedParam, searchText],
  );

  const assign = async (key: string, body: { scope: AssignmentScope; locationId?: number; roleId?: number; labelId?: number; policyId: number | null }) => {
    setBusy(key);
    try {
      setAssignments(await leaveApi.assign(body));
      load();
    } catch (e) {
      toast.error(errorMessage(e, 'That could not be changed.'));
    } finally {
      setBusy(null);
    }
  };

  const openRoleDraft = () => {
    setRoleDraft({ role: null, policyId: '' });
    if (!roles) listRoles().then((r) => setRoles(r.items ?? [])).catch(() => setRoles([]));
  };

  const policySelect = (value: number | '', onChange: (v: number | null) => void, emptyLabel: string, key: string, label: string) => (
    <TextField
      select
      size="small"
      value={value}
      disabled={!canManage || busy === key}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      slotProps={{ select: { displayEmpty: true }, htmlInput: { 'aria-label': label } }}
      sx={{ minWidth: 220, flex: '0 1 280px' }}
    >
      {/* Going back to "follows the parent" removes an assignment, which is its own right. */}
      {(value === '' || canRemove) && <MenuItem value="">{emptyLabel}</MenuItem>}
      {/* Only an active policy can be applied; a draft is listed so it is not a mystery where it went. */}
      {usable.map((p) => (
        <MenuItem key={p.id} value={p.id} disabled={p.status !== 'ACTIVE'}>
          {p.name}{p.status !== 'ACTIVE' ? ' — a draft; make it active first' : ''}
        </MenuItem>
      ))}
      {/* A policy that is applied but archived still shows as what is chosen. */}
      {value !== '' && !usable.some((p) => p.id === value) && <MenuItem value={value}>{(policies ?? []).find((p) => p.id === value)?.name ?? 'A policy'}</MenuItem>}
    </TextField>
  );

  return (
    <Box sx={{ maxWidth: 1100 }}>
      <PageHeader
        title="Leave policies"
        subtitle="what leave people get, and who gets which policy"
      />

      <Tabs
        value={tab}
        onChange={(_, v: TabKey) =>
          setParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              if (v === 'applies') next.set('tab', 'applies');
              else next.delete('tab');
              return next;
            },
            { replace: true },
          )
        }
        sx={{ mb: 2, borderBottom: '1px solid var(--c-divider)' }}
      >
        <Tab value="policies" label={`Policies${policies ? ` · ${policies.length}` : ''}`} />
        <Tab value="applies" label="Where it applies" />
      </Tabs>

      {tab === 'policies' && (
        <ListToolbar
          filters={filters}
          defs={defs}
          shown={shown.length}
          total={(policies ?? []).length}
          noun={['policy', 'policies']}
          searchPlaceholder="Search policies by name or code"
          add={canManage ? { label: 'New policy', onClick: openCreate } : undefined}
        />
      )}

      {!!error && <ErrorNotice error={error} onRetry={load} sx={{ mb: 2 }} />}

      {tab === 'policies' &&
        (policies == null ? (
          <ListSkeleton rows={3} />
        ) : policies.length === 0 && !error ? (
          <EmptyState
            icon={<EventAvailableRounded />}
            title="No leave policy yet"
            hint="A leave policy says what leave people get — how many days of each kind, how it is earned, what happens to what is left. Start from a ready-made one and change it."
            action={canManage ? <Button size="small" variant="contained" onClick={openCreate}>New policy</Button> : undefined}
          />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={<EventAvailableRounded />}
            title="No policy matches"
            hint="Nothing fits the search and filters."
            action={<Button size="small" onClick={filters.clear}>Clear</Button>}
          />
        ) : (
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 1.5 }}>
            {shown.map((p) => (
              <Box
                component="li"
                key={p.id}
                sx={{
                  minWidth: 0,
                  position: 'relative',
                  borderRadius: 'var(--r-md)',
                  border: '1px solid var(--c-border)',
                  background: 'var(--c-surface)',
                  '&:hover': { borderColor: 'var(--c-primary-500)' },
                }}
              >
                <Box sx={{ position: 'absolute', top: 6, right: 6, zIndex: 1 }}>
                  <RowActions
                    name={p.name}
                    onEdit={canManage ? () => navigate(`/${company}/cf_hrms/leave-policies/${p.id}`) : undefined}
                    onRemove={canRemove ? () => setDoomed(p) : undefined}
                  />
                </Box>
                <Box
                  component="button"
                  type="button"
                  data-policy={p.id}
                  onClick={() => navigate(`/${company}/cf_hrms/leave-policies/${p.id}`)}
                  sx={{
                    width: '100%',
                    height: '100%',
                    textAlign: 'left',
                    font: 'inherit',
                    color: 'inherit',
                    cursor: 'pointer',
                    p: 2,
                    pr: 10,
                    border: 0,
                    borderRadius: 'var(--r-md)',
                    background: 'transparent',
                    '&:focus-visible': { outline: '2px solid var(--c-primary-500)', outlineOffset: 1 },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 0.5 }}>
                    <Typography sx={{ fontSize: 16, fontWeight: 600, overflowWrap: 'anywhere' }}>{p.name}</Typography>
                    <ToneBadge tone={POLICY_STATUS_TONE[p.status] ?? 'neutral'} noIcon label={POLICY_STATUS_LABEL[p.status] ?? p.status} />
                  </Box>
                  {/* The server's own line: "Casual 12 · Sick 12 · Earned 15 · Maternity · Paternity". */}
                  <Typography sx={{ fontSize: 14, lineHeight: 1.5, overflowWrap: 'anywhere' }}>{p.headline || 'No leave in it yet'}</Typography>
                  {p.description && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.5, overflowWrap: 'anywhere' }}>{p.description}</Typography>}
                  <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 1 }}>{usedByLine(p.usedBy)}</Typography>
                </Box>
              </Box>
            ))}
          </Box>
        ))}

      {tab === 'applies' && (
        <>
          {!!assignError && <ErrorNotice error={assignError} onRetry={loadAssignments} sx={{ mb: 2 }} />}
          {!assignments ? (
            !assignError && <ListSkeleton rows={4} />
          ) : (
            <Stack spacing={2}>
              <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)', lineHeight: 1.55, maxWidth: 760 }}>
                A position gets the policy of its role if the role has one of its own; otherwise the policy of a label
                its department carries; otherwise the policy of its location; otherwise the company’s. The most specific
                one wins.
              </Typography>

              {assignments.unassignedPositions > 0 && (
                <Callout tone="warning" title={`${assignments.unassignedPositions} position${assignments.unassignedPositions === 1 ? ' has' : 's have'} no leave policy`} sx={{ mb: 0 }}>
                  <Typography sx={{ fontSize: 13, lineHeight: 1.55 }}>
                    Nothing covers them: no company policy is chosen, and neither their location, their department’s labels nor their role has one.
                    Choosing a company policy covers everyone who is not covered more specifically.
                  </Typography>
                </Callout>
              )}

              <SectionCard title="The company" subtitle="For everyone, unless their location, a label of their department or their role says otherwise.">
                <Box data-assign="company" sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
                  {policySelect(assignments.company.policy?.id ?? '', (policyId) => void assign('company', { scope: 'COMPANY', policyId }), 'No company policy', 'company', 'The company’s leave policy')}
                </Box>
              </SectionCard>

              <SectionCard title="Locations" subtitle="A location can have its own policy. Otherwise it follows the company.">
                {assignments.locations.length === 0 ? (
                  <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>The company has no locations.</Typography>
                ) : (
                  <Stack spacing={1}>
                    {assignments.locations.map((l) => (
                      <Box
                        key={l.locationId}
                        data-assign={`location-${l.locationId}`}
                        sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 1.5, rowGap: 0.75 }}
                      >
                        <Typography sx={{ fontSize: 14, fontWeight: 500, flex: '1 1 160px', minWidth: 0, overflowWrap: 'anywhere' }}>{l.name}</Typography>
                        {policySelect(l.policy?.id ?? '', (policyId) => void assign(`l${l.locationId}`, { scope: 'LOCATION', locationId: l.locationId, policyId }), 'Same as the company', `l${l.locationId}`, `Leave policy for ${l.name}`)}
                        {/* What people there actually get, in the server's words. */}
                        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', flex: '1 1 200px', minWidth: 0, overflowWrap: 'anywhere' }}>{l.effective?.line}</Typography>
                      </Box>
                    ))}
                  </Stack>
                )}
              </SectionCard>

              <LabelAssignments assignments={assignments} busy={busy} policySelect={policySelect} canRemove={canRemove}
                onAssign={(labelId, policyId) => void assign(`b${labelId}`, { scope: 'LABEL', labelId, policyId })} />

              <SectionCard
                title="Roles with their own policy"
                subtitle="A role’s policy wins over a label’s and a location’s — for every position of that role."
                action={canPickRole && usable.length > 0 ? <Button size="small" startIcon={<AddRounded />} onClick={openRoleDraft}>Give a role its own policy</Button> : undefined}
              >
                {assignments.roles.length === 0 ? (
                  <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>No role has its own policy. Every position follows its location or the company.</Typography>
                ) : (
                  <Stack spacing={1}>
                    {assignments.roles.map((r) => (
                      <Box key={r.roleId} data-assign={`role-${r.roleId}`} sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 1.5, rowGap: 0.75 }}>
                        <Box sx={{ flex: '1 1 180px', minWidth: 0 }}>
                          <Typography sx={{ fontSize: 14, fontWeight: 500, overflowWrap: 'anywhere' }}>{r.title}</Typography>
                          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{r.positionCount} position{r.positionCount === 1 ? '' : 's'}</Typography>
                        </Box>
                        {policySelect(r.policy?.id ?? '', (policyId) => void assign(`r${r.roleId}`, { scope: 'ROLE', roleId: r.roleId, policyId }), 'Follows its label or location', `r${r.roleId}`, `Leave policy for ${r.title}`)}
                        {canRemove && (
                          <Tooltip title="Back to following the location">
                            <IconButton size="small" aria-label={`Remove the policy of ${r.title}`} disabled={busy === `r${r.roleId}`} onClick={() => void assign(`r${r.roleId}`, { scope: 'ROLE', roleId: r.roleId, policyId: null })}>
                              <CloseRounded fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    ))}
                  </Stack>
                )}
              </SectionCard>
            </Stack>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!doomed}
        title={`Delete ${doomed?.name ?? 'this policy'}?`}
        danger
        confirmLabel="Delete"
        body={
          doomed && appliedAnywhere(doomed)
            ? `${usedByLine(doomed.usedBy)}. A policy that applies somewhere cannot be deleted — choose another policy there first, under Where it applies.`
            : 'It is not applied anywhere. This cannot be undone.'
        }
        onClose={() => setDoomed(null)}
        onConfirm={async () => {
          if (!doomed) return;
          // The server refuses a policy that is still applied, and says where.
          await leaveApi.removePolicy(doomed.id);
          toast.success('Leave policy deleted.');
          load();
        }}
      />

      {/* ── New policy: choose where to start ──────────────────────────────── */}
      <FormDialog
        open={!!creating}
        title="New leave policy"
        subtitle="Choose where to start. Everything can be changed afterwards."
        onClose={() => setCreating(null)}
        onSubmit={create}
        submitLabel="Create policy"
        submitDisabled={!creating?.name.trim() || !creating?.from}
        maxWidth="sm"
        enterSubmits={false}
      >
        {creating && (
          <Stack spacing={1.5} sx={{ pt: 0.75 }}>
            <TextField label="Name" required size="small" autoFocus placeholder="Office staff" value={creating.name} onChange={(e) => setCreating({ ...creating, name: e.target.value })} />

            {/* The server's own caution, as written. */}
            {templates?.note && (
              <Callout tone="warning" title="These are starting points, not advice" sx={{ mb: 0 }}>
                <Typography data-templatenote="" sx={{ fontSize: 13, lineHeight: 1.55 }}>{templates.note}</Typography>
              </Callout>
            )}

            <Box role="radiogroup" aria-label="Where to start" sx={{ display: 'grid', gap: 0.75 }}>
              {!templates && <ListSkeleton rows={3} />}
              {[
                ...(templates?.templates ?? []).map((t) => ({ key: `t:${t.key}`, name: t.name, description: t.description, kind: 'Starting point' })),
                ...(policies ?? []).map((p) => ({ key: `c:${p.id}`, name: `A copy of ${p.name}`, description: p.headline, kind: 'Copy' })),
                // A server with no starting points still lets a policy be made.
                ...(templates && !templates.templates.some((t) => /blank/i.test(t.key)) ? [{ key: 'blank', name: 'Blank', description: 'No leave in it. Add each leave type yourself.', kind: 'Starting point' }] : []),
              ].map((o) => {
                const on = creating.from === o.key;
                return (
                  <Box
                    key={o.key}
                    component="button"
                    type="button"
                    role="radio"
                    aria-checked={on}
                    data-start={o.key}
                    onClick={() => setCreating({ ...creating, from: o.key })}
                    sx={{
                      textAlign: 'left',
                      font: 'inherit',
                      color: 'inherit',
                      cursor: 'pointer',
                      px: 1.5,
                      py: 1,
                      borderRadius: 'var(--r-sm)',
                      border: '1px solid',
                      borderColor: on ? 'var(--c-primary-500)' : 'var(--c-border)',
                      background: on ? 'var(--c-primary-50)' : 'var(--c-surface)',
                      '&:focus-visible': { outline: '2px solid var(--c-primary-500)', outlineOffset: 1 },
                    }}
                  >
                    <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{o.name}</Typography>
                    {o.description && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', lineHeight: 1.5, overflowWrap: 'anywhere' }}>{o.description}</Typography>}
                  </Box>
                );
              })}
            </Box>
          </Stack>
        )}
      </FormDialog>

      {/* ── Give a role its own policy ─────────────────────────────────────── */}
      <FormDialog
        open={!!roleDraft}
        title="Give a role its own policy"
        subtitle="Every position of the role then gets this policy, whatever its location."
        onClose={() => setRoleDraft(null)}
        onSubmit={async () => {
          if (!roleDraft?.role || roleDraft.policyId === '') return;
          setAssignments(await leaveApi.assign({ scope: 'ROLE', roleId: roleDraft.role.id, policyId: roleDraft.policyId }));
          load();
          toast.success(`${roleDraft.role.title} now has its own leave policy.`);
        }}
        submitLabel="Apply to the role"
        submitDisabled={!roleDraft?.role || roleDraft?.policyId === ''}
        maxWidth="xs"
        enterSubmits={false}
      >
        {roleDraft && (
          <Stack spacing={1.5} sx={{ pt: 0.75 }}>
            <Autocomplete
              size="small"
              options={(roles ?? []).filter((r) => !assignments?.roles.some((x) => x.roleId === r.id))}
              loading={roles == null}
              value={roleDraft.role}
              onChange={(_, role) => setRoleDraft({ ...roleDraft, role })}
              getOptionLabel={(r) => r.title}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(p) => <TextField {...p} label="Role" placeholder="Search a role" />}
            />
            <TextField
              select
              size="small"
              label="Leave policy"
              value={roleDraft.policyId}
              onChange={(e) => setRoleDraft({ ...roleDraft, policyId: e.target.value === '' ? '' : Number(e.target.value) })}
            >
              {usable.map((p) => (
                <MenuItem key={p.id} value={p.id} disabled={p.status !== 'ACTIVE'}>
                  <Box>
                    <Box sx={{ fontSize: 14 }}>{p.name}{p.status !== 'ACTIVE' ? ' — a draft; make it active first' : ''}</Box>
                    <Box sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{p.headline}</Box>
                  </Box>
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        )}
      </FormDialog>
    </Box>
  );
}
