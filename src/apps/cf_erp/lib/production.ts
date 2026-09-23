import type { EffectiveFlow, TimeView, TimingSubject, WaitRelation } from '../api/types';

/** Minutes as people say them: 45 min, 1 h 20 min. */
export function minutesText(minutes: number | null | undefined): string {
  if (minutes == null) return '—';
  const m = Number(minutes);
  if (m < 60) return `${Number(m.toFixed(1))} min`;
  const h = Math.floor(m / 60);
  const rest = Math.round(m - h * 60);
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

/** A setup or work time as a rule holds it: a constant, or a formula's code. */
export function timeText(t: TimeView | null | undefined): string {
  if (!t) return '—';
  if (t.minutes != null) return minutesText(t.minutes);
  return t.formula ? t.formula.code : '—';
}

export function subjectText(s: TimingSubject): string {
  const named = s.code ?? s.name ?? '—';
  return s.type === 'machine' ? `machine ${named}` : `${(s.level ?? '').toLowerCase()} ${s.name ?? s.code ?? '—'}`.trim();
}

export const RELATION_LABEL: Record<WaitRelation, string> = {
  parent: 'Its parent',
  children: 'Its children',
  siblings: 'Its siblings',
  ancestor: 'An ancestor further up',
};

export const RELATION_HELP: Record<WaitRelation, string> = {
  parent: 'The assembly this piece goes into — e.g. a plate waits for its girder’s fit-up before drilling.',
  children: 'The pieces that go into it — e.g. a girder waits for its plates to be drilled before welding.',
  siblings: 'Other pieces in the same parent — e.g. a flange waits for the web to be cut.',
  ancestor: 'The nearest assembly of a given template further up the tree — e.g. a plate waits for its span.',
};

const FLOW_FROM: Record<EffectiveFlow['from'], string> = {
  line: 'set on this line',
  item: 'its usual flow',
  template: 'its template’s usual flow',
};
export const flowFromText = (f: EffectiveFlow) => FLOW_FROM[f.from];
