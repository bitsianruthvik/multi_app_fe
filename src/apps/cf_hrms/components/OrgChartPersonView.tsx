import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Skeleton, Stack, Typography } from '@mui/material';
import { ErrorNotice, Mono, StatusBadge, ToneBadge, useIsPermitted } from '@shared/ui';
import { peopleApi, type AssignmentSummary, type EmployeeDetail } from '../api/people';
import { assignmentsApi, type ResolvedRelationship } from '../api/assignments';
import { pretty } from '../api/roles';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import { SectionTitle } from './OrgChartSeatView';
import { OrgChartJobSection } from './OrgChartJobSection';
import { SHIFT_WORD, inPanelLink, smallLabel, type PanelNav, type PanelView } from './orgChartPanelNav';

/**
 * A person, in the org chart's floating panel (spec §17).
 *
 * Opened from a row of a seat. It answers "who is this" without leaving the
 * chart: their work — the positions they hold, their shift, who they report to
 * — and how to reach them.
 *
 * WHO THEY REPORT TO IS THE RESOLVER'S ANSWER, per job: the formal lines of the
 * seat plus anything recorded for this person, each with its type and the part
 * of the work it covers (`GET /assignments/:id/resolved-reporting`). Never one
 * manager, and never a manager id on the person — there is no such thing here.
 *
 * CONTACT DETAILS ARE FOR PEOPLE ALLOWED TO SEE PERSONAL DATA. The read goes
 * through `GET /people/employees/:id?contact=1`: for a viewer holding
 * `cf_hrms_people_pii` it returns phone and email and writes an audit row; for
 * anyone else the server removes them, and this view says so in a sentence
 * rather than showing blanks. A viewer without `cf_hrms_people_view` cannot
 * read an employee record at all — they see what the chart itself shows.
 */

type PersonView = Extract<PanelView, { kind: 'person' }>;
type Detail = EmployeeDetail & { contact: 'SHOWN' | 'HIDDEN' };

function ReportingLine({ r, nav }: { r: ResolvedRelationship; nav: PanelNav }) {
  const people = r.managerCandidates?.length ? r.managerCandidates : r.manager ? [r.manager] : [];
  const primary = r.relationshipType.code === 'PRIMARY_MANAGER';
  const scoped = r.scope && r.scope.type !== 'GENERAL';
  return (
    <Box
      data-personreports=""
      sx={{
        pl: 1,
        borderLeft: '3px',
        borderLeftStyle: primary ? 'solid' : 'dashed',
        borderLeftColor: primary ? 'var(--c-primary-500)' : 'var(--c-text-3)',
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 0.75 }}>
        {people.length > 0 ? (
          people.map((p, i) => (
            <span key={p.employeeId}>
              {i > 0 ? ', ' : ''}
              <Box
                component="button"
                type="button"
                onClick={() =>
                  nav.push({
                    kind: 'person',
                    employeeId: p.employeeId,
                    title: p.name,
                    employeeCode: p.employeeCode,
                    positionId: p.positionId,
                    shiftCode: null,
                  })
                }
                sx={{ ...inPanelLink, fontWeight: 500 }}
              >
                {p.name}
              </Box>
            </span>
          ))
        ) : (
          <Box component="span" sx={{ fontStyle: 'italic', color: 'var(--c-text-2)' }}>
            {r.note ?? 'Nobody is in that seat today'}
          </Box>
        )}
        <Box component="span" sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
          {r.relationshipType.name}
          {r.origin === 'ASSIGNMENT' ? ' · for this person' : ''}
        </Box>
      </Box>
      <Box sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
        {r.managerPosition ? (
          <Box
            component="button"
            type="button"
            onClick={() =>
              nav.push({ kind: 'seat', positionId: r.managerPosition!.id, title: r.managerPosition!.title ?? 'Position' })
            }
            sx={inPanelLink}
          >
            {r.managerPosition.title ?? r.managerPosition.roleTitle ?? 'Their position'}
          </Box>
        ) : null}
        {scoped && <> · only for {r.scope.label ?? r.scopeSentence}</>}
      </Box>
    </Box>
  );
}

/**
 * One position's job content inside a person's view.
 *
 * A person with one position gets it straight; a person with several gets a
 * block PER POSITION, titled with the position, because an edit here belongs to
 * that one position. Only the position they were opened from starts open; the
 * others fetch nothing until they are opened.
 */
function PositionJob({
  positionId,
  title,
  code,
  collapsible,
  startOpen,
  asOf,
  company,
  nav,
  onChanged,
}: {
  positionId: number;
  title: string;
  code: string | null;
  collapsible: boolean;
  startOpen: boolean;
  asOf: string;
  company: string;
  nav: PanelNav;
  onChanged?: () => void;
}) {
  const [open, setOpen] = useState(startOpen || !collapsible);
  const bodyId = `personjob-${positionId}`;
  return (
    <Box
      data-personjob={positionId}
      sx={
        collapsible
          ? { border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }
          : undefined
      }
    >
      {collapsible ? (
        <Box
          component="button"
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((v) => !v)}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            width: '100%',
            textAlign: 'left',
            border: 0,
            background: 'var(--c-surface-2)',
            font: 'inherit',
            color: 'inherit',
            cursor: 'pointer',
            px: 1,
            py: 0.8,
            '&:focus-visible': { outline: '2px solid var(--c-primary-500)', outlineOffset: -2 },
          }}
        >
          {open ? (
            <ExpandMoreRounded aria-hidden sx={{ fontSize: 20, color: 'var(--c-text-2)' }} />
          ) : (
            <ChevronRightRounded aria-hidden sx={{ fontSize: 20, color: 'var(--c-text-2)' }} />
          )}
          <Box sx={{ fontSize: 13.5, fontWeight: 600, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
            <Box component="span" sx={{ ...smallLabel, mr: 0.75 }}>
              Position
            </Box>
            {title}
          </Box>
          {code && <Mono sx={{ fontSize: 11.5 }}>{code}</Mono>}
        </Box>
      ) : (
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 0.5 }}>
          <Box component="span" sx={{ ...smallLabel, mr: 0.75 }}>
            Position
          </Box>
          {title}
        </Typography>
      )}
      {open && (
        <Box id={bodyId} sx={collapsible ? { p: 1 } : undefined}>
          <OrgChartJobSection
            target={{ type: 'position', id: positionId }}
            roleId={null}
            asOf={asOf}
            company={company}
            onChanged={onChanged}
            onOpenRole={(id, t) => nav.push({ kind: 'role', roleId: id, title: t })}
          />
        </Box>
      )}
    </Box>
  );
}

export function OrgChartPersonView({
  view,
  asOf,
  company,
  nav,
  titleOf,
  onChanged,
}: {
  view: PersonView;
  asOf: string;
  company: string;
  nav: PanelNav;
  /** A position's title as the chart writes it (disambiguated). */
  titleOf?: (positionId: number) => string | undefined;
  /** After a position's content is edited from here. */
  onChanged?: () => void;
}) {
  const can = useIsPermitted();
  const canRead = can('cf_hrms_people_view');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [reporting, setReporting] = useState<Record<number, ResolvedRelationship[]>>({});
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(canRead);

  useEffect(() => {
    if (!canRead) return;
    let live = true;
    setLoading(true);
    setError(null);
    setDetail(null);
    setReporting({});
    peopleApi
      .getForPanel(view.employeeId, asOf)
      .then(async (d) => {
        if (!live) return;
        setDetail(d);
        // Who they report to, for each job they hold today — the resolver's set.
        const jobs = d.assignments.filter((a) => a.isActive);
        const sets = await Promise.all(
          jobs.map((a) =>
            assignmentsApi
              .resolvedReporting(a.id, asOf)
              .then((r) => [a.id, r.relationships] as const)
              .catch(() => [a.id, null] as const),
          ),
        );
        if (!live) return;
        setReporting(Object.fromEntries(sets.filter(([, rows]) => rows).map(([id, rows]) => [id, rows!])));
      })
      .catch((e) => {
        if (live) setError(e);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [canRead, view.employeeId, asOf]);

  const e = detail?.employee ?? null;
  const jobs: AssignmentSummary[] = useMemo(() => (detail?.assignments ?? []).filter((a) => a.isActive), [detail]);
  const many = jobs.length > 1;
  const cameFrom = view.shiftCode ? SHIFT_WORD[view.shiftCode] : null;

  // The positions whose job content is shown: every position they hold today,
  // the one they were opened from first. Without an employee record to read
  // (no cf_hrms_people_view) that is just the position they were opened from.
  const heldPositions = useMemo(() => {
    const list = jobs
      .filter((a) => a.positionId != null)
      .map((a) => ({
        positionId: a.positionId!,
        title: titleOf?.(a.positionId!) ?? a.positionTitle ?? a.roleTitle ?? 'Position',
        code: a.positionCode,
      }));
    if (view.positionId != null && !list.some((h) => h.positionId === view.positionId) && (!canRead || detail)) {
      list.push({ positionId: view.positionId, title: titleOf?.(view.positionId) ?? 'Position', code: null });
    }
    const unique = [...new Map(list.map((h) => [h.positionId, h])).values()];
    return unique
      .sort((a, b) => Number(b.positionId === view.positionId) - Number(a.positionId === view.positionId));
  }, [jobs, view.positionId, titleOf, canRead, detail]);

  const facts: { label: string; value: React.ReactNode }[] = [];
  const code = e?.employeeCode ?? view.employeeCode;
  if (code) facts.push({ label: 'Employee code', value: <Mono sx={{ fontSize: 12.5 }}>{code}</Mono> });
  const shift = jobs.find((a) => a.positionId === view.positionId)?.shiftName ?? jobs.find((a) => a.isPrimary)?.shiftName ?? cameFrom;
  if (shift) facts.push({ label: 'Shift', value: shift });
  if (e) {
    facts.push({ label: 'Joined', value: e.dateOfJoining || '—' });
    facts.push({
      label: 'Employment',
      value: (
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          {pretty(e.employmentType)}
          <StatusBadge status={e.employmentStatus} />
        </Box>
      ),
    });
    if (e.contractorName) facts.push({ label: 'Employer', value: e.contractorName });
  }

  return (
    <Box data-personview="">
      {e?.salutation && (
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 0.75 }}>
          {e.salutation} {e.fullName}
        </Typography>
      )}

      {!canRead && (
        <Typography data-norecord="" sx={{ fontSize: 13, color: 'var(--c-text-2)', lineHeight: 1.55, mb: 1 }}>
          Employee records are not open to your access, so this shows only what the chart itself says about them.
        </Typography>
      )}
      {loading && (
        <Stack spacing={1} aria-busy="true" sx={{ mb: 1 }}>
          <Skeleton variant="rounded" height={22} />
          <Skeleton variant="rounded" height={22} />
        </Stack>
      )}
      {!!error && <ErrorNotice error={error} fallback="That person could not be loaded." />}

      <Box
        component="dl"
        data-facts=""
        sx={{
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr) auto minmax(0, 1fr)',
          columnGap: 1,
          rowGap: 0.25,
          alignItems: 'baseline',
          m: 0,
          fontSize: 13,
          lineHeight: 1.5,
          '@media (max-width: 420px)': { gridTemplateColumns: 'auto minmax(0, 1fr)' },
        }}
      >
        {facts.map((f) => (
          <Box key={f.label} sx={{ display: 'contents' }}>
            <Box component="dt" sx={smallLabel}>
              {f.label}
            </Box>
            <Box component="dd" sx={{ m: 0, minWidth: 0, overflowWrap: 'anywhere' }}>
              {f.value}
            </Box>
          </Box>
        ))}
      </Box>

      {/* The positions they hold, each back into a seat view. */}
      {detail && (
        <Box sx={{ mt: 1.75 }} data-personjobs="">
          <SectionTitle count={jobs.length || undefined}>{many ? 'Positions they hold' : 'Position'}</SectionTitle>
          {jobs.length === 0 ? (
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>No work is assigned to them on {asOf}.</Typography>
          ) : (
            <Stack spacing={1.25}>
              {jobs.map((a) => (
                <Box key={a.id}>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 0.75, rowGap: 0.25, fontSize: 13.5 }}>
                    {a.positionId != null ? (
                      <Box
                        component="button"
                        type="button"
                        onClick={() =>
                          nav.push({
                            kind: 'seat',
                            positionId: a.positionId!,
                            title: a.positionTitle ?? a.roleTitle ?? 'Position',
                          })
                        }
                        sx={{ ...inPanelLink, fontWeight: 500 }}
                      >
                        {a.positionTitle ?? a.roleTitle ?? 'Position'}
                      </Box>
                    ) : (
                      <Box component="span" sx={{ fontWeight: 500 }}>
                        {a.assignmentTitle ?? a.roleTitle ?? 'Work with no position'}
                      </Box>
                    )}
                    {a.positionCode && <Mono sx={{ fontSize: 11.5 }}>{a.positionCode}</Mono>}
                    {many && a.isPrimary && <ToneBadge tone="success" noIcon label="Main job" />}
                  </Box>
                  <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                    {[
                      a.departmentName,
                      a.shiftName,
                      a.allocationPercent != null ? `${a.allocationPercent}% of their time` : null,
                      a.effectiveFrom ? `since ${a.effectiveFrom}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Typography>
                  <Box sx={{ mt: 0.5 }}>
                    <Box sx={smallLabel}>Reports to</Box>
                    {reporting[a.id] == null ? (
                      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>…</Typography>
                    ) : reporting[a.id].length === 0 ? (
                      <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Nobody is recorded as their manager.</Typography>
                    ) : (
                      <Stack spacing={0.5} sx={{ mt: 0.25 }}>
                        {reporting[a.id].map((r) => (
                          <ReportingLine key={r.key} r={r} nav={nav} />
                        ))}
                      </Stack>
                    )}
                  </Box>
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      )}

      {/* Contact — shown, withheld, or nothing on file. Three different sentences. */}
      {detail && (
        <Box sx={{ mt: 1.75 }} data-contact={detail.contact}>
          <SectionTitle>Contact details</SectionTitle>
          {detail.contact === 'HIDDEN' ? (
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Contact details are hidden for your access.</Typography>
          ) : !e?.phone && !e?.email ? (
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>No phone number or email is on file for them.</Typography>
          ) : (
            <>
              <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: 1, rowGap: 0.25, m: 0, fontSize: 13, alignItems: 'baseline' }}>
                {e?.phone && (
                  <>
                    <Box component="dt" sx={smallLabel}>Phone</Box>
                    <Box component="dd" sx={{ m: 0 }}>
                      <Box component="a" href={`tel:${e.phone}`} sx={{ color: 'var(--c-primary-700)' }}>{e.phone}</Box>
                    </Box>
                  </>
                )}
                {e?.email && (
                  <>
                    <Box component="dt" sx={smallLabel}>Email</Box>
                    <Box component="dd" sx={{ m: 0, overflowWrap: 'anywhere' }}>
                      <Box component="a" href={`mailto:${e.email}`} sx={{ color: 'var(--c-primary-700)' }}>{e.email}</Box>
                    </Box>
                  </>
                )}
              </Box>
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mt: 0.5 }}>
                Shown because you may see personal data. This view is recorded.
              </Typography>
            </>
          )}
        </Box>
      )}

      {/* What the job is — per POSITION. The one they were opened from first. */}
      {heldPositions.length > 0 && (
        <Box sx={{ mt: 1.75 }} data-card-jobcontent="">
          <SectionTitle>KRAs, responsibilities and KPIs</SectionTitle>
          <Typography data-belongs="" sx={{ fontSize: 12.5, color: 'var(--c-text-2)', lineHeight: 1.5, mb: 0.75 }}>
            These belong to the position, not to {view.title}: whoever sits in it has the same responsibilities and
            KPIs, and an edit here changes the position.
          </Typography>
          <Stack spacing={1}>
            {heldPositions.map((h, i) => (
              <PositionJob
                key={h.positionId}
                positionId={h.positionId}
                title={h.title}
                code={h.code}
                collapsible={heldPositions.length > 1}
                startOpen={i === 0}
                asOf={asOf}
                company={company}
                nav={nav}
                onChanged={onChanged}
              />
            ))}
          </Stack>
        </Box>
      )}

      {canRead && (
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 2 }}>
          <Button size="small" variant="outlined" component={RouterLink} to={`/${company}/cf_hrms/employees/${view.employeeId}`}>
            Full employee record
          </Button>
        </Stack>
      )}
    </Box>
  );
}

export default OrgChartPersonView;
