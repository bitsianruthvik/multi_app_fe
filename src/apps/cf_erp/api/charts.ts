import { cfApi } from './client';

/** Where a chart is read from or set up: a machine type (a classification node) or one machine. */
export type ChartSubject = { type: 'classification' | 'machine'; id: number };
export interface ChartPlace { type: 'classification' | 'machine'; id: number; name: string }

export type ChartMode = 'step_up' | 'linear';
export type ChartLevel = 'FAMILY' | 'SUBFAMILY' | 'VARIANT';
/** A column the chart is read by: a specification of the piece, or a level of the classification tree. */
export type ChartAxis =
  | { kind: 'spec'; field: string; label: string; unit: string | null; dataType: 'number' | 'option' | 'text' }
  | { kind: 'level'; level: ChartLevel; label: 'Family' | 'Subfamily' | 'Variant'; unit: null; dataType: 'level' };
/** [in1, …, inN, result]. A level cell is a classification node id; an option cell its value; the result may be null (= "cannot"). */
export type ChartCell = number | string | null;
export type ChartRow = ChartCell[];
/** Older shapes that may still come back for a moment. */
export type LegacyValue = { x: number[]; v: (number | null)[] } | { x: number[]; y: number[]; v: (number | null)[][] };

export interface Chart {
  specId: number;
  code: string;
  /** The result's name, e.g. Drill time. */
  name: string;
  resultUnit: string | null;
  mode: ChartMode;
  version?: number;
  axes: ChartAxis[];
  /** Where the chart is set up. */
  definedAt: ChartPlace | null;
  valueRule: string;
  rows: ChartRow[] | null;
  value: { rows: ChartRow[] } | LegacyValue | null;
  valueFrom: ChartPlace | null;
  /** The value sits on THIS machine type / machine. */
  own: boolean;
  /** Operation codes whose time reads it. */
  usedBy: string[];
  /** The bare name usable in a time formula. */
  shortForm: string | null;
  /** Names of the tree nodes the level cells use. */
  nodes: Record<number, { code: string; name: string }>;
}

/** One input as it is written: read by a piece's specification (with a unit when it has none), or by a tree level. */
/** `from` = the old column this input was (its values move with it); `fill` = the value existing rows are for, on a new input. */
export type ChartInputSpec = ({ field: string; unit?: string } | { level: ChartLevel }) & { from?: number; fill?: string };
export interface ChartInput { name: string; resultUnit: string; inputs: ChartInputSpec[]; mode?: ChartMode; rows?: ChartRow[] }
export interface ChartChanges { name?: string; resultUnit?: string; inputs?: ChartInputSpec[]; mode?: ChartMode }

export interface MachineTypeDetails {
  node: { id: number; code: string; name: string; depth: number; status: 'active' | 'inactive'; description: string | null };
  path: { id: number; code: string; name: string }[];
  machines: { id: number; code: string; name: string; status: 'active' | 'inactive' }[];
  charts: Chart[];
}

const root = (s: ChartSubject) => (s.type === 'machine' ? `/machines/${s.id}` : `/machine-types/${s.id}`);

export const getMachineTypeDetails = (id: number) => cfApi.get<MachineTypeDetails>(`/machine-types/${id}/details`);
export const getCharts = (s: ChartSubject) => cfApi.get<Chart[]>(`${root(s)}/charts`);
export const addChart = (s: ChartSubject, body: ChartInput) =>
  cfApi.post<{ chartId: number; code: string; charts: Chart[] }>(`${root(s)}/charts`, body);
/** On a machine, `null` drops the machine's own chart (back to the type's). */
export const putChartValue = (s: ChartSubject, specId: number, value: ChartRow[] | null) =>
  cfApi.put<Chart[]>(`${root(s)}/charts/${specId}/values`, { value });
export const updateChart = (specId: number, body: ChartChanges) => cfApi.put<unknown>(`/charts/${specId}`, body);
/** Refused, in words, while a time or formula reads the chart. */
export const deleteChart = (specId: number) => cfApi.del<{ ok: boolean }>(`/charts/${specId}`);
