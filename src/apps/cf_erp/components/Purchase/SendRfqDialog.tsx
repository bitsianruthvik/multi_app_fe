import { useEffect, useState } from 'react';
import { Box, Chip, TextField, Typography } from '@mui/material';
import { sendRfq, type PoQuotes } from '../../api/purchase';
import type { Party } from '../../api/types';
import { FormDialog } from '../FormDialog';
import { PartyPicker } from '../ServerPicker';

/**
 * Asking suppliers to quote: choose one or more suppliers and when quotes are due. Asking again later with new
 * suppliers adds them to the same RFQ (`taken` are the ones already asked).
 */
export function SendRfqDialog({ open, po, taken, onClose, onSent }: {
  open: boolean;
  po: { id: number; code: string; lines: number };
  taken: number[];
  onClose: () => void;
  onSent: (r: PoQuotes) => void;
}) {
  const [chosen, setChosen] = useState<Party[]>([]);
  const [picker, setPicker] = useState<Party | null>(null);
  const [quotesDue, setQuotesDue] = useState('');
  const [terms, setTerms] = useState('');
  useEffect(() => { if (open) { setChosen([]); setPicker(null); setQuotesDue(''); setTerms(''); } }, [open]);
  const add = (p: Party | null) => {
    setPicker(null);
    if (p && !chosen.some((c) => c.id === p.id) && !taken.includes(p.id)) setChosen([...chosen, p]);
  };
  const first = taken.length === 0;
  const save = async () => onSent(await sendRfq(po.id, { supplierIds: chosen.map((c) => c.id), ...(first ? { quotesDue: quotesDue || null, terms: terms.trim() || null } : {}) }));
  return (
    <FormDialog open={open} title={first ? 'Send the RFQ' : 'Ask more suppliers'} maxWidth="sm" onClose={onClose} onSubmit={save} enterSubmits={false}
      submitLabel={first ? 'Send RFQ' : 'Add suppliers'} submitDisabled={chosen.length === 0}
      subtitle={`${po.code} — ${po.lines} ${po.lines === 1 ? 'line' : 'lines'} go to every supplier chosen. Print or email the RFQ from the next screen.`}>
      <PartyPicker role="supplier" value={picker} onChange={add} label="Add a supplier" autoFocus helperText="Search and pick as many as you want to ask" />
      <Box data-testid="rfq-chosen" sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', minHeight: 28 }}>
        {chosen.length === 0 && <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>No supplier chosen yet.</Typography>}
        {chosen.map((c) => <Chip key={c.id} size="small" label={c.name} onDelete={() => setChosen(chosen.filter((x) => x.id !== c.id))} />)}
      </Box>
      {first && (
        <>
          <TextField label="Quotes due by" type="date" value={quotesDue} onChange={(e) => setQuotesDue(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
          <TextField label="Terms (optional)" value={terms} onChange={(e) => setTerms(e.target.value)} fullWidth multiline minRows={2}
            helperText="Printed on the RFQ: delivery place, payment terms you expect, packing" />
        </>
      )}
    </FormDialog>
  );
}
