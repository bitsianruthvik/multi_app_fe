import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert, Autocomplete, Box, Button, Card, CardContent, Chip, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel,
  Grid, IconButton, MenuItem, Select, Stack, Switch, Tab, Tabs, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon         from '@mui/icons-material/Add';
import DeleteIcon      from '@mui/icons-material/Delete';
import DownloadIcon    from '@mui/icons-material/Download';
import EditIcon        from '@mui/icons-material/Edit';
import UploadFileIcon  from '@mui/icons-material/UploadFile';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon     from '@mui/icons-material/Warning';
import ErrorIcon       from '@mui/icons-material/Error';
import EventBusyIcon   from '@mui/icons-material/EventBusy';
import api, { API_HOST } from '@core/utils/axiosConfig';

// ── constants ─────────────────────────────────────────────────────────────────
const AREA_TYPES    = ['Cutting','Forming','Fit-Up','Welding','Finishing','Inspection','Blasting','Painting','Assembly','Dispatch','Other'];
const MACHINE_TYPES = ['Plasma Cutter','OxyFuel Cutter','Press Brake','Drill Press','SAW Welder','MIG Welder','Stud Welder','Shot Blaster','Paint Sprayer','Grinding Machine','Saw','Lathe','Other'];
const PROCESS_TYPES = ['Cutting','Profiling','Marking','Drilling','Forming','Bending','Fitting','Fit-Up','Tack Welding','Welding','MIG Welding','SAW Welding','Stud Welding','FCAW Welding','Grinding','Back Gouging','Inspection','NDE','Blasting','Surface Preparation','Painting','Assembly','Dispatch','Other'];
const DAYS_OF_WEEK  = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

// Common metric keys — users can type any value; these are offered as suggestions
const METRIC_KEY_OPTIONS = [
  'weld_length_mm','cut_length_mm','grind_length_mm','bend_length_mm',
  'drill_depth_mm','num_holes','num_studs','num_fittings',
  'paint_area_m2','blast_area_m2','surface_area_m2',
  'weight_kg','length_mm','quantity',
];

// ── types ─────────────────────────────────────────────────────────────────────
interface Calendar    { id: number; calendarCode: string; calendarName: string; description: string; active: number }
interface WorkArea    { id: number; workAreaCode: string; workAreaName: string; areaType: string; maxParallelJobs: number; calendarId: number | null; calendarCode: string; active: number; notes: string }
interface Machine     { id: number; machineCode: string; machineName: string; machineType: string; workAreaId: number | null; workAreaCode: string; calendarId: number | null; calendarCode: string; active: number; notes: string }
interface CalDay      { id: number; calendarId: number; calendarCode: string; dayOfWeek: string; isWorkingDay: number; startTime: string; endTime: string; workingHours: number }
interface CalException{ id: number; calendarId: number; calendarCode: string; exceptionDate: string; exceptionName: string; isWorkingDay: number; workingHours: number; notes: string }
interface WACap       { id: number; workAreaId: number; workAreaCode: string; processType: string; priority: number }
interface MachCap     { id: number; machineId: number; machineCode: string; processType: string; capacityHoursPerDay: number; priority: number }

interface ProcessTypeReg {
  id: number; processTypeName: string; description: string; metricKey: string | null;
  rateValue: number | null; rateUnit: string | null; active: number;
}

// draft types for dialogs
interface WaDraft  { workAreaCode: string; workAreaName: string; areaType: string; maxParallelJobs: number; calendarId: number | null; active: boolean; notes: string; caps: { processType: string; priority: number }[] }
interface MachDraft{ machineCode: string; machineName: string; machineType: string; workAreaId: number | null; calendarId: number | null; active: boolean; notes: string; caps: { processType: string; capacityHoursPerDay: number; priority: number }[] }
interface PtDraft  { processTypeName: string; description: string; metricKey: string; rateValue: number | ''; rateUnit: string; active: boolean }
interface DayDraft  { dayOfWeek: string; isWorkingDay: boolean; startTime: string; endTime: string; workingHours: number }
interface ExcDraft  { exceptionDate: string; exceptionName: string; isWorkingDay: boolean; workingHours: number; notes: string }
interface CalDraft  { calendarCode: string; calendarName: string; description: string; active: boolean; days: DayDraft[]; exceptions: ExcDraft[] }

const BLANK_PT  = (): PtDraft   => ({ processTypeName:'', description:'', metricKey:'', rateValue:'', rateUnit:'', active:true });
const BLANK_WA  = (): WaDraft   => ({ workAreaCode:'', workAreaName:'', areaType:'', maxParallelJobs:1, calendarId:null, active:true, notes:'', caps:[] });
const BLANK_MACH= (): MachDraft => ({ machineCode:'', machineName:'', machineType:'', workAreaId:null, calendarId:null, active:true, notes:'', caps:[] });
const BLANK_CAL = (): CalDraft  => ({
  calendarCode:'', calendarName:'', description:'', active:true,
  days: DAYS_OF_WEEK.map((d) => ({ dayOfWeek:d, isWorkingDay: !['Saturday','Sunday'].includes(d), startTime:'07:00', endTime:'16:00', workingHours:8 })),
  exceptions:[],
});

// parse tables for upload preview
interface Issue { sheet_name: string; row_number: number; severity: string; field_name: string; message: string }
interface ParseResult {
  batchId: number; status: string; errorCount: number; warningCount: number;
  preview: { calendars: any[]; calDays: any[]; calExceptions: any[]; workAreas: any[]; waCaps: any[]; machines: any[]; machineCaps: any[] };
  issues: Issue[];
}
function DataTable({ cols, rows }: { cols: string[]; rows: any[][] }) {
  if (rows.length === 0) return <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>No data</Typography>;
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Table size="small">
        <TableHead><TableRow>{cols.map((c) => <TableCell key={c} sx={{ fontWeight:700, whiteSpace:'nowrap' }}>{c}</TableCell>)}</TableRow></TableHead>
        <TableBody>{rows.map((row,i) => <TableRow key={i} hover>{row.map((cell,j) => <TableCell key={j} sx={{ whiteSpace:'nowrap' }}>{cell === null || cell === undefined ? '—' : String(cell)}</TableCell>)}</TableRow>)}</TableBody>
      </Table>
    </Box>
  );
}

// ── Process Type Registry Dialog ──────────────────────────────────────────────
function ProcessTypeDialog({ open, initial, onClose, onSaved }: {
  open: boolean; initial: ProcessTypeReg | null; onClose: () => void; onSaved: () => void;
}) {
  const [draft, setDraft]   = useState<PtDraft>(BLANK_PT());
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');
  const isNew = !initial;

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setDraft({
        processTypeName: initial.processTypeName,
        description:     initial.description ?? '',
        metricKey:       initial.metricKey ?? '',
        rateValue:       initial.rateValue ?? '',
        rateUnit:        initial.rateUnit ?? '',
        active:          !!initial.active,
      });
    } else {
      setDraft(BLANK_PT());
    }
    setErr('');
  }, [open, initial]);

  const set = (k: keyof PtDraft, v: any) => setDraft((d) => ({ ...d, [k]: v }));

  async function save() {
    setSaving(true); setErr('');
    try {
      const payload = {
        process_type_name: draft.processTypeName,
        description:       draft.description || null,
        metric_key:        draft.metricKey   || null,
        rate_value:        draft.rateValue === '' ? null : Number(draft.rateValue),
        rate_unit:         draft.rateUnit   || null,
        active:            draft.active ? 1 : 0,
      };
      if (isNew) {
        await api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation: 'insert', resource: 'fab_process_type_registry', data: payload,
        });
      } else {
        await api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation: 'update', resource: 'fab_process_type_registry',
          data: { id: initial!.id, ...payload },
        });
      }
      onSaved();
    } catch (e: any) {
      setErr(e.response?.data?.error ?? e.message);
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isNew ? 'New Process Type' : `Edit — ${initial?.processTypeName}`}</DialogTitle>
      <DialogContent dividers sx={{ display:'flex', flexDirection:'column', gap:2, pt:2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <Grid container spacing={2}>
          <Grid size={{ xs:12, sm:7 }}>
            <Autocomplete freeSolo options={PROCESS_TYPES} value={draft.processTypeName}
              onInputChange={(_, v) => set('processTypeName', v)}
              renderInput={(p) => <TextField {...p} label="Process Type Name" size="small" required />} />
          </Grid>
          <Grid size={{ xs:12, sm:5 }} sx={{ display:'flex', alignItems:'center' }}>
            <FormControlLabel control={<Switch checked={draft.active} onChange={(e) => set('active', e.target.checked)} />} label="Active" />
          </Grid>
          <Grid size={{ xs:12 }}>
            <TextField label="Description" value={draft.description} onChange={(e) => set('description', e.target.value)} size="small" fullWidth />
          </Grid>
        </Grid>

        <Divider />
        <Typography variant="subtitle2">Duration Metric</Typography>
        <Typography variant="caption" color="text.secondary">
          When a process step uses metric-based time, duration = node metric value × rate.
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs:12, sm:6 }}>
            <Autocomplete freeSolo options={METRIC_KEY_OPTIONS} value={draft.metricKey}
              onInputChange={(_, v) => set('metricKey', v)}
              renderInput={(p) => <TextField {...p} label="Metric Key" size="small"
                helperText="e.g. weld_length_mm, num_holes" />} />
          </Grid>
          <Grid size={{ xs:12, sm:3 }}>
            <TextField label="Rate (hr/unit)" type="number" value={draft.rateValue}
              onChange={(e) => set('rateValue', e.target.value)}
              size="small" fullWidth inputProps={{ min:0, step:0.0001 }}
              helperText="Hours per 1 unit of metric" />
          </Grid>
          <Grid size={{ xs:12, sm:3 }}>
            <TextField label="Rate Unit" value={draft.rateUnit}
              onChange={(e) => set('rateUnit', e.target.value)}
              size="small" fullWidth helperText="e.g. hr/mm, hr/kg" />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving || !draft.processTypeName}>
          {saving ? <CircularProgress size={16} /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Work Area Dialog ──────────────────────────────────────────────────────────
function WorkAreaDialog({ open, initial, calendars, onClose, onSaved, company }: {
  open: boolean; initial: WorkArea | null; calendars: Calendar[];
  onClose: () => void; onSaved: () => void; company: string;
}) {
  const [draft, setDraft]   = useState<WaDraft>(BLANK_WA());
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');
  const isNew = !initial;

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setDraft({ workAreaCode: initial.workAreaCode, workAreaName: initial.workAreaName, areaType: initial.areaType ?? '', maxParallelJobs: initial.maxParallelJobs ?? 1, calendarId: initial.calendarId ?? null, active: !!initial.active, notes: initial.notes ?? '', caps: [] });
    } else {
      setDraft(BLANK_WA());
    }
    setErr('');
  }, [open, initial]);

  // Load existing caps when editing
  useEffect(() => {
    if (!open || !initial) return;
    api.post(`${API_HOST}/api/query/v1/base_resource`, {
      operation:'query', resource:'fab_work_area_capabilities',
      fields:['id','workAreaId','processType','priority'],
      filters:{ workAreaId: initial.id }, pagination:{ limit:200 },
    }).then((r) => {
      const caps = (r.data?.data ?? []).map((c: any) => ({ processType: c.processType, priority: c.priority ?? 1 }));
      setDraft((d) => ({ ...d, caps }));
    }).catch(() => {});
  }, [open, initial]);

  const set = (k: keyof WaDraft, v: any) => setDraft((d) => ({ ...d, [k]: v }));

  async function save() {
    setSaving(true); setErr('');
    try {
      let waId = initial?.id;
      if (isNew) {
        const res = await api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation:'insert', resource:'fab_work_areas',
          data:{ work_area_code: draft.workAreaCode, work_area_name: draft.workAreaName, area_type: draft.areaType, max_parallel_jobs: draft.maxParallelJobs, calendar_id: draft.calendarId, active: draft.active ? 1 : 0, notes: draft.notes },
        });
        waId = res.data?.data?.insertId ?? res.data?.insertId;
      } else {
        await api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation:'update', resource:'fab_work_areas',
          data:{ id: initial!.id, work_area_code: draft.workAreaCode, work_area_name: draft.workAreaName, area_type: draft.areaType, max_parallel_jobs: draft.maxParallelJobs, calendar_id: draft.calendarId, active: draft.active ? 1 : 0, notes: draft.notes },
        });
      }
      await api.post(`${API_HOST}/api/${company}/fab_flow/capacity/work-areas/${waId}/sync-caps`, { caps: draft.caps });
      onSaved();
    } catch (e: any) {
      setErr(e.response?.data?.error ?? e.message);
    } finally { setSaving(false); }
  }

  const addCap = () => setDraft((d) => ({ ...d, caps: [...d.caps, { processType: PROCESS_TYPES[0], priority: 1 }] }));
  const removeCap = (i: number) => setDraft((d) => ({ ...d, caps: d.caps.filter((_, idx) => idx !== i) }));
  const setCap = (i: number, k: string, v: any) => setDraft((d) => ({ ...d, caps: d.caps.map((c, idx) => idx === i ? { ...c, [k]: v } : c) }));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isNew ? 'New Work Area' : `Edit — ${initial?.workAreaCode}`}</DialogTitle>
      <DialogContent dividers sx={{ display:'flex', flexDirection:'column', gap:2, pt:2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <Grid container spacing={2}>
          <Grid size={{ xs:12, sm:6 }}><TextField label="Code" value={draft.workAreaCode} onChange={(e) => set('workAreaCode', e.target.value)} size="small" fullWidth required /></Grid>
          <Grid size={{ xs:12, sm:6 }}><TextField label="Name" value={draft.workAreaName} onChange={(e) => set('workAreaName', e.target.value)} size="small" fullWidth required /></Grid>
          <Grid size={{ xs:12, sm:6 }}>
            <TextField select label="Area Type" value={draft.areaType} onChange={(e) => set('areaType', e.target.value)} size="small" fullWidth>
              {AREA_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs:12, sm:6 }}><TextField label="Max Parallel Jobs" type="number" value={draft.maxParallelJobs} onChange={(e) => set('maxParallelJobs', Number(e.target.value))} size="small" fullWidth inputProps={{ min:1 }} /></Grid>
          <Grid size={{ xs:12, sm:6 }}>
            <TextField select label="Calendar" value={draft.calendarId ?? ''} onChange={(e) => set('calendarId', e.target.value ? Number(e.target.value) : null)} size="small" fullWidth>
              <MenuItem value="">None</MenuItem>
              {calendars.map((c) => <MenuItem key={c.id} value={c.id}>{c.calendarCode} — {c.calendarName}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs:12, sm:6 }} sx={{ display:'flex', alignItems:'center' }}>
            <FormControlLabel control={<Switch checked={draft.active} onChange={(e) => set('active', e.target.checked)} />} label="Active" />
          </Grid>
          <Grid size={{ xs:12 }}><TextField label="Notes" value={draft.notes} onChange={(e) => set('notes', e.target.value)} size="small" fullWidth multiline rows={2} /></Grid>
        </Grid>

        <Divider />
        <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <Typography variant="subtitle2">Process Capabilities</Typography>
          <Button size="small" startIcon={<AddIcon />} onClick={addCap}>Add</Button>
        </Box>
        {draft.caps.map((cap, i) => (
          <Box key={i} sx={{ display:'flex', gap:1, alignItems:'center' }}>
            <TextField select label="Process Type" value={cap.processType} onChange={(e) => setCap(i, 'processType', e.target.value)} size="small" sx={{ flex:1 }}>
              {PROCESS_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
            </TextField>
            <TextField label="Priority" type="number" value={cap.priority} onChange={(e) => setCap(i, 'priority', Number(e.target.value))} size="small" sx={{ width:90 }} inputProps={{ min:1 }} />
            <IconButton size="small" onClick={() => removeCap(i)}><DeleteIcon fontSize="small" /></IconButton>
          </Box>
        ))}
        {draft.caps.length === 0 && <Typography variant="caption" color="text.secondary">No capabilities yet.</Typography>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving || !draft.workAreaCode || !draft.workAreaName}>
          {saving ? <CircularProgress size={16} /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Machine Dialog ────────────────────────────────────────────────────────────
function MachineDialog({ open, initial, calendars, workAreas, onClose, onSaved, company }: {
  open: boolean; initial: Machine | null; calendars: Calendar[]; workAreas: WorkArea[];
  onClose: () => void; onSaved: () => void; company: string;
}) {
  const [draft, setDraft]   = useState<MachDraft>(BLANK_MACH());
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');
  const isNew = !initial;

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setDraft({ machineCode: initial.machineCode, machineName: initial.machineName, machineType: initial.machineType ?? '', workAreaId: initial.workAreaId ?? null, calendarId: initial.calendarId ?? null, active: !!initial.active, notes: initial.notes ?? '', caps: [] });
    } else {
      setDraft(BLANK_MACH());
    }
    setErr('');
  }, [open, initial]);

  useEffect(() => {
    if (!open || !initial) return;
    api.post(`${API_HOST}/api/query/v1/base_resource`, {
      operation:'query', resource:'fab_machine_capabilities',
      fields:['id','machineId','processType','capacityHoursPerDay','priority'],
      filters:{ machineId: initial.id }, pagination:{ limit:200 },
    }).then((r) => {
      const caps = (r.data?.data ?? []).map((c: any) => ({ processType: c.processType, capacityHoursPerDay: c.capacityHoursPerDay ?? 8, priority: c.priority ?? 1 }));
      setDraft((d) => ({ ...d, caps }));
    }).catch(() => {});
  }, [open, initial]);

  const set = (k: keyof MachDraft, v: any) => setDraft((d) => ({ ...d, [k]: v }));

  async function save() {
    setSaving(true); setErr('');
    try {
      let machineId = initial?.id;
      if (isNew) {
        const res = await api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation:'insert', resource:'fab_machines',
          data:{ machine_code: draft.machineCode, machine_name: draft.machineName, machine_type: draft.machineType, work_area_id: draft.workAreaId, calendar_id: draft.calendarId, active: draft.active ? 1 : 0, notes: draft.notes },
        });
        machineId = res.data?.data?.insertId ?? res.data?.insertId;
      } else {
        await api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation:'update', resource:'fab_machines',
          data:{ id: initial!.id, machine_code: draft.machineCode, machine_name: draft.machineName, machine_type: draft.machineType, work_area_id: draft.workAreaId, calendar_id: draft.calendarId, active: draft.active ? 1 : 0, notes: draft.notes },
        });
      }
      await api.post(`${API_HOST}/api/${company}/fab_flow/capacity/machines/${machineId}/sync-caps`, { caps: draft.caps });
      onSaved();
    } catch (e: any) {
      setErr(e.response?.data?.error ?? e.message);
    } finally { setSaving(false); }
  }

  const addCap = () => setDraft((d) => ({ ...d, caps: [...d.caps, { processType: PROCESS_TYPES[0], capacityHoursPerDay: 8, priority: 1 }] }));
  const removeCap = (i: number) => setDraft((d) => ({ ...d, caps: d.caps.filter((_, idx) => idx !== i) }));
  const setCap = (i: number, k: string, v: any) => setDraft((d) => ({ ...d, caps: d.caps.map((c, idx) => idx === i ? { ...c, [k]: v } : c) }));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isNew ? 'New Machine' : `Edit — ${initial?.machineCode}`}</DialogTitle>
      <DialogContent dividers sx={{ display:'flex', flexDirection:'column', gap:2, pt:2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <Grid container spacing={2}>
          <Grid size={{ xs:12, sm:6 }}><TextField label="Code" value={draft.machineCode} onChange={(e) => set('machineCode', e.target.value)} size="small" fullWidth required /></Grid>
          <Grid size={{ xs:12, sm:6 }}><TextField label="Name" value={draft.machineName} onChange={(e) => set('machineName', e.target.value)} size="small" fullWidth required /></Grid>
          <Grid size={{ xs:12, sm:6 }}>
            <Autocomplete freeSolo options={MACHINE_TYPES} value={draft.machineType} onInputChange={(_, v) => set('machineType', v)}
              renderInput={(p) => <TextField {...p} label="Machine Type" size="small" />} />
          </Grid>
          <Grid size={{ xs:12, sm:6 }}>
            <TextField select label="Work Area" value={draft.workAreaId ?? ''} onChange={(e) => set('workAreaId', e.target.value ? Number(e.target.value) : null)} size="small" fullWidth>
              <MenuItem value="">None</MenuItem>
              {workAreas.map((w) => <MenuItem key={w.id} value={w.id}>{w.workAreaCode} — {w.workAreaName}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs:12, sm:6 }}>
            <TextField select label="Calendar" value={draft.calendarId ?? ''} onChange={(e) => set('calendarId', e.target.value ? Number(e.target.value) : null)} size="small" fullWidth>
              <MenuItem value="">None</MenuItem>
              {calendars.map((c) => <MenuItem key={c.id} value={c.id}>{c.calendarCode} — {c.calendarName}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs:12, sm:6 }} sx={{ display:'flex', alignItems:'center' }}>
            <FormControlLabel control={<Switch checked={draft.active} onChange={(e) => set('active', e.target.checked)} />} label="Active" />
          </Grid>
          <Grid size={{ xs:12 }}><TextField label="Notes" value={draft.notes} onChange={(e) => set('notes', e.target.value)} size="small" fullWidth multiline rows={2} /></Grid>
        </Grid>

        <Divider />
        <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <Typography variant="subtitle2">Process Capabilities</Typography>
          <Button size="small" startIcon={<AddIcon />} onClick={addCap}>Add</Button>
        </Box>
        {draft.caps.map((cap, i) => (
          <Box key={i} sx={{ display:'flex', gap:1, alignItems:'center' }}>
            <TextField select label="Process Type" value={cap.processType} onChange={(e) => setCap(i, 'processType', e.target.value)} size="small" sx={{ flex:1 }}>
              {PROCESS_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
            </TextField>
            <TextField label="h/day" type="number" value={cap.capacityHoursPerDay} onChange={(e) => setCap(i, 'capacityHoursPerDay', Number(e.target.value))} size="small" sx={{ width:80 }} inputProps={{ min:0, max:24, step:0.5 }} />
            <TextField label="Pri" type="number" value={cap.priority} onChange={(e) => setCap(i, 'priority', Number(e.target.value))} size="small" sx={{ width:70 }} inputProps={{ min:1 }} />
            <IconButton size="small" onClick={() => removeCap(i)}><DeleteIcon fontSize="small" /></IconButton>
          </Box>
        ))}
        {draft.caps.length === 0 && <Typography variant="caption" color="text.secondary">No capabilities yet.</Typography>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving || !draft.machineCode || !draft.machineName}>
          {saving ? <CircularProgress size={16} /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Calendar Dialog ───────────────────────────────────────────────────────────
function CalendarDialog({ open, initial, onClose, onSaved, company }: {
  open: boolean; initial: Calendar | null; onClose: () => void; onSaved: () => void; company: string;
}) {
  const [draft, setDraft]   = useState<CalDraft>(BLANK_CAL());
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');
  const [newExc, setNewExc] = useState<ExcDraft>({ exceptionDate:'', exceptionName:'', isWorkingDay:false, workingHours:0, notes:'' });
  const isNew = !initial;

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setDraft({ calendarCode: initial.calendarCode, calendarName: initial.calendarName, description: initial.description ?? '', active: !!initial.active, days: BLANK_CAL().days, exceptions: [] });
    } else {
      setDraft(BLANK_CAL());
    }
    setErr('');
    setNewExc({ exceptionDate:'', exceptionName:'', isWorkingDay:false, workingHours:0, notes:'' });
  }, [open, initial]);

  // Load working days and exceptions
  useEffect(() => {
    if (!open || !initial) return;
    Promise.all([
      api.post(`${API_HOST}/api/query/v1/base_resource`, {
        operation:'query', resource:'fab_work_calendar_days',
        fields:['id','calendarId','dayOfWeek','isWorkingDay','startTime','endTime','workingHours'],
        filters:{ calendarId: initial.id }, pagination:{ limit:20 },
      }),
      api.post(`${API_HOST}/api/query/v1/base_resource`, {
        operation:'query', resource:'fab_work_calendar_exceptions',
        fields:['id','calendarId','exceptionDate','exceptionName','isWorkingDay','workingHours','notes'],
        filters:{ calendarId: initial.id }, orderBy:[{ field:'exceptionDate', direction:'asc' }], pagination:{ limit:200 },
      }),
    ]).then(([daysRes, excRes]) => {
      const loadedDays: any[] = daysRes.data?.data ?? [];
      const mergedDays: DayDraft[] = DAYS_OF_WEEK.map((dow) => {
        const existing = loadedDays.find((d: any) => d.dayOfWeek === dow);
        return existing
          ? { dayOfWeek: dow, isWorkingDay: !!existing.isWorkingDay, startTime: existing.startTime ?? '07:00', endTime: existing.endTime ?? '16:00', workingHours: existing.workingHours ?? 0 }
          : { dayOfWeek: dow, isWorkingDay: !['Saturday','Sunday'].includes(dow), startTime:'07:00', endTime:'16:00', workingHours:8 };
      });
      const excs: ExcDraft[] = (excRes.data?.data ?? []).map((e: any) => ({
        exceptionDate: e.exceptionDate?.slice(0, 10) ?? '', exceptionName: e.exceptionName ?? '',
        isWorkingDay: !!e.isWorkingDay, workingHours: e.workingHours ?? 0, notes: e.notes ?? '',
      }));
      setDraft((d) => ({ ...d, days: mergedDays, exceptions: excs }));
    }).catch(() => {});
  }, [open, initial]);

  const set = (k: keyof CalDraft, v: any) => setDraft((d) => ({ ...d, [k]: v }));
  const setDay = (i: number, k: keyof DayDraft, v: any) => setDraft((d) => ({ ...d, days: d.days.map((day, idx) => idx === i ? { ...day, [k]: v } : day) }));

  function addException() {
    if (!newExc.exceptionDate) return;
    setDraft((d) => ({ ...d, exceptions: [...d.exceptions, { ...newExc }] }));
    setNewExc({ exceptionDate:'', exceptionName:'', isWorkingDay:false, workingHours:0, notes:'' });
  }
  const removeExc = (i: number) => setDraft((d) => ({ ...d, exceptions: d.exceptions.filter((_, idx) => idx !== i) }));

  async function save() {
    setSaving(true); setErr('');
    try {
      let calendarId = initial?.id;
      if (isNew) {
        const res = await api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation:'insert', resource:'fab_work_calendars',
          data:{ calendar_code: draft.calendarCode, calendar_name: draft.calendarName, description: draft.description, active: draft.active ? 1 : 0 },
        });
        calendarId = res.data?.data?.insertId ?? res.data?.insertId;
      } else {
        await api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation:'update', resource:'fab_work_calendars',
          data:{ id: initial!.id, calendar_code: draft.calendarCode, calendar_name: draft.calendarName, description: draft.description, active: draft.active ? 1 : 0 },
        });
      }
      await api.post(`${API_HOST}/api/${company}/fab_flow/capacity/calendars/${calendarId}/sync-sub`, {
        days: draft.days.map((d) => ({ dayOfWeek: d.dayOfWeek, isWorkingDay: d.isWorkingDay, startTime: d.startTime, endTime: d.endTime, workingHours: d.workingHours })),
        exceptions: draft.exceptions,
      });
      onSaved();
    } catch (e: any) {
      setErr(e.response?.data?.error ?? e.message);
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{isNew ? 'New Calendar' : `Edit — ${initial?.calendarCode}`}</DialogTitle>
      <DialogContent dividers sx={{ display:'flex', flexDirection:'column', gap:2, pt:2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <Grid container spacing={2}>
          <Grid size={{ xs:12, sm:4 }}><TextField label="Code" value={draft.calendarCode} onChange={(e) => set('calendarCode', e.target.value)} size="small" fullWidth required /></Grid>
          <Grid size={{ xs:12, sm:5 }}><TextField label="Name" value={draft.calendarName} onChange={(e) => set('calendarName', e.target.value)} size="small" fullWidth required /></Grid>
          <Grid size={{ xs:12, sm:3 }} sx={{ display:'flex', alignItems:'center' }}>
            <FormControlLabel control={<Switch checked={draft.active} onChange={(e) => set('active', e.target.checked)} />} label="Active" />
          </Grid>
          <Grid size={{ xs:12 }}><TextField label="Description" value={draft.description} onChange={(e) => set('description', e.target.value)} size="small" fullWidth /></Grid>
        </Grid>

        <Divider />
        <Typography variant="subtitle2">Working Days</Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight:700 }}>Day</TableCell>
              <TableCell sx={{ fontWeight:700 }}>Working?</TableCell>
              <TableCell sx={{ fontWeight:700 }}>Start</TableCell>
              <TableCell sx={{ fontWeight:700 }}>End</TableCell>
              <TableCell sx={{ fontWeight:700 }}>Hours</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {draft.days.map((day, i) => (
              <TableRow key={day.dayOfWeek} sx={{ bgcolor: day.isWorkingDay ? undefined : 'action.hover' }}>
                <TableCell sx={{ fontWeight: day.isWorkingDay ? 600 : undefined, color: day.isWorkingDay ? undefined : 'text.disabled' }}>{day.dayOfWeek}</TableCell>
                <TableCell><Switch size="small" checked={day.isWorkingDay} onChange={(e) => setDay(i, 'isWorkingDay', e.target.checked)} /></TableCell>
                <TableCell><TextField size="small" type="time" value={day.startTime} onChange={(e) => setDay(i, 'startTime', e.target.value)} disabled={!day.isWorkingDay} sx={{ width:120 }} /></TableCell>
                <TableCell><TextField size="small" type="time" value={day.endTime} onChange={(e) => setDay(i, 'endTime', e.target.value)} disabled={!day.isWorkingDay} sx={{ width:120 }} /></TableCell>
                <TableCell><TextField size="small" type="number" value={day.workingHours} onChange={(e) => setDay(i, 'workingHours', Number(e.target.value))} disabled={!day.isWorkingDay} sx={{ width:80 }} inputProps={{ min:0, max:24, step:0.5 }} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Divider />
        <Typography variant="subtitle2">Holidays & Exceptions ({draft.exceptions.length})</Typography>
        {/* Existing exceptions */}
        {draft.exceptions.length > 0 && (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight:700 }}>Date</TableCell>
                <TableCell sx={{ fontWeight:700 }}>Name</TableCell>
                <TableCell sx={{ fontWeight:700 }}>Type</TableCell>
                <TableCell sx={{ fontWeight:700 }}>Hours</TableCell>
                <TableCell sx={{ fontWeight:700 }}>Notes</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {draft.exceptions.map((e, i) => (
                <TableRow key={i} hover>
                  <TableCell>{e.exceptionDate}</TableCell>
                  <TableCell>{e.exceptionName || '—'}</TableCell>
                  <TableCell><Chip size="small" label={e.isWorkingDay ? 'Special Working' : 'Holiday'} color={e.isWorkingDay ? 'info' : 'warning'} /></TableCell>
                  <TableCell>{e.workingHours}h</TableCell>
                  <TableCell>{e.notes || '—'}</TableCell>
                  <TableCell><IconButton size="small" onClick={() => removeExc(i)}><DeleteIcon fontSize="small" /></IconButton></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {/* Add new exception */}
        <Box sx={{ display:'flex', gap:1, alignItems:'center', flexWrap:'wrap' }}>
          <TextField label="Date" type="date" value={newExc.exceptionDate} onChange={(e) => setNewExc((x) => ({ ...x, exceptionDate: e.target.value }))} size="small" sx={{ width:160 }} InputLabelProps={{ shrink:true }} />
          <TextField label="Name (e.g. Republic Day)" value={newExc.exceptionName} onChange={(e) => setNewExc((x) => ({ ...x, exceptionName: e.target.value }))} size="small" sx={{ flex:1, minWidth:160 }} />
          <TextField select label="Type" value={newExc.isWorkingDay ? 'working' : 'holiday'} onChange={(e) => setNewExc((x) => ({ ...x, isWorkingDay: e.target.value === 'working' }))} size="small" sx={{ width:150 }}>
            <MenuItem value="holiday">Holiday (Off)</MenuItem>
            <MenuItem value="working">Special Working</MenuItem>
          </TextField>
          <TextField label="Hours" type="number" value={newExc.workingHours} onChange={(e) => setNewExc((x) => ({ ...x, workingHours: Number(e.target.value) }))} size="small" sx={{ width:80 }} inputProps={{ min:0, max:24, step:0.5 }} />
          <Button variant="outlined" size="small" startIcon={<AddIcon />} onClick={addException} disabled={!newExc.exceptionDate}>Add</Button>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving || !draft.calendarCode || !draft.calendarName}>
          {saving ? <CircularProgress size={16} /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── main component ────────────────────────────────────────────────────────────
export default function CapacityMaster() {
  const { company } = useParams<{ company: string }>();

  const [tab, setTab]         = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [exporting, setExp]   = useState(false);

  const [workAreas,     setWorkAreas]     = useState<WorkArea[]>([]);
  const [machines,      setMachines]      = useState<Machine[]>([]);
  const [calendars,     setCalendars]     = useState<Calendar[]>([]);
  const [processTypes,  setProcessTypes]  = useState<ProcessTypeReg[]>([]);
  const [waCaps,        setWaCaps]        = useState<WACap[]>([]);
  const [machCaps,      setMachCaps]      = useState<MachCap[]>([]);
  const [calDays,       setCalDays]       = useState<CalDay[]>([]);
  const [calExceptions, setCalExceptions] = useState<CalException[]>([]);

  // dialog state
  const [waDialog,   setWaDialog]   = useState<{ open: boolean; item: WorkArea | null }>({ open:false, item:null });
  const [machDialog, setMachDialog] = useState<{ open: boolean; item: Machine | null }>({ open:false, item:null });
  const [calDialog,  setCalDialog]  = useState<{ open: boolean; item: Calendar | null }>({ open:false, item:null });
  const [ptDialog,   setPtDialog]   = useState<{ open: boolean; item: ProcessTypeReg | null }>({ open:false, item:null });

  // upload
  const [uploadDialog, setUploadDialog] = useState(false);
  const [uploadTab,    setUploadTab]    = useState(0);
  const [uploading,    setUploading]    = useState(false);
  const [parseResult,  setParseResult]  = useState<ParseResult | null>(null);
  const [importing,    setImporting]    = useState(false);
  const [importDone,   setImportDone]   = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [waRes, machRes, calRes, ptRes, wacRes, mcRes, cdRes, ceRes] = await Promise.all([
        api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation:'query', resource:'fab_work_areas',
          fields:['id','workAreaCode','workAreaName','areaType','maxParallelJobs','calendarId','calendarCode','active','notes'],
          orderBy:[{ field:'workAreaCode', direction:'asc' }], pagination:{ limit:500 },
        }),
        api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation:'query', resource:'fab_machines',
          fields:['id','machineCode','machineName','machineType','workAreaId','workAreaCode','calendarId','calendarCode','active','notes'],
          orderBy:[{ field:'machineCode', direction:'asc' }], pagination:{ limit:500 },
        }),
        api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation:'query', resource:'fab_work_calendars',
          fields:['id','calendarCode','calendarName','description','active'],
          orderBy:[{ field:'calendarCode', direction:'asc' }], pagination:{ limit:200 },
        }),
        api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation:'query', resource:'fab_process_type_registry',
          fields:['id','processTypeName','description','metricKey','rateValue','rateUnit','active'],
          orderBy:[{ field:'processTypeName', direction:'asc' }], pagination:{ limit:500 },
        }),
        api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation:'query', resource:'fab_work_area_capabilities',
          fields:['id','workAreaId','workAreaCode','processType','priority'],
          orderBy:[{ field:'workAreaCode', direction:'asc' }], pagination:{ limit:2000 },
        }),
        api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation:'query', resource:'fab_machine_capabilities',
          fields:['id','machineId','machineCode','processType','capacityHoursPerDay','priority'],
          orderBy:[{ field:'machineCode', direction:'asc' }], pagination:{ limit:2000 },
        }),
        api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation:'query', resource:'fab_work_calendar_days',
          fields:['id','calendarId','calendarCode','dayOfWeek','isWorkingDay','startTime','endTime','workingHours'],
          orderBy:[{ field:'calendarId', direction:'asc' }], pagination:{ limit:2000 },
        }),
        api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation:'query', resource:'fab_work_calendar_exceptions',
          fields:['id','calendarId','calendarCode','exceptionDate','exceptionName','isWorkingDay','workingHours','notes'],
          orderBy:[{ field:'exceptionDate', direction:'asc' }], pagination:{ limit:2000 },
        }),
      ]);
      setWorkAreas(waRes.data?.data    ?? []);
      setMachines(machRes.data?.data   ?? []);
      setCalendars(calRes.data?.data   ?? []);
      setProcessTypes(ptRes.data?.data ?? []);
      setWaCaps(wacRes.data?.data      ?? []);
      setMachCaps(mcRes.data?.data     ?? []);
      setCalDays(cdRes.data?.data      ?? []);
      setCalExceptions(ceRes.data?.data ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function downloadExport() {
    setExp(true);
    try {
      const res = await api.get(`${API_HOST}/api/${company}/fab_flow/capacity/export`, { responseType:'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a   = document.createElement('a'); a.href = url; a.download = 'FabFlow_Capacity_Master.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch { setError('Export failed'); } finally { setExp(false); }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setUploading(true); setParseResult(null); setImportDone(false);
    try {
      const fd = new FormData(); fd.append('excel_file', f);
      const res = await api.post(`${API_HOST}/api/${company}/fab_flow/capacity/upload`, fd, { headers:{ 'Content-Type':'multipart/form-data' } });
      setParseResult(res.data.data); setUploadTab(0);
    } catch (e: any) { setError(e.response?.data?.error ?? e.message); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function handleImport() {
    if (!parseResult) return;
    setImporting(true);
    try {
      await api.post(`${API_HOST}/api/${company}/fab_flow/capacity/batches/${parseResult.batchId}/import`);
      setImportDone(true); setUploadDialog(false); setParseResult(null); fetchAll();
    } catch (e: any) { setError(e.response?.data?.error ?? e.message); }
    finally { setImporting(false); }
  }

  function onSaved() { fetchAll(); setWaDialog({ open:false, item:null }); setMachDialog({ open:false, item:null }); setCalDialog({ open:false, item:null }); setPtDialog({ open:false, item:null }); }

  const stats = [
    { label:'Work Areas',     value: workAreas.filter((w) => w.active).length,    color:'#1e3a5f' },
    { label:'Machines',       value: machines.filter((m) => m.active).length,     color:'#2e7d32' },
    { label:'Calendars',      value: calendars.filter((c) => c.active).length,    color:'#7b1fa2' },
    { label:'Process Types',  value: processTypes.filter((p) => p.active).length, color:'#c62828' },
    { label:'Capabilities',   value: waCaps.length + machCaps.length,             color:'#e65100' },
  ];

  // preview panels for upload dialog
  const pr = parseResult?.preview;
  const previewPanels = [
    { label:`Work Areas (${pr?.workAreas.length??0})`,       cols:['code','name','type','parallel','calendar','active'],           rows:(pr?.workAreas??[]).map((r:any)=>[r.work_area_code,r.work_area_name,r.area_type,r.max_parallel_jobs,r.calendar_code,r.active?'Yes':'No']) },
    { label:`WA Caps (${pr?.waCaps.length??0})`,             cols:['work_area','process_type','allowed','priority'],               rows:(pr?.waCaps??[]).map((r:any)=>[r.work_area_code,r.process_type,r.allowed?'Yes':'No',r.priority]) },
    { label:`Machines (${pr?.machines.length??0})`,          cols:['code','name','type','work_area','calendar','active'],          rows:(pr?.machines??[]).map((r:any)=>[r.machine_code,r.machine_name,r.machine_type,r.work_area_code,r.calendar_code,r.active?'Yes':'No']) },
    { label:`Mach Caps (${pr?.machineCaps.length??0})`,      cols:['machine','process_type','h/day','priority'],                  rows:(pr?.machineCaps??[]).map((r:any)=>[r.machine_code,r.process_type,r.capacity_hours_per_day,r.priority]) },
    { label:`Cal Days (${pr?.calDays.length??0})`,           cols:['calendar','day','working','start','end','hours'],             rows:(pr?.calDays??[]).map((r:any)=>[r.calendar_code,r.day_of_week,r.is_working_day?'Yes':'No',r.start_time,r.end_time,r.working_hours]) },
    { label:`Exceptions (${pr?.calExceptions.length??0})`,   cols:['calendar','date','name','type','hours'],                     rows:(pr?.calExceptions??[]).map((r:any)=>[r.calendar_code,r.exception_date,r.exception_name,r.is_working_day?'Working':'Holiday',r.working_hours]) },
    { label:`Issues (${parseResult?.issues.length??0})`,     cols:['sheet','row','severity','field','message'],                  rows:(parseResult?.issues??[]).map((i)=>[i.sheet_name,i.row_number,i.severity,i.field_name,i.message]) },
  ];

  return (
    <Box sx={{ p: 3, maxWidth: 1400, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display:'flex', alignItems:'center', justifyContent:'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Capacity Master</Typography>
          <Typography variant="body2" color="text.secondary">Work areas, machines, and calendars — company-wide</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={exporting ? <CircularProgress size={14}/> : <DownloadIcon />} onClick={downloadExport} disabled={exporting}>Download Excel</Button>
          <Button variant="contained" startIcon={<UploadFileIcon />} onClick={() => { setUploadDialog(true); setParseResult(null); setImportDone(false); }}>Upload Excel</Button>
        </Stack>
      </Box>

      {error && <Alert severity="error" sx={{ mb:2 }} onClose={() => setError('')}>{error}</Alert>}
      {importDone && <Alert severity="success" sx={{ mb:2 }}>Capacity master imported successfully.</Alert>}

      {/* Summary cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {stats.map((s) => (
          <Grid size={{ xs:6, sm:'auto' }} key={s.label} sx={{ flex:1, minWidth:120 }}>
            <Card sx={{ textAlign:'center', py:1.5, borderTop:`3px solid ${s.color}` }}>
              <Typography variant="h4" fontWeight={700} sx={{ color:s.color }}>{s.value}</Typography>
              <Typography variant="body2" color="text.secondary">{s.label}</Typography>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Tabs */}
      <Box sx={{ borderBottom:1, borderColor:'divider', mb:2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label="Work Areas" />
          <Tab label="Machines" />
          <Tab label="Calendars" />
          <Tab label="Process Types" />
        </Tabs>
      </Box>

      {loading ? (
        <Box sx={{ display:'flex', justifyContent:'center', mt:6 }}><CircularProgress /></Box>
      ) : (
        <>
          {/* ── Work Areas ──────────────────────────────────────────────── */}
          {tab === 0 && (
            <>
              <Box sx={{ display:'flex', justifyContent:'flex-end', mb:2 }}>
                <Button startIcon={<AddIcon />} variant="contained" onClick={() => setWaDialog({ open:true, item:null })}>New Work Area</Button>
              </Box>
              <Stack spacing={2}>
                {workAreas.length === 0 ? (
                  <Card><CardContent sx={{ textAlign:'center', py:4 }}><Typography color="text.secondary">No work areas defined.</Typography></CardContent></Card>
                ) : workAreas.map((wa) => {
                  const caps = waCaps.filter((c) => c.workAreaId === wa.id);
                  return (
                    <Card key={wa.id} variant="outlined" sx={{ opacity: wa.active ? 1 : 0.6 }}>
                      <CardContent sx={{ pb:'12px !important' }}>
                        <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                          <Box>
                            <Box sx={{ display:'flex', alignItems:'center', gap:1, mb:0.5 }}>
                              <Typography variant="subtitle1" fontWeight={700}>{wa.workAreaName}</Typography>
                              <Chip label={wa.workAreaCode} size="small" variant="outlined" />
                              {wa.areaType && <Chip label={wa.areaType} size="small" color="default" />}
                              {!wa.active && <Chip label="Inactive" size="small" />}
                            </Box>
                            <Typography variant="body2" color="text.secondary">
                              {[`Max ${wa.maxParallelJobs} parallel`, wa.calendarCode].filter(Boolean).join(' · ')}
                            </Typography>
                          </Box>
                          <Tooltip title="Edit"><IconButton size="small" onClick={() => setWaDialog({ open:true, item:wa })}><EditIcon fontSize="small" /></IconButton></Tooltip>
                        </Box>
                        {caps.length > 0 && (
                          <Box sx={{ mt:1, display:'flex', gap:0.5, flexWrap:'wrap' }}>
                            {caps.map((c) => <Chip key={c.processType} size="small" label={`${c.processType}${c.priority > 1 ? ` (p${c.priority})` : ''}`} color="primary" variant="outlined" />)}
                          </Box>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </Stack>
            </>
          )}

          {/* ── Machines ────────────────────────────────────────────────── */}
          {tab === 1 && (
            <>
              <Box sx={{ display:'flex', justifyContent:'flex-end', mb:2 }}>
                <Button startIcon={<AddIcon />} variant="contained" onClick={() => setMachDialog({ open:true, item:null })}>New Machine</Button>
              </Box>
              <Stack spacing={2}>
                {machines.length === 0 ? (
                  <Card><CardContent sx={{ textAlign:'center', py:4 }}><Typography color="text.secondary">No machines defined.</Typography></CardContent></Card>
                ) : machines.map((m) => {
                  const caps = machCaps.filter((c) => c.machineId === m.id);
                  return (
                    <Card key={m.id} variant="outlined" sx={{ opacity: m.active ? 1 : 0.6 }}>
                      <CardContent sx={{ pb:'12px !important' }}>
                        <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                          <Box sx={{ flex:1 }}>
                            <Box sx={{ display:'flex', alignItems:'center', gap:1, mb:0.5 }}>
                              <Typography variant="subtitle1" fontWeight={700}>{m.machineName}</Typography>
                              <Chip label={m.machineCode} size="small" variant="outlined" />
                              {m.machineType && <Chip label={m.machineType} size="small" color="default" />}
                              {!m.active && <Chip label="Inactive" size="small" />}
                            </Box>
                            <Typography variant="body2" color="text.secondary">
                              {[m.workAreaCode, m.calendarCode].filter(Boolean).join(' · ')}
                            </Typography>
                            {caps.length > 0 && (
                              <Box sx={{ mt:0.5, display:'flex', gap:0.5, flexWrap:'wrap' }}>
                                {caps.map((c) => <Chip key={c.processType} size="small" label={`${c.processType} · ${c.capacityHoursPerDay}h/day`} color="info" variant="outlined" />)}
                              </Box>
                            )}
                          </Box>
                          <Tooltip title="Edit"><IconButton size="small" onClick={() => setMachDialog({ open:true, item:m })}><EditIcon fontSize="small" /></IconButton></Tooltip>
                        </Box>
                      </CardContent>
                    </Card>
                  );
                })}
              </Stack>
            </>
          )}

          {/* ── Process Types ───────────────────────────────────────────── */}
          {tab === 3 && (
            <>
              <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'center', mb:2 }}>
                <Typography variant="body2" color="text.secondary">
                  Define generic process types with their default duration metric and rate. Process steps in plans can inherit these rates.
                </Typography>
                <Button startIcon={<AddIcon />} variant="contained" onClick={() => setPtDialog({ open:true, item:null })}>New Process Type</Button>
              </Box>
              <Stack spacing={1.5}>
                {processTypes.length === 0 ? (
                  <Card><CardContent sx={{ textAlign:'center', py:4 }}><Typography color="text.secondary">No process types defined.</Typography></CardContent></Card>
                ) : processTypes.map((pt) => (
                  <Card key={pt.id} variant="outlined" sx={{ opacity: pt.active ? 1 : 0.55 }}>
                    <CardContent sx={{ py:'12px !important' }}>
                      <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <Box sx={{ flex:1 }}>
                          <Box sx={{ display:'flex', alignItems:'center', gap:1, mb:0.5 }}>
                            <Typography variant="subtitle2" fontWeight={700}>{pt.processTypeName}</Typography>
                            {!pt.active && <Chip label="Inactive" size="small" />}
                            {pt.metricKey && (
                              <Chip size="small" label={pt.metricKey} color="primary" variant="outlined" />
                            )}
                            {pt.rateValue != null && (
                              <Chip size="small" label={`${pt.rateValue} ${pt.rateUnit ?? 'hr/unit'}`} color="success" variant="outlined" />
                            )}
                          </Box>
                          {pt.description && <Typography variant="caption" color="text.secondary">{pt.description}</Typography>}
                        </Box>
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => setPtDialog({ open:true, item:pt })}><EditIcon fontSize="small" /></IconButton>
                        </Tooltip>
                      </Box>
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            </>
          )}

          {/* ── Calendars ───────────────────────────────────────────────── */}
          {tab === 2 && (
            <>
              <Box sx={{ display:'flex', justifyContent:'flex-end', mb:2 }}>
                <Button startIcon={<AddIcon />} variant="contained" onClick={() => setCalDialog({ open:true, item:null })}>New Calendar</Button>
              </Box>
              <Stack spacing={2}>
                {calendars.length === 0 ? (
                  <Card><CardContent sx={{ textAlign:'center', py:4 }}><Typography color="text.secondary">No calendars defined.</Typography></CardContent></Card>
                ) : calendars.map((cal) => {
                  const days = calDays.filter((d) => d.calendarId === cal.id);
                  const excs = calExceptions.filter((e) => e.calendarId === cal.id);
                  const workingDays = days.filter((d) => d.isWorkingDay);
                  const holidays   = excs.filter((e) => !e.isWorkingDay);
                  const specialWD  = excs.filter((e) =>  e.isWorkingDay);
                  return (
                    <Card key={cal.id} variant="outlined" sx={{ opacity: cal.active ? 1 : 0.6 }}>
                      <CardContent>
                        <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                          <Box sx={{ flex:1 }}>
                            <Box sx={{ display:'flex', alignItems:'center', gap:1, mb:0.5 }}>
                              <Typography variant="subtitle1" fontWeight={700}>{cal.calendarName}</Typography>
                              <Chip label={cal.calendarCode} size="small" variant="outlined" />
                              {!cal.active && <Chip label="Inactive" size="small" />}
                            </Box>
                            {cal.description && <Typography variant="body2" color="text.secondary" sx={{ mb:1 }}>{cal.description}</Typography>}
                          </Box>
                          <Tooltip title="Edit"><IconButton size="small" onClick={() => setCalDialog({ open:true, item:cal })}><EditIcon fontSize="small" /></IconButton></Tooltip>
                        </Box>

                        {/* Working days row */}
                        {workingDays.length > 0 && (
                          <Box sx={{ mb:1.5 }}>
                            <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ display:'block', mb:0.5 }}>Working Days</Typography>
                            <Box sx={{ display:'flex', gap:0.5, flexWrap:'wrap' }}>
                              {days.map((d) => (
                                <Chip key={d.dayOfWeek} size="small"
                                  label={d.isWorkingDay ? `${d.dayOfWeek.slice(0,3)} ${d.startTime}–${d.endTime} (${d.workingHours}h)` : `${d.dayOfWeek.slice(0,3)} Off`}
                                  color={d.isWorkingDay ? 'success' : 'default'}
                                  variant={d.isWorkingDay ? 'filled' : 'outlined'}
                                />
                              ))}
                            </Box>
                          </Box>
                        )}

                        {/* Holidays */}
                        {holidays.length > 0 && (
                          <>
                            <Divider sx={{ mb:1 }} />
                            <Box sx={{ display:'flex', alignItems:'center', gap:1, mb:0.5 }}>
                              <EventBusyIcon sx={{ fontSize:14, color:'warning.main' }} />
                              <Typography variant="caption" fontWeight={600} color="warning.main">Holidays ({holidays.length})</Typography>
                            </Box>
                            <Box sx={{ display:'flex', gap:0.5, flexWrap:'wrap' }}>
                              {holidays.map((e, idx) => (
                                <Chip key={idx} size="small"
                                  label={`${new Date(e.exceptionDate).toLocaleDateString('en-GB', { day:'2-digit', month:'short' })} — ${e.exceptionName || 'Holiday'}`}
                                  color="warning" variant="outlined"
                                />
                              ))}
                            </Box>
                          </>
                        )}

                        {/* Special working days */}
                        {specialWD.length > 0 && (
                          <>
                            <Divider sx={{ mb:1, mt:1 }} />
                            <Typography variant="caption" fontWeight={600} color="info.main">Special Working Days ({specialWD.length})</Typography>
                            <Box sx={{ display:'flex', gap:0.5, flexWrap:'wrap', mt:0.5 }}>
                              {specialWD.map((e, idx) => (
                                <Chip key={idx} size="small"
                                  label={`${new Date(e.exceptionDate).toLocaleDateString('en-GB', { day:'2-digit', month:'short' })} — ${e.exceptionName || 'Working'} (${e.workingHours}h)`}
                                  color="info" variant="outlined"
                                />
                              ))}
                            </Box>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </Stack>
            </>
          )}
        </>
      )}

      {/* ── Dialogs ───────────────────────────────────────────────────────── */}
      <ProcessTypeDialog open={ptDialog.open} initial={ptDialog.item}
        onClose={() => setPtDialog({ open:false, item:null })} onSaved={onSaved} />
      <WorkAreaDialog open={waDialog.open} initial={waDialog.item} calendars={calendars}
        onClose={() => setWaDialog({ open:false, item:null })} onSaved={onSaved} company={company!} />
      <MachineDialog open={machDialog.open} initial={machDialog.item} calendars={calendars} workAreas={workAreas}
        onClose={() => setMachDialog({ open:false, item:null })} onSaved={onSaved} company={company!} />
      <CalendarDialog open={calDialog.open} initial={calDialog.item}
        onClose={() => setCalDialog({ open:false, item:null })} onSaved={onSaved} company={company!} />

      {/* ── Upload dialog ─────────────────────────────────────────────────── */}
      <Dialog open={uploadDialog} onClose={() => setUploadDialog(false)} maxWidth="lg" fullWidth>
        <DialogTitle>Upload Capacity Excel</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ border:'2px dashed', borderColor:'divider', borderRadius:2, p:3, textAlign:'center', cursor:'pointer', mb:2, '&:hover':{ borderColor:'primary.main', bgcolor:'action.hover' } }}
            onClick={() => fileRef.current?.click()}>
            <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={handleFileChange} />
            {uploading ? <CircularProgress size={24} /> : (
              <>
                <UploadFileIcon sx={{ fontSize:36, color:'text.secondary' }} />
                <Typography variant="body2" color="text.secondary" sx={{ mt:1 }}>Click to select .xlsx capacity file · Download template first if needed</Typography>
              </>
            )}
          </Box>
          {parseResult && (
            <>
              <Box sx={{ display:'flex', gap:1, mb:2, flexWrap:'wrap', alignItems:'center' }}>
                <Chip icon={parseResult.status === 'Parsed' ? <CheckCircleIcon/> : <ErrorIcon/>} label={parseResult.status === 'Parsed' ? 'Ready to import' : 'Has errors'} color={parseResult.status === 'Parsed' ? 'success' : 'error'} />
                {parseResult.errorCount   > 0 && <Chip icon={<ErrorIcon/>}   label={`${parseResult.errorCount} errors`}   color="error"   size="small" />}
                {parseResult.warningCount > 0 && <Chip icon={<WarningIcon/>} label={`${parseResult.warningCount} warnings`} color="warning" size="small" />}
              </Box>
              <Box sx={{ borderBottom:1, borderColor:'divider', mb:1 }}>
                <Tabs value={uploadTab} onChange={(_, v) => setUploadTab(v)} variant="scrollable" scrollButtons="auto">
                  {previewPanels.map((p, i) => <Tab key={i} label={p.label} sx={{ fontSize:'0.75rem', minHeight:36 }} />)}
                </Tabs>
              </Box>
              {previewPanels.map((panel, i) => uploadTab === i && <DataTable key={i} cols={panel.cols} rows={panel.rows} />)}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUploadDialog(false)}>Close</Button>
          {parseResult?.status === 'Parsed' && (
            <Button variant="contained" onClick={handleImport} disabled={importing} startIcon={importing ? <CircularProgress size={14}/> : <CheckCircleIcon/>}>
              {importing ? 'Importing…' : 'Import to DB'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
