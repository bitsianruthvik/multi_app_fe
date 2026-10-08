import { cfApi } from './client';

/** Where a chart is read from or set up: a machine type (a classification node) or one machine. */
export type ChartSubject = { type: 'classification' | 'machine'; id: number };
export interface ChartPlace { type: 'classification' | 'machine'; id: number; name: string }

/** The same shape a table specification's value already has. */
export type ChartValue = { x: number[]; v: (number | null)[] } | { x: number[]; y: number[]; v: (number | null)[][] } | null;
export type ChartMode = 'step_up' | 'linear';
export interface ChartField { code: string; name: string; unit: string | null }
export interface ChartAxis { label: string; unit: string | null; field: ChartField | null }

export interface Chart {
  specId: number;
  code: string;
  name: string;
  resultUnit: string | null;
  mode: ChartMode;
  axes: ChartAxis[];
  /** Where the chart is set up. */
  definedAt: ChartPlace | null;
  valueRule: string;
  value: ChartValue;
  valueFrom: ChartPlace | null;
  /** The value sits on THIS machine type / machine. */
  own: boolean;
  /** Operation codes whose time reads it. */
  usedBy: string[];
  /** The bare name usable in a time formula, when every column names a piece's value. */
  shortForm: string | null;
}

/** One column as it is written: read by a piece's value, or a free label with a unit. */
export type AxisInput = { field: string; unit?: string } | { label: string; unit: string };
export interface ChartInput { name: string; resultUnit: string; axes: AxisInput[]; mode?: ChartMode; value?: ChartValue }
export interface ChartChanges { name?: string; resultUnit?: string; axes?: AxisInput[]; mode?: ChartMode }

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
export const putChartValue = (s: ChartSubject, specId: number, value: ChartValue) =>
  cfApi.put<Chart[]>(`${root(s)}/charts/${specId}/values`, { value });
export const updateChart = (specId: number, body: ChartChanges) => cfApi.put<unknown>(`/charts/${specId}`, body);
