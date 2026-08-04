import { useCallback, useEffect, useState } from 'react';
import {
  Autocomplete, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, MenuItem, TextField, Tooltip, Typography,
} from '@mui/material';
import PersonAddAlt1Rounded from '@mui/icons-material/PersonAddAlt1Rounded';
import PersonOffRounded from '@mui/icons-material/PersonOffRounded';
import PersonRounded from '@mui/icons-material/PersonRounded';
import BadgeRounded from '@mui/icons-material/BadgeRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';

import {
  getCrew, getRoster, addWorker, assignWorker, unassignWorker, setAway,
  WORKER_TYPE_LABELS, type CrewMember, type Worker, type WorkerType,
} from '../api/workers';
import { backendMessage } from '../utils/backendMessage';
import { useToast } from './Toast';

/**
 * The crew on one machine, editable in place.
 *
 * Rostering lives here — on the Machine Board card and in the Shift Log —
 * rather than on a settings screen, because a settings screen is where roster
 * data goes to get stale. And stale crew data is worse than none: it is what
 * `no_operator` attribution is computed from, so a roster nobody maintains
 * produces confidently wrong idle-time causes.
 *
 * Note what is NOT here: no break/lunch entry, no per-person time totals, no
 * "hours worked". This panel answers "who is on this machine", which is what
 * traceability and capacity need. It does not measure people, because a number
 * that can only be used against the person entering it stops being true — and
 * these events share a stream with production timing, so the lie would spread.
 * See FAB_ERP_PEOPLE_PLAN.md §0.
 */

const AWAY_REASONS = [
  { value: 'permission', label: 'Permission (left early / came late)' },
  { value: 'leave', label: 'Leave' },
  { value: 'sick', label: 'Sick' },
  { value: 'training', label: 'Training' },
  { value: 'other', label: 'Other' },
];

function hhmm(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Describe time away the way a person would say it, not as a pair of timestamps. */
function describeAway(a: CrewMember['away'][number]): string {
  const from = hhmm(a.fromTs ?? a.from);
  const to = hhmm(a.toTs ?? a.to);
  const reason = a.reason ? ` (${a.reason})` : '';
  if (from && to) return `away ${from}–${to}${reason}`;
  if (from) return `away from ${from}${reason}`;
  return `away${reason}`;
}

export function CrewPanel({
  resourceId,
  resourceName,
  /** Window to show crew for — omit for "right now". */
  from,
  to,
  canManage = true,
  onChanged,
}: {
  resourceId: number;
  resourceName?: string;
  from?: string;
  to?: string;
  canManage?: boolean;
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [roster, setRoster] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [awayFor, setAwayFor] = useState<CrewMember | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, r] = await Promise.all([getCrew(resourceId, from, to), getRoster()]);
      setCrew(c.crew ?? []);
      setRoster(r.workers ?? []);
    } catch (e) {
      toast(backendMessage(e, 'Failed to load the crew.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [resourceId, from, to, toast]);

  useEffect(() => { load(); }, [load]);

  const refresh = async () => { await load(); onChanged?.(); };

  const onMachine = new Set(crew.map((c) => c.workerId));
  const available = roster.filter((w) => w.active && !onMachine.has(w.id));

  async function put(worker: Worker) {
    setBusy(true);
    try {
      await assignWorker(worker.id, resourceId);
      toast(worker.currentResourceName && worker.currentResourceId !== resourceId
        ? `${worker.name} moved from ${worker.currentResourceName}.`
        : `${worker.name} added.`, 'success');
      await refresh();
    } catch (e) { toast(backendMessage(e, 'Failed to assign.'), 'error'); } finally { setBusy(false); }
  }

  async function take(member: CrewMember) {
    setBusy(true);
    try {
      await unassignWorker(member.workerId, resourceId);
      toast(`${member.name} taken off ${resourceName ?? 'the machine'}.`, 'success');
      await refresh();
    } catch (e) { toast(backendMessage(e, 'Failed to remove.'), 'error'); } finally { setBusy(false); }
  }

  if (loading) return <CircularProgress size={18} />;

  return (
    <Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
        {crew.length === 0 && (
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>
            Nobody on this machine yet.
          </Typography>
        )}
        {crew.map((c) => {
          const isAway = c.away.length > 0;
          return (
            <Tooltip
              key={c.workerId}
              title={[
                c.workerType !== 'employee' ? `${WORKER_TYPE_LABELS[c.workerType]}${c.vendorName ? ` · ${c.vendorName}` : ''}` : '',
                ...c.away.map(describeAway),
              ].filter(Boolean).join(' · ') || 'On this machine'}
            >
              <Chip
                size="small"
                icon={isAway ? <PersonOffRounded sx={{ fontSize: 15 }} />
                  : c.workerType === 'employee' ? <PersonRounded sx={{ fontSize: 15 }} />
                    : <BadgeRounded sx={{ fontSize: 15 }} />}
                label={isAway ? `${c.name} — ${describeAway(c.away[0])}` : c.name}
                onDelete={canManage ? () => take(c) : undefined}
                deleteIcon={<CloseRounded />}
                onClick={canManage ? () => setAwayFor(c) : undefined}
                sx={{
                  fontSize: 11.5, height: 24, cursor: canManage ? 'pointer' : 'default',
                  background: isAway ? 'var(--c-warning-50)' : 'var(--c-surface-2)',
                  color: isAway ? 'var(--c-warning-800)' : 'var(--c-text-2)',
                  border: isAway ? '1px solid var(--c-warning-200)' : '1px solid transparent',
                }}
              />
            </Tooltip>
          );
        })}
        {canManage && (
          <Button size="small" variant="text" startIcon={<PersonAddAlt1Rounded fontSize="small" />}
            onClick={() => setAddOpen(true)} disabled={busy} sx={{ fontSize: 12 }}>
            Add someone
          </Button>
        )}
      </Box>

      <AddCrewDialog
        open={addOpen}
        available={available}
        resourceId={resourceId}
        resourceName={resourceName}
        onClose={() => setAddOpen(false)}
        onPick={async (w) => { setAddOpen(false); await put(w); }}
        onCreated={async () => { setAddOpen(false); await refresh(); }}
      />

      <AwayDialog
        member={awayFor}
        onClose={() => setAwayFor(null)}
        onSaved={async () => { setAwayFor(null); await refresh(); }}
      />
    </Box>
  );
}

/**
 * Pick somebody already on the roster, or add a new person in one field.
 *
 * Adding a contractor asks for a name and nothing else mandatory — no email,
 * no account, no invite, nothing to deprovision when the contract ends. That
 * is the whole reason `fab_workers.user_id` is nullable.
 */
function AddCrewDialog({ open, available, resourceId, resourceName, onClose, onPick, onCreated }: {
  open: boolean;
  available: Worker[];
  resourceId: number;
  resourceName?: string;
  onClose: () => void;
  onPick: (w: Worker) => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [type, setType] = useState<WorkerType>('employee');
  const [vendor, setVendor] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setName(''); setType('employee'); setVendor(''); } }, [open]);

  async function create() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await addWorker({ name: name.trim(), workerType: type, vendorName: vendor.trim() || null, resourceId });
      toast(`${name.trim()} added to ${resourceName ?? 'the machine'}.`, 'success');
      onCreated();
    } catch (e) { toast(backendMessage(e, 'Failed to add.'), 'error'); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Add someone to {resourceName ?? 'this machine'}</DialogTitle>
      <DialogContent>
        <Autocomplete<Worker, false, false, false>
          options={available}
          getOptionLabel={(w) => w.name}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          onChange={(_e, w) => { if (w) onPick(w); }}
          renderOption={(props, w) => (
            <Box component="li" {...props} key={w.id}>
              <Box>
                <Typography sx={{ fontSize: 13.5 }}>{w.name}</Typography>
                <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
                  {WORKER_TYPE_LABELS[w.workerType]}
                  {w.vendorName ? ` · ${w.vendorName}` : ''}
                  {/* Say where they are now — assigning them here will move them,
                      and finding that out afterwards is a nasty surprise. */}
                  {w.currentResourceName ? ` · currently on ${w.currentResourceName}` : ''}
                </Typography>
              </Box>
            </Box>
          )}
          renderInput={(params) => <TextField {...params} label="Someone already on the roster" size="small" autoFocus />}
          sx={{ mt: 1, mb: 2.5 }}
        />

        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mb: 1.5 }}>
          Or add somebody new — a contract welder needs no login, just a name.
        </Typography>
        <TextField label="Name" size="small" fullWidth value={name}
          onChange={(e) => setName(e.target.value)} sx={{ mb: 1.5 }} />
        <TextField select label="Type" size="small" fullWidth value={type}
          onChange={(e) => setType(e.target.value as WorkerType)} sx={{ mb: 1.5 }}>
          {(Object.keys(WORKER_TYPE_LABELS) as WorkerType[]).map((k) => (
            <MenuItem key={k} value={k}>{WORKER_TYPE_LABELS[k]}</MenuItem>
          ))}
        </TextField>
        {type !== 'employee' && (
          <TextField label="Agency / supplier (optional)" size="small" fullWidth value={vendor}
            onChange={(e) => setVendor(e.target.value)} />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={create} disabled={saving || !name.trim()}>
          {saving ? <CircularProgress size={18} /> : 'Add & assign'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** "Left early" and "off today" are the same record at different scales. */
function AwayDialog({ member, onClose, onSaved }: {
  member: CrewMember | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [mode, setMode] = useState<'rest_of_day' | 'window' | 'all_day'>('rest_of_day');
  const [fromT, setFromT] = useState('');
  const [toT, setToT] = useState('');
  const [reason, setReason] = useState('permission');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!member) return;
    const now = new Date();
    setMode('rest_of_day');
    setFromT(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
    setToT('');
    setReason('permission');
  }, [member]);

  async function save() {
    if (!member) return;
    setSaving(true);
    try {
      const day = new Date();
      const iso = (hm: string) => new Date(`${day.toISOString().slice(0, 10)}T${hm}:00`).toISOString();
      let from: string;
      let to: string | null;
      if (mode === 'all_day') {
        const s = new Date(day); s.setHours(0, 0, 0, 0);
        const e = new Date(s.getTime() + 86400000);
        from = s.toISOString(); to = e.toISOString();
      } else if (mode === 'window') {
        from = iso(fromT); to = toT ? iso(toT) : null;
      } else {
        from = iso(fromT); to = null; // open-ended: gone for the rest of the day
      }
      await setAway(member.workerId, { from, to, reason });
      toast(`${member.name} marked away.`, 'success');
      onSaved();
    } catch (e) { toast(backendMessage(e, 'Failed to record.'), 'error'); } finally { setSaving(false); }
  }

  return (
    <Dialog open={!!member} onClose={saving ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{member?.name} — time away</DialogTitle>
      <DialogContent>
        <TextField select label="When" size="small" fullWidth value={mode}
          onChange={(e) => setMode(e.target.value as typeof mode)} sx={{ mt: 1, mb: 2 }}>
          <MenuItem value="rest_of_day">Gone for the rest of the day</MenuItem>
          <MenuItem value="window">A set period</MenuItem>
          <MenuItem value="all_day">Off all day</MenuItem>
        </TextField>

        {mode !== 'all_day' && (
          <Box sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
            <TextField label="From" type="time" size="small" value={fromT}
              onChange={(e) => setFromT(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: 1 }} />
            {mode === 'window' && (
              <TextField label="Until" type="time" size="small" value={toT}
                onChange={(e) => setToT(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: 1 }} />
            )}
          </Box>
        )}

        <TextField select label="Reason" size="small" fullWidth value={reason}
          onChange={(e) => setReason(e.target.value)}>
          {AWAY_REASONS.map((r) => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
        </TextField>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving}>
          {saving ? <CircularProgress size={18} /> : 'Record'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
