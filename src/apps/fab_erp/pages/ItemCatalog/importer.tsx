/**
 * importer.tsx — Export Template / Import Items, and the result dialog.
 *
 * EU-16 item 7: the result dialog used to label every skipped row
 * "(duplicate code)" regardless of why it was actually skipped. EU-15's
 * import service now returns `problems: [{ row, code, reason }]` alongside
 * the existing `warnings` — this renders the real reason per row instead of
 * guessing one.
 *
 * REPAIR-C item 4: a file picked for import now runs `?dryRun=1` FIRST — same
 * endpoint, `itemsImportService` parses and validates the whole file, creates
 * any taxonomy it implies so the numbers match a real apply, then rolls
 * everything back (`routes/items.js` / `itemsImportController.js`). The
 * dry-run dialog shows the problems table (row/code/reason, TAXONOMY_MISMATCH
 * included) and the would-insert/update/skip counts; "Apply" repeats the
 * exact same upload without `dryRun`, so what the user approved is what runs.
 */
import { useRef, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, List,
  ListItem, ListItemText, MenuItem, Table, TableBody, TableCell, TableHead, TableRow, TextField,
  Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import FactCheckIcon from '@mui/icons-material/FactCheck';

import api, { API_HOST } from '@core/utils/axiosConfig';
import { backendMessage, StatusBadge } from '../../components';
import { DialogCloseButton } from '../../components/FormDialog';
import type { ImportItemsResult, ImportDryRunResult } from '../../api/catalog';

/** The row/code/reason table both the dry-run preview and a live result's `problems[]` share. */
function ProblemsTable({ problems }: { problems: ImportDryRunResult['problems'] }) {
  return (
    <Box sx={{ maxHeight: 280, overflow: 'auto' }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontSize: 11, fontWeight: 600 }}>Row</TableCell>
            <TableCell sx={{ fontSize: 11, fontWeight: 600 }}>Code</TableCell>
            <TableCell sx={{ fontSize: 11, fontWeight: 600 }}>Reason</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {problems.map((p, i) => (
            <TableRow key={i}>
              <TableCell sx={{ fontSize: 12.5 }}>{p.row}</TableCell>
              <TableCell sx={{ fontSize: 12.5, fontFamily: 'var(--font-mono, monospace)' }}>{p.code}</TableCell>
              <TableCell sx={{ fontSize: 12.5 }}>{p.reason}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

// Convert a base64 .xlsx payload into a downloaded file.
function downloadBase64Xlsx(base64: string, filename: string) {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const blob = new Blob([arr], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function ImporterControls({ onImported }: { onImported: () => void | Promise<void> }) {
  const importFileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting]       = useState(false);
  const [importResult, setImportResult] = useState<ImportItemsResult | null>(null);
  const [importErr, setImportErr]       = useState('');

  // The file picked stays here between the dry run and the real apply — the
  // dry run rolls back server-side, so "Apply" re-uploads it rather than
  // trying to replay a result that was never written.
  const [dryRunFile, setDryRunFile]     = useState<File | null>(null);
  // Frozen alongside dryRunFile at the moment the dry run was taken — Apply
  // must send THIS mode, not whatever the selector reads live, since the
  // selector is disabled but not unmounted while the preview is open.
  const [dryRunFileMode, setDryRunFileMode] = useState<'append' | 'upsert'>('append');
  const [dryRun, setDryRun]             = useState<ImportDryRunResult | null>(null);
  const [dryRunning, setDryRunning]     = useState(false);
  const [applying, setApplying]         = useState(false);
  /**
   * X3: append (default) inserts new codes and leaves an existing one alone;
   * upsert also OVERWRITES a row whose code already exists — what a re-import
   * of a previously exported catalog needs, since every row in it already has
   * a real code. The dry run runs under the SAME mode so its preview matches
   * what Apply actually does.
   */
  const [mode, setMode] = useState<'append' | 'upsert'>('append');

  async function downloadTemplate() {
    setExporting(true);
    try {
      const companySlug = localStorage.getItem('companySlug');
      const res = await api.get(`${API_HOST}/api/${companySlug}/fab_erp/items/export-template`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'Item_Catalog_Import_Template.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setImportErr(backendMessage(e, 'Could not download the template.'));
    } finally {
      setExporting(false);
    }
  }

  async function handleImportFile(file: File) {
    setDryRunning(true); setImportErr(''); setImportResult(null); setDryRun(null);
    try {
      const companySlug = localStorage.getItem('companySlug');
      const form = new FormData();
      form.append('excel_file', file);
      const res = await api.post<ImportDryRunResult>(
        `${API_HOST}/api/${companySlug}/fab_erp/items/import`, form,
        { headers: { 'Content-Type': 'multipart/form-data' }, params: { dryRun: 1, mode } },
      );
      setDryRunFile(file);
      setDryRunFileMode(mode);
      setDryRun(res.data);
    } catch (e) {
      setImportErr(backendMessage(e, 'Could not check that file.'));
    } finally {
      setDryRunning(false);
    }
  }

  /** Repeats the exact same upload without `dryRun` — what was previewed is what runs. */
  async function applyImport() {
    if (!dryRunFile) return;
    setApplying(true); setImportErr('');
    try {
      const companySlug = localStorage.getItem('companySlug');
      const form = new FormData();
      form.append('excel_file', dryRunFile);
      const res = await api.post<ImportItemsResult>(
        `${API_HOST}/api/${companySlug}/fab_erp/items/import`, form,
        { headers: { 'Content-Type': 'multipart/form-data' }, params: { mode: dryRunFileMode } },
      );
      setImportResult(res.data);
      setDryRun(null);
      setDryRunFile(null);
      await onImported();
    } catch (e) {
      setImportErr(backendMessage(e, 'Import failed.'));
    } finally {
      setApplying(false);
    }
  }

  function cancelDryRun() {
    setDryRun(null);
    setDryRunFile(null);
  }

  return (
    <>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <Button
          variant="outlined" size="small" startIcon={exporting ? <CircularProgress size={14} color="inherit" /> : <DownloadIcon />}
          onClick={downloadTemplate} disabled={exporting}
        >
          Export template
        </Button>
        {/* No Tooltip around a Select: its popover kept the tooltip "hovered" so
            the explanation sat over the options and never cleared. The same
            words live in helperText, where they cannot get in the way. */}
        <TextField
          select size="small" value={mode} disabled={dryRunning || dryRun !== null}
          onChange={(e) => setMode(e.target.value as 'append' | 'upsert')}
          sx={{ minWidth: 120 }}
          helperText={mode === 'upsert' ? 'Updates existing codes' : 'Adds new items only'}
          FormHelperTextProps={{ sx: { m: 0, mt: 0.25, fontSize: 10.5, whiteSpace: 'nowrap' } }}
        >
          <MenuItem value="append">Append</MenuItem>
          <MenuItem value="upsert">Upsert</MenuItem>
        </TextField>
        <Button
          variant="outlined" size="small" startIcon={dryRunning ? <CircularProgress size={14} color="inherit" /> : <UploadFileIcon />}
          onClick={() => importFileRef.current?.click()} disabled={dryRunning}
        >
          Import items
        </Button>
        <input
          ref={importFileRef} type="file" accept=".xlsx" hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImportFile(file);
            e.target.value = '';
          }}
        />
      </Box>

      {importErr && <Alert severity="error" sx={{ mt: 2 }} onClose={() => setImportErr('')}>{importErr}</Alert>}

      <Dialog open={importResult !== null} onClose={() => setImportResult(null)} maxWidth="sm" fullWidth>
        <DialogCloseButton absolute onClose={() => setImportResult(null)} />
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CheckCircleIcon color="success" fontSize="small" />
          Import Complete
        </DialogTitle>
        <DialogContent dividers>
          {importResult && (
            <>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                <StatusBadge status={`${importResult.itemsCreated} created`} family="success" />
                {importResult.itemsUpdated > 0 && <StatusBadge status={`${importResult.itemsUpdated} updated`} family="info" />}
                {importResult.itemsSkipped > 0 && <StatusBadge status={`${importResult.itemsSkipped} skipped`} family="warning" />}
                {importResult.categoriesCreated > 0 && <StatusBadge status={`${importResult.categoriesCreated} new Category`} family="neutral" />}
                {importResult.groupsCreated > 0 && <StatusBadge status={`${importResult.groupsCreated} new Group`} family="neutral" />}
                {importResult.subgroupsCreated > 0 && <StatusBadge status={`${importResult.subgroupsCreated} new Sub-group`} family="neutral" />}
              </Box>
              {/* The real reason per row, not a blanket guess — EU-15's `problems[]`. */}
              {importResult.problems?.length > 0 ? (
                <>
                  <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Rows not imported</Typography>
                  <ProblemsTable problems={importResult.problems} />
                </>
              ) : importResult.warnings.length > 0 && (
                <>
                  <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Warnings</Typography>
                  <List dense disablePadding sx={{ maxHeight: 240, overflow: 'auto', bgcolor: 'background.default', borderRadius: 1 }}>
                    {importResult.warnings.map((w, i) => (
                      <ListItem key={i} sx={{ py: 0.25 }}>
                        <ListItemText primaryTypographyProps={{ variant: 'caption' }} primary={`Row ${w.row}: ${w.message}`} />
                      </ListItem>
                    ))}
                  </List>
                </>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          {importResult?.reportBase64 && (
            <Button startIcon={<DownloadIcon />} onClick={() => downloadBase64Xlsx(importResult.reportBase64!, 'Item_Import_Log.xlsx')}>
              Download import log
            </Button>
          )}
          <Button onClick={() => setImportResult(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* ── dry-run preview — nothing is written until "Apply" ─────────────── */}
      <Dialog open={dryRun !== null} onClose={cancelDryRun} maxWidth="sm" fullWidth>
        <DialogCloseButton absolute onClose={cancelDryRun} />
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FactCheckIcon color="primary" fontSize="small" />
          Check before importing
        </DialogTitle>
        <DialogContent dividers>
          {dryRun && (
            <>
              <Typography variant="body2" sx={{ mb: 1.5 }}>
                Nothing has been written yet. This is what importing <b>{dryRunFile?.name}</b> in{' '}
                <b>{dryRunFileMode}</b> mode would do.
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                <StatusBadge status={`${dryRun.wouldInsert} to create`} family="success" />
                {dryRun.wouldUpdate > 0 && <StatusBadge status={`${dryRun.wouldUpdate} to update`} family="info" />}
                {dryRun.wouldSkip > 0 && <StatusBadge status={`${dryRun.wouldSkip} to skip`} family="warning" />}
              </Box>
              {dryRun.problems.length > 0 ? (
                <>
                  <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                    Rows that would not import ({dryRun.problems.length})
                  </Typography>
                  <ProblemsTable problems={dryRun.problems} />
                </>
              ) : (
                <Alert severity="success" variant="outlined">No problems found.</Alert>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelDryRun} disabled={applying}>Cancel</Button>
          <Button
            variant="contained"
            startIcon={applying ? <CircularProgress size={14} color="inherit" /> : undefined}
            disabled={applying}
            onClick={() => void applyImport()}
          >
            {applying ? 'Applying…' : 'Apply'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
