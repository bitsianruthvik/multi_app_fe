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
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, IconButton, MenuItem, TextField, Tooltip, Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import BuildRounded from '@mui/icons-material/BuildRounded';
import CloudRounded from '@mui/icons-material/CloudRounded';
import AssignmentLateRounded from '@mui/icons-material/AssignmentLateRounded';
import PrecisionManufacturingRounded from '@mui/icons-material/PrecisionManufacturingRounded';

import {
  getGapReasons, getDayGaps, explainGap, withdrawExplained,
  type DayGaps, type GapReason, type ExplainedSpan,
} from '../api/gaps';
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

const mins = (a: string, b: string) => Math.round((+new Date(b) - +new Date(a)) / 60000);
const fmtDur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m`.replace(' 0m', '') : `${m}m`);

const SCOPE_ICON = {
  site: <CloudRounded sx={{ fontSize: 15 }} />,
  machine: <BuildRounded sx={{ fontSize: 15 }} />,
  task: <AssignmentLateRounded sx={{ fontSize: 15 }} />,
} as const;

export function GapTable({ resourceId, date, onChanged }: {
  resourceId: number | null;
  date: string;
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const [day, setDay] = useState<DayGaps | null>(null);
  const [reasons, setReasons] = useState<GapReason[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  // The row being added, anchored to a specific gap.
  const [draft, setDraft] = useState<{ gapIdx: number; code: string; from: string; to: string; taskId: string; party: string; note: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!resourceId) { setDay(null); return; }
    setLoading(true); setErr('');
    try {
      setDay(await getDayGaps(resourceId, date));
    } catch (e) {
      setErr(backendMessage(e, 'Failed to load the day.'));
    } finally {
      setLoading(false);
    }
  }, [resourceId, date]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { getGapReasons().then((r) => setReasons(r.reasons ?? [])).catch(() => {}); }, []);

  const reasonByCode = useMemo(() => new Map(reasons.map((r) => [r.code, r])), [reasons]);
  const chosen = draft ? reasonByCode.get(draft.code) : undefined;

  // Tasks on this machine that day — needed when a task-scoped reason is chosen.
  const tasksToday = useMemo(
    () => (day?.explained ?? []).filter((e) => e.kind === 'work' && e.taskId),
    [day],
  );

  function openDraft(gapIdx: number) {
    if (!day) return;
    const g = day.gaps[gapIdx];
    setDraft({
      gapIdx, code: '',
      // Prefilled to the whole gap. Most days are one cause, and the common case
      // should be: pick a reason, press save.
      from: siteTime(g.start, day.timezone),
      to: siteTime(g.end, day.timezone),
      taskId: '', party: '', note: '',
    });
  }

  async function save() {
    if (!draft || !day || !resourceId) return;
    if (!draft.code) { setErr('Pick a reason.'); return; }
    if (chosen?.scope === 'task' && !draft.taskId) {
      setErr(`"${chosen.label}" applies to a job — pick which one.`); return;
    }
    setSaving(true); setErr('');
    try {
      const res = await explainGap({
        resourceId, date, code: draft.code,
        fromTime: draft.from, toTime: draft.to,
        taskId: draft.taskId ? Number(draft.taskId) : undefined,
        party: draft.party.trim() || undefined,
        note: draft.note.trim() || undefined,
      });
      setDay(res); setDraft(null);
      toast('Recorded.', 'success');
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
      setDay(await withdrawExplained(e.stream, e.id, resourceId, date));
      toast('Withdrawn — the time is unaccounted again.', 'success');
      onChanged?.();
    } catch (x) {
      toast(backendMessage(x, 'Failed to withdraw.'), 'error');
    }
  }

  if (!resourceId) return null;
  if (loading && !day) return <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Loading the day…</Typography>;
  if (!day) return null;

  if (day.workingMinutes === 0) {
    return (
      <Alert severity="info" sx={{ mt: 1 }}>
        No working time on {day.resourceName} for this date — no shift is configured, so
        there is nothing to account for. A day the plant was closed is not a gap.
      </Alert>
    );
  }

  const rows = [
    ...day.explained.map((e) => ({ type: 'explained' as const, e })),
    ...day.gaps.map((g, i) => ({ type: 'gap' as const, g, i })),
  ].sort((a, b) => +new Date(a.type === 'gap' ? a.g.start : a.e.from) - +new Date(b.type === 'gap' ? b.g.start : b.e.from));

  return (
    <Box>
      {/* The arithmetic, stated plainly. If these three ever fail to add up the
          user should be able to see it rather than trust us. */}
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'baseline', mb: 1 }}>
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>
          Working day <strong style={{ color: 'var(--c-text)' }}>{fmtDur(day.workingMinutes)}</strong>
          {'  =  '}accounted {fmtDur(day.explainedMinutes)}
          {'  +  '}
          <Box component="span" sx={{ color: day.gapMinutes > 0 ? 'var(--c-warning-800)' : 'var(--c-text-3)', fontWeight: 600 }}>
            unaccounted {fmtDur(day.gapMinutes)}
          </Box>
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>times are {day.timezone}</Typography>
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
                <Box>{siteTime(e.from, day.timezone)}</Box>
                <Box>{siteTime(e.to, day.timezone)}</Box>
                <Box sx={{ color: 'var(--c-text-3)' }}>{fmtDur(mins(e.from, e.to))}</Box>
                <Box>
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
                <Box>{siteTime(g.start, day.timezone)}</Box>
                <Box>{siteTime(g.end, day.timezone)}</Box>
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
                      select size="small" label="What happened" sx={{ minWidth: 230 }}
                      value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                    >
                      {reasons.map((r) => (
                        <MenuItem key={r.code} value={r.code}>
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
                      from: siteTime(g.start, day.timezone),
                      to: siteTime(g.end, day.timezone),
                    })}>
                      Rest of the gap
                    </Button>
                  </Box>

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

      {day.gapMinutes > 0 && (
        <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mt: 1 }}>
          Leaving time unaccounted is fine — it is recorded as unknown rather than guessed at.
        </Typography>
      )}
    </Box>
  );
}
