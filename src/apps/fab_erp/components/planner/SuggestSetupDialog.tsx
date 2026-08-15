/**
 * SuggestSetupDialog — the ground rules, stated before a suggestion is computed.
 *
 * WHY THIS EXISTS
 * ---------------
 * Suggest used to run straight off whatever the grid happened to be showing, and
 * the only thing it could be told was the window. Two consequences:
 *
 *   The ranking was untellable. The engine sequences by `priority_rank` and
 *   `must_finish_by`, and NEITHER had a UI anywhere in the app — while the
 *   Priority dropdown people do fill in on the order was read by no backend code
 *   at all. So "make the important job first" was not expressible, and the
 *   suggestion looked like it ignored priority because it had never been given
 *   any.
 *
 *   An empty answer looked like a broken one. The engine can only schedule from
 *   NOW forward, so asking it to plan a day that has already ended returns zero
 *   bars — and the old banner still offered "Accept all", which reads as a plan
 *   you cannot see rather than as no plan at all. The window line below says so
 *   before the run, not after it.
 *
 * WHAT IT WRITES
 * --------------
 * The order of the LIST is the sequence, saved as `priority_rank` (1-based).
 * Arranging rows is how a planner expresses "this one first"; asking for rank
 * numbers would be asking somebody to hand-maintain a sorted list. Priority and
 * the finish-by date are saved per row. All of it persists on the order — this
 * is not a per-run knob, and dispatch reads the same ranking, so what is stated
 * here is what the shop floor is told everywhere.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, MenuItem, TextField, Tooltip, Typography,
} from '@mui/material';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';

import {
  getPlanOrders, savePlanOrders, PRIORITY_LEVELS, type PlanOrder,
} from '../../api/planner';
import { Mono } from '../Mono';
import { backendMessage } from '../../utils/backendMessage';
import { fmtMinutes } from './plannerTime';

export interface SuggestSetupResult {
  /** True when the rules were changed and saved — the caller should reload. */
  saved: boolean;
}

export function SuggestSetupDialog({
  open, onClose, onConfirm, windowFrom, windowTo, resourceTypeIds, timeZone,
}: {
  open: boolean;
  onClose: () => void;
  /** Runs the suggestion. Called after the rules are saved. */
  onConfirm: (result: SuggestSetupResult) => void;
  /** The window the run will cover, as ISO instants. */
  windowFrom: string;
  windowTo: string;
  resourceTypeIds?: number[];
  timeZone: string;
}) {
  const [rows, setRows] = useState<PlanOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  /** Nothing is written unless something actually changed. */
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const res = await getPlanOrders({ resourceTypeIds });
      setRows(res.orders ?? []);
      setDirty(false);
    } catch (e) {
      setErr(backendMessage(e, 'Could not load the orders to plan.'));
    } finally {
      setLoading(false);
    }
    // resourceTypeIds is a fresh array each render; key on its content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(resourceTypeIds ?? []).join(',')]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  /**
   * The window cannot contain work that is already in the past.
   *
   * The engine anchors at now and schedules forward, so a window that has
   * already ended yields zero bars every time. Saying so here turns a confusing
   * empty result into a decision made before the run.
   */
  const windowOver = useMemo(() => new Date(windowTo).getTime() <= Date.now(), [windowTo]);
  const windowLabel = useMemo(() => {
    const d = (iso: string) => new Intl.DateTimeFormat('en-GB', {
      timeZone, weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(iso));
    return `${d(windowFrom)} → ${d(windowTo)}`;
  }, [windowFrom, windowTo, timeZone]);

  const move = (idx: number, delta: number) => {
    setRows((prev) => {
      const next = [...prev];
      const j = idx + delta;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
    setDirty(true);
  };

  const patch = (orderId: number, p: Partial<PlanOrder>) => {
    setRows((prev) => prev.map((r) => (r.orderId === orderId ? { ...r, ...p } : r)));
    setDirty(true);
  };

  async function run() {
    setBusy(true); setErr('');
    try {
      if (dirty) {
        await savePlanOrders(rows.map((r) => ({
          orderId: r.orderId,
          priority: r.priority ? String(r.priority).toLowerCase() : null,
          mustFinishBy: r.mustFinishBy ? r.mustFinishBy.slice(0, 10) : null,
        })));
      }
      onConfirm({ saved: dirty });
    } catch (e) {
      setErr(backendMessage(e, 'Could not save the planning rules.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
        <AutoAwesomeRounded sx={{ color: 'var(--c-primary-500)' }} />
        Suggest — set the ground rules
      </DialogTitle>
      <DialogContent dividers sx={{ minHeight: 320 }}>
        {err && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr('')}>{err}</Alert>}

        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 0.5 }}>
          Planning <strong>{windowLabel}</strong> · times are {timeZone}
        </Typography>
        {windowOver && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            That window has already ended. Work can only be scheduled from now onwards, so this
            would come back with nothing to show. Move the grid to today or later first.
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={22} /></Box>
        ) : rows.length === 0 ? (
          <Alert severity="info">
            No orders have unplanned work to sequence. Everything open is either already on the
            plan or waiting for raw material.
          </Alert>
        ) : (
          <>
            <Box component="table" sx={{
              width: '100%', borderCollapse: 'collapse', fontSize: 13,
              '& th': {
                textAlign: 'left', px: 1, py: 0.75, fontSize: 10.5, fontWeight: 600,
                letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)',
                borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap',
              },
              '& td': { px: 1, py: 0.75, borderBottom: '1px solid var(--c-border)', verticalAlign: 'middle' },
            }}>
              <thead>
                <tr>
                  <th style={{ width: 34 }}>#</th>
                  <th>Order</th>
                  <th style={{ width: 96 }}>Work</th>
                  <th style={{ width: 140 }}>Priority</th>
                  <th style={{ width: 210 }}>Finish by — no compromise</th>
                  <th style={{ width: 70 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.orderId}>
                    <td>
                      <Mono sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{i + 1}</Mono>
                    </td>
                    <td>
                      <Mono chip>{r.orderNumber ?? `#${r.orderId}`}</Mono>
                      <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mt: 0.25 }}>
                        {r.customerName ?? '—'}
                        {r.requiredDate ? ` · required ${r.requiredDate.slice(0, 10)}` : ''}
                      </Typography>
                    </td>
                    <td>
                      <Typography sx={{ fontSize: 12 }}>
                        {r.taskCount} task{r.taskCount === 1 ? '' : 's'}
                      </Typography>
                      <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>
                        {fmtMinutes(r.totalHours * 60)}
                      </Typography>
                    </td>
                    <td>
                      <TextField
                        select size="small" fullWidth
                        value={(r.priority ?? '').toLowerCase()}
                        onChange={(e) => patch(r.orderId, { priority: e.target.value || null })}
                      >
                        <MenuItem value="">— none —</MenuItem>
                        {PRIORITY_LEVELS.map((p) => (
                          <MenuItem key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</MenuItem>
                        ))}
                      </TextField>
                    </td>
                    <td>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Tooltip title="This date does not move. The engine reports any bar that breaches it.">
                          <Checkbox
                            size="small" sx={{ p: 0.25 }}
                            checked={!!r.mustFinishBy}
                            onChange={(e) => patch(r.orderId, {
                              // Ticking it means "the date we already committed to
                              // is the one that must hold", so it defaults to the
                              // required date rather than making them retype it.
                              mustFinishBy: e.target.checked
                                ? (r.mustFinishBy ?? r.requiredDate ?? '').slice(0, 10) || null
                                : null,
                            })}
                          />
                        </Tooltip>
                        <TextField
                          size="small" type="date" sx={{ flex: 1 }}
                          disabled={!r.mustFinishBy}
                          value={r.mustFinishBy ? r.mustFinishBy.slice(0, 10) : ''}
                          onChange={(e) => patch(r.orderId, { mustFinishBy: e.target.value || null })}
                          InputLabelProps={{ shrink: true }}
                        />
                      </Box>
                    </td>
                    <td>
                      <Box sx={{ display: 'flex' }}>
                        <IconButton size="small" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                          <ArrowUpwardRounded sx={{ fontSize: 15 }} />
                        </IconButton>
                        <IconButton size="small" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                          <ArrowDownwardRounded sx={{ fontSize: 15 }} />
                        </IconButton>
                      </Box>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Box>
            <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mt: 1.5 }}>
              Sequenced top-first. Priority orders the shop when nobody has arranged the rows;
              moving a row overrides it. A finish-by date sequences within a priority band and is
              reported — never silently missed — if the engine cannot hold it. These are saved on
              the order, so the Queue ranks by them too.
            </Typography>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button
          variant="contained" onClick={run} disabled={busy || loading}
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <AutoAwesomeRounded />}
        >
          {dirty ? 'Save and suggest' : 'Suggest'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
