import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import UploadFileRounded from '@mui/icons-material/UploadFileRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import {
  Callout, ErrorNotice, ListSkeleton, Mono, PageHeader, SectionCard, ToneBadge, errorMessage, useIsPermitted, useToast,
} from '@shared/ui';
import {
  hiringApi, niceDate, readFileBase64, saveHiringFile,
  type HiringSettings as Settings, type LetterKind, type LetterPlaceholder, type LetterTemplate,
} from '../api/hiring';
import { ORG_MANAGE } from '../api/organisation';

/**
 * Letters — what the offer and appointment letters print, and the two Word
 * files they are made from (CF_HRMS_HIRING_SPEC.md §2.2, §2.3).
 *
 * Three things, top to bottom:
 *   1. the company's own details — they are the starting values of every new
 *      hiring, and each hiring can still change them for itself;
 *   2. the two templates — a `.docx` with placeholders in braces. A company
 *      with no file of its own gets a plain built-in letter, so hiring works
 *      before anyone uploads anything;
 *   3. the placeholders a template may use, each with an example, to copy.
 *
 * AN UNKNOWN PLACEHOLDER IS SAID, NOT HIDDEN: after an upload the server lists
 * what it found and what it does not recognise. Those stay visible in every
 * letter, which is the point — a blank where a salary should be is worse.
 */

type Form = Record<keyof Settings, string>;

const toForm = (s: Settings | null): Form => ({
  companyLegalName: s?.companyLegalName ?? '',
  signatoryName: s?.signatoryName ?? '',
  signatoryDesignation: s?.signatoryDesignation ?? '',
  placeOfPosting: s?.placeOfPosting ?? '',
  jurisdiction: s?.jurisdiction ?? '',
  probationMonths: s?.probationMonths == null ? '' : String(s.probationMonths),
  noticeDaysProbation: s?.noticeDaysProbation == null ? '' : String(s.noticeDaysProbation),
  noticeDaysConfirmed: s?.noticeDaysConfirmed == null ? '' : String(s.noticeDaysConfirmed),
  offerValidDays: s?.offerValidDays == null ? '' : String(s.offerValidDays),
});

const text = (v: string) => (v.trim() ? v.trim() : null);
const whole = (v: string) => (v.trim() === '' ? null : Number(v));

const KIND_LABEL: Record<LetterKind, string> = { OFFER: 'Offer letter', APPOINTMENT: 'Appointment letter' };
const KINDS: LetterKind[] = ['OFFER', 'APPOINTMENT'];
const fieldGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 1.5 };

const sizeText = (bytes: number | null) =>
  bytes == null ? '' : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** `{candidate_name}` whether the server sent the key with or without its braces. */
const braced = (key: string) => (key.startsWith('{') ? key : `{${key}}`);

function TemplateRow({
  kind,
  template,
  canManage,
  onUploaded,
}: {
  kind: LetterKind;
  template: LetterTemplate | null;
  canManage: boolean;
  onUploaded: () => void;
}) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'download' | 'upload' | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<{ placeholders: string[]; unknown: string[] } | null>(null);
  const builtIn = !template || template.builtIn;

  const download = async () => {
    setBusy('download');
    try {
      saveHiringFile(await hiringApi.templateFile(kind));
    } catch (e) {
      toast.error(errorMessage(e, 'That template could not be downloaded.'));
    } finally {
      setBusy(null);
    }
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setResult(null);
    if (!/\.docx$/i.test(file.name)) {
      setError(new Error('Choose a Word file that ends in .docx.'));
      return;
    }
    setBusy('upload');
    try {
      const contentBase64 = await readFileBase64(file);
      const r = await hiringApi.uploadTemplate(kind, { fileName: file.name, contentBase64 });
      setResult({ placeholders: r.placeholders ?? [], unknown: r.unknown ?? [] });
      toast.success(`${KIND_LABEL[kind]} template replaced.`);
      onUploaded();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <Box data-template={kind} sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', p: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 1.5, rowGap: 1 }}>
        <Box sx={{ flex: '1 1 220px', minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{KIND_LABEL[kind]}</Typography>
            {builtIn && <ToneBadge tone="neutral" noIcon label="Built-in letter" />}
          </Box>
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>
            {builtIn
              ? 'No file of your own yet. A plain letter with the same details is used.'
              : `${template.fileName ?? 'Your file'}${template.sizeBytes ? ` · ${sizeText(template.sizeBytes)}` : ''}${template.uploadedAt ? ` · uploaded ${niceDate(template.uploadedAt)}` : ''}`}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          <Button size="small" variant="outlined" startIcon={<DownloadRounded />} disabled={busy != null} onClick={() => void download()}>
            {busy === 'download' ? 'Downloading…' : 'Download'}
          </Button>
          {canManage && (
            <>
              <Button size="small" variant="outlined" startIcon={<UploadFileRounded />} disabled={busy != null} onClick={() => input.current?.click()}>
                {busy === 'upload' ? 'Uploading…' : 'Upload a new .docx'}
              </Button>
              <input
                ref={input}
                type="file"
                hidden
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                aria-label={`Upload a new ${KIND_LABEL[kind].toLowerCase()} template`}
                onChange={(e) => void upload(e.target.files?.[0])}
              />
            </>
          )}
        </Stack>
      </Box>
      {!!error && <ErrorNotice error={error} fallback="That file could not be uploaded." sx={{ mt: 1.25 }} />}
      {result && (
        <Box sx={{ mt: 1.25 }} data-template-result="">
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
            {result.placeholders.length
              ? `Found ${result.placeholders.length} placeholder${result.placeholders.length === 1 ? '' : 's'} in the file: `
              : 'No placeholders were found in the file, so every letter will read exactly the same.'}
            {result.placeholders.map((p, i) => (
              <span key={p}>
                {i > 0 ? ', ' : ''}
                <Mono sx={{ fontSize: 12 }}>{braced(p)}</Mono>
              </span>
            ))}
          </Typography>
          {result.unknown.length > 0 && (
            <Callout
              tone="warning"
              title={`${result.unknown.length === 1 ? 'One placeholder is' : `${result.unknown.length} placeholders are`} not known`}
              sx={{ mt: 1, mb: 0 }}
            >
              <Typography sx={{ fontSize: 13, lineHeight: 1.55 }}>
                {result.unknown.map((p, i) => (
                  <span key={p}>
                    {i > 0 ? ', ' : ''}
                    <Mono sx={{ fontSize: 12.5 }}>{braced(p)}</Mono>
                  </span>
                ))}{' '}
                will print exactly as typed, braces and all. Check the spelling against the list below, correct the
                file and upload it again.
              </Typography>
            </Callout>
          )}
        </Box>
      )}
    </Box>
  );
}

export default function HiringSettings() {
  const can = useIsPermitted();
  const canManage = can(ORG_MANAGE);
  const toast = useToast();

  const [saved, setSaved] = useState<Settings | null>(null);
  const [form, setForm] = useState<Form>(toForm(null));
  const [templates, setTemplates] = useState<LetterTemplate[] | null>(null);
  const [placeholders, setPlaceholders] = useState<LetterPlaceholder[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  const loadTemplates = useCallback(() => {
    hiringApi
      .templates()
      .then((r) => setTemplates(r.templates ?? []))
      .catch(setError);
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([hiringApi.settings(), hiringApi.templates(), hiringApi.placeholders()])
      .then(([s, t, p]) => {
        setSaved(s.settings);
        setForm(toForm(s.settings));
        setTemplates(t.templates ?? []);
        setPlaceholders(p.placeholders ?? []);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const set = (key: keyof Form, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(saved));

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const { settings } = await hiringApi.saveSettings({
        companyLegalName: text(form.companyLegalName),
        signatoryName: text(form.signatoryName),
        signatoryDesignation: text(form.signatoryDesignation),
        placeOfPosting: text(form.placeOfPosting),
        jurisdiction: text(form.jurisdiction),
        probationMonths: whole(form.probationMonths),
        noticeDaysProbation: whole(form.noticeDaysProbation),
        noticeDaysConfirmed: whole(form.noticeDaysConfirmed),
        offerValidDays: whole(form.offerValidDays),
      });
      setSaved(settings);
      setForm(toForm(settings));
      toast.success('Letter settings saved.');
    } catch (e) {
      // The form keeps what was typed; only the refusal is shown.
      setSaveError(e);
    } finally {
      setSaving(false);
    }
  };

  const copy = async (key: string) => {
    try {
      await navigator.clipboard.writeText(braced(key));
      toast.success(`${braced(key)} copied.`);
    } catch {
      toast.error('Could not copy. Select the text and copy it by hand.');
    }
  };

  const field = { size: 'small' as const, disabled: !canManage };
  const numeric = { htmlInput: { inputMode: 'numeric' as const } };

  return (
    <Box sx={{ maxWidth: 980 }}>
      <PageHeader
        title="Letters"
        subtitle="what the offer and appointment letters say about the company, and the Word files they are made from"
      />

      {!!error && <ErrorNotice error={error} onRetry={load} sx={{ mb: 2 }} />}

      {loading && !saved && !templates ? (
        <ListSkeleton rows={5} />
      ) : (
        <Stack spacing={2}>
          <SectionCard
            title="Company details on the letters"
            subtitle="Every new hiring starts with these. They can still be changed on one hiring without changing them here."
          >
            <Stack spacing={1.5}>
              <Box sx={fieldGrid}>
                <TextField
                  {...field}
                  label="Company name, in full"
                  value={form.companyLegalName}
                  onChange={(e) => set('companyLegalName', e.target.value)}
                  helperText="As registered — it prints in the body of the letter."
                />
                <TextField {...field} label="Place of posting" value={form.placeOfPosting} onChange={(e) => set('placeOfPosting', e.target.value)} />
                <TextField
                  {...field}
                  label="Jurisdiction"
                  value={form.jurisdiction}
                  onChange={(e) => set('jurisdiction', e.target.value)}
                  helperText="The courts named in the letter, for example Hyderabad, Telangana."
                />
              </Box>
              <Box sx={fieldGrid}>
                <TextField {...field} label="Letters are signed by" value={form.signatoryName} onChange={(e) => set('signatoryName', e.target.value)} />
                <TextField
                  {...field}
                  label="Their designation"
                  value={form.signatoryDesignation}
                  onChange={(e) => set('signatoryDesignation', e.target.value)}
                />
              </Box>
              <Box sx={fieldGrid}>
                <TextField
                  {...field}
                  label="Probation (months)"
                  value={form.probationMonths}
                  onChange={(e) => set('probationMonths', e.target.value)}
                  slotProps={numeric}
                />
                <TextField
                  {...field}
                  label="Notice in probation (days)"
                  value={form.noticeDaysProbation}
                  onChange={(e) => set('noticeDaysProbation', e.target.value)}
                  slotProps={numeric}
                />
                <TextField
                  {...field}
                  label="Notice after confirmation (days)"
                  value={form.noticeDaysConfirmed}
                  onChange={(e) => set('noticeDaysConfirmed', e.target.value)}
                  slotProps={numeric}
                />
                <TextField
                  {...field}
                  label="An offer stays open for (days)"
                  value={form.offerValidDays}
                  onChange={(e) => set('offerValidDays', e.target.value)}
                  slotProps={numeric}
                  helperText="Sets the valid-until date of a new offer."
                />
              </Box>
              {!!saveError && <ErrorNotice error={saveError} fallback="That could not be saved. What you typed is still here." />}
              {canManage ? (
                <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
                  <Button variant="contained" disabled={!dirty || saving} onClick={() => void save()}>
                    {saving ? 'Saving…' : 'Save'}
                  </Button>
                  {dirty && (
                    <Typography role="status" sx={{ fontSize: 12.5, color: 'var(--c-warning-800)' }}>
                      You have changes that are not saved.
                    </Typography>
                  )}
                </Box>
              ) : (
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>
                  Read-only: changing these needs the permission to manage the organisation.
                </Typography>
              )}
            </Stack>
          </SectionCard>

          <SectionCard
            title="Letter templates"
            subtitle="A Word file (.docx) with placeholders in braces, such as {candidate_name}. The letterhead and the wording stay exactly as they are in the file."
          >
            <Stack spacing={1.25}>
              {KINDS.map((k) => (
                <TemplateRow
                  key={k}
                  kind={k}
                  template={(templates ?? []).find((t) => t.kind === k) ?? null}
                  canManage={canManage}
                  onUploaded={loadTemplates}
                />
              ))}
            </Stack>
          </SectionCard>

          <SectionCard
            title="Placeholders"
            subtitle="Type these into the Word file where the value should print. Both letters use the same list; a letter uses the ones it needs."
          >
            {(placeholders ?? []).length === 0 ? (
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>The list of placeholders could not be loaded.</Typography>
            ) : (
              <Box
                component="ul"
                sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 0.75 }}
              >
                {(placeholders ?? []).map((p) => (
                  <Box
                    component="li"
                    key={p.key}
                    data-placeholder={p.key}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      px: 1.25,
                      py: 0.75,
                      border: '1px solid var(--c-divider)',
                      borderRadius: 'var(--r-sm)',
                      minWidth: 0,
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Mono sx={{ fontSize: 12.5, color: 'var(--c-text)', overflowWrap: 'anywhere' }}>{braced(p.key)}</Mono>
                      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>
                        {p.label}
                        {p.example ? ` — e.g. ${p.example}` : ''}
                      </Typography>
                    </Box>
                    <Tooltip title="Copy">
                      <IconButton size="small" aria-label={`Copy ${braced(p.key)}`} onClick={() => void copy(p.key)}>
                        <ContentCopyRounded fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                ))}
              </Box>
            )}
          </SectionCard>
        </Stack>
      )}
    </Box>
  );
}
