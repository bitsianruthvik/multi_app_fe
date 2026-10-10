/**
 * A job's content — its KRAs, with the responsibilities and KPIs under each —
 * as the ONE shape `components/JobContent.tsx` draws, wherever it is drawn: the
 * org chart panel, a role, a position, the Departments screen and My place.
 *
 * Backend: `services/jobContentService.js`, which reads `contentResolver`
 * (Role -> Position overlay -> Assignment overlay) and never re-derives it. Two
 * screens already hold the same content in an older shape — the role editor
 * (`RoleContent`) and My place (`SelfResponsibilities`) — so this file also
 * adapts those, rather than making either screen ask the server twice.
 *
 * THE MARK. A line's `mark` is its whole provenance:
 *   null      the role says it, and the seat does it as written
 *   ADDED     specific to this seat
 *   CHANGED   the role says something else; `was` holds what
 *   OFF       the role says it and this seat does not do it
 */
import { api } from './client';
import { pretty, targetText, type ContentRow, type KraGroup, type RoleContent } from './roles';
import type { SelfResponsibilities } from './self';

export type JobLineKind = 'RESPONSIBILITY' | 'KPI';
export type JobMark = 'ADDED' | 'CHANGED' | 'OFF' | null;

export interface JobLine {
  key: string;
  kind: JobLineKind;
  definitionId: number | null;
  name: string;
  /** Only when it says more than the name does. */
  description: string | null;
  /** A KPI's target and frequency, or a responsibility's class. */
  detail: string | null;
  mark: JobMark;
  /** For CHANGED: what the role says. */
  was: string | null;
  reason: string | null;
  /** The seat's own rows behind the mark. */
  overrideIds: number[];
  /** The role's assignment row — what the role editor edits. Null for a seat's own line. */
  roleRowId: number | null;
  parentKraDefinitionId: number | null;
  note: string | null;
  // KPI
  targetText?: string | null;
  targetOperator?: string | null;
  targetValue?: number | string | boolean | { min: number; max: number } | null;
  measurementType?: string | null;
  unit?: string | null;
  frequency?: string | null;
}

export interface JobKra {
  key: string;
  definitionId: number | null;
  /** The role's own KRA row — rename, delete and "move a line here" address it. */
  roleRowId: number | null;
  name: string;
  description: string | null;
  weightPercent: number | null;
  mark: JobMark;
  responsibilities: JobLine[];
  kpis: JobLine[];
}

export interface JobContentData {
  asOf?: string;
  subject: 'ROLE' | 'SEAT';
  roleId?: number | null;
  roleTitle?: string | null;
  positionId?: number | null;
  positionTitle?: string | null;
  positionCode?: string | null;
  /** A seat only: how many OTHER seats hold the same role. */
  otherSeatsOnRole?: number;
  kras: JobKra[];
  ungrouped: { responsibilities: JobLine[]; kpis: JobLine[] };
  counts: {
    kras: number;
    responsibilities: number;
    kpis: number;
    ungrouped: number;
    added: number;
    changed: number;
    off: number;
  };
  /** Seat rows that touch a KRA — older than the "KRAs are fixed at the role" rule. */
  kraExceptions?: { overrideId: number; action: string; name: string | null; reason: string | null }[];
  /** Seat rows that changed nothing, each with the reason. */
  ignored?: { overrideId: number; name: string | null; why: string }[];
}

/** `{ operator?, value }` — a KPI target as a person types it. */
export interface TargetInput {
  operator?: string;
  value: string | number | { min: number; max: number } | null;
}

const on = (date?: string) => (date ? `?on=${date}` : '');

export const jobContentApi = {
  forRole: (roleId: number, date?: string) => api.get<JobContentData>(`/roles/${roleId}/job-content${on(date)}`),
  forPosition: (positionId: number, date?: string) =>
    api.get<JobContentData>(`/positions/${positionId}/job-content${on(date)}`),

  // Seat edits. Each answers with the seat's job content after the edit.
  seatAdd: (
    positionId: number,
    body: { kind: JobLineKind; text: string; parentKraDefinitionId?: number | null; target?: TargetInput | null; reason?: string },
  ) => api.post<JobContentData>(`/positions/${positionId}/job-content/add`, body),
  seatChange: (
    positionId: number,
    body: { kind: JobLineKind; definitionId: number; text?: string; target?: TargetInput | null; reason?: string },
  ) => api.post<JobContentData>(`/positions/${positionId}/job-content/change`, body),
  seatSwitchOff: (positionId: number, body: { kind: JobLineKind; definitionId: number; reason?: string }) =>
    api.post<JobContentData>(`/positions/${positionId}/job-content/switch-off`, body),
  seatUndo: (positionId: number, body: { kind: JobLineKind; definitionId: number }) =>
    api.post<JobContentData>(`/positions/${positionId}/job-content/undo`, body),

  // Role edits — the KRAs themselves.
  createKra: (roleId: number, body: { name: string; description?: string }) =>
    api.post<ContentRow>(`/roles/${roleId}/kras`, body),
  renameKra: (roleKraAssignmentId: number, body: { name?: string; description?: string }) =>
    api.put<{ ok: boolean; forked: boolean; sharedWithRoles: number }>(`/role-kras/${roleKraAssignmentId}`, body),
  deleteKra: (roleKraAssignmentId: number) =>
    api.del<{ ok: boolean; name: string; ungrouped: number }>(`/role-kras/${roleKraAssignmentId}`),
  /** Several lines under one KRA (or out of every KRA) in one write. */
  moveLines: (
    roleId: number,
    body: { roleKraAssignmentId: number | null; responsibilities?: number[]; kpis?: number[] },
  ) => api.put<{ ok: boolean; moved: number }>(`/roles/${roleId}/content-group`, body),
};

/* ── Department staffing ─────────────────────────────────────────────────── */

export interface StaffingPosition {
  positionId: number;
  positionCode: string | null;
  title: string;
  status: string;
  shiftPattern: string;
  seats: number;
  filled: number;
  vacant: number;
  overFilled: boolean;
  occupants: { employeeId: number; name: string; employeeCode: string | null }[];
  /** This seat reads differently from its role. */
  hasSeatChanges: boolean;
}

export interface StaffingRole {
  roleId: number | null;
  roleTitle: string;
  roleCode: string | null;
  seats: number;
  filled: number;
  vacant: number;
  positions: StaffingPosition[];
}

export interface DepartmentStaffing {
  departmentId: number | null;
  roles: StaffingRole[];
  counts: { roles: number; positions: number; seats: number; filled: number; vacant: number };
}

export interface StaffingResult {
  asOf: string;
  departments: DepartmentStaffing[];
  /** The org chart's own totals. */
  counts: { positions: number; seats: number; filled: number; vacant: number };
}

/** Every department's roles and positions, in one answer. */
export const getDepartmentStaffing = (date?: string) =>
  api.get<StaffingResult>(`/organisation/departments/staffing${on(date)}`);

/* ── Adapters: content two screens already hold ──────────────────────────── */

/**
 * A definition's name is 250 characters, so a long duty is stored with its name
 * cut short ("…") and the whole sentence in the description. That is one
 * sentence on screen — the whole one. (Same rule as the backend's `wordingOf`.)
 */
function wording(name: string, description: string | null | undefined): { name: string; description: string | null } {
  const n = name.trim();
  const d = (description ?? '').trim();
  if (!d || d.toLowerCase() === n.toLowerCase()) return { name, description: null };
  const cut = /(\.\.\.|\u2026)$/.test(n);
  const stem = n.replace(/(\.\.\.|\u2026)$/, '').trim().toLowerCase();
  if (cut && stem && d.toLowerCase().startsWith(stem)) return { name: d, description: null };
  return { name, description: d };
}

/** A line's dates, only when they say something: it ends, or it has not started. */
function datesText(row: ContentRow): string | null {
  const today = new Date().toISOString().slice(0, 10);
  const starts = row.effectiveFrom && row.effectiveFrom > today ? `starts ${row.effectiveFrom}` : null;
  const ends = row.effectiveTo ? `until ${row.effectiveTo}` : null;
  return [starts, ends].filter(Boolean).join(', ') || null;
}

/** "Target: 95%" for a target written as a sentence; "Target: ≥ 95 %" for a measured one. */
function targetPhrase(row: ContentRow): string {
  const sentence = row.targetOperator === 'EQ' && typeof row.targetValue === 'string' && row.targetValue.trim() !== '';
  const t = sentence ? String(row.targetValue) : targetText(row);
  return t === '—' ? 'No target set' : `Target: ${t}`;
}

function countsOf(kras: JobKra[], ungrouped: JobContentData['ungrouped']): JobContentData['counts'] {
  const all = [...kras.flatMap((k) => [...k.responsibilities, ...k.kpis]), ...ungrouped.responsibilities, ...ungrouped.kpis];
  const live = all.filter((l) => l.mark !== 'OFF');
  return {
    kras: kras.length,
    responsibilities: live.filter((l) => l.kind === 'RESPONSIBILITY').length,
    kpis: live.filter((l) => l.kind === 'KPI').length,
    ungrouped: ungrouped.responsibilities.length + ungrouped.kpis.length,
    added: all.filter((l) => l.mark === 'ADDED').length,
    changed: all.filter((l) => l.mark === 'CHANGED').length,
    off: all.filter((l) => l.mark === 'OFF').length,
  };
}

function roleLine(kind: JobLineKind, row: ContentRow, parent: KraGroup | null): JobLine {
  const { name, description } = wording(row.definition?.name ?? '—', row.definition?.description);
  const dates = datesText(row);
  const bits =
    kind === 'KPI'
      ? [
          targetPhrase(row),
          row.frequency ? pretty(row.frequency) : null,
          row.weightPercent != null ? `weight ${row.weightPercent}%` : null,
        ]
      : [
          row.responsibilityClass && row.responsibilityClass !== 'GENERIC' ? pretty(row.responsibilityClass) : null,
          row.isMandatory === false ? 'Optional' : null,
        ];
  return {
    key: `${kind}:${row.id}`,
    kind,
    definitionId: row.definitionId,
    name,
    description,
    detail: [...bits, dates].filter(Boolean).join(' · ') || null,
    mark: null,
    was: null,
    reason: null,
    overrideIds: [],
    roleRowId: row.id,
    parentKraDefinitionId: parent?.definitionId ?? null,
    note: null,
  };
}

/** The role editor's own read (`GET /roles/:id/content`) as job content. */
export function fromRoleContent(content: RoleContent): JobContentData {
  const kras: JobKra[] = content.kras.map((k) => ({
    key: `KRA:${k.id}`,
    definitionId: k.definitionId,
    roleRowId: k.id,
    name: k.definition?.name ?? '—',
    description: k.definition?.description ?? null,
    weightPercent: k.weightPercent ?? null,
    mark: null,
    responsibilities: k.responsibilities.map((r) => roleLine('RESPONSIBILITY', r, k)),
    kpis: k.kpis.map((r) => roleLine('KPI', r, k)),
  }));
  const ungrouped = {
    responsibilities: content.additional.responsibilities.map((r) => roleLine('RESPONSIBILITY', r, null)),
    kpis: content.additional.kpis.map((r) => roleLine('KPI', r, null)),
  };
  return {
    asOf: content.on,
    subject: 'ROLE',
    roleId: content.role.id,
    roleTitle: content.role.title,
    kras,
    ungrouped,
    counts: countsOf(kras, ungrouped),
  };
}

/**
 * One of the signed-in person's own jobs (`GET /user/me/place`) as job content.
 * Nothing is fetched: the payload already carries the KRA grouping. An employee
 * is not shown what was switched off for their seat — it is not their work.
 */
export function fromSelfResponsibilities(r: SelfResponsibilities): JobContentData {
  const markOf = (i: { origin: string; isChangedForThisSeat?: boolean }): JobMark =>
    i.origin !== 'ROLE' ? 'ADDED' : i.isChangedForThisSeat ? 'CHANGED' : null;
  const base = { was: null, reason: null, overrideIds: [], roleRowId: null, parentKraDefinitionId: null, definitionId: null };
  const resp = (i: SelfResponsibilities['additional']['responsibilities'][number]): JobLine => ({
    ...base,
    key: i.key,
    kind: 'RESPONSIBILITY',
    ...wording(i.name, i.description),
    detail: i.responsibilityClass && i.responsibilityClass !== 'GENERIC' ? pretty(i.responsibilityClass) : null,
    mark: markOf(i),
    note: i.notes,
  });
  const kpi = (i: SelfResponsibilities['additional']['measures'][number]): JobLine => ({
    ...base,
    key: i.key,
    kind: 'KPI',
    name: i.name,
    description: null,
    detail: [i.targetText, i.frequency ? pretty(i.frequency) : null].filter(Boolean).join(' · ') || null,
    mark: markOf(i),
    note: null,
    targetText: i.targetText,
  });
  const kras: JobKra[] = r.areas.map((a) => ({
    key: a.key,
    definitionId: null,
    roleRowId: null,
    name: a.name,
    description: a.description,
    weightPercent: a.weightPercent,
    mark: null,
    responsibilities: a.responsibilities.map(resp),
    kpis: a.measures.map(kpi),
  }));
  const ungrouped = {
    responsibilities: r.additional.responsibilities.map(resp),
    kpis: r.additional.measures.map(kpi),
  };
  return { asOf: r.asOf, subject: 'SEAT', kras, ungrouped, counts: countsOf(kras, ungrouped) };
}
