import { useRef, useState, type ChangeEvent } from 'react';
import { Button, CircularProgress } from '@mui/material';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import UploadFileRounded from '@mui/icons-material/UploadFileRounded';
import { CfApiError } from '../../api/client';
import { fileToBase64 } from '../../api/bomSheet';
import { downloadBuyingSheet, uploadBuyingSheet, type BuyingSheetKind, type BuyingSheetResult } from '../../api/buyingSheets';
import { BomSheetDialog } from '../Bom/BomSheetDialog';
import { useToast } from '../toastContext';

const WHAT: Record<BuyingSheetKind, string> = { mr: 'material request', pr: 'purchase request', po: 'purchase order' };

/**
 * Download Excel / Upload Excel on a buying screen (MR, PR quotes, PO) — the Structure grid's pattern: the upload is
 * previewed first (the same review dialog), and only Apply changes writes. `canUpload` = the screen's own edit right.
 */
export function BuyingSheetButtons({
  kind, id, code, canUpload, disabled = false, disabledWhy, onApplied,
}: {
  kind: BuyingSheetKind;
  id: number;
  /** The record's code — the downloaded file's name. */
  code: string;
  canUpload: boolean;
  /** e.g. unsaved typing on the screen. */
  disabled?: boolean;
  disabledWhy?: string;
  onApplied: (result: BuyingSheetResult) => void;
}) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'download' | 'preview' | 'apply' | null>(null);
  const [sheet, setSheet] = useState<{ file: File; base64: string; result: BuyingSheetResult } | null>(null);

  const download = async () => {
    setBusy('download');
    try {
      await downloadBuyingSheet(kind, id, `${code.replace(/[^\w.-]+/g, '_')}${kind === 'pr' ? '_quotes' : ''}.xlsx`);
      toast.success('Excel downloaded.');
    } catch (e) {
      toast.error(e instanceof CfApiError ? e.message : 'Could not download the sheet.');
    } finally { setBusy(null); }
  };
  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy('preview');
    try {
      const base64 = await fileToBase64(file);
      setSheet({ file, base64, result: await uploadBuyingSheet(kind, id, base64, true) });
    } catch (e) {
      toast.error(e instanceof CfApiError ? e.message : 'Could not read that workbook.');
    } finally { setBusy(null); }
  };
  const apply = async () => {
    if (!sheet) return;
    setBusy('apply');
    try {
      const result = await uploadBuyingSheet(kind, id, sheet.base64, false);
      setSheet(null);
      toast.success(`Excel applied: ${result.summary.sentence}.`);
      onApplied(result);
    } catch (e) {
      if (e instanceof CfApiError && e.problems.length) setSheet({ ...sheet, result: { ...sheet.result, ok: false, problems: e.problems } });
      toast.error(e instanceof CfApiError ? e.message : 'Could not apply the sheet.');
    } finally { setBusy(null); }
  };

  return (
    <>
      <Button startIcon={busy === 'download' ? <CircularProgress size={14} color="inherit" /> : <DownloadRounded />}
        onClick={() => void download()} disabled={busy != null} data-testid={`${kind}-sheet-download`}
        title={`Download this ${WHAT[kind]} as Excel`}>
        Download Excel
      </Button>
      {canUpload && (
        <>
          <Button startIcon={busy === 'preview' ? <CircularProgress size={14} color="inherit" /> : <UploadFileRounded />}
            onClick={() => input.current?.click()} disabled={busy != null || disabled} data-testid={`${kind}-sheet-upload`}
            title={disabled && disabledWhy ? disabledWhy : `Upload an Excel sheet — rows are matched by item code${kind === 'pr' ? ', vendor columns by supplier code' : ''}. You see a preview first.`}>
            Upload Excel
          </Button>
          <input ref={input} type="file" accept=".xlsx" hidden onChange={(e) => void choose(e)} />
        </>
      )}
      <BomSheetDialog open={!!sheet} fileName={sheet?.file.name ?? ''} result={sheet?.result ?? null} busy={busy === 'apply'}
        onClose={() => setSheet(null)} onApply={() => void apply()} unchangedText={`The ${WHAT[kind]} is unchanged until you press Apply changes.`} />
    </>
  );
}
