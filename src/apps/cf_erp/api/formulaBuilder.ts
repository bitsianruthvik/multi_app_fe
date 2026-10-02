import { cfApi } from './client';
import type { FormulaCheck, TableValue } from './types';
import type { BuilderField } from '../lib/formulaBuilder';

/** A chart as the builder gets it: ready to hand to LOOKUP in a typed sample. */
export type BuilderChart = TableValue & { mode?: string; axes?: { label?: string; unit?: string | null }[] };

export interface BuilderMachine { id: number; code: string; name: string; typeName: string | null; values: Record<string, number | BuilderChart> }
export interface SamplePiece {
  id: number; code: string | null; name: string; kind: string | null;
  orderCode: string | null; lineNo: number | null;
  /** false = the operation is in no flow yet, so these are just recent order pieces. */
  fromOperation: boolean;
  values: Record<string, number | BuilderChart>;
}
export interface BuilderContext {
  operation: { id: number; code: string; name: string };
  machines: BuilderMachine[];
  machineFields: BuilderField[];
  itemFields: BuilderField[];
  samplePieces: SamplePiece[];
}

/** GET /operations/:id/formula-builder — fields with units and real examples, the rule's machines (values + charts), real pieces. */
export const getBuilderContext = (operationId: number, subject?: { type: 'classification' | 'machine'; id: number } | null) =>
  cfApi.get<BuilderContext>(`/operations/${operationId}/formula-builder${subject ? `?subjectType=${subject.type}&subjectId=${subject.id}` : ''}`);

export interface BuilderInput { ref: string; value: number | null; chart?: string | null; from: 'typed' | 'piece' | 'machine' | null }
export type BuilderCheck = FormulaCheck & { inputs?: BuilderInput[] };

/** POST /formulas/check on a real piece / machine, typed values laid over them. */
export const checkOnSample = (body: { expression: string; itemId?: number | null; machineId?: number | null; sample?: Record<string, unknown> }) =>
  cfApi.post<BuilderCheck>('/formulas/check', body);
