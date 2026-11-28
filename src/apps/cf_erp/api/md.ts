import { cfApi } from './client';
import type { Alert } from './alerts';

/**
 * The MD's page, the weekly reports and the company settings (backend routes/md.js, init.sql §113;
 * services/mdOverviewService.js, services/settingsService.js).
 */
export interface MdDecision {
  source: 'approval' | 'plate_change' | 'purchase_request'; id: number; type: string; typeLabel: string; department: string;
  title: string; summary: string | null; amount: number | null; order: { id: number; code: string | null } | null;
  requestedBy: string | null; requestedAt: string | null; ageDays: number; link: string;
  /** Approve / Reject work from the row (the Approvals inbox). The other two are decided on their own screen. */
  decideHere: boolean;
}
export interface MdReportHead {
  id: number; kind: string; label: string; department: string; periodStart: string; periodEnd: string; headline: string | null;
  seenAt: string | null; seenBy: string | null; seenNote: string | null;
}
export type Tone = 'ok' | 'warn' | 'bad' | 'neutral';
export interface MdReport extends MdReportHead {
  data: { figures: { label: string; value: string; tone?: Tone }[]; tables: { title: string; columns: string[]; rows: string[][]; empty?: string | null }[]; notes?: string[] };
}
export interface MdDepartment { key: string; label: string; status: 'ok' | 'warn' | 'bad'; link: string; lines: string[] }
export interface MdOverview {
  date: string;
  decisions: { rows: MdDecision[]; oldestDays: number };
  reports: { toVerify: MdReportHead[]; seen: MdReportHead[] };
  alerts: Alert[];
  departments: MdDepartment[];
  standIn: { on: boolean; name: string | null; you: boolean };
}
export const getMdOverview = () => cfApi.get<MdOverview>('/md/overview');
export const getMdReport = (id: number) => cfApi.get<MdReport>(`/md/reports/${id}`);
export const markReportSeen = (id: number, note?: string) => cfApi.post<MdReport>(`/md/reports/${id}/seen`, note ? { note } : {});
export const getMdMe = () => cfApi.get<{ md: boolean; standIn: boolean }>('/md/me');

// ---- settings
export type SettingValue = string | number | boolean | null;
export interface SettingItem {
  key: string; label: string; help: string | null; type: 'int' | 'number' | 'bool' | 'time' | 'date' | 'choice' | 'user' | 'stages';
  unit: string | null; min: number | null; max: number | null; choices: { value: string; label: string }[] | null;
  default: SettingValue; value: SettingValue; changed: boolean;
}
export interface SettingsPage { groups: { key: string; label: string; help: string; items: SettingItem[] }[]; users: { id: number; name: string }[] }
export const getSettingsPage = () => cfApi.get<SettingsPage>('/settings');
export const putSettings = (values: Record<string, SettingValue>) => cfApi.put<SettingsPage>('/settings', { values });
