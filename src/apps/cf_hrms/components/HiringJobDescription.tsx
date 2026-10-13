import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Skeleton, Stack, Typography } from '@mui/material';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import type { DocumentSnapshot } from '../api/documents';
import { hiringApi, niceDate, type Hiring } from '../api/hiring';
import { useCan } from '../access/can';
import { DocumentSnapshotView } from './DocumentRender';
import { JobContentPanel } from './JobContentPanel';

/**
 * The Job description step of a hiring: EVERYTHING the job description prints
 * (CF_HRMS_HIRING_SPEC.md §3.3).
 *
 * NOT A SECOND RENDERER. The body is `DocumentSnapshotView` — the component the
 * Documents screen uses for a role's job description — fed by
 * `GET /hirings/:id/jd/preview`, which returns that same snapshot. So what is
 * read here before confirming is section for section what the file holds:
 * purpose, reporting, KRAs with their responsibilities, KPIs and targets,
 * qualifications, skills, authorities, and whatever else the builder prints.
 *
 * BEFORE CONFIRMING it is the system as it stands now; AFTER, the copy that was
 * frozen that day. The download follows the same rule and is always offered —
 * a person may want the document before deciding to confirm it.
 *
 * WHAT IS MISSING IS SAID, in the server's words (`readiness.missing`), with
 * where to change it: the position's own job content, or the role.
 */
export function HiringJobDescription({
  hiring,
  company,
  canOpenRole,
  newTab,
  downloading,
  onDownload,
}: {
  hiring: Hiring;
  company: string;
  canOpenRole: boolean;
  /** In the pop-up the "change this on…" links open beside it, so the hiring stays where it is. */
  newTab: boolean;
  downloading: 'docx' | 'pdf' | null;
  onDownload: (format: 'docx' | 'pdf') => void;
}) {
  // The position page is another area's screen: linked only with that area's view right.
  const canOpenPosition = useCan().positions.view;
  const [snapshot, setSnapshot] = useState<DocumentSnapshot | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  /** The preview could not be read: the position's job content stands in, so the step is never empty. */
  const [fallback, setFallback] = useState(false);
  const frozen = !!hiring.jd;
  const frozenAt = hiring.jd?.generatedAt ?? null;

  const load = useCallback(() => {
    let live = true;
    setLoading(true);
    hiringApi
      .jdPreview(hiring.id)
      .then((r) => {
        if (!live) return;
        setSnapshot(r.preview?.snapshot ?? null);
        setMissing(r.readiness?.missing ?? []);
        setFallback(!r.preview?.snapshot);
      })
      .catch(() => {
        if (live) setFallback(true);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
    // Read again once it is frozen: from then on it is the kept copy, not the system as it is now.
  }, [hiring.id, frozenAt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => load(), [load]);

  const positionHref = `/${company}/cf_hrms/positions/${hiring.positionId}?tab=job&edit=1`;
  const roleHref = `/${company}/cf_hrms/roles/${hiring.roleId}?tab=content`;
  const away = newTab ? { target: '_blank', rel: 'noopener' } : {};
  const link = { color: 'var(--c-primary-700)' };

  return (
    <Stack spacing={1.5} data-jdstep="">
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 1.5, rowGap: 1 }}>
        <Typography sx={{ fontSize: 14, lineHeight: 1.55, flex: '1 1 260px' }}>
          {frozen
            ? `Job description confirmed on ${niceDate(frozenAt)}. This is the copy that was kept as it stood that day.`
            : 'This is the whole job description, built from what the system holds now. Read it, then confirm it — a copy is kept as it stands today.'}
        </Typography>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          <Button
            size="small"
            variant="outlined"
            startIcon={<DownloadRounded />}
            disabled={downloading != null}
            onClick={() => onDownload('docx')}
          >
            {downloading === 'docx' ? 'Downloading…' : 'Download job description'}
          </Button>
          <Button size="small" disabled={downloading != null} onClick={() => onDownload('pdf')} aria-label="Download job description as PDF">
            {downloading === 'pdf' ? 'Downloading…' : 'PDF'}
          </Button>
        </Stack>
      </Box>

      {missing.length > 0 && (
        <Box data-jdmissing="" sx={{ borderLeft: '3px solid var(--c-warning-600)', background: 'var(--c-warning-50)', px: 1.5, py: 1 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'var(--c-warning-800)' }}>
            {frozen ? 'The copy that was kept does not have' : 'The job description does not have yet'}
          </Typography>
          <Box component="ul" sx={{ m: 0, mt: 0.25, pl: 2.5, fontSize: 13, lineHeight: 1.55 }}>
            {missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </Box>
        </Box>
      )}

      {!frozen && (
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 2, rowGap: 0.5, fontSize: 13 }}>
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Nothing is edited here.</Typography>
          {canOpenPosition && (
            <Box component={RouterLink} to={positionHref} {...away} sx={link}>
              Change this on the position
            </Box>
          )}
          {canOpenRole && (
            <Box component={RouterLink} to={roleHref} {...away} sx={link}>
              Change this on the role
            </Box>
          )}
          <Button size="small" startIcon={<RefreshRounded />} disabled={loading} onClick={() => load()}>
            {loading ? 'Reading…' : 'Read again'}
          </Button>
        </Box>
      )}

      {loading && !snapshot && !fallback && (
        <Stack spacing={1} aria-busy="true" aria-label="Loading the job description">
          <Skeleton variant="rounded" height={56} />
          <Skeleton variant="rounded" height={120} />
        </Stack>
      )}
      {snapshot && (
        <Box
          data-jdpreview=""
          sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', p: { xs: 1.25, sm: 2 }, minWidth: 0, overflowX: 'auto' }}
        >
          <DocumentSnapshotView snapshot={snapshot} companySlug={company} />
        </Box>
      )}
      {fallback && !snapshot && (
        <Box>
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 0.75 }}>
            The full job description could not be shown here. These are the position’s KRAs, responsibilities and KPIs;
            the download has every section.
          </Typography>
          <JobContentPanel target={{ type: 'position', id: hiring.positionId }} dense />
        </Box>
      )}
    </Stack>
  );
}

export default HiringJobDescription;
