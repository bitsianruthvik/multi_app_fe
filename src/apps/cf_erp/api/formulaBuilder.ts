import { cfApi } from './client';
import type { FormulaCheck, TableValue } from './types';
import type { BuilderField } from '../lib/formulaBuilder';

/** A chart as the builder gets it: ready to hand to LOOKUP in a typed sample. */
export type BuilderChart = TableValue & { mode?: string; axes?: { label?: string; unit?: string | null }[] };

export interface BuilderMachine {
  id: number; code: string; name: string; typeName: string | null; values: Record<string, number | BuilderChart>;
  typeId?: number;
  /** A value was entered on the machine itself: its time can differ from the standard (§58). */
  ownChart?: boolean;
}
export interface SamplePiece {
  id: number; code: string | null; name: string; kind: string | null;
  orderCode: string | null; lineNo: number | null;
  /** false = the operation is in no flow yet, so these are just recent order pieces. */
  fromOperation: boolean;
  values: Record<string, number | BuilderChart>;
}
export interface BuilderContext {
  operation: { id: number; code: string; name: string };
  /** The STANDARD the preview shows first: the machine type the rule is for (§58). */
  standard?: { typeId: number; typeName: string } | null;
  machines: BuilderMachine[];
  machineFields: BuilderField[];
  itemFields: BuilderField[];
  /** The pieces’ tree at each level (FAMILY / SUBFAMILY / VARIANT), for item.variant and its like. */
  levels?: Record<string, { id: number; code: string | null; name: string }[]>;
  samplePieces: SamplePiece[];
}

/** GET /operations/:id/formula-builder — fields with units and real examples, the rule's machines (values + charts), real pieces. */
export const getBuilderContext = (operationId: number, subject?: { type: 'classification' | 'machine'; id: number } | null) =>
  cfApi.get<BuilderContext>(`/operations/${operationId}/formula-builder${subject ? `?subjectType=${subject.type}&subjectId=${subject.id}` : ''}`);

export interface BuilderInput { ref: string; value: number | string | null; chart?: string | null; from: 'typed' | 'piece' | 'machine' | null }
export type BuilderCheck = FormulaCheck & { inputs?: BuilderInput[] };

/** POST /formulas/check on a real piece / machine, typed values laid over them. */
/** machineTypeId (and no machineId) = the STANDARD: the machine type's own values, as release reads them. */
export const checkOnSample = (body: { expression: string; itemId?: number | null; machineId?: number | null; machineTypeId?: number | null; sample?: Record<string, unknown> }) =>
  cfApi.post<BuilderCheck>('/formulas/check', body);
