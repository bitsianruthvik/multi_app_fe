import { cfApi, qs } from './client';

/**
 * CUT FROM (CF_ERP_CUT_FROM_PLAN.md §3, §11.2). How a part's pieces are cut —
 * from a plate, from a stock bar (a "section"), or not at all — and the places
 * the cut pieces, the raw stock and the offcuts are filed. Nothing here names a
 * classification code: the places are ids, set on Setup › Cutting.
 */

export type CutFrom = 'PLATE' | 'SECTION' | 'NONE';
export const CUT_FROM_LABEL: Record<CutFrom, string> = { PLATE: 'Plate', SECTION: 'Section (cut to length)', NONE: 'Not cut' };

/** Where an answer came from, in the words the page shows after it. */
export type CutFromSource = 'own' | 'definition' | 'classification' | null;

export interface CutFromAnswer { value: CutFrom | null; source: CutFromSource; /** When source is 'own': what Inherit would give. */ inherited?: { value: CutFrom | null; source: CutFromSource; from: string | null } | null; /** "Plate part", "Profile part" — the record or node it comes from. */ from: string | null }

export interface CutRef { id: number; code: string | null; name: string }

/** The steel of a section, as the record reads it. */
export interface SectionSteel {
  thickness?: number | null; width?: number | null; depth?: number | null; lengthMm?: number | null;
  sectionArea?: number | null; grade?: string | null; impactClass?: string | null; material?: string | null; density?: number | null;
}

export interface CutStockAnswer {
  own: CutRef | null;
  effective: (CutRef & { steel?: SectionSteel | null }) | null;
  from: 'own' | 'definition' | null;
}

/** The sentence under a Cut from value: "Section — from Profile part". */
export function cutFromWords(answer: CutFromAnswer | null | undefined): string {
  if (!answer || !answer.value) return 'Not answered anywhere, so it counts as Not cut, and freezing says so.';
  const label = CUT_FROM_LABEL[answer.value];
  if (answer.source === 'own') return `${label} — set on this record`;
  return answer.from ? `${label} — from ${answer.from}` : label;
}

// ---- Setup › Cutting ----------------------------------------------------------

export interface NodeRef { id: number; code: string | null; name: string; path: string }
export interface CutPlace { blanksNode: NodeRef | null; offcutNode: NodeRef | null; stockNodes: NodeRef[] }
export interface SectionSettings { sawKerfMm: number | null; endTrimMm: number | null; minOffcutMm: number | null }
export interface FlowRef { id: number; code: string; name: string; status?: string }
export interface CutPlaces { plate: CutPlace; section: CutPlace; sectionSettings: SectionSettings; problems: string[]; flows: { plate: FlowRef | null; section: FlowRef | null } }
export interface CutPlaceWrite { blanksNodeId?: number | null; offcutNodeId?: number | null; stockNodeIds?: number[] }
export interface CutPlacesWrite { plate?: CutPlaceWrite; section?: CutPlaceWrite; sectionSettings?: Partial<SectionSettings>; sectionFlowId?: number | null }

const place = (p: Partial<CutPlace> | null | undefined): CutPlace => ({
  blanksNode: p?.blanksNode ?? null, offcutNode: p?.offcutNode ?? null, stockNodes: Array.isArray(p?.stockNodes) ? p.stockNodes : [],
});

function normalisePlaces(out: Partial<CutPlaces> | null | undefined): CutPlaces {
  return {
    plate: place(out?.plate),
    section: place(out?.section),
    sectionSettings: { sawKerfMm: out?.sectionSettings?.sawKerfMm ?? null, endTrimMm: out?.sectionSettings?.endTrimMm ?? null, minOffcutMm: out?.sectionSettings?.minOffcutMm ?? null },
    problems: Array.isArray(out?.problems) ? out.problems : [],
    flows: { plate: out?.flows?.plate ?? null, section: out?.flows?.section ?? null },
  };
}

export const getCutPlaces = () => cfApi.get<Partial<CutPlaces>>('/cut-places').then(normalisePlaces);
export const saveCutPlaces = (body: CutPlacesWrite) => cfApi.put<Partial<CutPlaces>>('/cut-places', body).then(normalisePlaces);

/** The flow a new cut plate is made by lives on its own endpoint (the Flows page uses it too). */
export const saveCutPlateFlow = (flowId: number | null) => cfApi.put<{ flow: FlowRef | null }>('/flows/cut-plates', { flowId });

// ---- Section picker -----------------------------------------------------------

export interface SectionStockRow {
  id: number; code: string | null; name: string;
  thickness: number | null; width: number | null; depth: number | null; lengthMm: number | null; sectionArea: number | null;
  grade: string | null; nodeName: string | null;
}

export async function searchSectionStock(search: string, limit = 50): Promise<SectionStockRow[]> {
  const out = await cfApi.get<SectionStockRow[] | { rows?: SectionStockRow[] } | null>(`/section-stock${qs({ search: search.trim(), limit })}`);
  const rows = Array.isArray(out) ? out : Array.isArray(out?.rows) ? out.rows : [];
  return rows.map((r) => ({ ...r, code: r.code ?? null, grade: r.grade ?? null, nodeName: r.nodeName ?? null }));
}

/** "75 × 75 × 8 · 6,000 mm · E350" — the size of a bar in the order a person says it. */
export function sectionSizeText(s: Pick<SectionStockRow, 'thickness' | 'width' | 'depth' | 'lengthMm' | 'grade'> | SectionSteel): string {
  const dims = [s.depth, s.width, s.thickness].filter((v): v is number => v != null && Number(v) > 0).map((v) => String(Math.round(Number(v) * 100) / 100));
  const parts = [dims.join(' × ')];
  if (s.lengthMm) parts.push(`${Number(s.lengthMm).toLocaleString('en-IN')} mm`);
  if (s.grade) parts.push(s.grade);
  return parts.filter(Boolean).join(' · ');
}

/** The write for a record's Cut from and section: a missing field is left alone, null clears it back to inherit. */
export function saveCutOnRecord(recordId: number, body: { cutFrom?: CutFrom | null; cutStockId?: number | null }) {
  return cfApi.put<unknown>(`/records/${recordId}`, body);
}
