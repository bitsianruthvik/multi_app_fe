/**
 * Planner.tsx — the Production Planner.
 *
 * Supersedes the Dispatch page. Dispatch answered "what next per machine" with
 * no time axis; this answers the same question with one, which is what makes it
 * a plan rather than a queue. The ranking is not reimplemented — the backend
 * feeds dispatchService's order slack into the levelling pass, so the two cannot
 * disagree about which order is in trouble.
 *
 * THE PLAN IS ADVISORY. Nothing here constrains the shop floor: an operator who
 * starts something else is not blocked and not flagged, and POST /tasks/:id/start
 * is untouched. What IS hard is the DAG — at execution time by the existing
 * gating (a task is startable only from `eligible`/`paused`), and at PLANNING
 * time by the backend's DAG gate, which refuses a bar whose predecessor is
 * unplanned or planned to finish later. That refusal arrives as a 409 with a
 * code, and it is shown as an explanation rather than an error.
 *
 * Three regions:
 *   left    the grid — resource-type lanes, crew-coverage shading, bars
 *   right   unplanned work, ranked; select tasks and place them
 *   sheet   a selected bar — its tasks, pin, split, remove
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Divider, FormControlLabel,
  IconButton, MenuItem, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import PushPinRounded from '@mui/icons-material/PushPinRounded';
import CallSplitRounded from '@mui/icons-material/CallSplitRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';

import { usePermission } from '@core/hooks/usePermission';
import { useAuth } from '@core/contexts/AuthContext';
import { isAdminRole } from '@core/utils/roles';

import {
  getPlan, getBacklog, suggestPlan, acceptRun, createPlanEntry, updatePlanEntry,
  splitPlanEntry, deletePlanEntry, planErrorOf,
  type PlanResponse, type PlanEntry, type BacklogTask, type SuggestResponse,
} from '../api/planner';
import {
  PageHeader, Surface, SectionCard, EmptyState, ListSkeleton, SideSheet, Mono,
  useToast, backendMessage,
} from '../components';
import { PlannerGrid } from '../components/planner/PlannerGrid';
import { SuggestSetupDialog } from '../components/planner/SuggestSetupDialog';
import {
  buildScale, todayYMD, addDaysYMD, dayStartUtc, zonedWallClockToUtc, zonedParts,
  fmtMinutes, fmtLocalTime, type ViewMode,
} from '../components/planner/plannerTime';

const FALLBACK_TZ = 'UTC';

export default function Planner() {
  const { toast } = useToast();
  const { user } = useAuth();
  const admin = isAdminRole(user?.role);
  const canView = usePermission('fab_erp_planner_view') || admin;
  const canManage = usePermission('fab_erp_planner_manage') || admin;

  const [mode, setMode] = useState<ViewMode>('day');
  const [timeZone, setTimeZone] = useState<string>(FALLBACK_TZ);
  const [fromYMD, setFromYMD] = useState<string>(() => todayYMD(FALLBACK_TZ));
  const [laneFilter, setLaneFilter] = useState<number[]>([]);
  const [bundling, setBundling] = useState(true);

  /**
   * The lane list is stable across filtering — it comes from an unfiltered load
   * and is kept separately. Reading it off `plan.lanes` would be self-erasing:
   * narrowing to one resource type removes every other option from the picker,
   * so the planner could scope down and then have no way back.
   */
  const [allLanes, setAllLanes] = useState<{ id: number; name: string }[]>([]);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [backlog, setBacklog] = useState<BacklogTask[]>([]);
  const [run, setRun] = useState<SuggestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [suggesting, setSuggesting] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>([]);
  const [placeAt, setPlaceAt] = useState<string>('08:00');
  const [placeDay, setPlaceDay] = useState<string>(fromYMD);
  const [sheetEntry, setSheetEntry] = useState<PlanEntry | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const scale = useMemo(() => buildScale(mode, fromYMD, timeZone), [mode, fromYMD, timeZone]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const from = dayStartUtc(fromYMD, timeZone);
      const to = dayStartUtc(addDaysYMD(fromYMD, mode === 'day' ? 1 : 7), timeZone);
      const [p, b] = await Promise.all([
        getPlan({
          from: from.toISOString(),
          to: to.toISOString(),
          resourceTypeIds: laneFilter.length ? laneFilter : undefined,
        }),
        getBacklog({ resourceTypeIds: laneFilter.length ? laneFilter : undefined, limit: 200 }),
      ]);
      setPlan(p);
      setBacklog(b.tasks);
      if (laneFilter.length === 0) {
        setAllLanes(p.lanes.map((l) => ({ id: l.resourceTypeId, name: l.name })));
      }
      // The plant's zone is authoritative and only the server knows it. Adopting
      // it here is what makes every hour label on the grid the shift the floor
      // actually works, rather than the browser's idea of the time.
      if (p.timezone && p.timezone !== timeZone) setTimeZone(p.timezone);
    } catch (err) {
      setError(backendMessage(err) ?? 'Could not load the plan.');
    } finally {
      setLoading(false);
    }
  }, [fromYMD, mode, timeZone, laneFilter]);

  useEffect(() => { void load(); }, [load]);

  /** The window a run would cover — the days currently on the grid. */
  const suggestWindow = useMemo(() => ({
    from: dayStartUtc(fromYMD, timeZone).toISOString(),
    to: dayStartUtc(addDaysYMD(fromYMD, mode === 'day' ? 1 : 7), timeZone).toISOString(),
  }), [fromYMD, mode, timeZone]);

  /**
   * The window is entirely in the past, so a suggestion over it is guaranteed
   * empty — the engine anchors at now. Worth naming, because "0 bars" on its own
   * reads as a broken engine rather than as an impossible request.
   */
  const windowEnded = useMemo(
    () => new Date(suggestWindow.to).getTime() <= Date.now(),
    [suggestWindow.to],
  );

  const onSuggest = useCallback(async () => {
    setSuggesting(true);
    setError(null);
    try {
      const r = await suggestPlan({
        from: suggestWindow.from,
        to: suggestWindow.to,
        resourceTypeIds: laneFilter.length ? laneFilter : undefined,
        bundling,
      });
      setRun(r);
      // Reload so the rules just saved show up in the backlog's own ranking.
      await load();
    } catch (err) {
      setError(backendMessage(err) ?? 'Could not compute a suggestion.');
    } finally {
      setSuggesting(false);
    }
  }, [suggestWindow, laneFilter, bundling, load]);

  const onAccept = useCallback(async (pin: boolean) => {
    if (!run) return;
    try {
      const res = await acceptRun({ runId: run.runId, pin });
      toast(
        res.skipped.length
          ? `Added ${res.accepted} to the plan · ${res.skipped.length} skipped`
          : `Added ${res.accepted} to the plan`,
        'success',
      );
      setRun(null);
      await load();
    } catch (err) {
      toast(backendMessage(err) ?? 'Could not accept the suggestion.', 'error');
    }
  }, [run, toast, load]);

  const onPlace = useCallback(async () => {
    if (selectedTaskIds.length === 0) return;
    setRefusal(null);
    try {
      // The picker is local wall clock at the PLANT; convert through the plant's
      // zone rather than the browser's, or a supervisor abroad plans the wrong hour.
      const utc = zonedWallClockToUtc(placeDay, placeAt, timeZone);
      await createPlanEntry({ taskIds: selectedTaskIds, plannedStart: utc.toISOString() });
      toast(`Planned ${selectedTaskIds.length} task${selectedTaskIds.length === 1 ? '' : 's'}`, 'success');
      setSelectedTaskIds([]);
      await load();
    } catch (err) {
      const refused = planErrorOf(err);
      if (refused) setRefusal(refused.message);
      else toast(backendMessage(err) ?? 'Could not add to the plan.', 'error');
    }
  }, [selectedTaskIds, placeDay, placeAt, timeZone, toast, load]);

  /**
   * Select this task and aim the placement controls at the first slot it can
   * legally take — the moment its last predecessor is planned to finish.
   *
   * The rule was already enforced (place too early and the server refuses with
   * PREDECESSOR_LATER), but only ever discoverable by being refused: you had to
   * guess a time, get told it was wrong, read an ISO timestamp out of the
   * message and translate it back into the picker. This makes the legal answer
   * the one-click one.
   */
  const onPlaceAfter = useCallback((t: BacklogTask) => {
    if (!t.earliestStart) return;
    const { ymd, hour, minute } = zonedParts(t.earliestStart, timeZone);
    // Move the VIEW there first when the slot falls outside the days currently
    // on screen. The day picker's options are the visible scale, so setting it
    // to a day the scale does not contain leaves a MUI Select rendering blank —
    // the field would say nothing and mean the 17th, and pressing Add would
    // place against an empty day. Scrolling the grid to the work you are about
    // to plan is what you wanted anyway.
    if (!scale.days.includes(ymd)) setFromYMD(ymd);
    setPlaceDay(ymd);
    setPlaceAt(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
    setSelectedTaskIds((prev) => (prev.includes(t.id) ? prev : [...prev, t.id]));
    setRefusal(null);
  }, [timeZone, scale.days]);

  const onTogglePin = useCallback(async (entry: PlanEntry) => {
    try {
      await updatePlanEntry(entry.id, { isPinned: !entry.isPinned });
      toast(entry.isPinned ? 'Unpinned' : 'Pinned — a re-suggest will plan around it', 'success');
      setSheetEntry(null);
      await load();
    } catch (err) {
      toast(backendMessage(err) ?? 'Could not update the entry.', 'error');
    }
  }, [toast, load]);

  const onSplit = useCallback(async (entry: PlanEntry) => {
    try {
      const res = await splitPlanEntry(entry.id);
      toast(`Split into ${res.entryIds.length} bars`, 'success');
      setSheetEntry(null);
      await load();
    } catch (err) {
      const refused = planErrorOf(err);
      toast(refused?.message ?? backendMessage(err) ?? 'Could not split the entry.', 'error');
    }
  }, [toast, load]);

  const onRemove = useCallback(async (entry: PlanEntry) => {
    try {
      await deletePlanEntry(entry.id);
      toast('Removed from the plan', 'success');
      setSheetEntry(null);
      await load();
    } catch (err) {
      toast(backendMessage(err) ?? 'Could not remove the entry.', 'error');
    }
  }, [toast, load]);

  if (!canView) {
    return (
      <Box sx={{ p: 3 }}>
        <EmptyState title="No access" hint="You do not have permission to view the planner." />
      </Box>
    );
  }

  const lanes = plan?.lanes ?? [];
  const overCount = lanes.reduce((n, l) => n + l.days.filter((d) => d.overAllocated).length, 0);
  const plannedTotal = lanes.reduce((n, l) => n + l.days.reduce((m, d) => m + d.plannedMinutes, 0), 0);

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <PageHeader
        title="Planner"
        subtitle={
          plan
            ? `${mode === 'day' ? 'Day' : 'Week'} from ${fromYMD} · plant time ${plan.timezone} · ${fmtMinutes(plannedTotal)} planned`
            : 'Loading…'
        }
        actions={
          <>
            <TextField
              size="small"
              select
              label="Lane"
              value={laneFilter.length === 1 ? String(laneFilter[0]) : 'all'}
              onChange={(e) => setLaneFilter(e.target.value === 'all' ? [] : [Number(e.target.value)])}
              sx={{ minWidth: 150 }}
            >
              <MenuItem value="all">All resource types</MenuItem>
              {allLanes.map((l) => <MenuItem key={l.id} value={String(l.id)}>{l.name}</MenuItem>)}
            </TextField>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={mode}
              onChange={(_, v) => v && setMode(v)}
            >
              <ToggleButton value="day">Day</ToggleButton>
              <ToggleButton value="week">Week</ToggleButton>
            </ToggleButtonGroup>
            <Tooltip title="Previous">
              <IconButton size="small" onClick={() => setFromYMD(addDaysYMD(fromYMD, mode === 'day' ? -1 : -7))}>
                <ChevronLeftRounded />
              </IconButton>
            </Tooltip>
            <Button size="small" onClick={() => setFromYMD(todayYMD(timeZone))}>Today</Button>
            <Tooltip title="Next">
              <IconButton size="small" onClick={() => setFromYMD(addDaysYMD(fromYMD, mode === 'day' ? 1 : 7))}>
                <ChevronRightRounded />
              </IconButton>
            </Tooltip>
            <Tooltip title="Reload">
              <IconButton size="small" onClick={() => void load()}><RefreshRounded /></IconButton>
            </Tooltip>
            {canManage && (
              <Button
                size="small"
                variant="contained"
                startIcon={suggesting ? <CircularProgress size={14} color="inherit" /> : <AutoAwesomeRounded />}
                // Opens the ground rules first. Suggest used to fire straight
                // off whatever the grid was showing, with no way to state the
                // priority the engine ranks by.
                onClick={() => setSetupOpen(true)}
                disabled={suggesting}
              >
                Suggest
              </Button>
            )}
          </>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {overCount > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {overCount} lane-day{overCount === 1 ? '' : 's'} planned beyond manned capacity. That is
          allowed — the hours are simply not there unless someone is added.
        </Alert>
      )}

      {/* ── the suggestion, before it is accepted ────────────────────────── */}
      {run && (
        <Surface e={2} sx={{ p: 2, mb: 2, borderColor: 'var(--c-primary-200)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <AutoAwesomeRounded sx={{ color: 'var(--c-primary-500)' }} />
            <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
              {run.entryCount === 0
                ? `Suggestion #${run.runId}: nothing to place`
                : `Suggestion #${run.runId}: ${run.entryCount} bar${run.entryCount === 1 ? '' : 's'}, `
                  + `${run.taskCount} task${run.taskCount === 1 ? '' : 's'}, ${fmtMinutes(run.plannedMinutes)}`}
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Button size="small" startIcon={<CloseRounded />} onClick={() => setRun(null)}>Dismiss</Button>
            {/* Never offer to accept an empty run. "Accept all" beside "0 bars"
                reads as a plan you cannot see rather than as no plan. */}
            {run.entryCount > 0 && (<>
              <Button size="small" onClick={() => void onAccept(true)}>Accept &amp; pin</Button>
              <Button size="small" variant="contained" startIcon={<CheckRounded />} onClick={() => void onAccept(false)}>
                Accept all
              </Button>
            </>)}
          </Box>
          {run.entryCount === 0 && (
            <Alert severity="info" sx={{ mt: 1.5 }}>
              {windowEnded
                ? 'This window has already ended, and work can only be scheduled from now onwards — '
                  + 'so there is nothing the engine could put in it. Move the grid to today or later and suggest again.'
                : 'Nothing was left to place in this window. Everything open is either already on the plan, '
                  + 'waiting for raw material, or scheduled beyond these days.'}
            </Alert>
          )}
          {run.entryCount > 0 && (
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mt: 1 }}>
              Shown as dashed bars on the grid below — nothing is on the plan until you accept.
            </Typography>
          )}
          {(run.unschedulable.length > 0 || run.missingDuration > 0 || run.items.some((i) => i.breachesPin)) && (
            <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {run.unschedulable.length > 0 && (
                <Tooltip
                  title={run.unschedulable
                    .map((u) => `${u.operationName ?? `task ${u.taskId}`}${u.orderNumber ? ` (${u.orderNumber})` : ''}: ${u.reason}`)
                    .join('\n')}
                >
                  <Chip
                    size="small" color="warning" variant="outlined"
                    label={`${run.unschedulable.length} could not be placed`}
                  />
                </Tooltip>
              )}
              {run.missingDuration > 0 && (
                <Tooltip title="These operations have no time-formula result, so they plan as zero-length bars. Fix the formula in Setup › Operations.">
                  <Chip size="small" color="warning" variant="outlined" label={`${run.missingDuration} with no duration`} />
                </Tooltip>
              )}
              {run.items.some((i) => i.breachesPin) && (
                <Chip
                  size="small" color="error" variant="outlined"
                  label={`${run.items.filter((i) => i.breachesPin).length} finish after a must-finish-by date`}
                />
              )}
            </Box>
          )}
        </Surface>
      )}

      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: { xs: 'wrap', xl: 'nowrap' } }}>
        {/* ── grid ──────────────────────────────────────────────────────── */}
        <Surface e={1} sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          {loading ? (
            <Box sx={{ p: 2 }}><ListSkeleton rows={6} /></Box>
          ) : lanes.length === 0 ? (
            <EmptyState
              title="No resource types"
              hint="The planner draws one lane per resource type. Add them in Setup › Resources."
            />
          ) : (
            <PlannerGrid
              lanes={lanes}
              scale={scale}
              suggestions={run?.items ?? []}
              selectedEntryId={sheetEntry?.id ?? null}
              onSelectEntry={(e) => setSheetEntry(e)}
              onSelectSuggestion={() => { /* suggestions are accepted as a run, not individually */ }}
            />
          )}
          <Divider />
          <Box sx={{ px: 2, py: 1.25, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <Legend swatch={{ background: 'var(--c-primary-50)', opacity: 1 }} label="Fully manned" />
            <Legend swatch={{ background: 'var(--c-primary-50)', opacity: 0.5 }} label="Partly manned" />
            <Legend swatch={{ background: 'var(--c-surface)' }} label="Nobody on shift" />
            <Legend
              swatch={{ backgroundImage: 'repeating-linear-gradient(45deg, var(--c-surface-2) 0 4px, transparent 4px 8px)' }}
              label="No calendar (planned 24/7)"
            />
            <Legend swatch={{ background: 'var(--c-primary-100)', border: '1px solid var(--c-primary-200)' }} label="On the plan" />
            <Legend swatch={{ border: '1px dashed var(--c-primary-400)' }} label="Suggested" />
          </Box>
        </Surface>

        {/* ── backlog rail ──────────────────────────────────────────────── */}
        {/* 340 at the lg breakpoint (1200px) left the grid ~810px, under its own
            minimum. 300, and the rail only sits alongside from xl — below that
            it wraps under the grid, where it has the full width and the grid
            gets the hours it needs. */}
        <Box sx={{ width: { xs: '100%', xl: 300 }, flexShrink: 0 }}>
          <SectionCard
            title="Unplanned work"
            subtitle={`${backlog.length} task${backlog.length === 1 ? '' : 's'}, most urgent first`}
          >
            {canManage && (
              <Box sx={{ px: 2, pb: 1.5 }}>
                <FormControlLabel
                  control={<Checkbox size="small" checked={bundling} onChange={(e) => setBundling(e.target.checked)} />}
                  label={<Typography sx={{ fontSize: 12 }}>Bundle siblings when suggesting</Typography>}
                />
                <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                  <TextField
                    size="small" select label="Day" value={placeDay}
                    onChange={(e) => setPlaceDay(e.target.value)}
                    sx={{ flex: 1 }}
                  >
                    {scale.days.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
                  </TextField>
                  <TextField
                    size="small" label="At" type="time" value={placeAt}
                    onChange={(e) => setPlaceAt(e.target.value)}
                    sx={{ width: 110 }}
                    InputLabelProps={{ shrink: true }}
                  />
                </Box>
                <Button
                  fullWidth size="small" variant="contained" sx={{ mt: 1 }}
                  disabled={selectedTaskIds.length === 0}
                  onClick={() => void onPlace()}
                >
                  Add {selectedTaskIds.length || ''} to plan
                </Button>
                {refusal && (
                  <Alert severity="info" sx={{ mt: 1, fontSize: 12 }} onClose={() => setRefusal(null)}>
                    {refusal}
                  </Alert>
                )}
              </Box>
            )}
            <Box sx={{ maxHeight: 460, overflowY: 'auto' }}>
              {backlog.length === 0 ? (
                <EmptyState title="Nothing unplanned" hint="Every open task is on the plan." />
              ) : backlog.map((t) => {
                const checked = selectedTaskIds.includes(t.id);
                // Material is the only blocker that makes a row unselectable.
                // A predecessor is a thing you schedule; steel is a thing you
                // receive, and no arrangement of the plan produces it.
                const selectable = canManage && t.plannable !== false;
                const blockNote = blockNoteFor(t, timeZone);
                return (
                  <Box
                    key={t.id}
                    onClick={() => selectable && setSelectedTaskIds((prev) =>
                      prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id])}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1,
                      borderTop: '1px solid var(--c-divider)',
                      cursor: selectable ? 'pointer' : 'default',
                      opacity: t.plannable === false ? 0.62 : 1,
                      background: checked ? 'var(--c-primary-50)' : 'transparent',
                      '&:hover': { background: selectable ? 'var(--c-surface-2)' : undefined },
                    }}
                  >
                    {canManage && (
                      <Checkbox size="small" checked={checked} disabled={!selectable} sx={{ p: 0.25 }} />
                    )}
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-text)', lineHeight: 1.3 }} noWrap>
                        {t.operationName ?? 'Operation'}
                      </Typography>
                      <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)' }} noWrap>
                        {t.itemName ?? `item ${t.itemId}`}{t.orderNumber ? ` · ${t.orderNumber}` : ''}
                      </Typography>
                      {/* WHY it is blocked, and what to do about it. "blocked"
                          alone told you nothing and read as "cannot be planned",
                          which is wrong for the predecessor case — the one the
                          planner exists to lay out. */}
                      {blockNote && (
                        <Typography sx={{
                          fontSize: 10.5, lineHeight: 1.35, mt: 0.25,
                          color: selectable ? 'var(--c-text-2)' : 'var(--c-warning-800)',
                        }}>
                          {blockNote}
                        </Typography>
                      )}
                    </Box>
                    <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                      <Mono sx={{ fontSize: 11 }}>
                        {t.computedHours ? fmtMinutes(Number(t.computedHours) * 60) : '—'}
                      </Mono>
                      {t.earliestStart && (
                        <Tooltip title="Set the placement time to the first slot this can legally take">
                          <Button
                            size="small"
                            sx={{ display: 'block', ml: 'auto', fontSize: 10, py: 0, minWidth: 0 }}
                            onClick={(e) => { e.stopPropagation(); onPlaceAfter(t); }}
                          >
                            after it
                          </Button>
                        </Tooltip>
                      )}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </SectionCard>
        </Box>
      </Box>

      {/* ── selected bar ──────────────────────────────────────────────────── */}
      <SuggestSetupDialog
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        windowFrom={suggestWindow.from}
        windowTo={suggestWindow.to}
        resourceTypeIds={laneFilter.length ? laneFilter : undefined}
        timeZone={timeZone}
        onConfirm={() => { setSetupOpen(false); void onSuggest(); }}
      />

      <SideSheet
        open={!!sheetEntry}
        onClose={() => setSheetEntry(null)}
        title={sheetEntry?.label ?? 'Plan entry'}
        subtitle={sheetEntry
          ? `${fmtLocalTime(sheetEntry.plannedStart, timeZone)}–${fmtLocalTime(sheetEntry.plannedEnd, timeZone)} · ${fmtMinutes(sheetEntry.plannedMinutes)}`
          : undefined}
        actions={sheetEntry && canManage ? (
          <>
            <Button
              size="small" startIcon={<PushPinRounded />}
              onClick={() => void onTogglePin(sheetEntry)}
            >
              {sheetEntry.isPinned ? 'Unpin' : 'Pin'}
            </Button>
            {sheetEntry.tasks.length > 1 && (
              <Button size="small" startIcon={<CallSplitRounded />} onClick={() => void onSplit(sheetEntry)}>
                Split
              </Button>
            )}
            <Button
              size="small" color="error" startIcon={<DeleteOutlineRounded />}
              onClick={() => void onRemove(sheetEntry)}
            >
              Remove
            </Button>
          </>
        ) : undefined}
      >
        {sheetEntry && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Chip size="small" label={sheetEntry.source === 'manual' ? 'Placed by hand' : 'From a suggestion'} />
              {sheetEntry.isPinned && <Chip size="small" icon={<PushPinRounded />} label="Pinned" />}
              {sheetEntry.orderNumber && <Chip size="small" variant="outlined" label={sheetEntry.orderNumber} />}
            </Box>
            {sheetEntry.mustFinishBy && (
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
                Must finish by <strong>{sheetEntry.mustFinishBy}</strong>
              </Typography>
            )}
            <Divider />
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)' }}>
              {sheetEntry.tasks.length} task{sheetEntry.tasks.length === 1 ? '' : 's'} in this bar
            </Typography>
            {sheetEntry.tasks.map((t) => (
              <Box key={t.taskId} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                <Typography sx={{ fontSize: 12.5 }} noWrap>
                  {t.itemName ?? `item ${t.itemId}`} <Mono sx={{ fontSize: 11 }}>#{t.taskId}</Mono>
                </Typography>
                <Mono sx={{ fontSize: 11, flexShrink: 0 }}>{fmtMinutes(t.plannedMinutes)}</Mono>
              </Box>
            ))}
          </Box>
        )}
      </SideSheet>
    </Box>
  );
}

/**
 * One line saying why a backlog row is blocked, in the planner's own terms.
 *
 * Three distinct situations, and each wants a different next action:
 *
 *   material            receive it. Nothing on this screen helps.
 *   predecessor, unplanned   plan that first — and it says WHICH, because
 *                       "a predecessor" is not something you can go and find.
 *   predecessor, planned     ready to go after a stated time. This is the case
 *                       that used to be indistinguishable from the other two
 *                       and looked forbidden.
 */
function blockNoteFor(t: BacklogTask, timeZone: string): string | null {
  if (t.status !== 'blocked') return null;
  if (t.blockedBy === 'material' || t.blockedBy === 'both') return 'waiting for raw material';

  const waiting = t.waitingFor ?? [];
  if (!waiting.length) return 'blocked';

  const name = (w: BacklogTask['waitingFor'][number]) =>
    w.operationName ?? (w.seqNo != null ? `step ${w.seqNo}` : `task ${w.taskId}`);

  const unplanned = waiting.filter((w) => !w.planned);
  if (unplanned.length) {
    return unplanned.length === 1
      ? `plan ${name(unplanned[0])} first`
      : `plan ${unplanned.length} earlier steps first`;
  }
  return t.earliestStart
    ? `can follow ${name(waiting[waiting.length - 1])} — from ${fmtLocalTime(t.earliestStart, timeZone)}`
    : 'ready to follow its earlier step';
}

function Legend({ swatch, label }: { swatch: Record<string, unknown>; label: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <Box sx={{ width: 18, height: 12, borderRadius: '3px', border: '1px solid var(--c-border)', ...swatch }} />
      <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>{label}</Typography>
    </Box>
  );
}
