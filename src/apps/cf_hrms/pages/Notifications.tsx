import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Stack, Typography } from '@mui/material';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import { EmptyState, ErrorNotice, ListSkeleton, PageHeader, SectionCard, ToneBadge, errorMessage, useCompanySlug, useToast } from '@shared/ui';
import { useCan } from '../access/can';
import { complianceApi } from '../api/compliance';
import { NOTIFICATIONS_CHANGED, notificationsApi, type AppNotification } from '../api/dashboard';

/**
 * Notifications (the bell, CF_HRMS_HIRING_SPEC.md §42.3): the login's own — today the absence digests ("3 not
 * punched in — Day shift") — and, for a login with Compliance, how many law changes and deadlines wait there.
 */
export default function Notifications() {
  const can = useCan();
  const toast = useToast();
  const company = useCompanySlug();
  const navigate = useNavigate();
  const [data, setData] = useState<{ items: AppNotification[]; unread: number } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [compliance, setCompliance] = useState<number | null>(null);
  const load = useCallback(() => { notificationsApi.list().then((d) => { setData(d); setError(null); }).catch(setError); }, []);
  useEffect(load, [load]);
  useEffect(() => { if (can.compliance.view) complianceApi.bell().then((b) => setCompliance(b.count)).catch(() => setCompliance(null)); }, [can.compliance.view]);
  const changed = () => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
  const open = async (n: AppNotification) => {
    try { if (!n.read) { await notificationsApi.read(n.id); changed(); } } catch { /* the link still opens */ }
    if (n.link) navigate(`/${company}/cf_hrms/${n.link}`); else load();
  };
  const readAll = async () => {
    try { await notificationsApi.readAll(); changed(); load(); } catch (e) { toast.error(errorMessage(e)); }
  };
  return (
    <Box data-page="notifications">
      <PageHeader title="Notifications" subtitle="What was sent to you: absence alerts for your shifts and your people."
        actions={data?.unread ? <Button onClick={readAll} data-action="read-all">Mark all read</Button> : undefined} />
      <ErrorNotice error={error} onRetry={load} />
      <Stack spacing={2}>
        {can.compliance.view && compliance != null && (
          <SectionCard title="Compliance" subtitle={compliance ? `${compliance} law change${compliance === 1 ? '' : 's'} or deadline${compliance === 1 ? '' : 's'} waiting for you.` : 'Nothing waiting.'}
            actions={<Button size="small" endIcon={<ArrowForwardRounded />} onClick={() => navigate(`/${company}/cf_hrms/compliance`)}>Open Compliance</Button>}>
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Law changes to acknowledge and the deadline calendar are on the Compliance page.</Typography>
          </SectionCard>
        )}
        {!data ? <ListSkeleton rows={4} /> : data.items.length === 0 ? <EmptyState title="Nothing yet" hint="Absence alerts reach you here when HR turns them on (Attendance › Settings)." /> : (
          <SectionCard flush>
            {data.items.map((n) => (
              <Box key={n.id} data-notification={n.id} onClick={() => open(n)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') open(n); }}
                sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', flexWrap: 'wrap', px: 2, py: 1.5, cursor: 'pointer', borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 }, '&:hover': { background: 'var(--c-surface-2)' } }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', mt: 0.9, flexShrink: 0, background: n.read ? 'transparent' : 'var(--c-primary-600)' }} aria-label={n.read ? 'read' : 'unread'} />
                <Box sx={{ flex: '1 1 260px', minWidth: 0 }}>
                  <Typography sx={{ fontSize: 14, fontWeight: n.read ? 400 : 600 }}>{n.title}</Typography>
                  <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>
                    {n.data?.people?.length ? n.data.people.slice(0, 8).map((p) => `${p.name}${p.unit ? ` (${p.unit})` : ''}`).join(', ') + (n.data.people.length > 8 ? ` and ${n.data.people.length - 8} more` : '') : n.body}
                  </Typography>
                  <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mt: 0.25 }}>{n.createdAt ? new Date(n.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : ''}</Typography>
                </Box>
                {n.data?.forWhom && <ToneBadge tone={n.data.forWhom === 'HR' ? 'info' : 'neutral'} label={n.data.forWhom === 'HR' ? 'For HR' : 'Your people'} />}
              </Box>
            ))}
          </SectionCard>
        )}
      </Stack>
    </Box>
  );
}
