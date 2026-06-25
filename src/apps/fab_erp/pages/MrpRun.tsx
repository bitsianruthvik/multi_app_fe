import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, FormControlLabel, MenuItem, Switch, TextField, Tooltip, Typography,
} from '@mui/material';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import SaveIcon from '@mui/icons-material/SaveRounded';
import AutoGraphRounded from '@mui/icons-material/AutoGraphRounded';

import { fabPost, fabGet, fabPut } from '../api/client';
import { usePermission } from '@core/hooks/usePermission';
import { Surface, RunPanel, StatusBadge, Mono, EmptyState, useToast } from '../components';

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
  auto_run_enabled: number; run_hour: number; run_minute: number; last_auto_run_date: string | null;
}

function runStatusFamily(s: MrpRun['status']): 'success' | 'danger' | 'warning' {
  if (s === 'success') return 'success';
  if (s === 'error') return 'danger';
  return 'warning';
}

function fmt(iso: string | null) { return iso ? new Date(iso).toLocaleString() : '—'; }
function duration(start: string, end: string | null) {
  if (!end) return '—';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}
function pad(n: number) { return String(n).padStart(2, '0'); }
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

export default function MrpRun() {
  const canManage = usePermission('fab_erp_projects_manage');
  const { toast } = useToast();

  const [runs, setRuns] = useState<MrpRun[]>([]);
  const [settings, setSettings] = useState<MrpSettings | null>(null);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [autoEnabled, setAutoEnabled] = useState(true);
  const [runHour, setRunHour] = useState(23);
  const [runMinute, setRunMinute] = useState(0);

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
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string } }; message?: string };
      setError(ax.response?.data?.message ?? ax.message ?? 'Load failed');
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function triggerRun() {
    setRunning(true); setError('');
    try {
      const res = await fabPost<{ ok: boolean; runId: number; created: number; deleted: number }>('mrp/run');
      toast(`MRP complete — ${res.created} planned orders created, ${res.deleted} previous ones cleared`);
      fetchAll();
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string } }; message?: string };
      setError(ax.response?.data?.message ?? ax.message ?? 'Run failed');
    } finally { setRunning(false); }
  }

  async function saveSettings() {
    setSaving(true); setError('');
    try {
      await fabPut('mrp/settings', { autoRunEnabled: autoEnabled, runHour, runMinute });
      toast('Schedule saved'); fetchAll();
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string } }; message?: string };
      setError(ax.response?.data?.message ?? ax.message ?? 'Save failed');
    } finally { setSaving(false); }
  }

  const lastRun = runs[0] ?? null;
  const settingsChanged = settings
    ? (autoEnabled !== (settings.auto_run_enabled === 1) || runHour !== settings.run_hour || runMinute !== settings.run_minute)
    : false;

  return (
    <Box sx={{ maxWidth: 900 }}>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <RunPanel
        title="MRP Run"
        summary="Reads open sales-order demand + reorder shortfalls, explodes BOMs up to 8 levels, and creates planned orders (mrp_make / mrp_buy) — visible in Orders → Planned."
        runLabel="Run MRP now"
        state={running ? 'running' : 'idle'}
        onRun={triggerRun}
        disabled={!canManage}
      />

      <Surface e={1} sx={{ p: 2.5, mb: 2.5, mt: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <ScheduleRounded sx={{ fontSize: 18, color: 'var(--c-text-2)' }} />
          <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)' }}>Automatic schedule</Typography>
        </Box>
        <FormControlLabel
          control={<Switch checked={autoEnabled} onChange={(e) => setAutoEnabled(e.target.checked)} disabled={!canManage} />}
          label="Run MRP automatically every night"
          sx={{ mb: 1.5 }}
        />
        {autoEnabled && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Run at</Typography>
            <TextField select size="small" label="Hour" value={runHour} sx={{ width: 90 }} onChange={(e) => setRunHour(Number(e.target.value))} disabled={!canManage}>
              {HOURS.map((h) => <MenuItem key={h} value={h}>{pad(h)}</MenuItem>)}
            </TextField>
            <TextField select size="small" label="Minute" value={runMinute} sx={{ width: 90 }} onChange={(e) => setRunMinute(Number(e.target.value))} disabled={!canManage}>
              {MINUTES.map((m) => <MenuItem key={m} value={m}>{pad(m)}</MenuItem>)}
            </TextField>
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>(server time — currently {new Date().toLocaleTimeString()})</Typography>
          </Box>
        )}
        {settings?.last_auto_run_date && (
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 1 }}>Last auto-run: {settings.last_auto_run_date}</Typography>
        )}
        {canManage && (
          <Box sx={{ mt: 2 }}>
            <Button variant="outlined" size="small" startIcon={<SaveIcon />} onClick={saveSettings} disabled={saving || !settingsChanged}>
              {saving ? 'Saving…' : 'Save schedule'}
            </Button>
          </Box>
        )}
      </Surface>

      {lastRun && (
        <Surface e={1} sx={{ p: 2.5, mb: 2.5 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 1.5 }}>Last run</Typography>
          <Box sx={{ display: 'flex', gap: 2.5, flexWrap: 'wrap', alignItems: 'center' }}>
            <StatusBadge status={lastRun.status} family={runStatusFamily(lastRun.status)} />
            <Typography sx={{ fontSize: 13, color: 'var(--c-text)' }}>Started: <Mono>{fmt(lastRun.started_at)}</Mono></Typography>
            <Typography sx={{ fontSize: 13, color: 'var(--c-text)' }}>Duration: <Mono>{duration(lastRun.started_at, lastRun.finished_at)}</Mono></Typography>
            <Typography sx={{ fontSize: 13, color: 'var(--c-text)' }}>Trigger: {lastRun.triggered_by}</Typography>
            {lastRun.status === 'success' && (<>
              <Box sx={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--c-success-600)', fontWeight: 500 }}>+{lastRun.planned_orders_created} created</Box>
              <Box sx={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--c-text-3)' }}>−{lastRun.planned_orders_deleted} cleared</Box>
            </>)}
            {lastRun.error_message && (
              <Tooltip title={lastRun.error_message}><Box><StatusBadge status="error" family="danger" /></Box></Tooltip>
            )}
          </Box>
        </Surface>
      )}

      <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 1.5 }}>Run history</Typography>
      {runs.length === 0 ? (
        <EmptyState icon={<AutoGraphRounded />} title="No MRP runs yet" hint='Click "Run MRP now" to start.' />
      ) : (
        <Surface e={1} sx={{ overflow: 'hidden' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '70px 1fr 100px 90px 80px 80px 90px', px: 2, py: 1, background: 'var(--c-surface-2)', borderBottom: '1px solid var(--c-divider)' }}>
            {['ID', 'Started', 'Duration', 'Trigger', 'Created', 'Cleared', 'Status'].map((h) => (
              <Typography key={h} sx={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--c-text-2)' }}>{h}</Typography>
            ))}
          </Box>
          {runs.map((r, i) => (
            <Box key={r.id} sx={{ display: 'grid', gridTemplateColumns: '70px 1fr 100px 90px 80px 80px 90px', px: 2, py: 1.25, borderBottom: i < runs.length - 1 ? '1px solid var(--c-divider)' : 'none', '&:hover': { background: 'var(--c-surface-2)' } }}>
              <Mono>#{r.id}</Mono>
              <Typography sx={{ fontSize: 13, color: 'var(--c-text)' }}>{fmt(r.started_at)}</Typography>
              <Typography sx={{ fontSize: 13, color: 'var(--c-text)' }}>{duration(r.started_at, r.finished_at)}</Typography>
              <Typography sx={{ fontSize: 13, color: 'var(--c-text)' }}>{r.triggered_by}</Typography>
              <Box sx={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--c-success-600)' }}>+{r.planned_orders_created}</Box>
              <Box sx={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--c-text-3)' }}>−{r.planned_orders_deleted}</Box>
              <Box><StatusBadge status={r.status} family={runStatusFamily(r.status)} /></Box>
            </Box>
          ))}
        </Surface>
      )}
    </Box>
  );
}
