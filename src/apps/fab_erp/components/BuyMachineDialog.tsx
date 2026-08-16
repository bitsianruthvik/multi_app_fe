/**
 * BuyMachineDialog — order another machine of this type.
 *
 * Raised against the resource TYPE, not a machine, because the machine does not
 * exist yet: that is the whole point of buying it. The purchase order carries
 * `for_resource_type_id`, so "what have we spent on CNC plate cutting" is a
 * question with an answer once the order lands.
 *
 * Deliberately does NOT create the resource. A machine arriving is a delivery,
 * not an order — creating the resource at order time would put a machine on the
 * schedule weeks before it is on the floor, and the leveller would plan work
 * onto something still on a lorry.
 */

import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, MenuItem, TextField, Typography,
} from '@mui/material';

import { fabQuery } from '../api/client';
import { backendMessage, useToast } from '../components';
import { raiseAssetPurchase } from '../api/assets';

interface Supplier { id: number; code: string; name: string }

export default function BuyMachineDialog({ open, resourceType, onClose, onDone }: {
  open: boolean;
  resourceType: { id: number; name: string; code: string } | null;
  onClose: () => void;
  onDone?: () => void;
}) {
  const { toast } = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState<number | ''>('');
  const [qty, setQty] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError(''); setQty('1'); setUnitPrice(''); setExpectedDate(''); setNotes('');
    fabQuery<{ data: Supplier[] }>('fabErpSupplier', {
      filters: { active: 1 },
      orderBy: [{ field: 'name', direction: 'asc' }],
      pagination: { limit: 500 },
    }).then((r) => setSuppliers(r.data ?? [])).catch(() => setSuppliers([]));
  }, [open]);

  async function raise() {
    if (!resourceType || !supplierId) return;
    setBusy(true); setError('');
    try {
      const res = await raiseAssetPurchase({
        resourceTypeId: resourceType.id,
        supplierId: Number(supplierId),
        expectedDate: expectedDate || null,
        notes: notes.trim() || null,
        lines: [{
          description: `${resourceType.name} (${resourceType.code})`,
          qty: Number(qty) || 1,
          unitPrice: unitPrice.trim() ? Number(unitPrice) : null,
        }],
      });
      toast(`${res.order.orderNumber} raised`, 'success');
      onDone?.();
      onClose();
    } catch (e) {
      setError(backendMessage(e, 'Could not raise that purchase order.'));
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>
        Buy another {resourceType?.name ?? 'machine'}
      </DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

        <TextField select size="small" label="Supplier" value={supplierId}
          onChange={(e) => setSupplierId(e.target.value === '' ? '' : Number(e.target.value))}>
          <MenuItem value="">— choose a supplier —</MenuItem>
          {suppliers.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
        </TextField>

        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField size="small" type="number" label="How many" value={qty} sx={{ width: 130 }}
            inputProps={{ min: 1, step: 1 }} onChange={(e) => setQty(e.target.value)} />
          <TextField size="small" type="number" label="Price each" value={unitPrice} sx={{ flex: 1 }}
            onChange={(e) => setUnitPrice(e.target.value)} />
          <TextField size="small" type="date" label="Expected" value={expectedDate} sx={{ width: 170 }}
            slotProps={{ inputLabel: { shrink: true } }}
            onChange={(e) => setExpectedDate(e.target.value)} />
        </Box>

        <TextField size="small" label="Notes" value={notes} multiline minRows={2}
          onChange={(e) => setNotes(e.target.value)} />

        {/* Stated because it is the reasonable assumption, and it is wrong. */}
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
          This raises the purchase order only. The machine appears on the shop floor when you add it
          as a resource after it arrives — putting it on the schedule now would have the planner
          booking work onto something still on a lorry.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained" disabled={busy || !supplierId || !(Number(qty) > 0)}
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : null}
          onClick={raise}
        >
          Raise purchase order
        </Button>
      </DialogActions>
    </Dialog>
  );
}
