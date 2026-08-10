/**
 * FlowRules.tsx — which operation flow an item gets, decided per LEVEL.
 *
 * Assigning flows is not a per-item job. On a real order every girder segment
 * gets the same assembly flow and every part the same fabrication flow bar the
 * drilled ones, so a rule reads:
 *
 *     (structure type, level, code suffix) -> flow
 *
 * and a DEFAULT is simply a rule with no suffix. One list rather than a
 * "defaults" screen plus an "exceptions" screen, because they are the same
 * thing at different specificity — and splitting them would leave two places to
 * look when a flow comes out wrong.
 *
 * A level with no rule gets no flow, which means nothing to do. That is a valid
 * answer — spans and girders are groupings — so nothing here treats a missing
 * rule as an error.
 *
 * All CRUD via the generic query/mutate API on fabErpFlowRule.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, IconButton, MenuItem, Switch, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import RouteRounded from '@mui/icons-material/RouteRounded';

import { fabQuery, fabMutate } from '../api/client';
import { usePermission } from '@core/hooks/usePermission';
import {
  PageHeader, Surface, Mono, EmptyState, ListSkeleton, useToast, DataTable, ConfirmDialog,
} from '../components';
import { LINE_TYPES, BOQ_LEVELS } from '../types';

interface FlowRule {
  id: number; companyId: number;
  lineType: string | null;
  levelKind: string;
  codeSuffix: string | null;
  flowId: number;
  flowName: string | null;
  active: number;
  notes: string | null;
}
interface FlowOption { id: number; name: string; code?: string }

const LEVEL_LABEL: Record<string, string> = Object.fromEntries(BOQ_LEVELS.map((l) => [l.key, l.label]));
const ANY_TYPE = '__any__';

function errMsg(e: unknown): string {
  const ax = e as { response?: { data?: { message?: string; error?: string } }; message?: string };
  return ax.response?.data?.message ?? ax.response?.data?.error ?? ax.message ?? 'Something went wrong.';
}

/** Same identity the backend matches on — used to spot two rules that collide. */
const ruleKey = (r: { lineType: string | null; levelKind: string; codeSuffix: string | null }) =>
  `${r.lineType ?? ''}|${r.levelKind}|${r.codeSuffix ?? ''}`;

// ── Create / edit ────────────────────────────────────────────────────────────

function RuleDialog({ open, initial, flows, existing, onClose, onSaved }: {
  open: boolean;
  initial: FlowRule | null;
  flows: FlowOption[];
  existing: FlowRule[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [lineType, setLineType] = useState<string>(ANY_TYPE);
  const [levelKind, setLevelKind] = useState('part');
  const [codeSuffix, setCodeSuffix] = useState('');
  const [flowId, setFlowId] = useState<number | ''>('');
  const [active, setActive] = useState(true);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setLineType(initial?.lineType ?? ANY_TYPE);
    setLevelKind(initial?.levelKind ?? 'part');
    setCodeSuffix(initial?.codeSuffix ?? '');
    setFlowId(initial?.flowId ?? '');
    setActive(initial ? initial.active === 1 : true);
    setNotes(initial?.notes ?? '');
    setErr('');
  }, [open, initial]);

  // Normalised the same way the backend reads it off a code, so what you see
  // here is what will actually be matched.
  const normalisedSuffix = (() => {
    const s = codeSuffix.trim().toUpperCase();
    if (!s) return null;
    return s.startsWith('/') ? s : `/${s}`;
  })();

  const draftKey = ruleKey({ lineType: lineType === ANY_TYPE ? null : lineType, levelKind, codeSuffix: normalisedSuffix });
  const clash = existing.find((r) => r.id !== initial?.id && ruleKey(r) === draftKey);

  async function save() {
    if (!flowId) { setErr('Pick the flow this rule assigns.'); return; }
    setSaving(true); setErr('');
    try {
      const payload = {
        line_type: lineType === ANY_TYPE ? null : lineType,
        level_kind: levelKind,
        code_suffix: normalisedSuffix,
        flow_id: flowId,
        active: active ? 1 : 0,
        notes: notes.trim() || null,
      };
      if (initial) await fabMutate('fabErpFlowRule', 'update', { id: initial.id, ...payload });
      else await fabMutate('fabErpFlowRule', 'insert', payload);
      onSaved();
    } catch (e) { setErr(errMsg(e)); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>{initial ? 'Edit rule' : 'New flow rule'}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          <TextField select size="small" label="Applies to" value={lineType}
            onChange={(e) => setLineType(e.target.value)}
            helperText="Any type is the sensible default until jobs differ">
            <MenuItem value={ANY_TYPE}>Any structure type</MenuItem>
            {LINE_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </TextField>

          <TextField select size="small" label="Level" value={levelKind}
            onChange={(e) => setLevelKind(e.target.value)}
            helperText="The level this rule fills in">
            {BOQ_LEVELS.map((l) => <MenuItem key={l.key} value={l.key}>{l.label}</MenuItem>)}
          </TextField>
        </Box>

        <TextField size="small" label="Code suffix" value={codeSuffix} placeholder="/D"
          onChange={(e) => setCodeSuffix(e.target.value)}
          helperText={normalisedSuffix
            ? `Only items whose code ends ${normalisedSuffix} — e.g. IS2${normalisedSuffix}`
            : 'Leave blank to make this the default for that level'} />

        <TextField select size="small" label="Assign this flow" value={flowId}
          onChange={(e) => setFlowId(e.target.value === '' ? '' : Number(e.target.value))}>
          <MenuItem value="">— pick a flow —</MenuItem>
          {flows.map((f) => <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>)}
        </TextField>

        <TextField size="small" label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />

        <FormControlLabel control={<Switch size="small" checked={active} onChange={(e) => setActive(e.target.checked)} />}
          label="Active" />

        {clash && (
          <Alert severity="warning">
            Another rule already covers {LEVEL_LABEL[levelKind] ?? levelKind}
            {normalisedSuffix ? ` with suffix ${normalisedSuffix}` : ' as the default'} for{' '}
            {lineType === ANY_TYPE ? 'any structure type' : lineType} — it assigns{' '}
            <strong>{clash.flowName}</strong>. Two rules matching the same thing make it
            unpredictable which wins; edit that one instead.
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving || !flowId}>
          {initial ? 'Save' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function FlowRules() {
  const canManage = usePermission('fab_erp_flows_manage');
  const { toast } = useToast();
  const [rules, setRules] = useState<FlowRule[]>([]);
  const [flows, setFlows] = useState<FlowOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FlowRule | null>(null);
  const [deleting, setDeleting] = useState<FlowRule | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [r, f] = await Promise.all([
        fabQuery<{ data: FlowRule[] }>('fabErpFlowRule', {
          orderBy: [{ field: 'levelKind', direction: 'asc' }], pagination: { limit: 300 },
        }).then((x) => x.data ?? []),
        fabQuery<{ data: FlowOption[] }>('fabErpOperationFlow', {
          filters: { active: 1 }, orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 200 },
        }).then((x) => x.data ?? []),
      ]);
      setRules(r); setFlows(f);
    } catch (e) { setError(errMsg(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function remove(rule: FlowRule) {
    try {
      await fabMutate('fabErpFlowRule', 'delete', { id: rule.id });
      setDeleting(null);
      toast('Rule removed — that level falls back to its next-best rule, or to nothing to do.');
      load();
    } catch (e) { setError(errMsg(e)); }
  }

  // Levels that no active rule covers. Reported, not warned about: a span with
  // no rule is the normal case.
  const uncovered = useMemo(() => {
    const covered = new Set(rules.filter((r) => r.active === 1).map((r) => r.levelKind));
    return BOQ_LEVELS.filter((l) => !covered.has(l.key)).map((l) => l.label);
  }, [rules]);

  const clashes = useMemo(() => {
    const seen = new Map<string, number>();
    for (const r of rules.filter((x) => x.active === 1)) {
      seen.set(ruleKey(r), (seen.get(ruleKey(r)) ?? 0) + 1);
    }
    return [...seen.values()].filter((n) => n > 1).length;
  }, [rules]);

  if (loading) return <ListSkeleton />;

  return (
    <Box>
      <PageHeader
        title="Flow rules"
        subtitle="Which flow an item gets, decided by its level — not one item at a time"
        actions={canManage ? (
          <Button variant="contained" size="small" startIcon={<AddIcon />}
            onClick={() => { setEditing(null); setDialogOpen(true); }}>
            New rule
          </Button>
        ) : undefined}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Surface e={1} sx={{ p: 2, mb: 2 }}>
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
          A rule reads <strong>structure type + level + code suffix → flow</strong>. A rule with{' '}
          <strong>no suffix is that level&rsquo;s default</strong>; one with a suffix such as{' '}
          <Mono>/D</Mono> only catches items whose code ends that way, like <Mono>IS2/D</Mono>.
          The most specific match wins.
        </Typography>
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mt: 1 }}>
          A level with no rule gets <strong>no flow, which means nothing to do</strong> — that is
          the normal answer for a span or a girder, which are groupings rather than work.
        </Typography>
        {uncovered.length > 0 && (
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mt: 1 }}>
            No rule for: {uncovered.join(', ')} — nothing will be assigned at those levels.
          </Typography>
        )}
        {clashes > 0 && (
          <Alert severity="warning" sx={{ mt: 1.5 }}>
            {clashes} pair(s) of rules match exactly the same thing. Which one wins is not
            something you should have to guess — remove or narrow the duplicates.
          </Alert>
        )}
      </Surface>

      {rules.length === 0 ? (
        <EmptyState
          icon={<RouteRounded />}
          title="No flow rules yet"
          hint="Add one per level — a default for parts, a default for segments, and one for any code suffix such as /D. Until then, Apply on an order will assign nothing."
        />
      ) : (
        <DataTable
          rows={rules}
          getRowId={(r) => r.id}
          storageKey="flow-rules"
          exportName="flow-rules"
          defaultSortKey="levelKind"
          columns={[
            {
              key: 'levelKind', header: 'Level', width: 120,
              render: (r) => LEVEL_LABEL[r.levelKind] ?? r.levelKind,
              sortValue: (r) => BOQ_LEVELS.findIndex((l) => l.key === r.levelKind),
            },
            {
              key: 'codeSuffix', header: 'Applies when', width: 180,
              render: (r) => (r.codeSuffix
                ? <span>code ends <Mono chip>{r.codeSuffix}</Mono></span>
                : <Typography component="span" sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>default for the level</Typography>),
              sortValue: (r) => r.codeSuffix ?? '',
            },
            {
              key: 'lineType', header: 'Structure type', width: 170,
              render: (r) => r.lineType ?? <Typography component="span" sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>any</Typography>,
              sortValue: (r) => r.lineType ?? '',
            },
            {
              key: 'flowName', header: 'Assigns', render: (r) => r.flowName ?? `#${r.flowId}`,
              sortValue: (r) => r.flowName ?? '',
            },
            {
              key: 'active', header: 'Active', width: 90,
              render: (r) => (r.active === 1 ? 'Yes'
                : <Typography component="span" sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>No</Typography>),
              sortValue: (r) => r.active,
            },
            { key: 'notes', header: 'Notes', render: (r) => r.notes ?? '—', sortValue: (r) => r.notes ?? '' },
          ]}
          rowActions={canManage ? (r) => (
            <Box sx={{ display: 'flex', gap: 0.25 }}>
              <Tooltip title="Edit">
                <IconButton size="small" onClick={() => { setEditing(r); setDialogOpen(true); }}>
                  <EditRounded fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Remove">
                <IconButton size="small" color="error" onClick={() => setDeleting(r)}>
                  <DeleteOutlineRounded fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          ) : undefined}
        />
      )}

      <RuleDialog
        open={dialogOpen}
        initial={editing}
        flows={flows}
        existing={rules}
        onClose={() => setDialogOpen(false)}
        onSaved={() => { setDialogOpen(false); toast(editing ? 'Rule saved' : 'Rule created'); load(); }}
      />

      <ConfirmDialog
        open={!!deleting}
        title="Remove this flow rule?"
        entityName={`${LEVEL_LABEL[deleting?.levelKind ?? ''] ?? ''} ${deleting?.codeSuffix ?? 'default'}`}
        confirmLabel="Remove"
        body="Items already assigned keep their flow. Only future applies change."
        onClose={() => setDeleting(null)}
        onConfirm={async () => { if (deleting) await remove(deleting); }}
      />
    </Box>
  );
}
