import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Autocomplete, Box, Button, IconButton, MenuItem, TextField, Tooltip, Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import DescriptionRounded from '@mui/icons-material/DescriptionRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import {
  SectionCard, EmptyState, ErrorNotice, ListSkeleton, FormDialog, ConfirmDialog,
  ToneBadge, StatusBadge, Mono, useToast,
} from '@shared/ui';
import {
  peopleApi, readFileAsBase64, toBlobUrl, expiryState, VERIFICATION_TONE,
  type EmployeeDocument, type PeoplePickers,
} from '../api/people';

/**
 * Documents — typed files with their issue and expiry dates.
 *
 * EXPIRY IS THE POINT, not filing. An expired safety licence or driving licence
 * is an operational problem — somebody is on a machine or on the road without
 * cover — so expired and expiring documents are pulled to the top of the list,
 * carry a coloured badge, and are counted in a line above the table that says
 * so in words. A document that quietly expires in a folder is the failure this
 * screen exists to prevent.
 *
 * The bytes live in the database row (Render's free plan has no persistent
 * disk), which is why there is a size ceiling and why the refusal names it.
 */

const fmtSize = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export function EmployeeDocumentsTab({
  employeeId,
  canManage,
  pickers,
  onCountChange,
}: {
  employeeId: number;
  canManage: boolean;
  /** Passed down rather than fetched — the record screen already has it. */
  pickers: PeoplePickers | null;
  onCountChange?: (n: number) => void;
}) {
  const toast = useToast();
  const [items, setItems] = useState<EmployeeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ documentType: '', title: '', issueDate: '', expiryDate: '', verificationStatus: 'UNVERIFIED', notes: '' });
  const [file, setFile] = useState<{ fileName: string; mimeType: string; dataBase64: string; sizeBytes: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<EmployeeDocument | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const docs = await peopleApi.documents(employeeId);
      setItems(docs.items);
      onCountChange?.(docs.items.length);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [employeeId, onCountChange]);

  useEffect(() => {
    void load();
  }, [load]);

  const health = useMemo(() => ({
    expired: items.filter((d) => d.daysToExpiry !== null && d.daysToExpiry < 0).length,
    expiring: items.filter((d) => d.daysToExpiry !== null && d.daysToExpiry >= 0 && d.daysToExpiry <= 30).length,
  }), [items]);

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    const read = await readFileAsBase64(f);
    setFile(read);
    // A sensible default title beats an empty box; the user overwrites it freely.
    setForm((s) => ({ ...s, title: s.title || f.name.replace(/\.[^.]+$/, '') }));
  };

  const submitAdd = async () => {
    if (!file) throw new Error('Choose a file to attach.');
    await peopleApi.addDocument(employeeId, {
      documentType: form.documentType.trim().toUpperCase(),
      title: form.title.trim() || null,
      issueDate: form.issueDate || null,
      expiryDate: form.expiryDate || null,
      verificationStatus: form.verificationStatus,
      notes: form.notes.trim() || null,
      fileName: file.fileName,
      mimeType: file.mimeType,
      dataBase64: file.dataBase64,
    });
    setForm({ documentType: '', title: '', issueDate: '', expiryDate: '', verificationStatus: 'UNVERIFIED', notes: '' });
    setFile(null);
    await load();
    toast.success('Document attached.');
  };

  /**
   * Fetches the bytes and hands them to the browser as a Blob. A plain link to
   * the API would arrive with no Authorization header and 401.
   */
  const download = async (doc: EmployeeDocument) => {
    try {
      const transport = await peopleApi.documentFile(doc.id);
      const url = toBlobUrl(transport);
      const a = document.createElement('a');
      a.href = url;
      a.download = transport.fileName;
      a.rel = 'noopener';
      a.click();
      // Freed on the next tick; revoking immediately can cancel the download.
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      setError(err);
    }
  };

  const setVerification = async (doc: EmployeeDocument, status: string) => {
    try {
      await peopleApi.updateDocument(doc.id, { verificationStatus: status });
      await load();
    } catch (err) {
      setError(err);
    }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    await peopleApi.removeDocument(confirmDelete.id);
    setConfirmDelete(null);
    await load();
    toast.success('Document removed.');
  };

  if (loading) return <SectionCard><ListSkeleton rows={4} /></SectionCard>;
  if (error && !items.length) return <ErrorNotice error={error} onRetry={() => void load()} />;

  const limitMb = pickers ? (pickers.limits.documentStoredBytes / 1024 / 1024).toFixed(0) : '3';

  return (
    <>
      <ErrorNotice error={error} />

      <SectionCard
        title="Documents"
        subtitle={
          health.expired || health.expiring
            ? [
              health.expired && `${health.expired} expired`,
              health.expiring && `${health.expiring} expiring within 30 days`,
            ].filter(Boolean).join(' · ')
            : 'Joining letters, statutory forms, certificates and licences'
        }
        actions={canManage && (
          <Button size="small" startIcon={<AddRounded />} onClick={() => setAddOpen(true)}>
            Attach
          </Button>
        )}
      >
        {items.length === 0 ? (
          <EmptyState
            icon={<DescriptionRounded />}
            title="No documents attached"
            hint="Anything with an expiry — a licence, a medical clearance — is worth putting here so it can be chased before it lapses."
            action={canManage && (
              <Button size="small" variant="contained" startIcon={<AddRounded />} onClick={() => setAddOpen(true)}>
                Attach a document
              </Button>
            )}
          />
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {items.map((d) => {
              const state = expiryState(d.daysToExpiry);
              const urgent = state.tone === 'danger' || state.tone === 'warning';
              return (
                <Box
                  key={d.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    py: 1.5,
                    px: 1.25,
                    borderTop: '1px solid var(--c-border)',
                    '&:first-of-type': { borderTop: 0 },
                    // An expired document must be impossible to scroll past.
                    borderLeft: urgent ? '3px solid' : '3px solid transparent',
                    borderLeftColor: urgent
                      ? (state.tone === 'danger' ? 'var(--c-danger-600)' : 'var(--c-warning-600)')
                      : 'transparent',
                    background: state.tone === 'danger' ? 'var(--c-danger-50)' : undefined,
                    borderRadius: 'var(--r-sm)',
                  }}
                >
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-text)' }}>
                        {d.title || d.documentType}
                      </Typography>
                      <ToneBadge tone="neutral" label={d.documentType} noIcon />
                      <ToneBadge tone={state.tone} label={state.label} />
                      <StatusBadge status={d.verificationStatus} map={VERIFICATION_TONE} />
                    </Box>
                    <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 0.4 }}>
                      <Mono sx={{ fontSize: 12 }}>{d.fileName}</Mono>
                      {' · '}{fmtSize(d.sizeBytes)}
                      {d.issueDate && ` · issued ${d.issueDate}`}
                      {d.expiryDate && ` · expires ${d.expiryDate}`}
                      {d.verifiedByName && ` · checked by ${d.verifiedByName}`}
                    </Typography>
                    {d.notes && (
                      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.4 }}>{d.notes}</Typography>
                    )}
                  </Box>

                  {canManage && (
                    <TextField
                      select
                      size="small"
                      value={d.verificationStatus}
                      onChange={(e) => void setVerification(d, e.target.value)}
                      slotProps={{ htmlInput: { 'aria-label': `Verification state of ${d.title || d.documentType}` } }}
                      sx={{ width: 150, flexShrink: 0 }}
                    >
                      {(pickers?.verificationStatuses ?? ['UNVERIFIED', 'VERIFIED', 'REJECTED']).map((s) => (
                        <MenuItem key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</MenuItem>
                      ))}
                    </TextField>
                  )}

                  <Tooltip title="Download">
                    <IconButton size="small" aria-label={`Download ${d.fileName}`} onClick={() => void download(d)}>
                      <DownloadRounded sx={{ fontSize: 18 }} />
                    </IconButton>
                  </Tooltip>
                  {canManage && (
                    <Tooltip title="Remove">
                      <IconButton size="small" aria-label={`Remove ${d.title || d.documentType}`} onClick={() => setConfirmDelete(d)}>
                        <DeleteOutlineRounded sx={{ fontSize: 18 }} />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              );
            })}
          </Box>
        )}
      </SectionCard>

      {canManage && (
        <FormDialog
          open={addOpen}
          title="Attach a document"
          subtitle={`Stored in the database, so the file must be under ${limitMb} MB compressed.`}
          onClose={() => { setAddOpen(false); setFile(null); }}
          onSubmit={submitAdd}
          submitLabel="Attach"
          submitDisabled={!form.documentType.trim() || !file}
        >
          <Box sx={{ mb: 2 }}>
            <input
              ref={fileInput}
              type="file"
              hidden
              onChange={(e) => void pickFile(e.target.files?.[0])}
            />
            <Button variant="outlined" size="small" onClick={() => fileInput.current?.click()}>
              {file ? 'Choose a different file' : 'Choose a file'}
            </Button>
            {file && (
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 1 }}>
                <Mono sx={{ fontSize: 12.5 }}>{file.fileName}</Mono> · {fmtSize(file.sizeBytes)}
              </Typography>
            )}
          </Box>

          <Autocomplete
            freeSolo
            options={pickers?.documentTypes ?? []}
            value={form.documentType}
            onInputChange={(_, v) => setForm((f) => ({ ...f, documentType: v }))}
            renderInput={(params) => (
              <TextField {...params} label="Document type" required size="small" helperText="What makes it findable later" />
            )}
          />

          <TextField
            label="Title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            size="small"
            fullWidth
            sx={{ mt: 2 }}
          />

          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 2, mt: 2 }}>
            <TextField
              label="Issue date"
              type="date"
              value={form.issueDate}
              onChange={(e) => setForm((f) => ({ ...f, issueDate: e.target.value }))}
              size="small"
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Expiry date"
              type="date"
              value={form.expiryDate}
              onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
              size="small"
              slotProps={{ inputLabel: { shrink: true } }}
              helperText="Leave empty when it never expires"
            />
            <TextField
              label="Verification"
              select
              value={form.verificationStatus}
              onChange={(e) => setForm((f) => ({ ...f, verificationStatus: e.target.value }))}
              size="small"
            >
              {(pickers?.verificationStatuses ?? ['UNVERIFIED', 'VERIFIED', 'REJECTED']).map((s) => (
                <MenuItem key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</MenuItem>
              ))}
            </TextField>
          </Box>

          <TextField
            label="Notes"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            size="small"
            fullWidth
            multiline
            minRows={2}
            sx={{ mt: 2 }}
          />
        </FormDialog>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Remove this document?"
        entityName={confirmDelete?.title || confirmDelete?.documentType}
        body="The row is soft-deleted, so it stays in the history — but the file will no longer appear on this person's file."
        confirmLabel="Remove"
        danger
        onConfirm={remove}
        onClose={() => setConfirmDelete(null)}
      />
    </>
  );
}
