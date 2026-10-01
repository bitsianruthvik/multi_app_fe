import { cfApi, qs } from './client';
import type { PlanLevel, PlannerSettings, PlannerSnapshot } from '../lib/planner/types';

/**
 * The Planner (services/plannerService.js). One read gives everything the board needs — the
 * horizon, orders, units at every level, supply and the saved entries — and the engine in
 * lib/planner works from that snapshot in the browser. Writes are small and answer at once.
 */
export const getPlanner = (from?: string) => cfApi.get<PlannerSnapshot>(`/planner${qs({ from })}`);

/** One row per changed unit; shipDate null = take it off the plan. */
export interface EntryWrite { unitKey: string; shipDate: string | null; pinned: boolean }
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
