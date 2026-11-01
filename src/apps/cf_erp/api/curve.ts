import { cfApi } from './client';

/**
 * An order line on a curved track (GET / PUT /order-lines/:id/curve, services/curveService.js, init.sql §98): the
 * series' curve rule (girders on chords, eccentricity at its maximum degree) and the layout at the line's curve.
 */
export interface CurveRule {
  maxDeg: number; eccentricityAtMaxMm?: number; standardEccentricityMm?: number; layout?: string;
  girderSpacingMm?: number; overallMm?: number; bearingsCcMm?: number; source?: string; note?: string;
}
export interface CurveResults {
  radiusM: number; eccentricityCurveMm: number; standardEccentricityMm: number; eccentricityTotalMm: number;
  halfVersineMm: number | null; angleBetweenSpansDeg: number; outerGapOpeningMm: number | null; spans: number; turnDeg: number;
}
export interface LineCurve {
  lineId: number; orderId: number; standard: { id: number; number: string } | null;
  /** the series is designed for curves (maxDeg > 0) */
  available: boolean; deg: number | null; maxDeg: number | null;
  results: CurveResults | null; problems: string[]; note: string | null; rule: CurveRule | null;
  /** the plan of the spans on the curve (offsets off the arc exaggerated) */
  svg: string | null;
}

export const getLineCurve = (lineId: number) => cfApi.get<LineCurve>(`/order-lines/${lineId}/curve`);
export const setLineCurve = (lineId: number, deg: number | null) => cfApi.put<LineCurve>(`/order-lines/${lineId}/curve`, { deg });
