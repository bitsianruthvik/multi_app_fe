import { RoleMasterScreen } from '../components/RoleMasterScreen';

/**
 * Qualifications — the credentials a role requires.
 *
 * One of the six reusable content masters (CF_HRMS_PLAN.md §5.2). The screen is
 * RoleMasterScreen — six vocabularies, one Collection screen, configured by
 * kind. KRA, Responsibility and KPI stay three separate routes because they are
 * three separate ideas (plan §2 rule 4); collapsing them into one screen with a
 * type column is exactly what the model forbids.
 */
export default function Qualifications() {
  return <RoleMasterScreen kind="qualifications" />;
}
