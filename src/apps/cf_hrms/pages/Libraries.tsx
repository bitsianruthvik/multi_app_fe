import { RoleMasterScreen } from '../components/RoleMasterScreen';
import { TabbedScreen, type ScreenTab } from '../components/TabbedScreen';

/**
 * Setup › Libraries — the six word lists a role is written from, one tab each
 * (CF_HRMS_HIRING_SPEC.md §10). They were six menu entries; nobody opens them
 * in a normal week, and they are one job: keeping the words tidy.
 *
 * They stay six SEPARATE lists. A KRA, a responsibility and a KPI are three
 * different ideas (CF_HRMS_PLAN.md §2 rule 4), so this is one screen with six
 * tabs and never one table with a type column.
 */
const TABS: ScreenTab[] = [
  { value: 'kras', label: 'KRAs', render: () => <RoleMasterScreen kind="kras" /> },
  { value: 'responsibilities', label: 'Responsibilities', render: () => <RoleMasterScreen kind="responsibilities" /> },
  { value: 'kpis', label: 'KPIs', render: () => <RoleMasterScreen kind="kpis" /> },
  { value: 'skills', label: 'Skills', render: () => <RoleMasterScreen kind="skills" /> },
  { value: 'qualifications', label: 'Qualifications', render: () => <RoleMasterScreen kind="qualifications" /> },
  { value: 'authorities', label: 'Authorities', render: () => <RoleMasterScreen kind="authorities" /> },
];

export default function Libraries() {
  return (
    <TabbedScreen
      title="Libraries"
      subtitle="The lists a role is written from. Fixing a line here changes it at once in every role that uses it, with no date and no history. To change one role's wording from a date, use Change the wording… on the role."
      tabs={TABS}
    />
  );
}
