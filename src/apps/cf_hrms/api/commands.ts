import { api } from './client';

/**
 * "Do it in words" (CF_HRMS_HIRING_SPEC.md §14) — the client side of
 * /commands/*. The server reads the words, checks the plan and applies it; this
 * file only carries the shapes.
 */

export interface FieldRef {
  /** 'step' points at an earlier step of the same plan. */
  kind: string;
  id: number | string;
  label?: string;
}

export interface StepField {
  value: string | number | null;
  ref?: FieldRef;
  candidates?: { id: number; label: string }[];
  fromText?: string | null;
  confidence?: number;
}

export interface Step {
  id: string;
  action: string | null;
  fields: Record<string, StepField>;
  sourceText?: string | null;
  confidence?: number | null;
  /** From /commands/check: plain sentences; empty = this step is clear. */
  problems?: string[];
}

export interface ActionField {
  name: string;
  kind: 'newText' | 'department' | 'role' | 'position' | 'employee' | 'shift' | 'label' | 'kra' | 'date';
  required: boolean;
  label: string;
}

export interface ActionDef {
  key: string;
  label: string;
  /** "Add the {label} {name} under {under}" — each {field} is a chip. */
  template: string;
  fields: ActionField[];
  oneOf: string[] | null;
  examples: string[];
}

export interface PathPart {
  id: number;
  name: string;
  label: string | null;
}

export interface Preview {
  departments: { key: string; name: string; label: string; parentId: number | null; parentKey: string | null; parentName: string | null; path: PathPart[] }[];
  roles: { key: string; title: string; purpose: string | null }[];
  positions: {
    key: string; title: string; roleKey: string | null; departmentId: number | null; departmentKey: string | null;
    departmentName: string | null; path: PathPart[]; shiftName: string | null; reportsToName: string | null;
  }[];
  lines: { key: string; kind: string; text: string; target: string | null; on: 'role' | 'position'; targetName: string; kraName: string | null }[];
  moves: { key: string; employeeName: string | null; fromName: string | null; toName: string | null; toKey: string | null; toPath: PathPart[]; from: string | null }[];
  shifts: { key: string; positionName: string | null; fromShift: string | null; toShift: string | null }[];
}

export interface ReadResult {
  plan: { steps: Step[] };
  notUnderstood: string[];
  notice: string | null;
  stats: { clauses: number; modelUsed: boolean; ms: number };
}

export interface CheckResult {
  steps: Step[];
  preview: Preview;
  clean: boolean;
}

export interface Created {
  stepId: string;
  action: string;
  kind: string;
  id: number | null;
  code?: string | null;
  name: string;
  /** Under /:company/cf_hrms/ */
  link?: string;
  positionId?: number;
}

export interface ApplyResult {
  ok: true;
  requestId: string;
  created: Created[];
}

export interface Option {
  id: number;
  label: string;
  parentId?: number | null;
  roleId?: number;
  departmentId?: number;
  vacant?: boolean;
}

export interface CommandOptions {
  departments: Option[];
  labels: string[];
  roles: Option[];
  positions: Option[];
  employees: Option[];
  shifts: Option[];
  roleKras: Record<string, Option[]>;
}

export const commandsApi = {
  actions: () => api.get<{ actions: ActionDef[] }>('/commands/actions'),
  options: () => api.get<CommandOptions>('/commands/options'),
  read: (text: string) => api.post<ReadResult>('/commands/read', { text }),
  check: (steps: Step[]) => api.post<CheckResult>('/commands/check', { steps }),
  apply: (steps: Step[], text: string) => api.post<ApplyResult>('/commands/apply', { steps, text }),
};
