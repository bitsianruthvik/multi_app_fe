/**
 * My attendance (CF_HRMS_HIRING_SPEC.md §28.7) — my month as a calendar with the punches of each
 * day, late marks and penalties; punch IN / OUT when the company turned the web punch on; ask to
 * correct a day, a short permission or on duty. Reads `/user/me/attendance` only — no ids.
 */
import { useCallback, useEffect, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import FingerprintRounded from '@mui/icons-material/FingerprintRounded';
import BadgeRounded from '@mui/icons-material/BadgeRounded';
import { Callout, DetailSkeleton, EmptyState, ErrorNotice, PageHeader, SectionCard, errorMessage, useToast } from '@shared/ui';
import { hm, myAttendanceApi, thisMonth, todayLocal, type PersonMonth } from '../api/attendance';
import { AskDialog, MonthPicker } from '../components/attendance/AttendanceParts';
import { PersonMonthView } from '../components/attendance/PersonMonthView';

function where(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('This browser cannot share its location.')); return; }
    navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => reject(new Error('Allow the browser to share your location to punch here.')), { enableHighAccuracy: true, timeout: 15000 });
  });
}

export default function MyAttendance() {
  const toast = useToast();
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState<PersonMonth | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [ask, setAsk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    myAttendanceApi.get(month).then((d) => { setData(d); setError(null); }).catch(setError).finally(() => setLoading(false));
  }, [month]);
  useEffect(load, [load]);

  const punch = async (direction: 'IN' | 'OUT') => {
    setBusy(true);
    try {
      const at = data?.webPunch.needsLocation ? await where() : {};
      const r = await myAttendanceApi.punch({ direction, ...at });
      toast.success(`Punched ${direction} at ${hm(r.punch.at)}.`);
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally { setBusy(false); }
  };

  const notLinked = (error as { code?: string } | null)?.code === 'NOT_LINKED';
  if (loading && !data) return <DetailSkeleton />;
  if (notLinked) {
    return (
      <>
        <PageHeader title="My attendance" />
        <EmptyState icon={<BadgeRounded sx={{ fontSize: 34 }} />} title="This login is not connected to an employee record" hint={errorMessage(error)} />
      </>
    );
  }
  if (!data) return (<><PageHeader title="My attendance" /><ErrorNotice error={error} fallback="Could not load your attendance." onRetry={load} /></>);

  const wp = data.webPunch;
  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <PageHeader
        title="My attendance"
        subtitle={data.policy.line}
        actions={<MonthPicker month={month} onChange={(m) => { setData(null); setMonth(m); }} />}
      />
      <ErrorNotice error={error} onRetry={load} />
      {!data.live && <Callout title="Attendance is not live yet" sx={{ mb: 2 }}>HR has not started recording attendance here. Your days will show once it starts.</Callout>}
      <PersonMonthView
        data={data}
        extraTop={wp.enabled ? (
          <SectionCard title="Punch" subtitle={wp.today.length ? `Today: ${wp.today.map((p) => `${hm(p.at)} ${p.direction}`).join(', ')}` : 'No punch today yet.'}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <Button variant={wp.next === 'IN' ? 'contained' : 'outlined'} startIcon={<FingerprintRounded />} disabled={busy} onClick={() => punch('IN')} data-action="punch-in">Punch IN</Button>
              <Button variant={wp.next === 'OUT' ? 'contained' : 'outlined'} startIcon={<FingerprintRounded />} disabled={busy} onClick={() => punch('OUT')} data-action="punch-out">Punch OUT</Button>
              {wp.needsLocation && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>Your location is checked against the workplace.</Typography>}
            </Box>
          </SectionCard>
        ) : null}
        dayAction={(d) => (!d.future || d.date === todayLocal()) && data.live ? (
          <Button size="small" variant="outlined" onClick={() => setAsk(d.date)} data-action="ask-day">Ask about this day</Button>
        ) : (data.live ? <Button size="small" variant="outlined" onClick={() => setAsk(d.date)} data-action="ask-day">Short permission / on duty</Button> : null)}
        onCancelRequest={async (r) => {
          try { await myAttendanceApi.cancel(r.id); toast.success('Request cancelled.'); load(); } catch (e) { toast.error(errorMessage(e)); }
        }}
      />
      {ask && (
        <AskDialog
          open
          date={ask}
          kinds={ask > todayLocal() ? ['SHORT_PERMISSION', 'ON_DUTY'] : ['CORRECTION', 'SHORT_PERMISSION', 'ON_DUTY']}
          shortPermission={data.policy.shortPermission}
          approverWords={data.approver ? `It goes to ${data.approver.name}.` : 'It goes to HR.'}
          onClose={() => setAsk(null)}
          onSubmit={async (body) => { await myAttendanceApi.ask(body); toast.success('Sent for approval.'); setAsk(null); load(); }}
        />
      )}
    </Box>
  );
}
