/**
 * THE renderer. One component draws the live preview on the generate screen and
 * the frozen snapshot on the document screen.
 *
 * WHY THAT MATTERS MORE THAN IT SOUNDS. A generated document is evidence (plan
 * §2 rule 7) — "what did this role say in March" has to stay answerable after
 * the role changed. So the thing a person approves before pressing Generate must
 * be the thing that gets frozen, and the only way to guarantee that in a UI is
 * for both to be the same code reading the same shape. `documentsApi.preview`
 * and `documentsApi.get` both return a `DocumentSnapshot`; this file does not
 * know, and must not be able to tell, which one it was handed.
 *
 * It renders no controls and fetches nothing. Give it a snapshot.
 *
 * THE EMPTY-SECTION SENTENCES COME FROM THE SNAPSHOT, NOT FROM HERE. Each
 * heading arrives with a `state` and, when empty, the exact `note` the DOCX
 * printed (plan §17.5, documentService.js `EMPTY_NOTE`). This file renders those
 * words. Writing prettier ones here would make the screen and the file HR
 * actually posted disagree about what "not recorded" means — and the person who
 * finds the difference will be holding the printed copy.
 *
 * THE FOUR RULES IT IMPLEMENTS (primitives in DocumentParts.tsx):
 *   · every row shows its origin once more than one layer is in play;
 *   · ungrouped responsibilities and KPIs appear under "Additional";
 *   · suppressed rows are printed, struck through, with who removed them;
 *   · an empty section keeps its heading and says why it is empty.
 */
import type { ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { CapsLabel, Callout, Mono, SectionCard, StatusBadge, Surface, ToneBadge } from '@shared/ui';
import {
  contentCounts,
  normaliseContent,
  pretty,
  sectionMap,
  type DocumentSection,
  type DocumentSnapshot,
  type Origin,
  type ProfileAssignmentBlock,
  type ResolvedContent,
  type ResolvedItem,
} from '../api/documents';
import type { AssignmentContextRow } from '../api/assignments';
import type { PositionContextRow } from '../api/positions';
import {
  EmptySectionNote,
  IgnoredOverrides,
  ItemLines,
  ManagerLines,
  OriginChip,
  OriginLegend,
  SuppressedList,
} from './DocumentParts';

type SectionLookup = (key: string) => DocumentSection | undefined;

/** Every origin that actually appears in the resolved content. */
function observedOrigins(c: ResolvedContent): Origin[] {
  const seen = new Set<Origin>();
  const note = (rows: ResolvedItem[]) => rows.forEach((r) => r.origin && seen.add(r.origin));
  c.kras.forEach((k) => {
    if (k.origin) seen.add(k.origin);
    note(k.responsibilities);
    note(k.kpis);
  });
  note(c.additional.responsibilities);
  note(c.additional.kpis);
  note(c.skills);
  note(c.qualifications);
  note(c.experience);
  note(c.authorities);
  note(c.relationships);
  note(c.conditions);
  c.suppressed.forEach((s) => s.byLayer && seen.add(s.byLayer));
  const order: Origin[] = ['ROLE', 'POSITION', 'ASSIGNMENT'];
  return order.filter((o) => seen.has(o));
}

/**
 * A grid of small facts — the things true of a whole block rather than of one
 * row. Anything null is dropped, so a seat with no location does not print a
 * label above an em dash.
 */
function FactGrid({ facts }: { facts: { label: string; value: ReactNode }[] }) {
  const shown = facts.filter((f) => f.value !== null && f.value !== undefined && f.value !== '');
  if (shown.length === 0) return null;
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 1.75,
      }}
    >
      {shown.map((f) => (
        <Box key={f.label} sx={{ minWidth: 0 }}>
          <CapsLabel sx={{ color: 'var(--c-text-3)', mb: 0.25 }}>{f.label}</CapsLabel>
          <Box sx={{ fontSize: 13.5, color: 'var(--c-text)', overflowWrap: 'anywhere' }}>
            {f.value}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function ContextChips({
  contexts,
}: {
  contexts: (PositionContextRow | AssignmentContextRow)[];
}) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', rowGap: 0.75 }}>
      {contexts.map((c, i) => (
        <Mono key={c.id ?? i} chip sx={{ fontSize: 11.5 }}>
          {c.workContextName ?? c.workContextCode ?? 'Context'}
          {c.isPrimary ? ' · primary' : ''}
        </Mono>
      ))}
    </Stack>
  );
}

/**
 * A heading with its rows, or with the sentence that says why there are none.
 *
 * `sectionKey` reaches into the snapshot's own `sections[]` for the heading and
 * the empty note. `fallbackWhat` is used only when the snapshot carried no
 * descriptor for that key — an older document, or a preview from a backend that
 * has not caught up. Either way the heading is rendered; that is the rule.
 */
function ContentSection({
  look,
  sectionKey,
  fallbackHeading,
  fallbackWhat,
  fallbackSubtitle,
  linkLabel,
  count,
  roleHref,
  children,
  sx,
}: {
  look: SectionLookup;
  sectionKey: string;
  fallbackHeading: string;
  fallbackWhat: string;
  fallbackSubtitle?: string;
  /**
   * The action that follows the note. Per-section because the notes are
   * sentences: "No role purpose has been written yet. Write them on the role."
   * does not read as English, and a document that reads badly is a document
   * people stop trusting.
   */
  linkLabel: string;
  count: number;
  roleHref?: string;
  children: ReactNode;
  sx?: object;
}) {
  const s = look(sectionKey);
  const empty = count === 0;
  return (
    <SectionCard
      title={s?.heading ?? fallbackHeading}
      subtitle={s?.subtitle ?? fallbackSubtitle}
      sx={sx}
    >
      {empty ? (
        <EmptySectionNote note={s?.note} what={fallbackWhat} to={roleHref} linkLabel={linkLabel} />
      ) : (
        children
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// The resolved content tree
// ---------------------------------------------------------------------------

/**
 * The resolver's output, rendered (plan §17.1).
 *
 * `roleHref` is where a missing section would be written. It is threaded through
 * rather than derived, because on a responsibility profile each assignment's
 * content belongs to a DIFFERENT role and a link to the wrong one is worse than
 * no link.
 */
export function DocumentContentBody({
  content: raw,
  sections,
  roleHref,
}: {
  content: Partial<ResolvedContent> | null | undefined;
  sections?: DocumentSection[];
  roleHref?: string;
}) {
  const content = normaliseContent(raw);
  const counts = contentCounts(content);
  const look = sectionMap(sections);

  /**
   * DECLARED vs OBSERVED layers, and why the difference matters.
   *
   * `content.layers` says which layers were CONSIDERED — a JD asked for by
   * position always lists POSITION. `observedOrigins` says which ones actually
   * produced something. Karni's position-specific JD for BFL Incharge declares
   * POSITION and carries 27 rows that all came from the role, because that seat
   * has no overlays yet.
   *
   * Marking every one of those 27 rows "Role" would be 27 identical chips, which
   * teaches people to stop reading chips. So the chips appear only when a second
   * layer really contributed, and the single-layer case gets the more useful
   * statement instead: this position adds, changes and removes nothing.
   */
  const declared: Origin[] = content.layers ?? ['ROLE'];
  const observed = observedOrigins(content);
  const ordered: Origin[] = observed.length ? observed : ['ROLE'];
  const showOrigin = ordered.length > 1;

  const additionalCount = content.additional.responsibilities.length + content.additional.kpis.length;

  return (
    <Box>
      <OriginLegend observed={ordered} declared={declared} />

      {/* ── Key result areas, with responsibilities and KPIs nested ───────── */}
      <ContentSection
        look={look}
        sectionKey="kras"
        fallbackHeading="Key result areas"
        fallbackWhat="key result areas"
        fallbackSubtitle="What the role is accountable for"
        linkLabel="Add key result areas"
        count={counts.kras}
        roleHref={roleHref}
      >
        <Stack spacing={2}>
          {content.kras.map((kra, i) => (
            <Box key={kra.key ?? `${kra.definitionId ?? kra.name}:${i}`}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 1,
                  flexWrap: 'wrap',
                  pb: 0.5,
                  borderBottom: '2px solid var(--c-border)',
                }}
              >
                <Typography sx={{ fontSize: 14.5, fontWeight: 600, color: 'var(--c-text)' }}>
                  {kra.name}
                </Typography>
                {kra.weightPercent != null && (
                  <Mono chip tabular sx={{ fontSize: 11 }}>
                    {kra.weightPercent}%
                  </Mono>
                )}
                {/* A KRA can itself be added by a position or an assignment, so
                    the heading carries its own origin, not just its rows. */}
                {showOrigin && <OriginChip origin={kra.origin} overridden={kra.overridden} />}
              </Box>
              {kra.description && (
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.75 }}>
                  {kra.description}
                </Typography>
              )}

              <Box sx={{ pl: { xs: 0, sm: 1.5 }, mt: 1 }}>
                <CapsLabel sx={{ mb: 0.25 }}>
                  Responsibilities · {kra.responsibilities.length}
                </CapsLabel>
                <ItemLines
                  items={kra.responsibilities}
                  showOrigin={showOrigin}
                  numbered
                  empty={
                    <Box sx={{ fontSize: 12.5, color: 'var(--c-text-3)', py: 0.5 }}>
                      Nothing written under this area yet.
                    </Box>
                  }
                />

                <CapsLabel sx={{ mt: 1.25, mb: 0.25 }}>Indicators · {kra.kpis.length}</CapsLabel>
                <ItemLines
                  items={kra.kpis}
                  showOrigin={showOrigin}
                  weight
                  empty={
                    <Box sx={{ fontSize: 12.5, color: 'var(--c-text-3)', py: 0.5 }}>
                      No indicators written for this area yet — accountability without a measure.
                    </Box>
                  }
                />
              </Box>
            </Box>
          ))}
        </Stack>
      </ContentSection>

      {/* ── Ungrouped. NEVER dropped (§17.1) ──────────────────────────────── */}
      {additionalCount > 0 && (
        <SectionCard
          title="Additional"
          subtitle={
            counts.kras === 0
              ? 'Recorded against the role but not grouped, because the role has no key result areas yet'
              : 'Recorded against the role but not grouped under any key result area — shown here rather than lost'
          }
          sx={{ mt: 2 }}
        >
          {content.additional.responsibilities.length > 0 && (
            <>
              <CapsLabel sx={{ mb: 0.25 }}>
                Responsibilities · {content.additional.responsibilities.length}
              </CapsLabel>
              <ItemLines
                items={content.additional.responsibilities}
                showOrigin={showOrigin}
                numbered
                empty={null}
              />
            </>
          )}
          {content.additional.kpis.length > 0 && (
            <>
              <CapsLabel sx={{ mt: 1.25, mb: 0.25 }}>
                Indicators · {content.additional.kpis.length}
              </CapsLabel>
              <ItemLines items={content.additional.kpis} showOrigin={showOrigin} weight empty={null} />
            </>
          )}
        </SectionCard>
      )}

      {/* When there are no KRAs AND nothing ungrouped, the responsibilities
          heading has to appear somewhere or the document silently claims the
          role has no duties. */}
      {counts.kras === 0 && counts.responsibilities === 0 && (
        <ContentSection
          look={look}
          sectionKey="responsibilities"
          fallbackHeading="Responsibilities"
          fallbackWhat="responsibilities"
          linkLabel="Add responsibilities"
          count={0}
          roleHref={roleHref}
          sx={{ mt: 2 }}
        >
          {null}
        </ContentSection>
      )}

      {/* ── What it needs from a person ───────────────────────────────────── */}
      <ContentSection
        look={look}
        sectionKey="skills"
        fallbackHeading="Skills"
        fallbackWhat="skill requirements"
        linkLabel="Add skills"
        count={counts.skills}
        roleHref={roleHref}
        sx={{ mt: 2 }}
      >
        <ItemLines items={content.skills} showOrigin={showOrigin} empty={null} />
      </ContentSection>

      <ContentSection
        look={look}
        sectionKey="qualifications"
        fallbackHeading="Qualifications"
        fallbackWhat="qualifications"
        linkLabel="Add qualifications"
        count={counts.qualifications}
        roleHref={roleHref}
        sx={{ mt: 2 }}
      >
        <ItemLines items={content.qualifications} showOrigin={showOrigin} empty={null} />
      </ContentSection>

      <ContentSection
        look={look}
        sectionKey="experience"
        fallbackHeading="Experience"
        fallbackWhat="experience requirements"
        linkLabel="Add an experience requirement"
        count={counts.experience}
        roleHref={roleHref}
        sx={{ mt: 2 }}
      >
        <ItemLines items={content.experience} showOrigin={showOrigin} empty={null} />
      </ContentSection>

      {/* ── Authority ─────────────────────────────────────────────────────── */}
      <ContentSection
        look={look}
        sectionKey="authorities"
        fallbackHeading="Authorities"
        fallbackWhat="authorities"
        linkLabel="Add authorities"
        fallbackSubtitle="What this role may approve, stop, issue or decide"
        count={counts.authorities}
        roleHref={roleHref}
        sx={{ mt: 2 }}
      >
        <ItemLines items={content.authorities} showOrigin={showOrigin} empty={null} />
      </ContentSection>

      {/* ── Expected relationships. NOT reporting (plan §2 rule 9) ────────── */}
      <ContentSection
        look={look}
        sectionKey="relationships"
        fallbackHeading="Expected working relationships"
        fallbackWhat="expected working relationships"
        linkLabel="Add relationships"
        fallbackSubtitle="Who this role coordinates with. This is not the reporting line."
        count={counts.relationships}
        roleHref={roleHref}
        sx={{ mt: 2 }}
      >
        <ItemLines items={content.relationships} showOrigin={showOrigin} empty={null} />
      </ContentSection>

      {/* ── Conditions ────────────────────────────────────────────────────── */}
      <ContentSection
        look={look}
        sectionKey="conditions"
        fallbackHeading="Working conditions"
        fallbackWhat="working conditions"
        linkLabel="Add working conditions"
        count={counts.conditions}
        roleHref={roleHref}
        sx={{ mt: 2 }}
      >
        <ItemLines items={content.conditions} showOrigin={showOrigin} empty={null} />
      </ContentSection>

      <SuppressedList items={content.suppressed} heading={look('suppressed')?.heading} />
      <IgnoredOverrides items={content.overlay?.ignored ?? []} />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// The two documents
// ---------------------------------------------------------------------------

function RoleJdBody({
  snapshot,
  companySlug,
}: {
  snapshot: DocumentSnapshot;
  companySlug: string;
}) {
  const role = snapshot.role ?? null;
  const ctx = snapshot.positionContext ?? null;
  const roleHref = role ? `/${companySlug}/cf_hrms/roles/${role.id}` : undefined;
  const look = sectionMap(snapshot.sections);

  return (
    <Box>
      <ContentSection
        look={look}
        sectionKey="purpose"
        fallbackHeading="Purpose of the role"
        fallbackWhat="purpose statement"
        linkLabel="Write the purpose"
        fallbackSubtitle={role?.roleCode ? `Role ${role.roleCode}` : undefined}
        count={role?.rolePurpose ? 1 : 0}
        roleHref={roleHref}
      >
        <Typography sx={{ fontSize: 14, color: 'var(--c-text)', lineHeight: 1.65 }}>
          {role?.rolePurpose}
        </Typography>
      </ContentSection>

      {role?.roleSummary && (
        <SectionCard title={look('summary')?.heading ?? 'Summary'} sx={{ mt: 2 }}>
          <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)', lineHeight: 1.6 }}>
            {role.roleSummary}
          </Typography>
        </SectionCard>
      )}

      {/* The position-specific version says which seat it is for, and what that
          seat adds — department, location, shift, machines, formal line. */}
      {ctx?.position && (
        <SectionCard
          title="At this position"
          subtitle="The seat this version of the job description is written for"
          sx={{ mt: 2 }}
        >
          <FactGrid
            facts={[
              {
                label: 'Position',
                value: (
                  <Box
                    component={Link}
                    to={`/${companySlug}/cf_hrms/positions/${ctx.position.id}`}
                    sx={{
                      color: 'var(--c-text)',
                      textDecoration: 'none',
                      '&:hover': { color: 'var(--c-primary-700)' },
                    }}
                  >
                    {ctx.position.positionCode ?? ctx.position.displayTitle}
                  </Box>
                ),
              },
              { label: 'Title', value: ctx.position.positionTitle ?? ctx.position.displayTitle },
              { label: 'Department', value: ctx.position.departmentName },
              { label: 'Location', value: ctx.position.locationName },
              { label: 'Default shift', value: ctx.position.shiftName ?? ctx.position.shiftCode },
              {
                label: 'Sanctioned seats',
                value: <Mono tabular>{ctx.position.seats}</Mono>,
              },
            ]}
          />
          {!!ctx.workContexts?.length && (
            <Box sx={{ mt: 1.75 }}>
              <CapsLabel sx={{ mb: 0.5 }}>
                Machines, lines and areas · {ctx.workContexts.length}
              </CapsLabel>
              <ContextChips contexts={ctx.workContexts} />
            </Box>
          )}
          <Box sx={{ mt: 1.75 }}>
            <CapsLabel sx={{ mb: 0.5 }}>
              Formal reporting · seat to seat ·{' '}
              {ctx.formalReporting?.relationships?.length ?? 0}
            </CapsLabel>
            <ManagerLines
              managers={ctx.formalReporting?.relationships ?? []}
              companySlug={companySlug}
              emptyNote={look('reporting')?.note}
            />
          </Box>
        </SectionCard>
      )}

      <Box sx={{ mt: 2 }}>
        <DocumentContentBody
          content={snapshot.content}
          sections={snapshot.sections}
          roleHref={roleHref}
        />
      </Box>
    </Box>
  );
}

function AssignmentBlock({
  block,
  companySlug,
  index,
  total,
}: {
  block: ProfileAssignmentBlock;
  companySlug: string;
  index: number;
  total: number;
}) {
  const a = block.assignment;
  const look = sectionMap(block.sections);
  const roleHref = a.roleId ? `/${companySlug}/cf_hrms/roles/${a.roleId}` : undefined;
  const managers = block.reporting?.relationships ?? [];

  return (
    <Surface e={1} sx={{ p: { xs: 2, sm: 2.5 }, mt: 2 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 1,
          flexWrap: 'wrap',
          pb: 1,
          mb: 1.75,
          borderBottom: '2px solid var(--c-border)',
        }}
      >
        <CapsLabel sx={{ color: 'var(--c-primary-700)' }}>
          Assignment {index} of {total}
        </CapsLabel>
        <Typography sx={{ fontSize: 15.5, fontWeight: 600, color: 'var(--c-text)' }}>
          {a.assignmentTitle ?? a.roleTitle ?? 'Untitled assignment'}
        </Typography>
        {a.isPrimary && <ToneBadge tone="info" label="Primary" noIcon />}
        {a.status && <StatusBadge status={a.status} />}
      </Box>

      <FactGrid
        facts={[
          {
            label: 'Role',
            value: roleHref ? (
              <Box
                component={Link}
                to={roleHref}
                sx={{
                  color: 'var(--c-text)',
                  textDecoration: 'none',
                  '&:hover': { color: 'var(--c-primary-700)' },
                }}
              >
                {a.roleTitle ?? a.roleCode ?? `#${a.roleId}`}
              </Box>
            ) : (
              (a.roleTitle ?? null)
            ),
          },
          {
            /* Position is OPTIONAL on an assignment and Role is required (plan
               §2 rule 5). "No position" is normal, not a gap — say so rather
               than printing an em dash that reads like missing data. */
            label: 'Position',
            value: a.positionId ? (
              <Box
                component={Link}
                to={`/${companySlug}/cf_hrms/positions/${a.positionId}`}
                sx={{
                  color: 'var(--c-text)',
                  textDecoration: 'none',
                  '&:hover': { color: 'var(--c-primary-700)' },
                }}
              >
                {a.positionCode ?? a.positionTitle ?? `#${a.positionId}`}
              </Box>
            ) : (
              <Box component="span" sx={{ color: 'var(--c-text-3)' }}>
                No sanctioned seat — normal; the role is what is required
              </Box>
            ),
          },
          { label: 'Department', value: a.departmentName },
          { label: 'Location', value: a.locationName },
          { label: 'Allocation', value: a.allocationText ?? (a.allocationPercent != null ? `${a.allocationPercent}%` : null) },
          { label: 'Default shift', value: a.shiftName ?? a.shiftCode },
          {
            label: 'In force',
            value: a.effectiveFrom
              ? `${a.effectiveFromText ?? a.effectiveFrom}${a.effectiveTo ? ` to ${a.effectiveTo}` : ' — open'}`
              : null,
          },
        ]}
      />

      <Box sx={{ mt: 1.75 }}>
        <CapsLabel sx={{ mb: 0.5 }}>
          {look('contexts')?.heading ?? 'Machines, lines and areas'} · {a.contexts?.length ?? 0}
        </CapsLabel>
        {a.contexts?.length ? (
          <ContextChips contexts={a.contexts} />
        ) : (
          <EmptySectionNote note={look('contexts')?.note} what="machines, lines or areas linked to this work" />
        )}
      </Box>

      {/* Every manager, with scope. Never one. See ManagerLines. */}
      <Box sx={{ mt: 1.75 }}>
        <CapsLabel sx={{ mb: 0.5 }}>
          {look('reporting')?.heading ?? 'Reports to'} · {managers.length}
        </CapsLabel>
        <ManagerLines
          managers={managers}
          companySlug={companySlug}
          emptyNote={look('reporting')?.note}
        />
      </Box>

      <Box sx={{ mt: 2 }}>
        <DocumentContentBody
          content={block.content}
          sections={block.sections}
          roleHref={roleHref}
        />
      </Box>
    </Surface>
  );
}

function ProfileBody({
  snapshot,
  companySlug,
}: {
  snapshot: DocumentSnapshot;
  companySlug: string;
}) {
  const e = snapshot.employee ?? null;
  const assignments = snapshot.assignments ?? [];
  const excluded = snapshot.excludedAssignments ?? [];
  const look = sectionMap(snapshot.sections);

  return (
    <Box>
      <SectionCard
        title="The person"
        subtitle={e?.employeeCode ? `Employee ${e.employeeCode}` : undefined}
      >
        <FactGrid
          facts={[
            {
              label: 'Name',
              value: e?.id ? (
                <Box
                  component={Link}
                  to={`/${companySlug}/cf_hrms/employees/${e.id}`}
                  sx={{
                    color: 'var(--c-text)',
                    textDecoration: 'none',
                    fontWeight: 500,
                    '&:hover': { color: 'var(--c-primary-700)' },
                  }}
                >
                  {e.fullName}
                </Box>
              ) : (
                (e?.fullName ?? null)
              ),
            },
            { label: 'Joined', value: e?.dateOfJoiningText ?? e?.dateOfJoining },
            { label: 'Engagement', value: e?.employmentType ? pretty(e.employmentType) : null },
            {
              label: 'Status',
              value: e?.employmentStatus ? <StatusBadge status={e.employmentStatus} /> : null,
            },
            { label: 'Through', value: e?.contractorName },
          ]}
        />
      </SectionCard>

      {assignments.length === 0 ? (
        <Box sx={{ mt: 2 }}>
          <SectionCard title={look('assignments')?.heading ?? 'Work assignments'}>
            <EmptySectionNote
              note={look('assignments')?.note}
              what="work assignments in force on this date"
              to={`/${companySlug}/cf_hrms/assignments`}
              linkLabel="Assign work"
            />
          </SectionCard>
        </Box>
      ) : (
        <>
          {/* The sentence that makes "Ram Babu does three jobs" legible. A
              profile that opened straight into the first assignment would read
              as though it were the only one. */}
          <Box sx={{ mt: 2, fontSize: 13.5, color: 'var(--c-text-2)', lineHeight: 1.6 }}>
            {assignments.length === 1 ? (
              <>One work assignment, described in full below.</>
            ) : (
              <>
                <strong>{assignments.length} separate work assignments</strong>, each with its own
                role, its own managers and its own responsibilities. All are listed in full — none of
                them is a footnote to another.
              </>
            )}
          </Box>
          {assignments.map((block, i) => (
            <AssignmentBlock
              key={block.assignment?.id ?? i}
              block={block}
              companySlug={companySlug}
              index={i + 1}
              total={assignments.length}
            />
          ))}
        </>
      )}

      {/* Ended and not-yet-open assignments are NAMED, not dropped. A profile
          that silently omits last month's job invites "why does this not match
          what he was doing in August". */}
      {excluded.length > 0 && (
        <Surface
          e={0}
          sx={{ mt: 2, p: 2, background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}
        >
          <CapsLabel sx={{ color: 'var(--c-text-2)', mb: 1 }}>
            Not included · {excluded.length}
          </CapsLabel>
          <Stack spacing={0.75}>
            {excluded.map((x) => (
              <Box
                key={x.id}
                sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'baseline' }}
              >
                <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
                  {x.roleTitle ?? `Assignment ${x.id}`}
                </Typography>
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{x.why}</Typography>
              </Box>
            ))}
          </Stack>
        </Surface>
      )}
    </Box>
  );
}

/**
 * A whole document — preview or stored snapshot, indistinguishable by design.
 *
 * The honesty note is printed once at the top, from the snapshot, for the reason
 * documentService.js states: without it the empty headings below read as a
 * finished statement about the job rather than a gap in the record.
 */
export function DocumentSnapshotView({
  snapshot,
  companySlug,
}: {
  snapshot: DocumentSnapshot;
  companySlug: string;
}) {
  return (
    <Box>
      {snapshot.honestyNote && (
        <Callout label="How to read this" title="Empty sections are shown on purpose">
          {snapshot.honestyNote}
        </Callout>
      )}
      {snapshot.documentType === 'EMPLOYEE_RESPONSIBILITY_PROFILE' ? (
        <ProfileBody snapshot={snapshot} companySlug={companySlug} />
      ) : (
        <RoleJdBody snapshot={snapshot} companySlug={companySlug} />
      )}
    </Box>
  );
}
