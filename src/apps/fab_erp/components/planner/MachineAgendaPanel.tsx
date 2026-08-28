/**
 * MachineAgendaPanel — one machine, day by day, beside the day view.
 *
 * The day view answers "what is on this machine right now". Standing in front of
 * it the next question is always "and then what", which is a week, so this shows
 * the next seven days task by task rather than a single figure per week.
 *
 * It is also where work is moved between machines. The move is offered per TASK
 * and not per bar, because a bar can be several tasks running across several
 * machines at once — see planMachineService for why the assignment lives on the
 * task. The machines offered are the ones its own type has, each already marked
 * free or busy at that task's exact times, so the planner is choosing from what
 * is possible rather than guessing and being refused.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Divider, Menu, MenuItem, Stack, Typography,
} from '@mui/material';
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded';
import {
  getMachineAgenda, getTaskMachines, assignTaskToMachine,
  type MachineAgendaDay, type TaskMachineOption,
} from '../../api/planner';

function hhmm(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone,
  });
}

function dayLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  });
}

export function MachineAgendaPanel({
  machineId, from, timeZone, canManage, onMoved,
}: {
  machineId: number;
  from: Date;
  timeZone: string;
  canManage: boolean;
  onMoved?: () => void;
}) {
  const [data, setData] = useState<{
    machineName: string; typeName: string; totalTonnes: number; totalHours: number;
    agenda: MachineAgendaDay[];
  } | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await getMachineAgenda({ machineId, from: from.toISOString(), days: 7 });
      setData({
        machineName: res.machineName,
        typeName: res.typeName,
        totalTonnes: res.totalTonnes,
        totalHours: res.totalHours,
        agenda: res.agenda,
      });
    } catch {
      setError('Could not read that machine.');
    } finally {
      setBusy(false);
    }
  }, [machineId, from]);

  useEffect(() => { void load(); }, [load]);

  // ── moving one task to another machine ──────────────────────────────────
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [moving, setMoving] = useState<{ entryId: number; taskId: number } | null>(null);
  const [options, setOptions] = useState<TaskMachineOption[] | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  const openMove = useCallback(async (el: HTMLElement, entryId: number, taskId: number) => {
    setAnchor(el);
    setMoving({ entryId, taskId });
    setOptions(null);
    setMoveError(null);
    try {
      const res = await getTaskMachines({ entryId, taskId });
      setOptions(res.machines);
    } catch {
      setMoveError('Could not list machines for that task.');
    }
  }, []);

  const doMove = useCallback(async (resourceId: number) => {
    if (!moving) return;
    setAnchor(null);
    try {
      await assignTaskToMachine({ pairs: [moving], resourceId });
      await load();
      onMoved?.();
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMoveError(msg ?? 'That machine could not take it.');
    }
  }, [moving, load, onMoved]);

  if (busy && !data) {
    return <Box sx={{ p: 2, textAlign: 'center' }}><CircularProgress size={20} /></Box>;
  }
  if (error) return <Alert severity="warning" sx={{ m: 1 }}>{error}</Alert>;
  if (!data) return null;

  return (
    <Box sx={{ width: 320, flexShrink: 0, borderLeft: 1, borderColor: 'divider', pl: 2, ml: 2 }}>
      <Typography variant="subtitle2" noWrap title={data.machineName}>{data.machineName}</Typography>
      <Typography variant="caption" color="text.secondary">
        {data.typeName} · next 7 days · {data.totalTonnes} t · {data.totalHours} h
      </Typography>

      {moveError && <Alert severity="warning" sx={{ mt: 1 }} onClose={() => setMoveError(null)}>{moveError}</Alert>}

      {data.agenda.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Nothing planned on this machine in the next seven days.
        </Typography>
      )}

      <Box sx={{ mt: 1.5, maxHeight: 460, overflowY: 'auto', pr: 0.5 }}>
        {data.agenda.map((d) => (
          <Box key={d.day} sx={{ mb: 1.5 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="baseline">
              <Typography variant="caption" sx={{ fontWeight: 700 }}>{dayLabel(d.day)}</Typography>
              <Typography variant="caption" color="text.secondary">
                {d.tonnes} t · {d.hours} h
              </Typography>
            </Stack>
            <Divider sx={{ my: 0.5 }} />
            {d.tasks.map((t) => (
              <Stack
                key={`${t.entryId}:${t.taskId}`}
                direction="row"
                alignItems="flex-start"
                spacing={0.5}
                sx={{ py: 0.35 }}
              >
                <Typography
                  variant="caption"
                  sx={{ width: 78, flexShrink: 0, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}
                >
                  {hhmm(t.start, timeZone)}–{hhmm(t.end, timeZone)}
                </Typography>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2" noWrap title={t.itemCode ?? undefined}>
                    {t.operationName ?? 'Operation'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                    {t.itemCode ?? t.itemName ?? ''} · {t.tonnes} t
                  </Typography>
                </Box>
                {canManage && (
                  <Button
                    size="small"
                    sx={{ minWidth: 0, px: 0.5 }}
                    title="Run this on a different machine"
                    onClick={(e) => void openMove(e.currentTarget, t.entryId, t.taskId)}
                  >
                    <SwapHorizRounded fontSize="small" />
                  </Button>
                )}
              </Stack>
            ))}
          </Box>
        ))}
      </Box>

      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {!options && <MenuItem disabled>Looking at the other machines…</MenuItem>}
        {options?.length === 0 && <MenuItem disabled>This type has only one machine.</MenuItem>}
        {options?.map((o) => (
          <MenuItem
            key={o.machineId}
            disabled={o.current || !o.free}
            onClick={() => void doMove(o.machineId)}
          >
            {o.name}
            {o.current && ' — already here'}
            {!o.current && !o.free && ' — busy then'}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
}
