import { useMemo } from 'react';
import { TabbedScreen, type ScreenTab } from '../components/TabbedScreen';
import { useCan } from '../access/can';
import { AttMonth, AttPenalties, AttRequests, AttToday } from '../components/attendance/HrDayTabs';
import { AttClose, AttDevices, AttImports, AttPolicies } from '../components/attendance/HrSetupTabs';
import { AttSettings } from '../components/attendance/AlertSettings';

/**
 * Time and leave › Attendance (CF_HRMS_HIRING_SPEC.md §28.7) — one screen, nine tabs:
 *
 *   Today        the board by department: present, late, absent, on leave, not punched
 *   Month        the muster (person × day letters, totals), a person's month, the muster roll in Excel
 *   Requests     corrections, short permissions, on duty — HR may decide any
 *   Penalties    what the rules took; waive with a reason
 *   Policies     the rules in words, and where each policy applies
 *   Devices      devices, the enrol-number mapping, punches waiting for one, API keys
 *   Imports      a punch log or a daily register, by Excel or CSV (needs the upload right)
 *   Close month  "live from", the web punch, closing and re-opening months
 *   Settings     absence alerts (spec §42.3): on/off, the delay, who hears, the channels, what is due, what was sent
 *
 * The route is behind the attendance `view` right; each button asks for its own right.
 */
export default function Attendance() {
  const can = useCan();
  const tabs = useMemo<ScreenTab[]>(
    () => [
      { value: 'today', label: 'Today', render: () => <AttToday /> },
      { value: 'month', label: 'Month', render: () => <AttMonth /> },
      { value: 'requests', label: 'Requests', render: () => <AttRequests /> },
      { value: 'penalties', label: 'Penalties', render: () => <AttPenalties /> },
      { value: 'policies', label: 'Policies', render: () => <AttPolicies /> },
      { value: 'devices', label: 'Devices', render: () => <AttDevices /> },
      ...(can.attendance.upload ? [{ value: 'imports', label: 'Imports', render: () => <AttImports /> }] : []),
      { value: 'close', label: 'Close month', render: () => <AttClose /> },
      { value: 'settings', label: 'Settings', render: () => <AttSettings /> },
    ],
    [can.attendance.upload],
  );
  return <TabbedScreen title="Attendance" subtitle="Punches in, days out: who came, the rules and penalties, devices, and the month for payroll." tabs={tabs} />;
}
