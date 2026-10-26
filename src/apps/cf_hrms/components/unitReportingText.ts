/**
 * Words for positions and a unit's reporting (CF_HRMS_HIRING_SPEC.md §40), shared by
 * the unit reporting editor, the reporting check and the Org units rows.
 */
import type { PosRef } from '../api/organisation';
import type { ResolvedRelationship } from '../api/assignments';

/** "Incharge – Printing (P042)" */
export const posTitle = (p: Pick<PosRef, 'title' | 'code'>): string => `${p.title}${p.code ? ` (${p.code})` : ''}`;
/** "Ravi Kumar · Day" / "Vacant" */
export const posWho = (p: Pick<PosRef, 'occupantName' | 'shiftCode'>): string =>
  `${p.occupantName ?? 'Vacant'}${p.shiftCode ? ` · ${p.shiftCode}` : ''}`;
/** "Incharge – Printing (P042), Ravi Kumar" for one line of text. */
export const posLine = (p: PosRef): string => `${posTitle(p)} — ${p.occupantName ?? 'vacant'}`;

/** "Head: Incharge – Printing · Reports into: Production Manager" — the compact line on an Org units row. */
export function unitReportingLine(row: {
  heads?: { title: string; shiftCode: string | null; occupantName: string | null }[];
  reportsInto?: { mode: string; effective: PosRef | null } | null;
}): string | null {
  if (!row.heads && !row.reportsInto) return null;
  const heads = row.heads ?? [];
  const head = heads.length
    ? heads.length === 1 && !heads[0].shiftCode
      ? heads[0].title
      : heads.map((h) => `${h.title}${h.shiftCode ? ` (${h.shiftCode})` : ''}`).join(', ')
    : 'no head';
  const into = row.reportsInto?.effective ? row.reportsInto.effective.title : 'nobody';
  return `Head: ${head} · Reports into: ${into}${row.reportsInto?.mode === 'CHOSEN' ? ' (chosen)' : ''}`;
}


/** A derived row's second chip (spec §40.3): which part of the org unit it follows. */
export function derivedFromText(row: Pick<ResolvedRelationship, 'source' | 'unit'>): string | null {
  const unit = row.unit?.name;
  if (!unit) return null;
  if (row.source === 'UNIT_HEAD') return `Head of ${unit}`;
  if (row.source === 'REPORTS_INTO') return `${unit}’s Reports into`;
  return null;
}
