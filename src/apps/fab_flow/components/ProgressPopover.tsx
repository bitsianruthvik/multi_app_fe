import { useState, useEffect, useMemo } from 'react';
import {
  Popover, Box, Typography, Slider, TextField, Button,
  FormGroup, FormControlLabel, Checkbox, Divider, Stack,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import api, { API_HOST } from '@core/utils/axiosConfig';
import { DELAY_REASONS } from './delayReasons';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TaskProgressEntry {
  id?: number;
  processStepId: number;
  nodeId: number | null;
  logDate: string;         // YYYY-MM-DD
  completionPct: number;   // 0-100
  workStart: string | null; // HH:MM
  workEnd: string | null;
  delayReasonCodes: string[] | null;
  notes: string | null;
}

interface Props {
  anchorEl: HTMLElement | null;
  task: {
    processStepId: number;
    nodeId: number | null;
    nodeDisplay: string;
    stepName: string;
    workAreaName: string;
    startDate: string;
    endDate: string;
    scheduledHours: number;
  } | null;
  allEntries: TaskProgressEntry[];   // ALL prior log entries for this task (for deviation calc)
  planId: number;
  company: string;
  /** If provided, log/pre-fill for this specific date instead of today */
  logDate?: string;
  onClose: () => void;
  onSaved: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function timeToMinutes(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

function calcTotalWorkedHours(entries: TaskProgressEntry[]): number | null {
  const timed = entries.filter(e => e.workStart && e.workEnd);
  if (timed.length === 0) return null;
  return timed.reduce((sum, e) => {
    const start = timeToMinutes(e.workStart);
    const end   = timeToMinutes(e.workEnd);
    if (start == null || end == null || end <= start) return sum;
    return sum + (end - start) / 60;
  }, 0);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProgressPopover({
  anchorEl, task, allEntries, planId, company, logDate: logDateProp, onClose, onSaved,
}: Props) {
  const open = Boolean(anchorEl) && task !== null;

  // Use supplied logDate (from Tracking view day-click) or fall back to today
  const todayStr    = logDateProp ?? today();
  const existing    = allEntries.find(e => e.logDate === todayStr);
  const latestEntry = allEntries.length > 0
    ? allEntries.reduce((best, e) => e.logDate > best.logDate ? e : best)
    : null;
  const currentPct  = latestEntry?.completionPct ?? 0;

  const [pct,       setPct]       = useState(currentPct);
  const [workStart, setWorkStart] = useState(existing?.workStart ?? '');
  const [workEnd,   setWorkEnd]   = useState(existing?.workEnd   ?? '');
  const [reasons,   setReasons]   = useState<string[]>([]);
  const [saving,    setSaving]    = useState(false);

  // Reset form when a different task is opened
  useEffect(() => {
    if (!open) return;
    setPct(currentPct);
    setWorkStart(existing?.workStart ?? '');
    setWorkEnd(existing?.workEnd ?? '');
    setReasons([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.processStepId, task?.nodeId, open]);

  // Deviation check — only relevant when closing at 100 %
  const deviation = useMemo(() => {
    if (!task || pct < 100) return null;
    // Include today's entry in the total
    const allWithToday: TaskProgressEntry[] = [
      ...allEntries.filter(e => e.logDate !== todayStr),
      { processStepId: task.processStepId, nodeId: task.nodeId,
        logDate: todayStr, completionPct: pct,
        workStart: workStart || null, workEnd: workEnd || null,
        delayReasonCodes: null, notes: null },
    ];
    const workedHrs = calcTotalWorkedHours(allWithToday);
    if (workedHrs != null && task.scheduledHours > 0) {
      const dev = (workedHrs - task.scheduledHours) / task.scheduledHours * 100;
      return dev > 15 ? { pct: Math.round(dev), workedHrs } : null;
    }
    // Fall back to day-based deviation
    const closeDateMs   = new Date(todayStr + 'T00:00:00').getTime();
    const plannedEndMs  = new Date(task.endDate + 'T00:00:00').getTime();
    const plannedStartMs = new Date(task.startDate + 'T00:00:00').getTime();
    const plannedDays   = Math.max(1, Math.round((plannedEndMs - plannedStartMs) / 86400000) + 1);
    const actualDays    = Math.max(1, Math.round((closeDateMs  - plannedStartMs) / 86400000) + 1);
    const devPct        = (actualDays - plannedDays) / plannedDays * 100;
    return devPct > 15 ? { pct: Math.round(devPct), workedHrs: null } : null;
  }, [task, pct, workStart, workEnd, allEntries, todayStr]);

  const showReasons = pct >= 100 && deviation !== null;

  const handleSave = async () => {
    if (!task) return;
    if (showReasons && reasons.length === 0) return; // force selecting at least one
    setSaving(true);
    try {
      await api.put(`${API_HOST}/api/${company}/fab_flow/plans/${planId}/progress`, {
        processStepId:    task.processStepId,
        nodeId:           task.nodeId,
        logDate:          todayStr,
        completionPct:    pct,
        workStart:        workStart || null,
        workEnd:          workEnd   || null,
        delayReasonCodes: showReasons ? reasons : null,
      });
      onSaved();
      onClose();
    } catch { /* ignore */ } finally { setSaving(false); }
  };

  const toggleReason = (code: string) =>
    setReasons(prev => prev.includes(code) ? prev.filter(r => r !== code) : [...prev, code]);

  if (!task) return null;

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      slotProps={{ paper: { sx: { width: 320, borderRadius: 2, overflow: 'hidden' } } }}
    >
      {/* Header */}
      <Box sx={{ px: 2, pt: 1.5, pb: 1, bgcolor: 'grey.50', borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="body2" fontWeight={700} noWrap>{task.nodeDisplay}</Typography>
        <Typography variant="caption" color="text.secondary" noWrap display="block">
          {task.stepName} · {task.workAreaName}
        </Typography>
      </Box>

      <Box sx={{ px: 2, pt: 1.5, pb: 2 }}>
        {/* % slider */}
        <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" sx={{ mb: 0.5 }}>
          Completion
        </Typography>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Slider
            value={pct}
            onChange={(_, v) => setPct(v as number)}
            min={0} max={100} step={1}
            sx={{ flexGrow: 1 }}
            color={pct >= 100 ? 'success' : 'primary'}
          />
          <TextField
            value={pct}
            onChange={e => {
              const v = Math.max(0, Math.min(100, Number(e.target.value)));
              if (!isNaN(v)) setPct(v);
            }}
            size="small"
            type="number"
            inputProps={{ min: 0, max: 100, style: { textAlign: 'center', padding: '4px 6px', width: 46 } }}
            sx={{ '& .MuiOutlinedInput-root': { fontSize: 13 } }}
          />
          <Typography variant="caption" color="text.secondary">%</Typography>
        </Stack>

        {/* Time inputs */}
        <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" sx={{ mt: 1.5, mb: 0.5 }}>
          {logDateProp ? `Work on ${new Date(logDateProp + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : "Today's work"}
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            label="Start" type="time" size="small"
            value={workStart} onChange={e => setWorkStart(e.target.value)}
            InputLabelProps={{ shrink: true }} sx={{ flex: 1, '& input': { fontSize: 13 } }}
          />
          <Typography variant="caption" color="text.secondary">→</Typography>
          <TextField
            label="End" type="time" size="small"
            value={workEnd} onChange={e => setWorkEnd(e.target.value)}
            InputLabelProps={{ shrink: true }} sx={{ flex: 1, '& input': { fontSize: 13 } }}
          />
        </Stack>

        {/* Deviation + reasons */}
        {showReasons && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 1 }}>
              <WarningAmberIcon color="warning" sx={{ fontSize: 16 }} />
              <Typography variant="caption" color="warning.dark" fontWeight={600}>
                {deviation!.workedHrs != null
                  ? `${deviation!.workedHrs.toFixed(1)} h worked vs ${task.scheduledHours.toFixed(1)} h planned`
                  : `Closed ${deviation!.pct}% later than planned`}
              </Typography>
            </Stack>
            <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" sx={{ mb: 0.5 }}>
              Select reason(s) — required
            </Typography>
            <FormGroup>
              {DELAY_REASONS.map(r => (
                <FormControlLabel
                  key={r.code}
                  control={
                    <Checkbox
                      size="small" checked={reasons.includes(r.code)}
                      onChange={() => toggleReason(r.code)}
                      sx={{ py: 0.25 }}
                    />
                  }
                  label={<Typography variant="caption">{r.label}</Typography>}
                  sx={{ ml: 0 }}
                />
              ))}
            </FormGroup>
            {showReasons && reasons.length === 0 && (
              <Typography variant="caption" color="error" sx={{ mt: 0.5, display: 'block' }}>
                Select at least one reason to save.
              </Typography>
            )}
          </>
        )}

        {/* Actions */}
        <Stack direction="row" spacing={1} sx={{ mt: 2 }} justifyContent="flex-end">
          <Button size="small" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            size="small" variant="contained"
            onClick={handleSave}
            disabled={saving || (showReasons && reasons.length === 0)}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </Stack>
      </Box>
    </Popover>
  );
}

