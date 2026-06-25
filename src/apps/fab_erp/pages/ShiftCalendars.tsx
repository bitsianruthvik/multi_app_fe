/**
 * EU-C7 — Shift Calendars, Shifts, and Calendar Days
 *
 * Master list of FabShiftCalendars.  Selecting one reveals two sub-sections:
 *   1. Shifts (fab_shifts)      — name, start_time, end_time, working_minutes
 *   2. Calendar Days (fab_calendar_days) — day_date, is_working (Switch → 0/1)
 *
 * working_minutes is fully user-editable (authoritative for capacity).
 * is_working is stored as 0 | 1.
 * All write payloads are snake_case; update/delete always include `id`.
 * All Add/Edit/Delete controls are gated by `fab_erp_calendars_manage`.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Grid,
  IconButton,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon    from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon   from '@mui/icons-material/Edit';
import EventNoteIcon from '@mui/icons-material/EventNote';
import ScheduleIcon  from '@mui/icons-material/Schedule';

import { fabQuery, fabMutate } from '@apps/fab_erp/api/client';
import type {
  FabShiftCalendar,
  FabShift,
  FabCalendarDay,
} from '@apps/fab_erp/types';
import { usePermission } from '@core/hooks/usePermission';

// ── response shape ─────────────────────────────────────────────────────────────
interface QueryResult<T> { data: T[]; total?: number }

// ── draft types ────────────────────────────────────────────────────────────────
interface CalendarDraft { name: string; code: string }
interface ShiftDraft    {
  name: string;
  startTime: string;         // HH:MM
  endTime: string;           // HH:MM
  workingMinutes: number | '';
}
interface DayDraft      { dayDate: string; isWorking: boolean }

const BLANK_CALENDAR = (): CalendarDraft => ({ name: '', code: '' });
const BLANK_SHIFT    = (): ShiftDraft    => ({ name: '', startTime: '', endTime: '', workingMinutes: '' });
const BLANK_DAY      = (): DayDraft      => ({ dayDate: '', isWorking: true });

// ── helpers ────────────────────────────────────────────────────────────────────
/** Convert HH:MM or HH:MM:SS → total minutes.  Returns NaN on bad input. */
function timeToMinutes(t: string): number {
  const [h = '0', m = '0'] = t.split(':');
  return Number(h) * 60 + Number(m);
}

/** Suggest working_minutes from start/end.  Clamps to ≥ 0. */
function suggestMinutes(start: string, end: string): number | '' {
  if (!start || !end) return '';
  const diff = timeToMinutes(end) - timeToMinutes(start);
  return diff > 0 ? diff : '';
}

// ══════════════════════════════════════════════════════════════════════════════
// Calendar Dialog — Add / Edit a FabShiftCalendar
// ══════════════════════════════════════════════════════════════════════════════
function CalendarDialog({
  open, initial, onClose, onSaved,
}: {
  open: boolean;
  initial: FabShiftCalendar | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft,  setDraft]  = useState<CalendarDraft>(BLANK_CALENDAR());
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');
  const isNew = !initial;

  useEffect(() => {
    if (!open) return;
    setDraft(
      initial ? { name: initial.name, code: initial.code } : BLANK_CALENDAR(),
    );
    setErr('');
  }, [open, initial]);

  const set = (k: keyof CalendarDraft, v: string) =>
    setDraft((d) => ({ ...d, [k]: v }));

  async function save() {
    if (!draft.name.trim() || !draft.code.trim()) {
      setErr('Name and Code are required.');
      return;
    }
    setSaving(true); setErr('');
    try {
      const payload: Record<string, unknown> = {
        name: draft.name.trim(),
        code: draft.code.trim().toUpperCase(),
      };
      if (!isNew) payload.id = initial!.id;
      await fabMutate('fabErpShiftCalendar', isNew ? 'insert' : 'update', payload);
      onSaved();
    } catch (e: any) {
      setErr(e.response?.data?.error ?? e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{isNew ? 'New Shift Calendar' : `Edit — ${initial?.code}`}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <TextField
          label="Calendar Name"
          value={draft.name}
          onChange={(e) => set('name', e.target.value)}
          size="small"
          fullWidth
          required
          autoFocus
        />
        <TextField
          label="Code"
          value={draft.code}
          onChange={(e) => set('code', e.target.value)}
          size="small"
          fullWidth
          required
          inputProps={{ style: { textTransform: 'uppercase' } }}
          helperText="Short identifier, e.g. CAL-A"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={save}
          disabled={saving || !draft.name.trim() || !draft.code.trim()}
        >
          {saving ? <CircularProgress size={16} /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Shift Dialog — Add / Edit a FabShift
// ══════════════════════════════════════════════════════════════════════════════
function ShiftDialog({
  open, initial, calendarId, onClose, onSaved,
}: {
  open: boolean;
  initial: FabShift | null;
  calendarId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft,  setDraft]  = useState<ShiftDraft>(BLANK_SHIFT());
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');
  const isNew = !initial;

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setDraft({
        name:           initial.name,
        startTime:      initial.startTime?.slice(0, 5) ?? '',
        endTime:        initial.endTime?.slice(0, 5) ?? '',
        workingMinutes: initial.workingMinutes ?? '',
      });
    } else {
      setDraft(BLANK_SHIFT());
    }
    setErr('');
  }, [open, initial]);

  const set = <K extends keyof ShiftDraft>(k: K, v: ShiftDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  /** When end changes, suggest working_minutes if user hasn't typed a custom value. */
  function handleTimeChange(field: 'startTime' | 'endTime', val: string) {
    setDraft((d) => {
      const next = { ...d, [field]: val };
      const start = field === 'startTime' ? val : d.startTime;
      const end   = field === 'endTime'   ? val : d.endTime;
      // Auto-suggest only if workingMinutes is still at the previous auto-suggested value
      // or empty — i.e. the user hasn't overridden it with something else.
      const prevSuggestion = suggestMinutes(d.startTime, d.endTime);
      if (d.workingMinutes === '' || d.workingMinutes === prevSuggestion) {
        next.workingMinutes = suggestMinutes(start, end);
      }
      return next;
    });
  }

  async function save() {
    if (!draft.name.trim()) { setErr('Name is required.'); return; }
    if (!draft.startTime)   { setErr('Start time is required.'); return; }
    if (!draft.endTime)     { setErr('End time is required.'); return; }
    if (draft.workingMinutes === '' || Number(draft.workingMinutes) < 0) {
      setErr('Working minutes is required and must be ≥ 0.');
      return;
    }
    setSaving(true); setErr('');
    try {
      const payload: Record<string, unknown> = {
        calendar_id:     calendarId,
        name:            draft.name.trim(),
        start_time:      draft.startTime,
        end_time:        draft.endTime,
        working_minutes: Number(draft.workingMinutes),
      };
      if (!isNew) payload.id = initial!.id;
      await fabMutate('fabErpShift', isNew ? 'insert' : 'update', payload);
      onSaved();
    } catch (e: any) {
      setErr(e.response?.data?.error ?? e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isNew ? 'New Shift' : `Edit — ${initial?.name}`}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <TextField
          label="Shift Name"
          value={draft.name}
          onChange={(e) => set('name', e.target.value)}
          size="small"
          fullWidth
          required
          autoFocus
          placeholder="e.g. Morning Shift"
        />
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              label="Start Time"
              type="time"
              value={draft.startTime}
              onChange={(e) => handleTimeChange('startTime', e.target.value)}
              size="small"
              fullWidth
              required
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 60 } }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              label="End Time"
              type="time"
              value={draft.endTime}
              onChange={(e) => handleTimeChange('endTime', e.target.value)}
              size="small"
              fullWidth
              required
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 60 } }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              label="Working Minutes"
              type="number"
              value={draft.workingMinutes}
              onChange={(e) =>
                set('workingMinutes', e.target.value === '' ? '' : Number(e.target.value))
              }
              size="small"
              fullWidth
              required
              inputProps={{ min: 0, max: 1440, step: 1 }}
              helperText="Authoritative for capacity"
            />
          </Grid>
        </Grid>
        {draft.startTime && draft.endTime && (
          <Typography variant="caption" color="text.secondary">
            Clock span: {(() => {
              const diff = timeToMinutes(draft.endTime) - timeToMinutes(draft.startTime);
              return diff >= 0
                ? `${Math.floor(diff / 60)}h ${diff % 60}m (${diff} min)`
                : 'crosses midnight';
            })()}
            {' '}&mdash; override Working Minutes above if breaks or downtime apply.
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={save}
          disabled={saving || !draft.name.trim() || !draft.startTime || !draft.endTime}
        >
          {saving ? <CircularProgress size={16} /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Calendar Day Dialog — Add / Edit a FabCalendarDay
// ══════════════════════════════════════════════════════════════════════════════
function DayDialog({
  open, initial, calendarId, onClose, onSaved,
}: {
  open: boolean;
  initial: FabCalendarDay | null;
  calendarId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft,  setDraft]  = useState<DayDraft>(BLANK_DAY());
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');
  const isNew = !initial;

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setDraft({
        dayDate:   initial.dayDate?.slice(0, 10) ?? '',
        isWorking: !!initial.isWorking,
      });
    } else {
      setDraft(BLANK_DAY());
    }
    setErr('');
  }, [open, initial]);

  async function save() {
    if (!draft.dayDate) { setErr('Date is required.'); return; }
    setSaving(true); setErr('');
    try {
      const payload: Record<string, unknown> = {
        calendar_id: calendarId,
        day_date:    draft.dayDate,
        is_working:  draft.isWorking ? 1 : 0,
      };
      if (!isNew) payload.id = initial!.id;
      await fabMutate('fabErpCalendarDay', isNew ? 'insert' : 'update', payload);
      onSaved();
    } catch (e: any) {
      setErr(e.response?.data?.error ?? e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{isNew ? 'New Calendar Day' : `Edit — ${initial?.dayDate?.slice(0, 10)}`}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <TextField
          label="Date"
          type="date"
          value={draft.dayDate}
          onChange={(e) => setDraft((d) => ({ ...d, dayDate: e.target.value }))}
          size="small"
          fullWidth
          required
          slotProps={{ inputLabel: { shrink: true } }}
          autoFocus
        />
        <FormControlLabel
          control={
            <Switch
              checked={draft.isWorking}
              onChange={(e) => setDraft((d) => ({ ...d, isWorking: e.target.checked }))}
            />
          }
          label={draft.isWorking ? 'Working day' : 'Non-working day'}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={save}
          disabled={saving || !draft.dayDate}
        >
          {saving ? <CircularProgress size={16} /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Delete Confirm Dialog
// ══════════════════════════════════════════════════════════════════════════════
function DeleteConfirm({
  open, label, onClose, onConfirm,
}: {
  open: boolean; label: string; onClose: () => void; onConfirm: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Confirm Delete</DialogTitle>
      <DialogContent>
        <Typography>Delete <strong>{label}</strong>? This cannot be undone.</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          color="error"
          variant="contained"
          disabled={busy}
          onClick={async () => { setBusy(true); await onConfirm(); setBusy(false); }}
        >
          {busy ? <CircularProgress size={16} /> : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Shifts sub-panel
// ══════════════════════════════════════════════════════════════════════════════
function ShiftsPanel({
  calendarId, canManage,
}: {
  calendarId: number; canManage: boolean;
}) {
  const [shifts,  setShifts]  = useState<FabShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState('');

  const [shiftDlg,  setShiftDlg]  = useState<{ open: boolean; item: FabShift | null }>({ open: false, item: null });
  const [delDlg,    setDelDlg]    = useState<{ open: boolean; item: FabShift | null }>({ open: false, item: null });

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const res = await fabQuery<QueryResult<FabShift>>('fabErpShift', {
        filters:  { calendarId },
        orderBy:  [{ field: 'startTime', direction: 'asc' }],
        pagination: { limit: 200 },
      });
      setShifts(res.data ?? []);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [calendarId]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete() {
    if (!delDlg.item) return;
    try {
      await fabMutate('fabErpShift', 'delete', { id: delDlg.item.id });
      setDelDlg({ open: false, item: null });
      load();
    } catch (e: any) {
      setErr(e.response?.data?.error ?? e.message);
    }
  }

  function onSaved() {
    setShiftDlg({ open: false, item: null });
    load();
  }

  return (
    <Box>
      {err && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr('')}>{err}</Alert>}

      {canManage && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1.5 }}>
          <Button
            size="small"
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setShiftDlg({ open: true, item: null })}
          >
            Add Shift
          </Button>
        </Box>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : shifts.length === 0 ? (
        <Typography color="text.secondary" variant="body2" sx={{ py: 2 }}>
          No shifts defined for this calendar.
        </Typography>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Start</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>End</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Working Min</TableCell>
              {canManage && <TableCell sx={{ fontWeight: 700, width: 90 }} />}
            </TableRow>
          </TableHead>
          <TableBody>
            {shifts.map((s) => (
              <TableRow key={s.id} hover>
                <TableCell>{s.name}</TableCell>
                <TableCell>{s.startTime?.slice(0, 5) ?? '—'}</TableCell>
                <TableCell>{s.endTime?.slice(0, 5) ?? '—'}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={`${s.workingMinutes} min`}
                    color="primary"
                    variant="outlined"
                  />
                </TableCell>
                {canManage && (
                  <TableCell>
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={() => setShiftDlg({ open: true, item: s })}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton size="small" color="error" onClick={() => setDelDlg({ open: true, item: s })}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ShiftDialog
        open={shiftDlg.open}
        initial={shiftDlg.item}
        calendarId={calendarId}
        onClose={() => setShiftDlg({ open: false, item: null })}
        onSaved={onSaved}
      />
      <DeleteConfirm
        open={delDlg.open}
        label={delDlg.item?.name ?? ''}
        onClose={() => setDelDlg({ open: false, item: null })}
        onConfirm={handleDelete}
      />
    </Box>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Calendar Days sub-panel
// ══════════════════════════════════════════════════════════════════════════════
function CalendarDaysPanel({
  calendarId, canManage,
}: {
  calendarId: number; canManage: boolean;
}) {
  const [days,    setDays]    = useState<FabCalendarDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState('');

  const [dayDlg, setDayDlg] = useState<{ open: boolean; item: FabCalendarDay | null }>({ open: false, item: null });
  const [delDlg, setDelDlg] = useState<{ open: boolean; item: FabCalendarDay | null }>({ open: false, item: null });

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const res = await fabQuery<QueryResult<FabCalendarDay>>('fabErpCalendarDay', {
        filters:  { calendarId },
        orderBy:  [{ field: 'dayDate', direction: 'asc' }],
        pagination: { limit: 1000 },
      });
      setDays(res.data ?? []);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [calendarId]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete() {
    if (!delDlg.item) return;
    try {
      await fabMutate('fabErpCalendarDay', 'delete', { id: delDlg.item.id });
      setDelDlg({ open: false, item: null });
      load();
    } catch (e: any) {
      setErr(e.response?.data?.error ?? e.message);
    }
  }

  function onSaved() {
    setDayDlg({ open: false, item: null });
    load();
  }

  const workingCount    = days.filter((d) => d.isWorking).length;
  const nonWorkingCount = days.length - workingCount;

  return (
    <Box>
      {err && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr('')}>{err}</Alert>}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
        <Stack direction="row" spacing={1}>
          {days.length > 0 && (
            <>
              <Chip size="small" label={`${workingCount} working`}     color="success" variant="outlined" />
              <Chip size="small" label={`${nonWorkingCount} non-working`} color="default" variant="outlined" />
            </>
          )}
        </Stack>
        {canManage && (
          <Button
            size="small"
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setDayDlg({ open: true, item: null })}
          >
            Add Day
          </Button>
        )}
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : days.length === 0 ? (
        <Typography color="text.secondary" variant="body2" sx={{ py: 2 }}>
          No calendar days defined. Add specific dates to mark working / non-working days.
        </Typography>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
              {canManage && <TableCell sx={{ fontWeight: 700, width: 90 }} />}
            </TableRow>
          </TableHead>
          <TableBody>
            {days.map((d) => (
              <TableRow
                key={d.id}
                hover
                sx={{ bgcolor: d.isWorking ? undefined : 'action.hover' }}
              >
                <TableCell sx={{ fontWeight: d.isWorking ? 500 : undefined, color: d.isWorking ? undefined : 'text.disabled' }}>
                  {d.dayDate?.slice(0, 10) ?? '—'}
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={d.isWorking ? 'Working' : 'Non-working'}
                    color={d.isWorking ? 'success' : 'default'}
                  />
                </TableCell>
                {canManage && (
                  <TableCell>
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={() => setDayDlg({ open: true, item: d })}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton size="small" color="error" onClick={() => setDelDlg({ open: true, item: d })}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <DayDialog
        open={dayDlg.open}
        initial={dayDlg.item}
        calendarId={calendarId}
        onClose={() => setDayDlg({ open: false, item: null })}
        onSaved={onSaved}
      />
      <DeleteConfirm
        open={delDlg.open}
        label={delDlg.item?.dayDate?.slice(0, 10) ?? ''}
        onClose={() => setDelDlg({ open: false, item: null })}
        onConfirm={handleDelete}
      />
    </Box>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Calendar detail panel — shown when a calendar is selected
// ══════════════════════════════════════════════════════════════════════════════
function CalendarDetail({
  calendar, canManage,
}: {
  calendar: FabShiftCalendar; canManage: boolean;
}) {
  const [subTab, setSubTab] = useState(0);

  return (
    <Box sx={{ mt: 3 }}>
      <Divider sx={{ mb: 2 }} />

      {/* Sub-section header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="h6" fontWeight={600}>
          {calendar.name}
        </Typography>
        <Chip label={calendar.code} size="small" variant="outlined" />
      </Box>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={subTab} onChange={(_, v) => setSubTab(v)}>
          <Tab
            icon={<ScheduleIcon fontSize="small" />}
            iconPosition="start"
            label="Shifts"
            sx={{ minHeight: 40 }}
          />
          <Tab
            icon={<EventNoteIcon fontSize="small" />}
            iconPosition="start"
            label="Calendar Days"
            sx={{ minHeight: 40 }}
          />
        </Tabs>
      </Box>

      {subTab === 0 && (
        <ShiftsPanel calendarId={calendar.id} canManage={canManage} />
      )}
      {subTab === 1 && (
        <CalendarDaysPanel calendarId={calendar.id} canManage={canManage} />
      )}
    </Box>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Main page — ShiftCalendars
// ══════════════════════════════════════════════════════════════════════════════
export default function ShiftCalendars() {
  const canManage = usePermission('fab_erp_calendars_manage');

  const [calendars,  setCalendars]  = useState<FabShiftCalendar[]>([]);
  const [selected,   setSelected]   = useState<FabShiftCalendar | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [err,        setErr]        = useState('');

  const [calDlg,  setCalDlg]  = useState<{ open: boolean; item: FabShiftCalendar | null }>({ open: false, item: null });
  const [delDlg,  setDelDlg]  = useState<{ open: boolean; item: FabShiftCalendar | null }>({ open: false, item: null });

  const loadCalendars = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const res = await fabQuery<QueryResult<FabShiftCalendar>>('fabErpShiftCalendar', {
        orderBy:    [{ field: 'name', direction: 'asc' }],
        pagination: { limit: 500 },
      });
      const list = res.data ?? [];
      setCalendars(list);
      // Keep selection in sync after reload
      setSelected((prev) =>
        prev ? (list.find((c) => c.id === prev.id) ?? null) : null,
      );
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCalendars(); }, [loadCalendars]);

  async function handleDelete() {
    if (!delDlg.item) return;
    try {
      await fabMutate('fabErpShiftCalendar', 'delete', { id: delDlg.item.id });
      if (selected?.id === delDlg.item.id) setSelected(null);
      setDelDlg({ open: false, item: null });
      loadCalendars();
    } catch (e: any) {
      setErr(e.response?.data?.error ?? e.message);
    }
  }

  function onCalendarSaved() {
    setCalDlg({ open: false, item: null });
    loadCalendars();
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      {/* ── Page header ─────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Shift Calendars</Typography>
          <Typography variant="body2" color="text.secondary">
            Define shift calendars, their shifts, and per-date working / non-working days.
            Working minutes per shift feed the formula engine and capacity views.
          </Typography>
        </Box>
        {canManage && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCalDlg({ open: true, item: null })}
          >
            New Calendar
          </Button>
        )}
      </Box>

      {err && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr('')}>{err}</Alert>
      )}

      {/* ── Calendars table ──────────────────────────────────────── */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
          <CircularProgress />
        </Box>
      ) : calendars.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography color="text.secondary">No shift calendars yet.</Typography>
          {canManage && (
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              sx={{ mt: 2 }}
              onClick={() => setCalDlg({ open: true, item: null })}
            >
              Create first calendar
            </Button>
          )}
        </Box>
      ) : (
        <>
          <Table size="small" sx={{ mb: 1 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Code</TableCell>
                {canManage && <TableCell sx={{ fontWeight: 700, width: 100 }} />}
              </TableRow>
            </TableHead>
            <TableBody>
              {calendars.map((cal) => {
                const isSelected = selected?.id === cal.id;
                return (
                  <TableRow
                    key={cal.id}
                    hover
                    selected={isSelected}
                    onClick={() => setSelected(isSelected ? null : cal)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell>
                      <Typography variant="body2" fontWeight={isSelected ? 700 : 400}>
                        {cal.name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={cal.code} size="small" variant="outlined" />
                    </TableCell>
                    {canManage && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Tooltip title="Edit">
                          <IconButton
                            size="small"
                            onClick={() => setCalDlg({ open: true, item: cal })}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => setDelDlg({ open: true, item: cal })}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <Typography variant="caption" color="text.secondary">
            Click a row to view or edit its shifts and calendar days.
          </Typography>

          {/* ── Detail panel ────────────────────────────────────── */}
          {selected && (
            <CalendarDetail calendar={selected} canManage={canManage} />
          )}
        </>
      )}

      {/* ── Dialogs ─────────────────────────────────────────────── */}
      <CalendarDialog
        open={calDlg.open}
        initial={calDlg.item}
        onClose={() => setCalDlg({ open: false, item: null })}
        onSaved={onCalendarSaved}
      />
      <DeleteConfirm
        open={delDlg.open}
        label={delDlg.item?.name ?? ''}
        onClose={() => setDelDlg({ open: false, item: null })}
        onConfirm={handleDelete}
      />
    </Box>
  );
}
