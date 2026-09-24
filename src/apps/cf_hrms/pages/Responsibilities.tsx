import { RoleMasterScreen } from '../components/RoleMasterScreen';

/**
 * Responsibilities — the duties expected of a role.
 *
 * One of the six reusable content masters (CF_HRMS_PLAN.md §5.2). The screen is
 * RoleMasterScreen — six vocabularies, one Collection screen, configured by
 * kind. KRA, Responsibility and KPI stay three separate routes because they are
 * three separate ideas (plan §2 rule 4); collapsing them into one screen with a
 * type column is exactly what the model forbids.
 */
export default function Responsibilities() {
  return <RoleMasterScreen kind="responsibilities" />;
}
