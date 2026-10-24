/**
 * Each kind's colour on the org chart (CF_HRMS_HIRING_SPEC.md §34.1).
 *
 * The kinds (labels) carry a `colour` key; `kindColour()` in labels.ts is the
 * one place a key becomes colours. The chart holds RESOLVED colours, not CSS
 * variables, because the same drawing is exported to a PNG / PDF that has no
 * stylesheet — so the plain hex of the current theme is taken. A kind with no
 * colour (an older server, an unknown key) is left out: its box is drawn as
 * it always was.
 */
import { kindColour } from './labels';
import type { DepartmentLabel } from '../api/organisation';

export interface ChartKindColour {
  fill: string;
  edge: string;
  text: string;
}

/** label id → its colours, for the kinds that have one. Null when none has. */
export function kindColours(labels: DepartmentLabel[], mode: 'light' | 'dark'): Map<number, ChartKindColour> | null {
  const out = new Map<number, ChartKindColour>();
  for (const l of labels) {
    const c = kindColour(l);
    if (c) out.set(l.id, mode === 'dark' ? c.dark : c.light);
  }
  return out.size ? out : null;
}
