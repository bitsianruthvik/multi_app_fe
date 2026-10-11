import { useRef, useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import UploadFileRounded from '@mui/icons-material/UploadFileRounded';
import { ConfirmDialog, ErrorNotice, errorMessage, useToast } from '@shared/ui';
import {
  hiringApi, niceDate, readFileBase64, saveHiringFile,
  type Hiring, type SignedKind, type SignedMeta,
} from '../api/hiring';

/**
 * The signed copy of a letter (CF_HRMS_HIRING_SPEC.md §5.3): the offer the
 * candidate signed, or the signed appointment letter. One file per letter —
 * a PDF, a JPG or a PNG — that can be replaced or removed.
 *
 * IT IS ONLY A FILE ON RECORD. Uploading a signed offer does not mark the offer
 * accepted; that stays its own button, because a scan arriving and a person
 * deciding are two different things.
 *
 * WHAT IS ALLOWED IS THE SERVER'S: the type and the size limit are checked
 * there, and its refusal is shown here in its own words — this component does
 * not second-guess a file before sending it.
 */

const KIND_WORDS: Record<SignedKind, string> = { offer: 'offer letter', appointment: 'appointment letter' };
const ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

const sizeText = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function HiringSignedCopy({
  hiringId,
  kind,
  signed,
  canUpload,
  onChanged,
}: {
  hiringId: number;
  kind: SignedKind;
  signed: SignedMeta | null;
  /** `can.uploadSignedOffer` / `can.uploadSignedAppointment`. */
  canUpload: boolean;
  /** The hiring as the server returns it after an upload or a removal. */
  onChanged: (hiring: Hiring) => void;
}) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'upload' | 'download' | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [removing, setRemoving] = useState(false);

  // Nothing on file and nothing may be added: the row would only be noise.
  if (!signed && !canUpload) return null;

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy('upload');
    try {
      const contentBase64 = await readFileBase64(file);
      const r = await hiringApi.putSigned(hiringId, kind, { fileName: file.name, contentBase64 });
      onChanged(r.hiring);
      toast.success(signed ? 'Signed copy replaced.' : 'Signed copy saved.');
    } catch (e) {
      // The server's own sentence: wrong kind of file, or too large.
      setError(e);
    } finally {
      setBusy(null);
      if (input.current) input.current.value = '';
    }
  };

  const download = async () => {
    setBusy('download');
    try {
      saveHiringFile(await hiringApi.signedFile(hiringId, kind));
    } catch (e) {
      toast.error(errorMessage(e, 'That file could not be downloaded.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Box
      data-signed={kind}
      sx={{ border: '1px dashed var(--c-border)', borderRadius: 'var(--r-sm)', px: 1.25, py: 1, background: 'var(--c-surface)' }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 1.5, rowGap: 0.75 }}>
        <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>Signed copy</Typography>
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>
            {signed
              ? `${signed.fileName} · ${sizeText(signed.sizeBytes)} · ${niceDate(signed.uploadedAt)}${signed.uploadedByName ? ` · by ${signed.uploadedByName}` : ''}`
              : `The ${KIND_WORDS[kind]} with the signature on it. PDF, JPG or PNG.`}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          {signed && (
            <Button size="small" variant="outlined" startIcon={<DownloadRounded />} disabled={busy != null} onClick={() => void download()}>
              {busy === 'download' ? 'Downloading…' : 'Download'}
            </Button>
          )}
          {canUpload && (
            <>
              <Button
                size="small"
                variant={signed ? 'text' : 'outlined'}
                startIcon={signed ? undefined : <UploadFileRounded />}
                disabled={busy != null}
                onClick={() => input.current?.click()}
              >
                {busy === 'upload' ? 'Uploading…' : signed ? 'Replace' : 'Upload'}
              </Button>
              <input
                ref={input}
                type="file"
                hidden
                accept={ACCEPT}
                aria-label={`${signed ? 'Replace' : 'Upload'} the signed ${KIND_WORDS[kind]}`}
                onChange={(e) => void upload(e.target.files?.[0])}
              />
            </>
          )}
          {signed && canUpload && (
            <Button size="small" color="inherit" disabled={busy != null} onClick={() => setRemoving(true)} sx={{ color: 'var(--c-text-2)' }}>
              Remove
            </Button>
          )}
        </Stack>
      </Box>
      {!!error && <ErrorNotice error={error} fallback="That file could not be uploaded." sx={{ mt: 1 }} />}
      <ConfirmDialog
        open={removing}
        title="Remove the signed copy?"
        danger
        confirmLabel="Remove"
        body={`${signed?.fileName ?? 'The file'} is taken off this hiring. The ${KIND_WORDS[kind]} itself stays.`}
        onClose={() => setRemoving(false)}
        onConfirm={async () => {
          const r = await hiringApi.removeSigned(hiringId, kind);
          onChanged(r.hiring);
          toast.success('Signed copy removed.');
        }}
      />
    </Box>
  );
}

export default HiringSignedCopy;
