import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, Grid, IconButton, Stack, Switch, Tab, Table, TableBody, TableCell, TableHead,
  TableRow, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import EventNoteIcon from '@mui/icons-material/EventNote';
import ScheduleIcon from '@mui/icons-material/Schedule';
import CalendarMonthRounded from '@mui/icons-material/CalendarMonthRounded';

import { fabQuery, fabMutate } from '@apps/fab_erp/api/client';
import type { FabShiftCalendar, FabShift, FabCalendarDay } from '@apps/fab_erp/types';
import { usePermission } from '@core/hooks/usePermission';
import { Surface, PageHeader, Mono, StatusBadge, EmptyState, ListSkeleton, useToast } from '../components';

interface QueryResult<T> { data: T[]; total?: number }
interface CalendarDraft { name: string; code: string }
interface ShiftDraft { name: string; startTime: string; endTime: string; workingMinutes: number | '' }
interface DayDraft { dayDate: string; isWorking: boolean }

const BLANK_CALENDAR = (): CalendarDraft => ({ name: '', code: '' });
const BLANK_SHIFT = (): ShiftDraft => ({ name: '', startTime: '', endTime: '', workingMinutes: '' });
const BLANK_DAY = (): DayDraft => ({ dayDate: '', isWorking: true });

const th = { fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '.05em', borderColor: 'var(--c-divider)' } as const;
const td = { borderColor: 'var(--c-divider)', fontSize: 13, color: 'var(--c-text)' } as const;

function timeToMinutes(t: string): number {
  const [h = '0', m = '0'] = t.split(':');
  return Number(h) * 60 + Number(m);
}
function suggestMinutes(start: string, end: string): number | '' {
  if (!start || !end) return '';
  const diff = timeToMinutes(end) - timeToMinutes(start);
  return diff > 0 ? diff : '';
}

function CalendarDialog({ open, initial, onClose, onSaved }: {
  open: boolean; initial: FabShiftCalendar | null; onClose: () => void; onSaved: () => void;
}) {
  const [draft, setDraft] = useState<CalendarDraft>(BLANK_CALENDAR());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const isNew = !initial;

  useEffect(() => {
    if (!open) return;
    setDraft(initial ? { name: initial.name, code: initial.code } : BLANK_CALENDAR());
    setErr('');
  }, [open, initial]);

  const set = (k: keyof CalendarDraft, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  async function save() {
    if (!draft.name.trim() || !draft.code.trim()) { setErr('Name and code are required.'); return; }
    setSaving(true); setErr('');
    try {
      const payload: Record<string, unknown> = { name: draft.name.trim(), code: draft.code.trim().toUpperCase() };
      if (!isNew) payload.id = initial!.id;
      await fabMutate('fabErpShiftCalendar', isNew ? 'insert' : 'update', payload);
      onSaved();
    } catch (e) {
      const ax = e as { response?: { data?: { error?: string } }; message?: string };
      setErr(ax.response?.data?.error ?? ax.message ?? 'Save failed');
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>{isNew ? 'New shift calendar' : `Edit — ${initial?.code}`}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <TextField label="Calendar name" value={draft.name} onChange={(e) => set('name', e.target.value)} size="small" fullWidth required autoFocus />
        <TextField label="Code" value={draft.code} onChange={(e) => set('code', e.target.value)} size="small" fullWidth required slotProps={{ htmlInput: { style: { textTransform: 'uppercase' } } }} helperText="Short identifier, e.g. CAL-A" />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving || !draft.name.trim() || !draft.code.trim()}>
          {saving ? <CircularProgress size={16} color="inherit" /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ShiftDialog({ open, initial, calendarId, onClose, onSaved }: {
  open: boolean; initial: FabShift | null; calendarId: number; onClose: () => void; onSaved: () => void;
}) {
  const [draft, setDraft] = useState<ShiftDraft>(BLANK_SHIFT());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const isNew = !initial;

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setDraft({ name: initial.name, startTime: initial.startTime?.slice(0, 5) ?? '', endTime: initial.endTime?.slice(0, 5) ?? '', workingMinutes: initial.workingMinutes ?? '' });
    } else setDraft(BLANK_SHIFT());
    setErr('');
  }, [open, initial]);

  const set = <K extends keyof ShiftDraft>(k: K, v: ShiftDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  function handleTimeChange(field: 'startTime' | 'endTime', val: string) {
    setDraft((d) => {
      const next = { ...d, [field]: val };
      const start = field === 'startTime' ? val : d.startTime;
      const end = field === 'endTime' ? val : d.endTime;
      const prevSuggestion = suggestMinutes(d.startTime, d.endTime);
      if (d.workingMinutes === '' || d.workingMinutes === prevSuggestion) next.workingMinutes = suggestMinutes(start, end);
      return next;
    });
  }

  async function save() {
    if (!draft.name.trim()) { setErr('Name is required.'); return; }
    if (!draft.startTime) { setErr('Start time is required.'); return; }
    if (!draft.endTime) { setErr('End time is required.'); return; }
    if (draft.workingMinutes === '' || Number(draft.workingMinutes) < 0) { setErr('Working minutes is required and must be ≥ 0.'); return; }
    setSaving(true); setErr('');
    try {
      const payload: Record<string, unknown> = {
        calendar_id: calendarId, name: draft.name.trim(), start_time: draft.startTime,
        end_time: draft.endTime, working_minutes: Number(draft.workingMinutes),
      };
      if (!isNew) payload.id = initial!.id;
      await fabMutate('fabErpShift', isNew ? 'insert' : 'update', payload);
      onSaved();
    } catch (e) {
      const ax = e as { response?: { data?: { error?: string } }; message?: string };
      setErr(ax.response?.data?.error ?? ax.message ?? 'Save failed');
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>{isNew ? 'New shift' : `Edit — ${initial?.name}`}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <TextField label="Shift name" value={draft.name} onChange={(e) => set('name', e.target.value)} size="small" fullWidth required autoFocus placeholder="e.g. Morning Shift" />
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField label="Start time" type="time" value={draft.startTime} onChange={(e) => handleTimeChange('startTime', e.target.value)} size="small" fullWidth required slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 60 } }} />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField label="End time" type="time" value={draft.endTime} onChange={(e) => handleTimeChange('endTime', e.target.value)} size="small" fullWidth required slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 60 } }} />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField label="Working minutes" type="number" value={draft.workingMinutes} onChange={(e) => set('workingMinutes', e.target.value === '' ? '' : Number(e.target.value))} size="small" fullWidth required slotProps={{ htmlInput: { min: 0, max: 1440, step: 1 } }} helperText="Authoritative for capacity" />
          </Grid>
        </Grid>
        {draft.startTime && draft.endTime && (
          <Typography variant="caption" sx={{ color: 'var(--c-text-3)' }}>
            Clock span: {(() => {
              const diff = timeToMinutes(draft.endTime) - timeToMinutes(draft.startTime);
              return diff >= 0 ? `${Math.floor(diff / 60)}h ${diff % 60}m (${diff} min)` : 'crosses midnight';
            })()} — override working minutes above if breaks or downtime apply.
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving || !draft.name.trim() || !draft.startTime || !draft.endTime}>
          {saving ? <CircularProgress size={16} color="inherit" /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function DayDialog({ open, initial, calendarId, onClose, onSaved }: {
  open: boolean; initial: FabCalendarDay | null; calendarId: number; onClose: () => void; onSaved: () => void;
}) {
  const [draft, setDraft] = useState<DayDraft>(BLANK_DAY());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const isNew = !initial;

  useEffect(() => {
    if (!open) return;
    if (initial) setDraft({ dayDate: initial.dayDate?.slice(0, 10) ?? '', isWorking: !!initial.isWorking });
    else setDraft(BLANK_DAY());
    setErr('');
  }, [open, initial]);

  async function save() {
    if (!draft.dayDate) { setErr('Date is required.'); return; }
    setSaving(true); setErr('');
    try {
      const payload: Record<string, unknown> = { calendar_id: calendarId, day_date: draft.dayDate, is_working: draft.isWorking ? 1 : 0 };
      if (!isNew) payload.id = initial!.id;
      await fabMutate('fabErpCalendarDay', isNew ? 'insert' : 'update', payload);
      onSaved();
    } catch (e) {
      const ax = e as { response?: { data?: { error?: string } }; message?: string };
      setErr(ax.response?.data?.error ?? ax.message ?? 'Save failed');
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>{isNew ? 'New calendar day' : `Edit — ${initial?.dayDate?.slice(0, 10)}`}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <TextField label="Date" type="date" value={draft.dayDate} onChange={(e) => setDraft((d) => ({ ...d, dayDate: e.target.value }))} size="small" fullWidth required slotProps={{ inputLabel: { shrink: true } }} autoFocus />
        <FormControlLabel control={<Switch checked={draft.isWorking} onChange={(e) => setDraft((d) => ({ ...d, isWorking: e.target.checked }))} />} label={draft.isWorking ? 'Working day' : 'Non-working day'} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving || !draft.dayDate}>
          {saving ? <CircularProgress size={16} color="inherit" /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function DeleteConfirm({ open, label, onClose, onConfirm }: { open: boolean; label: string; onClose: () => void; onConfirm: () => Promise<void> | void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>Confirm delete</DialogTitle>
      <DialogContent><Typography>Delete <strong>{label}</strong>? This cannot be undone.</Typography></DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button color="error" variant="contained" disabled={busy} onClick={async () => { setBusy(true); await onConfirm(); setBusy(false); }}>
          {busy ? <CircularProgress size={16} color="inherit" /> : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ShiftsPanel({ calendarId, canManage }: { calendarId: number; canManage: boolean }) {
  const [shifts, setShifts] = useState<FabShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [shiftDlg, setShiftDlg] = useState<{ open: boolean; item: FabShift | null }>({ open: false, item: null });
  const [delDlg, setDelDlg] = useState<{ open: boolean; item: FabShift | null }>({ open: false, item: null });

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const res = await fabQuery<QueryResult<FabShift>>('fabErpShift', { filters: { calendarId }, orderBy: [{ field: 'startTime', direction: 'asc' }], pagination: { limit: 200 } });
      setShifts(res.data ?? []);
    } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }, [calendarId]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete() {
    if (!delDlg.item) return;
    try { await fabMutate('fabErpShift', 'delete', { id: delDlg.item.id }); setDelDlg({ open: false, item: null }); load(); }
    catch (e) {
      const ax = e as { response?: { data?: { error?: string } }; message?: string };
      setErr(ax.response?.data?.error ?? ax.message ?? 'Delete failed');
    }
  }

  function onSaved() { setShiftDlg({ open: false, item: null }); load(); }

  return (
    <Box>
      {err && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr('')}>{err}</Alert>}
      {canManage && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1.5 }}>
          <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => setShiftDlg({ open: true, item: null })}>Add shift</Button>
        </Box>
      )}
      {loading ? <ListSkeleton rows={3} /> : shifts.length === 0 ? (
        <EmptyState title="No shifts defined for this calendar" />
      ) : (
        <Surface e={1} sx={{ overflow: 'hidden' }}>
          <Table size="small">
            <TableHead><TableRow sx={{ background: 'var(--c-surface-2)' }}>
              <TableCell sx={th}>Name</TableCell><TableCell sx={th}>Start</TableCell><TableCell sx={th}>End</TableCell>
              <TableCell sx={th}>Working min</TableCell>{canManage && <TableCell sx={{ ...th, width: 90 }} />}
            </TableRow></TableHead>
            <TableBody>
              {shifts.map((s) => (
                <TableRow key={s.id} hover>
                  <TableCell sx={td}>{s.name}</TableCell>
                  <TableCell sx={td}><Mono>{s.startTime?.slice(0, 5) ?? '—'}</Mono></TableCell>
                  <TableCell sx={td}><Mono>{s.endTime?.slice(0, 5) ?? '—'}</Mono></TableCell>
                  <TableCell sx={td}><Mono chip>{s.workingMinutes} min</Mono></TableCell>
                  {canManage && (
                    <TableCell sx={td}>
                      <Tooltip title="Edit"><IconButton size="small" onClick={() => setShiftDlg({ open: true, item: s })}><EditRounded fontSize="small" /></IconButton></Tooltip>
                      <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setDelDlg({ open: true, item: s })}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Surface>
      )}
      <ShiftDialog open={shiftDlg.open} initial={shiftDlg.item} calendarId={calendarId} onClose={() => setShiftDlg({ open: false, item: null })} onSaved={onSaved} />
      <DeleteConfirm open={delDlg.open} label={delDlg.item?.name ?? ''} onClose={() => setDelDlg({ open: false, item: null })} onConfirm={handleDelete} />
    </Box>
  );
}

function CalendarDaysPanel({ calendarId, canManage }: { calendarId: number; canManage: boolean }) {
  const [days, setDays] = useState<FabCalendarDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [dayDlg, setDayDlg] = useState<{ open: boolean; item: FabCalendarDay | null }>({ open: false, item: null });
  const [delDlg, setDelDlg] = useState<{ open: boolean; item: FabCalendarDay | null }>({ open: false, item: null });

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const res = await fabQuery<QueryResult<FabCalendarDay>>('fabErpCalendarDay', { filters: { calendarId }, orderBy: [{ field: 'dayDate', direction: 'asc' }], pagination: { limit: 1000 } });
      setDays(res.data ?? []);
    } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }, [calendarId]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete() {
    if (!delDlg.item) return;
    try { await fabMutate('fabErpCalendarDay', 'delete', { id: delDlg.item.id }); setDelDlg({ open: false, item: null }); load(); }
    catch (e) {
      const ax = e as { response?: { data?: { error?: string } }; message?: string };
      setErr(ax.response?.data?.error ?? ax.message ?? 'Delete failed');
    }
  }

  function onSaved() { setDayDlg({ open: false, item: null }); load(); }

  const workingCount = days.filter((d) => d.isWorking).length;
  const nonWorkingCount = days.length - workingCount;

  return (
    <Box>
      {err && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr('')}>{err}</Alert>}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
        <Stack direction="row" spacing={1}>
          {days.length > 0 && (<>
            <StatusBadge status={`${workingCount} working`} family="success" />
            <StatusBadge status={`${nonWorkingCount} non-working`} family="neutral" />
          </>)}
        </Stack>
        {canManage && <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => setDayDlg({ open: true, item: null })}>Add day</Button>}
      </Box>
      {loading ? <ListSkeleton rows={3} /> : days.length === 0 ? (
        <EmptyState title="No calendar days defined" hint="Add specific dates to mark working / non-working days." />
      ) : (
        <Surface e={1} sx={{ overflow: 'hidden' }}>
          <Table size="small">
            <TableHead><TableRow sx={{ background: 'var(--c-surface-2)' }}>
              <TableCell sx={th}>Date</TableCell><TableCell sx={th}>Status</TableCell>{canManage && <TableCell sx={{ ...th, width: 90 }} />}
            </TableRow></TableHead>
            <TableBody>
              {days.map((d) => (
                <TableRow key={d.id} hover sx={{ background: d.isWorking ? undefined : 'var(--c-surface-2)' }}>
                  <TableCell sx={{ ...td, fontWeight: d.isWorking ? 500 : 400, color: d.isWorking ? 'var(--c-text)' : 'var(--c-text-3)' }}><Mono>{d.dayDate?.slice(0, 10) ?? '—'}</Mono></TableCell>
                  <TableCell sx={td}><StatusBadge status={d.isWorking ? 'Working' : 'Non-working'} family={d.isWorking ? 'success' : 'neutral'} /></TableCell>
                  {canManage && (
                    <TableCell sx={td}>
                      <Tooltip title="Edit"><IconButton size="small" onClick={() => setDayDlg({ open: true, item: d })}><EditRounded fontSize="small" /></IconButton></Tooltip>
                      <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setDelDlg({ open: true, item: d })}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Surface>
      )}
      <DayDialog open={dayDlg.open} initial={dayDlg.item} calendarId={calendarId} onClose={() => setDayDlg({ open: false, item: null })} onSaved={onSaved} />
      <DeleteConfirm open={delDlg.open} label={delDlg.item?.dayDate?.slice(0, 10) ?? ''} onClose={() => setDelDlg({ open: false, item: null })} onConfirm={handleDelete} />
    </Box>
  );
}

function CalendarDetail({ calendar, canManage }: { calendar: FabShiftCalendar; canManage: boolean }) {
  const [subTab, setSubTab] = useState(0);
  return (
    <Box sx={{ mt: 3 }}>
      <Box sx={{ borderTop: '1px solid var(--c-divider)', pt: 2.5, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Typography sx={{ fontSize: 17, fontWeight: 600, color: 'var(--c-text)' }}>{calendar.name}</Typography>
          <Mono chip>{calendar.code}</Mono>
        </Box>
        <Box sx={{ borderBottom: '1px solid var(--c-divider)' }}>
          <Tabs value={subTab} onChange={(_, v) => setSubTab(v)}>
            <Tab icon={<ScheduleIcon fontSize="small" />} iconPosition="start" label="Shifts" sx={{ minHeight: 40 }} />
            <Tab icon={<EventNoteIcon fontSize="small" />} iconPosition="start" label="Calendar Days" sx={{ minHeight: 40 }} />
          </Tabs>
        </Box>
      </Box>
      {subTab === 0 && <ShiftsPanel calendarId={calendar.id} canManage={canManage} />}
      {subTab === 1 && <CalendarDaysPanel calendarId={calendar.id} canManage={canManage} />}
    </Box>
  );
}

export default function ShiftCalendars() {
  const canManage = usePermission('fab_erp_calendars_manage');
  const { toast } = useToast();

  const [calendars, setCalendars] = useState<FabShiftCalendar[]>([]);
  const [selected, setSelected] = useState<FabShiftCalendar | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [calDlg, setCalDlg] = useState<{ open: boolean; item: FabShiftCalendar | null }>({ open: false, item: null });
  const [delDlg, setDelDlg] = useState<{ open: boolean; item: FabShiftCalendar | null }>({ open: false, item: null });

  const loadCalendars = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const res = await fabQuery<QueryResult<FabShiftCalendar>>('fabErpShiftCalendar', { orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 500 } });
      const list = res.data ?? [];
      setCalendars(list);
      setSelected((prev) => (prev ? list.find((c) => c.id === prev.id) ?? null : null));
    } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadCalendars(); }, [loadCalendars]);

  async function handleDelete() {
    if (!delDlg.item) return;
    try {
      await fabMutate('fabErpShiftCalendar', 'delete', { id: delDlg.item.id });
      if (selected?.id === delDlg.item.id) setSelected(null);
      setDelDlg({ open: false, item: null });
      loadCalendars();
      toast('Calendar deleted');
    } catch (e) {
      const ax = e as { response?: { data?: { error?: string } }; message?: string };
      setErr(ax.response?.data?.error ?? ax.message ?? 'Delete failed');
    }
  }

  function onCalendarSaved() { setCalDlg({ open: false, item: null }); loadCalendars(); toast('Calendar saved'); }

  const newBtn = canManage ? <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCalDlg({ open: true, item: null })}>New calendar</Button> : null;

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <PageHeader title="Shift Calendars" subtitle="Define shift calendars, their shifts, and per-date working / non-working days. Working minutes per shift feed the formula engine and capacity views." actions={newBtn} />

      {err && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr('')}>{err}</Alert>}

      {loading ? <ListSkeleton rows={4} /> : calendars.length === 0 ? (
        <EmptyState icon={<CalendarMonthRounded />} title="No shift calendars yet" action={newBtn ?? undefined} />
      ) : (
        <>
          <Surface e={1} sx={{ overflow: 'hidden', mb: 1 }}>
            <Table size="small">
              <TableHead><TableRow sx={{ background: 'var(--c-surface-2)' }}>
                <TableCell sx={th}>Name</TableCell><TableCell sx={th}>Code</TableCell>{canManage && <TableCell sx={{ ...th, width: 100 }} />}
              </TableRow></TableHead>
              <TableBody>
                {calendars.map((cal) => {
                  const isSelected = selected?.id === cal.id;
                  return (
                    <TableRow key={cal.id} hover selected={isSelected} onClick={() => setSelected(isSelected ? null : cal)} sx={{ cursor: 'pointer' }}>
                      <TableCell sx={{ ...td, fontWeight: isSelected ? 700 : 400 }}>{cal.name}</TableCell>
                      <TableCell sx={td}><Mono chip>{cal.code}</Mono></TableCell>
                      {canManage && (
                        <TableCell sx={td} onClick={(e) => e.stopPropagation()}>
                          <Tooltip title="Edit"><IconButton size="small" onClick={() => setCalDlg({ open: true, item: cal })}><EditRounded fontSize="small" /></IconButton></Tooltip>
                          <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setDelDlg({ open: true, item: cal })}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Surface>

          <Typography variant="caption" sx={{ color: 'var(--c-text-3)' }}>Click a row to view or edit its shifts and calendar days.</Typography>

          {selected && <CalendarDetail calendar={selected} canManage={canManage} />}
        </>
      )}

      <CalendarDialog open={calDlg.open} initial={calDlg.item} onClose={() => setCalDlg({ open: false, item: null })} onSaved={onCalendarSaved} />
      <DeleteConfirm open={delDlg.open} label={delDlg.item?.name ?? ''} onClose={() => setDelDlg({ open: false, item: null })} onConfirm={handleDelete} />
    </Box>
  );
}
