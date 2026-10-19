/**
 * My place › Team attendance (CF_HRMS_HIRING_SPEC.md §28.7) — a manager's team calendar: the
 * muster of the people below them (the §7 rule, on the server), one person's month on a click,
 * and waiving a team member's penalty with a reason. Corrections they ask for are in Approvals.
 */
import { useCallback, useEffect, useState } from 'react';
import { Box, Button } from '@mui/material';
import GroupsRounded from '@mui/icons-material/GroupsRounded';
import { useNavigate, useParams } from 'react-router-dom';
import { EmptyState, ErrorNotice, ListSkeleton, PageHeader, PromptDialog, SideSheet, errorMessage, useToast } from '@shared/ui';
import { teamAttendanceApi, thisMonth, type MonthGrid, type Penalty, type PersonMonth } from '../api/attendance';
import { Legend, MonthPicker, MusterGrid } from '../components/attendance/AttendanceParts';
import { PersonMonthView } from '../components/attendance/PersonMonthView';

export default function TeamAttendance() {
  const toast = useToast();
  const navigate = useNavigate();
  const { company } = useParams<{ company: string }>();
  const [month, setMonth] = useState(thisMonth());
  const [grid, setGrid] = useState<MonthGrid | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [person, setPerson] = useState<number | null>(null);
  const [data, setData] = useState<PersonMonth | null>(null);
  const [waiving, setWaiving] = useState<Penalty | null>(null);
  const load = useCallback(() => { setGrid(null); teamAttendanceApi.month(month).then((g) => { setGrid(g); setError(null); }).catch(setError); }, [month]);
  useEffect(load, [load]);
  const loadPerson = useCallback(() => { if (person) teamAttendanceApi.person(person, month).then(setData).catch((e) => toast.error(errorMessage(e))); }, [person, month, toast]);
  useEffect(() => { setData(null); loadPerson(); }, [loadPerson]);
  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto' }}>
      <PageHeader title="Team attendance" subtitle="The people who report to you, day by day."
        actions={(
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <MonthPicker month={month} onChange={setMonth} />
            <Button onClick={() => navigate(`/${company}/cf_hrms/approvals`)}>Approvals</Button>
          </Box>
        )} />
      <ErrorNotice error={error} onRetry={load} />
      {!grid ? <ListSkeleton rows={5} /> : grid.rows.length === 0 ? (
        <EmptyState icon={<GroupsRounded />} title="Nobody reports to you" hint="Your team is the people in the positions below yours on the organisation chart." />
      ) : (
        <>
          <Legend legend={grid.legend} />
          <MusterGrid grid={grid} onPerson={setPerson} />
        </>
      )}
      <SideSheet open={person != null} onClose={() => setPerson(null)} width={980} title={data?.person?.name ?? 'Attendance'} subtitle={data ? `${data.label} · ${data.policy.line}` : undefined}>
        {!data ? <ListSkeleton rows={6} /> : <PersonMonthView data={data} onWaive={setWaiving} />}
      </SideSheet>
      {waiving && (
        <PromptDialog open title="Waive this penalty?" body={`${waiving.reason}${waiving.action === 'LEAVE' ? ' The leave it took goes back.' : ''}`} label="Why" confirmLabel="Waive"
          onClose={() => setWaiving(null)} onConfirm={async (note) => { await teamAttendanceApi.waive(waiving.id, note); toast.success('Penalty waived.'); setWaiving(null); loadPerson(); load(); }} />
      )}
    </Box>
  );
}
