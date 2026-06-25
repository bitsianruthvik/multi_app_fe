import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Divider, FormControlLabel,
  MenuItem, Paper, Snackbar, Switch, TextField, Tooltip, Typography,
} from '@mui/material';
import PlayArrowIcon      from '@mui/icons-material/PlayArrow';
import CheckCircleIcon    from '@mui/icons-material/CheckCircle';
import ErrorIcon          from '@mui/icons-material/Error';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import ScheduleIcon       from '@mui/icons-material/Schedule';
import SaveIcon           from '@mui/icons-material/Save';

import { fabPost, fabGet, fabPut } from '../api/client';
import { usePermission }           from '@core/hooks/usePermission';

// ── Types ─────────────────────────────────────────────────────────────────────
interface MrpRun {
  id: number;
  triggered_by: 'manual' | 'cron';
  triggered_by_user_id: number | null;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'error';
  planned_orders_created: number;
  planned_orders_deleted: number;
  error_message: string | null;
}

interface MrpSettings {
  auto_run_enabled: number;
  run_hour: number;
  run_minute: number;
  last_auto_run_date: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function statusChip(status: MrpRun['status']) {
  if (status === 'success') return <Chip icon={<CheckCircleIcon />}    label="Success" color="success" size="small" />;
  if (status === 'error')   return <Chip icon={<ErrorIcon />}          label="Error"   color="error"   size="small" />;
  return                           <Chip icon={<HourglassEmptyIcon />} label="Running" color="warning" size="small" />;
}

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function duration(start: string, end: string | null) {
  if (!end) return '—';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function pad(n: number) { return String(n).padStart(2, '0'); }

const HOURS   = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

// ── Component ─────────────────────────────────────────────────────────────────
export default function MrpRun() {
  const canManage = usePermission('fab_erp_projects_manage');

  const [runs,     setRuns]     = useState<MrpRun[]>([]);
  const [settings, setSettings] = useState<MrpSettings | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [running,  setRunning]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [toast,    setToast]    = useState('');

  // Local settings draft
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [runHour,     setRunHour]     = useState(23);
  const [runMinute,   setRunMinute]   = useState(0);

  const fetchAll = useCallback(async () => {
    try {
      const [runsRes, settingsRes] = await Promise.all([
        fabGet<{ ok: boolean; data: MrpRun[] }>('mrp/runs'),
        fabGet<{ ok: boolean; data: MrpSettings }>('mrp/settings'),
      ]);
      setRuns(runsRes.data ?? []);
      const s = settingsRes.data;
      if (s) {
        setSettings(s);
        setAutoEnabled(s.auto_run_enabled === 1);
        setRunHour(s.run_hour);
        setRunMinute(s.run_minute);
      }
    } catch (e: any) {
      setError(e.response?.data?.message ?? e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function triggerRun() {
    setRunning(true); setError('');
    try {
      const res = await fabPost<{ ok: boolean; runId: number; created: number; deleted: number }>('mrp/run');
      setToast(`MRP complete — ${res.created} planned orders created, ${res.deleted} previous ones cleared.`);
      fetchAll();
    } catch (e: any) {
      setError(e.response?.data?.message ?? e.message);
    } finally {
      setRunning(false);
    }
  }

  async function saveSettings() {
    setSaving(true); setError('');
    try {
      await fabPut('mrp/settings', { autoRunEnabled: autoEnabled, runHour, runMinute });
      setToast('Schedule saved.');
      fetchAll();
    } catch (e: any) {
      setError(e.response?.data?.message ?? e.message);
    } finally {
      setSaving(false);
    }
  }

  const lastRun = runs[0] ?? null;
  const settingsChanged = settings
    ? (autoEnabled !== (settings.auto_run_enabled === 1) || runHour !== settings.run_hour || runMinute !== settings.run_minute)
    : false;

  return (
    <Box sx={{ p: 3, maxWidth: 900 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>MRP Run</Typography>
          <Typography variant="body2" color="text.secondary">
            Material Requirements Planning — explodes demand through BOMs and generates planned orders.
          </Typography>
        </Box>
        {canManage && (
          <Button
            variant="contained" size="large"
            startIcon={running ? <CircularProgress size={18} color="inherit" /> : <PlayArrowIcon />}
            onClick={triggerRun} disabled={running}
            sx={{ minWidth: 160 }}
          >
            {running ? 'Running…' : 'Run MRP Now'}
          </Button>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {/* How it works */}
      <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>How MRP works</Typography>
        <Box component="ol" sx={{ m: 0, pl: 2.5, '& li': { mb: 0.5 } }}>
          <Typography component="li" variant="body2">
            Reads gross demand from all open <strong>Sales Orders</strong> (open lines, net of qty already completed).
          </Typography>
          <Typography component="li" variant="body2">
            Adds reorder demand for items where <strong>stock on hand</strong> is below the reorder minimum.
          </Typography>
          <Typography component="li" variant="body2">
            Subtracts available stock (on-hand + on-order) to calculate the <strong>net requirement</strong>.
          </Typography>
          <Typography component="li" variant="body2">
            Explodes each item's <strong>Bill of Materials</strong> (up to 8 levels deep) to calculate component requirements.
          </Typography>
          <Typography component="li" variant="body2">
            Creates <strong>Planned Orders</strong> — type <em>mrp_make</em> for manufactured items,
            <em>mrp_buy</em> for purchased. Visible in <strong>Orders → Planned</strong> tab.
          </Typography>
        </Box>
      </Paper>

      {/* Schedule settings */}
      <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <ScheduleIcon fontSize="small" color="action" />
          <Typography variant="subtitle2" fontWeight={700}>Automatic Schedule</Typography>
        </Box>
        <FormControlLabel
          control={<Switch checked={autoEnabled} onChange={(e) => setAutoEnabled(e.target.checked)} disabled={!canManage} />}
          label="Run MRP automatically every night"
          sx={{ mb: 1.5 }}
        />
        {autoEnabled && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Typography variant="body2" color="text.secondary">Run at</Typography>
            <TextField select size="small" label="Hour" value={runHour} sx={{ width: 90 }}
              onChange={(e) => setRunHour(Number(e.target.value))} disabled={!canManage}>
              {HOURS.map((h) => <MenuItem key={h} value={h}>{pad(h)}</MenuItem>)}
            </TextField>
            <TextField select size="small" label="Minute" value={runMinute} sx={{ width: 90 }}
              onChange={(e) => setRunMinute(Number(e.target.value))} disabled={!canManage}>
              {MINUTES.map((m) => <MenuItem key={m} value={m}>{pad(m)}</MenuItem>)}
            </TextField>
            <Typography variant="body2" color="text.secondary">
              (server time — currently {new Date().toLocaleTimeString()})
            </Typography>
          </Box>
        )}
        {settings?.last_auto_run_date && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Last auto-run: {settings.last_auto_run_date}
          </Typography>
        )}
        {canManage && (
          <Box sx={{ mt: 2 }}>
            <Button variant="outlined" size="small" startIcon={<SaveIcon />}
              onClick={saveSettings} disabled={saving || !settingsChanged}>
              {saving ? 'Saving…' : 'Save Schedule'}
            </Button>
          </Box>
        )}
      </Paper>

      {/* Last run summary */}
      {lastRun && (
        <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
          <Typography variant="subtitle2" fontWeight={700} gutterBottom>Last Run</Typography>
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
            {statusChip(lastRun.status)}
            <Typography variant="body2"><strong>Started:</strong> {fmt(lastRun.started_at)}</Typography>
            <Typography variant="body2"><strong>Duration:</strong> {duration(lastRun.started_at, lastRun.finished_at)}</Typography>
            <Typography variant="body2"><strong>Trigger:</strong> {lastRun.triggered_by}</Typography>
            {lastRun.status === 'success' && (<>
              <Chip label={`+${lastRun.planned_orders_created} created`} size="small" color="success" variant="outlined" />
              <Chip label={`−${lastRun.planned_orders_deleted} cleared`} size="small" color="default" variant="outlined" />
            </>)}
            {lastRun.error_message && (
              <Tooltip title={lastRun.error_message}>
                <Chip label="View error" size="small" color="error" />
              </Tooltip>
            )}
          </Box>
        </Paper>
      )}

      {/* Run history */}
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Run History</Typography>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>
      ) : runs.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">No MRP runs yet. Click "Run MRP Now" to start.</Typography>
        </Paper>
      ) : (
        <Paper variant="outlined">
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: '70px 1fr 100px 90px 80px 80px 90px',
            px: 2, py: 1,
            bgcolor: 'action.hover',
            borderBottom: 1, borderColor: 'divider',
          }}>
            {['ID', 'Started', 'Duration', 'Trigger', 'Created', 'Cleared', 'Status'].map((h) => (
              <Typography key={h} variant="caption" color="text.secondary" fontWeight={700}>{h}</Typography>
            ))}
          </Box>
          {runs.map((r, i) => (
            <Box key={r.id} sx={{
              display: 'grid',
              gridTemplateColumns: '70px 1fr 100px 90px 80px 80px 90px',
              px: 2, py: 1.25,
              borderBottom: i < runs.length - 1 ? 1 : 0,
              borderColor: 'divider',
              '&:hover': { bgcolor: 'action.hover' },
            }}>
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>#{r.id}</Typography>
              <Typography variant="body2">{fmt(r.started_at)}</Typography>
              <Typography variant="body2">{duration(r.started_at, r.finished_at)}</Typography>
              <Typography variant="body2">{r.triggered_by}</Typography>
              <Typography variant="body2" color="success.main">+{r.planned_orders_created}</Typography>
              <Typography variant="body2" color="text.secondary">−{r.planned_orders_deleted}</Typography>
              <Box>{statusChip(r.status)}</Box>
            </Box>
          ))}
        </Paper>
      )}

      <Snackbar open={!!toast} autoHideDuration={6000} onClose={() => setToast('')} message={toast} />
    </Box>
  );
}
