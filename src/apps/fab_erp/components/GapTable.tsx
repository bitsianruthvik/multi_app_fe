/**
 * GapTable.tsx — account for a machine's day, one span at a time.
 *
 * Rows are `what · from · to`. Whatever is still unaccounted appears as a
 * distinctly-coloured row underneath, and it recomputes the moment anything is
 * added or withdrawn.
 *
 * THE COLOURED ROW IS NOT A UI DEVICE. It is `unexplained_idle` — the same
 * residual the attribution engine computes after no_shift, machine_down,
 * no_operator and machine_busy have been carved out. The table is a view of the
 * model, so when the row disappears the segment genuinely stops existing.
 *
 * A LEFTOVER GAP IS A LEGITIMATE END STATE. Nothing here nags toward zero and
 * nothing blocks. Forcing every minute to be accounted for manufactures fiction,
 * and fiction in this stream flows into fab_operation_stats and every future
 * estimate — the screen would look tidier and the plant would get less
 * predictable. The colour reads "unknown", never "your fault".
 *
 * TWO MODES, because a shift and a calendar day are not the same window:
 *
 *   instance mode  the caller has already fetched a shift instance and passes it
 *                  in. The table renders exactly that shift — which is the only
 *                  way a 22:00–06:00 night shift shows as one sheet instead of
 *                  two half-sheets on either side of midnight. Controlled: writes
 *                  report up via onChanged and the parent refetches.
 *   day mode       no instance given, so the table fetches the whole calendar day
 *                  itself. Still used by the reconciliation panel, which comes at
 *                  this from a date rather than from a shift.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, IconButton, ListSubheader, MenuItem, TextField, Tooltip, Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import CorrectTimeDialog from './CorrectTimeDialog';
import BuildRounded from '@mui/icons-material/BuildRounded';
import CloudRounded from '@mui/icons-material/CloudRounded';
import AssignmentLateRounded from '@mui/icons-material/AssignmentLateRounded';
import PrecisionManufacturingRounded from '@mui/icons-material/PrecisionManufacturingRounded';

import {
  getGapReasons, getDayGaps, explainGap, withdrawExplained,
  type DayGaps, type GapReason, type ExplainedSpan, type ShiftInstance,
} from '../api/gaps';
import { getShiftLog, saveShiftLog } from '../api/shiftLog';
import { useToast } from './Toast';
import { backendMessage } from '../utils/backendMessage';

/** Render an instant as wall clock AT THE SITE, not in the viewer's zone. */
function siteTime(iso: string, tz: string) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toISOString().slice(11, 16);
  }
}

/**
 * 'HH:MM' on the sheet's date → an ISO instant, in the BROWSER's zone.
 *
 * Only used for the work path, because `saveShiftLog` has always taken absolute
 * instants and every existing caller feeds it browser-local times. The gap
 * reasons go through /gaps/explain instead, which takes wall clock and resolves
 * it through the PLANT's zone — the correct treatment. Worth converging, but not
 * by silently changing what the shift-log endpoint means to its other callers.
 */
const localIso = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00`).toISOString();

const plusDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * The work path's pair of instants, resolved the same way the server resolves a
 * gap reason — see the `windowStart` note on explainGap. Two corrections, and
 * both are needed on a night shift:
 *
 *   both times after midnight   01:00–06:00 on a 22:00–06:00 shift. Resolved on
 *                               the shift's start date they land 24h early, so
 *                               the pair rolls forward together.
 *   the span itself crosses     23:00–01:00. Only the end rolls.
 */
function workSpan(date: string, from: string, to: string, windowStart?: string) {
  let day = date;
  if (windowStart && +new Date(localIso(date, from)) < +new Date(windowStart)) {
    day = plusDays(date, 1);
  }
  const startedAt = localIso(day, from);
  let completedAt = localIso(day, to);
  if (+new Date(completedAt) <= +new Date(startedAt)) {
    completedAt = localIso(plusDays(day, 1), to);
  }
  return { startedAt, completedAt };
}

const mins = (a: string, b: string) => Math.round((+new Date(b) - +new Date(a)) / 60000);
const fmtDur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m`.replace(' 0m', '') : `${m}m`);

/**
 * Logging work is not a "gap reason" — it writes started/completed task events
 * rather than an explanation — but it belongs in the same table because from the
 * supervisor's side it is the same act: saying what this hour was.
 */
const WORK_CODE = '__work__';

const SCOPE_ICON = {
  site: <CloudRounded sx={{ fontSize: 15 }} />,
  machine: <BuildRounded sx={{ fontSize: 15 }} />,
  task: <AssignmentLateRounded sx={{ fontSize: 15 }} />,
} as const;

/**
 * The reason list, in groups.
 *
 * It was fifteen flat entries in one dropdown, which is a scroll and a read at
 * the end of a shift — and this form only works if it is faster than the paper
 * it replaces. Grouping does NOT merge or drop any reason: every code still
 * writes exactly what it wrote before, so attribution and every report built on
 * it are untouched. The grouping key is `scope`, which already meant this —
 * machine-scoped reasons ARE the machine stopping — so the headings are the
 * model's own distinction made visible rather than a second taxonomy.
 *
 * `other` is pulled out of `machine` into its own group. It is scope-machine for
 * storage reasons, but presenting it under "Machine stopped" reads as a kind of
 * breakdown, and it is the opposite: the escape hatch for something we know and
 * cannot name.
 */
const REASON_GROUPS: { key: string; label: string; scope: GapReason['scope'] }[] = [
  { key: 'machine', label: 'Machine stopped', scope: 'machine' },
  { key: 'site', label: 'Site stopped', scope: 'site' },
  { key: 'task', label: 'Waiting on someone', scope: 'task' },
];

export interface GapWorkTask {
  id: number;
  label: string;
  plannedQty?: number | null;
  group?: 'planned' | 'open' | 'blocked' | 'logged';
  blockedNote?: string | null;
}

/** Headings for the job picker, in the order a supervisor should read them. */
const TASK_GROUPS: { key: NonNullable<GapWorkTask['group']>; label: string; hint?: string }[] = [
  { key: 'planned', label: 'Planned for this shift' },
  { key: 'open', label: 'Open on this machine' },
  { key: 'blocked', label: 'Not yet released', hint: 'the system did not expect these to run' },
  { key: 'logged', label: 'Already logged this shift' },
];

const SUBHEADER_SX = {
  fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase',
  color: 'var(--c-text-3)', lineHeight: '26px', background: 'var(--c-surface)',
} as const;

export function GapTable({
  resourceId, date, instance, timezone, resourceName, workTasks, onSummary, onChanged,
}: {
  resourceId: number | null;
  /**
   * The date writes are anchored to. In instance mode this is the date the shift
   * STARTED, so a night shift's tail is written against the day the crew would
   * call it — the backend rolls a `to` that lands before `from` onto the next day.
   */
  date: string;
  /**
   * Supply this to render one shift rather than a calendar day. The table then
   * fetches nothing and reports writes up through `onChanged`.
   */
  instance?: ShiftInstance;
  /** Plant timezone. Required with `instance`; day mode reads it off its fetch. */
  timezone?: string;
  resourceName?: string;
  /**
   * Jobs that could have run on this machine on `date`. OPTIONAL, and normally
   * omitted: the table fetches its own, for its own date.
   *
   * It used to be required, and ShiftLog passed ONE list — fetched for the last
   * day of the selected period — to every shift card in the range. Writing up
   * Tuesday on a "last 7 days" view therefore offered Friday's jobs, and the
   * "already logged" flags belonged to Friday too. A prop that must be kept in
   * step with a sibling prop (`date`) is a prop that will fall out of step, so
   * the fetch now hangs off `date` itself and cannot disagree with it.
   *
   * Passing a list still works and skips the fetch, for a caller that already
   * has one.
   */
  workTasks?: GapWorkTask[];
  /**
   * Reports the day's totals up so a parent header can show them. Fed from the
   * SAME fetch the table renders — a second request would drift the moment a
   * row is added.
   */
  onSummary?: (s: { workingMinutes: number; explainedMinutes: number; gapMinutes: number }) => void;
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const [day, setDay] = useState<DayGaps | null>(null);
  const [reasons, setReasons] = useState<GapReason[]>([]);
  // Correcting an already-logged span. The only thing MachineTimeline could
  // do that nothing else could, rehomed here when it was removed.
  const [correcting, setCorrecting] = useState<{ taskId: number; label: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  // The row being added, anchored to a specific gap.
  const [draft, setDraft] = useState<{
    gapIdx: number; code: string; from: string; to: string;
    taskId: string; party: string; note: string;
    good: string; scrap: string; qcFail: boolean;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  // Held in a ref so an inline arrow from the parent doesn't re-fire the effect
  // on every render — that would be a render loop, not a summary.
  const onSummaryRef = useRef(onSummary);
  onSummaryRef.current = onSummary;

  const load = useCallback(async () => {
    // Instance mode is controlled — the shift came in as a prop, and fetching a
    // day here would silently widen the window back out to midnight-to-midnight.
    if (instance) return;
    if (!resourceId) { setDay(null); return; }
    setLoading(true); setErr('');
    try {
      setDay(await getDayGaps(resourceId, date));
    } catch (e) {
      setErr(backendMessage(e, 'Failed to load the day.'));
    } finally {
      setLoading(false);
    }
  }, [resourceId, date, instance]);

  useEffect(() => { void load(); }, [load]);

  /**
   * The jobs offered under "Operated on a task", for THIS date.
   *
   * Fetched lazily — the first time somebody opens a row — because most gaps get
   * explained without ever touching the job list, and a shift log showing seven
   * shifts would otherwise fire seven of these on load. Keyed by date so moving
   * between shift cards refetches rather than reusing the wrong day's answer.
   */
  const [fetchedTasks, setFetchedTasks] = useState<{ date: string; tasks: GapWorkTask[]; truncated: boolean } | null>(null);
  const [tasksLoading, setTasksLoading] = useState(false);

  const loadWorkTasks = useCallback(async () => {
    if (workTasks || !resourceId) return;
    if (fetchedTasks?.date === date || tasksLoading) return;
    setTasksLoading(true);
    try {
      const res = await getShiftLog(resourceId, date);
      setFetchedTasks({
        date,
        truncated: !!res.tasksTruncated,
        tasks: (res.tasks ?? []).map((t) => ({
          id: t.id,
          label: [t.itemMark, t.operationName ?? `Step ${t.seqNo}`, t.itemName].filter(Boolean).join(' · '),
          plannedQty: t.plannedQty == null ? null : Number(t.plannedQty),
          group: t.group ?? (t.alreadyLogged ? 'logged' : 'open'),
          blockedNote: t.blockedNote ?? null,
        })),
      });
    } catch {
      // A failed job list must still leave the reasons usable — explaining why
      // nothing ran is the other half of this form and does not need tasks.
      setFetchedTasks({ date, tasks: [], truncated: false });
    } finally {
      setTasksLoading(false);
    }
  }, [workTasks, resourceId, date, fetchedTasks, tasksLoading]);

  const tasks = workTasks ?? (fetchedTasks?.date === date ? fetchedTasks.tasks : []);
  const tasksTruncated = !workTasks && fetchedTasks?.date === date && fetchedTasks.truncated;

  /** What the table renders — one shift, or a whole calendar day. */
  const view = useMemo(() => {
    if (instance) {
      return {
        resourceName: resourceName ?? 'this machine',
        timezone: timezone ?? 'UTC',
        workingMinutes: instance.workingMinutes,
        explainedMinutes: instance.explainedMinutes,
        gapMinutes: instance.gapMinutes,
        explained: instance.explained,
        gaps: instance.gaps,
      };
    }
    if (!day) return null;
    return {
      resourceName: day.resourceName,
      // `view.timezone` — the memo referring to ITSELF. In day mode that is a
      // TDZ ReferenceError the moment the fetch resolves, which crashed the
      // Reconciliation panel's "account for this time" table every time it
      // loaded. It also made `view` implicitly `any`, which is why every
      // callback below lost its parameter types.
      timezone: day.timezone ?? timezone ?? 'UTC',
      workingMinutes: day.workingMinutes,
      explainedMinutes: day.explainedMinutes,
      gapMinutes: day.gapMinutes,
      explained: day.explained,
      gaps: day.gaps,
    };
  }, [instance, day, timezone, resourceName]);

  // Push the totals up whenever they change, from whichever path produced them
  // — initial load, an explain, a withdraw, or a work row.
  useEffect(() => {
    if (!view) return;
    onSummaryRef.current?.({
      workingMinutes: view.workingMinutes,
      explainedMinutes: view.explainedMinutes,
      gapMinutes: view.gapMinutes,
    });
  }, [view]);
  useEffect(() => { getGapReasons().then((r) => setReasons(r.reasons ?? [])).catch(() => {}); }, []);

  const reasonByCode = useMemo(() => new Map(reasons.map((r) => [r.code, r])), [reasons]);
  const chosen = draft ? reasonByCode.get(draft.code) : undefined;
  const chosenTask = draft?.taskId ? tasks.find((t) => String(t.id) === draft.taskId) : undefined;

  // Tasks on this machine in this window — needed for a task-scoped reason.
  const tasksToday = useMemo(
    () => (view?.explained ?? []).filter((e) => e.kind === 'work' && e.taskId),
    [view],
  );

  function openDraft(gapIdx: number) {
    if (!view) return;
    const g = view.gaps[gapIdx];
    void loadWorkTasks();
    setDraft({
      gapIdx, code: '',
      // Prefilled to the whole gap. Most days are one cause, and the common case
      // should be: pick a reason, press save.
      from: siteTime(g.start, view.timezone),
      to: siteTime(g.end, view.timezone),
      taskId: '', party: '', note: '', good: '', scrap: '', qcFail: false,
    });
  }

  async function save() {
    if (!draft || !view || !resourceId) return;
    if (!draft.code) { setErr('Say what this time was.'); return; }

    const isWork = draft.code === WORK_CODE;
    if (isWork && !draft.taskId) { setErr('Pick which job ran.'); return; }
    if (!isWork && chosen?.scope === 'task' && !draft.taskId) {
      setErr(`"${chosen.label}" applies to a job — pick which one.`); return;
    }
    setSaving(true); setErr('');
    try {
      if (isWork) {
        // Routed through the shift-log save rather than reimplemented here: that
        // path already moves the WIP piece, books produced/scrap quantities,
        // spawns rework on a QC fail and advances the DAG. Writing the events
        // directly would record that the work happened while leaving the metal
        // and every downstream task where they were.
        const { startedAt, completedAt } = workSpan(date, draft.from, draft.to, instance?.start);
        const res = await saveShiftLog({
          resourceId, date,
          work: [{
            taskId: Number(draft.taskId),
            startedAt,
            completedAt,
            producedQty: draft.good === '' ? null : Number(draft.good),
            scrapQty: draft.scrap === '' ? null : Number(draft.scrap),
            qcResult: draft.qcFail ? 'fail' : 'pass',
            note: draft.note.trim() || null,
          }],
          downtime: [], absences: [],
        });
        if (!instance) setDay(await getDayGaps(resourceId, date));
        // The write path partially succeeds by design — a material movement can
        // roll back to its savepoint while the times stand — and it says so in
        // `warnings`. Those were being thrown away and every save toasted as a
        // clean success, so "the steel never left stock" was invisible. It
        // matters more now that tasks the engine has NOT released are offered:
        // that is precisely the case where nothing can be issued.
        const warnings = res?.warnings ?? [];
        if (warnings.length) {
          setErr(warnings.join(' '));
          toast('Recorded, with something to check.', 'info');
        } else {
          toast('Work recorded.', 'success');
        }
      } else {
        const next = await explainGap({
          resourceId, date, code: draft.code,
          fromTime: draft.from, toTime: draft.to,
          windowStart: instance?.start,
          taskId: draft.taskId ? Number(draft.taskId) : undefined,
          party: draft.party.trim() || undefined,
          note: draft.note.trim() || undefined,
        });
        // In instance mode the response is a calendar day, which is the wrong
        // window — the parent's refetch is what brings this shift back.
        if (!instance) setDay(next);
        toast('Recorded.', 'success');
      }
      setDraft(null);
      onChanged?.();
    } catch (e) {
      setErr(backendMessage(e, 'Could not record that.'));
    } finally {
      setSaving(false);
    }
  }

  async function withdraw(e: ExplainedSpan) {
    if (!resourceId || !e.id) return;
    try {
      const next = await withdrawExplained(e.stream, e.id, resourceId, date);
      if (!instance) setDay(next);
      toast('Withdrawn — the time is unaccounted again.', 'success');
      onChanged?.();
    } catch (x) {
      toast(backendMessage(x, 'Failed to withdraw.'), 'error');
    }
  }

  if (!resourceId) return null;
  if (loading && !view) return <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Loading the day…</Typography>;
  if (!view) return null;

  if (view.workingMinutes === 0) {
    return (
      <Alert severity="info" sx={{ mt: 1 }}>
        No working time on {view.resourceName} for this date — no shift is configured, so
        there is nothing to account for. A day the plant was closed is not a gap.
      </Alert>
    );
  }

  const rows = [
    ...view.explained.map((e) => ({ type: 'explained' as const, e })),
    ...view.gaps.map((g, i) => ({ type: 'gap' as const, g, i })),
  ].sort((a, b) => +new Date(a.type === 'gap' ? a.g.start : a.e.from) - +new Date(b.type === 'gap' ? b.g.start : b.e.from));

  return (
    <Box>
      {/* The arithmetic, stated plainly. If these three ever fail to add up the
          user should be able to see it rather than trust us. */}
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'baseline', mb: 1 }}>
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>
          {instance ? 'Shift' : 'Working day'}{' '}
          <strong style={{ color: 'var(--c-text)' }}>{fmtDur(view.workingMinutes)}</strong>
          {'  =  '}accounted {fmtDur(view.explainedMinutes)}
          {'  +  '}
          <Box component="span" sx={{ color: view.gapMinutes > 0 ? 'var(--c-warning-800)' : 'var(--c-text-3)', fontWeight: 600 }}>
            unaccounted {fmtDur(view.gapMinutes)}
          </Box>
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>times are {view.timezone}</Typography>
      </Box>

      {err && <Alert severity="warning" sx={{ mb: 1 }} onClose={() => setErr('')}>{err}</Alert>}

      <Box sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
        <Box sx={{
          display: 'grid', gridTemplateColumns: '1fr 92px 92px 80px 40px',
          gap: 1, px: 1.5, py: 0.75, bgcolor: 'var(--c-surface-2)',
          fontSize: 11, fontWeight: 600, color: 'var(--c-text-3)',
        }}>
          <Box>What</Box><Box>From</Box><Box>To</Box><Box>Duration</Box><Box />
        </Box>

        {rows.map((row, idx) => {
          if (row.type === 'explained') {
            const e = row.e;
            const isWork = e.kind === 'work';
            return (
              <Box key={`e${idx}`} sx={{
                display: 'grid', gridTemplateColumns: '1fr 92px 92px 80px 40px',
                gap: 1, px: 1.5, py: 0.9, alignItems: 'center',
                borderTop: '1px solid var(--c-border)', fontSize: 12.5,
                bgcolor: isWork ? 'var(--c-success-50, transparent)' : 'transparent',
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                  {isWork ? <PrecisionManufacturingRounded sx={{ fontSize: 15, color: 'var(--c-text-3)' }} />
                    : SCOPE_ICON[e.kind as 'site' | 'machine' | 'task']}
                  <Typography sx={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.label}</Typography>
                  {isWork && <Chip size="small" label="ran" sx={{ height: 16, fontSize: 9.5 }} />}
                </Box>
                <Box>{siteTime(e.from, view.timezone)}</Box>
                <Box>{siteTime(e.to, view.timezone)}</Box>
                <Box sx={{ color: 'var(--c-text-3)' }}>{fmtDur(mins(e.from, e.to))}</Box>
                <Box sx={{ display: 'flex', gap: 0.25 }}>
                  {/* A work row is not withdrawable — it is what the machine
                      actually did — but its times can be wrong, and this is
                      where somebody notices. */}
                  {isWork && e.taskId != null && (
                    <Tooltip title="Correct the logged start or finish time">
                      <IconButton size="small" onClick={() => setCorrecting({ taskId: e.taskId!, label: e.label })}>
                        <ScheduleRounded sx={{ fontSize: 15 }} />
                      </IconButton>
                    </Tooltip>
                  )}
                  {e.removable && (
                    <Tooltip title="Withdraw — this time becomes unaccounted again">
                      <IconButton size="small" onClick={() => withdraw(e)}>
                        <CloseRounded sx={{ fontSize: 15 }} />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              </Box>
            );
          }

          const g = row.g;
          const isDrafting = draft?.gapIdx === row.i;
          return (
            <Box key={`g${idx}`}>
              {/* The residual. Distinct colour, and it is a to-do, not an error. */}
              <Box sx={{
                display: 'grid', gridTemplateColumns: '1fr 92px 92px 80px 40px',
                gap: 1, px: 1.5, py: 0.9, alignItems: 'center',
                borderTop: '1px solid var(--c-border)', fontSize: 12.5,
                bgcolor: 'var(--c-warning-50)', color: 'var(--c-warning-800)',
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>Unaccounted</Typography>
                  <Typography sx={{ fontSize: 11.5, opacity: 0.8 }}>— nothing recorded for this time</Typography>
                </Box>
                <Box>{siteTime(g.start, view.timezone)}</Box>
                <Box>{siteTime(g.end, view.timezone)}</Box>
                <Box>{fmtDur(mins(g.start, g.end))}</Box>
                <Box>
                  {!isDrafting && (
                    <Tooltip title="Say what happened">
                      <IconButton size="small" onClick={() => openDraft(row.i)}>
                        <AddRounded sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              </Box>

              {isDrafting && draft && (
                <Box sx={{ p: 1.5, borderTop: '1px solid var(--c-border)', bgcolor: 'var(--c-surface-2)' }}>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <TextField
                      select size="small" label="What was this time?" sx={{ minWidth: 260 }}
                      value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                    >
                      {/* First, and always present — never gated on the job list
                          having loaded or being non-empty. On a shop floor most
                          unaccounted time is work that happened and nobody wrote
                          down, so this is the answer the form should lead with;
                          hiding it when the list came back empty made the most
                          common case the one you could not express. */}
                      <MenuItem value={WORK_CODE}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <PrecisionManufacturingRounded sx={{ fontSize: 15 }} />
                          <strong>Operated on a task</strong>
                        </Box>
                      </MenuItem>
                      {REASON_GROUPS.flatMap((grp) => {
                        const inGroup = reasons.filter(
                          (r) => r.scope === grp.scope && r.code !== 'other',
                        );
                        if (!inGroup.length) return [];
                        return [
                          <ListSubheader key={grp.key} sx={SUBHEADER_SX}>{grp.label}</ListSubheader>,
                          ...inGroup.map((r) => (
                            <MenuItem key={r.code} value={r.code} sx={{ pl: 3 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                {SCOPE_ICON[r.scope]}{r.label}
                              </Box>
                            </MenuItem>
                          )),
                        ];
                      })}
                      {/* Anything a company added under a scope we don't group,
                          plus `other`. Never dropped — a reason that exists and
                          renders nowhere is worse than an ungrouped one. */}
                      {reasons.some((r) => r.code === 'other' || !REASON_GROUPS.some((g) => g.scope === r.scope)) && (
                        <ListSubheader key="__other" sx={SUBHEADER_SX}>Something else</ListSubheader>
                      )}
                      {reasons
                        .filter((r) => r.code === 'other' || !REASON_GROUPS.some((g) => g.scope === r.scope))
                        .map((r) => (
                          <MenuItem key={r.code} value={r.code} sx={{ pl: 3 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                              {SCOPE_ICON[r.scope]}{r.label}
                            </Box>
                          </MenuItem>
                        ))}
                    </TextField>
                    <TextField size="small" type="time" label="From" sx={{ width: 118 }}
                      InputLabelProps={{ shrink: true }}
                      value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
                    <TextField size="small" type="time" label="To" sx={{ width: 118 }}
                      InputLabelProps={{ shrink: true }}
                      value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
                    {/* One tap for the common case: the whole gap was one thing. */}
                    <Button size="small" onClick={() => setDraft({
                      ...draft,
                      from: siteTime(g.start, view.timezone),
                      to: siteTime(g.end, view.timezone),
                    })}>
                      Rest of the gap
                    </Button>
                  </Box>

                  {draft.code === WORK_CODE && (
                    <Box sx={{ display: 'flex', gap: 1, mt: 1.25, flexWrap: 'wrap', alignItems: 'center' }}>
                      <TextField
                        select size="small" label="Which task" sx={{ minWidth: 320 }}
                        value={draft.taskId}
                        onChange={(e) => setDraft({ ...draft, taskId: e.target.value })}
                        disabled={tasksLoading || tasks.length === 0}
                        helperText={
                          tasksLoading ? 'Loading this machine’s tasks…'
                            : tasks.length === 0 ? 'No tasks on this machine yet — check the order has been materialised'
                              : tasksTruncated ? 'Showing the first 300 — planned and this machine’s own work first'
                                : ' '
                        }
                      >
                        {TASK_GROUPS.flatMap((grp) => {
                          const inGroup = tasks.filter((t) => (t.group ?? 'open') === grp.key);
                          if (!inGroup.length) return [];
                          return [
                            <ListSubheader key={grp.key} sx={SUBHEADER_SX}>
                              {grp.label}{grp.hint ? ` — ${grp.hint}` : ''}
                            </ListSubheader>,
                            ...inGroup.map((t) => (
                              <MenuItem key={t.id} value={String(t.id)} sx={{ pl: 3 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                                  <Box component="span" sx={{
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    opacity: grp.key === 'logged' ? 0.6 : 1,
                                  }}>
                                    {t.label}
                                  </Box>
                                  {t.blockedNote && (
                                    <Chip
                                      size="small" label={t.blockedNote}
                                      sx={{
                                        height: 16, fontSize: 9.5,
                                        bgcolor: 'var(--c-warning-50)', color: 'var(--c-warning-800)',
                                      }}
                                    />
                                  )}
                                </Box>
                              </MenuItem>
                            )),
                          ];
                        })}
                      </TextField>
                      <TextField size="small" type="number" label="Good qty" sx={{ width: 110 }}
                        value={draft.good} onChange={(e) => setDraft({ ...draft, good: e.target.value })} />
                      <TextField size="small" type="number" label="Scrap" sx={{ width: 100 }}
                        value={draft.scrap} onChange={(e) => setDraft({ ...draft, scrap: e.target.value })} />
                      <Button
                        size="small"
                        variant={draft.qcFail ? 'contained' : 'outlined'}
                        color={draft.qcFail ? 'error' : 'inherit'}
                        onClick={() => setDraft({ ...draft, qcFail: !draft.qcFail })}
                      >
                        {draft.qcFail ? 'QC failed' : 'QC passed'}
                      </Button>
                    </Box>
                  )}

                  {chosen?.scope === 'task' && (
                    <Box sx={{ display: 'flex', gap: 1, mt: 1.25, flexWrap: 'wrap' }}>
                      <TextField select size="small" label="Which job" sx={{ minWidth: 230 }}
                        value={draft.taskId} onChange={(e) => setDraft({ ...draft, taskId: e.target.value })}
                        helperText={tasksToday.length ? ' ' : 'No jobs ran on this machine that day'}>
                        {tasksToday.map((t) => (
                          <MenuItem key={t.taskId} value={String(t.taskId)}>{t.label}</MenuItem>
                        ))}
                      </TextField>
                      <TextField size="small" label="Waiting on (optional)" sx={{ minWidth: 190 }}
                        placeholder="Client QA / our QC / TPI"
                        value={draft.party} onChange={(e) => setDraft({ ...draft, party: e.target.value })} />
                    </Box>
                  )}

                  <Box sx={{ display: 'flex', gap: 1, mt: 1.25, alignItems: 'center' }}>
                    <TextField size="small" label="Note (optional)" sx={{ flex: 1 }}
                      value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
                    <Button size="small" onClick={() => { setDraft(null); setErr(''); }}>Cancel</Button>
                    <Button size="small" variant="contained" onClick={save} disabled={saving}>
                      {saving ? 'Saving…' : 'Record'}
                    </Button>
                  </Box>

                  {draft.code === WORK_CODE && (
                    <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mt: 1 }}>
                      Records the task as run: moves the material, books the quantities and
                      releases whatever was waiting on it.
                      {draft.qcFail && ' A QC fail books no good stock and raises a rework task.'}
                      {/* Said before saving, not discovered in a warning after.
                          The times are still recorded either way — see the
                          savepoint in the shift-log write path. */}
                      {chosenTask?.group === 'blocked' && (
                        <Box component="span" sx={{ color: 'var(--c-warning-800)' }}>
                          {' '}This task was {chosenTask.blockedNote ?? 'not released'}, so the material may
                          not be on hand — the times are recorded regardless, and you will be told if
                          nothing could be issued.
                        </Box>
                      )}
                    </Typography>
                  )}
                  {chosen && (
                    <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mt: 1 }}>
                      {chosen.scope === 'site' && 'Applies to the whole plant — one entry covers every machine on site.'}
                      {chosen.scope === 'machine' && 'Applies to this machine.'}
                      {chosen.scope === 'task' && 'Follows the job, wherever it is.'}
                    </Typography>
                  )}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      {view.gapMinutes > 0 && (
        <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mt: 1 }}>
          Leaving time unaccounted is fine — it is recorded as unknown rather than guessed at.
        </Typography>
      )}

      <CorrectTimeDialog
        open={!!correcting}
        taskId={correcting?.taskId ?? null}
        taskLabel={correcting?.label}
        onClose={() => setCorrecting(null)}
        onCorrected={() => { setCorrecting(null); void load(); }}
      />
    </Box>
  );
}
