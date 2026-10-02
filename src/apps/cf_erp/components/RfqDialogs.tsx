import { useEffect, useState } from 'react';
import { Box, TextField } from '@mui/material';
import type { MasterRecord, Party } from '../api/types';
import { addRequestLine, addRfqSupplier, makeRfq, type RequestDetail, type RequestLine, type RfqDetail } from '../api/procurement';
import { qtyText } from '../lib/inventory';
import { FormDialog } from './FormDialog';
import { PartyPicker } from './ServerPicker';
import { RecordPicker } from './RecordPicker';
import { Mono } from './ui';

/**
 * Adding a supplier to an RFQ: only parties with the supplier role, with their email beside the name so the buyer
 * can see at once who has no address to send to. Reading parties needs the sales permission; a refusal is said.
 */
export function AddSupplierDialog({ open, rfqId, taken, onClose, onAdded }: { open: boolean; rfqId: number; taken: number[]; onClose: () => void; onAdded: (r: RfqDetail) => void }) {
  // Searched on the server as you type, so a supplier past the first 200 can still be found.
  const [chosen, setChosen] = useState<Party | null>(null);
  const [email, setEmail] = useState('');
  useEffect(() => { if (open) { setChosen(null); setEmail(''); } }, [open]);
  const already = !!chosen && taken.includes(chosen.id);
  const save = async () => { if (chosen) onAdded(await addRfqSupplier(rfqId, { supplierId: chosen.id, contactEmail: email.trim() || null })); };
  return (
    <FormDialog open={open} title="Ask a supplier to quote" onClose={onClose} onSubmit={save} submitLabel="Add" maxWidth="xs" submitDisabled={!chosen || already}>
      <PartyPicker role="supplier" value={chosen} onChange={setChosen} autoFocus error={already}
        helperText={already ? 'This supplier is already on this RFQ.' : 'Who should be asked to quote'} />
      {chosen && (
        <TextField label="Send to (optional)" value={email} onChange={(e) => setEmail(e.target.value)} sx={{ mt: 2 }} placeholder={chosen.email ?? 'an email address'}
          helperText={chosen.email ? `Empty = ${chosen.email}` : 'This supplier has no email on file — type one to use for this RFQ'} />
      )}
    </FormDialog>
  );
}

/** Turning approved request lines into an RFQ. */
export function MakeRfqDialog({ open, lines, requestCode, onClose, onMade }: { open: boolean; lines: RequestLine[]; requestCode: string; onClose: () => void; onMade: (r: RfqDetail) => void }) {
  const [quotesDue, setQuotesDue] = useState('');
  const [terms, setTerms] = useState('');
  useEffect(() => { if (open) { setQuotesDue(''); setTerms(''); } }, [open]);
  const save = async () => onMade(await makeRfq({ requestLineIds: lines.map((l) => l.id), quotesDue: quotesDue || null, terms: terms.trim() || null }));
  return (
    <FormDialog open={open} title="Ask suppliers for quotes" onClose={onClose} onSubmit={save} submitLabel="Make the RFQ" maxWidth="sm" submitDisabled={!lines.length}
      subtitle={`${lines.length} ${lines.length === 1 ? 'line' : 'lines'} from ${requestCode}. Next you choose which suppliers to ask.`}>
      <Box sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 2, maxHeight: 140, overflow: 'auto' }}>
        {lines.map((l) => <Box key={l.id}><Mono>{l.item.code ?? '—'}</Mono> {l.item.name} — {qtyText(l.quantity)} {l.item.uom}</Box>)}
      </Box>
      <TextField label="Quotes due by" type="date" value={quotesDue} onChange={(e) => setQuotesDue(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth sx={{ mb: 2 }} />
      <TextField label="Terms (optional)" value={terms} onChange={(e) => setTerms(e.target.value)} fullWidth multiline minRows={2}
        helperText="Printed on the RFQ: delivery place, payment terms you expect, packing" />
    </FormDialog>
  );
}

/** Adding one more line to a draft request. */
export function AddRequestLineDialog({ requestId, onClose, onAdded }: { requestId: number | null; onClose: () => void; onAdded: (r: RequestDetail) => void }) {
  const [item, setItem] = useState<MasterRecord | null>(null);
  const [quantity, setQuantity] = useState('');
  const [neededBy, setNeededBy] = useState('');
  const [price, setPrice] = useState('');
  useEffect(() => { if (requestId) { setItem(null); setQuantity(''); setNeededBy(''); setPrice(''); } }, [requestId]);
  const save = async () => {
    if (requestId && item) onAdded(await addRequestLine(requestId, { itemId: item.id, quantity, neededBy: neededBy || null, ...(price.trim() ? { estUnitPrice: price.trim() } : {}) }));
  };
  return (
    <FormDialog open={!!requestId} title="Add a line" onClose={onClose} onSubmit={save} submitLabel="Add" maxWidth="sm" submitDisabled={!item || !quantity}>
      <RecordPicker kinds={['catalog']} value={item} onChange={setItem} label="Item" activeOnly autoFocus helperText="What is needed" />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
        <TextField label="Quantity" value={quantity} onChange={(e) => setQuantity(e.target.value)} helperText={item?.item?.uom ? `In ${item.item.uom}` : ' '} inputProps={{ inputMode: 'decimal' }} />
        <TextField label="Needed by" type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} InputLabelProps={{ shrink: true }} />
        <TextField label="Est. price ₹" value={price} onChange={(e) => setPrice(e.target.value)} helperText="Empty = last paid" inputProps={{ inputMode: 'decimal' }} />
      </Box>
    </FormDialog>
  );
}
