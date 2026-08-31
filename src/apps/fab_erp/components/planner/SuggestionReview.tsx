/**
 * SuggestionReview — read the engine's answer, then take the parts you agree with.
 *
 * Planning was all-or-nothing: Re-plan retired the board and accepted an entire
 * suggestion in one act. That is the right move on a Monday morning and the
 * wrong one for "the crane work is fine, the welding is not". `acceptRun` has
 * always taken a list of run items — nothing could ever name one, because the
 * suggestion carried no ids.
 *
 * SUGGESTING IS NOT PLANNING. Computing a suggestion writes a run and changes
 * nothing on the board, so the drawer can be opened, read and closed with no
 * consequence. Only "Add to the plan" writes bars, and only the ticked ones.
 *
 * GROUPED BY MACHINE TYPE, because that is the unit a planner accepts in: the
 * question is almost never "do I want this one bar", it is "is the cutting
 * schedule sensible". Each group can be taken whole.
 *
 * WHAT IS ALREADY ON THE PLAN IS SHOWN, not hidden. A suggestion half-accepted
 * is the normal state of this screen, and hiding the accepted half would make
 * the list shrink under the reader as they work — and leave them unable to see
 * what they had already agreed to.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Divider, Drawer,
  FormControlLabel, IconButton, MenuItem, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';

import {
  getPlanRun, getPlanRuns, acceptRun, type PlanRunItem, type PlanRunSummary,
} from '../../api/planner';
import { backendMessage } from '../../components';

const fmt = (iso: string, timeZone: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    hour12: false, timeZone,
  });

export function SuggestionReview({
  open, runId, timeZone, canManage, onClose, onAccepted, onPickRun,
}: {
  open: boolean;
  runId: number | null;
  timeZone: string;
  canManage: boolean;
  onClose: () => void;
  /** Fired after bars are written, so the board behind reloads. */
  onAccepted: () => void;
  /** Switch to an earlier suggestion instead of computing a new one. */
  onPickRun: (runId: number) => void;
}) {
  const [items, setItems] = useState<PlanRunItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);
  const [runs, setRuns] = useState<PlanRunSummary[]>([]);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (runId == null) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getPlanRun(runId);
      setItems(res.items);
      // Nothing is ticked to begin with. Pre-ticking everything would make the
      // safe-looking button the one that plans the whole shop.
      setPicked(new Set());
    } catch (err) {
      setError(backendMessage(err, 'Could not read that suggestion.'));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  // Recent runs, so an earlier suggestion can be reopened. Computing one is a
  // minute of levelling and gives a different answer, so re-running to get back
  // to what you were reading is the wrong way to return to it.
  useEffect(() => {
    if (!open) return;
    getPlanRuns(10).then((r) => setRuns(r.runs)).catch(() => setRuns([]));
  }, [open, runId]);

  const groups = useMemo(() => {
    const by = new Map<string, PlanRunItem[]>();
    for (const it of items) {
      const k = it.resourceTypeName ?? `Type ${it.resourceTypeId}`;
      if (!by.has(k)) by.set(k, []);
      by.get(k)!.push(it);
    }
    return [...by.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [items]);

  const takeable = useMemo(() => items.filter((i) => !i.accepted), [items]);

  const toggle = (id: number) => setPicked((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleGroup = (rows: PlanRunItem[], on: boolean) => setPicked((cur) => {
    const next = new Set(cur);
    for (const r of rows) {
      if (r.accepted) continue;
      if (on) next.add(r.runItemId); else next.delete(r.runItemId);
    }
    return next;
  });

  const add = useCallback(async () => {
    if (runId == null || picked.size === 0) return;
    setAdding(true);
    setError(null);
    setNote(null);
    try {
      const res = await acceptRun({ runId, runItemIds: [...picked] });
      onAccepted();
      /*
       * Say what the server actually did, not what was ticked. Accept refuses a
       * bar whose tasks have since been started, cancelled or planned elsewhere
       * — silently dropping those would leave the reader believing they had
       * planned work that is not on the board.
       */
      if (res.skipped.length) {
        setNote(`Added ${res.accepted}. ${res.skipped.length} could not be added — ${res.skipped[0].reason}`);
      } else {
        setNote(`Added ${res.accepted} to the plan.`);
      }
      // Re-read rather than assume: what landed is the server's answer.
      await load();
    } catch (err) {
      setError(backendMessage(err, 'Those bars could not be added.'));
    } finally {
      setAdding(false);
    }
  }, [runId, picked, onAccepted, load]);

  const pickedMinutes = useMemo(
    () => items.filter((i) => picked.has(i.runItemId)).reduce((a, b) => a + (b.plannedMinutes || 0), 0),
    [items, picked],
  );

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: 520 } }}>
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
          <Typography variant="subtitle1" sx={{ flex: 1 }}>What the engine suggests</Typography>
          <Tooltip title="Read it again">
            <span>
              <IconButton size="small" onClick={() => void load()} disabled={loading}>
                <RefreshRounded fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <IconButton size="small" onClick={onClose}><CloseRounded fontSize="small" /></IconButton>
        </Stack>

        <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5 }}>
          Nothing here is on the plan until you add it. Tick what you agree with — a whole
          machine type, or single bars — and leave the rest. Taking a bar without the work
          that feeds it is allowed; the board will show it as a violation.
        </Typography>

        {runs.length > 1 && (
          <TextField
            select
            size="small"
            label="Suggestion"
            value={runId ?? ''}
            onChange={(e) => onPickRun(Number(e.target.value))}
            sx={{ mb: 1.5 }}
          >
            {runs.map((r) => (
              <MenuItem key={r.id} value={r.id}>
                {`#${r.id} · ${fmt(r.createdAt, timeZone)} · ${r.itemCount} bars · ${r.acceptedCount} taken`}
              </MenuItem>
            ))}
          </TextField>
        )}

        {error && <Alert severity="warning" sx={{ mb: 1.5 }} onClose={() => setError(null)}>{error}</Alert>}
        {note && <Alert severity="info" sx={{ mb: 1.5 }} onClose={() => setNote(null)}>{note}</Alert>}

        {loading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress size={22} /></Box>
        ) : (
          <>
            <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
              <Chip size="small" label={`${items.length} suggested`} />
              <Chip
                size="small"
                color={items.length - takeable.length > 0 ? 'success' : 'default'}
                variant="outlined"
                label={`${items.length - takeable.length} already on the plan`}
              />
              <Chip size="small" color="primary" variant="outlined" label={`${picked.size} ticked`} />
            </Stack>

            <Box sx={{ flex: 1, overflowY: 'auto', pr: 0.5 }}>
              {groups.map(([name, rows]) => {
                const open2 = rows.filter((r) => !r.accepted);
                const allOn = open2.length > 0 && open2.every((r) => picked.has(r.runItemId));
                return (
                  <Box key={name} sx={{ mb: 1.5 }}>
                    <Stack direction="row" alignItems="center" sx={{ mb: 0.25 }}>
                      <FormControlLabel
                        sx={{ flex: 1, mr: 0 }}
                        control={(
                          <Checkbox
                            size="small"
                            checked={allOn}
                            indeterminate={!allOn && open2.some((r) => picked.has(r.runItemId))}
                            disabled={!canManage || open2.length === 0}
                            onChange={(e) => toggleGroup(rows, e.target.checked)}
                          />
                        )}
                        label={(
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {name}
                          </Typography>
                        )}
                      />
                      <Typography variant="caption" color="text.secondary">
                        {open2.length} of {rows.length} to add
                      </Typography>
                    </Stack>
                    <Divider />
                    {rows.slice(0, 60).map((r) => (
                      <Stack
                        key={r.runItemId}
                        direction="row"
                        alignItems="flex-start"
                        sx={{ py: 0.25, opacity: r.accepted ? 0.55 : 1 }}
                      >
                        <Checkbox
                          size="small"
                          sx={{ py: 0.25 }}
                          checked={r.accepted || picked.has(r.runItemId)}
                          disabled={!canManage || r.accepted}
                          onChange={() => toggle(r.runItemId)}
                        />
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography variant="body2" noWrap title={r.label ?? undefined}>
                            {r.label ?? `${r.taskCount} task(s)`}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                            {fmt(r.plannedStart, timeZone)} · {Math.round(r.plannedMinutes)} min
                            {r.resourceName ? ` · ${r.resourceName}` : ''}
                            {r.orderNumber ? ` · ${r.orderNumber}` : ''}
                          </Typography>
                          {r.reason && (
                            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                              why: {r.reason}
                            </Typography>
                          )}
                        </Box>
                        {r.isCriticalChain && (
                          <Chip size="small" color="warning" variant="outlined" label="critical" sx={{ ml: 0.5 }} />
                        )}
                      </Stack>
                    ))}
                    {rows.length > 60 && (
                      <Typography variant="caption" color="text.secondary">
                        …and {rows.length - 60} more on this machine type. Use the group tick to take them all.
                      </Typography>
                    )}
                  </Box>
                );
              })}
            </Box>

            <Divider sx={{ my: 1 }} />
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                {picked.size > 0
                  ? `${picked.size} bar${picked.size === 1 ? '' : 's'} · ${Math.round(pickedMinutes / 60)} h of work`
                  : 'Nothing ticked'}
              </Typography>
              <Button onClick={onClose}>Close</Button>
              <Button
                variant="contained"
                disabled={!canManage || picked.size === 0 || adding}
                onClick={() => void add()}
              >
                {adding ? 'Adding…' : `Add ${picked.size} to the plan`}
              </Button>
            </Stack>
          </>
        )}
      </Box>
    </Drawer>
  );
}
