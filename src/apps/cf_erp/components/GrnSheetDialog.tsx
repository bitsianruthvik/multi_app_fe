import { useRef, useState, type ChangeEvent } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import UploadFileRounded from '@mui/icons-material/UploadFileRounded';
import { CfApiError } from '../api/client';
import { fileToBase64 } from '../api/bomSheet';
import { applyGrnSheet, downloadGrnSheet, previewGrnSheet, type GrnResult, type GrnSheetResult } from '../api/grn';
import { qtyText } from '../lib/inventory';
import { rupeeText } from '../lib/money';
import { ErrorNotice, Mono } from './ui';

/**
 * Receive from Excel (backend services/grnSheetService.js): download the PO's GRN sheet, fill it (or bring a prepared
 * one — rows are matched by ITEM CODE, so a file made for another PO with the same items applies, with a note), see the
 * preview (every problem at once; nothing is booked), then book ONE GRN — the same save as the GRN dialog.
 */
export function GrnSheetDialog({ po, onClose, onBooked }: {
  po: { id: number; code: string } | null; onClose: () => void; onBooked: (r: GrnResult) => void;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<{ name: string; base64: string } | null>(null);
  const [result, setResult] = useState<GrnSheetResult | null>(null);
  const [busy, setBusy] = useState<'download' | 'preview' | 'apply' | null>(null);
  const [error, setError] = useState<CfApiError | null>(null);

  const fail = (e: unknown) => setError(e instanceof CfApiError ? e : new CfApiError(0, e instanceof Error ? e.message : String(e)));
  const reset = () => { setFile(null); setResult(null); setError(null); };
  const close = () => { if (busy) return; reset(); onClose(); };

  const download = async () => {
    if (!po) return;
    setBusy('download'); setError(null);
    try { await downloadGrnSheet(po.id, po.code); } catch (e) { fail(e); } finally { setBusy(null); }
  };
  const choose = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !po) return;
    setBusy('preview'); setError(null); setResult(null);
    try {
      const base64 = await fileToBase64(f);
      setFile({ name: f.name, base64 });
      setResult(await previewGrnSheet(po.id, base64));
    } catch (err) { fail(err); } finally { setBusy(null); }
  };
  const apply = async () => {
    if (!po || !file) return;
    setBusy('apply'); setError(null);
    try {
      const res = await applyGrnSheet(po.id, file.base64);
      if (!res.applied || !res.bill || !res.order) { setResult(res); return; }
      reset();
      onBooked({ bill: res.bill, movements: res.movements ?? [], held: res.held ?? [], order: res.order, warnings: res.warnings });
    } catch (err) { fail(err); } finally { setBusy(null); }
  };

  const problems = result?.problems ?? [];
  return (
    <Dialog open={!!po} onClose={close} fullWidth maxWidth="md" PaperProps={{ 'data-testid': 'grn-sheet-dialog' } as object}>
      <DialogTitle>
        Receive from Excel
        <Box sx={{ fontSize: 13, fontWeight: 400, color: 'var(--c-text-2)', mt: 0.5 }}>
          {po?.code}. Download the GRN sheet, fill the white cells, upload it. Rows are matched by item code, so a sheet prepared for another PO with the same items works too.
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        <ErrorNotice error={error} />
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
          <Button variant="outlined" startIcon={busy === 'download' ? <CircularProgress size={14} /> : <DownloadRounded />} onClick={() => void download()} disabled={!!busy} data-testid="grn-sheet-download">Download GRN sheet</Button>
          <Button variant="outlined" startIcon={busy === 'preview' ? <CircularProgress size={14} /> : <UploadFileRounded />} onClick={() => input.current?.click()} disabled={!!busy} data-testid="grn-sheet-upload">{file ? 'Upload another file' : 'Upload filled sheet'}</Button>
          <input ref={input} type="file" accept=".xlsx" hidden onChange={(e) => void choose(e)} />
        </Box>
        {file && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 1, overflowWrap: 'anywhere' }}>{file.name}</Typography>}
        {result && (
          <Box sx={{ display: 'grid', gap: 1 }} data-testid="grn-sheet-preview">
            <Alert severity={problems.length ? 'error' : 'success'}>
              {problems.length ? 'Nothing has been booked. Fix these and upload the file again.' : `Preview: ${result.summary.sentence}. Nothing is booked until you press Book GRN.`}
            </Alert>
            {problems.length > 0 && (
              <Box component="ul" sx={{ m: 0, pl: 2.5, color: 'var(--c-danger-800)' }}>
                {problems.map((p) => <li key={p}><Typography sx={{ fontSize: 13 }}>{p}</Typography></li>)}
              </Box>
            )}
            {result.notes.map((n) => <Alert key={n} severity="info" sx={{ py: 0 }}>{n}</Alert>)}
            {result.warnings.map((w) => <Alert key={w} severity="warning" sx={{ py: 0 }}>{w}</Alert>)}
            {!problems.length && result.changes.length > 0 && (
              <Box component="table" sx={{ borderCollapse: 'collapse', width: '100%', '& th': { fontSize: 11.5, fontWeight: 600, color: 'var(--c-text-2)', textAlign: 'left', p: 0.5 }, '& td': { fontSize: 12.5, p: 0.5, borderTop: '1px solid var(--c-border)' }, '& .n': { textAlign: 'right' } }}>
                <thead><tr><th>Item</th><th className="n">Receive</th><th className="n">Pending</th><th className="n">Unit price</th><th>Batch</th><th>Sheet row</th></tr></thead>
                <tbody>
                  {result.changes.map((x) => (
                    <tr key={x.lineId}>
                      <td><Mono>{x.itemCode ?? '—'}</Mono> <Box component="span" sx={{ color: 'var(--c-text-3)' }}>{x.itemName}</Box></td>
                      <td className="n"><Mono>{qtyText(x.quantity)}</Mono> {x.uom}</td>
                      <td className="n"><Mono muted>{qtyText(x.pending)}</Mono></td>
                      <td className="n"><Mono>{x.unitPrice == null ? '—' : rupeeText(x.unitPrice, 2)}</Mono></td>
                      <td>{x.batch ?? '—'}</td>
                      <td>{x.rows.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </Box>
            )}
            {!problems.length && result.summary.total != null && (
              <Typography sx={{ fontSize: 13, textAlign: 'right' }}>Bill total <Mono>{rupeeText(result.summary.total, 2)}</Mono></Typography>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={!!busy}>{result?.ok ? 'Cancel' : 'Close'}</Button>
        {result?.ok && !result.applied && (
          <Button variant="contained" onClick={() => void apply()} disabled={!!busy} data-testid="grn-sheet-apply"
            startIcon={busy === 'apply' ? <CircularProgress size={14} color="inherit" /> : undefined}>{busy === 'apply' ? 'Booking…' : 'Book GRN'}</Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
