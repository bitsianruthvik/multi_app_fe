import { cfApi, LONG_WRITE_MS } from './client';
import type { NestSheetResult, NestingChoices, PlateChoice } from './types';

/**
 * The nesting sheet and the CNC files (CF_ERP_NESTING_PLAN.md, "Decided
 * 2026-09-29"). The screen's own reads and writes (the saved plan, propose,
 * accept) stay in NestingPanel; these are the file round-trips.
 */

const base = (orderId: number, lineId: number) => `/orders/${orderId}/lines/${lineId}/nesting`;

/** Hand a blob to the browser as a download. */
function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** A file name that survives every OS. */
const safe = (s: string) => s.replace(/[^\w.-]+/g, '_');

export async function downloadNestingSheet(orderId: number, lineId: number, name: string): Promise<void> {
  const blob = await cfApi.getBlob(`${base(orderId, lineId)}/sheet`, { timeoutMs: LONG_WRITE_MS });
  save(blob, safe(`Nesting_${name}.xlsx`));
}

export async function downloadCncZip(orderId: number, lineId: number, name: string): Promise<void> {
  const blob = await cfApi.getBlob(`${base(orderId, lineId)}/cnc`, { timeoutMs: LONG_WRITE_MS });
  save(blob, safe(`CNC_${name}.zip`));
}

export async function downloadLotCnc(orderId: number, lineId: number, lotId: number, lotNo: string | null): Promise<void> {
  const blob = await cfApi.getBlob(`${base(orderId, lineId)}/cnc/${lotId}`, { timeoutMs: LONG_WRITE_MS });
  save(blob, safe(`${lotNo ?? `lot_${lotId}`}.dxf`));
}

/**
 * Fill in whatever the answer lacks, so an older backend (or a partial answer)
 * still renders instead of throwing on `.map` of undefined.
 */
function normalise(out: Partial<NestSheetResult> | null | undefined): NestSheetResult {
  const problems = Array.isArray(out?.problems) ? out.problems : [];
  return {
    applied: !!out?.applied,
    canSave: out?.canSave ?? problems.length === 0,
    needsForce: !!out?.needsForce,
    problems,
    nests: Array.isArray(out?.nests) ? out.nests.map((n) => ({
      ...n,
      items: Array.isArray(n.items) ? n.items : [],
      reasons: Array.isArray(n.reasons) ? n.reasons : [],
      hasLayout: n.hasLayout !== false,
    })) : [],
    coverage: Array.isArray(out?.coverage) ? out.coverage : [],
  };
}

/**
 * Read the sheet without writing anything. `file` is the contract's name; the
 * backend deployed before it reads `fileBase64`, so both are sent.
 */
export async function previewNestingSheet(orderId: number, lineId: number, file: string, filename: string): Promise<NestSheetResult> {
  const out = await cfApi.post<Partial<NestSheetResult>>(`${base(orderId, lineId)}/sheet`,
    { file, fileBase64: file, filename, dryRun: true }, { timeoutMs: LONG_WRITE_MS });
  return normalise(out);
}

/** Save the sheet: it replaces every plate on the line. `force` saves it although the check had doubts. */
export async function saveNestingSheet(orderId: number, lineId: number, file: string, filename: string, force: boolean): Promise<NestSheetResult> {
  const out = await cfApi.post<Partial<NestSheetResult>>(`${base(orderId, lineId)}/sheet`,
    { file, fileBase64: file, filename, dryRun: false, force }, { timeoutMs: LONG_WRITE_MS });
  return normalise(out);
}

/**
 * THE NESTING CHOICES (init.sql §40): Step A — the cut pieces a run considers —
 * and Step B — the raw plates it may draw on. Read with the line; saved whole
 * (both lists, an empty pair resets). Every run applies them.
 */
export function getNestingChoices(orderId: number, lineId: number): Promise<NestingChoices> {
  return cfApi.get<NestingChoices>(`${base(orderId, lineId)}/choices`);
}

export function saveNestingChoices(orderId: number, lineId: number, excludedCutPlateIds: number[], excludedPlateIds: number[]): Promise<NestingChoices> {
  return cfApi.put<NestingChoices>(`${base(orderId, lineId)}/choices`, { excludedCutPlateIds, excludedPlateIds });
}

/** Which plates nesting may use on this line: standard only, or standard and custom. Needed before the first run. */
export function setNestPlates(orderId: number, lineId: number, plates: PlateChoice): Promise<{ lineId: number; plateChoice: PlateChoice }> {
  return cfApi.put<{ lineId: number; plateChoice: PlateChoice }>(`${base(orderId, lineId)}/plates`, { plates });
}

/** Flip a catalog plate between STANDARD and CUSTOM (the generic values save; needs the catalog grant). */
export function setPlateKind(plateItemId: number, kind: 'STANDARD' | 'CUSTOM'): Promise<unknown> {
  return cfApi.put(`/records/${plateItemId}/values`, { values: [{ specCode: 'PLATE_KIND', value: kind }] });
}
