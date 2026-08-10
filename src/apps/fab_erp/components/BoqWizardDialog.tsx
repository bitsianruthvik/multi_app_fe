import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import DownloadIcon from '@mui/icons-material/Download';

import api, { API_HOST } from '@core/utils/axiosConfig';
import { Surface } from '../components';

/**
 * Structure wizard — scaffolding for the BOQ sheet.
 *
 * It exists to save typing "S1 / G1 / 3" four hundred times, and it produces a
 * SPREADSHEET, never database rows. Everything it lays out is meant to be
 * edited before upload, which is also why nothing here has to be right first
 * time: a wrong guess costs a re-download, not a half-built order.
 *
 * Counts of zero collapse their level, so a PEB with no girders and no segments
 * uses the same wizard as a six-girder span.
 */

interface PartSpec {
  key: number;
  code: string;
  name: string;
  qty: string;
}

let nextKey = 1;
const blankPart = (): PartSpec => ({ key: nextKey++, code: '', name: '', qty: '1' });

export default function BoqWizardDialog({ open, orderId, lineTypes, onClose }: {
  open: boolean;
  orderId: number;
  /** Structure types already on this order's lines, offered as a starting hint. */
  lineTypes: string[];
  onClose: () => void;
}) {
  const [spanCode, setSpanCode] = useState('S1');
  const [girders, setGirders] = useState('6');
  const [segments, setSegments] = useState('5');
  const [parts, setParts] = useState<PartSpec[]>([blankPart()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (open) setError(''); }, [open]);

  const setPart = (key: number, patch: Partial<PartSpec>) =>
    setParts((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  const partCount = parts.filter((p) => p.code.trim()).length;
  const g = Math.max(0, Number(girders) || 0);
  const s = Math.max(0, Number(segments) || 0);
  const totalParts = partCount * Math.max(1, g) * Math.max(1, s);

  async function generate() {
    setBusy(true); setError('');
    try {
      const companySlug = localStorage.getItem('companySlug');
      const res = await api.post(
        `${API_HOST}/api/${companySlug}/fab_erp/orders/${orderId}/boq/wizard`,
        {
          spanCode: spanCode.trim() || 'S1',
          girders: g,
          segmentsPerGirder: s,
          parts: parts.filter((p) => p.code.trim()).map((p) => ({
            code: p.code.trim(),
            name: p.name.trim() || undefined,
            qty: Number(p.qty) || 1,
          })),
        },
        { responseType: 'blob' },
      );
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'Order_BOQ_starter.xlsx'; a.click();
      URL.revokeObjectURL(url);
      onClose();
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string } }; message?: string };
      setError(ax.response?.data?.message ?? ax.message ?? 'Could not build the sheet');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>Build a starting BOQ sheet</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 2 }}>
          This only makes a spreadsheet — nothing is saved to the order. Lay out the shape roughly,
          then fill in dimensions and change whatever you like in Excel before uploading.
          Material and operation flows are set later, on the Nesting sheet and in flow allocation.
          {lineTypes.length > 0 && <> This order&rsquo;s lines are <strong>{lineTypes.join(', ')}</strong>.</>}
        </Typography>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
          <TextField label="Span code" size="small" value={spanCode} sx={{ width: 120 }}
            onChange={(e) => setSpanCode(e.target.value)} />
          <Tooltip title="0 if this job has no girders — the level collapses and parts sit under the span">
            <TextField label="Girders" size="small" type="number" value={girders} sx={{ width: 110 }}
              onChange={(e) => setGirders(e.target.value)} />
          </Tooltip>
          <Tooltip title="Segments in each girder. 0 if the girder is not split.">
            <TextField label="Segments each" size="small" type="number" value={segments} sx={{ width: 130 }}
              onChange={(e) => setSegments(e.target.value)} />
          </Tooltip>
        </Box>

        <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 1 }}>
          Parts in every segment
        </Typography>

        <Surface e={1} sx={{ p: 1.5, mb: 1 }}>
          {parts.map((p) => (
            <Box key={p.key} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <TextField label="Code" size="small" value={p.code} sx={{ width: 96 }} placeholder="TF1"
                onChange={(e) => setPart(p.key, { code: e.target.value })} />
              <TextField label="Part name" size="small" value={p.name} sx={{ flex: '2 1 180px' }} placeholder="Top Flange"
                onChange={(e) => setPart(p.key, { name: e.target.value })} />
              <TextField label="Qty" size="small" type="number" value={p.qty} sx={{ width: 76 }}
                onChange={(e) => setPart(p.key, { qty: e.target.value })} />
              <IconButton size="small" color="error" aria-label="Remove part"
                onClick={() => setParts((ps) => (ps.length > 1 ? ps.filter((x) => x.key !== p.key) : ps))}>
                <DeleteOutlineRounded fontSize="small" />
              </IconButton>
            </Box>
          ))}
          <Button size="small" startIcon={<AddIcon />} onClick={() => setParts((ps) => [...ps, blankPart()])}>
            Add part
          </Button>
        </Surface>

        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>
          {partCount === 0
            ? 'Add at least one part — or generate anyway to get just the span and girder rows.'
            : `${totalParts} part row${totalParts === 1 ? '' : 's'} will be laid out, with dimensions left blank for you to fill in.`}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <DownloadIcon />}
          disabled={busy}
          onClick={generate}
        >
          Download sheet
        </Button>
      </DialogActions>
    </Dialog>
  );
}
