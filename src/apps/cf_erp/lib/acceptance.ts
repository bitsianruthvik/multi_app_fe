import type {
  AcceptanceView, ChargeBasis, ChargeRow, LumpSumRow, ScrapOf, MilestoneRow, StageRow, TermTemplate, Terms, Trigger, TriggerType,
} from '../api/acceptance';

/**
 * The Customer acceptance step's words and rows (backend acceptanceService, init.sql §73). Pure — the screen and its
 * test (scripts/cf_erp_acceptance_test.mjs) both read these.
 */

/** The compact input of a grid cell (Excel-like rows). */
export const termInputSx = { '& .MuiInputBase-root': { fontSize: 13 }, '& .MuiInputBase-input': { py: '5px' } } as const;

/** A key not used by any row yet: c1, c2 … (the server keeps the keys; a milestone and a stage link by them). */
export function newKey(prefix: string, rows: { key: string }[]): string {
  const used = new Set(rows.map((r) => r.key));
  for (let i = rows.length + 1; ; i += 1) if (!used.has(`${prefix}${i}`)) return `${prefix}${i}`;
}

export const blankCharge = (rows: ChargeRow[]): ChargeRow => ({ key: newKey('c', rows), label: '', operationId: null, basis: { type: 'weight', weight: 'drawing' }, rate: null, billing: 'pro_rata' });
export const blankLumpSum = (rows: LumpSumRow[]): LumpSumRow => ({ key: newKey('l', rows), label: '', amount: null });
/**
 * SCRAP & OFFCUTS (2026-10-18): the optional charge for the steel the nesting leaves over — scrap kg × rate (default),
 * offcut kg × rate or a % of the material. It passes the cutting operation when the company has one.
 */
export const blankScrapCharge = (rows: ChargeRow[], operations: { id: number; name: string }[] = []): ChargeRow => ({
  key: newKey('c', rows), label: 'Scrap & offcuts',
  operationId: operations.find((o) => /cut|plasma|profil/i.test(o.name))?.id ?? null,
  basis: { type: 'scrap', of: 'scrap' }, rate: null, billing: 'pro_rata',
});
export const SCRAP_BASIS_WORDS: Record<ScrapOf, string> = { scrap: 'Scrap kg × rate', offcut: 'Offcut kg × rate', material_pct: '% of the material' };
/** A charge's basis in words (Approvals, the step's summary). */
export function chargeBasisText(b: ChargeBasis | null | undefined): string {
  if (!b) return '—';
  if (b.type === 'formula') return `${b.expression} (${b.unit})`;
  if (b.type === 'scrap') return `Scrap & offcuts — ${SCRAP_BASIS_WORDS[b.of] ?? b.of}`;
  return b.weight === 'actual' ? 'Actual weight' : 'Weight as per drawing';
}
/** What the rate is per: "t", "m²", "kg", "%". */
export function chargeRateUnit(b: ChargeBasis | null | undefined): string {
  if (b?.type === 'formula') return b.unit || 'unit';
  if (b?.type === 'scrap') return b.of === 'material_pct' ? '%' : 'kg';
  return 't';
}
/** "₹120 / kg", "5 %". */
export function chargeRateText(rate: number | null | undefined, b: ChargeBasis | null | undefined, money: (n: number) => string): string {
  if (rate == null) return '—';
  return b?.type === 'scrap' && b.of === 'material_pct' ? `${rate} % of material` : `${money(rate)} / ${chargeRateUnit(b)}`;
}
export const blankMilestone = (rows: MilestoneRow[]): MilestoneRow => ({ key: newKey('m', rows), label: '', kind: 'percent', value: null, trigger: { type: 'order_accepted' }, proRata: false, creditDays: 30 });
export const blankStage = (rows: StageRow[]): StageRow => ({ key: newKey('s', rows), name: '' });

/** The terms the grids edit: a deep copy of what the server answered (never the same objects). */
export const termsOf = (v: AcceptanceView): Terms => JSON.parse(JSON.stringify({
  charges: v.terms.charges ?? [], material: v.terms.material ?? null, lumpSums: v.terms.lumpSums ?? [], milestones: v.terms.milestones ?? [], stages: v.terms.stages ?? [],
}));

/** What the terms send — the grids' rows as the server reads them (an empty material rate = no material row). */
export function termsBody(t: Terms): Terms {
  return {
    charges: t.charges,
    material: t.material && t.material.rate != null && String(t.material.rate) !== '' ? t.material : null,
    lumpSums: t.lumpSums,
    milestones: t.milestones,
    stages: t.stages.filter((s) => s.name.trim() !== ''),
  };
}

/** A template's rows put into the terms (its own kind only; the other grids stay). */
export function applyTemplate(t: Terms, tpl: Pick<TermTemplate, 'kind' | 'rows'>): Terms {
  const r = JSON.parse(JSON.stringify(tpl.rows ?? {})) as Partial<Terms>;
  if (tpl.kind === 'charges') return { ...t, charges: r.charges ?? [], material: r.material ?? null, lumpSums: r.lumpSums ?? [] };
  if (tpl.kind === 'milestones') return { ...t, milestones: r.milestones ?? [] };
  return { ...t, stages: r.stages ?? [] };
}

/** The part of the terms a template of that kind holds — "Save as template". */
export function templateRows(t: Terms, kind: TermTemplate['kind']): Partial<Terms> {
  if (kind === 'charges') return { charges: t.charges, material: t.material, lumpSums: t.lumpSums };
  if (kind === 'milestones') return { milestones: t.milestones };
  return { stages: t.stages };
}

/** The % the milestones add up to (fixed amounts are not counted). */
export const percentTotal = (rows: MilestoneRow[]) => Math.round(rows.filter((m) => m.kind === 'percent').reduce((s, m) => s + (Number(m.value) || 0), 0) * 1e6) / 1e6;

/** "Pro-rata" is offered only where the trigger allows it; each dispatch is always pro-rata. */
export const PRO_RATA_TRIGGERS: TriggerType[] = ['material_in_place', 'customer_material_received', 'operation_completed'];
export const proRataAllowed = (t: Trigger | null) => !!t && PRO_RATA_TRIGGERS.includes(t.type as TriggerType);

/** A trigger as a plain sentence: "30 days after the design is frozen", "Each dispatch (pro-rata)". */
export function triggerWords(t: Trigger | null, names: { operation?: (id: number) => string | null; stage?: (key: string) => string | null; milestone?: (key: string) => string | null } = {}): string {
  if (!t || !t.type) return 'Not chosen';
  switch (t.type) {
    case 'order_accepted': return 'When the order is accepted';
    case 'design_frozen': return 'When the design is frozen';
    case 'material_in_place': return 'When the material is in place';
    case 'customer_material_received': return "When the customer's material is received";
    case 'production_started': return 'When production starts';
    case 'operation_completed': return `When ${t.operationId ? names.operation?.(t.operationId) ?? 'the operation' : 'an operation'} is completed`;
    case 'dispatched': return t.mode === 'all' ? 'When everything is dispatched' : 'On each dispatch';
    case 'fully_dispatched': return 'When fully dispatched';
    case 'post_stage': return `When "${(t.stageKey && names.stage?.(t.stageKey)) || 'a post-production stage'}" is done`;
    case 'days_after': return `${t.days ?? 'N'} days after ${triggerWords(t.after ?? null, names).replace(/^When /, '').replace(/^On /, '').toLowerCase()}`;
    case 'fixed_date': return t.date ? `On ${t.date}` : 'On a date';
    case 'retention': return `${t.months ?? 'N'} months after "${(t.milestoneKey && names.milestone?.(t.milestoneKey)) || 'a milestone'}"`;
    default: return String(t.type);
  }
}

/** The step's standing in words, and the badge family it is drawn in. */
export function stateWords(v: Pick<AcceptanceView, 'state' | 'approved' | 'pending' | 'sentBack'>): { label: string; family: 'success' | 'warning' | 'danger' | 'info' | 'neutral' } {
  if (v.approved && v.pending) return { label: `Accepted · rate change waiting`, family: 'warning' };
  if (v.approved) return { label: `Accepted (v${v.approved.version})`, family: 'success' };
  if (v.pending) return { label: 'Waiting for Management', family: 'warning' };
  if (v.sentBack?.status === 'rejected') return { label: 'Sent back', family: 'danger' };
  if (v.sentBack?.status === 'withdrawn') return { label: 'Taken back', family: 'neutral' };
  return { label: 'Not sent yet', family: 'neutral' };
}

/** The save button's words. */
export const saveLabel = (v: Pick<AcceptanceView, 'approved' | 'pending'>) => (v.approved ? 'Send rate change for approval' : v.pending ? 'Save and send again' : 'Send for approval');

/** A milestone billed on a stage: the milestone whose trigger names that stage (the stage grid's "Billed by"). */
export const milestoneOfStage = (milestones: MilestoneRow[], stageKey: string) => milestones.find((m) => m.trigger?.type === 'post_stage' && m.trigger.stageKey === stageKey) ?? null;

/** Links a stage to a milestone (its trigger becomes "that stage done"), or unlinks it ('' = none). */
export function linkStage(milestones: MilestoneRow[], stageKey: string, milestoneKey: string): MilestoneRow[] {
  return milestones.map((m) => {
    if (m.key === milestoneKey) return { ...m, trigger: { type: 'post_stage', stageKey }, proRata: false };
    if (m.trigger?.type === 'post_stage' && m.trigger.stageKey === stageKey) return { ...m, trigger: { type: '' } };
    return m;
  });
}

/** Moves a row up (-1) or down (+1). */
export function move<T>(rows: T[], i: number, by: -1 | 1): T[] {
  const j = i + by;
  if (j < 0 || j >= rows.length) return rows;
  const next = rows.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** A file the browser saves (the MR for the customer). */
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
