import { cfApi, LONG_WRITE_MS } from './client';

/**
 * SECTION NESTING (CF_ERP_CUT_FROM_PLAN.md §4, §11.3) — the 1-D partner of plate
 * nesting: a line's section pieces cut from stock bars, with saw kerf and end
 * trim, and the leftovers kept as bar offcuts. Under
 * /orders/:orderId/lines/:lineId/section-nesting. Every answer is normalised so
 * an older or partial backend still renders.
 */

export interface SectionSettingsView { sawKerfMm: number; endTrimMm: number; minOffcutMm: number }

export interface SectionPiece { cutPieceId: number; code: string | null; lengthMm: number; quantity: number; parts: string[] }
export interface SectionStockLength { itemId: number; code: string | null; lengthMm: number }
export interface SectionOffcutIn { offcutId: number; offcutNo: string | null; lengthMm: number }
export interface BarCut { cutPieceId: number; code: string | null; xMm: number; lengthMm: number }
export interface Bar {
  lotId: number | null; lotNo: string | null; source: 'catalog' | 'offcut';
  itemId: number | null; itemCode: string | null; offcutId: number | null;
  lengthMm: number; cuts: BarCut[]; wasteMm: number; keptOffcutMm: number;
}
export interface SectionPlan {
  bars: Bar[]; barsBought: number; barsFromOffcuts: number; totalLengthMm: number; wasteMm: number; wastePct: number | null; keptOffcuts: number;
}
export interface SectionProfile {
  key: string; label: string; grade: string | null;
  pieces: SectionPiece[]; stockLengths: SectionStockLength[]; offcuts: SectionOffcutIn[]; plan: SectionPlan | null;
}
export interface SectionNestingView {
  line: { id: number; lineNo: number | null; orderCode: string | null };
  settings: SectionSettingsView;
  accepted: boolean; acceptedAt: string | null;
  problems: string[];
  profiles: SectionProfile[];
}

export interface SectionSheetResult {
  applied: boolean; canSave: boolean; needsForce: boolean; problems: string[];
  bars: Bar[]; coverage: { code: string; needed: number; placed: number }[];
}

const base = (orderId: number, lineId: number) => `/orders/${orderId}/lines/${lineId}/section-nesting`;
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const num = (v: unknown, d = 0) => (v == null || Number.isNaN(Number(v)) ? d : Number(v));

function normaliseBar(b: Partial<Bar>): Bar {
  return {
    lotId: b.lotId ?? null, lotNo: b.lotNo ?? null, source: b.source === 'offcut' ? 'offcut' : 'catalog',
    itemId: b.itemId ?? null, itemCode: b.itemCode ?? null, offcutId: b.offcutId ?? null,
    lengthMm: num(b.lengthMm), cuts: arr<BarCut>(b.cuts).map((c) => ({ ...c, code: c.code ?? null, xMm: num(c.xMm), lengthMm: num(c.lengthMm) })),
    wasteMm: num(b.wasteMm), keptOffcutMm: num(b.keptOffcutMm),
  };
}

function normalisePlan(p: Partial<SectionPlan> | null | undefined): SectionPlan | null {
  if (!p) return null;
  const bars = arr<Partial<Bar>>(p.bars).map(normaliseBar);
  return {
    bars, barsBought: num(p.barsBought, bars.filter((b) => b.source === 'catalog').length), barsFromOffcuts: num(p.barsFromOffcuts, bars.filter((b) => b.source === 'offcut').length),
    totalLengthMm: num(p.totalLengthMm, bars.reduce((a, b) => a + b.lengthMm, 0)), wasteMm: num(p.wasteMm, bars.reduce((a, b) => a + b.wasteMm, 0)),
    wastePct: p.wastePct == null ? null : Number(p.wastePct), keptOffcuts: num(p.keptOffcuts, bars.filter((b) => b.keptOffcutMm > 0).length),
  };
}

export function normaliseSectionView(out: Partial<SectionNestingView> | null | undefined): SectionNestingView {
  return {
    line: { id: out?.line?.id ?? 0, lineNo: out?.line?.lineNo ?? null, orderCode: out?.line?.orderCode ?? null },
    settings: { sawKerfMm: num(out?.settings?.sawKerfMm, 3), endTrimMm: num(out?.settings?.endTrimMm, 10), minOffcutMm: num(out?.settings?.minOffcutMm, 500) },
    accepted: !!out?.accepted, acceptedAt: out?.acceptedAt ?? null,
    problems: arr<string>(out?.problems),
    profiles: arr<Partial<SectionProfile>>(out?.profiles).map((p) => ({
      key: String(p.key ?? p.label ?? ''), label: p.label ?? String(p.key ?? ''), grade: p.grade ?? null,
      pieces: arr<SectionPiece>(p.pieces).map((x) => ({ ...x, code: x.code ?? null, parts: arr<string>(x.parts), lengthMm: num(x.lengthMm), quantity: num(x.quantity) })),
      stockLengths: arr<SectionStockLength>(p.stockLengths), offcuts: arr<SectionOffcutIn>(p.offcuts),
      plan: normalisePlan(p.plan),
    })),
  };
}

function normaliseSheet(out: Partial<SectionSheetResult> | null | undefined): SectionSheetResult {
  const problems = arr<string>(out?.problems);
  return {
    applied: !!out?.applied, canSave: out?.canSave ?? problems.length === 0, needsForce: !!out?.needsForce, problems,
    bars: arr<Partial<Bar>>(out?.bars).map(normaliseBar), coverage: arr<{ code: string; needed: number; placed: number }>(out?.coverage),
  };
}

export const getSectionNesting = (orderId: number, lineId: number) =>
  cfApi.get<Partial<SectionNestingView>>(base(orderId, lineId)).then(normaliseSectionView);
/** A proposal: nothing is written. */
export const planSectionNesting = (orderId: number, lineId: number) =>
  cfApi.post<Partial<SectionNestingView>>(`${base(orderId, lineId)}/plan`, {}, { timeoutMs: LONG_WRITE_MS }).then(normaliseSectionView);
export const acceptSectionNesting = (orderId: number, lineId: number) =>
  cfApi.post<unknown>(`${base(orderId, lineId)}/accept`, {}, { timeoutMs: LONG_WRITE_MS });
export const takeBackSectionNesting = (orderId: number, lineId: number) =>
  cfApi.del<unknown>(base(orderId, lineId), { timeoutMs: LONG_WRITE_MS });

export async function downloadSectionSheet(orderId: number, lineId: number, name: string): Promise<void> {
  const blob = await cfApi.getBlob(`${base(orderId, lineId)}/sheet`, { timeoutMs: LONG_WRITE_MS });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Sections_${name.replace(/[^\w.-]+/g, '_')}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Read the sheet without writing anything. */
export const previewSectionSheet = (orderId: number, lineId: number, file: string, filename: string) =>
  cfApi.post<Partial<SectionSheetResult>>(`${base(orderId, lineId)}/sheet`, { file, filename, dryRun: true }, { timeoutMs: LONG_WRITE_MS }).then(normaliseSheet);

/** Save the sheet: it replaces the line's bar lots. `force` saves it although the check had doubts. */
export const saveSectionSheet = (orderId: number, lineId: number, file: string, filename: string, force: boolean) =>
  cfApi.post<Partial<SectionSheetResult>>(`${base(orderId, lineId)}/sheet`, { file, filename, dryRun: false, force }, { timeoutMs: LONG_WRITE_MS }).then(normaliseSheet);
