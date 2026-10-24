/**
 * Compliance (CF_HRMS_HIRING_SPEC.md §36.4, §36.5) — one screen with three tabs:
 *   Notices    law changes published by the product team, what each touches here, acknowledgement
 *   Calendar   statutory deadlines with reminders, marked done here
 *   Review     the company's CA: rule sets, what changed, the calculation trace, sign-off, review pack
 * The law is kept by the product team for every company; responsibility for compliance stays with the
 * employer and its CA — the app applies, checks, explains and records.
 */
import { TabbedScreen } from '../components/TabbedScreen';
import { NoticesPanel } from '../components/compliance/NoticesPanel';
import { CalendarPanel } from '../components/compliance/CalendarPanel';
import { ReviewPanel } from '../components/compliance/ReviewPanel';

export default function Compliance() {
  return (
    <TabbedScreen
      title="Compliance"
      subtitle="Changes in the law and what they mean here, the deadline calendar, and your CA’s review."
      tabs={[
        { value: 'notices', label: 'Notices', render: () => <NoticesPanel /> },
        { value: 'calendar', label: 'Calendar', render: () => <CalendarPanel /> },
        { value: 'review', label: 'Review (CA)', render: () => <ReviewPanel /> },
      ]}
    />
  );
}
