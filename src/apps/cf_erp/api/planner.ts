import { cfApi, qs } from './client';
import type { PlanLevel, PlannerSettings, PlannerSnapshot } from '../lib/planner/types';

/**
 * The Planner (services/plannerService.js). One read gives everything the board needs — the
 * horizon, orders, units at every level, supply and the saved entries — and the engine in
 * lib/planner works from that snapshot in the browser. Writes are small and answer at once.
 */
export const getPlanner = (from?: string) => cfApi.get<PlannerSnapshot>(`/planner${qs({ from })}`);

/** One row per changed unit; shipDate null = take it off the plan; startDate = a stretched bar's first week (null = booked back from the ship week). */
export interface EntryWrite { unitKey: string; shipDate: string | null; startDate?: string | null; pinned: boolean }
export const putEntries = (entries: EntryWrite[]) => cfApi.put<unknown>('/planner/entries', { entries });
export const putPriorities = (orderIds: (number | string)[]) => cfApi.put<unknown>('/planner/priorities', { orderIds });
export const putLevel = (lineId: number | string, level: PlanLevel) => cfApi.put<unknown>(`/planner/lines/${lineId}/level`, { level });
export const putTargets = (targets: Record<string, number>) => cfApi.put<unknown>('/planner/targets', targets);
export const putSettings = (settings: Partial<PlannerSettings>) => cfApi.put<unknown>('/planner/settings', settings);

/**
 * The Save button: where units ship and each changed line's unit order (init.sql §38), in one
 * transaction. `ranks[].unitKeys` is the WHOLE order of that line's units, first first.
 */
export interface RankWrite { lineId: number | string; unitKeys: string[] }
export const putChanges = (body: { entries: EntryWrite[]; ranks: RankWrite[] }) => cfApi.put<unknown>('/planner/changes', body);

/** Plan a row's parts separately (split) or as one unit again, for this order line only. Needs a locked line; re-read the snapshot after. */
export const putLineSplit = (lineId: number | string, bomLineId: number | string, split: boolean) =>
  cfApi.put<{ lineId: number | string; bomLineId: number | string; split: boolean }>(`/planner/lines/${lineId}/splits`, { bomLineId, split });

/** PUT /planner/changes (or /entries) answers 422 with this code when a placed or moved card's material does not allow it. */
export const MATERIAL_NOT_READY = 'MATERIAL_NOT_READY';
export interface MaterialRefusal { unitKey: string; kind: 'waiting' | 'material_late'; readyDate: string | null; earliest: string | null }
/** The refused cards of a MATERIAL_NOT_READY error (empty for any other error). */
export function refusedUnits(e: unknown): MaterialRefusal[] {
  const err = e as { code?: string; detail?: { units?: MaterialRefusal[] } } | null;
  return err?.code === MATERIAL_NOT_READY && Array.isArray(err.detail?.units) ? err.detail!.units! : [];
}
