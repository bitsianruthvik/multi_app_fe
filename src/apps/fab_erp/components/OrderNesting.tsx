import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, FormControlLabel, Radio, RadioGroup, Tooltip, Typography,
} from '@mui/material';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import DownloadIcon from '@mui/icons-material/Download';
import HourglassEmptyRounded from '@mui/icons-material/HourglassEmptyRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';
import UploadFileIcon from '@mui/icons-material/UploadFile';

import api, { API_HOST } from '@core/utils/axiosConfig';
import { Surface, EmptyState, useToast } from '../components';
import type { OrderReadiness } from '../api/readiness';
import NestingBoard from './NestingBoard';

interface NestingImportResult {
  nests: number; links: number; skipped: number; deleted?: number;
  totalWeight?: number | null;
  warnings: Array<{ message: string }>;
  reportBase64?: string;
  /** Recomputed server-side after the upload — saves the page asking again. */
  readiness?: OrderReadiness | null;
}

function downloadBase64Xlsx(base64: string, filename: string) {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([arr], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/**
 * Nesting — each raw material on the order, and every part cut from it.
 *
 * The item tree reads downward (assembly → part → material), which is the wrong
 * way round for the two questions actually asked on a shop floor: what am I
 * cutting out of this plate, and what is this order waiting on. Both are the
 * material's view, so this screen groups by material.
 *
 * The stock column is not decoration. Receiving material already releases every
 * task gated on it — stockInService re-checks them on each receipt and a
 * background sweep catches the rest — but until now nothing showed which
 * material an order was sitting on. That is what the "waiting" rows are.
 */

interface NestedPart {
  linkId: number;
  partId: number;
  partCode: string | null;
  partName: string;
  partQty: number;
  qtyPerPart: number | null;
}
/** One physical plate, and the parts laid out on it. */
interface Nest {
  key: string;
  nestNo: string | null;
  /** How much material this ONE plate is — drawn once, not once per part. */
  qty: number | null;
  /** True once the plate has gone to the floor. */
  issued: boolean;
  parts: NestedPart[];
}
interface NestedMaterial {
  catalogItemId: number;
  materialCode: string;
  materialName: string;
  unit: string | null;
  onHand: number;
  pieces: number;
  inStock: boolean;
  /** One plate per nest — never the sum of the per-part figures. */
  required: number | null;
  /** What is still to be drawn: plates already cut no longer count. */
  stillRequired: number | null;
  nestsIssued: number;
  short: boolean;
  nests: Nest[];
  parts: NestedPart[];
}
interface NestingResponse {
  materials: NestedMaterial[];
  nests: number;
  waitingOnStock: number;
  nestsBlocked: number;
  partsBlocked: number;
}

export default function OrderNesting({ orderId, canManage = false, onStageChanged }: {
  orderId: number; canManage?: boolean;
  /**
   * Tell the order page a stage moved, so the strip above follows along.
   * Pass the readiness an endpoint already returned to save a round-trip.
   */
  onStageChanged?: (next?: OrderReadiness | null) => void;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<NestingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [importResult, setImportResult] = useState<NestingImportResult | null>(null);
  // Replace clears this order's material links, so it is chosen before the file
  // picker opens rather than sitting next to a one-click Upload.
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [modeOpen, setModeOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const base = useCallback(
    () => `${API_HOST}/api/${localStorage.getItem('companySlug')}/fab_erp/orders/${orderId}`,
    [orderId],
  );

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await api.get<NestingResponse>(`${base()}/items/nesting`);
      setData(res.data);
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string } }; message?: string };
      setError(ax.response?.data?.message ?? ax.message ?? 'Failed to load nesting');
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => { load(); }, [load]);

  async function downloadSheet() {
    setBusy(true); setError('');
    try {
      const res = await api.get(`${base()}/nesting/export`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'Order_Nesting.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string } }; message?: string };
      setError(ax.response?.data?.message ?? ax.message ?? 'Could not download the nesting sheet');
    } finally { setBusy(false); }
  }

  async function uploadSheet(file: File) {
    setBusy(true); setError(''); setImportResult(null);
    try {
      const form = new FormData();
      form.append('excel_file', file);
      form.append('mode', mode);
      const res = await api.post<NestingImportResult>(`${base()}/nesting/import`, form,
        { headers: { 'Content-Type': 'multipart/form-data' } });
      setImportResult(res.data);
      await load();
      onStageChanged?.(res.data.readiness);
      toast(`${res.data.links} part(s) nested across ${res.data.nests} plate(s)`);
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string } }; message?: string };
      setError(ax.response?.data?.message ?? ax.message ?? 'Nesting upload failed');
    } finally {
      setBusy(false);
      setMode('append'); // never let a replace carry into the next upload
    }
  }

  if (loading) {
    return (
      <Surface e={1} sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Surface>
    );
  }
  const toolbar = canManage && (
    <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
      <Button variant="outlined" size="small" disabled={busy}
        startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <DownloadIcon />}
        onClick={downloadSheet}>
        {data && data.materials.length > 0 ? 'Export nesting' : 'Download nesting sheet'}
      </Button>
      <Button variant="outlined" size="small" disabled={busy}
        startIcon={<UploadFileIcon />}
        onClick={() => { setMode('append'); setModeOpen(true); }}>
        Import nesting
      </Button>
      <input ref={fileRef} type="file" accept=".xlsx" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadSheet(f); e.target.value = ''; }} />
    </Box>
  );

  const dialogs = (
    <>
      <Dialog open={modeOpen} onClose={() => setModeOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>Import nesting</DialogTitle>
        <DialogContent dividers>
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 2 }}>
            One row per plate: the material, the plate&rsquo;s own dimensions, and the codes of the
            parts cut from it. This only touches material links — the BOQ tree is left alone either way.
          </Typography>
          <RadioGroup value={mode} onChange={(e) => setMode(e.target.value as 'append' | 'replace')}>
            <FormControlLabel value="append" control={<Radio size="small" />}
              label={<Typography sx={{ fontSize: 13.5 }}>Add to what is already nested</Typography>} />
            <FormControlLabel value="replace" control={<Radio size="small" />}
              label={<Typography sx={{ fontSize: 13.5 }}>Replace all nesting on this order</Typography>} />
          </RadioGroup>
          {mode === 'replace' && (
            <Alert severity="warning" sx={{ mt: 1.5 }}>
              Clears every material link on this order and any record of plates already drawn.
              The item tree itself is untouched.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModeOpen(false)}>Cancel</Button>
          <Button variant="contained" color={mode === 'replace' ? 'warning' : 'primary'}
            onClick={() => { setModeOpen(false); fileRef.current?.click(); }}>
            Choose file…
          </Button>
        </DialogActions>
      </Dialog>

      {importResult && (
        <Alert
          severity={importResult.skipped > 0 ? 'warning' : 'success'}
          sx={{ mb: 2 }}
          onClose={() => setImportResult(null)}
          action={importResult.reportBase64 ? (
            <Button size="small" onClick={() => downloadBase64Xlsx(importResult.reportBase64!, 'Nesting_Report.xlsx')}>
              Download report
            </Button>
          ) : undefined}
        >
          {importResult.links} part(s) nested across {importResult.nests} plate(s)
          {importResult.deleted ? `, ${importResult.deleted} previous link(s) cleared` : ''}
          {importResult.skipped > 0 ? `, ${importResult.skipped} skipped` : ''}.
          {importResult.warnings.map((w) => ` ${w.message}`).join('')}
        </Alert>
      )}
    </>
  );

  if (error) {
    return <Box>{toolbar}<Alert severity="error" onClose={() => setError('')}>{error}</Alert></Box>;
  }

  if (!data || data.materials.length === 0) {
    return (
      <Box>
        {toolbar}
        {dialogs}
        <EmptyState
          icon={<Inventory2Rounded />}
          title="Nothing nested yet"
          hint="Download the nesting sheet: one row per plate, with the material, the plate's size, and the codes of the parts cut from it."
        />
      </Box>
    );
  }

  return (
    <Box>
      {toolbar}
      {dialogs}

      {/* Arrange plates here; the Excel path below stays for bulk entry and for
          the material readiness the board does not try to duplicate. */}
      <NestingBoard orderId={orderId} canManage={canManage} onStageChanged={onStageChanged} />

      <Divider sx={{ my: 3, borderColor: 'var(--c-divider)' }} />

      {data.waitingOnStock > 0 ? (
        <Alert severity="warning" icon={<HourglassEmptyRounded fontSize="inherit" />} sx={{ mb: 2 }}>
          Waiting on <strong>{data.waitingOnStock}</strong> material
          {data.waitingOnStock === 1 ? '' : 's'} — <strong>{data.nestsBlocked}</strong> nest
          {data.nestsBlocked === 1 ? '' : 's'}, <strong>{data.partsBlocked}</strong> part
          {data.partsBlocked === 1 ? '' : 's'}. Work starts by itself the moment the material is
          received into stock — nothing here needs to be clicked.
        </Alert>
      ) : (
        <Alert severity="success" icon={<CheckCircleRounded fontSize="inherit" />} sx={{ mb: 2 }}>
          Every material on this order is in stock.
        </Alert>
      )}

      {data.materials.map((m) => (
        <Surface key={m.catalogItemId} e={1} sx={{ mb: 1.5, overflow: 'hidden' }}>
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap',
            px: 2, py: 1.25, borderBottom: '0.5px solid var(--c-divider)',
            bgcolor: m.inStock ? 'transparent' : 'var(--c-surface-2)',
          }}>
            <Typography sx={{ fontFamily: 'monospace', fontSize: 13.5, color: 'var(--c-text)' }}>
              {m.materialCode}
            </Typography>
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', flex: 1, minWidth: 160 }}>
              {m.materialName}
            </Typography>

            {/* Needed is one plate per nest. Showing it beside what is on hand
                is the whole point — "in stock" alone can be true while still
                not covering the plates this order has left to cut. */}
            {m.stillRequired != null && (
              <Tooltip title={`One plate per nest: ${m.nests.length} nest(s)${m.nestsIssued ? `, ${m.nestsIssued} already drawn` : ''}. Never the sum of the per-part figures.`}>
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', fontFamily: 'monospace' }}>
                  need {Number(m.stillRequired.toFixed(3))} / have {Number(m.onHand.toFixed(3))} {m.unit ?? ''}
                </Typography>
              </Tooltip>
            )}

            <Chip
              size="small"
              icon={m.short ? <HourglassEmptyRounded /> : <CheckCircleRounded />}
              color={m.short ? 'warning' : 'success'}
              variant={m.short ? 'outlined' : 'filled'}
              label={m.short
                ? (m.inStock ? 'Short' : 'Not in stock')
                : `Covered — ${Number(m.onHand.toFixed(3))} ${m.unit ?? ''}`.trim()}
            />
            <Tooltip title="Physical pieces of this material, and the parts laid out on them">
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>
                {m.nests.length} nest{m.nests.length === 1 ? '' : 's'} · {m.parts.length} part{m.parts.length === 1 ? '' : 's'}
              </Typography>
            </Tooltip>
          </Box>

          {/* Grouped by nest — one block per physical plate. A flat list of
              ninety parts against a material cannot answer "what comes off
              this plate", which is the question actually asked at the table. */}
          <Box sx={{ px: 2, py: 0.5 }}>
            {m.nests.map((nest) => (
              <Box key={nest.key} sx={{ py: 0.75, borderBottom: '0.5px solid var(--c-divider)', '&:last-child': { borderBottom: 'none' } }}>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 0.5 }}>
                  <Typography sx={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)' }}>
                    {nest.nestNo ?? 'un-nested'}
                  </Typography>
                  <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
                    {nest.nestNo
                      ? `${nest.parts.length} part${nest.parts.length === 1 ? '' : 's'} off this piece`
                      : 'not assigned to a nest'}
                    {nest.qty != null ? ` · ${Number(nest.qty.toFixed(3))} ${m.unit ?? ''}` : ''}
                  </Typography>
                  {nest.issued && (
                    <Tooltip title="This plate has already been drawn from stock. The other parts on it start without drawing anything more.">
                      <Typography sx={{ fontSize: 11, color: 'var(--c-success-700, #1a7f37)', fontWeight: 600 }}>
                        drawn
                      </Typography>
                    </Tooltip>
                  )}
                </Box>
                {nest.parts.map((p) => (
                  <Box key={p.linkId} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.4, pl: 1.5, flexWrap: 'wrap' }}>
                    <Typography sx={{ fontSize: 13, color: 'var(--c-text)', flex: 1, minWidth: 140 }}>
                      {p.partName}
                    </Typography>
                    {p.partCode && (
                      <Tooltip title={p.partCode}>
                        <Typography sx={{
                          fontFamily: 'monospace', fontSize: 11.5, color: 'var(--c-text-3)',
                          maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {p.partCode}
                        </Typography>
                      </Tooltip>
                    )}
                    <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', minWidth: 88, textAlign: 'right' }}>
                      {p.partQty} off
                    </Typography>
                  </Box>
                ))}
              </Box>
            ))}
          </Box>
        </Surface>
      ))}
    </Box>
  );
}
