/**
 * The cockpit's data. One request, one endpoint.
 *
 * Home shows seven work queues, a stat strip and a readiness list. Fetching
 * those as seven calls would be seven round trips for a screen that must be up
 * before the user has finished reading the greeting, so the backend assembles
 * them (`routes/overview.js`) and this is the only call the page makes.
 *
 * EVERY FIELD IS OPTIONAL, AND THAT IS THE CONTRACT. The backend omits a block
 * the caller has no permission for, so `counts.leavePending === undefined`
 * means "not yours to see" and hides the card, while `0` means "nothing to do"
 * and shows it calmly. A card that renders a zero it invented is worse than a
 * card that is absent — the number would be read as fact.
 */
import { api } from './client';

export interface OverviewCounts {
  // Organisation (cf_hrms_org_view)
  openPoints?: number;
  departments?: number;
  locations?: number;
  workContexts?: number;
  shifts?: number;
  positions?: number;
  /** Seats the organisation has sanctioned, counted the org chart's way. */
  sanctioned?: number;
  filled?: number;
  vacantSeats?: number;
  rolesTotal?: number;
  rolesActive?: number;
  /** A role with no purpose cannot produce a usable JD — it opens on a blank line. */
  rolesNoPurpose?: number;
  rolesNoKras?: number;

  // People (cf_hrms_people_view)
  employees?: number;
  employeesNoAssignment?: number;
  activeAssignments?: number;
  contractors?: number;
  documentsExpiring?: number;
  documentsExpired?: number;

  // Work (cf_hrms_attendance_view / cf_hrms_leave_view)
  attendanceExpected?: number;
  attendanceMarked?: number;
  attendanceUnmarked?: number;
  regularisationsPending?: number;
  leavePending?: number;
  leaveTypes?: number;

  // Documents (cf_hrms_documents_generate)
  generatedDocuments?: number;
}

export interface RecentPerson {
  id: number;
  employeeCode: string;
  fullName: string;
  roleTitle: string | null;
  dateOfJoining: string | null;
  employmentStatus: string;
}

export interface HomeOverview {
  /** The date every "as of today" figure was computed for. */
  asOf: string;
  counts: OverviewCounts;
  /** Null when the caller cannot see people. */
  recentPeople: RecentPerson[] | null;
}

export const getHomeOverview = () => api.get<HomeOverview>('/overview/home');
