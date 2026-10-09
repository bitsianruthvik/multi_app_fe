import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import {
  Callout,
  CapsLabel,
  EmptyState,
  ErrorNotice,
  FacetChip,
  ListSkeleton,
  Mono,
  Surface,
  readPref,
  writePref,
} from '@shared/ui';
import type {
  AccountabilityKind,
  AccountabilityLine,
  DepartmentRollup,
  DepartmentUnit,
} from '../api/orgchart';
import { orgChartApi } from '../api/orgchart';
import { countRows, type ChartModel } from './orgChartLayout';

/**
 * The Departments view — "what is this department accountable for?", which no
 * other screen answers (spec §13).
 *
 * The client's own tool has this as a tab beside the chart. Ours keeps its
 * shape — units down the side, ticked to choose what the body shows, and four
 * lists that can be switched on and off — and drops its salary half, because
 * payroll is out of V1.
 *
 * READ IT THIS WAY. A line is a statement a position in the unit carries, said
 * ONCE per unit however many seats carry it, with the count beside it. The same
 * line can and does appear under several units: content belongs to ROLES, and a
 * role used in eight units puts its duties in all eight. That is the true
 * answer for each of them, so it is shown, and the role is named so the reader
 * can see why.
 *
 * THE NUMBERS COME FROM THE CHART. Positions, seats and filled are counted with
 * `countRows` over the graph this page already holds — the same function the
 * strip above the chart uses — so a unit's "8 seats" here can never disagree
 * with the chart's arithmetic.
 */

const KINDS: { kind: AccountabilityKind; label: string; one: string; many: string }[] = [
  { kind: 'KRA', label: 'KRAs', one: 'KRA', many: 'KRAs' },
  { kind: 'RESPONSIBILITY', label: 'Responsibilities', one: 'responsibility', many: 'responsibilities' },
  { kind: 'KPI', label: 'KPIs', one: 'KPI', many: 'KPIs' },
  { kind: 'QUALIFICATION', label: 'Qualifications', one: 'qualification', many: 'qualifications' },
];

type Show = Record<AccountabilityKind, boolean>;
const ALL_KINDS: Show = { KRA: true, RESPONSIBILITY: true, KPI: true, QUALIFICATION: true };

/** Lines shown per list before "Show all". Past this a unit stops being scannable. */
const PREVIEW = 8;

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;

/** "Slitting · SP Ultraflex 1" — the name, and what tells it from a namesake. */
const unitLabel = (u: Pick<DepartmentUnit, 'name' | 'qualifier'>) =>
  u.qualifier ? `${u.name} · ${u.qualifier}` : u.name;

/** One unit as the body shows it: itself, plus every ticked unit folded into it. */
interface UnitView {
  unit: DepartmentUnit;
  /** Units whose positions are counted here — just `unit`, or `unit` and its ticked sections. */
  members: DepartmentUnit[];
  positionIds: number[];
  byKind: Record<AccountabilityKind, { line: number; positionIds: number[]; exception: boolean }[]>;
  suppressed: DepartmentUnit['suppressed'];
}

export function OrgChartDepartments({
  company,
  asOf,
  onAsOf,
  model,
  onOpenCard,
}: {
  company: string;
  asOf: string;
  onAsOf: (d: string) => void;
  /** The chart's graph, already loaded: titles and seat counts come from it. */
  model: ChartModel;
  onOpenCard: (positionId: number) => void;
}) {
  const key = useCallback((s: string) => `orgchart:${company}:departments:${s}`, [company]);

  const [data, setData] = useState<DepartmentRollup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  // Per viewer, like every other control on this screen.
  const [show, setShow] = useState<Show>(() => ({ ...ALL_KINDS, ...readPref<Partial<Show>>(key('show'), {}) }));
  const [combine, setCombine] = useState<boolean>(() => readPref<boolean>(key('combine'), false));
  const [hideEmpty, setHideEmpty] = useState<boolean>(() => readPref<boolean>(key('hideEmpty'), true));
  /** Ticked unit ids; `null` means every unit, so a unit added later is ticked too. */
  const [sel, setSel] = useState<number[] | null>(() => readPref<number[] | null>(key('sel'), null));
  const [listOpen, setListOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [carriersOf, setCarriersOf] = useState<string | null>(null);

  useEffect(() => writePref(key('show'), show), [key, show]);
  useEffect(() => writePref(key('combine'), combine), [key, combine]);
  useEffect(() => writePref(key('hideEmpty'), hideEmpty), [key, hideEmpty]);
  useEffect(() => writePref(key('sel'), sel), [key, sel]);

  const load = useCallback(() => {
    setLoading(true);
    orgChartApi
      .departments(asOf)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => {
        setData(null);
        setError(e);
      })
      .finally(() => setLoading(false));
  }, [asOf]);

  useEffect(() => {
    load();
  }, [load]);

  /* ── the tree ─────────────────────────────────────────────────────────── */
  const unitById = useMemo(() => new Map((data?.units ?? []).map((u) => [u.id, u])), [data]);

  const descendantsOf = useCallback(
    (u: DepartmentUnit): DepartmentUnit[] => {
      const out: DepartmentUnit[] = [];
      const walk = (x: DepartmentUnit) => {
        for (const id of x.childIds) {
          const c = unitById.get(id);
          if (c) {
            out.push(c);
            walk(c);
          }
        }
      };
      walk(u);
      return out;
    },
    [unitById],
  );

  const selSet = useMemo(() => (sel ? new Set(sel) : null), [sel]);
  const isSel = useCallback((id: number) => !selSet || selSet.has(id), [selSet]);

  /** Ticking a department ticks its sections too, as the client's tool does. */
  const toggleUnit = (u: DepartmentUnit) => {
    if (!data) return;
    const next = new Set(selSet ?? data.units.map((x) => x.id));
    const on = !next.has(u.id);
    for (const x of [u, ...descendantsOf(u)]) {
      if (on) next.add(x.id);
      else next.delete(x.id);
    }
    setSel(data.units.every((x) => next.has(x.id)) ? null : [...next]);
  };

  const kindOf = useCallback((line: number) => data?.lines[line]?.kind, [data]);

  /** A unit's OWN line count in the kinds on show — the number beside it in the list. */
  const ownCount = useCallback(
    (u: DepartmentUnit) => u.lines.filter((l) => show[kindOf(l.line) as AccountabilityKind]).length,
    [show, kindOf],
  );

  /* ── what the body shows ──────────────────────────────────────────────── */
  const views: UnitView[] = useMemo(() => {
    if (!data) return [];
    const hasTickedAncestor = (u: DepartmentUnit) => {
      let p = u.parentId == null ? undefined : unitById.get(u.parentId);
      while (p) {
        if (isSel(p.id)) return true;
        p = p.parentId == null ? undefined : unitById.get(p.parentId);
      }
      return false;
    };
    const out: UnitView[] = [];
    for (const u of data.units) {
      if (!isSel(u.id)) continue;
      // Folding: a ticked unit with a ticked unit above it is counted THERE.
      if (combine && hasTickedAncestor(u)) continue;
      const members = combine ? [u, ...descendantsOf(u).filter((d) => isSel(d.id))] : [u];

      const merged = new Map<number, { line: number; positionIds: number[]; exception: boolean }>();
      for (const m of members) {
        for (const l of m.lines) {
          const e = merged.get(l.line) ?? { line: l.line, positionIds: [], exception: false };
          e.positionIds.push(...l.positionIds);
          if (l.exceptionPositionIds?.length) e.exception = true;
          merged.set(l.line, e);
        }
      }
      const byKind = { KRA: [], RESPONSIBILITY: [], KPI: [], QUALIFICATION: [] } as UnitView['byKind'];
      for (const e of merged.values()) byKind[data.lines[e.line].kind]?.push(e);

      out.push({
        unit: u,
        members,
        positionIds: members.flatMap((m) => m.positionIds),
        byKind,
        suppressed: members.flatMap((m) => m.suppressed ?? []),
      });
    }
    return out;
  }, [data, unitById, isSel, combine, descendantsOf]);

  const shownKinds = KINDS.filter((k) => show[k.kind]);
  /** Kinds nobody has written for ANY role: said once at the top, never as "none" per unit. */
  const unwritten = shownKinds.filter((k) => (data?.totals[k.kind]?.carried ?? 0) === 0);
  const listedKinds = shownKinds.filter((k) => (data?.totals[k.kind]?.carried ?? 0) > 0);

  const isEmptyView = (v: UnitView) => listedKinds.every((k) => v.byKind[k.kind].length === 0);
  const visibleViews = hideEmpty ? views.filter((v) => !isEmptyView(v)) : views;
  const hiddenViews = hideEmpty ? views.filter(isEmptyView) : [];

  /** Where a unit's section is on screen: its own, or the one it is folded into. */
  const sectionFor = (u: DepartmentUnit) =>
    visibleViews.find((v) => v.members.some((m) => m.id === u.id))?.unit.id ?? null;

  const goTo = (unitId: number) => {
    document.getElementById(`dept-unit-${unitId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // The plain title, not the chart's disambiguated one: inside a unit the unit
  // already says where the seat is, and the chart's suffix (the parent's title)
  // reads as 'Incharge - Logistics (Incharge - Logistics)' here. The code
  // beside it tells namesakes apart.
  const titleOf = (id: number) => data?.positions[id]?.title || model.byId.get(id)?.title || `Position ${id}`;
    const codeOf = (id: number) => data?.positions[id]?.code ?? model.byId.get(id)?.positionCode ?? null;

  const tickedCount = sel ? sel.filter((id) => unitById.has(id)).length : (data?.units.length ?? 0);

  /* ── render ───────────────────────────────────────────────────────────── */
  const controls = (
    <Surface
      e={1}
      sx={{ p: 1.5, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, rowGap: 1.25 }}
    >
      <TextField
        size="small"
        type="date"
        label="As at"
        value={asOf}
        onChange={(e) => e.target.value && onAsOf(e.target.value)}
        sx={{ width: 168 }}
        InputLabelProps={{ shrink: true }}
      />
      <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap role="group" aria-label="Lists to show">
        <CapsLabel sx={{ mr: 0.25 }}>Show</CapsLabel>
        {KINDS.map((k) => (
          <FacetChip
            key={k.kind}
            label={k.label}
            active={show[k.kind]}
            // Distinct lines held by at least one position — 0 says "none written yet".
            count={data ? data.totals[k.kind].carried : undefined}
            onClick={() => setShow((s) => ({ ...s, [k.kind]: !s[k.kind] }))}
          />
        ))}
      </Stack>
      <Tooltip
        title="A ticked unit is counted inside the nearest ticked unit above it, so a department reads as itself plus its sections. Untick a section to keep it out. With every unit ticked, the whole organisation reads as one."
        placement="bottom-start"
      >
        <FormControlLabel
          sx={{ mr: 0 }}
          control={<Switch size="small" checked={combine} onChange={(e) => setCombine(e.target.checked)} />}
          label={<Typography sx={{ fontSize: 13, color: 'var(--c-text)' }}>Fold sections into their department</Typography>}
        />
      </Tooltip>
      <FormControlLabel
        sx={{ mr: 0 }}
        control={<Switch size="small" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} />}
        label={<Typography sx={{ fontSize: 13, color: 'var(--c-text)' }}>Hide units with nothing listed</Typography>}
      />
    </Surface>
  );

  if (loading && !data) {
    return (
      <Stack spacing={2}>
        {controls}
        <ListSkeleton rows={8} />
      </Stack>
    );
  }

  if (error && !data) {
    return (
      <Stack spacing={2}>
        {controls}
        <ErrorNotice error={error} onRetry={load} />
      </Stack>
    );
  }

  if (!data) return null;

  if (data.units.length === 0) {
    return (
      <Stack spacing={2}>
        {controls}
        <EmptyState
          title="No departments yet"
          hint="Create departments under Organisation, or import the organisation chart, and what each one is accountable for will appear here."
        />
      </Stack>
    );
  }

  const unitList = (
    <Surface
      e={1}
      component="aside"
      aria-label="Departments and sections"
      sx={{
        p: 1.5,
        alignSelf: 'start',
        position: { lg: 'sticky' },
        top: { lg: 12 },
        maxHeight: { lg: 'calc(100vh - 150px)' },
        overflow: { lg: 'auto' },
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
        <Box
          component="button"
          type="button"
          onClick={() => setListOpen((o) => !o)}
          aria-expanded={listOpen}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            border: 0,
            background: 'none',
            p: 0,
            font: 'inherit',
            color: 'var(--c-text)',
            cursor: { xs: 'pointer', lg: 'default' },
            pointerEvents: { lg: 'none' },
            textAlign: 'left',
            minHeight: 32,
          }}
        >
          <Typography component="h2" sx={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)' }}>
            Departments and sections
          </Typography>
          <ExpandMoreRounded
            fontSize="small"
            sx={{
              display: { lg: 'none' },
              transform: listOpen ? 'rotate(180deg)' : 'none',
              transition: 'transform var(--t-mid) var(--ease)',
              color: 'var(--c-text-2)',
            }}
          />
        </Box>
        <Mono muted tabular>
          {tickedCount}/{data.units.length}
        </Mono>
      </Stack>
      <Box sx={{ display: { xs: listOpen ? 'block' : 'none', lg: 'block' } }}>
        <Stack direction="row" spacing={1} sx={{ mt: 1, mb: 1 }}>
          <Button size="small" onClick={() => setSel(null)} disabled={sel === null}>
            Select all
          </Button>
          <Button size="small" onClick={() => setSel([])} disabled={tickedCount === 0}>
            Clear
          </Button>
        </Stack>
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {data.units.map((u) => {
            const n = ownCount(u);
            const target = isSel(u.id) ? sectionFor(u) : null;
            const label = unitLabel(u);
            return (
              <Box
                component="li"
                key={u.id}
                sx={{ display: 'flex', alignItems: 'center', gap: 0.25, pl: u.depth * 1.75, minHeight: 34 }}
              >
                <Checkbox
                  size="small"
                  checked={isSel(u.id)}
                  onChange={() => toggleUnit(u)}
                  inputProps={{ 'aria-label': `Include ${label}${u.childIds.length ? ' and its sections' : ''}` }}
                  sx={{ p: 0.75 }}
                />
                {target != null ? (
                  <Box
                    component="button"
                    type="button"
                    onClick={() => goTo(target)}
                    title={`${[...u.path.map((p) => p.name), label].join(' › ')} — go to it`}
                    sx={{
                      ...unitNameSx(n),
                      cursor: 'pointer',
                      '&:hover, &:focus-visible': { color: 'var(--c-primary-700)' },
                    }}
                  >
                    <UnitName unit={u} />
                  </Box>
                ) : (
                  <Box component="span" title={[...u.path.map((p) => p.name), label].join(' › ')} sx={unitNameSx(n)}>
                    <UnitName unit={u} />
                  </Box>
                )}
                <Mono muted tabular sx={{ flexShrink: 0, minWidth: 28, textAlign: 'right' }}>
                  {n}
                </Mono>
              </Box>
            );
          })}
        </Box>
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 1.25, lineHeight: 1.5 }}>
          The number is how many lines a unit carries itself, in the lists you are showing. Ticking a
          department ticks its sections.
        </Typography>
      </Box>
    </Surface>
  );

  /* ── one unit ─────────────────────────────────────────────────────────── */
  const renderView = (v: UnitView) => {
    const u = v.unit;
    const headingId = `dept-unit-${u.id}-h`;
    const c = countRows(model, v.positionIds, 'all');
    const carriers = new Set<number>();
    for (const k of listedKinds) for (const e of v.byKind[k.kind]) e.positionIds.forEach((id) => carriers.add(id));
    const singleCarrier = carriers.size === 1 ? [...carriers][0] : null;
    const notWritten = v.positionIds.filter((id) => !carriers.has(id));
    const memberIds = new Set(v.members.map((m) => m.id));

    // Roles behind the lines that are ALSO used outside this unit. Their lines
    // are listed under every unit that uses them, and the reader should know.
    const shared = new Map<number, { title: string; elsewhere: number }>();
    for (const id of carriers) {
      const rid = data.positions[id]?.roleId;
      if (rid == null || shared.has(rid)) continue;
      const role = data.roles[rid];
      const elsewhere = (role?.unitIds ?? []).filter((x) => !memberIds.has(x)).length;
      if (role && elsewhere > 0) shared.set(rid, { title: role.title, elsewhere });
    }

    const heads = u.headPositionIds;
    const folded = v.members.slice(1);
    const groupedNotWritten = groupTitles(notWritten.map(titleOf));

    return (
      <Surface
        key={u.id}
        e={1}
        component="section"
        id={`dept-unit-${u.id}`}
        aria-labelledby={headingId}
        sx={{ p: { xs: 1.75, sm: 2.25 }, scrollMarginTop: 12 }}
      >
        {u.path.length > 0 && (
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mb: 0.25, overflowWrap: 'anywhere' }}>
            {u.path.map((p) => p.name).join(' › ')}
          </Typography>
        )}
        <Stack direction="row" spacing={1} alignItems="baseline" justifyContent="space-between">
          <Typography id={headingId} component="h3" sx={{ fontSize: 17, fontWeight: 600, lineHeight: 1.35, minWidth: 0, color: 'var(--c-text)' }}>
            {u.name}
            {u.qualifier && (
              <Box component="span" sx={{ fontWeight: 400, color: 'var(--c-text-2)', fontSize: 15 }}>
                {' · '}
                {u.qualifierKind === 'context' ? `on ${u.qualifier}` : u.qualifier}
              </Box>
            )}
          </Typography>
          {u.code && (
            <Mono chip sx={{ flexShrink: 0 }}>
              {u.code}
            </Mono>
          )}
        </Stack>

        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mt: 0.5, lineHeight: 1.6 }}>
          {heads.length > 0 && (
            <>
              Starts at{' '}
              {heads.map((id, i) => (
                <Box component="span" key={id}>
                  {i > 0 && ', '}
                  <PositionLink onClick={() => onOpenCard(id)}>{titleOf(id)}</PositionLink>
                  {codeOf(id) && <Mono muted> {codeOf(id)}</Mono>}
                </Box>
              ))}
              {' · '}
            </>
          )}
          {plural(c.positions, 'position', 'positions')} · {plural(c.seats, 'seat', 'seats')} ·{' '}
          {c.filled.toLocaleString('en-IN')} filled
          {folded.length > 0 && (
            <>
              {' · includes '}
              {folded.length <= 4
                ? folded.map((f) => unitLabel(f)).join(', ')
                : `${folded.slice(0, 3).map((f) => unitLabel(f)).join(', ')} and ${folded.length - 3} more`}
            </>
          )}
        </Typography>

        {listedKinds.length > 0 && (
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mt: 0.25, lineHeight: 1.6 }}>
            {carriers.size === 0 ? (
              <>Nothing in these lists is written for any of its positions yet.</>
            ) : singleCarrier != null ? (
              <>
                Everything below is carried by one position,{' '}
                <PositionLink onClick={() => onOpenCard(singleCarrier)}>{titleOf(singleCarrier)}</PositionLink>
                {codeOf(singleCarrier) && <Mono muted> {codeOf(singleCarrier)}</Mono>}
                {` (${plural(countRows(model, [singleCarrier], 'all').seats, 'seat', 'seats')}).`}
              </>
            ) : (
              <>
                Written for {carriers.size} of {plural(v.positionIds.length, 'position', 'positions')}; the
                number beside each line is how many carry it.
              </>
            )}
            {notWritten.length > 0 && carriers.size > 0 && (
              <> Nothing written yet for {groupedNotWritten}.</>
            )}
          </Typography>
        )}

        {shared.size > 0 && (
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mt: 0.5, lineHeight: 1.55 }}>
            Shared {shared.size === 1 ? 'role' : 'roles'}:{' '}
            {[...shared.values()]
              .map((r) => `${r.title} is also used in ${plural(r.elsewhere, 'other unit', 'other units')}`)
              .join('; ')}
            . A role's lines are listed under every unit that uses it.
          </Typography>
        )}

        {listedKinds.map((k) => {
          const entries = v.byKind[k.kind];
          const open = expanded.has(`${u.id}:${k.kind}`);
          const visible = open ? entries : entries.slice(0, PREVIEW);
          return (
            <Box key={k.kind} sx={{ mt: 2 }}>
              <Stack direction="row" spacing={1} alignItems="baseline">
                <CapsLabel component="h4" sx={{ m: 0 }}>
                  {k.label}
                </CapsLabel>
                <Mono muted tabular>
                  {entries.length}
                </Mono>
              </Stack>
              {entries.length === 0 ? (
                <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)', mt: 0.5 }}>
                  None in this unit.
                </Typography>
              ) : (
                <Box component="ul" sx={{ listStyle: 'none', m: 0, mt: 0.5, p: 0 }}>
                  {visible.map((e) => {
                    const line = data.lines[e.line];
                    const lineKey = `${u.id}:${e.line}`;
                    const showCarriers = carriersOf === lineKey;
                    return (
                      <Box
                        component="li"
                        key={e.line}
                        sx={{ py: 0.75, borderTop: '1px solid var(--c-divider)', '&:first-of-type': { borderTop: 0 } }}
                      >
                        <Stack direction="row" spacing={1.5} alignItems="flex-start" justifyContent="space-between">
                          <LineText line={line} />
                          {singleCarrier == null && (
                            <Box
                              component="button"
                              type="button"
                              onClick={() => setCarriersOf(showCarriers ? null : lineKey)}
                              aria-expanded={showCarriers}
                              aria-label={`${plural(e.positionIds.length, 'position carries', 'positions carry')} this — show which`}
                              sx={{
                                flexShrink: 0,
                                border: '1px solid var(--c-border)',
                                borderRadius: 'var(--r-sm)',
                                background: showCarriers ? 'var(--c-primary-50)' : 'var(--c-surface-2)',
                                color: showCarriers ? 'var(--c-primary-700)' : 'var(--c-text-2)',
                                fontFamily: 'var(--font-mono)',
                                fontSize: 11.5,
                                px: 0.75,
                                py: 0.25,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                                mt: 0.25,
                              }}
                            >
                              {plural(e.positionIds.length, 'position', 'positions')}
                            </Box>
                          )}
                        </Stack>
                        {e.exception && (
                          <Typography sx={{ fontSize: 12, color: 'var(--c-warning-800)', mt: 0.25 }}>
                            Set or changed on the position itself, not by its role.
                          </Typography>
                        )}
                        {showCarriers && (
                          <Box sx={{ mt: 0.5, display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                            {e.positionIds.map((id) => (
                              <PositionLink key={id} onClick={() => onOpenCard(id)} chip>
                                {titleOf(id)}
                                {codeOf(id) && <Mono muted> {codeOf(id)}</Mono>}
                              </PositionLink>
                            ))}
                          </Box>
                        )}
                      </Box>
                    );
                  })}
                </Box>
              )}
              {entries.length > PREVIEW && (
                <Button
                  size="small"
                  sx={{ mt: 0.5 }}
                  onClick={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      const k2 = `${u.id}:${k.kind}`;
                      if (next.has(k2)) next.delete(k2);
                      else next.add(k2);
                      return next;
                    })
                  }
                >
                  {open ? 'Show fewer' : `Show all ${plural(entries.length, k.one, k.many)}`}
                </Button>
              )}
            </Box>
          );
        })}

        {v.suppressed.length > 0 && (
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mt: 1.5 }}>
            Suppressed here: {v.suppressed.map((s) => s.name).join('; ')} — the role carries{' '}
            {v.suppressed.length === 1 ? 'it' : 'them'}, a position in this unit has opted out.
          </Typography>
        )}
      </Surface>
    );
  };

  /* ── the body ─────────────────────────────────────────────────────────── */
  const nothingInForce = data.counts.positions === 0;
  let body: ReactNode;
  if (nothingInForce) {
    body = (
      <EmptyState
        title={`No positions in force on ${data.asOf}`}
        hint="Positions and their content are effective-dated, and none is in force on this date. Pick a later date."
      />
    );
  } else if (tickedCount === 0) {
    body = (
      <EmptyState
        title="Tick a unit to see what it is accountable for"
        hint="Departments and sections are on the left. Ticking a department ticks its sections."
        action={<Button onClick={() => setSel(null)}>Select all</Button>}
      />
    );
  } else if (shownKinds.length === 0) {
    body = (
      <EmptyState
        title="No lists switched on"
        hint="Switch on KRAs, Responsibilities, KPIs or Qualifications above to list them."
        action={<Button onClick={() => setShow(ALL_KINDS)}>Show all four</Button>}
      />
    );
  } else {
    body = (
      <Stack spacing={2}>
        {unwritten.length > 0 && (
          <Callout
            title={`No ${joinWords(unwritten.map((k) => k.many))} written for any role yet`}
          >
            {unwritten.length === 1 ? 'That list is' : 'Those lists are'} empty in every unit in the
            organisation, not only the ones below — nobody has written{' '}
            {unwritten.length === 1 ? 'one' : 'any'} yet.
            {unwritten.some((k) => (data.totals[k.kind]?.written ?? 0) > 0) &&
              ' Some are written on roles that no current position holds.'}
          </Callout>
        )}
        {listedKinds.length > 0 && visibleViews.map(renderView)}
        {listedKinds.length > 0 && visibleViews.length === 0 && (
          <EmptyState
            title="Nothing listed for the ticked units"
            hint="None of the ticked units carries anything in the lists you are showing."
            action={<Button onClick={() => setHideEmpty(false)}>Show them anyway</Button>}
          />
        )}
        {hiddenViews.length > 0 && visibleViews.length > 0 && (
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
            {plural(hiddenViews.length, 'unit is', 'units are')} hidden because nothing in these lists is
            written for {hiddenViews.length === 1 ? 'it' : 'them'}:{' '}
            {hiddenViews.map((h) => unitLabel(h.unit)).join(', ')}.{' '}
            <Button size="small" onClick={() => setHideEmpty(false)} sx={{ verticalAlign: 'baseline' }}>
              Show {hiddenViews.length === 1 ? 'it' : 'them'}
            </Button>
          </Typography>
        )}
        {data.exceptions.unresolved.length > 0 && (
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-danger-800)' }}>
            {plural(data.exceptions.unresolved.length, 'position', 'positions')} could not be resolved and
            show their role's lines without their own exceptions:{' '}
            {data.exceptions.unresolved.map((x) => titleOf(x.positionId)).join(', ')}.
          </Typography>
        )}
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      {controls}
      {!!error && <ErrorNotice error={error} onRetry={load} />}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: '300px minmax(0, 1fr)' },
          gap: 2,
          alignItems: 'start',
          opacity: loading ? 0.6 : 1,
          transition: 'opacity var(--t-mid) var(--ease)',
        }}
        aria-busy={loading || undefined}
      >
        {unitList}
        <Box sx={{ minWidth: 0 }}>{body}</Box>
      </Box>
    </Stack>
  );
}

/* ── small parts ────────────────────────────────────────────────────────── */

/** The side list's label: ellipsised on one line, muted when the unit carries nothing shown. */
const unitNameSx = (count: number) => ({
  flex: 1,
  minWidth: 0,
  display: 'block',
  border: 0,
  background: 'none',
  p: 0,
  font: 'inherit',
  textAlign: 'left' as const,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap' as const,
  color: count === 0 ? 'var(--c-text-3)' : 'var(--c-text)',
});

function UnitName({ unit }: { unit: DepartmentUnit }) {
  return (
    <>
      <Box component="span" sx={{ fontSize: 13.5, fontWeight: unit.depth === 0 ? 600 : 400 }}>
        {unit.name}
      </Box>
      {unit.qualifier && (
        <Box component="span" sx={{ color: 'var(--c-text-3)', fontSize: 12 }}>
          {' · '}
          {unit.qualifier}
        </Box>
      )}
    </>
  );
}

/** "Helper 1 ×4, Helper 2 ×4 and Store Supervisor - Scrap" — seats with nothing written, by title. */
function groupTitles(titles: string[]): string {
  const counts = new Map<string, number>();
  for (const t of titles) counts.set(t, (counts.get(t) ?? 0) + 1);
  const parts = [...counts].map(([t, n]) => (n > 1 ? `${t} ×${n}` : t));
  return joinWords(parts);
}

function joinWords(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function LineText({ line }: { line: AccountabilityLine }) {
  return (
    <Box sx={{ minWidth: 0, flex: 1 }}>
      <Typography sx={{ fontSize: 14, lineHeight: 1.5, overflowWrap: 'anywhere', color: 'var(--c-text)' }}>
        {line.name}
        {line.detail && (
          <Box component="span" sx={{ color: 'var(--c-text-2)' }}>
            {' — '}
            {line.detail}
          </Box>
        )}
      </Typography>
      {line.description && (
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', lineHeight: 1.5, mt: 0.25, overflowWrap: 'anywhere' }}>
          {line.description}
        </Typography>
      )}
    </Box>
  );
}

/** A position, as a link to its card. */
function PositionLink({
  onClick,
  children,
  chip = false,
}: {
  onClick: () => void;
  children: ReactNode;
  chip?: boolean;
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        border: chip ? '1px solid var(--c-border)' : 0,
        borderRadius: chip ? 'var(--r-sm)' : 0,
        background: chip ? 'var(--c-surface)' : 'none',
        px: chip ? 1 : 0,
        py: chip ? 0.25 : 0,
        font: 'inherit',
        fontSize: chip ? 12.5 : 'inherit',
        // 700, not 600: 600 does not invert in dark mode and vanishes as text.
        color: 'var(--c-primary-700)',
        cursor: 'pointer',
        textAlign: 'left',
        '&:hover': { textDecoration: 'underline' },
      }}
    >
      {children}
    </Box>
  );
}
