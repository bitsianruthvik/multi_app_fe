/**
 * The unit reporting editor's state (CF_HRMS_HIRING_SPEC.md §40.2): read when `unitId`
 * is set, saved on demand. The fields are components/UnitReporting.tsx.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { orgApi, type UnitReporting, type UnitReportingBody } from '../api/organisation';

export type RiChoice = 'DEFAULT' | 'CHOSEN' | 'ELSEWHERE';

export interface Draft {
  perShift: boolean;
  head: number | null;
  shiftHeads: Record<number, number | null>;
  ri: RiChoice;
  riPosition: number | null;
  reason: string;
}

export function draftOf(data: UnitReporting): Draft {
  const above = new Set(data.candidates.reportsInto.flatMap((g) => g.positions.map((p) => p.positionId)));
  const shiftHeads: Record<number, number | null> = {};
  for (const h of data.heads) if (h.shiftId != null) shiftHeads[h.shiftId] = h.positionId;
  const ri = data.reportsInto;
  return {
    perShift: data.perShift,
    head: data.perShift ? null : (data.heads[0]?.positionId ?? null),
    shiftHeads,
    ri: ri.mode === 'DEFAULT' || ri.positionId == null ? 'DEFAULT' : above.has(ri.positionId) ? 'CHOSEN' : 'ELSEWHERE',
    riPosition: ri.mode === 'CHOSEN' ? ri.positionId : null,
    reason: ri.reason ?? '',
  };
}

function bodyOf(d: Draft): UnitReportingBody {
  const heads = d.perShift
    ? Object.entries(d.shiftHeads)
        .filter(([, p]) => p != null)
        .map(([s, p]) => ({ positionId: p as number, shiftId: Number(s) }))
        .sort((a, b) => a.shiftId - b.shiftId)
    : d.head != null
      ? [{ positionId: d.head, shiftId: null }]
      : [];
  const reportsInto: UnitReportingBody['reportsInto'] =
    d.ri === 'DEFAULT' || d.riPosition == null
      ? { mode: 'DEFAULT' }
      : { mode: 'CHOSEN', positionId: d.riPosition, ...(d.reason.trim() ? { reason: d.reason.trim() } : {}) };
  return { heads, reportsInto };
}

/** What is still missing before a save, in words (the server says the rest). */
function problemsOf(d: Draft): string[] {
  const out: string[] = [];
  if (d.ri !== 'DEFAULT' && d.riPosition == null) out.push('Choose the position it reports into, or go back to the default.');
  if (d.ri === 'ELSEWHERE' && !d.reason.trim()) out.push('Say why it reports outside the units above it.');
  return out;
}

/** The editor's state for one unit: read when `unitId` is set, saved on demand. */
export function useUnitReporting(unitId: number | null) {
  const [data, setData] = useState<UnitReporting | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    setData(null);
    setDraft(null);
    setError(null);
    if (unitId == null) return undefined;
    let live = true;
    orgApi.departments
      .reporting(unitId)
      .then((r) => {
        if (!live) return;
        setData(r);
        setDraft(draftOf(r));
      })
      .catch((e) => { if (live) setError(e); });
    return () => { live = false; };
  }, [unitId, tick]);
  const initial = useMemo(() => (data ? JSON.stringify(bodyOf(draftOf(data))) : ''), [data]);
  const dirty = !!draft && JSON.stringify(bodyOf(draft)) !== initial;
  const problems = draft ? problemsOf(draft) : [];
  const save = useCallback(async () => {
    if (unitId == null || !draft || !dirty) return data;
    const left = problemsOf(draft);
    if (left.length) throw Object.assign(new Error(left[0]), { problems: left });
    const saved = await orgApi.departments.setReporting(unitId, bodyOf(draft));
    setData(saved);
    setDraft(draftOf(saved));
    return saved;
  }, [unitId, draft, dirty, data]);
  return { data, draft, setDraft, error, dirty, problems, save, reload: () => setTick((t) => t + 1) };
}

export type UnitReportingState = ReturnType<typeof useUnitReporting>;
