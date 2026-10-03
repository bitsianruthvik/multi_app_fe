import { useEffect, useRef, useState } from 'react';
import { Box, TextField, Typography } from '@mui/material';
import { SheetGrid, type SheetCell, type SheetWrite } from '@shared/ui';
import { CfApiError } from '../api/client';
import { getQuote, type QuoteInput, type RfqDetail, type RfqLine, type RfqSupplier } from '../api/procurement';
import { dayText } from '../lib/money';
import { qtyText } from '../lib/inventory';
import { emptyQuoteLine, pricedLines, quoteLineBody, readQuoteCell, type QuoteCol, type QuoteDraftLine } from '../lib/procurement';
import { FormDialog } from './FormDialog';
import { ErrorNotice, Mono } from './ui';

const COLUMNS: { key: QuoteCol; label: string; width: number; kind: SheetCell['kind']; align?: 'right' }[] = [
  { key: 'unitPrice', label: 'Unit price ₹ (before GST)', width: 150, kind: 'number', align: 'right' },
  { key: 'gstRate', label: 'GST %', width: 80, kind: 'number', align: 'right' },
  { key: 'leadTimeDays', label: 'Lead time (days)', width: 110, kind: 'number', align: 'right' },
  { key: 'qtyOffered', label: 'Qty offered', width: 100, kind: 'number', align: 'right' },
  { key: 'remark', label: 'Remark', width: 220, kind: 'text' },
];

export type QuoteDraft = Record<number, QuoteDraftLine>;

/**
 * The quote as a grid: one row per RFQ line, the supplier's price, GST, lead time, quantity and a remark across.
 * Paste a block from the supplier's Excel and it lands cell by cell; a cell that is not a number is refused in words.
 * An empty price means "not quoted", which the comparison shows as such — never as zero.
 */
export function QuoteGrid({ lines, draft, onDraft, historyKey }: { lines: RfqLine[]; draft: QuoteDraft; onDraft: (next: QuoteDraft) => void; historyKey?: string }) {
  const [problem, setProblem] = useState<string | null>(null);
  // The grid clears its own message after a write; ours (a refused cell) must survive that one clear.
  const refused = useRef(false);
  const onGridProblem = (message: string | null) => { if (message === null && refused.current) { refused.current = false; return; } setProblem(message); };
  const onWrites = (writes: SheetWrite[]) => {
    const next: QuoteDraft = { ...draft };
    const bad: string[] = [];
    for (const w of writes) {
      const id = Number(w.rowKey);
      const read = readQuoteCell(w.colKey as QuoteCol, w.text);
      if (!read.ok) { bad.push(read.why); continue; }
      next[id] = { ...(next[id] ?? emptyQuoteLine()), [w.colKey]: read.text };
    }
    onDraft(next);
    refused.current = bad.length > 0;
    setProblem(bad.length ? `${bad.slice(0, 2).join('; ')}${bad.length > 2 ? ` (and ${bad.length - 2} more)` : ''} — left as it was.` : null);
  };
  const cellAt = (rowKey: string, colKey: string): SheetCell => {
    const col = COLUMNS.find((c) => c.key === colKey);
    const text = draft[Number(rowKey)]?.[colKey as QuoteCol] ?? '';
    return { text, editable: true, kind: col?.kind ?? 'text', tone: colKey === 'unitPrice' && text === '' ? 'warning' : 'normal', title: colKey === 'unitPrice' && text === '' ? 'Empty means not quoted' : undefined };
  };
  return (
    <Box data-testid="quote-grid">
      <SheetGrid ariaLabel="Quote prices" cornerHeader="Line" rowHeaderWidth={280} onProblem={onGridProblem} hint={null} historyKey={historyKey}
        columns={COLUMNS.map((c) => ({ key: c.key, label: c.label, header: c.label, width: c.width, align: c.align }))}
        rows={lines.map((l) => ({
          key: String(l.id), label: l.item.code ?? l.item.name,
          header: (
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, minWidth: 0 }} title={`${l.item.name} — ${qtyText(l.quantity)} ${l.item.uom}`}>
              <Mono muted>{l.lineNo}</Mono>
              <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.item.code ?? l.item.name}</Box>
              <Box component="span" sx={{ color: 'var(--c-text-3)', fontSize: 11.5, flexShrink: 0 }}>{qtyText(l.quantity)} {l.item.uom}</Box>
            </Box>
          ),
        }))}
        cellAt={cellAt} onWrites={onWrites} />
      <Typography role={problem ? 'alert' : undefined} sx={{ fontSize: 12.5, mt: 0.75, color: problem ? 'var(--c-danger-800)' : 'var(--c-text-3)' }}>
        {problem ?? 'Type, or paste a block of price, GST %, lead time, quantity and remark from Excel. Leave a price empty if the supplier did not quote that line.'}
      </Typography>
    </Box>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

/** Entering (or correcting) one supplier's quote for an RFQ. The caller says where it goes (the PO's POST /quotes). */
export function QuoteDialog({ rfq, entry, onClose, onSave }: { rfq: RfqDetail; entry: RfqSupplier | null; onClose: () => void; onSave: (body: QuoteInput) => Promise<unknown> }) {
  const [quoteRef, setQuoteRef] = useState('');
  const [receivedOn, setReceivedOn] = useState(today());
  const [validUntil, setValidUntil] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [freight, setFreight] = useState('');
  const [notes, setNotes] = useState('');
  const [draft, setDraft] = useState<QuoteDraft>({});
  const [loadError, setLoadError] = useState<CfApiError | null>(null);
  const quoteId = entry?.quote?.id ?? null;

  useEffect(() => {
    if (!entry) return;
    setQuoteRef(''); setReceivedOn(today()); setValidUntil(''); setPaymentTerms(''); setFreight(''); setNotes(''); setLoadError(null);
    const blank: QuoteDraft = {};
    for (const l of rfq.lines) blank[l.id] = emptyQuoteLine();
    setDraft(blank);
    if (!quoteId) return;
    let alive = true;
    getQuote(quoteId).then((q) => {
      if (!alive) return;
      setQuoteRef(q.quoteRef ?? ''); setReceivedOn(dayText(q.receivedOn) || today()); setValidUntil(dayText(q.validUntil));
      setPaymentTerms(q.paymentTerms ?? ''); setFreight(q.freightAmount == null ? '' : String(q.freightAmount)); setNotes(q.notes ?? '');
      const filled: QuoteDraft = { ...blank };
      for (const l of q.lines) {
        filled[l.rfqLineId] = {
          unitPrice: l.unitPrice == null ? '' : String(l.unitPrice), gstRate: l.gstRate == null ? '' : String(l.gstRate),
          leadTimeDays: l.leadTimeDays == null ? '' : String(l.leadTimeDays), qtyOffered: l.qtyOffered == null ? '' : String(l.qtyOffered), remark: l.remark ?? '',
        };
      }
      setDraft(filled);
    }).catch(() => { if (alive) setLoadError(new CfApiError(0, "The earlier quote could not be loaded, so the boxes start empty. Saving replaces that supplier's quote.")); });
    return () => { alive = false; };
  }, [entry?.id, quoteId]); // eslint-disable-line react-hooks/exhaustive-deps

  const priced = pricedLines(draft);
  const save = async () => {
    if (!entry) return;
    if (!priced) throw new CfApiError(0, 'No line has a price yet. If the supplier is not quoting, use "Declined" instead.');
    const freightText = freight.replace(/[₹,\s]/g, '');
    if (freightText && !/^\d+(\.\d+)?$/.test(freightText)) throw new CfApiError(0, 'Freight must be a number, or empty.');
    await onSave({
      supplierId: entry.supplier.id, quoteRef: quoteRef.trim() || null, receivedOn: receivedOn || null, validUntil: validUntil || null,
      paymentTerms: paymentTerms.trim() || null, freightAmount: freightText ? Number(freightText) : null, notes: notes.trim() || null,
      lines: rfq.lines.map((l) => quoteLineBody(l.id, draft[l.id] ?? emptyQuoteLine())),
    });
  };

  return (
    <FormDialog open={!!entry} title={entry ? `Quote from ${entry.supplier.name}` : 'Quote'} maxWidth="lg" onClose={onClose} onSubmit={save}
      submitLabel={quoteId ? 'Save the quote' : 'Enter the quote'} enterSubmits={false}
      subtitle={`${rfq.code} — prices are before GST. ${priced} of ${rfq.lines.length} ${rfq.lines.length === 1 ? 'line' : 'lines'} priced.`}>
      <ErrorNotice error={loadError} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' }, gap: 2, mb: 2 }}>
        <TextField label="Their quote number" value={quoteRef} onChange={(e) => setQuoteRef(e.target.value)} />
        <TextField label="Received on" type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} InputLabelProps={{ shrink: true }} />
        <TextField label="Valid until" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} InputLabelProps={{ shrink: true }}
          helperText="After this date the quote cannot be awarded" />
        <TextField label="Payment terms" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="e.g. 30 days from delivery" />
        <TextField label="Freight (₹, whole quote)" value={freight} onChange={(e) => setFreight(e.target.value)} inputProps={{ inputMode: 'decimal' }}
          helperText="Shared over the lines by amount when comparing" />
        <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Box>
      <QuoteGrid lines={rfq.lines} draft={draft} onDraft={setDraft} historyKey={`${rfq.id}:${entry?.id ?? ''}`} />
    </FormDialog>
  );
}
