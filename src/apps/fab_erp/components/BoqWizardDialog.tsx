import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, MenuItem, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import DownloadIcon from '@mui/icons-material/Download';

import api, { API_HOST } from '@core/utils/axiosConfig';
import { Surface } from '../components';
import { DEFAULT_PARTS } from '../types';

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

export interface WizardLine {
  id: number;
  code?: string | null;
  description?: string | null;
  lineType?: string | null;
}

export default function BoqWizardDialog({ open, orderId, lines, onClose }: {
  open: boolean;
  orderId: number;
  /** The order's lines. The chosen one supplies the span code and the defaults. */
  lines: WizardLine[];
  onClose: () => void;
}) {
  const [lineId, setLineId] = useState<number | ''>('');
  const [girders, setGirders] = useState('6');
  const [segments, setSegments] = useState('5');
  /** Per-girder overrides, index 0 = G1. Blank means "use the default above". */
  const [perGirder, setPerGirder] = useState<string[]>([]);
  const [parts, setParts] = useState<PartSpec[]>([blankPart()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const line = lines.find((l) => l.id === lineId) ?? null;
  /**
   * THE SPAN CODE IS THE LINE'S CODE, not a separate thing to type.
   *
   * It was a free text field defaulting to "S1", which meant the sheet's top
   * level and the line it belongs to could disagree — and that match is exactly
   * how an imported row finds its line. Typing it twice was an invitation to
   * get it wrong once.
   */
  const spanCode = line?.code?.trim() ?? '';

  // Opening on a single-line order should not make anyone choose from a list of one.
  useEffect(() => {
    if (!open) return;
    setError('');
    if (lines.length === 1) setLineId(lines[0].id);
  }, [open, lines]);

  /** Picking a line pulls in what that kind of structure is usually made of. */
  useEffect(() => {
    if (!line) return;
    const defaults = line.lineType ? DEFAULT_PARTS[line.lineType] : undefined;
    setParts(defaults?.length
      ? defaults.map((d) => ({ key: nextKey++, code: d.code, name: d.name, qty: '1' }))
      : [blankPart()]);
  }, [line?.id, line?.lineType]); // eslint-disable-line react-hooks/exhaustive-deps

  const setPart = (key: number, patch: Partial<PartSpec>) =>
    setParts((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  const partCount = parts.filter((p) => p.code.trim()).length;
  const g = Math.max(0, Number(girders) || 0);
  const s = Math.max(0, Number(segments) || 0);

  /** What each girder will actually get, after the per-girder overrides. */
  const segmentCounts = Array.from({ length: g }, (_, i) => {
    const raw = perGirder[i];
    const n = raw != null && raw !== '' ? Number(raw) : s;
    return Math.max(0, Number.isFinite(n) ? n : 0);
  });
  const totalSegments = segmentCounts.reduce((a, b) => a + b, 0);
  /**
   * How many times the part list gets laid out.
   *
   * A girder with NO segments still gets one set of parts — the girder is then
   * the assembly. So it is `n || 1` per girder, not the plain segment total:
   * summing segments alone quietly undercounts every collapsed girder, and a
   * preview that disagrees with the sheet it is previewing is worse than none.
   */
  const partSets = g === 0 ? 1 : segmentCounts.reduce((a, n) => a + (n || 1), 0);
  const totalParts = partCount * partSets;

  async function generate() {
    setBusy(true); setError('');
    try {
      const companySlug = localStorage.getItem('companySlug');
      const res = await api.post(
        `${API_HOST}/api/${companySlug}/fab_erp/orders/${orderId}/boq/wizard`,
        {
          spanCode,
          girders: g,
          segmentsPerGirder: s,
          segmentCounts,
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
        </Typography>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2, alignItems: 'flex-start' }}>
          <TextField
            select label="Line item" size="small" value={lineId} sx={{ minWidth: 260 }}
            onChange={(e) => setLineId(e.target.value === '' ? '' : Number(e.target.value))}
            helperText={line
              ? `Span code will be ${spanCode}${line.lineType ? ` · ${line.lineType}` : ''}`
              : 'Its code becomes the top of the sheet'}
          >
            {lines.length === 0 && <MenuItem value="" disabled>No line items yet</MenuItem>}
            {lines.map((l) => (
              <MenuItem key={l.id} value={l.id}>
                {l.code}{l.description ? ` — ${l.description}` : ''}
              </MenuItem>
            ))}
          </TextField>
          <Tooltip title="0 if this job has no girders — the level collapses and parts sit under the span">
            <TextField label="Girders" size="small" type="number" value={girders} sx={{ width: 110 }}
              onChange={(e) => setGirders(e.target.value)} />
          </Tooltip>
          <Tooltip title="The default for every girder. Override individual ones below.">
            <TextField label="Segments each" size="small" type="number" value={segments} sx={{ width: 130 }}
              onChange={(e) => setSegments(e.target.value)} />
          </Tooltip>
        </Box>

        {/* Per-girder override. Girders on one span genuinely differ — an end
            girder need not be cut into the same number of pieces as a middle
            one — and one number for all of them meant deleting rows out of the
            sheet afterwards. Blank means "whatever the default says", so the
            simple case still reads as one number. */}
        {g > 0 && g <= 20 && (
          <Box sx={{ mb: 2 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 1 }}>
              Segments per girder
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {Array.from({ length: g }, (_, i) => (
                <TextField
                  key={i}
                  label={`G${i + 1}`}
                  size="small"
                  type="number"
                  value={perGirder[i] ?? ''}
                  placeholder={String(s)}
                  sx={{ width: 84 }}
                  slotProps={{ inputLabel: { shrink: true } }}
                  onChange={(e) => setPerGirder((prev) => {
                    const next = [...prev];
                    next[i] = e.target.value;
                    return next;
                  })}
                />
              ))}
            </Box>
          </Box>
        )}

        <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 1 }}>
          Parts in every segment
          {line?.lineType && DEFAULT_PARTS[line.lineType] && (
            <Box component="span" sx={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400, color: 'var(--c-text-3)' }}>
              {' '}— filled in from {line.lineType}; edit freely
            </Box>
          )}
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
            : `${totalParts} part row${totalParts === 1 ? '' : 's'} across ${g || 1} girder${g === 1 ? '' : 's'}`
              + `${totalSegments ? ` and ${totalSegments} segment${totalSegments === 1 ? '' : 's'}` : ''},`
              + ' with dimensions left blank for you to fill in.'}
        </Typography>
        {parts.some((p) => p.code.trim().toUpperCase().endsWith('/D')) && (
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mt: 0.75 }}>
            Codes ending <strong>/D</strong> are picked up by the drilled flow rule, so the holed
            variants get drilling without anyone assigning it per item.
          </Typography>
        )}
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
