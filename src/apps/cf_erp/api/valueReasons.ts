import { cfApi } from './client';

/**
 * GET /records/:id/value-reasons — WHY a record asks for each of its values
 * (services/valueReasonService.js). A value is on the list because the record's
 * flow reads it, because somebody set a rule by hand, or it comes by itself.
 * "Smallest set of specs for easy filling" (user, 2026-10-10): the screen has to
 * be able to say which hand-made value nothing reads.
 */
export interface ReasonOperation { id: number; code: string; name: string }
export interface ReasonFlow { id: number; code: string; name: string }
/** Where a rule was made: 'Family' | 'Subfamily' | 'Variant' | 'Template definition' | 'This item' | 'This definition'. */
export interface ReasonLevel { level: string; code?: string | null; name: string | null }

export type ValueReason =
  /** Its flow reads it: the operations whose time formulas name it. Empty on a frozen row whose flow has since changed. */
  | { kind: 'flow'; flow: ReasonFlow | null; operations: ReasonOperation[] }
  /** Set by hand at `at`. `readBy` empty = nothing in its flow reads it. */
  | { kind: 'manual'; at: ReasonLevel; readBy: ReasonOperation[] }
  /** Comes by itself. */
  | { kind: 'derived'; how: 'calculated' | 'rollup' | 'inherited' | 'fixed' | 'defaulted'; at: ReasonLevel; readBy?: ReasonOperation[]; note?: string; formula?: { code: string; name: string } };

export interface AskedValue {
  code: string;
  name: string;
  required: boolean;
  valueRule: string;
  hasValue?: boolean;
  reason: ValueReason;
}

export interface ValueReasons {
  record: { id: number; code: string | null; name: string; kind: string };
  /** The flow the record is made by: its own default, or for an order row the one its BOM line names. */
  flow: ReasonFlow | null;
  /** A row of a frozen or released line: its list was fixed at freeze. */
  frozen: { reason: 'locked' | 'released' | 'closed'; orderCode: string | null; lineNo: number | null } | null;
  values: AskedValue[];
  /** Values the record still holds that nothing asks for any more. */
  notAsked: { code: string; name: string; display: string }[];
}

export const getValueReasons = (recordId: number) => cfApi.get<ValueReasons>(`/records/${recordId}/value-reasons`);
