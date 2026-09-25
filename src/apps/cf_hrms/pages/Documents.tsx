/**
 * Documents — the generated Role JDs and Employee Responsibility Profiles
 * (DESIGN_SYSTEM.md §4.2 Collection, and §4.6 Run for the generate flow).
 *
 * TWO SCREENS IN ONE ROUTE. `?generate=1` swaps the list for the run panel.
 * Generating is a run — params, a preview you read, then a commit — and a
 * preview of a job description does not fit in a dialog; it IS the document.
 * The state lives in the URL so the browser's back button works and a
 * half-finished generate can be linked to.
 *
 * WHAT THE STAT STRIP COUNTS, AND WHY IT IS NOT A ROW COUNT. §4.2 asks for a
 * metric that names a fixable failure. The fixable thing here is never "how many
 * documents exist" — it is COVERAGE and it is DATA QUALITY:
 *
 *   · roles with no JD, and people with no profile — nobody has generated one;
 *   · roles with no purpose — 63 of Karni's 63 (plan §17.5). A JD from one of
 *     these is a title and a list of duties. That is the honest state of the
 *     data, and the number is here so nobody mistakes a thin document for a
 *     broken generator.
 *
 * These describe the whole set rather than the filtered rows, which §4.2 warns
 * about — so each one says what it counts in its hint, and the row counts a
 * filter produces are shown on the filter chips instead, where they belong.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Stack, Typography } from '@mui/material';
import DescriptionRounded from '@mui/icons-material/DescriptionRounded';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import BadgeRounded from '@mui/icons-material/BadgeRounded';
import EditNoteRounded from '@mui/icons-material/EditNoteRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import {
  Callout,
  DataTable,
  EmptyState,
  ErrorNotice,
  FacetChip,
  FilterBar,
  ListSkeleton,
  Mono,
  PageHeader,
  StatStrip,
  ToneBadge,
  useCompanySlug,
  useIsPermitted,
  type DataColumn,
  type Stat,
} from '@shared/ui';
import {
  DOCUMENT_TYPES,
  documentTargetLabel,
  documentTypeShort,
  documentsApi,
  type DocumentRow,
  type DocumentType,
} from '../api/documents';
import { listRoles, rolesOverview, type RolesOverview } from '../api/roles';
import { peopleApi } from '../api/people';
import { DocumentGeneratePanel } from '../components/DocumentGenerate';

/** Date and time, because two versions of one document are often minutes apart. */
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

export default function Documents() {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const can = useIsPermitted();
  const canGenerate = can('cf_hrms_documents_generate');
  const [params, setParams] = useSearchParams();
  const generating = params.get('generate') === '1';

  const [rows, setRows] = useState<DocumentRow[] | null>(null);
  const [notBuilt, setNotBuilt] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<DocumentType | ''>('');
  const [currentOnly, setCurrentOnly] = useState(false);

  // Coverage needs the model, not just the documents: how many roles and people
  // there are to cover. Both endpoints are live today, so the strip is honest
  // even before the documents route answers.
  const [coverage, setCoverage] = useState<{ roles: number; people: number } | null>(null);
  const [overview, setOverview] = useState<RolesOverview | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    documentsApi
      .list()
      .then((r) => {
        setRows(r.items ?? []);
        setNotBuilt(r.implemented === false);
        setError(null);
      })
      .catch((e) => {
        setRows(null);
        setError(e);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    Promise.all([listRoles(), peopleApi.list()])
      .then(([r, p]) => setCoverage({ roles: r.items.length, people: p.items.length }))
      .catch(() => setCoverage(null));
    rolesOverview()
      .then(setOverview)
      .catch(() => setOverview(null));
  }, []);

  // Memoised so the strip and the filter do not recompute on every render just
  // because `rows ?? []` minted a new array.
  const all = useMemo(() => rows ?? [], [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((r) => {
      if (type && r.documentType !== type) return false;
      if (currentOnly && !r.isCurrent) return false;
      if (!q) return true;
      return [
        documentTargetLabel(r),
        documentTypeShort(r.documentType),
        r.target?.roleCode,
        r.target?.positionCode,
        r.target?.employeeCode,
        r.generatedBy?.name,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [all, search, type, currentOnly]);

  const stats: Stat[] = useMemo(() => {
    // A role is covered only by a CURRENT JD. A superseded one means the role has
    // changed since, which is exactly the case somebody needs to act on.
    const currentJdRoles = new Set(
      all
        .filter((r) => r.documentType === 'ROLE_JD' && r.isCurrent)
        .map((r) => r.target?.roleId)
        .filter((v): v is number => !!v),
    );
    const profiledPeople = new Set(
      all
        .filter((r) => r.documentType === 'EMPLOYEE_RESPONSIBILITY_PROFILE' && r.isCurrent)
        .map((r) => r.target?.employeeId)
        .filter((v): v is number => !!v),
    );
    const rolesWithout = Math.max((coverage?.roles ?? 0) - currentJdRoles.size, 0);
    const peopleWithout = Math.max((coverage?.people ?? 0) - profiledPeople.size, 0);
    const superseded = all.filter((r) => !r.isCurrent).length;

    return [
      {
        label: 'Roles with no JD',
        value: rolesWithout,
        display: coverage ? `${rolesWithout} of ${coverage.roles}` : '—',
        tone: 'warning',
        icon: <DescriptionRounded />,
        hint: 'Roles with no current job description generated. Counts every role in the company, not the filtered rows.',
        onClick: canGenerate ? () => setParams({ generate: '1' }) : undefined,
      },
      {
        label: 'People with no profile',
        value: peopleWithout,
        display: coverage ? `${peopleWithout} of ${coverage.people}` : '—',
        tone: 'warning',
        icon: <BadgeRounded />,
        hint: 'Employees with no current responsibility profile. This is the document an SME actually hands to a person.',
        onClick: canGenerate ? () => setParams({ generate: '1' }) : undefined,
      },
      {
        /* The honesty number (plan §17.5). A JD from a role with no purpose
           opens with a blank line — fixable on the role, not here. */
        label: 'Roles with no purpose',
        value: overview?.noPurpose ?? 0,
        display: overview ? `${overview.noPurpose} of ${overview.total}` : '—',
        tone: 'warning',
        icon: <EditNoteRounded />,
        hint: 'A JD generated from one of these is a title and a list of duties. Write the purpose on the role and regenerate.',
        onClick: () => navigate(`/${company}/cf_hrms/roles`),
      },
      {
        label: 'Superseded copies',
        value: superseded,
        icon: <HistoryRounded />,
        hint: 'Older generations kept as evidence. Each still renders from its own snapshot, not from today’s role.',
      },
    ];
  }, [all, coverage, overview, canGenerate, setParams, navigate, company]);

  const columns: DataColumn<DocumentRow>[] = useMemo(
    () => [
      {
        key: 'type',
        header: 'Document',
        width: 190,
        alwaysVisible: true,
        render: (d) => (
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
            {documentTypeShort(d.documentType)}
          </Typography>
        ),
        sortValue: (d) => documentTypeShort(d.documentType),
        exportValue: (d) => documentTypeShort(d.documentType),
      },
      {
        key: 'target',
        header: 'About',
        render: (d) => (
          <Stack spacing={0.25} sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 500 }}>
              {documentTargetLabel(d)}
            </Typography>
            {/* The seat is named separately: a position-specific JD is a
                different document from the role's, and the list must not make
                them look like two copies of one thing. */}
            {d.target?.positionCode && (
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                Position-specific · {d.target.positionCode}
              </Typography>
            )}
            {!d.target?.positionCode && d.documentType === 'ROLE_JD' && (
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                The role as held anywhere
              </Typography>
            )}
          </Stack>
        ),
        sortValue: (d) => documentTargetLabel(d),
        exportValue: (d) => documentTargetLabel(d),
      },
      {
        key: 'asOf',
        header: 'As at',
        width: 110,
        defaultHidden: true,
        render: (d) => <Mono sx={{ fontSize: 12.5 }}>{d.asOf ?? '—'}</Mono>,
        sortValue: (d) => d.asOf ?? '',
      },
      {
        key: 'generatedAt',
        header: 'Generated',
        width: 175,
        render: (d) => (
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
            {whenText(d.generatedAt)}
          </Typography>
        ),
        sortValue: (d) => d.generatedAt ?? '',
        exportValue: (d) => d.generatedAt ?? '',
      },
      {
        key: 'generatedBy',
        header: 'By',
        width: 150,
        render: (d) => d.generatedBy?.name ?? '—',
        sortValue: (d) => d.generatedBy?.name ?? '',
      },
      {
        key: 'template',
        header: 'Template',
        width: 110,
        defaultHidden: true,
        render: (d) => <Mono sx={{ fontSize: 12 }}>{d.templateVersion ?? '—'}</Mono>,
        sortValue: (d) => d.templateVersion ?? '',
      },
      {
        key: 'current',
        header: 'Standing',
        width: 130,
        render: (d) =>
          d.isCurrent ? (
            <ToneBadge tone="success" noIcon label="Current" />
          ) : (
            <ToneBadge tone="neutral" noIcon label="Superseded" title="A newer one exists for the same target." />
          ),
        sortValue: (d) => (d.isCurrent ? 0 : 1),
        exportValue: (d) => (d.isCurrent ? 'current' : 'superseded'),
      },
    ],
    [],
  );

  if (generating) {
    return (
      <>
        <PageHeader
          title="Generate a document"
          subtitle="resolve the role, its position overlay and the assignment — read it, then freeze it"
        />
        <DocumentGeneratePanel
          companySlug={company}
          canGenerate={canGenerate}
          onCancel={() => setParams({})}
          onGenerated={(id) =>
            id ? navigate(`/${company}/cf_hrms/documents/${id}`) : setParams({})
          }
        />
      </>
    );
  }

  const filtering = !!search || !!type || currentOnly;

  return (
    <>
      <PageHeader
        title="Documents"
        subtitle="job descriptions and responsibility profiles, each frozen as it was generated"
        actions={
          canGenerate && (
            <Button
              size="small"
              variant="contained"
              startIcon={<AutoAwesomeRounded />}
              onClick={() => setParams({ generate: '1' })}
            >
              Generate
            </Button>
          )
        }
      />

      <StatStrip stats={stats} />

      {notBuilt && (
        <Callout label="Backend" title="Generation is not switched on yet" tone="warning">
          The documents route is still reporting itself unimplemented, so nothing can be generated or
          listed. Everything on this screen except the list is live.
        </Callout>
      )}

      <FilterBar search={search} onSearch={setSearch} placeholder="Search role, person or seat…">
        <FacetChip label="All" active={!type} onClick={() => setType('')} count={all.length} />
        {DOCUMENT_TYPES.map((d) => (
          <FacetChip
            key={d.value}
            label={d.short}
            active={type === d.value}
            onClick={() => setType(type === d.value ? '' : d.value)}
            count={all.filter((r) => r.documentType === d.value).length}
          />
        ))}
        <FacetChip
          label="Current only"
          active={currentOnly}
          onClick={() => setCurrentOnly((v) => !v)}
          count={all.filter((r) => r.isCurrent).length}
        />
      </FilterBar>

      {error ? (
        <ErrorNotice
          error={error}
          fallback="The generated documents could not be loaded."
          onRetry={load}
          sx={{ mb: 2 }}
        />
      ) : null}

      {loading && !rows ? (
        <ListSkeleton rows={5} />
      ) : (
        <DataTable
          rows={filtered}
          columns={columns}
          getRowId={(d) => d.id}
          onRowClick={(d) => navigate(`/${company}/cf_hrms/documents/${d.id}`)}
          loading={loading}
          storageKey="cf_hrms.documents"
          exportName="generated-documents"
          defaultSortKey="generatedAt"
          defaultSortDir="desc"
          empty={
            <EmptyState
              icon={<DescriptionRounded />}
              title={filtering ? 'No documents match this filter' : 'Nothing generated yet'}
              hint={
                filtering
                  ? 'Clear the filter to see every generated document.'
                  : 'A document is a frozen copy of what a job was on the day it was generated — the role’s content, the position’s overlay and the person’s assignment, resolved and stored. Nothing here is computed on the fly.'
              }
              action={
                canGenerate && !filtering ? (
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<AutoAwesomeRounded />}
                    onClick={() => setParams({ generate: '1' })}
                  >
                    Generate the first one
                  </Button>
                ) : undefined
              }
            />
          }
        />
      )}
    </>
  );
}
