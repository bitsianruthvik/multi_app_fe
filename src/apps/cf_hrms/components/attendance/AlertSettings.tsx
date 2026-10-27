/**
 * Attendance › Settings — absence alerts (CF_HRMS_HIRING_SPEC.md §42.3): after each shift's start + grace + a delay,
 * the people not punched in (no approved leave, holiday or weekly off) go to HR and to each person's in-charge (the
 * resolved manager) — one message per person who hears, per shift and day. In the app and by email now; SMS and
 * WhatsApp once a provider is set up.
 */
import { useCallback, useEffect, useState } from 'react';
import { Box, Button, Checkbox, FormControlLabel, Stack, Switch, TextField, Typography } from '@mui/material';
import { Callout, ErrorNotice, ListSkeleton, SectionCard, ToneBadge, errorMessage, useToast } from '@shared/ui';
import { useCan } from '../../access/can';
import { attendanceApi, dayLabel, hm, type AlertSettings as Settings, type AlertsScreen } from '../../api/attendance';
import { ScreenHeader } from '../TabbedScreen';

const TEMPLATES: { key: Settings['hrTemplates'][number]; label: string }[] = [
  { key: 'OWNER', label: 'Owner' }, { key: 'HR_MANAGER', label: 'HR manager' }, { key: 'HR_EXECUTIVE', label: 'HR executive' },
];
const CHANNEL_KEY = { IN_APP: 'inApp', EMAIL: 'email', SMS: 'sms', WHATSAPP: 'whatsapp' } as const;
const STATUS_TONE: Record<string, 'success' | 'warning' | 'neutral' | 'danger' | 'info'> = { SENT: 'success', QUEUED: 'info', NOT_CONFIGURED: 'neutral', NO_ADDRESS: 'warning', FAILED: 'danger' };

export function AttSettings() {
  const can = useCan();
  const toast = useToast();
  const [data, setData] = useState<AlertsScreen | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [form, setForm] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { attendanceApi.alerts().then((d) => { setData(d); setForm(d.settings); setError(null); }).catch(setError); }, []);
  useEffect(load, [load]);
  const edit = can.attendance.edit;
  const set = (patch: Partial<Settings>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const save = async () => {
    if (!form) return;
    setBusy(true);
    try { await attendanceApi.putAlerts(form); toast.success('Absence alerts saved.'); load(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  const checkNow = async () => {
    setBusy(true);
    try {
      const r = await attendanceApi.checkNow();
      toast.success(r.sent.length ? `Sent for ${r.sent.length} shift${r.sent.length === 1 ? '' : 's'}: ${r.sent.map((x) => `${x.absent} not punched, ${x.digests} message${x.digests === 1 ? '' : 's'}`).join('; ')}.` : 'Nothing due that was not sent already.');
      setData(r.screen);
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <>
      <ScreenHeader title="Settings" subtitle="Absence alerts: who has not come in, told to HR and to each person’s in-charge, once per shift." />
      <ErrorNotice error={error} onRetry={load} />
      {!data || !form ? <ListSkeleton rows={4} /> : (
        <Stack spacing={2}>
          {!data.live && <Callout title="Attendance is not live">Alerts start once attendance is live (Close month tab).</Callout>}
          <SectionCard title="Absence alerts" subtitle="After each shift’s start, its grace and the delay below, the people not punched in — without approved leave, a holiday or a weekly off — are listed in ONE message for each person who hears."
            actions={edit ? <Button variant="contained" onClick={save} disabled={busy} data-action="save-alerts">Save</Button> : undefined}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5 }} data-alert-settings>
              <Stack spacing={1.25}>
                <FormControlLabel control={<Switch checked={form.enabled} disabled={!edit} onChange={(e) => set({ enabled: e.target.checked })} data-field="alerts-enabled" />} label="Send absence alerts" />
                <TextField size="small" type="number" label="Delay after start + grace (minutes)" value={form.delayMinutes} disabled={!edit} onChange={(e) => set({ delayMinutes: Number(e.target.value) })}
                  helperText="A 09:00 shift with 10 minutes’ grace and a 20-minute delay is checked at 09:30." sx={{ maxWidth: 320 }} data-field="alerts-delay" />
                <Typography sx={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: 'var(--c-text-3)', pt: 1 }}>Who hears</Typography>
                {TEMPLATES.map((t) => (
                  <FormControlLabel key={t.key} control={<Checkbox checked={form.hrTemplates.includes(t.key)} disabled={!edit}
                    onChange={(e) => set({ hrTemplates: e.target.checked ? [...form.hrTemplates, t.key] : form.hrTemplates.filter((x) => x !== t.key) })} />}
                  label={`${t.label} — everyone (a login limited to some org units: those only)`} />
                ))}
                <FormControlLabel control={<Checkbox checked={form.notifyManagers} disabled={!edit} onChange={(e) => set({ notifyManagers: e.target.checked })} />} label="Each person’s in-charge (their manager on the org chart) — their own people" />
              </Stack>
              <Stack spacing={1}>
                <Typography sx={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: 'var(--c-text-3)' }}>How</Typography>
                {data.channels.map((c) => (
                  <Box key={c.key}>
                    <FormControlLabel control={<Checkbox checked={form.channels[CHANNEL_KEY[c.key]]} disabled={!edit}
                      onChange={(e) => set({ channels: { ...form.channels, [CHANNEL_KEY[c.key]]: e.target.checked } })} data-field={`channel-${c.key}`} />}
                    label={<Box component="span" sx={{ display: 'inline-flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>{c.label}<ToneBadge tone={c.ready ? 'success' : 'neutral'} label={c.ready ? (c.provider ? `Ready (${c.provider})` : 'Ready') : 'Not set up'} /></Box>} />
                    {c.note && <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', pl: 4 }}>{c.note}</Typography>}
                  </Box>
                ))}
              </Stack>
            </Box>
          </SectionCard>
          <SectionCard title="Due now" subtitle={`As of ${hm(data.now)}: the shifts already past their check time today and yesterday.`}
            actions={edit && form.enabled ? <Button onClick={checkNow} disabled={busy} data-action="check-now">Check now</Button> : undefined}>
            {data.due.length === 0 ? <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>No shift is past its check time yet.</Typography> : data.due.map((d) => (
              <Box key={d.runKey} data-due={d.runKey} sx={{ py: 1, borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 } }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{d.shift ?? 'Shift'} · {dayLabel(d.date)}</Typography>
                  <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>starts {d.start}, checked at {hm(d.dueAt)} · {d.absent.length} of {d.people} not punched</Typography>
                  <ToneBadge tone={d.sent ? 'success' : 'neutral'} label={d.sent ? 'Sent' : 'Not sent'} />
                </Box>
                {d.absent.length > 0 && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.25, overflowWrap: 'anywhere' }}>{d.absent.slice(0, 12).map((x) => x.name).join(', ')}{d.absent.length > 12 ? ` and ${d.absent.length - 12} more` : ''}</Typography>}
              </Box>
            ))}
          </SectionCard>
          <SectionCard title="Sent" subtitle="The last checks: how many were listed and how each message went.">
            {data.runs.length === 0 ? <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>Nothing sent yet.</Typography> : data.runs.map((r) => (
              <Box key={r.id} data-run={r.id} sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', py: 0.75, borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 } }}>
                <Typography sx={{ fontSize: 13.5, fontWeight: 500, minWidth: 180 }}>{r.shift ?? 'Shift'} · {dayLabel(r.date)}</Typography>
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', flex: '1 1 160px' }}>{r.absent} not punched · {r.digests} message{r.digests === 1 ? '' : 's'}{r.trigger === 'BY_HAND' ? ' · by hand' : ''}</Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>{r.deliveries.map((d) => <ToneBadge key={`${d.channel}${d.status}`} tone={STATUS_TONE[d.status] ?? 'neutral'} label={`${d.channel.replace('_', '-').toLowerCase()} ${d.status.replace('_', ' ').toLowerCase()} ×${d.count}`} />)}</Box>
              </Box>
            ))}
          </SectionCard>
        </Stack>
      )}
    </>
  );
}

export default AttSettings;
