/**
 * One generated document (DESIGN_SYSTEM.md §4.3 Record).
 *
 * THE ONE BEHAVIOUR THIS SCREEN EXISTS TO PROTECT: it renders the STORED
 * SNAPSHOT and never re-resolves the model. Plan §2 rule 7 and §17.2 — an HR
 * document is evidence, so "what did this role say in March" has to stay
 * answerable after the role changed in April. A record screen that quietly
 * re-read the role would answer with April's content under March's date, and
 * nobody would notice.
 *
 * So there is exactly one fetch here, `documentsApi.get`, and the body is drawn
 * by `DocumentSnapshotView` — the same component the pre-commit preview uses.
 * The header says which date the content was resolved as at, separately from the
 * date it was generated, because on an old document those are the two facts that
 * make it readable.
 *
 * The downloads serve the bytes that were rendered from this same snapshot and
 * stored with it; they are not rendered again in the browser.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, Button, Stack, Typography } from '@mui/material';
import ArticleRounded from '@mui/icons-material/ArticleRounded';
import PictureAsPdfRounded from '@mui/icons-material/PictureAsPdfRounded';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import WorkOutlineRounded from '@mui/icons-material/WorkOutlineRounded';
import EventSeatRounded from '@mui/icons-material/EventSeatRounded';
import BadgeRounded from '@mui/icons-material/BadgeRounded';
import {
  Callout,
  CrossLink,
  DetailHeader,
  DetailLayout,
  DetailSkeleton,
  ErrorNotice,
  FactItem,
  Mono,
  ToneBadge,
  errorMessage,
  useCompanySlug,
  useDetailTitle,
  useIsPermitted,
  useToast,
} from '@shared/ui';
import {
  documentHeadline,
  documentTypeLabel,
  documentsApi,
  downloadDocument,
  snapshotCounts,
  type DocumentRecordResult,
} from '../api/documents';
import { DocumentSnapshotView } from '../components/DocumentRender';

function whenText(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16).replace('T', ' ');
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const docId = Number(id);
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const can = useIsPermitted();
  const canGenerate = can('cf_hrms_documents_generate');

  const [result, setResult] = useState<DocumentRecordResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<'docx' | 'pdf' | null>(null);

  const load = useCallback(async () => {
    if (!Number.isInteger(docId) || docId <= 0) {
      setError(new Error('That document id is not a number.'));
      setLoading(false);
      return;
    }
    setError(null);
    try {
      setResult(await documentsApi.get(docId));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [docId]);

  useEffect(() => {
    void load();
  }, [load]);

  const doc = result?.document ?? null;
  const snapshot = result?.snapshot ?? null;
  useDetailTitle(snapshot ? documentHeadline(snapshot) : undefined);

  /**
   * How much the document actually says. On a profile it is summed across the
   * assignments, because a person's profile is as thin as the roles behind it and
   * a total of zero is the fact worth putting in the header (plan §17.5).
   */
  const counts = useMemo(() => (snapshot ? snapshotCounts(snapshot) : null), [snapshot]);

  const download = async (format: 'docx' | 'pdf') => {
    setBusy(format);
    try {
      await downloadDocument(docId, format, snapshot ? documentHeadline(snapshot) : 'document');
      toast.success(`${format.toUpperCase()} downloaded.`);
    } catch (e) {
      toast.error(errorMessage(e, `That ${format.toUpperCase()} could not be downloaded.`));
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <DetailSkeleton />;
  if (error || !doc || !snapshot) {
    return (
      <ErrorNotice
        error={error}
        fallback="That document could not be loaded."
        onRetry={() => void load()}
      />
    );
  }

  const header = (
    <DetailHeader
      title={documentHeadline(snapshot)}
      badges={
        <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', rowGap: 0.75 }}>
          <ToneBadge tone="neutral" noIcon label={documentTypeLabel(snapshot.documentType)} />
          {doc.isCurrent ? (
            <ToneBadge tone="success" noIcon label="Current" />
          ) : (
            <ToneBadge
              tone="neutral"
              noIcon
              label="Superseded"
              title="A newer document exists for the same target. This one is kept as evidence."
            />
          )}
          {counts?.total === 0 && (
            <ToneBadge
              tone="warning"
              noIcon
              label="No content"
              title="Nothing had been written into the role when this was generated."
            />
          )}
        </Stack>
      }
      subtitle={`Generated ${whenText(doc.generatedAt)}${
        doc.generatedBy?.name ? ` by ${doc.generatedBy.name}` : ''
      }`}
      actions={
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          <Button
            size="small"
            startIcon={<ArticleRounded />}
            disabled={busy !== null}
            onClick={() => void download('docx')}
          >
            {busy === 'docx' ? 'Preparing…' : 'Download DOCX'}
          </Button>
          <Button
            size="small"
            startIcon={<PictureAsPdfRounded />}
            disabled={busy !== null}
            onClick={() => void download('pdf')}
          >
            {busy === 'pdf' ? 'Preparing…' : 'Download PDF'}
          </Button>
          {canGenerate && (
            <Button
              size="small"
              variant="contained"
              startIcon={<AutoAwesomeRounded />}
              onClick={() => navigate(`/${company}/cf_hrms/documents?generate=1`)}
            >
              Generate a new one
            </Button>
          )}
        </Stack>
      }
      facts={
        <>
          {/* Two different dates, never merged. "As at" is the date the layers
              were filtered on; "generated" is when somebody pressed the button.
              A document generated in April for a March date is a normal thing to
              want, and a single "date" column would make it unreadable. */}
          <FactItem label="Content as at" value={<Mono>{snapshot.asOf ?? doc.asOf ?? '—'}</Mono>} />
          <FactItem label="Generated" value={whenText(doc.generatedAt)} />
          <FactItem label="Generated by" value={doc.generatedBy?.name ?? '—'} />
          <FactItem
            label="Template"
            value={<Mono>{snapshot.templateVersion ?? doc.templateVersion ?? '—'}</Mono>}
          />
          <FactItem
            label="Lines of content"
            value={<Mono tabular>{counts?.total ?? 0}</Mono>}
          />
          {!!counts?.suppressed && (
            <FactItem
              label="Removed by overlay"
              value={<Mono tabular>{counts.suppressed}</Mono>}
            />
          )}
        </>
      }
    />
  );

  const crossLinks = (
    <>
      {doc.target?.roleId ? (
        <CrossLink
          icon={<WorkOutlineRounded />}
          label={snapshot.role?.title ?? doc.target.roleTitle ?? 'Role'}
          to={`/${company}/cf_hrms/roles/${doc.target.roleId}`}
        />
      ) : null}
      {doc.target?.positionId ? (
        <CrossLink
          icon={<EventSeatRounded />}
          label={
            snapshot.positionContext?.position?.positionCode ?? doc.target.positionCode ?? 'Position'
          }
          to={`/${company}/cf_hrms/positions/${doc.target.positionId}`}
        />
      ) : null}
      {doc.target?.employeeId ? (
        <CrossLink
          icon={<BadgeRounded />}
          label={snapshot.employee?.fullName ?? doc.target.employeeName ?? 'Employee'}
          to={`/${company}/cf_hrms/employees/${doc.target.employeeId}`}
        />
      ) : null}
      <CrossLink
        icon={<AutoAwesomeRounded />}
        label="All documents"
        to={`/${company}/cf_hrms/documents`}
      />
    </>
  );

  return (
    <DetailLayout
      header={header}
      crossLinks={crossLinks}
      maxWidth={1040}
      beforeTabs={
        <Callout
          label="Snapshot"
          title="This is the document as it was generated, not as the role reads today"
          tone={doc.isCurrent ? 'neutral' : 'info'}
        >
          Everything below was resolved on{' '}
          <strong>{snapshot.asOf ?? doc.asOf ?? 'the generation date'}</strong> and stored with the
          document. The role, the position and the assignment may all have changed since; this page
          deliberately does not follow them.{' '}
          {doc.isCurrent
            ? 'Generate a new one to see today’s model.'
            : 'A newer document exists for the same target — this one is kept because it was true when it was issued.'}
        </Callout>
      }
    >
      {/* The reader should be able to tell a JD apart from a profile without
          reading the header twice, so the body opens by naming itself. */}
      <Box sx={{ mb: 1.5 }}>
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
          {snapshot.documentType === 'EMPLOYEE_RESPONSIBILITY_PROFILE'
            ? 'Every work assignment this person held on that date, each with its own managers and its own resolved content.'
            : 'The role’s content, resolved through any position overlay that applied.'}
        </Typography>
      </Box>
      <DocumentSnapshotView snapshot={snapshot} companySlug={company} />
    </DetailLayout>
  );
}
