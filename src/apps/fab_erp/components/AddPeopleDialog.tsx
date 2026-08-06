/**
 * AddPeopleDialog.tsx — add many people at once, by typing or from a spreadsheet.
 *
 * WHY PLURAL. Adding a crew of forty one modal at a time is the reason roster
 * data doesn't get entered, and an un-entered roster is not a cosmetic gap: it
 * is what `no_operator` attribution is computed from, and once machine capacity
 * is derived from crew, an empty roster means a machine that cannot be scheduled
 * at all. Bulk entry is a correctness feature.
 *
 * A contract welder needs a NAME and nothing else — no email, no account, no
 * invite. The grid reflects that: one required column, six optional ones.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  MenuItem, Tab, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import UploadFileRounded from '@mui/icons-material/UploadFileRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';

import { addWorkers, WORKER_TYPE_LABELS, type BulkPerson, type WorkerType, type ImportResult } from '../api/workers';
import api, { API_HOST } from '@core/utils/axiosConfig';
import { useToast } from './Toast';
import { backendMessage } from '../utils/backendMessage';
import { shiftSpan, type ShiftOption } from './PersonSheet';

export interface MachineOption { id: number; name: string }

type Draft = BulkPerson & { key: number };

let keySeq = 0;
const blank = (): Draft => ({
  key: ++keySeq, name: '', code: '', workerType: 'employee',
  vendorName: '', phone: '', shiftId: null, resourceId: null,
});

export function AddPeopleDialog({
  open, onClose, onSaved, shifts, machines,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  shifts: ShiftOption[];
  machines: MachineOption[];
}) {
  const { toast } = useToast();
  const [tab, setTab] = useState(0);
  const [rows, setRows] = useState<Draft[]>([blank(), blank(), blank()]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setRows([blank(), blank(), blank()]); setErr(''); setImportResult(null); setTab(0); }
  }, [open]);

  const set = (key: number, patch: Partial<Draft>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const filled = rows.filter((r) => r.name.trim());

  async function save() {
    if (!filled.length) { setErr('Add at least one name.'); return; }
    setSaving(true); setErr('');
    try {
      const res = await addWorkers(filled.map(({ key: _key, ...p }) => ({
        ...p,
        code: p.code?.trim() || null,
        vendorName: p.vendorName?.trim() || null,
        phone: p.phone?.trim() || null,
      })));
      toast(`Added ${res.created} ${res.created === 1 ? 'person' : 'people'}.`, 'success');
      onSaved(); onClose();
    } catch (e) {
      setErr(backendMessage(e, 'Failed to add.'));
    } finally {
      setSaving(false);
    }
  }

  async function downloadTemplate() {
    try {
      const companySlug = localStorage.getItem('companySlug');
      const res = await api.get(`${API_HOST}/api/${companySlug}/fab_erp/workers/import-template`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'People_Import_Template.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(backendMessage(e, 'Failed to download the template.'));
    }
  }

  async function upload(file: File) {
    setImporting(true); setErr(''); setImportResult(null);
    try {
      const companySlug = localStorage.getItem('companySlug');
      const form = new FormData();
      form.append('excel_file', file);
      const res = await api.post<ImportResult>(
        `${API_HOST}/api/${companySlug}/fab_erp/workers/import`, form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      setImportResult(res.data);
      if (res.data.ok) { toast(`Imported ${res.data.imported} people.`, 'success'); onSaved(); }
    } catch (e) {
      setErr(backendMessage(e, 'Import failed.'));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ pb: 0.5 }}>
        Add people
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mt: 0.25 }}>
          Contract and vendor staff need no login — a name is enough.
        </Typography>
      </DialogTitle>

      <DialogContent>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, minHeight: 36 }}>
          <Tab label="Type them in" sx={{ minHeight: 36, fontSize: 12.5 }} />
          <Tab label="Upload a spreadsheet" sx={{ minHeight: 36, fontSize: 12.5 }} />
        </Tabs>

        {err && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr('')}>{err}</Alert>}

        {tab === 0 && (
          <Box>
            <Box sx={{
              display: 'grid',
              gridTemplateColumns: '1.4fr 0.8fr 1fr 1.2fr 0.9fr 1.1fr 1.2fr 32px',
              gap: 0.75, alignItems: 'center', mb: 0.5,
            }}>
              {['Name *', 'Badge', 'Type', 'Agency', 'Phone', 'Shift', 'Machine', ''].map((h) => (
                <Typography key={h} sx={{ fontSize: 11, color: 'var(--c-text-3)', fontWeight: 600 }}>{h}</Typography>
              ))}
            </Box>

            {rows.map((r) => (
              <Box key={r.key} sx={{
                display: 'grid',
                gridTemplateColumns: '1.4fr 0.8fr 1fr 1.2fr 0.9fr 1.1fr 1.2fr 32px',
                gap: 0.75, alignItems: 'center', mb: 0.75,
              }}>
                <TextField size="small" value={r.name} onChange={(e) => set(r.key, { name: e.target.value })} />
                <TextField size="small" value={r.code ?? ''} onChange={(e) => set(r.key, { code: e.target.value })} />
                <TextField select size="small" value={r.workerType ?? 'employee'}
                  onChange={(e) => set(r.key, { workerType: e.target.value as WorkerType })}>
                  {(Object.keys(WORKER_TYPE_LABELS) as WorkerType[]).map((k) => (
                    <MenuItem key={k} value={k}>{WORKER_TYPE_LABELS[k]}</MenuItem>
                  ))}
                </TextField>
                <TextField size="small" value={r.vendorName ?? ''}
                  disabled={r.workerType === 'employee'}
                  onChange={(e) => set(r.key, { vendorName: e.target.value })} />
                <TextField size="small" value={r.phone ?? ''} onChange={(e) => set(r.key, { phone: e.target.value })} />
                <TextField select size="small" value={r.shiftId ?? ''}
                  onChange={(e) => set(r.key, { shiftId: e.target.value ? Number(e.target.value) : null })}>
                  <MenuItem value="">—</MenuItem>
                  {shifts.map((s) => (
                    <MenuItem key={s.id} value={s.id}>{s.name} {shiftSpan(s.startTime, s.endTime)}</MenuItem>
                  ))}
                </TextField>
                <TextField select size="small" value={r.resourceId ?? ''}
                  onChange={(e) => set(r.key, { resourceId: e.target.value ? Number(e.target.value) : null })}>
                  <MenuItem value="">—</MenuItem>
                  {machines.map((m) => <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>)}
                </TextField>
                <Tooltip title="Remove row">
                  <span>
                    <IconButton size="small" disabled={rows.length === 1}
                      onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                      <DeleteOutlineRounded sx={{ fontSize: 16 }} />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
            ))}

            <Button size="small" startIcon={<AddRounded fontSize="small" />}
              onClick={() => setRows((rs) => [...rs, blank()])} sx={{ mt: 0.5 }}>
              Add row
            </Button>
          </Box>
        )}

        {tab === 1 && (
          <Box>
            <Typography sx={{ fontSize: 13, mb: 1.5 }}>
              Download the template, fill in the People sheet, and upload it. The template
              lists your shifts and machines so the names match.
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <Button size="small" variant="outlined" startIcon={<DownloadRounded fontSize="small" />} onClick={downloadTemplate}>
                Download template
              </Button>
              <Button size="small" variant="contained" startIcon={<UploadFileRounded fontSize="small" />}
                disabled={importing} onClick={() => fileRef.current?.click()}>
                {importing ? 'Importing…' : 'Upload filled sheet'}
              </Button>
              <input ref={fileRef} type="file" hidden accept=".xlsx,.xls"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
            </Box>

            {/*
              A rejected file lists every bad row at once. The import is
              all-or-nothing, so the operator fixes the sheet and re-uploads the
              whole thing — which is only safe because nothing was written.
            */}
            {importResult && !importResult.ok && (
              <Alert severity="warning">
                <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>
                  Nothing was imported — {importResult.errors.length} row
                  {importResult.errors.length === 1 ? '' : 's'} need fixing first.
                </Typography>
                <Box component="ul" sx={{ m: 0, pl: 2.5, fontSize: 12.5 }}>
                  {importResult.errors.slice(0, 25).map((e, i) => (
                    <li key={i}>Row {e.row}: {e.message}</li>
                  ))}
                </Box>
                {importResult.errors.length > 25 && (
                  <Typography sx={{ fontSize: 12, mt: 0.5 }}>
                    …and {importResult.errors.length - 25} more.
                  </Typography>
                )}
                <Typography sx={{ fontSize: 12, mt: 0.75, color: 'var(--c-text-3)' }}>
                  Fix the sheet and upload it again — nothing was saved, so re-uploading
                  the whole file won't duplicate anybody.
                </Typography>
              </Alert>
            )}

            {importResult?.ok && (
              <Alert severity="success">
                Imported {importResult.imported} people
                {importResult.withShift ? `, ${importResult.withShift} with a shift` : ''}
                {importResult.withMachine ? `, ${importResult.withMachine} onto a machine` : ''}.
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button size="small" onClick={onClose}>Close</Button>
        {tab === 0 && (
          <Button size="small" variant="contained" onClick={save} disabled={saving || !filled.length}>
            {saving ? 'Adding…' : `Add ${filled.length || ''} ${filled.length === 1 ? 'person' : 'people'}`}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
