/**
 * The employee self view. Two endpoints (my place, my org chart slice), no ids.
 *
 * `GET /user/me/place` answers for the signed-in person and for nobody else —
 * the backend resolves the employee from the JWT via `hrms_employees.user_id`
 * and there is no parameter to pass a different one. So there is deliberately
 * no `getPlaceFor(employeeId)` here and there must never be: the absence of an
 * id in this module IS the security boundary, and a convenience overload would
 * quietly turn a self view into a people directory.
 *
 * Every other function in this app's api/ folder reaches screens a shop-floor
 * employee cannot open. This is the only module `MyPlace.tsx` may import.
 */
import { api } from './client';

/** How this line should be drawn. `is_formal` on the relationship type decides. */
export type LineStyle = 'SOLID' | 'DOTTED';

/** Which layer a reporting line came from — the chart's design, or this person's work. */
export type ReportingOrigin = 'POSITION' | 'ASSIGNMENT';

export type ScopeType =
  | 'GENERAL' | 'FUNCTION' | 'RESPONSIBILITY' | 'WORK_CONTEXT' | 'PROJECT' | 'OTHER';

/**
 * Contact details. Present on the caller's own record always; present on
 * anybody else only when the caller holds `cf_hrms_people_pii`. An absent
 * `contact` key means "not yours to see" — which is why it is optional rather
 * than a block of nulls.
 */
export interface SelfContact {
  phone: string | null;
  email: string | null;
  dateOfBirth: string | null;
  address: unknown | null;
  emergencyContact: unknown | null;
}

export interface SelfPerson {
  employeeId: number | null;
  employeeCode: string | null;
  name: string | null;
  roleTitle: string | null;
  positionTitle: string | null;
  assignmentTitle: string | null;
  contact?: SelfContact;
}

export interface SelfScope {
  type: ScopeType;
  label: string | null;
  workContextName: string | null;
  isGeneral: boolean;
  /** "Function: Statutory compliance" — the HR wording. */
  sentence: string;
  /** "for statutory compliance" — completes a sentence. Null when general. */
  phrase: string | null;
}

/**
 * One manager, with everything needed to show that it is a manager of a
 * particular KIND over a particular PART of the work. There is no `managerId`
 * and no single-manager mode anywhere in this type, on purpose.
 */
export interface SelfReportingLine {
  key: string;
  origin: ReportingOrigin;
  inherited: boolean;
  /** "From the organisation chart" / "Recorded for you on this work". */
  fromText: string;
  relationshipType: { code: string; name: string; isFormal: boolean };
  isPrimary: boolean;
  lineStyle: LineStyle;
  scope: SelfScope;
  /** One plain sentence saying what this kind of manager means. */
  meaning: string;
  /** Null only when a formal seat is vacant. */
  person: SelfPerson | null;
  seatTitle: string | null;
  seatPositionId: number | null;
  scopeKey: string;
  vacant: boolean;
  /** A seat with more than one occupant: everybody else in it. */
  alsoHeldBy: SelfPerson[];
  endsOn: string | null;
  note: string | null;
  seat: { assignmentId: number; label: string };
}

/** Somebody on the caller's team — a report or a peer — and the line that puts them there. */
export interface SelfTeamMember {
  key: string;
  assignmentId: number;
  person: SelfPerson;
  departmentName: string | null;
  shift: { code: string; name: string } | null;
  relationshipType: { code: string; name: string; isFormal: boolean };
  lineStyle: LineStyle;
  isPrimary: boolean;
  origin: ReportingOrigin;
  scope: Omit<SelfScope, 'sentence'>;
  /** Peers only: whose manager they share. */
  sharedManager?: string | null;
}

export interface SelfResponsibilityItem {
  key: string;
  name: string;
  description: string | null;
  responsibilityClass: string | null;
  origin: 'ROLE' | 'POSITION' | 'ASSIGNMENT';
  /** True when this line belongs to this seat rather than to the role everywhere. */
  isSpecificToThisSeat: boolean;
  notes: string | null;
}

export interface SelfMeasure {
  key: string;
  name: string;
  targetText: string | null;
  frequency: string | null;
  origin: 'ROLE' | 'POSITION' | 'ASSIGNMENT';
}

export interface SelfResponsibilityArea {
  key: string;
  name: string;
  description: string | null;
  weightPercent: number | null;
  origin: 'ROLE' | 'POSITION' | 'ASSIGNMENT';
  responsibilities: SelfResponsibilityItem[];
  measures: SelfMeasure[];
}

export interface SelfResponsibilities {
  asOf: string;
  rolePurpose: string | null;
  areas: SelfResponsibilityArea[];
  /** Responsibilities and measures that sit under no area. NEVER dropped. */
  additional: { responsibilities: SelfResponsibilityItem[]; measures: SelfMeasure[] };
  counts: { areas: number; responsibilities: number; measures: number };
  /**
   * True when nothing has been written down yet — a fact about the DATA, not
   * about the person. The screen must say so rather than show an empty list,
   * because "nobody has written your responsibilities yet" and "you have no
   * responsibilities" are different sentences and the second one is insulting.
   */
  emptyBecauseUnwritten: boolean;
  skills: { name: string; text: string | null }[];
  authorities: { name: string; text: string | null }[];
}

/** One of the caller's jobs. A person may hold several at once (plan §2). */
export interface SelfSeat {
  assignmentId: number;
  label: string;
  roleTitle: string | null;
  positionCode: string | null;
  positionTitle: string | null;
  allocationPercent: number | null;
  isPrimary: boolean;
  status: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  departmentName: string | null;
  locationName: string | null;
  shift: {
    code: string;
    name: string;
    startTime: string | null;
    endTime: string | null;
    crossesMidnight: boolean;
  } | null;
  workContexts: { id: number; name: string; contextType: string; isPrimary: boolean }[];
  reportsTo: SelfReportingLine[];
  /** Null when the role's content could not be resolved — said, not swallowed. */
  responsibilities: SelfResponsibilities | null;
  hasNoManager: boolean;
}

export interface SelfMe {
  employeeId: number;
  employeeCode: string;
  fullName: string;
  gender: string | null;
  dateOfJoining: string | null;
  employmentType: string;
  employmentStatus: string;
  exitDate: string | null;
  contractorName: string | null;
  hasPhoto: boolean;
  departmentName: string | null;
  locationName: string | null;
  /** The caller's own details. Always present — it is their own data. */
  contact: SelfContact;
}

export interface MyPlace {
  asOf: string;
  /**
   * False when the login is not attached to an employee record. Not an error:
   * most logins on this platform are administrators who were never imported as
   * people, and they get a sentence rather than a red panel.
   */
  linked: boolean;
  reason?: string;
  me: SelfMe | null;
  seats: SelfSeat[];
  /** Every manager across every seat. The resolved SET, never one manager. */
  reportsTo: SelfReportingLine[];
  reports: SelfTeamMember[];
  peers: SelfTeamMember[];
  summary?: {
    seatCount: number;
    managerCount: number;
    scopedManagerCount: number;
    dottedManagerCount: number;
    vacantManagerSeats: number;
    reportCount: number;
    peerCount: number;
    responsibilityCount: number;
  };
  pii: { included: boolean; note: string | null };
}

/** The signed-in person's own place. The only call this screen makes. */
export const getMyPlace = (on?: string) =>
  api.get<MyPlace>(`/user/me/place${on ? `?on=${encodeURIComponent(on)}` : ''}`);

/** The one tag the self view is gated on. Exported so nav and routes agree with the backend. */
export const SELF_VIEW = 'cf_hrms_self_view';

/* ── My slice of the org chart (GET /user/me/orgchart, 2026-10-09) ──────────
 *
 * The same rule as above: no id goes up. The server computes the slice —
 * managers up to the top, the caller's seats, their branch below, their
 * dotted-line managers — from the caller's own seats and sends only that, with
 * a field whitelist. The employee chart must never call `/orgchart`, the
 * position card or any other HR endpoint; this function is its only data. */

/** Why a seat is in the caller's slice. */
export type SliceRelation = 'SELF' | 'MANAGER' | 'REPORT' | 'DOTTED_MANAGER';

export interface SliceOccupant {
  name: string;
  shiftCode: string | null;
  /** This occupant is the signed-in person. */
  isMe: boolean;
}

export interface SliceNode {
  id: number;
  positionCode: string | null;
  title: string;
  displayTitle: string;
  roleTitle: string | null;
  departmentName: string | null;
  /** Org structure for the process grouping (spec §15) — the heading seat's code and the unit's tree rank. */
  departmentCode: string | null;
  departmentRank: number | null;
  departmentIsRoot: boolean;
  locationName: string | null;
  shiftPattern: 'G' | 'D' | 'N' | 'DN';
  defaultShift: { code: string | null; name: string | null } | null;
  sanctionedHeadcount: number;
  effectiveSanctioned: number;
  requirements: { shiftCode: string | null; shiftName: string | null; requiredCount: number }[];
  contexts: { name: string; contextType: string | null; isPrimary: boolean }[];
  occupants: SliceOccupant[];
  relation: SliceRelation;
}

export interface SliceEdge {
  /** The subordinate seat. */
  fromPositionId: number;
  /** The manager seat. */
  toPositionId: number;
  typeCode: string;
  typeName: string;
  isFormal: boolean;
  isPrimary: boolean;
  scopeType: string;
  scopeLabel: string | null;
  scopeWorkContextName: string | null;
  scopeSentence: string | null;
}

export interface MyOrgChart {
  asOf: string;
  linked: boolean;
  reason: string | null;
  nodes: SliceNode[];
  edges: SliceEdge[];
  /** The seats the caller holds — the boxes to highlight and centre on. */
  mySeatIds: number[];
  counts: { positions: number; managers: number; reports: number; dotted: number };
}

/** The signed-in person's slice of the org chart. The only call the employee chart makes. */
export const getMyOrgChart = (on?: string) =>
  api.get<MyOrgChart>(`/user/me/orgchart${on ? `?on=${encodeURIComponent(on)}` : ''}`);
