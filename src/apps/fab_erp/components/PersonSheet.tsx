/**
 * PersonSheet.tsx — one person, opened by clicking their row.
 *
 * Four tabs: who they are, what shift they're on, where they've been, and what
 * they've worked on.
 *
 * THE HISTORY TABS SHOW DEAD ROWS ON PURPOSE. Corrections are append-only: a
 * superseded interval stays on disk, and this renders it struck through rather
 * than hiding it. Hiding it would make append-only storage indistinguishable
 * from edit-in-place at the only point where the difference is visible to a
 * human — and the whole reason for the complexity is that machine and project
 * delays are derived from these rows, so "this number changed, and here is when
 * and by whom" has to be answerable. See FAB_ERP_PEOPLE_PLAN.md §7.3.
 *
 * What this does NOT show: hours worked, time-away totals, attendance rates.
 * It answers "who is this and where were they", not "how were they doing".
 * See §0 for why that boundary is load-bearing rather than squeamish.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, MenuItem, Skeleton, Tab, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';

import {
  getWorker, assignShift, isLive, WORKER_TYPE_LABELS,
  type Worker, type WorkerDetail, type HistoryRow, type ShiftRow,
} from '../api/workers';
import { SideSheet } from './SideSheet';
import { Mono } from './Mono';
import { useToast } from './Toast';
import { backendMessage } from '../utils/backendMessage';

export interface ShiftOption {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
  workingMinutes: number;
}

const fmt = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

/** "22:00 → 06:00 (+1)" — the (+1) is the whole point for a night shift. */
export function shiftSpan(startTime?: string | null, endTime?: string | null): string {
  if (!startTime || !endTime) return '';
  const hm = (t: string) => t.slice(0, 5);
  const crossesMidnight = endTime <= startTime;
  return `${hm(startTime)} → ${hm(endTime)}${crossesMidnight ? ' (+1)' : ''}`;
}

/** Struck-through + faded when a row is no longer the current truth. */
function historySx(r: HistoryRow) {
  return isLive(r)
    ? {}
    : { opacity: 0.5, textDecoration: 'line-through' as const };
}

function StateChip({ r }: { r: HistoryRow }) {
  if (r.deletedAt) {
    return <Chip size="small" label="Withdrawn" sx={{ height: 17, fontSize: 10, bgcolor: 'var(--c-surface-2)' }} />;
  }
  if (r.supersededById != null) {
    return (
      <Tooltip title={`Replaced by a later correction (#${r.supersededById})`}>
        <Chip size="small" label="Corrected" sx={{ height: 17, fontSize: 10, bgcolor: 'var(--c-surface-2)' }} />
      </Tooltip>
    );
  }
  if (r.source === 'backfill') {
    return (
      <Tooltip title="Written up after the fact, not recorded as it happened">
        <Chip size="small" label="Back-entered" sx={{ height: 17, fontSize: 10, bgcolor: 'var(--c-info-50)', color: 'var(--c-info-800)' }} />
      </Tooltip>
    );
  }
  return null;
}

function Row({ children, r }: { children: React.ReactNode; r: HistoryRow }) {
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 1, py: 0.85,
      borderBottom: '1px solid var(--c-border)', fontSize: 12.5,
    }}>
      <Box sx={{ flex: 1, minWidth: 0, ...historySx(r) }}>{children}</Box>
      <StateChip r={r} />
    </Box>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', py: 2 }}>{children}</Typography>;
}

export function PersonSheet({
  worker, shifts, open, onClose, onEdit, onChanged, canManage,
}: {
  worker: Worker | null;
  shifts: ShiftOption[];
  open: boolean;
  onClose: () => void;
  onEdit: () => void;
  onChanged: () => void;
  canManage: boolean;
}) {
  const { toast } = useToast();
  const [tab, setTab] = useState(0);
  const [detail, setDetail] = useState<WorkerDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [newShiftId, setNewShiftId] = useState<number | ''>('');
  // Defaults to blank = "from now". A date here is a backdated change, which the
  // backend records as source='backfill' and re-derives attribution over.
  const [shiftFrom, setShiftFrom] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!worker) return;
    setLoading(true); setErr('');
    try {
      setDetail(await getWorker(worker.id));
    } catch (e) {
      setErr(backendMessage(e, 'Failed to load this person.'));
    } finally {
      setLoading(false);
    }
  }, [worker]);

  useEffect(() => { if (open && worker) { setTab(0); void load(); } }, [open, worker, load]);

  async function saveShift() {
    if (!worker || !newShiftId) return;
    setSaving(true);
    try {
      await assignShift(worker.id, Number(newShiftId), shiftFrom ? new Date(shiftFrom).toISOString() : undefined);
      toast('Shift set.', 'success');
      setNewShiftId(''); setShiftFrom('');
      await load(); onChanged();
    } catch (e) {
      toast(backendMessage(e, 'Failed to set the shift.'), 'error');
    } finally {
      setSaving(false);
    }
  }

  const currentShift: ShiftRow | undefined = detail?.shifts.find(isLive);

  return (
    <SideSheet
      open={open}
      onClose={onClose}
      width={560}
      title={worker?.name ?? ''}
      subtitle={worker ? `${WORKER_TYPE_LABELS[worker.workerType]}${worker.vendorName ? ` · ${worker.vendorName}` : ''}` : undefined}
      actions={canManage ? <Button size="small" variant="contained" onClick={onEdit}>Edit details</Button> : undefined}
    >
      {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 1.5, minHeight: 36 }}>
        <Tab label="Details" sx={{ minHeight: 36, fontSize: 12.5 }} />
        <Tab label="Shift" sx={{ minHeight: 36, fontSize: 12.5 }} />
        <Tab label={`History${detail ? ` (${detail.assignments.length})` : ''}`} sx={{ minHeight: 36, fontSize: 12.5 }} />
        <Tab label="Tasks" sx={{ minHeight: 36, fontSize: 12.5 }} />
      </Tabs>

      {loading && <Skeleton variant="rounded" height={180} />}

      {!loading && detail && tab === 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 1.25, fontSize: 13 }}>
          {([
            ['Badge', worker?.code ? <Mono chip>{worker.code}</Mono> : '—'],
            ['Type', WORKER_TYPE_LABELS[worker!.workerType]],
            ['Agency', worker?.vendorName ?? '—'],
            ['Phone', worker?.phone ?? '—'],
            ['On machine', worker?.currentResourceName ?? 'Not on a machine'],
            ['Shift', currentShift ? `${currentShift.shiftName} · ${shiftSpan(currentShift.startTime, currentShift.endTime)}` : 'No shift set'],
            ['Login', worker?.userId ? 'Yes' : 'No — floor only'],
            ['Status', worker?.active ? 'Active' : 'Inactive'],
          ] as [string, React.ReactNode][]).map(([k, v]) => (
            <Box key={k} sx={{ display: 'contents' }}>
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{k}</Typography>
              <Box sx={{ fontSize: 13 }}>{v}</Box>
            </Box>
          ))}
        </Box>
      )}

      {!loading && detail && tab === 1 && (
        <Box>
          {canManage && (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mb: 2 }}>
              <TextField
                select size="small" label="Move to shift" sx={{ flex: 1 }}
                value={newShiftId} onChange={(e) => setNewShiftId(Number(e.target.value))}
              >
                {shifts.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.name} · {shiftSpan(s.startTime, s.endTime)}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                size="small" type="datetime-local" label="From" sx={{ width: 200 }}
                InputLabelProps={{ shrink: true }}
                value={shiftFrom} onChange={(e) => setShiftFrom(e.target.value)}
                helperText="Blank = now. A past time is a backdated change."
              />
              <Button size="small" variant="contained" disabled={!newShiftId || saving} onClick={saveShift} sx={{ mt: 0.25 }}>
                Set
              </Button>
            </Box>
          )}

          {detail.shifts.length === 0 ? (
            <Empty>
              No shift set. Until somebody is on a shift, this person contributes no
              working time to the machines they're assigned to.
            </Empty>
          ) : detail.shifts.map((s) => (
            <Row key={s.id} r={s}>
              <Typography sx={{ fontSize: 13 }}>
                {s.shiftName ?? 'Unknown shift'}{' '}
                <Box component="span" sx={{ color: 'var(--c-text-3)' }}>{shiftSpan(s.startTime, s.endTime)}</Box>
              </Typography>
              <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
                {fmt(s.fromTs)} → {s.toTs ? fmt(s.toTs) : 'ongoing'}
                {s.calendarName ? ` · ${s.calendarName}` : ''}
              </Typography>
            </Row>
          ))}
        </Box>
      )}

      {!loading && detail && tab === 2 && (
        detail.assignments.length === 0 ? <Empty>Never assigned to a machine.</Empty> : (
          <Box>
            {detail.assignments.map((a) => (
              <Row key={a.id} r={a}>
                <Typography sx={{ fontSize: 13 }}>
                  {a.kind === 'away'
                    ? `Away${a.reason ? ` — ${a.reason}` : ''}`
                    : (a.resourceName ?? 'Unknown machine')}
                </Typography>
                <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
                  {fmt(a.fromTs)} → {a.toTs ? fmt(a.toTs) : 'ongoing'}
                  {a.enteredByName ? ` · by ${a.enteredByName}` : ''}
                </Typography>
              </Row>
            ))}
          </Box>
        )
      )}

      {!loading && detail && tab === 3 && (
        detail.tasks.length === 0 ? (
          <Empty>
            No tasks recorded against this person yet. Tasks are linked when work is
            started or written up against them.
          </Empty>
        ) : (
          <Box>
            {detail.tasks.map((t) => (
              <Row key={t.id} r={t}>
                <Typography sx={{ fontSize: 13 }}>
                  {t.operationName ?? `Task #${t.taskId}`}
                  {t.role ? <Box component="span" sx={{ color: 'var(--c-text-3)' }}> · {t.role}</Box> : null}
                </Typography>
                <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
                  {fmt(t.fromTs)} → {t.toTs ? fmt(t.toTs) : 'ongoing'}
                  {t.resourceName ? ` · ${t.resourceName}` : ''}
                </Typography>
              </Row>
            ))}
          </Box>
        )
      )}
    </SideSheet>
  );
}
