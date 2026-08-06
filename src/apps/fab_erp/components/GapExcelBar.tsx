/**
 * GapExcelBar.tsx — take the day's gaps to Excel and bring them back.
 *
 * Exists because 290 of 294 starts in production are back-entry: the day gets
 * reconstructed afterwards, and a supervisor writing up eight machines wants one
 * sheet, not eight screens. The sheet is also something that can be filled in on
 * the floor, offline, and handed over.
 *
 * THE UPLOAD ALWAYS SENSE-CHECKS FIRST. Nothing is written until the operator
 * has seen what would happen, because a file is a bigger, blinder action than a
 * form — you cannot see what you did until afterwards, and by then it is in the
 * production timing everything else is estimated from.
 */

import { useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Table, TableBody, TableCell,
  TableHead, TableRow, Typography,
} from '@mui/material';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import UploadFileRounded from '@mui/icons-material/UploadFileRounded';

import api, { API_HOST } from '@core/utils/axiosConfig';
import { useToast } from './Toast';
import { backendMessage } from '../utils/backendMessage';

interface PreviewRow {
  row: number; machine: string; reason: string;
  scope: 'site' | 'machine' | 'task'; from: string; to: string; minutes: number;
}
interface AfterRow {
  resourceId: number; resourceName: string;
  workingMinutes: number; explainedMinutes: number; gapMinutes: number;
}
interface ImportResult {
  ok: boolean; applied: number; wouldApply?: number;
  preview: PreviewRow[];
  errors: { row: number; message: string }[];
  after?: AfterRow[];
  committed?: boolean;
}

const SCOPE_LABEL = { site: 'whole plant', machine: 'this machine', task: 'a job' } as const;

export function GapExcelBar({ date, onApplied }: { date: string; onApplied?: () => void }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  // Held so Apply re-sends the same file the operator already reviewed.
  const [pending, setPending] = useState<File | null>(null);

  const slug = () => localStorage.getItem('companySlug');

  async function download() {
    setBusy(true); setErr('');
    try {
      const res = await api.get(
        `${API_HOST}/api/${slug()}/fab_erp/gaps/export?date=${date}`,
        { responseType: 'blob' },
      );
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = `Gaps_${date}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(backendMessage(e, 'Failed to build the sheet.'));
    } finally {
      setBusy(false);
    }
  }

  async function send(file: File, commit: boolean) {
    setBusy(true); setErr('');
    try {
      const form = new FormData();
      form.append('excel_file', file);
      const res = await api.post<ImportResult>(
        `${API_HOST}/api/${slug()}/fab_erp/gaps/import?date=${date}${commit ? '&commit=true' : ''}`,
        form, { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      setResult(res.data);
      if (commit && res.data.committed) {
        toast(`Applied ${res.data.applied} ${res.data.applied === 1 ? 'row' : 'rows'}.`, 'success');
        setPending(null);
        onApplied?.();
      } else {
        setPending(file);
      }
    } catch (e) {
      setErr(backendMessage(e, 'Could not read that file.'));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <Box sx={{ mt: 1.5 }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button size="small" variant="outlined" disabled={busy}
          startIcon={<DownloadRounded fontSize="small" />} onClick={download}>
          Download today&rsquo;s gaps
        </Button>
        <Button size="small" variant="outlined" disabled={busy}
          startIcon={busy ? <CircularProgress size={14} /> : <UploadFileRounded fontSize="small" />}
          onClick={() => fileRef.current?.click()}>
          Upload filled sheet
        </Button>
        <input ref={fileRef} type="file" hidden accept=".xlsx,.xls"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void send(f, false); }} />
        <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
          Every machine with unaccounted time for {date}. The reason column is a dropdown and
          the times are locked to each gap.
        </Typography>
      </Box>

      {err && <Alert severity="error" sx={{ mt: 1 }} onClose={() => setErr('')}>{err}</Alert>}

      {result && (
        <Box sx={{ mt: 1.5 }}>
          {result.errors.length > 0 && (
            <Alert severity="warning" sx={{ mb: 1 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>
                {result.errors.length} row{result.errors.length === 1 ? '' : 's'} need fixing — nothing has been saved.
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: 2.5, fontSize: 12.5 }}>
                {result.errors.slice(0, 15).map((e, i) => <li key={i}>Row {e.row}: {e.message}</li>)}
              </Box>
              <Typography sx={{ fontSize: 12, mt: 0.75, color: 'var(--c-text-3)' }}>
                Fix the sheet and upload it again — nothing was written, so re-uploading the
                whole file cannot double anything up.
              </Typography>
            </Alert>
          )}

          {result.preview.length > 0 && !result.committed && (
            <>
              <Typography sx={{ fontSize: 12.5, fontWeight: 600, mb: 0.5 }}>
                This is what would be recorded — nothing is saved yet.
              </Typography>
              <Table size="small" sx={{ mb: 1 }}>
                <TableHead>
                  <TableRow>
                    {['Row', 'Machine', 'What happened', 'Applies to', 'From', 'To', ''].map((h) => (
                      <TableCell key={h} sx={{ fontSize: 11, py: 0.5 }}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {result.preview.map((p) => (
                    <TableRow key={p.row}>
                      <TableCell sx={{ fontSize: 12, py: 0.5 }}>{p.row}</TableCell>
                      <TableCell sx={{ fontSize: 12, py: 0.5 }}>{p.machine}</TableCell>
                      <TableCell sx={{ fontSize: 12, py: 0.5 }}>{p.reason}</TableCell>
                      <TableCell sx={{ fontSize: 12, py: 0.5 }}>
                        <Chip size="small" label={SCOPE_LABEL[p.scope]} sx={{ height: 17, fontSize: 10 }} />
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, py: 0.5 }}>{p.from}</TableCell>
                      <TableCell sx={{ fontSize: 12, py: 0.5 }}>{p.to}</TableCell>
                      <TableCell sx={{ fontSize: 12, py: 0.5, color: 'var(--c-text-3)' }}>{p.minutes}m</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button size="small" onClick={() => { setResult(null); setPending(null); }}>Discard</Button>
                <Button size="small" variant="contained" disabled={busy || !result.ok || !pending}
                  onClick={() => pending && send(pending, true)}>
                  Apply {result.wouldApply ?? result.preview.length} row
                  {(result.wouldApply ?? result.preview.length) === 1 ? '' : 's'}
                </Button>
              </Box>
            </>
          )}

          {/* After committing, show the day as it now stands — the "new values". */}
          {result.committed && result.after && (
            <Alert severity="success">
              <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>
                Applied {result.applied} row{result.applied === 1 ? '' : 's'}.
              </Typography>
              {result.after.map((a) => (
                <Typography key={a.resourceId} sx={{ fontSize: 12.5 }}>
                  {a.resourceName}: {a.workingMinutes}m working = {a.explainedMinutes}m accounted
                  {' + '}{a.gapMinutes}m still unaccounted
                </Typography>
              ))}
            </Alert>
          )}
        </Box>
      )}
    </Box>
  );
}
