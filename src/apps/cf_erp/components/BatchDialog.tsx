import { useEffect, useState } from 'react';
import { TextField } from '@mui/material';
import { cfApi } from '../api/client';
import type { BatchDetail } from '../api/types';
import { FormDialog } from './FormDialog';

/**
 * Corrects what a batch says about itself beyond its specifications — the
 * supplier's lot and a note. Its item, receipt and quantities are the ledger's
 * and are never edited here.
 */
export function BatchDialog({ open, batch, onClose, onSaved }: { open: boolean; batch: BatchDetail; onClose: () => void; onSaved: (b: BatchDetail) => void }) {
  const [supplierRef, setSupplierRef] = useState('');
  const [notes, setNotes] = useState('');
  useEffect(() => { if (open) { setSupplierRef(batch.supplierRef ?? ''); setNotes(batch.notes ?? ''); } }, [open, batch]);
  const save = async () => onSaved(await cfApi.put<BatchDetail>(`/batches/${batch.id}`, { supplierRef: supplierRef || null, notes: notes || null }));
  return (
    <FormDialog open={open} title={`Edit ${batch.code}`} onClose={onClose} onSubmit={save}
      subtitle="The supplier's lot and a note. Heat numbers and other recorded values are changed in the table, which keeps their history.">
      <TextField label="Supplier's lot" value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} autoFocus inputProps={{ style: { fontFamily: 'var(--font-mono)' } }}
        helperText="As printed on the supplier's paperwork" />
      <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} multiline minRows={2} />
    </FormDialog>
  );
}
