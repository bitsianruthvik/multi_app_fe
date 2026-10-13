import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { Box, Button, Checkbox, FormControlLabel, Menu, MenuItem, Stack, TextField, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import {
  ConfirmDialog, DetailSkeleton, ErrorNotice, FormDialog, StickyActionBar, Surface, ToneBadge,
  useDetailTitle, useToast,
} from '@shared/ui';
import { useCan } from '../access/can';
import {
  POLICY_STATUS_LABEL, POLICY_STATUS_TONE, blankRule, leaveApi, ruleInputOf, usedByLine,
  type LeaveType, type Policy, type Rule,
} from '../api/leave';
import { LeaveRuleCard } from '../components/LeaveRuleCard';

/**
 * One leave policy, edited (CF_HRMS_HIRING_SPEC.md §8.4).
 *
 * A policy is a name, a leave year, and ONE CARD PER LEAVE TYPE it grants. Each
 * card leads with a sentence the server writes ("12 days a year, earned a day
 * each month…") so the policy can be read top to bottom like a notice on a
 * board, and only then shows the settings behind that sentence.
 *
 * NOTHING IS SAVED UNTIL "Save policy". A policy decides what people are owed,
 * so a change is deliberate: the bar at the bottom says there are unsaved
 * changes, the browser asks before the page is left, and the save sends the
 * whole rule set at once — the server replaces it, and lists every problem it
 * finds by leave type, in words.
 *
 * WHERE THE POLICY APPLIES is not set here: a policy belongs to no role or
 * location by itself. That is the "Where it applies" tab of Leave policies.
 */

interface Draft {
  name: string;
  description: string;
  yearStartsMonth: number;
  status: string;
  rules: Rule[];
}

const draftOf = (p: Policy): Draft => ({
  name: p.name,
  description: p.description ?? '',
  yearStartsMonth: p.yearStartsMonth ?? 1,
  status: p.status,
  rules: [...(p.rules ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
});

/** What a save would send — also how "changed" is told from "the same". */
const payloadOf = (d: Draft) => ({
  name: d.name.trim(),
  description: d.description.trim() || null,
  yearStartsMonth: d.yearStartsMonth,
  status: d.status,
  rules: d.rules.map((r, i) => ruleInputOf(r, i + 1)),
});

export default function LeavePolicyDetail() {
  const { company = '', id = '' } = useParams<{ company: string; id: string }>();
  const policyId = Number(id);
  const navigate = useNavigate();
  const toast = useToast();
  const can = useCan();
  const canManage = can.leave.edit;
  const canRemove = can.leave.remove;

  const [policy, setPolicy] = useState<Policy | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [addMenu, setAddMenu] = useState<HTMLElement | null>(null);
  const [newType, setNewType] = useState<{ code: string; name: string; isPaid: boolean } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const adopt = useCallback((p: Policy) => {
    setPolicy(p);
    setDraft(draftOf(p));
  }, []);

  const load = useCallback(() => {
    setError(null);
    leaveApi.policy(policyId).then(adopt).catch(setError);
    leaveApi.types().then(setTypes).catch(() => setTypes([]));
  }, [policyId, adopt]);

  useEffect(() => {
    load();
  }, [load]);

  useDetailTitle(policy?.name ?? null);

  const dirty = useMemo(
    () => !!policy && !!draft && JSON.stringify(payloadOf(draft)) !== JSON.stringify(payloadOf(draftOf(policy))),
    [policy, draft],
  );

  // Leaving with changes not saved: the browser asks first.
  useEffect(() => {
    if (!dirty) return undefined;
    const ask = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', ask);
    return () => window.removeEventListener('beforeunload', ask);
  }, [dirty]);

  if (!policy || !draft) {
    return error ? <ErrorNotice error={error} fallback="That leave policy could not be loaded." onRetry={load} /> : <DetailSkeleton />;
  }

  const listHref = `/${company}/cf_hrms/leave-policies`;
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const setRule = (i: number, next: Rule) => set({ rules: draft.rules.map((r, j) => (j === i ? next : r)) });
  const unused = types.filter((t) => t.status !== 'INACTIVE' && !draft.rules.some((r) => r.leaveTypeId === t.id));
  const addType = (t: LeaveType) => set({ rules: [...draft.rules, blankRule(t, draft.rules.length + 1)] });

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      adopt(await leaveApi.updatePolicy(policy.id, payloadOf(draft)));
      toast.success('Leave policy saved.');
    } catch (e) {
      // What was set stays on the screen; the server's list says which leave type and what is wrong.
      setSaveError(e);
    } finally {
      setSaving(false);
    }
  };

  const createType = async () => {
    if (!newType) return;
    const { type } = await leaveApi.createType({ code: newType.code.trim().toUpperCase(), name: newType.name.trim(), isPaid: newType.isPaid });
    setTypes((cur) => [...cur, type]);
    addType(type);
    toast.success(`${type.name} added to this policy. Set it up below.`);
  };

  const used = policy.usedBy;
  const inUse = !!used && (used.company || used.locations > 0 || used.roles > 0);

  return (
    <Box sx={{ maxWidth: 980, pb: 8 }}>
      <Button component={RouterLink} to={listHref} size="small" startIcon={<ArrowBackRounded />} sx={{ ml: -0.75, mb: 0.5 }}>
        Leave policies
      </Button>

      <Surface e={2} sx={{ p: { xs: 2, sm: 2.5 }, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
          <Typography component="h1" sx={{ fontSize: 20, fontWeight: 600, overflowWrap: 'anywhere' }}>{draft.name || 'Leave policy'}</Typography>
          <ToneBadge tone={POLICY_STATUS_TONE[draft.status] ?? 'neutral'} noIcon label={POLICY_STATUS_LABEL[draft.status] ?? draft.status} />
          <Box sx={{ flex: 1 }} />
          {canRemove && (
            <Button size="small" color="inherit" startIcon={<DeleteOutlineRounded />} onClick={() => setDeleting(true)}>
              Delete
            </Button>
          )}
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1.4fr) 1fr 1fr' }, gap: 1.5 }}>
          <TextField size="small" label="Name" required value={draft.name} disabled={!canManage} onChange={(e) => set({ name: e.target.value })} />
          <TextField
            select
            size="small"
            label="Leave year"
            value={draft.yearStartsMonth === 4 ? 4 : draft.yearStartsMonth === 1 ? 1 : draft.yearStartsMonth}
            disabled={!canManage}
            onChange={(e) => set({ yearStartsMonth: Number(e.target.value) })}
          >
            <MenuItem value={1}>January to December</MenuItem>
            <MenuItem value={4}>April to March</MenuItem>
            {![1, 4].includes(draft.yearStartsMonth) && <MenuItem value={draft.yearStartsMonth}>Starts in month {draft.yearStartsMonth}</MenuItem>}
          </TextField>
          <TextField select size="small" label="Status" value={draft.status} disabled={!canManage} onChange={(e) => set({ status: e.target.value })}>
            <MenuItem value="DRAFT">Draft — cannot be applied yet</MenuItem>
            <MenuItem value="ACTIVE">Active — can be applied</MenuItem>
            <MenuItem value="ARCHIVED">Archived</MenuItem>
          </TextField>
        </Box>
        <TextField
          size="small"
          fullWidth
          label="Who it is meant for (optional)"
          value={draft.description}
          disabled={!canManage}
          onChange={(e) => set({ description: e.target.value })}
          sx={{ mt: 1.5 }}
        />
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mt: 1.5 }}>
          {usedByLine(used)}.{' '}
          <Box component={RouterLink} to={`${listHref}?tab=applies`} sx={{ color: 'var(--c-primary-700)' }}>
            Where it applies
          </Box>
        </Typography>
      </Surface>

      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 1 }}>
        <Typography component="h2" sx={{ fontSize: 15, fontWeight: 600, flex: '1 1 200px' }}>
          Leave in this policy{draft.rules.length ? ` · ${draft.rules.length}` : ''}
        </Typography>
        {canManage && (
          <Button size="small" variant="outlined" startIcon={<AddRounded />} aria-haspopup="menu" onClick={(e) => setAddMenu(e.currentTarget)}>
            Add a leave type
          </Button>
        )}
        <Menu anchorEl={addMenu} open={!!addMenu} onClose={() => setAddMenu(null)}>
          {unused.map((t) => (
            <MenuItem
              key={t.id}
              onClick={() => {
                addType(t);
                setAddMenu(null);
              }}
            >
              {t.name}
            </MenuItem>
          ))}
          {unused.length === 0 && (
            <Box sx={{ px: 2, py: 0.75, fontSize: 13, color: 'var(--c-text-2)', maxWidth: 260 }}>Every leave type of the company is already in this policy.</Box>
          )}
          <MenuItem
            onClick={() => {
              setNewType({ code: '', name: '', isPaid: true });
              setAddMenu(null);
            }}
            sx={{ color: 'var(--c-primary-700)', borderTop: '1px solid var(--c-divider)', mt: 0.5 }}
          >
            A new leave type…
          </MenuItem>
        </Menu>
      </Box>

      {draft.rules.length === 0 ? (
        <Surface e={1} sx={{ p: 2 }}>
          <Typography sx={{ fontSize: 14, color: 'var(--c-text-2)' }}>
            This policy grants no leave yet. Add a leave type — casual leave, sick leave — and say how much of it there is.
          </Typography>
        </Surface>
      ) : (
        <Stack spacing={1.5}>
          {draft.rules.map((r, i) => (
            <LeaveRuleCard
              key={r.leaveTypeId}
              rule={r}
              canEdit={canManage}
              canRemove={canRemove && canManage}
              onChange={(next) => setRule(i, next)}
              onRemove={() => set({ rules: draft.rules.filter((_, j) => j !== i) })}
            />
          ))}
        </Stack>
      )}

      {!!saveError && <ErrorNotice error={saveError} fallback="That could not be saved. What you set is still here." sx={{ mt: 2 }} />}

      {canManage && (
        <StickyActionBar visible={dirty} message="This policy has changes that are not saved.">
          <Button disabled={saving} onClick={() => { setDraft(draftOf(policy)); setSaveError(null); }}>
            Undo changes
          </Button>
          <Button variant="contained" disabled={saving || !draft.name.trim()} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save policy'}
          </Button>
        </StickyActionBar>
      )}

      <FormDialog
        open={!!newType}
        title="A new leave type"
        subtitle="A leave type is a name the whole company shares. How much of it there is, is set in each policy."
        onClose={() => setNewType(null)}
        onSubmit={createType}
        submitLabel="Add leave type"
        submitDisabled={!newType?.code.trim() || !newType?.name.trim()}
        maxWidth="xs"
      >
        {newType && (
          <Stack spacing={1.5} sx={{ pt: 0.75 }}>
            <TextField label="Name" required size="small" autoFocus placeholder="Study leave" value={newType.name} onChange={(e) => setNewType({ ...newType, name: e.target.value })} />
            <TextField
              label="Short code"
              required
              size="small"
              placeholder="STL"
              value={newType.code}
              onChange={(e) => setNewType({ ...newType, code: e.target.value.toUpperCase() })}
              helperText="Two to four letters, for lists and reports."
              slotProps={{ htmlInput: { style: { fontFamily: 'var(--font-mono)' }, maxLength: 8 } }}
            />
            <FormControlLabel
              control={<Checkbox size="small" checked={newType.isPaid} onChange={(e) => setNewType({ ...newType, isPaid: e.target.checked })} />}
              label={<Typography sx={{ fontSize: 13.5 }}>Paid leave</Typography>}
            />
          </Stack>
        )}
      </FormDialog>

      <ConfirmDialog
        open={deleting}
        title={`Delete ${policy.name}?`}
        danger
        confirmLabel="Delete"
        body={
          inUse
            ? `${usedByLine(used)}. A policy that applies somewhere cannot be deleted — choose another policy there first, under Where it applies.`
            : 'It is not applied anywhere. This cannot be undone.'
        }
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          // The server refuses a policy that is still applied, and says where.
          await leaveApi.removePolicy(policy.id);
          toast.success('Leave policy deleted.');
          navigate(listHref);
        }}
      />
    </Box>
  );
}
