/**
 * Generated documents — the Role JD and the Employee Responsibility Profile.
 * (Backend: apps/cf_hrms/routes/documents.js, services/contentResolver.js and
 * services/documentService.js. Contract: TM/CF_HRMS_PLAN.md §17.)
 *
 * THE ONE THING THIS MODULE'S SHAPE ENFORCES: every resolved row carries an
 * `origin`, and `suppressed` is a list, not an absence. Role content is overlaid
 * by the Position and then by the Work Assignment (plan §2 rule 6), and a JD
 * that renders the result as one flat list has thrown the model away — the
 * reader can no longer tell "this is what the role does everywhere" from "this
 * is what this seat does" or "this is what we asked this person to do". So
 * `origin` is required on `ResolvedItem`, not optional: a row that forgets it
 * fails to type-check here rather than rendering as though it came from the role.
 *
 * A SNAPSHOT IS NOT A VIEW OF TODAY. `documentsApi.get` returns the frozen
 * `snapshot_json` written when the document was generated; it is never
 * re-resolved. That is plan §2 rule 7 — "what did this role say in March" has to
 * stay answerable after the role changed in April. So the record screen reads
 * that call and nothing else, and `preview` exists for the one case that is
 * legitimately about today: a draft nobody has committed.
 *
 * WHY SO MUCH OF THIS IS OPTIONAL. Two reasons, and neither is laziness.
 * First, the resolver merges nine content kinds into one row shape (§17.1's
 * `Item`), so any given row carries only the fields its kind uses. Second, a
 * snapshot is frozen FOREVER: a document generated under `snapshotVersion: 1`
 * will still be opened after the shape has moved on, and a screen that requires
 * a field added later cannot render its own history. Optional here means "an old
 * document may not have this", and every renderer has to cope.
 *
 * THE SNAPSHOT CARRIES ITS OWN SENTENCES. `sections[]` gives each heading a
 * `state` and, when empty, the exact `note` that was printed — plan §17.5. The
 * screen renders those words rather than inventing its own, so the page and the
 * DOCX never disagree about what "not recorded" means. Never substitute a
 * prettier phrasing here; it would silently diverge from the file HR posted.
 */
import { api } from './client';
import { getApiBaseUrl } from '@core/api/client';
import type { AssignmentContextRow, ReportingSummary, ResolvedRelationship } from './assignments';
import type { PositionContextRow, PositionRow } from './positions';
import type { Role } from './roles';

export type DocumentType = 'ROLE_JD' | 'EMPLOYEE_RESPONSIBILITY_PROFILE';

/** Which layer of the model a row came from (plan §2 rule 6, §17.1). */
export type Origin = 'ROLE' | 'POSITION' | 'ASSIGNMENT';

export interface AuthorityLimit {
  amount?: number | null;
  currency?: string | null;
  scope?: string | null;
  condition?: string | null;
}

/** What an overlay changed on a row the role already had. */
export interface ItemChange {
  field: string;
  from: unknown;
  to: unknown;
  byLayer: Origin;
  byOverrideId?: number | null;
  reason?: string | null;
}

/**
 * One resolved row of content, whatever kind it is. `origin` and `name` are the
 * only two things every kind has — everything else is per-kind and absent when
 * it does not apply.
 */
export interface ResolvedItem {
  key?: string;
  kind?: 'KRA' | 'RESPONSIBILITY' | 'KPI' | string;
  definitionId?: number | null;
  name: string;
  code?: string | null;
  description?: string | null;

  /** Which layer produced this row. Required: see the module note. */
  origin: Origin;
  /** True when a later layer changed a row the role already had. */
  overridden?: boolean;
  /** What it changed, field by field. Rendered so an exception is auditable. */
  changes?: ItemChange[];
  reason?: string | null;

  sequence?: number | null;
  notes?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  isMandatory?: boolean | null;
  parentKraDefinitionId?: number | null;

  /**
   * The server's own one-line rendering of this row — the same words the DOCX
   * prints. Preferred over anything composed here, for the reason in the module
   * note: two renderings of one row eventually disagree.
   */
  text?: string | null;

  // KRA / KPI
  weightPercent?: number | null;

  // Responsibility
  responsibilityClass?: string | null;

  // KPI
  measurementType?: string | null;
  unit?: string | null;
  direction?: string | null;
  targetOperator?: string | null;
  targetValue?: number | string | boolean | { min: number; max: number } | null;
  targetText?: string | null;
  frequency?: string | null;
  formulaText?: string | null;
  dataSource?: string | null;

  // Skill / qualification / experience
  requirementLevel?: string | null;
  proficiencyLevel?: string | null;
  skillType?: string | null;
  qualificationType?: string | null;
  minYears?: number | null;
  preferredYears?: number | null;
  experienceArea?: string | null;

  // Authority
  authorityType?: string | null;
  limit?: AuthorityLimit | null;
  limitJson?: AuthorityLimit | null;

  // Expected relationship
  relationshipScope?: string | null;
  counterparty?: string | null;
  purpose?: string | null;

  // Working condition
  conditionType?: string | null;

  /** For an auditor reading the snapshot in two years: which row said this. */
  sourceTable?: string | null;
  sourceRowId?: number | null;
}

/** A KRA with its responsibilities and KPIs nested under it (§17.1). */
export interface ResolvedKra extends ResolvedItem {
  responsibilities: ResolvedItem[];
  kpis: ResolvedItem[];
}

/**
 * Something the role says that this position or person does NOT do.
 *
 * Returned, never silently absent. An HR person reading a JD for a seat needs to
 * know the difference between "the role never mentioned this" and "the role says
 * this and we took it off this seat" — and a document that hides the second one
 * reads exactly like the role, which is the failure §17.1 names.
 */
export interface SuppressedItem {
  kind: 'KRA' | 'RESPONSIBILITY' | 'KPI' | string;
  definitionId?: number | null;
  name: string;
  code?: string | null;
  /** The layer that removed it. */
  byLayer: Origin;
  byOverrideId?: number | null;
  reason?: string | null;
  origin?: Origin;
  /**
   * Children that were orphaned when a KRA was suppressed. They move to
   * `additional` rather than vanishing with their heading, and saying how many
   * is how a reader finds them.
   */
  movedChildren?: number;
}

/** An overlay row that changed nothing, and why. */
export interface IgnoredOverride {
  layer: Origin;
  overrideId?: number | null;
  action: 'ADD' | 'OVERRIDE' | 'SUPPRESS' | string;
  contentType?: string | null;
  definitionId?: number | null;
  name?: string | null;
  why: string;
}

/** The resolver's output — plan §17.1. */
export interface ResolvedContent {
  asOf?: string;
  /** Which layers were applied: one entry for a bare role, three for an assignment. */
  layers?: Origin[];
  target?: {
    roleId?: number | null;
    roleCode?: string | null;
    roleTitle?: string | null;
    positionId?: number | null;
    workAssignmentId?: number | null;
    employeeId?: number | null;
    employeeCode?: string | null;
    employeeName?: string | null;
  };
  role?: Role;

  kras: ResolvedKra[];
  /** Ungrouped responsibilities and KPIs. Shown under "Additional", never dropped. */
  additional: { responsibilities: ResolvedItem[]; kpis: ResolvedItem[] };
  suppressed: SuppressedItem[];

  skills: ResolvedItem[];
  qualifications: ResolvedItem[];
  experience: ResolvedItem[];
  authorities: ResolvedItem[];
  relationships: ResolvedItem[];
  conditions: ResolvedItem[];

  overlay?: {
    position?: unknown[];
    assignment?: unknown[];
    appliedLayers?: Origin[];
    added?: number;
    suppressedCount?: number;
    overriddenCount?: number;
    /** Exceptions that did nothing. An exception nobody notices is the worst kind. */
    ignored?: IgnoredOverride[];
  };
  counts?: Record<string, number>;
  weights?: { kraTotal?: number; kpiTotal?: number; kraWeighted?: number; kpiWeighted?: number };
}

/**
 * One heading, with whether it has anything under it and the sentence printed
 * when it does not (plan §17.5). Authored on the server so the screen and the
 * DOCX say the same thing.
 */
export interface DocumentSection {
  key: string;
  heading: string;
  subtitle?: string | null;
  count: number;
  state: 'EMPTY' | 'PRESENT';
  /** The exact words for an empty section. `null` means genuinely nothing to report. */
  note?: string | null;
}

/**
 * An empty `ResolvedContent`, for a snapshot that predates a field. A missing
 * section must still render its heading and its reason — reading it as "no
 * content at all" is how a document quietly claims a role has no requirements.
 */
export const EMPTY_CONTENT: ResolvedContent = {
  kras: [],
  additional: { responsibilities: [], kpis: [] },
  suppressed: [],
  skills: [],
  qualifications: [],
  experience: [],
  authorities: [],
  relationships: [],
  conditions: [],
};

/** Fills the gaps in whatever the server sent, without inventing rows. */
export function normaliseContent(c: Partial<ResolvedContent> | null | undefined): ResolvedContent {
  return {
    ...EMPTY_CONTENT,
    ...(c ?? {}),
    kras: (c?.kras ?? []).map((k) => ({
      ...k,
      responsibilities: k.responsibilities ?? [],
      kpis: k.kpis ?? [],
    })),
    additional: {
      responsibilities: c?.additional?.responsibilities ?? [],
      kpis: c?.additional?.kpis ?? [],
    },
    suppressed: c?.suppressed ?? [],
    skills: c?.skills ?? [],
    qualifications: c?.qualifications ?? [],
    experience: c?.experience ?? [],
    authorities: c?.authorities ?? [],
    relationships: c?.relationships ?? [],
    conditions: c?.conditions ?? [],
  };
}

/** Sections by key, with a tolerant lookup for a snapshot that has none. */
export function sectionMap(sections: DocumentSection[] | null | undefined) {
  const byKey = new Map((sections ?? []).map((s) => [s.key, s]));
  return (key: string): DocumentSection | undefined => byKey.get(key);
}

// ---------------------------------------------------------------------------
// The blocks a snapshot is built from
// ---------------------------------------------------------------------------

/**
 * One manager of one assignment, with the scope of their authority.
 *
 * `Partial<ResolvedRelationship>` on purpose, and single-sourced from
 * api/assignments.ts rather than re-declared: it is the same fact, so it is the
 * same type — and `Partial` because a frozen snapshot may predate a field.
 *
 * There is no `managerId` and never a single manager. A person can hold a line
 * manager, a functional manager and a dotted line at once (plan §2 rule 9), and
 * the profile prints the whole set.
 */
export type DocumentManagerRow = Partial<ResolvedRelationship>;

/** The optional position context on a Role JD (§17.3). */
export interface DocumentPositionContext {
  position: PositionRow;
  workContexts?: PositionContextRow[];
  /** The FORMAL line — seat to seat. Kept apart from a person's actual managers. */
  formalReporting?: {
    relationships?: DocumentManagerRow[];
    summary?: Partial<ReportingSummary>;
  };
  /** This seat's overlay rows, live and not. */
  overrides?: unknown[];
}

export interface DocumentEmployeeBlock {
  id: number;
  employeeCode?: string | null;
  fullName: string;
  dateOfJoining?: string | null;
  dateOfJoiningText?: string | null;
  employmentType?: string | null;
  employmentStatus?: string | null;
  exitDate?: string | null;
  contractorName?: string | null;
}

/** One work assignment inside an Employee Responsibility Profile (§17.3). */
export interface ProfileAssignmentBlock {
  assignment: {
    id: number;
    roleId?: number | null;
    roleCode?: string | null;
    roleTitle?: string | null;
    positionId?: number | null;
    positionCode?: string | null;
    positionTitle?: string | null;
    assignmentTitle?: string | null;
    departmentName?: string | null;
    locationName?: string | null;
    shiftCode?: string | null;
    shiftName?: string | null;
    allocationPercent?: number | null;
    allocationText?: string | null;
    isPrimary?: boolean;
    status?: string | null;
    effectiveFrom?: string | null;
    effectiveTo?: string | null;
    effectiveFromText?: string | null;
    contexts?: AssignmentContextRow[];
  };
  /** The SET, with each manager's scope. Never one manager, never a bare id. */
  reporting?: {
    relationships?: DocumentManagerRow[];
    superseded?: DocumentManagerRow[];
    summary?: Partial<ReportingSummary>;
  };
  content?: Partial<ResolvedContent> | null;
  sections?: DocumentSection[];
}

/** An assignment left out of the profile, and why. Named rather than vanished. */
export interface ExcludedAssignment {
  id: number;
  roleTitle?: string | null;
  status?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  why: string;
}

/**
 * The frozen document. Exactly what was resolved at generate time, and what the
 * DOCX and the PDF were rendered from.
 */
export interface DocumentSnapshot {
  snapshotVersion?: number;
  templateVersion?: string | null;
  documentType: DocumentType;
  /** The date the content was resolved AS OF — not the date it was generated. */
  asOf?: string | null;
  asOfText?: string | null;
  generatedAt?: string | null;
  company?: { id?: number; name?: string | null };
  generatedBy?: { userId?: number | null; name?: string | null; email?: string | null };

  title?: string | null;
  subtitle?: string | null;
  fileBaseName?: string | null;
  /** Printed once, so the empty headings below read as a gap and not as a finding. */
  honestyNote?: string | null;

  sections?: DocumentSection[];

  // ROLE_JD
  role?: Role;
  positionContext?: DocumentPositionContext | null;
  content?: Partial<ResolvedContent> | null;

  // EMPLOYEE_RESPONSIBILITY_PROFILE
  employee?: DocumentEmployeeBlock;
  assignments?: ProfileAssignmentBlock[];
  excludedAssignments?: ExcludedAssignment[];

  summary?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// List + record
// ---------------------------------------------------------------------------

export interface DocumentFormat {
  available: boolean;
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
}

export interface DocumentRow {
  id: number;
  documentType: DocumentType;
  title?: string | null;
  subtitle?: string | null;
  asOf?: string | null;
  templateVersion?: string | null;
  /** What the document is ABOUT, resolved — a list row needs no joins of its own. */
  target: {
    kind: 'ROLE' | 'POSITION' | 'EMPLOYEE' | string;
    label?: string | null;
    roleId?: number | null;
    roleCode?: string | null;
    roleTitle?: string | null;
    positionId?: number | null;
    positionCode?: string | null;
    positionTitle?: string | null;
    employeeId?: number | null;
    employeeCode?: string | null;
    employeeName?: string | null;
  };
  generatedAt: string;
  generatedBy?: { userId?: number | null; name?: string | null; email?: string | null };
  /** The latest for this target. A superseded document is kept and still downloadable. */
  isCurrent: boolean;
  summary?: Record<string, unknown> | null;
  formats?: { docx?: DocumentFormat; pdf?: DocumentFormat };
}

export interface DocumentListResult {
  items: DocumentRow[];
  total?: number;
  limit?: number;
  totals?: { current?: number; roleJds?: number; profiles?: number };
  /**
   * Present while phase 7 is unfinished. A screen that reads it can say "not
   * switched on yet" instead of showing an empty list as though the company had
   * simply never generated anything.
   */
  implemented?: boolean;
}

export interface DocumentRecordResult {
  document: DocumentRow;
  /** The FROZEN content. Rendered as-is; never re-resolved. */
  snapshot: DocumentSnapshot;
  snapshotVersion?: number | null;
}

export interface GenerateRequest {
  type: DocumentType;
  roleId?: number;
  positionId?: number;
  employeeId?: number;
  /** As-of date. Every layer is filtered on it (§17.1). */
  on?: string;
}

export interface PreviewResult {
  persisted?: false;
  asOf?: string;
  documentType?: DocumentType;
  snapshot: DocumentSnapshot;
}

export interface GenerateResult {
  document?: DocumentRow;
  id?: number;
  snapshot?: DocumentSnapshot;
}

function qs(params: object): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || v === false) continue;
    sp.set(k, v === true ? '1' : String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const documentsApi = {
  list: (f: { type?: string; search?: string; currentOnly?: boolean; limit?: number } = {}) =>
    api.get<DocumentListResult>(`/documents${qs(f)}`),

  /** The stored snapshot. Never a re-resolve — see the module note. */
  get: (id: number) => api.get<DocumentRecordResult>(`/documents/${id}`),

  /**
   * Resolve WITHOUT persisting, for the draft on the generate screen. The same
   * snapshot `generate` would freeze, built by the same function, so one
   * renderer serves both and what you approve is what gets stored.
   */
  preview: (p: GenerateRequest) =>
    api.get<PreviewResult>(
      `/documents/preview${qs({
        type: p.type,
        roleId: p.roleId,
        positionId: p.positionId,
        employeeId: p.employeeId,
        on: p.on,
      })}`,
    ),

  generate: (body: GenerateRequest) => api.post<GenerateResult>('/documents/generate', body),
};

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

/**
 * A file transported as JSON, the way employee documents already travel
 * (api/people.ts `FileTransport`). Accepted here as well as raw bytes, because
 * which of the two the download route serves is the backend's call and a screen
 * that understands only one of them breaks on the other.
 */
interface FileTransport {
  fileName: string;
  mimeType: string;
  dataBase64: string;
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Freed on the next tick; revoking immediately can cancel the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Fetches the rendered file and hands it to the browser.
 *
 * WHY THIS DOES NOT GO THROUGH `api`/`apiFetch`. The platform client always ends
 * in `response.json()`, so it cannot carry bytes at all — a DOCX through it
 * arrives as a parse error. This is the one call in the app that needs the raw
 * response, so it builds the request itself from `getApiBaseUrl()` with the same
 * token and the same `credentials: 'include'` the client uses. The gap is real
 * and recorded: an `apiFetchBlob` in @core/api would delete this function.
 *
 * A plain <a href> would not do either — the route needs the Authorization
 * header and a link cannot send one.
 */
export async function downloadDocument(
  id: number,
  format: 'docx' | 'pdf',
  fallbackName = 'document',
): Promise<void> {
  const company = window.location.pathname.split('/').filter(Boolean)[0] ?? '';
  const url = `${getApiBaseUrl()}/api/${company}/cf_hrms/documents/${id}/download?format=${format}`;
  const token = localStorage.getItem('token');
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  });

  if (!res.ok) {
    let message = `That ${format.toUpperCase()} could not be downloaded.`;
    try {
      const body = JSON.parse(await res.text());
      if (body?.message) message = String(body.message);
    } catch {
      /* a non-JSON error body tells us nothing the status did not */
    }
    throw new Error(message);
  }

  const type = res.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    const file = (await res.json()) as FileTransport;
    const bytes = Uint8Array.from(atob(file.dataBase64), (ch) => ch.charCodeAt(0));
    saveBlob(new Blob([bytes], { type: file.mimeType }), file.fileName);
    return;
  }

  const disposition = res.headers.get('content-disposition') ?? '';
  const named = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  saveBlob(await res.blob(), named ? decodeURIComponent(named[1]) : `${fallbackName}.${format}`);
}

// ---------------------------------------------------------------------------
// Shared vocabulary. Both screens and the renderer read these, so a document
// never describes itself one way in a list and another way on its own page.
// ---------------------------------------------------------------------------

export const DOCUMENT_TYPES: { value: DocumentType; label: string; short: string }[] = [
  { value: 'ROLE_JD', label: 'Role job description', short: 'Role JD' },
  {
    value: 'EMPLOYEE_RESPONSIBILITY_PROFILE',
    label: 'Employee responsibility profile',
    short: 'Responsibility profile',
  },
];

export const documentTypeLabel = (t: DocumentType | string): string =>
  DOCUMENT_TYPES.find((d) => d.value === t)?.label ?? String(t);

export const documentTypeShort = (t: DocumentType | string): string =>
  DOCUMENT_TYPES.find((d) => d.value === t)?.short ?? String(t);

/** What the document is ABOUT, as one line. A position-specific JD says so. */
export function documentTargetLabel(row: DocumentRow): string {
  const t = row.target ?? { kind: 'ROLE' };
  if (t.kind === 'EMPLOYEE') {
    return t.employeeName ?? t.label ?? t.employeeCode ?? 'Unnamed person';
  }
  const role = t.roleTitle ?? t.roleCode ?? 'Untitled role';
  const seat = t.positionCode ?? t.positionTitle;
  return seat ? `${role} — at ${seat}` : role;
}

/** The document's own title line, shared by the preview and the record header. */
export function documentHeadline(snapshot: DocumentSnapshot): string {
  if (snapshot.documentType === 'EMPLOYEE_RESPONSIBILITY_PROFILE') {
    return snapshot.employee?.fullName ?? snapshot.title ?? documentTypeLabel(snapshot.documentType);
  }
  const role = snapshot.role?.title ?? snapshot.role?.roleCode ?? null;
  if (!role) return snapshot.title ?? documentTypeLabel(snapshot.documentType);
  const seat = snapshot.positionContext?.position?.positionCode ?? snapshot.positionContext?.position?.displayTitle;
  return seat ? `${role} — at ${seat}` : role;
}

/** How the three layers are named to a reader. "ASSIGNMENT" means nothing to HR. */
export const ORIGIN_LABEL: Record<Origin, string> = {
  ROLE: 'From the role',
  POSITION: 'This position only',
  ASSIGNMENT: 'This person only',
};

export const ORIGIN_SHORT: Record<Origin, string> = {
  ROLE: 'Role',
  POSITION: 'Position',
  ASSIGNMENT: 'Person',
};

export const ORIGIN_HINT: Record<Origin, string> = {
  ROLE: 'Part of the role wherever it is held.',
  POSITION: 'Added by this position — it does not apply to the role everywhere.',
  ASSIGNMENT: 'Added for this person on this assignment only.',
};

/** Sentence case for the SHOUTING enums, with acronyms kept as acronyms. */
const ACRONYMS = new Set(['PPE', 'KPI', 'KRA', 'JD', 'HR', 'QC', 'IT', 'ERP', 'ESI', 'PF']);

export function pretty(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .split('_')
    .map((w, i) => {
      if (ACRONYMS.has(w.toUpperCase())) return w.toUpperCase();
      const lower = w.toLowerCase();
      return i === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    })
    .join(' ');
}

/** A KPI target as one readable phrase. Only used when the server sent none. */
export function targetText(row: ResolvedItem): string | null {
  if (row.targetText) return row.targetText;
  const unit = row.unit ? ` ${row.unit}` : '';
  const v = row.targetValue;
  switch (row.targetOperator) {
    case 'GTE':
      return `≥ ${v}${unit}`;
    case 'LTE':
      return `≤ ${v}${unit}`;
    case 'EQ':
      return `= ${v}${unit}`;
    case 'BETWEEN':
      return v && typeof v === 'object' ? `${v.min}–${v.max}${unit}` : null;
    case 'INFO':
      return 'Tracked, not judged';
    default:
      return null;
  }
}

/** An authority limit as one line: "₹50,000 · Plant consumables · within budget". */
export function limitText(limit: AuthorityLimit | null | undefined): string | null {
  if (!limit) return null;
  const parts: string[] = [];
  if (limit.amount !== undefined && limit.amount !== null) {
    parts.push(
      `${limit.currency ?? ''}${limit.currency ? ' ' : ''}${Number(limit.amount).toLocaleString()}`.trim(),
    );
  }
  if (limit.scope) parts.push(limit.scope);
  if (limit.condition) parts.push(limit.condition);
  return parts.length ? parts.join(' · ') : null;
}

/**
 * What one resolved row is CALLED.
 *
 * Six of the nine content kinds take a name from their master; three do not. An
 * experience row's headline is a span of years, a relationship's is the
 * counterparty, a working condition's is its own sentence. So this is not
 * `row.name ?? '—'` — an em dash where a line of the job description belongs
 * reads as missing data.
 */
export function itemHeadline(item: ResolvedItem): string {
  if (item.name) return item.name;
  if (item.minYears != null && item.preferredYears != null) {
    return `${item.minYears}–${item.preferredYears} years`;
  }
  if (item.minYears != null) return `${item.minYears}+ years`;
  if (item.preferredYears != null) return `${item.preferredYears} years preferred`;
  if (item.counterparty) return item.counterparty;
  if (item.description) return item.description;
  return '—';
}

/** What a manager row's relationship is called, whatever shape it arrived in. */
export function managerTypeLabel(m: DocumentManagerRow): string {
  return m.relationshipType?.name ?? 'Reports to';
}

/** The scope of a manager's authority, as a sentence. Never silently omitted. */
export function managerScopeText(m: DocumentManagerRow): string | null {
  if (m.scopeSentence) return m.scopeSentence;
  const s = m.scope;
  if (!s) return null;
  if (s.workContextName) return `For ${s.workContextName}`;
  if (s.label) return s.label;
  if (s.type && s.type !== 'ALL' && s.type !== 'GENERAL') return pretty(s.type);
  return null;
}

/**
 * How many rows a resolved document carries.
 *
 * Derived from the rows themselves rather than read from `content.counts`, so
 * the number in the header can never disagree with what is on the page — and so
 * it still works on a snapshot written before `counts` existed.
 */
export function contentCounts(c: ResolvedContent) {
  const responsibilities =
    c.kras.reduce((n, k) => n + k.responsibilities.length, 0) + c.additional.responsibilities.length;
  const kpis = c.kras.reduce((n, k) => n + k.kpis.length, 0) + c.additional.kpis.length;
  return {
    kras: c.kras.length,
    responsibilities,
    kpis,
    skills: c.skills.length,
    qualifications: c.qualifications.length,
    experience: c.experience.length,
    authorities: c.authorities.length,
    relationships: c.relationships.length,
    conditions: c.conditions.length,
    suppressed: c.suppressed.length,
    total:
      c.kras.length +
      responsibilities +
      kpis +
      c.skills.length +
      c.qualifications.length +
      c.experience.length +
      c.authorities.length +
      c.relationships.length +
      c.conditions.length,
  };
}

/** The same totals across every assignment on a responsibility profile. */
export function snapshotCounts(snapshot: DocumentSnapshot) {
  if (snapshot.documentType === 'EMPLOYEE_RESPONSIBILITY_PROFILE') {
    return (snapshot.assignments ?? []).reduce(
      (acc, a) => {
        const c = contentCounts(normaliseContent(a.content));
        return {
          total: acc.total + c.total,
          suppressed: acc.suppressed + c.suppressed,
          managers: acc.managers + (a.reporting?.relationships?.length ?? 0),
        };
      },
      { total: 0, suppressed: 0, managers: 0 },
    );
  }
  const c = contentCounts(normaliseContent(snapshot.content));
  return {
    total: c.total,
    suppressed: c.suppressed,
    managers: snapshot.positionContext?.formalReporting?.relationships?.length ?? 0,
  };
}
