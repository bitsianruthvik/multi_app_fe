import { useRef, useState, type ChangeEvent } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Typography } from '@mui/material';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import UploadFileRounded from '@mui/icons-material/UploadFileRounded';
import { CfApiError } from '../api/client';
import { fileToBase64 } from '../api/bomSheet';
import { applyTimingSheet, downloadTimingSheet, previewTimingSheet, type TimingSheetResult, type TimingSheetSource } from '../api/timingSheets';
import { useToast } from './toastContext';

const WHAT: Record<TimingSheetSource['kind'], string> = {
  standard: 'standard times',
  order: 'this order’s times',
  floor: 'floor progress',
};

/**
 * "Download Excel" / "Upload Excel" for a timings sheet (api/timingSheets): the upload is previewed first (a dry run
 * that writes nothing), every problem listed at once, and applied only on "Apply changes". The floor sheet answers
 * with each row recorded or refused, which the dialog keeps on screen.
 */
export function TimingSheetButtons({ source, canUpload, onApplied, disabled = false, label = 'Excel' }: {
  source: TimingSheetSource | null;
  canUpload: boolean;
  onApplied?: () => void;
  disabled?: boolean;
  /** Word after Download / Upload. */
  label?: string;
}) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'download' | 'preview' | 'apply' | null>(null);
  const [sheet, setSheet] = useState<{ file: File; base64: string; result: TimingSheetResult; applied?: boolean } | null>(null);

  const download = async () => {
    if (!source) return;
    setBusy('download');
    try { await downloadTimingSheet(source); toast.success('Excel workbook downloaded.'); } catch (e) {
      toast.error(e instanceof CfApiError ? e.message : 'Could not download the workbook.');
    } finally { setBusy(null); }
  };
  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !source) return;
    setBusy('preview');
    try {
      const base64 = await fileToBase64(file);
      setSheet({ file, base64, result: await previewTimingSheet(source, base64) });
    } catch (e) {
      toast.error(e instanceof CfApiError ? [e.message, ...e.problems].join(' ') : 'Could not read that workbook.');
    } finally { setBusy(null); }
  };
  const apply = async () => {
    if (!sheet || !source) return;
    setBusy('apply');
    try {
      const result = await applyTimingSheet(source, sheet.base64);
      onApplied?.();
      if (source.kind === 'floor') setSheet({ ...sheet, result, applied: true });
      else { setSheet(null); toast.success(`Excel changes applied: ${result.summary.sentence}.`); }
    } catch (e) {
      if (e instanceof CfApiError && e.problems.length) setSheet({ ...sheet, result: { ...sheet.result, ok: false, problems: e.problems } });
      toast.error(e instanceof CfApiError ? e.message : 'Could not apply the workbook.');
    } finally { setBusy(null); }
  };

  const r = sheet?.result ?? null;
  const problems = r?.problems ?? [];
  return (
    <>
      <Button size="small" startIcon={busy === 'download' ? <CircularProgress size={14} color="inherit" /> : <DownloadRounded />}
        onClick={download} disabled={!source || busy != null || disabled} data-testid={`timing-sheet-download-${source?.kind ?? 'none'}`} sx={{ whiteSpace: 'nowrap' }}>
        Download {label}
      </Button>
      {canUpload && <>
        <Button size="small" startIcon={busy === 'preview' ? <CircularProgress size={14} color="inherit" /> : <UploadFileRounded />}
          onClick={() => input.current?.click()} disabled={!source || busy != null || disabled} data-testid={`timing-sheet-upload-${source?.kind ?? 'none'}`} sx={{ whiteSpace: 'nowrap' }}>
          Upload {label}
        </Button>
        <input ref={input} type="file" accept=".xlsx" hidden onChange={choose} />
      </>}
      <Dialog open={!!sheet} onClose={busy ? undefined : () => setSheet(null)} fullWidth maxWidth="sm">
        <DialogTitle>{sheet?.applied ? `Recorded from Excel` : `Review Excel changes — ${source ? WHAT[source.kind] : ''}`}</DialogTitle>
        <DialogContent dividers>
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 1.5, overflowWrap: 'anywhere' }}>{sheet?.file.name}</Typography>
          {r && (
            <>
              <Alert severity={problems.length ? 'error' : sheet?.applied && (r.refused?.length ?? 0) ? 'warning' : 'success'} sx={{ mb: 1.5 }}>
                {problems.length ? 'Nothing has been changed. Fix these items and upload the file again.'
                  : sheet?.applied ? `Done: ${r.summary.sentence}.` : `Preview: ${r.summary.sentence}.`}
              </Alert>
              {r.summary.warning && !problems.length && <Alert severity="warning" sx={{ mb: 1.5 }}>{r.summary.warning}</Alert>}
              {!problems.length && !sheet?.applied && (
                <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>This is a preview. Nothing is changed until you press Apply changes.</Typography>
              )}
              {problems.length > 0 && (
                <Box component="ul" sx={{ mt: 1, mb: 0, pl: 2.5, color: 'var(--c-danger-800)' }}>
                  {problems.slice(0, 60).map((p) => <li key={p}><Typography sx={{ fontSize: 13 }}>{p}</Typography></li>)}
                  {problems.length > 60 && <li><Typography sx={{ fontSize: 13 }}>and {problems.length - 60} more…</Typography></li>}
                </Box>
              )}
              {sheet?.applied && (r.refused?.length ?? 0) > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'var(--c-text-2)', mb: 0.5 }}>Refused</Typography>
                  <Divider />
                  {r.refused!.slice(0, 40).map((x) => (
                    <Typography key={x.stepId} sx={{ fontSize: 12.5, py: 0.6, borderBottom: '1px solid var(--c-border)' }}>
                      {x.label ?? `Step ${x.stepId}`} · {x.reason}
                    </Typography>
                  ))}
                </Box>
              )}
              {!problems.length && r.changes.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'var(--c-text-2)', mb: 0.5 }}>{sheet?.applied ? 'Recorded' : 'Changes'}</Typography>
                  <Divider />
                  {r.changes.slice(0, 15).map((ch, i) => (
                    <Typography key={`${ch.path ?? ''}-${ch.field ?? ''}-${i}`} sx={{ fontSize: 12.5, py: 0.6, borderBottom: '1px solid var(--c-border)' }}>
                      {ch.action === 'add' ? 'Add · ' : ''}{ch.path ?? ch.action}
                      {ch.field ? ` · ${ch.field}` : ''}
                      {ch.from !== undefined || ch.to !== undefined ? ` · ${String(ch.from ?? 'empty')} → ${String(ch.to ?? 'empty')}` : ''}
                      {ch.detail ? ` · ${ch.detail}` : ''}
                    </Typography>
                  ))}
                  {r.changes.length > 15 && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 0.75 }}>and {r.changes.length - 15} more…</Typography>}
                </Box>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSheet(null)} disabled={busy != null}>{problems.length || sheet?.applied ? 'Close' : 'Cancel'}</Button>
          {r && !problems.length && !sheet?.applied && r.changes.length > 0 && (
            <Button variant="contained" onClick={apply} disabled={busy != null} data-testid="timing-sheet-apply"
              startIcon={busy === 'apply' ? <CircularProgress size={15} color="inherit" /> : undefined}>
              {busy === 'apply' ? 'Applying…' : 'Apply changes'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
}
