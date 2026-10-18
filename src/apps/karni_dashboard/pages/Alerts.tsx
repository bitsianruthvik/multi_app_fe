import { useEffect, useState } from 'react';
import { Autocomplete, Box, Button, Chip, Collapse, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import { Callout, KpiGrid, KpiTile, SectionCard, ToneBadge, errorMessage, useToast } from '@shared/ui';
import { kdApi, useReport } from '../api';
import { ReportPage } from '../components/ReportPage';
import { ago } from '../format';

interface Settings {
  enabled: boolean; recipients: Record<string, string[]>; dailyAt: string; weeklyDay: number; workStart: number; workEnd: number;
}
interface SettingsReply { settings: Settings; emailConfigured: boolean; canEdit: boolean }
interface Item { rule: string; key: string; area: string; name: string; label: string; reason: string | null }
interface Alert { id: number; kind: 'instant' | 'daily' | 'weekly'; area: string; title: string; items: Item[]; recipients: string[] | null; emailStatus: string; error: string | null; createdAt: string }

const AREAS = ['all', 'Money', 'Sales', 'Orders', 'Purchase', 'Stores', 'Production'];
const AREA_LABEL: Record<string, string> = { all: 'Everything (all areas)' };
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const EMAIL: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info' }> = {
  sent: { label: 'Emailed', tone: 'success' }, off: { label: 'In app only (alerts off)', tone: 'neutral' },
  no_recipients: { label: 'In app only (no recipients)', tone: 'warning' }, not_configured: { label: 'In app only (email not set up)', tone: 'warning' },
  failed: { label: 'Email failed', tone: 'danger' }, nothing: { label: 'Nothing new', tone: 'info' },
};

/**
 * Who hears about findings, and when. Instant alerts go out in working hours
 * after the SAP sync that found them; daily and weekly digests at the set
 * time. Everything is kept here even when no email goes out.
 */
export default function Alerts() {
  const toast = useToast();
  const cfg = useReport<SettingsReply>('/alert-settings', false);
  const list = useReport<Alert[]>('/alerts');
  const next = useReport<{ instant: Item[]; daily: Item[]; weekly: Item[] }>('/alerts/preview');
  const [s, setS] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => { if (cfg.data) setS(cfg.data.settings); }, [cfg.data]);
  const canEdit = !!cfg.data?.canEdit;

  const save = async () => {
    if (!s) return;
    setSaving(true);
    try {
      await kdApi.put('/alert-settings', s);
      toast.success('Alert settings saved');
      cfg.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ReportPage title="Alerts" subtitle="Who hears about what needs attention, and when" asOf={new Date().toISOString()}
      loading={cfg.loading} error={cfg.error} reload={() => { cfg.reload(); list.reload(); next.reload(); }} hasData={!!cfg.data}>
      {s && cfg.data && (
        <>
          {!cfg.data.emailConfigured && (
            <Callout tone="warning" title="Email is not set up on the server yet">
              Alerts are prepared and kept below, but no email goes out until the server has an email account (SMTP) configured.
              Everything else on this screen already works.
            </Callout>
          )}
          <KpiGrid>
            <KpiTile label="Instant alerts waiting" display={`${next.data?.instant.length ?? '—'}`} footer="Sent in working hours after the next SAP sync" />
            <KpiTile label="For the next morning digest" display={`${next.data?.daily.length ?? '—'}`} footer={`Every day at ${s.dailyAt}`} />
            <KpiTile label="For the next weekly digest" display={`${next.data?.weekly.length ?? '—'}`} footer={`${DAYS[s.weeklyDay]}s at ${s.dailyAt}`} />
          </KpiGrid>

          <SectionCard title="Settings" subtitle={canEdit ? 'Admins can change these' : 'Only an admin can change these'}>
            <Stack spacing={2.5}>
              <FormControlLabel control={<Switch checked={s.enabled} disabled={!canEdit} onChange={(e) => setS({ ...s, enabled: e.target.checked })} />}
                label={<Box><Typography sx={{ fontWeight: 600 }}>Send alert emails</Typography>
                  <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>When off, alerts are still prepared and listed here — nobody is emailed.</Typography></Box>} />
              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(4, 1fr)' } }}>
                <TextField size="small" type="time" label="Digest time (India)" value={s.dailyAt} disabled={!canEdit} onChange={(e) => setS({ ...s, dailyAt: e.target.value })} InputLabelProps={{ shrink: true }} />
                <TextField size="small" select label="Weekly digest on" value={s.weeklyDay} disabled={!canEdit} onChange={(e) => setS({ ...s, weeklyDay: Number(e.target.value) })}>
                  {DAYS.map((d, i) => <MenuItem key={d} value={i}>{d}</MenuItem>)}
                </TextField>
                <TextField size="small" type="number" label="Working hours from" value={s.workStart} disabled={!canEdit} onChange={(e) => setS({ ...s, workStart: Number(e.target.value) })} inputProps={{ min: 0, max: 23 }} />
                <TextField size="small" type="number" label="Working hours to" value={s.workEnd} disabled={!canEdit} onChange={(e) => setS({ ...s, workEnd: Number(e.target.value) })} inputProps={{ min: 1, max: 24 }} />
              </Box>
              <Box>
                <Typography sx={{ fontWeight: 600, mb: 0.5 }}>Who gets what</Typography>
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 1.5 }}>Type an email address and press Enter. Each area's alerts go to that area's people and to "Everything".</Typography>
                <Stack spacing={1.5}>
                  {AREAS.map((a) => (
                    <Autocomplete key={a} multiple freeSolo options={[]} disabled={!canEdit} value={s.recipients[a] || []}
                      onChange={(_, v) => setS({ ...s, recipients: { ...s.recipients, [a]: (v as string[]).map((x) => x.trim()).filter(Boolean) } })}
                      renderTags={(v, getTagProps) => v.map((opt, i) => <Chip size="small" label={opt} {...getTagProps({ index: i })} key={opt} />)}
                      renderInput={(p) => <TextField {...p} size="small" label={AREA_LABEL[a] || a} placeholder="name@karnipackaging.com" />} />
                  ))}
                </Stack>
              </Box>
              {canEdit && <Box><Button variant="contained" onClick={save} disabled={saving}>Save settings</Button></Box>}
            </Stack>
          </SectionCard>

          <SectionCard title="How often each kind of finding is told" subtitle="Every finding is re-checked after each SAP sync (every 10 minutes); this is only about telling people">
            <Stack spacing={1}>
              <Typography sx={{ fontSize: 13 }}><b>Straight away</b> (working hours): raw material running out, customer over credit limit, order due in 7 days with nothing in motion.</Typography>
              <Typography sx={{ fontSize: 13 }}><b>Morning digest</b>: late orders stock can cover, billed while 90+ days overdue, stuck production, machine output down, scrap up, delivered not invoiced, credit notes, late vendors.</Typography>
              <Typography sx={{ fontSize: 13 }}><b>Weekly digest</b>: customers gone quiet or buying less, price changes, dead stock, buying overstock, payments not matched, GRNs not invoiced, due this week, order book.</Typography>
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>A finding is told once. It is told again only if it comes back — it got materially worse, its snooze ended, or it disappeared and returned.</Typography>
            </Stack>
          </SectionCard>

          <SectionCard title="Alert history" subtitle="The last 100" flush>
            {(list.data ?? []).length === 0 && <Typography sx={{ p: 2, fontSize: 13, color: 'var(--c-text-3)' }}>No alerts yet.</Typography>}
            {(list.data ?? []).map((a) => (
              <Box key={a.id} sx={{ borderTop: '1px solid var(--c-divider)' }}>
                <Box onClick={() => setOpen(open === a.id ? null : a.id)} role="button" tabIndex={0}
                  sx={{ px: 2, py: 1.25, display: 'flex', gap: 1.5, alignItems: 'center', cursor: 'pointer', flexWrap: 'wrap' }}>
                  <ToneBadge label={a.kind === 'instant' ? 'Instant' : a.kind === 'daily' ? 'Daily' : 'Weekly'} tone={a.kind === 'instant' ? 'danger' : 'info'} />
                  <Typography sx={{ fontSize: 13.5, fontWeight: 600, flex: 1, minWidth: 200 }}>{a.title}</Typography>
                  <ToneBadge label={EMAIL[a.emailStatus]?.label || a.emailStatus} tone={EMAIL[a.emailStatus]?.tone || 'neutral'} />
                  <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', width: 90, textAlign: 'right' }}>{ago(a.createdAt)}</Typography>
                  {a.items.length > 0 && <ExpandMoreRounded sx={{ fontSize: 18, color: 'var(--c-text-3)', transform: open === a.id ? 'rotate(180deg)' : 'none' }} />}
                </Box>
                <Collapse in={open === a.id} unmountOnExit>
                  <Box sx={{ px: 2, pb: 1.5 }}>
                    {a.recipients && a.recipients.length > 0 && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mb: 0.75 }}>To: {a.recipients.join(', ')}</Typography>}
                    {a.error && <Typography sx={{ fontSize: 12, color: 'var(--c-danger-600)', mb: 0.75 }}>{a.error}</Typography>}
                    <Stack spacing={0.5}>
                      {a.items.slice(0, 50).map((i) => (
                        <Typography key={`${i.rule}-${i.key}`} sx={{ fontSize: 12.5 }}>
                          <b>{i.name}</b>: {i.label}{i.reason ? <span style={{ color: 'var(--c-text-3)' }}> ({i.reason})</span> : null}
                        </Typography>
                      ))}
                      {a.items.length > 50 && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>+ {a.items.length - 50} more</Typography>}
                    </Stack>
                  </Box>
                </Collapse>
              </Box>
            ))}
          </SectionCard>
        </>
      )}
    </ReportPage>
  );
}
