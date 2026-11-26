/**
 * The reads an order line's Structure & values group makes when it opens — the exact paths its screens ask
 * (BomPanel: values and drawings; useBom: placeholders; the banners: drawing import, standard, curve). Reads only.
 * pages/OrderDetail starts them while the order's process is still being read; each screen then takes its answer.
 *
 * ONE STREAMED REQUEST (2026-11-26): they are asked as ONE request, GET /orders/:o/lines/:l/opening (backend
 * routes/lineOpening.js), which sends each part the moment it is ready (api/client prefetchParts): one sign-in check
 * instead of six, one of the browser's six connections to an HTTP/1.1 server instead of six, and each section drawn as
 * its part arrives. A part that does not come is asked of its own endpoint, so nothing depends on the stream.
 */
export function lineReadParts(orderId: number, lineId: number, { hasStandard }: { hasStandard: boolean }): { part: string; path: string }[] {
  return [
    { part: 'values', path: `/order-lines/${lineId}/values` },
    { part: 'drawings', path: `/orders/${orderId}/lines/${lineId}/drawings` },
    { part: 'placeholders', path: `/order-lines/${lineId}/placeholders` },
    { part: 'drawingImport', path: `/order-lines/${lineId}/drawing-import` },
    ...(hasStandard ? [{ part: 'standard', path: `/order-lines/${lineId}/standard` }, { part: 'curve', path: `/order-lines/${lineId}/curve` }] : []),
  ];
}

/** The streamed request that answers lineReadParts' parts. */
export function lineOpeningPath(orderId: number, lineId: number, parts: { part: string }[]): string {
  return `/orders/${orderId}/lines/${lineId}/opening?parts=${parts.map((p) => p.part).join(',')}`;
}

/**
 * The line's structure, started beside the process too (2026-11-26): the grid waits for it, and it was asked only once
 * the process had answered (1–3 s later on production). Its read may choose selections first (backend routes/orders.js,
 * lineSettle.js) — the choosing that opening the Structure step does anyway, once per line, and nothing on a locked or
 * released line or a frozen order; when it chose something the screen reads values and drawings again (BomPanel
 * `autofilled`), whichever moment it was read at.
 */
export const lineStructurePath = (lineId: number) => `/order-lines/${lineId}/structure`;
