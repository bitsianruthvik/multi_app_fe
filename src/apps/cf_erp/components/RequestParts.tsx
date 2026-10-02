import { Box, Button, IconButton, Tooltip, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import SendRounded from '@mui/icons-material/SendRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import BlockRounded from '@mui/icons-material/BlockRounded';
import RequestQuoteRounded from '@mui/icons-material/RequestQuoteRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import { SheetGrid, type SheetCell, type SheetWrite } from '@shared/ui';
import type { HistoryEntry, RequestDetail, RequestLine } from '../api/procurement';
import { qtyText } from '../lib/inventory';
import { dayText, rupeeText } from '../lib/money';
import { historyText, REQUEST_LINE_LABEL } from '../lib/procurement';
import { appPath } from '../navMeta';
import { Mono, SectionCard } from './ui';

export type RequestActionKind = 'submit' | 'approve' | 'reject' | 'cancel' | 'make-rfq';

/**
 * The buttons a request offers: each one only when the server says it is `allowed`, and — for the decision —
 * only to someone who may approve. The server decides; the screen never guesses from the status.
 */
export function RequestActionBar({ request, canManage, canApprove, makeRfqCount, onAction }: {
  request: RequestDetail; canManage: boolean; canApprove: boolean; makeRfqCount: number; onAction: (a: RequestActionKind) => void;
}) {
  const a = request.allowed;
  return (
    <>
      {canManage && a.submit && <Button variant="contained" startIcon={<SendRounded />} onClick={() => onAction('submit')}>Submit for approval</Button>}
      {canApprove && a.approve && <Button variant="contained" color="success" startIcon={<CheckRounded />} onClick={() => onAction('approve')}>Approve</Button>}
      {canApprove && a.reject && <Button color="error" startIcon={<CloseRounded />} onClick={() => onAction('reject')}>Reject</Button>}
      {canManage && a.makeRfq && makeRfqCount > 0 && <Button variant="contained" startIcon={<RequestQuoteRounded />} onClick={() => onAction('make-rfq')}>Make RFQ ({makeRfqCount} {makeRfqCount === 1 ? 'line' : 'lines'})</Button>}
      {canManage && a.cancel && <Button color="error" startIcon={<BlockRounded />} onClick={() => onAction('cancel')}>Cancel</Button>}
    </>
  );
}

const COLS = [
  { key: 'quantity', label: 'Quantity', width: 100, kind: 'number' as const },
  { key: 'neededBy', label: 'Needed by', width: 130, kind: 'date' as const },
  { key: 'estUnitPrice', label: 'Est. price ₹', width: 120, kind: 'number' as const },
  { key: 'estAmount', label: 'Est. amount', width: 130, kind: 'text' as const },
  { key: 'status', label: 'State', width: 110, kind: 'text' as const },
];

/** The lines as a grid: typed in place while the request is a draft, read-only after. Paste a column from Excel to fill it. */
export function RequestLinesGrid({ request, company, editable, picked, onPick, onWrite, onRemove }: {
  request: RequestDetail; company: string; editable: boolean;
  /** Approved open lines chosen for an RFQ; null = no picking (nothing can go to an RFQ). */
  picked: Set<number> | null; onPick: (lineId: number, on: boolean) => void;
  onWrite: (line: RequestLine, changes: { quantity?: string; neededBy?: string | null; estUnitPrice?: string | null }) => void; onRemove: (line: RequestLine) => void;
}) {
  const byKey = new Map(request.lines.map((l) => [String(l.id), l]));
  const cellAt = (rowKey: string, colKey: string): SheetCell => {
    const l = byKey.get(rowKey);
    if (!l) return { text: '' };
    const live = editable && l.status === 'open';
    switch (colKey) {
      case 'quantity': return { text: qtyText(l.quantity), editable: live, kind: 'number' };
      case 'neededBy': return { text: dayText(l.neededBy), editable: live, kind: 'date' };
      case 'estUnitPrice': return { text: l.estUnitPrice == null ? '' : String(l.estUnitPrice), editable: live, kind: 'number', tone: l.estUnitPrice == null ? 'warning' : 'normal', title: l.estUnitPrice == null ? 'No price known — empty is not zero' : undefined };
      case 'estAmount': return { text: l.estAmount == null ? 'not priced' : rupeeText(l.estAmount, 2), editable: false, tone: 'muted' };
      default: return { text: REQUEST_LINE_LABEL[l.status], editable: false, tone: 'muted' };
    }
  };
  const onWrites = (writes: SheetWrite[]) => {
    const per = new Map<string, Record<string, string>>();
    for (const w of writes) per.set(w.rowKey, { ...(per.get(w.rowKey) ?? {}), [w.colKey]: w.text.trim() });
    for (const [key, ch] of per) {
      const line = byKey.get(key);
      if (!line) continue;
      onWrite(line, {
        ...(ch.quantity !== undefined ? { quantity: ch.quantity } : {}),
        ...(ch.neededBy !== undefined ? { neededBy: ch.neededBy || null } : {}),
        ...(ch.estUnitPrice !== undefined ? { estUnitPrice: ch.estUnitPrice || null } : {}),
      });
    }
  };
  return (
    <SheetGrid ariaLabel="Request lines" cornerHeader="Item" rowHeaderWidth={320} hint={null} historyKey={String(request.id)}
      columns={COLS.map((c) => ({ key: c.key, label: c.label, header: c.label, width: c.width, align: c.key === 'neededBy' || c.key === 'status' ? undefined : ('right' as const) }))}
      rows={request.lines.map((l) => ({
        key: String(l.id), label: l.item.code ?? l.item.name,
        lead: picked && l.status === 'open' ? (
          <input type="checkbox" checked={picked.has(l.id)} onChange={(e) => onPick(l.id, e.target.checked)} aria-label={`Include ${l.item.code ?? l.item.name} in the RFQ`} />
        ) : undefined,
        header: (
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, minWidth: 0 }} title={l.item.name}>
            <Mono muted>{l.lineNo}</Mono>
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.item.code ?? l.item.name} <Box component="span" sx={{ color: 'var(--c-text-3)', fontSize: 11.5 }}>{l.item.uom}</Box></Box>
          </Box>
        ),
        trail: (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {l.rfq && <Mono chip><Link to={appPath(company, `rfqs/${l.rfq.id}`)} style={{ color: 'inherit', textDecoration: 'none' }}>{l.rfq.code}</Link></Mono>}
            {l.po && <Mono chip><Link to={appPath(company, `purchase-orders/${l.po.id}`)} style={{ color: 'inherit', textDecoration: 'none' }}>{l.po.code}</Link></Mono>}
            {editable && l.status === 'open' && (
              <Tooltip title="Remove the line"><IconButton size="small" aria-label={`Remove ${l.item.code ?? l.item.name}`} onClick={() => onRemove(l)}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
            )}
          </Box>
        ),
      }))}
      cellAt={cellAt} onWrites={onWrites} />
  );
}

/** Who did what to the request, and why. */
export function RequestHistory({ history }: { history: HistoryEntry[] }) {
  if (!history.length) return null;
  return (
    <SectionCard title="History" subtitle="Who decided what, and why">
      <Box data-testid="request-history" sx={{ display: 'grid', gap: 1 }}>
        {history.map((h, i) => (
          <Box key={i} sx={{ fontSize: 13.5 }}>
            <Mono muted>{dayText(h.at) || '—'}</Mono> {historyText(h)}
            {h.note && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', whiteSpace: 'pre-wrap' }}>“{h.note}”</Typography>}
          </Box>
        ))}
      </Box>
    </SectionCard>
  );
}
