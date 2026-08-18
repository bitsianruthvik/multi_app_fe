/**
 * OrderParameters.tsx — the values this order's operations actually need.
 *
 * THE STEP THAT DID NOT EXIST. The BOQ sheet asked for Thick / Length / Width on
 * every row, which was wrong in both directions: a plate has no meaningful
 * "height", and an assembly measured by weld length was never asked for one. Now
 * that flows are assigned BEFORE this step, the required set is derived rather
 * than guessed — the union of `item.*` variables across each flow's formulas.
 *
 * It is a GRID, not a form per part. A girder run is hundreds of near-identical
 * rows and the fastest way to fill them in is to see them together, which is why
 * the BOQ was a spreadsheet in the first place.
 *
 * THE GRID IS BUILT ON THE SERVER (2026-08-18). It used to be assembled here
 * from items, field definitions and values, which meant the screen could only
 * show the union of every field ANY flow on the order wanted, against EVERY
 * part — so a plate that is only ever cut had an editable weld-length cell.
 * A cell now exists only where that part's own flow asks for it; everywhere else
 * shows a dash, because "not asked" and "asked but empty" are different states
 * and an empty box cannot tell them apart.
 *
 * ONE ROW PER SIMILARITY GROUP. Where girders or segments are marked as copies
 * of each other, their thirty Top Flanges are one row that writes to all thirty.
 *
 * A blank cell is not zero. The formula engine defaults unknown symbols to 0 so
 * `IF()` fallbacks can work, so a part with no thickness does not error — it is
 * estimated as free to cut. Blank cells are flagged, and the production order
 * refuses to be raised while any remain (see the FIELDS_MISSING gate).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, TextField, Tooltip, Typography,
} from '@mui/material';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import DownloadIcon from '@mui/icons-material/Download';
import UploadFileIcon from '@mui/icons-material/UploadFile';

import api from '@core/utils/axiosConfig';
import {
  getParameterGrid, saveParameters, exportParametersUrl, importParameters,
  type ParameterGrid, type ParameterEdit,
} from '../api/parameters';
import { getFieldReadiness, type FieldReadiness } from '../api/fieldReadiness';
import {
  EmptyState, ListSkeleton, useToast, backendMessage, Mono, StickyActionBar,
} from '../components';

type CellKey = string; // `${itemId}:${fieldKey}`
const cellKey = (itemId: number, fieldKey: string): CellKey => `${itemId}:${fieldKey}`;

export default function OrderParameters({ orderId, canManage, onStageChanged }: {
  orderId: number;
  canManage: boolean;
  onStageChanged?: () => void;
}) {
  const { toast } = useToast();
  const [grid, setGrid] = useState<ParameterGrid | null>(null);
  const [readiness, setReadiness] = useState<FieldReadiness | null>(null);
  const [edits, setEdits] = useState<Record<CellKey, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [g, r] = await Promise.all([
        getParameterGrid(orderId),
        getFieldReadiness(orderId).catch(() => null),
      ]);
      setGrid(g);
      setReadiness(r);
      setEdits({});
    } catch (e) {
      setError(backendMessage(e, 'Could not load the order’s parameters.'));
    } finally { setLoading(false); }
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);

  const valueAt = (itemId: number, fieldKey: string) => {
    const k = cellKey(itemId, fieldKey);
    if (k in edits) return edits[k];
    const row = grid?.rows.find((r) => r.itemId === itemId);
    return row?.values[fieldKey] ?? '';
  };

  const setCell = (itemId: number, fieldKey: string, raw: string) =>
    setEdits((p) => ({ ...p, [cellKey(itemId, fieldKey)]: raw }));

  async function save() {
    const list: ParameterEdit[] = Object.entries(edits).map(([k, v]) => {
      const [idStr, fieldKey] = k.split(':');
      return { itemId: Number(idStr), fieldKey, value: v.trim() === '' ? null : v.trim() };
    });
    if (!list.length) return;
    setSaving(true); setError('');
    try {
      const res = await saveParameters(orderId, list);
      // `written` counts the fan-out, so on a grouped order it is larger than
      // the number of cells touched — which is the point, and worth saying.
      toast(
        res.written > list.length
          ? `${list.length} value(s) → ${res.written} part(s) via similar groups`
          : `${res.written} value(s) saved`,
        'success',
      );
      await load();
      onStageChanged?.();
    } catch (e) {
      setError(backendMessage(e, 'Could not save the parameters.'));
    } finally { setSaving(false); }
  }

  async function download() {
    try {
      const res = await api.get(exportParametersUrl(orderId), { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'parameters.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(backendMessage(e, 'Could not export the parameters.'));
    }
  }

  async function upload(file: File) {
    setImporting(true); setError('');
    try {
      const res = await importParameters(orderId, file);
      toast(`${res.edits} change(s) from ${res.rowsRead} row(s) → ${res.written} part(s)`, 'success');
      if (res.warnings?.length) {
        setError(`${res.warnings.length} row(s) skipped: ${res.warnings.slice(0, 3).map((w) => w.message).join(' ')}`);
      }
      await load();
      onStageChanged?.();
    } catch (e) {
      setError(backendMessage(e, 'Could not import that sheet.'));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  if (loading) return <ListSkeleton rows={6} />;

  if (!grid || grid.rows.length === 0) {
    return (
      <EmptyState
        title="No parts with a flow yet"
        hint="Assign flows first — they decide which values each part needs. Nothing here is guessed."
      />
    );
  }
  if (grid.columns.length === 0) {
    return (
      <EmptyState
        icon={<CheckCircleRounded />}
        title="Nothing to fill in"
        hint="None of this order's operations read a value off the part, so there is nothing to capture here."
      />
    );
  }

  const dirtyCount = Object.keys(edits).length;

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {(readiness?.unknownFields?.length ?? 0) > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.25 }}>
            Some formulas name fields that do not exist
          </Typography>
          <Typography sx={{ fontSize: 12.5 }}>
            {readiness!.unknownFields.map((u) => `${u.operationName}: ${u.keys.join(', ')}`).join(' · ')}
            {' '}— these cannot be fixed by filling anything in here; the formula needs correcting.
          </Typography>
        </Alert>
      )}

      {/* The spreadsheet path, asked for because "many times it is easier to
          enter that way" — and because the values usually already exist in one. */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1.5, flexWrap: 'wrap' }}>
        <Button size="small" startIcon={<DownloadIcon />} onClick={download}>
          Export to Excel
        </Button>
        <Button
          size="small" startIcon={importing ? <CircularProgress size={13} /> : <UploadFileIcon />}
          disabled={!canManage || importing}
          onClick={() => fileRef.current?.click()}
        >
          {importing ? 'Importing…' : 'Import filled sheet'}
        </Button>
        <input
          ref={fileRef} type="file" hidden accept=".xlsx"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
        />
        {grid.groupedAway > 0 && (
          <Tooltip title="Girders or segments marked as copies of each other. Fill one row and every copy gets it.">
            <Chip
              size="small"
              label={`${grid.groupedAway} row(s) folded into similar groups`}
              sx={{ bgcolor: 'var(--c-primary-50)', color: 'var(--c-primary-700)' }}
            />
          </Tooltip>
        )}
      </Box>

      <Box sx={{ overflowX: 'auto', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)' }}>
        <Box component="table" sx={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
          <Box component="thead">
            <Box component="tr" sx={{ bgcolor: 'var(--c-surface-2)' }}>
              <Box component="th" sx={{ textAlign: 'left', p: 1, position: 'sticky', left: 0, bgcolor: 'var(--c-surface-2)', minWidth: 260 }}>
                Part
              </Box>
              {grid.columns.map((c) => (
                <Box component="th" key={c.fieldKey} sx={{ textAlign: 'left', p: 1, whiteSpace: 'nowrap' }}>
                  {c.label}{c.unit ? <Typography component="span" sx={{ fontSize: 11, color: 'var(--c-text-3)' }}> ({c.unit})</Typography> : null}
                </Box>
              ))}
            </Box>
          </Box>
          <Box component="tbody">
            {grid.rows.map((r) => (
              <Box component="tr" key={r.itemId} sx={{ borderTop: '1px solid var(--c-divider)' }}>
                <Box component="td" sx={{ p: 1, position: 'sticky', left: 0, bgcolor: 'var(--c-surface)' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: 13 }}>{r.name}</Typography>
                      <Mono sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>{r.code}</Mono>
                    </Box>
                    {r.represents > 1 && (
                      <Tooltip title={`Writes to all ${r.represents} copies`}>
                        <Chip size="small" label={`×${r.represents}`} sx={{ height: 18, fontSize: 10.5 }} />
                      </Tooltip>
                    )}
                  </Box>
                </Box>
                {grid.columns.map((c) => {
                  // Not asked for by THIS part's flow. A dash, not an empty box:
                  // an empty box invites a value that no formula will ever read.
                  if (!r.required.includes(c.fieldKey)) {
                    return (
                      <Box component="td" key={c.fieldKey} sx={{ p: 1, textAlign: 'center', color: 'var(--c-text-3)' }}>
                        <Tooltip title="This part's flow does not use this value">
                          <span>—</span>
                        </Tooltip>
                      </Box>
                    );
                  }
                  const v = valueAt(r.itemId, c.fieldKey);
                  const missing = String(v).trim() === '';
                  return (
                    <Box component="td" key={c.fieldKey} sx={{ p: 0.5 }}>
                      <TextField
                        size="small" variant="standard" type="number"
                        value={v ?? ''}
                        disabled={!canManage}
                        onChange={(e) => setCell(r.itemId, c.fieldKey, e.target.value)}
                        sx={{
                          width: 96,
                          '& input': { fontSize: 13, py: 0.4 },
                          ...(missing ? { '& .MuiInput-root:before': { borderBottomColor: 'var(--c-warning-600)' } } : {}),
                        }}
                      />
                    </Box>
                  );
                })}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      {canManage && dirtyCount > 0 && (
        <StickyActionBar>
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
            {dirtyCount} cell(s) changed
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setEdits({})} disabled={saving}>Discard</Button>
          <Button
            variant="contained" onClick={save} disabled={saving}
            startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}
          >
            {saving ? 'Saving…' : 'Save values'}
          </Button>
        </StickyActionBar>
      )}
    </Box>
  );
}
