/**
 * The pieces a generated document is made of — the origin marker, the empty
 * section, the suppressed list and the one-item row.
 *
 * These live apart from `DocumentRender.tsx` because they carry the three rules
 * that make a JD on this platform different from a JD in a Word template, and
 * each of them is a rule about what the document must NOT hide:
 *
 *   1. ORIGIN IS VISIBLE. Role content is overlaid by the Position and then by
 *      the Work Assignment (plan §2 rule 6). If the reader cannot see which
 *      layer a line came from, the layering was pointless — "the role does this
 *      everywhere" and "we added this for this one seat" are different facts and
 *      an HR person answers different questions with them.
 *
 *   2. AN EMPTY SECTION SAYS WHY. Karni's 63 roles have no purpose, no KRAs, no
 *      KPIs and no qualifications (plan §17.5). Dropping the heading would make
 *      the document read as though the role genuinely has no requirements, which
 *      is false and worse than an awkward blank. So the heading stays, the
 *      sentence says nothing has been written yet, and where possible it links
 *      to the screen where it would be written.
 *
 *   3. SUPPRESSION IS SHOWN. "The role says X; this position does not do it" is
 *      information, and a document that omits it is indistinguishable from the
 *      role. Quiet, struck through, at the end — present.
 */
import type { ReactNode } from 'react';
import { Box, Stack, Tooltip, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import BlockRounded from '@mui/icons-material/BlockRounded';
import EditNoteRounded from '@mui/icons-material/EditNoteRounded';
import ReportProblemOutlined from '@mui/icons-material/ReportProblemOutlined';
import { CapsLabel, Mono, Surface } from '@shared/ui';
import {
  ORIGIN_HINT,
  ORIGIN_LABEL,
  ORIGIN_SHORT,
  itemHeadline,
  limitText,
  managerScopeText,
  managerTypeLabel,
  pretty,
  targetText,
  type DocumentManagerRow,
  type IgnoredOverride,
  type Origin,
  type ResolvedItem,
  type SuppressedItem,
} from '../api/documents';

// ---------------------------------------------------------------------------
// Origin
// ---------------------------------------------------------------------------

/**
 * The three layers, each with its own colour in both themes. Violet — the
 * platform accent, used sparingly — goes to ASSIGNMENT because a line that
 * exists for exactly one person is the most specific statement the document
 * makes, and the one a reader most needs to spot.
 */
const ORIGIN_STYLE: Record<Origin, { bg: string; fg: string; border: string }> = {
  ROLE: { bg: 'var(--c-surface-2)', fg: 'var(--c-text-2)', border: 'var(--c-border)' },
  POSITION: { bg: 'var(--c-info-50)', fg: 'var(--c-info-800)', border: 'transparent' },
  ASSIGNMENT: { bg: 'var(--c-primary-50)', fg: 'var(--c-primary-700)', border: 'transparent' },
};

export function OriginChip({ origin, overridden }: { origin: Origin; overridden?: boolean }) {
  const s = ORIGIN_STYLE[origin] ?? ORIGIN_STYLE.ROLE;
  const label = overridden ? `${ORIGIN_SHORT[origin]} · changed` : ORIGIN_SHORT[origin];
  const hint = overridden
    ? `${ORIGIN_HINT[origin]} It changes something the role already said.`
    : ORIGIN_HINT[origin];
  return (
    <Tooltip title={hint} placement="top">
      <Box
        component="span"
        aria-label={`${ORIGIN_LABEL[origin]}${overridden ? ', changed from the role' : ''}`}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          flexShrink: 0,
          background: s.bg,
          color: s.fg,
          border: `1px solid ${s.border}`,
          borderRadius: 'var(--r-sm)',
          px: 0.75,
          py: '1px',
          fontFamily: 'var(--font-ui)',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '.02em',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Box>
    </Tooltip>
  );
}

/**
 * The sentence that makes the chips readable — and, for a single-layer document,
 * the sentence that replaces them.
 *
 * `observed` is the layers that actually produced a row; `declared` is the layers
 * that were considered. When only one layer produced anything, chipping every row
 * "Role" would be 27 identical chips on a Karni JD, which teaches people to stop
 * reading chips. So that case says it once in words — and, crucially, names the
 * declared layers that contributed nothing. "This position adds nothing" is a
 * real finding about the seat, not an absence.
 */
export function OriginLegend({
  observed,
  declared,
}: {
  observed: Origin[];
  declared: Origin[];
}) {
  const layered = observed.length > 1;
  const inert = declared.filter((l) => l !== 'ROLE' && !observed.includes(l));
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        flexWrap: 'wrap',
        mb: 2,
        fontSize: 12.5,
        color: 'var(--c-text-2)',
      }}
    >
      {layered ? (
        <>
          <Box component="span">Every line says where it came from:</Box>
          {observed.map((l) => (
            <Stack key={l} direction="row" spacing={0.5} alignItems="center">
              <OriginChip origin={l} />
              <Box component="span" sx={{ fontSize: 12 }}>
                {ORIGIN_LABEL[l].toLowerCase()}
              </Box>
            </Stack>
          ))}
        </>
      ) : (
        <Box component="span">
          Everything below comes from the <strong>role</strong>, so nothing is marked.
          {inert.length > 0 && (
            <>
              {' '}
              The {inert.map((l) => (l === 'POSITION' ? 'position' : 'assignment')).join(' and the ')}{' '}
              {inert.length > 1 ? 'were' : 'was'} resolved too and{' '}
              {inert.length > 1 ? 'add' : 'adds'}, {inert.length > 1 ? 'change' : 'changes'} and{' '}
              {inert.length > 1 ? 'remove' : 'removes'} nothing.
            </>
          )}
        </Box>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Empty sections
// ---------------------------------------------------------------------------

/**
 * Why a heading is here with nothing under it.
 *
 * `note` is the SNAPSHOT'S OWN SENTENCE — the words the DOCX printed, authored in
 * documentService.js so the screen and the file cannot drift. It is preferred
 * whenever it is present, and `what` is only the fallback for a snapshot that
 * carried no descriptor for this section (an older document, or a preview from a
 * backend that has not caught up).
 *
 * `to` links to where it would be written. The distinction this component keeps
 * is between "nobody has written this yet" and "this role genuinely requires
 * none" — the first is a gap in the record and the second is a claim about the
 * job. Only the first is true of Karni today, and every sentence here says so.
 */
export function EmptySectionNote({
  note,
  what,
  to,
  linkLabel,
}: {
  note?: string | null;
  what?: string;
  to?: string;
  linkLabel?: string;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1,
        py: 1.25,
        px: 1.5,
        borderRadius: 'var(--r-sm)',
        border: '1px dashed var(--c-border)',
        background: 'var(--c-surface-2)',
        color: 'var(--c-text-2)',
        fontSize: 13,
        lineHeight: 1.55,
      }}
    >
      <EditNoteRounded aria-hidden sx={{ fontSize: 18, color: 'var(--c-text-3)', mt: '1px' }} />
      <Box>
        {note ?? (
          <>
            No {what ?? 'entries'} have been recorded yet — a gap in the record, not a statement
            that none are required.
          </>
        )}
        {to && (
          <>
            {' '}
            <Box
              component={Link}
              to={to}
              sx={{
                color: 'var(--c-primary-700)',
                textDecoration: 'none',
                fontWeight: 500,
                '&:hover': { textDecoration: 'underline' },
              }}
            >
              {linkLabel ?? 'Write them'}
            </Box>
            .
          </>
        )}
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Suppressed
// ---------------------------------------------------------------------------

/**
 * What the role says and this position or person does not do.
 *
 * Quiet on purpose — struck through on a neutral surface at the foot of the
 * document, not an alert. It is a design decision somebody took, recorded so the
 * next reader can see it was taken.
 */
export function SuppressedList({
  items,
  heading,
}: {
  items: SuppressedItem[];
  /** The snapshot's own heading for this section, when it carried one. */
  heading?: string;
}) {
  if (items.length === 0) return null;
  return (
    <Surface
      e={0}
      sx={{
        mt: 2,
        p: 2,
        background: 'var(--c-surface-2)',
        border: '1px solid var(--c-border)',
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <BlockRounded aria-hidden sx={{ fontSize: 16, color: 'var(--c-text-3)' }} />
        <CapsLabel sx={{ color: 'var(--c-text-2)' }}>
          {heading ??
            `Removed for this ${items.some((i) => i.byLayer === 'ASSIGNMENT') ? 'person' : 'position'}`}{' '}
          · {items.length}
        </CapsLabel>
      </Stack>
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 1.25, lineHeight: 1.55 }}>
        The role says these; this one does not do them. Kept visible because a document that hides a
        removal reads exactly like the role.
      </Typography>
      <Stack spacing={0.75}>
        {items.map((s, i) => (
          <Box
            key={`${s.kind}:${s.definitionId ?? s.name}:${i}`}
            sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}
          >
            <Box
              component="span"
              sx={{
                fontSize: 13.5,
                color: 'var(--c-text-3)',
                textDecoration: 'line-through',
                textDecorationColor: 'var(--c-text-3)',
              }}
            >
              {s.name}
            </Box>
            <Mono chip sx={{ fontSize: 10.5 }}>
              {pretty(s.kind)}
            </Mono>
            {s.code && (
              <Box component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                {s.code}
              </Box>
            )}
            <Box component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
              removed by the {s.byLayer === 'ASSIGNMENT' ? 'assignment' : 'position'}
              {s.reason ? ` — ${s.reason}` : ''}
            </Box>
            {/* A suppressed KRA orphans its children. They move to "Additional"
                rather than vanishing with their heading, and saying how many is
                how a reader knows to look for them there. */}
            {!!s.movedChildren && (
              <Box component="span" sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
                {s.movedChildren} item{s.movedChildren === 1 ? '' : 's'} under it moved to Additional
              </Box>
            )}
          </Box>
        ))}
      </Stack>
    </Surface>
  );
}

/**
 * Overlay rows that changed nothing, and why.
 *
 * An exception somebody wrote that silently does nothing is the worst kind: the
 * seat looks configured and behaves like the role. The resolver reports these
 * rather than swallowing them, so the screen shows them — quietly, because they
 * are not an error in the document, they are a mistake in the overlay.
 */
export function IgnoredOverrides({ items }: { items: IgnoredOverride[] }) {
  if (items.length === 0) return null;
  return (
    <Surface
      e={0}
      sx={{
        mt: 2,
        p: 2,
        background: 'var(--c-surface-2)',
        border: '1px solid var(--c-border)',
        borderLeft: '3px solid var(--c-warning-600)',
        borderTopLeftRadius: 0,
        borderBottomLeftRadius: 0,
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <ReportProblemOutlined aria-hidden sx={{ fontSize: 16, color: 'var(--c-warning-600)' }} />
        <CapsLabel sx={{ color: 'var(--c-text-2)' }}>
          Exceptions that changed nothing · {items.length}
        </CapsLabel>
      </Stack>
      <Stack spacing={0.75}>
        {items.map((g, i) => (
          <Box key={g.overrideId ?? i}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <Mono chip sx={{ fontSize: 10.5 }}>
                {pretty(g.action)}
              </Mono>
              <Typography sx={{ fontSize: 13, color: 'var(--c-text)' }}>
                {g.name ?? `${pretty(g.contentType ?? '')} ${g.definitionId ?? ''}`.trim()}
              </Typography>
              <Box component="span" sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
                on the {g.layer === 'ASSIGNMENT' ? 'assignment' : 'position'}
              </Box>
            </Box>
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mt: 0.25 }}>{g.why}</Typography>
          </Box>
        ))}
      </Stack>
    </Surface>
  );
}

// ---------------------------------------------------------------------------
// One row of content
// ---------------------------------------------------------------------------

/**
 * The per-kind secondary line. A KPI without its target, a skill without its
 * level or an authority without its limit is a line of text that says nothing a
 * reader can act on, so each kind contributes what it actually has.
 *
 * The SERVER'S OWN `text` wins when it is there: it is what the DOCX prints, and
 * two renderings of one row eventually disagree. This composition is the
 * fallback for a snapshot written before `text` existed.
 */
function detailLine(item: ResolvedItem): string | null {
  if (item.text) return item.text;
  const bits = [
    item.responsibilityClass ? pretty(item.responsibilityClass) : null,
    targetText(item),
    item.frequency ? pretty(item.frequency) : null,
    item.direction ? pretty(item.direction) : null,
    item.proficiencyLevel ? pretty(item.proficiencyLevel) : null,
    item.requirementLevel ? pretty(item.requirementLevel) : null,
    item.skillType ? pretty(item.skillType) : null,
    item.qualificationType ? pretty(item.qualificationType) : null,
    item.authorityType ? pretty(item.authorityType) : null,
    limitText(item.limit ?? item.limitJson),
    item.relationshipScope ? pretty(item.relationshipScope) : null,
    item.purpose,
    item.conditionType ? pretty(item.conditionType) : null,
    item.experienceArea,
  ].filter(Boolean) as string[];
  return bits.length ? bits.join(' · ') : null;
}

/**
 * One resolved line of the document.
 *
 * `showOrigin` is false on a single-layer document, where `OriginLegend` has
 * already said in one sentence that every line is the role's — see the note
 * there. It is never false when an overlay is in play.
 */
export function ItemLine({
  item,
  showOrigin,
  weight,
  index,
}: {
  item: ResolvedItem;
  showOrigin: boolean;
  /** Renders the KRA/KPI weight when the model carries one. */
  weight?: boolean;
  index?: number;
}) {
  /**
   * Three lines, and none of them repeats another.
   *
   * A responsibility's master carries the same sentence as its name, and the
   * resolver's `text` for one is that sentence again — so a naive render prints
   * each duty three times. Every line here is therefore rendered only if it says
   * something the lines above it did not.
   */
  const headline = itemHeadline(item);
  const description = item.description && item.description !== headline ? item.description : null;
  const raw = detailLine(item);
  const detail = raw && raw !== headline && raw !== description ? raw : null;
  return (
    <Box
      component="li"
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1,
        py: 0.6,
        listStyle: 'none',
        borderBottom: '1px solid var(--c-divider)',
        '&:last-of-type': { borderBottom: 'none' },
      }}
    >
      {index !== undefined && (
        <Mono
          muted
          tabular
          sx={{ fontSize: 11.5, minWidth: 22, textAlign: 'right', pt: '3px', flexShrink: 0 }}
        >
          {index}.
        </Mono>
      )}
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
          <Typography
            sx={{ fontSize: 13.5, color: 'var(--c-text)', lineHeight: 1.5, overflowWrap: 'anywhere' }}
          >
            {headline}
          </Typography>
          {showOrigin && <OriginChip origin={item.origin} overridden={item.overridden} />}
          {weight && item.weightPercent != null && (
            <Mono chip tabular sx={{ fontSize: 10.5 }}>
              {item.weightPercent}%
            </Mono>
          )}
          {item.isMandatory === false && (
            <Box component="span" sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
              advisory
            </Box>
          )}
        </Box>
        {description && (
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', lineHeight: 1.55, mt: 0.25 }}>
            {description}
          </Typography>
        )}
        {detail && (
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 0.25 }}>{detail}</Typography>
        )}
        {item.notes && (
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 0.25, fontStyle: 'italic' }}>
            {item.notes}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

/** A plain list of resolved rows, or the reason there are none. */
export function ItemLines({
  items,
  showOrigin,
  numbered,
  weight,
  empty,
}: {
  items: ResolvedItem[];
  showOrigin: boolean;
  numbered?: boolean;
  weight?: boolean;
  empty: ReactNode;
}) {
  if (items.length === 0) return <>{empty}</>;
  return (
    <Box component="ul" sx={{ m: 0, p: 0 }}>
      {items.map((it, i) => (
        <ItemLine
          key={it.key ?? `${it.definitionId ?? it.name}:${i}`}
          item={it}
          showOrigin={showOrigin}
          weight={weight}
          index={numbered ? i + 1 : undefined}
        />
      ))}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Managers
// ---------------------------------------------------------------------------

/**
 * Every manager of one assignment, each with the scope of their authority.
 *
 * NEVER FLATTENED TO ONE (plan §2 rule 9). A person can have a line manager, a
 * functional manager and a dotted line at the same time, and a profile that
 * prints only the first is the exact mistake the model was built to prevent —
 * `employee.manager_id` does not exist precisely so this cannot be done by
 * accident. A vacant line is still printed, because the reporting line stands
 * even when nobody holds the seat.
 */
export function ManagerLines({
  managers,
  companySlug,
  emptyNote,
}: {
  managers: DocumentManagerRow[];
  companySlug: string;
  /** The snapshot's own sentence for "no manager recorded". */
  emptyNote?: string | null;
}) {
  if (managers.length === 0) {
    return (
      <EmptySectionNote
        note={emptyNote}
        what="managers for this work — neither a formal line on the position nor an actual one on the assignment"
      />
    );
  }
  return (
    <Stack spacing={1}>
      {managers.map((m, i) => {
        const scope = managerScopeText(m);
        const name = m.manager?.name ?? null;
        return (
          <Box
            key={m.key ?? `${i}`}
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1,
              flexWrap: 'wrap',
              py: 0.5,
              borderBottom: '1px solid var(--c-divider)',
              '&:last-of-type': { borderBottom: 'none' },
            }}
          >
            <Box sx={{ minWidth: 132, flexShrink: 0 }}>
              <CapsLabel sx={{ color: 'var(--c-text-3)' }}>{managerTypeLabel(m)}</CapsLabel>
              {m.isPrimary && (
                <Box component="span" sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>
                  primary for this line
                </Box>
              )}
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
                {name ? (
                  m.manager?.employeeId ? (
                    <Box
                      component={Link}
                      to={`/${companySlug}/cf_hrms/employees/${m.manager.employeeId}`}
                      sx={{
                        fontSize: 13.5,
                        fontWeight: 500,
                        color: 'var(--c-text)',
                        textDecoration: 'none',
                        '&:hover': { color: 'var(--c-primary-700)' },
                      }}
                    >
                      {name}
                    </Box>
                  ) : (
                    <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>{name}</Typography>
                  )
                ) : (
                  <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>
                    {m.managerPosition?.title ?? m.managerPosition?.code ?? 'That seat'} is vacant —
                    the line stands, nobody currently holds it.
                  </Typography>
                )}
                {m.manager?.roleTitle && (
                  <Box component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                    {m.manager.roleTitle}
                  </Box>
                )}
                {m.origin && <OriginChip origin={m.origin} />}
              </Box>
              {/* The scope is the whole reason a second manager is not a second
                  job: authority over PART of the work is a property of the
                  relationship, so it is printed with it. */}
              {scope && (
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mt: 0.25 }}>
                  {scope}
                </Typography>
              )}
              {m.manager?.workAssignmentTitle && (
                <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mt: 0.25 }}>
                  as their {m.manager.workAssignmentTitle}
                </Typography>
              )}
              {m.note && (
                <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mt: 0.25 }}>
                  {m.note}
                </Typography>
              )}
            </Box>
          </Box>
        );
      })}
    </Stack>
  );
}
