/**
 * ShiftLog.tsx — end-of-day back-entry for one machine, one day (Issue 3).
 *
 * The screen is shaped like the clipboard it replaces. A supervisor's paper
 * note reads:
 *
 *     Cutter-1, Tuesday
 *       09:00–11:30   WP-01 cut         12 good
 *       11:30–13:00   DOWN — blade change
 *       13:00–16:00   WP-02 cut         10 good, 2 scrap
 *       Ramesh absent
 *
 * — work, downtime and people, one machine, one day. The system could already
 * record all three and put each behind a different screen, two of which
 * couldn't accept a past date at all. So: pick a machine and a date, fill in
 * what happened, press Save once.
 *
 * Decisions that make it fast enough to actually get used:
 *
 *  - **Times, not durations.** People write "9:15–11:40", not "2h 25m". Asking
 *    for a duration forces mental arithmetic at the exact moment someone is
 *    already reluctant to be doing data entry.
 *  - **Each row starts where the last one stopped.** Shifts are mostly
 *    back-to-back, so the common case is: pick the task, type the stop time,
 *    move on. The first row starts at the shift's own start.
 *  - **Blank means "didn't run", not zero.** A row you never touched is not
 *    submitted. Nothing is entered by accident.
 *  - **A coverage meter.** You can see the day add up, and see the gaps —
 *    which is usually what jogs the memory about the downtime nobody wrote down.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Chip, CircularProgress, Divider, IconButton,
  MenuItem, TextField, Tooltip, Typography, createFilterOptions,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ReportProblemRounded from '@mui/icons-material/ReportProblemRounded';

import { useAuth } from '@core/contexts/AuthContext';
import { usePermission } from '@core/hooks/usePermission';
import { isAdminRole } from '@core/utils/roles';
import { fabQuery } from '../api/client';
import {
  getShiftLog, saveShiftLog,
  type ShiftLogResponse, type ShiftLogTask, type WorkEntry, type DowntimeEntry,
} from '../api/shiftLog';
import {
  PageHeader, SectionCard, StickyActionBar, Surface, Mono, EmptyState,
  ListSkeleton, useToast, backendMessage, CrewPanel,
} from '../components';

interface QueryResult<T> { data: T[]; total?: number }
interface ResourceOption { id: number; name: string; code: string | null; plantName: string | null; resourceTypeName: string | null }

const machineFilter = createFilterOptions<ResourceOption>({
  stringify: (o) => `${o.code ?? ''} ${o.name} ${o.plantName ?? ''} ${o.resourceTypeName ?? ''}`,
});

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 'HH:MM' on the log's date → an ISO instant. Blank stays blank. */
function toIso(date: string, hhmm: string): string | null {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  return new Date(`${date}T${hhmm}:00`).toISOString();
}

/** ISO instant → 'HH:MM' in local time, for prefilling from existing data. */
function toHhmm(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function minutesBetween(date: string, from: string, to: string): number {
  const a = toIso(date, from);
  const b = toIso(date, to);
  if (!a || !b) return 0;
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 60000);
}

function fmtMinutes(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

interface WorkRow { key: number; taskId: number | null; start: string; stop: string; good: string; scrap: string; qcFail: boolean }
interface DownRow { key: number; from: string; until: string; state: 'down' | 'off'; reasonCode: string; note: string }

let rowSeq = 0;
const newWorkRow = (start = ''): WorkRow => ({ key: (rowSeq += 1), taskId: null, start, stop: '', good: '', scrap: '', qcFail: false });
const newDownRow = (): DownRow => ({ key: (rowSeq += 1), from: '', until: '', state: 'down', reasonCode: '', note: '' });

export default function ShiftLog() {
  const { toast } = useToast();
  const { user } = useAuth();
  const hasTag = usePermission('fab_erp_time_backfill');
  const canLog = isAdminRole(user?.role) || hasTag;

  const [resources, setResources] = useState<ResourceOption[]>([]);
  const [resource, setResource] = useState<ResourceOption | null>(null);
  const [date, setDate] = useState<string>(todayStr());

  const [data, setData] = useState<ShiftLogResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [workRows, setWorkRows] = useState<WorkRow[]>([]);
  const [downRows, setDownRows] = useState<DownRow[]>([]);

  useEffect(() => {
    fabQuery<QueryResult<ResourceOption>>('fabErpResource', {
      fields: ['id', 'name', 'code', 'plantName', 'resourceTypeName'],
      orderBy: [{ field: 'name', direction: 'asc' }],
      pagination: { limit: 5000 },
    })
      .then((res) => setResources(res.data ?? []))
      .catch(() => setError('Failed to load machines.'));
  }, []);

  const load = useCallback(async () => {
    if (!resource) { setData(null); return; }
    setLoading(true); setError('');
    try {
      const res = await getShiftLog(resource.id, date);
      setData(res);
      // Start with one empty row, opening at the shift's own start time so the
      // most common first entry is already half-filled.
      const shiftStart = res.shift.intervals[0]?.start;
      setWorkRows([newWorkRow(shiftStart ? toHhmm(shiftStart) : '')]);
      setDownRows([]);
    } catch (e) {
      setError(backendMessage(e, 'Failed to load the shift log.'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [resource, date]);

  useEffect(() => { load(); }, [load]);

  const taskById = useMemo(() => new Map((data?.tasks ?? []).map((t) => [t.id, t])), [data]);
  const usedTaskIds = useMemo(() => new Set(workRows.map((r) => r.taskId).filter(Boolean) as number[]), [workRows]);

  const setWork = (key: number, patch: Partial<WorkRow>) =>
    setWorkRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const setDown = (key: number, patch: Partial<DownRow>) =>
    setDownRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  /** Next row opens where this one closed — shifts are mostly back-to-back. */
  const addWorkRow = () => {
    const last = workRows[workRows.length - 1];
    setWorkRows((rows) => [...rows, newWorkRow(last?.stop || '')]);
  };

  const accounted = useMemo(() => {
    const w = workRows.reduce((a, r) => a + (r.start && r.stop ? minutesBetween(date, r.start, r.stop) : 0), 0);
    const d = downRows.reduce((a, r) => a + (r.from && r.until ? minutesBetween(date, r.from, r.until) : 0), 0);
    return { work: w, down: d, total: w + d };
  }, [workRows, downRows, date]);

  const shiftMinutes = data?.shift.minutes ?? 0;
  const coverage = shiftMinutes > 0 ? Math.min(100, (accounted.total / shiftMinutes) * 100) : 0;

  // Only rows the user actually filled in get submitted. A blank row means
  // "this didn't run", not "this ran for zero minutes".
  const filledWork = workRows.filter((r) => r.taskId && r.start);
  const filledDown = downRows.filter((r) => r.from);
  const nothingToSave = filledWork.length === 0 && filledDown.length === 0;

  const rowError = (r: WorkRow): string | null => {
    if (!r.taskId || !r.start) return null;
    if (r.stop && minutesBetween(date, r.start, r.stop) <= 0) return 'Stop must be after start';
    return null;
  };
  const anyRowError = workRows.some((r) => rowError(r) !== null)
    || downRows.some((r) => r.from && r.until && minutesBetween(date, r.from, r.until) <= 0);

  async function save() {
    if (!resource || nothingToSave || anyRowError) return;
    setSaving(true); setError('');
    try {
      const work: WorkEntry[] = filledWork.map((r) => ({
        taskId: r.taskId!,
        startedAt: toIso(date, r.start)!,
        completedAt: r.stop ? toIso(date, r.stop) : null,
        producedQty: r.good === '' ? null : Number(r.good),
        scrapQty: r.scrap === '' ? null : Number(r.scrap),
        qcResult: r.qcFail ? 'fail' : 'pass',
      }));
      const downtime: DowntimeEntry[] = filledDown.map((r) => ({
        from: toIso(date, r.from)!,
        until: r.until ? toIso(date, r.until) : null,
        state: r.state,
        reasonCode: r.reasonCode || null,
        note: r.note || null,
      }));
      const res = await saveShiftLog({ resourceId: resource.id, date, work, downtime, absences: [] });
      const parts = [
        res.workLogged ? `${res.workLogged} job${res.workLogged === 1 ? '' : 's'}` : null,
        res.downtimeLogged ? `${res.downtimeLogged} downtime period${res.downtimeLogged === 1 ? '' : 's'}` : null,
      ].filter(Boolean);
      toast(`Logged ${parts.join(' · ')}.`, 'success');
      if (res.warnings?.length) res.warnings.forEach((w) => toast(w, 'info'));
      await load();
    } catch (e) {
      const msg = backendMessage(e, 'Failed to save the shift log.');
      setError(msg);
      toast(msg, 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!canLog) {
    return (
      <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
        <PageHeader title="Shift Log" subtitle="Write up a machine's day from paper" />
        <EmptyState title="You don't have back-entry access" hint="The fab_erp_time_backfill permission is required to log past work." />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <PageHeader
        title="Shift Log"
        subtitle="Write up a machine's whole day at once — the work it ran, the time it was down, and who wasn't in"
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Surface e={1} sx={{ p: 2.5, mb: 2.5, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <Autocomplete<ResourceOption, false, false, false>
          options={resources}
          value={resource}
          getOptionLabel={(o) => (o.code ? `${o.code} — ${o.name}` : o.name)}
          filterOptions={machineFilter}
          autoHighlight
          isOptionEqualToValue={(o, v) => o.id === v.id}
          sx={{ minWidth: 320 }}
          onChange={(_e, v) => setResource(v)}
          renderInput={(params) => <TextField {...params} label="Machine" size="small" placeholder="Select a machine…" />}
        />
        <TextField
          label="Date" type="date" size="small" value={date}
          onChange={(e) => setDate(e.target.value)}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: todayStr() } }}
          sx={{ width: 190 }}
        />
        {data && (
          <Box sx={{ ml: 'auto', minWidth: 260 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--c-text-2)', mb: 0.5 }}>
              <span>Day accounted for</span>
              <span>
                <Box component="span" sx={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--c-text)' }}>
                  {fmtMinutes(accounted.total)}
                </Box>
                {shiftMinutes > 0 && ` of ${fmtMinutes(shiftMinutes)}`}
              </span>
            </Box>
            {/* Work and downtime stack in one bar, so the gap at the end is the
                part of the day nobody has explained yet — which is usually what
                reminds someone about the breakdown they didn't write down. */}
            <Box sx={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: 'var(--c-surface-3)' }}>
              <Box sx={{ width: `${shiftMinutes > 0 ? (accounted.work / shiftMinutes) * 100 : 0}%`, background: 'var(--c-state-running)' }} />
              <Box sx={{ width: `${shiftMinutes > 0 ? (accounted.down / shiftMinutes) * 100 : 0}%`, background: 'var(--c-state-down)' }} />
            </Box>
            {shiftMinutes === 0 && (
              <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)', mt: 0.5 }}>
                No shift calendar for this plant — coverage can't be measured.
              </Typography>
            )}
            {shiftMinutes > 0 && coverage < 100 && accounted.total > 0 && (
              <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)', mt: 0.5 }}>
                {fmtMinutes(shiftMinutes - accounted.total)} unaccounted for
              </Typography>
            )}
          </Box>
        )}
      </Surface>

      {!resource && (
        <EmptyState title="Pick a machine and a date" hint="Then write up what it did — jobs, downtime and absences all go in together." />
      )}

      {resource && loading && <ListSkeleton rows={4} />}

      {resource && !loading && data && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* ── Work ───────────────────────────────────────────────────────── */}
          <SectionCard
            title="Work"
            subtitle="What ran, and when. Leave a row blank if it didn't run."
            action={<Button size="small" startIcon={<AddIcon />} onClick={addWorkRow}>Add job</Button>}
          >
            {data.tasks.length === 0 ? (
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>
                No open or recently-completed tasks for this machine on {date}.
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                {workRows.map((r) => {
                  const task = r.taskId ? taskById.get(r.taskId) : null;
                  const err = rowError(r);
                  const mins = r.start && r.stop ? minutesBetween(date, r.start, r.stop) : 0;
                  return (
                    <Surface key={r.key} e={1} sx={{ p: 1.5, ...(err && { borderColor: 'var(--c-danger-600)' }) }}>
                      <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <Autocomplete<ShiftLogTask, false, false, false>
                          options={data.tasks.filter((t) => !usedTaskIds.has(t.id) || t.id === r.taskId)}
                          value={task ?? null}
                          getOptionLabel={(t) => `${t.itemMark ? `${t.itemMark} · ` : ''}${t.itemName ?? `Item #${t.itemId}`} — ${t.operationName ?? 'Operation'}`}
                          isOptionEqualToValue={(a, b) => a.id === b.id}
                          sx={{ flex: 1, minWidth: 300 }}
                          onChange={(_e, v) => setWork(r.key, { taskId: v?.id ?? null })}
                          renderOption={(props, t) => (
                            <Box component="li" {...props} key={t.id}>
                              <Box sx={{ minWidth: 0 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                  {t.itemMark && <Mono chip>{t.itemMark}</Mono>}
                                  <Typography sx={{ fontSize: 13.5 }}>{t.itemName ?? `Item #${t.itemId}`}</Typography>
                                  {t.alreadyLogged && (
                                    <Tooltip title="Already has times logged for this date">
                                      <CheckCircleRounded sx={{ fontSize: 14, color: 'var(--c-success-600)' }} />
                                    </Tooltip>
                                  )}
                                </Box>
                                <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
                                  {t.operationName ?? 'Operation'} · {t.orderNumber ?? `Order #${t.orderId}`} · seq {t.seqNo}
                                </Typography>
                              </Box>
                            </Box>
                          )}
                          renderInput={(params) => <TextField {...params} label="Job" size="small" placeholder="Which part and operation?" />}
                        />
                        <TextField
                          label="Start" type="time" size="small" sx={{ width: 118 }}
                          value={r.start} onChange={(e) => setWork(r.key, { start: e.target.value })}
                          slotProps={{ inputLabel: { shrink: true } }}
                        />
                        <TextField
                          label="Stop" type="time" size="small" sx={{ width: 118 }}
                          value={r.stop} onChange={(e) => setWork(r.key, { stop: e.target.value })}
                          slotProps={{ inputLabel: { shrink: true } }}
                          helperText={mins > 0 ? fmtMinutes(mins) : ' '}
                        />
                        <TextField
                          label="Good" type="number" size="small" sx={{ width: 92 }}
                          value={r.good} onChange={(e) => setWork(r.key, { good: e.target.value })}
                          placeholder={task?.plannedQty != null ? String(Number(task.plannedQty)) : ''}
                          slotProps={{ htmlInput: { min: 0, step: 'any' } }}
                        />
                        <TextField
                          label="Scrap" type="number" size="small" sx={{ width: 88 }}
                          value={r.scrap} onChange={(e) => setWork(r.key, { scrap: e.target.value })}
                          slotProps={{ htmlInput: { min: 0, step: 'any' } }}
                        />
                        <Tooltip title={r.qcFail ? 'QC failed — a rework task will be queued' : 'QC passed'}>
                          <IconButton
                            size="small"
                            onClick={() => setWork(r.key, { qcFail: !r.qcFail })}
                            sx={{ mt: 0.5, color: r.qcFail ? 'var(--c-danger-600)' : 'var(--c-text-3)' }}
                            aria-label={r.qcFail ? 'Mark QC pass' : 'Mark QC fail'}
                          >
                            <ReportProblemRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Remove row">
                          <IconButton size="small" color="error" sx={{ mt: 0.5 }} disabled={workRows.length <= 1}
                            onClick={() => setWorkRows((rows) => rows.filter((x) => x.key !== r.key))}>
                            <DeleteOutlineRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                      {err && <Typography sx={{ fontSize: 12, color: 'var(--c-danger-600)', mt: 0.5 }}>{err}</Typography>}
                      {task?.alreadyLogged && (
                        <Typography sx={{ fontSize: 11.5, color: 'var(--c-warning-800)', mt: 0.5 }}>
                          This job already has times logged for {date} — saving adds another entry rather than replacing it.
                        </Typography>
                      )}
                    </Surface>
                  );
                })}
              </Box>
            )}
          </SectionCard>

          {/* ── Downtime ───────────────────────────────────────────────────── */}
          <SectionCard
            title="Downtime"
            subtitle="Time the machine wasn't available. Leave the end blank if it's still down."
            action={<Button size="small" startIcon={<AddIcon />} onClick={() => setDownRows((r) => [...r, newDownRow()])}>Add downtime</Button>}
          >
            {downRows.length === 0 ? (
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>
                Nothing logged. Add a period if the machine broke down, was under maintenance, or had no operator.
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                {downRows.map((r) => {
                  const mins = r.from && r.until ? minutesBetween(date, r.from, r.until) : 0;
                  const bad = !!(r.from && r.until && mins <= 0);
                  return (
                    <Surface key={r.key} e={1} sx={{ p: 1.5, ...(bad && { borderColor: 'var(--c-danger-600)' }) }}>
                      <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <TextField select label="State" size="small" sx={{ width: 130 }} value={r.state}
                          onChange={(e) => setDown(r.key, { state: e.target.value as 'down' | 'off' })}>
                          <MenuItem value="down">Down</MenuItem>
                          <MenuItem value="off">Off</MenuItem>
                        </TextField>
                        <TextField
                          label="From" type="time" size="small" sx={{ width: 118 }}
                          value={r.from} onChange={(e) => setDown(r.key, { from: e.target.value })}
                          slotProps={{ inputLabel: { shrink: true } }}
                        />
                        <TextField
                          label="Until" type="time" size="small" sx={{ width: 118 }}
                          value={r.until} onChange={(e) => setDown(r.key, { until: e.target.value })}
                          slotProps={{ inputLabel: { shrink: true } }}
                          helperText={mins > 0 ? fmtMinutes(mins) : ' '}
                        />
                        <TextField select label="Reason" size="small" sx={{ minWidth: 180 }} value={r.reasonCode}
                          onChange={(e) => setDown(r.key, { reasonCode: e.target.value })}>
                          <MenuItem value="">— none —</MenuItem>
                          {data.downtimeReasons.map((d) => <MenuItem key={d.code} value={d.code}>{d.label}</MenuItem>)}
                        </TextField>
                        <TextField label="Note" size="small" sx={{ flex: 1, minWidth: 180 }} value={r.note}
                          onChange={(e) => setDown(r.key, { note: e.target.value })} />
                        <Tooltip title="Remove">
                          <IconButton size="small" color="error" sx={{ mt: 0.5 }}
                            onClick={() => setDownRows((rows) => rows.filter((x) => x.key !== r.key))}>
                            <DeleteOutlineRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                      {bad && <Typography sx={{ fontSize: 12, color: 'var(--c-danger-600)', mt: 0.5 }}>End must be after start</Typography>}
                    </Surface>
                  );
                })}
              </Box>
            )}

            {data.downtime.length > 0 && (
              <>
                <Divider sx={{ my: 2, borderColor: 'var(--c-divider)' }} />
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mb: 1 }}>Already recorded on {date}</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                  {data.downtime.map((d) => (
                    <Chip key={d.id} size="small" label={`${toHhmm(d.at)} · ${d.state}${d.reasonCode ? ` (${d.reasonCode})` : ''}`}
                      sx={{ fontSize: 11.5, background: 'var(--c-surface-2)', color: 'var(--c-text-2)' }} />
                  ))}
                </Box>
              </>
            )}
          </SectionCard>

          {/* ── People ─────────────────────────────────────────────────────── */}
          {/* The crew is editable right here — add a contract welder, move
              someone off, record that they left at 4 — rather than being a
              read-only list that sends you somewhere else to change it. Saves
              immediately (assignment is a fact about the world, not a draft),
              which is why it sits outside the Save-shift-log batch. */}
          <SectionCard
            title="People"
            subtitle={`Who was on ${data.resource.name} on ${date}. Click someone to record time away; the ✕ takes them off the machine.`}
          >
            <CrewPanel
              resourceId={data.resource.id}
              resourceName={data.resource.name}
              from={`${date}T00:00:00`}
              to={`${date}T23:59:59`}
              onChanged={load}
            />
          </SectionCard>

          <StickyActionBar
            message={
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                <span>
                  <Box component="span" sx={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--c-text)' }}>{filledWork.length}</Box>
                  {' '}job{filledWork.length === 1 ? '' : 's'} ·{' '}
                  <Box component="span" sx={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--c-text)' }}>{filledDown.length}</Box>
                  {' '}downtime period{filledDown.length === 1 ? '' : 's'}
                </span>
                {/* People aren't counted here: crew changes save the moment
                    they're made, because who is on a machine is a fact about
                    the world rather than a draft you might abandon. */}
                {anyRowError && <Box component="span" sx={{ color: 'var(--c-danger-600)' }}>Fix the highlighted rows first</Box>}
              </Box>
            }
          >
            <Button variant="contained" size="large" onClick={save} disabled={saving || nothingToSave || anyRowError}>
              {saving ? <CircularProgress size={20} color="inherit" /> : 'Save shift log'}
            </Button>
          </StickyActionBar>
        </Box>
      )}
    </Box>
  );
}
