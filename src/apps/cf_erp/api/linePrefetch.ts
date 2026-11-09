/**
 * The reads an order line's Structure & values group makes when it opens — the exact paths its screens ask
 * (BomPanel: values and drawings; useBom: placeholders; the banners: drawing import, standard, curve). Reads only:
 * the structure itself is not here, since reading it may choose selections. pages/OrderDetail starts them while the
 * order's process is still being read (api/client prefetchGet); each screen then takes its answer.
 */
export function lineReadPaths(orderId: number, lineId: number, { hasStandard }: { hasStandard: boolean }): string[] {
  return [
    `/order-lines/${lineId}/values`,
    `/orders/${orderId}/lines/${lineId}/drawings`,
    `/order-lines/${lineId}/placeholders`,
    `/order-lines/${lineId}/drawing-import`,
    ...(hasStandard ? [`/order-lines/${lineId}/standard`, `/order-lines/${lineId}/curve`] : []),
  ];
}
