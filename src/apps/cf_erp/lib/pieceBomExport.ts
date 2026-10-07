import type { PieceCodeNode, PieceCodeItem } from '../api/pieceCodes';
import type { Table } from './dashboardExport';

/**
 * The BOM a frozen (or about-to-be-frozen) line builds, as one table — every
 * piece and every group of identical parts, a parent before its children, the
 * way the Freeze stage's tree shows them. What the Excel / CSV download writes.
 */
export function pieceBomTable(nodes: PieceCodeNode[], items: Record<string, PieceCodeItem>): Table {
  const columns = ['Level', 'Code', 'Parent code', 'Kind', 'No.', 'Quantity', 'UOM', 'Item code', 'Item name'];
  const rows = nodes.map((n) => {
    const it = items[String(n.itemId)];
    const parent = n.parentK == null ? null : nodes[n.parentK];
    return [
      n.depth,
      n.code,
      parent?.code ?? '',
      n.pieceNo != null ? 'Piece' : 'Group of identical parts',
      n.pieceSeq == null ? '' : String(n.pieceSeq),
      Number(n.quantity),
      it?.uom ?? '',
      it?.code ?? '',
      it?.name ?? n.label ?? '',
    ];
  });
  return { name: 'BOM', columns, rows };
}

/** "SO-…-0003 line 10 BOM" → a file name with nothing a file system dislikes. */
export const bomFileStem = (orderCode: string, lineNo: number) => `${orderCode}-line-${lineNo}-BOM`.replace(/[^A-Za-z0-9._-]+/g, '-');
