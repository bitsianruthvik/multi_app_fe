import { cfApi, LONG_WRITE_MS } from './client';

/**
 * A released line's OPENING POSITION (backend services/openingPositionService.js, init.sql §121): work done before
 * the system, marked done up to a stage — no stock, material, finished-stock or billing posting.
 */
export interface OpeningStage { number: number; name: string; ops: string[] }

export interface OpeningPiece { id: number; parentId: number | null; level: number; code: string; name: string | null; qty: number; children: number }

export interface OpeningView {
  lineId: number;
  lineNo: number;
  releaseId: number;
  order: { id: number; code: string };
  quantity: number;
  /** A line of several units: its top pieces, numbered 1… (empty when there is one row). */
  units: { number: number; id: number; code: string }[];
  stages: OpeningStage[];
  /** The line's top pieces and the level under them, to tick. */
  pieces: OpeningPiece[];
  steps: number;
  openingSteps: number;
  doneSteps: number;
}

export interface OpeningInput {
  /** A stage's number (1…), or 0 = none (take the opening position back). */
  stage: number;
  pieceIds?: number[];
  units?: number[];
  /** YYYY-MM-DD; empty = now. */
  asOf?: string;
  dryRun?: boolean;
}

export interface OpeningAnswer {
  dryRun: boolean;
  lineId: number;
  releaseId: number;
  stage: { number: number; name: string | null };
  asOf: string | null;
  beforeRelease: boolean;
  counts: {
    steps: number; mark: number; markedUnderAssembled: number; alreadyOpening: number; alreadyDone: number; leftStarted: number; leftHeld: number;
    reopen: number; heldReservations: number;
  };
  /** Things to know before applying (pieces of a nested plate left out of a partial scope). */
  warnings: string[];
  byStage: { number: number; name: string; mark: number; reopen: number }[];
  rows: { id: string; code: string; level: number; top: string; mark: number; reopen: number }[];
  message: string;
}

export const getOpeningView = (lineId: number) => cfApi.get<OpeningView>(`/order-lines/${lineId}/opening-position`, { timeoutMs: 120_000 });

export const setOpening = (lineId: number, input: OpeningInput) =>
  cfApi.post<OpeningAnswer>(`/order-lines/${lineId}/opening-position`, input, { timeoutMs: LONG_WRITE_MS });
