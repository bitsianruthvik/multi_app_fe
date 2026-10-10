/**
 * Copying content between roles and positions — the one panel behind every "Copy
 * content…" in HRMS.
 *
 * WHY THIS IS NOT A PASTE BUTTON. The client's own org-chart tool copies KRAs,
 * KPIs and qualifications between POSITIONS, because there a position owns its
 * lists. Here content belongs to a ROLE, and a role is shared: "Helper 1" is one
 * role across ten positions. So "copy these duties to that position" can mean three
 * different acts, and the difference between them is how many people's job
 * descriptions change. The panel makes the person choose, in words, with the
 * number next to each choice:
 *
 *   This position only        an overlay on that one position. Changes 1 position. THE DEFAULT.
 *   Add to the role       new rows on the role itself. Changes EVERY position holding it.
 *   Its own role          a new role cloned from the position's, the lines added, the
 *                         position moved onto it. Changes 1 position; costs one more role.
 *
 * and it never lets the biggest of them be a bare button: the confirm step
 * states the position count, and the server refuses a role-wide write unless the
 * number it is sent is the number it finds (STALE_COUNT).
 *
 * Three things it deliberately does NOT do quietly:
 *   - Qualifications and skills have no position-level layer. Ticking one turns the
 *     "this position only" card off and says why, instead of dropping it from the copy.
 *   - A position that suppresses a duty keeps suppressing it; that line comes back as
 *     "not added" with the reason, in the review, before anything is written.
 *   - A line the target already has (by definition, or by the same words once
 *     normalised) is "already there": left alone, never doubled, and no new
 *     definition is ever created — the masters do not grow from a copy.
 *
 * The review is the server's own plan (POST /role-content-copy/preview), the
 * same function the write runs, so what this panel shows is what is written.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Autocomplete, Box, Button, Checkbox, CircularProgress, FormControlLabel, Radio, RadioGroup,
  Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import CheckBoxOutlineBlankRounded from '@mui/icons-material/CheckBoxOutlineBlankRounded';
import CheckBoxRounded from '@mui/icons-material/CheckBoxRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import {
  SideSheet, ConfirmDialog, ErrorNotice, Callout, StatusBadge, ToneBadge, Mono, CapsLabel, Surface, FacetChip,
  useToast, useIsPermitted, useCompanySlug,
} from '@shared/ui';
import {
  getCopySource, previewCopy, runCopy, listRoles,
  type ContentKind, type CopyLine, type CopyMode, type CopyPlan, type CopyRef, type CopyRequest, type CopySource, type Role,
} from '../api/roles';
import { positionsApi, type PositionRow } from '../api/positions';

/* ══════════════════════════════════════════════════════════════════════════
 * Public contract
 * ══════════════════════════════════════════════════════════════════════════ */

export interface ContentCopyStart {
  /** Copy FROM this role or position. Leave out to let the person choose. */
  from?: CopyRef | null;
  /** Copy TO these. Leave out to let the person choose. */
  to?: CopyRef[];
  /** Which picker the targets start in. A tick-list of roles starts on 'role'. */
  toType?: 'role' | 'position';
}

const KIND: Record<ContentKind, { one: string; many: string; overlay: boolean }> = {
  kras: { one: 'KRA', many: 'KRAs', overlay: true },
  responsibilities: { one: 'responsibility', many: 'Responsibilities', overlay: true },
  kpis: { one: 'KPI', many: 'KPIs', overlay: true },
  qualifications: { one: 'qualification', many: 'Qualifications', overlay: false },
  skills: { one: 'skill', many: 'Skills', overlay: false },
  authorities: { one: 'authority', many: 'Authorities', overlay: false },
  experience: { one: 'experience requirement', many: 'Experience', overlay: false },
  relationships: { one: 'relationship', many: 'Relationships', overlay: false },
  conditions: { one: 'working condition', many: 'Working conditions', overlay: false },
};
const KIND_ORDER: ContentKind[] = ['kras', 'responsibilities', 'kpis', 'qualifications', 'skills', 'authorities', 'experience', 'relationships', 'conditions'];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const SEAT_PERM = 'cf_hrms_org_manage';
const ROLE_PERM = 'cf_hrms_roles_manage';

interface Opt {
  type: 'role' | 'position';
  id: number;
  label: string;
  sub: string;
  group: string;
  roleId: number;
}

const roleOpt = (r: Role): Opt => ({
  type: 'role', id: r.id, roleId: r.id, group: 'Roles',
  label: r.title,
  sub: [r.roleCode, plural(r.positionCount, 'position'), r.status === 'RETIRED' ? 'retired' : null].filter(Boolean).join(' · '),
});
const seatOpt = (p: PositionRow): Opt => ({
  type: 'position', id: p.id, roleId: p.roleId, group: p.roleTitle ?? 'Positions',
  label: `${p.displayTitle}${p.positionCode ? ` (${p.positionCode})` : ''}`,
  sub: [p.roleTitle !== p.displayTitle ? p.roleTitle : null, p.departmentName, p.filledCount ? plural(p.filledCount, 'person', 'people') : 'vacant', p.status === 'CLOSED' ? 'closed' : null]
    .filter(Boolean).join(' · '),
});

/* ══════════════════════════════════════════════════════════════════════════
 * The sheet
 * ══════════════════════════════════════════════════════════════════════════ */

export function ContentCopySheet({
  open,
  start,
  onClose,
  onDone,
}: {
  open: boolean;
  start: ContentCopyStart | null;
  onClose: () => void;
  /** Called once a copy has been written, so the page can reload what it shows. */
  onDone?: (plan: CopyPlan) => void;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const company = useCompanySlug();
  const can = useIsPermitted();
  const mayOrg = can(SEAT_PERM);
  const mayRoles = can(ROLE_PERM);

  // ── what the pickers are made from ──────────────────────────────────────
  const [roles, setRoles] = useState<Role[]>([]);
  const [positions, setSeats] = useState<PositionRow[]>([]);
  const [catalogError, setCatalogError] = useState<unknown>(null);

  // ── the person's choices ────────────────────────────────────────────────
  const [source, setSource] = useState<CopyRef | null>(null);
  const [src, setSrc] = useState<CopySource | null>(null);
  const [srcLoading, setSrcLoading] = useState(false);
  const [srcError, setSrcError] = useState<unknown>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [toType, setToType] = useState<'role' | 'position'>('position');
  const [targets, setTargets] = useState<CopyRef[]>([]);
  const [mode, setMode] = useState<CopyMode | null>(null);
  const [forkTitle, setForkTitle] = useState('');
  const [appliesFrom, setAppliesFrom] = useState('');

  // ── the server's plan, and what came of it ──────────────────────────────
  const [plan, setPlan] = useState<CopyPlan | null>(null);
  const [planError, setPlanError] = useState<unknown>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<CopyPlan | null>(null);
  const [showAllExceptions, setShowAllExceptions] = useState(false);
  const planTicket = useRef(0);

  // ── (re)start whenever the sheet is opened ──────────────────────────────
  useEffect(() => {
    if (!open) return;
    setSource(start?.from ?? null);
    setSrc(null);
    setSrcError(null);
    setPicked(new Set());
    setFilter('');
    setToType(start?.toType ?? (start?.to?.[0]?.type ?? 'position'));
    setTargets(start?.to ?? []);
    setMode(null);
    setForkTitle('');
    setAppliesFrom('');
    setPlan(null);
    setPlanError(null);
    setResult(null);
    setShowAllExceptions(false);
    setCatalogError(null);
    let live = true;
    Promise.all([listRoles(), positionsApi.list()])
      .then(([r, p]) => {
        if (!live) return;
        setRoles(r.items);
        setSeats(p.items);
      })
      .catch((e) => live && setCatalogError(e));
    return () => {
      live = false;
    };
  }, [open, start]);

  // ── read the source whenever it changes ─────────────────────────────────
  useEffect(() => {
    if (!open || !source) {
      setSrc(null);
      return;
    }
    let live = true;
    setSrcLoading(true);
    setSrcError(null);
    setPicked(new Set());
    getCopySource(source)
      .then((s) => live && setSrc(s))
      .catch((e) => live && (setSrc(null), setSrcError(e)))
      .finally(() => live && setSrcLoading(false));
    return () => {
      live = false;
    };
  }, [open, source]);

  const lines = useMemo<CopyLine[]>(() => src?.lines ?? [], [src]);
  const sourceRoleId = src?.source.roleId ?? null;

  // ── the options ─────────────────────────────────────────────────────────
  const roleOptions = useMemo(() => roles.map(roleOpt), [roles]);
  const seatOptions = useMemo(() => positions.map(seatOpt), [positions]);
  const sourceOptions = useMemo(() => [...roleOptions, ...seatOptions.map((o) => ({ ...o, group: 'Positions' }))], [roleOptions, seatOptions]);
  const targetOptions = toType === 'role' ? roleOptions : seatOptions;
  const optionOf = useCallback(
    (ref: CopyRef | null) => (ref ? (ref.type === 'role' ? roleOptions : seatOptions).find((o) => o.id === ref.id) ?? null : null),
    [roleOptions, seatOptions],
  );

  /** A target that shares the source's role would be refused: leave it out, and say so. */
  const sharesSourceRole = useCallback(
    (ref: CopyRef) => sourceRoleId !== null && optionOf(ref)?.roleId === sourceRoleId,
    [sourceRoleId, optionOf],
  );
  const usableTargets = useMemo(() => targets.filter((t) => !sharesSourceRole(t)), [targets, sharesSourceRole]);
  const droppedTargets = targets.length - usableTargets.length;

  // ── what is ticked ──────────────────────────────────────────────────────
  const chosen = useMemo(() => lines.filter((l) => picked.has(l.key)), [lines, picked]);
  const kinds = useMemo(() => KIND_ORDER.filter((k) => chosen.some((l) => l.kind === k)), [chosen]);
  const offSeat = useMemo(() => kinds.filter((k) => !KIND[k].overlay), [kinds]);

  const seatTargets = useMemo(() => (toType === 'position' ? usableTargets : []), [toType, usableTargets]);
  const roleTargets = useMemo(() => (toType === 'role' ? usableTargets : []), [toType, usableTargets]);

  // What each way of copying would reach — from the lists already on screen, the
  // same figures the server counts (positions per role), shown before anyone chooses.
  const reach = useMemo(() => {
    const roleIds = toType === 'role'
      ? roleTargets.map((t) => t.id)
      : [...new Set(seatTargets.map((t) => optionOf(t)?.roleId).filter((x): x is number => x != null))];
    const rolesSeats = roleIds.reduce((n, id) => n + (roles.find((r) => r.id === id)?.positionCount ?? 0), 0);
    return { roleIds, roleSeats: rolesSeats, seatCount: seatTargets.length };
  }, [toType, roleTargets, seatTargets, optionOf, roles]);

  // ── which ways of copying are open to this person, for this selection ───
  const why = useMemo(() => {
    const seatOnly = toType !== 'position' ? 'Needs positions to copy to.'
      : !mayOrg ? 'Needs permission to manage the organisation.'
        : offSeat.length ? `${offSeat.map((k) => KIND[k].many).join(' and ')} can't be added to a single position — only KRAs, responsibilities and KPIs have a layer below the role. Untick them, or choose another way.`
          : null;
    const role = !mayRoles ? 'Needs permission to manage roles.' : null;
    const fork = toType !== 'position' ? 'Needs positions to copy to.' : !(mayOrg && mayRoles) ? 'Needs permission to manage both roles and the organisation.' : null;
    return { SEAT: seatOnly, ROLE: role, FORK: fork } as Record<CopyMode, string | null>;
  }, [toType, mayOrg, mayRoles, offSeat]);

  // The safe way is the default. If it is not open, the person has to choose.
  useEffect(() => {
    if (toType === 'role') {
      if (mode !== 'ROLE') setMode('ROLE');
      return;
    }
    if (mode && !why[mode]) return;
    setMode(!why.SEAT ? 'SEAT' : null);
  }, [toType, why, mode]);

  // ── the request, and the preview it earns ───────────────────────────────
  const request = useMemo<CopyRequest | null>(() => {
    if (!source || !mode || !chosen.length || !usableTargets.length || why[mode]) return null;
    return {
      source,
      targets: usableTargets,
      mode,
      kinds,
      lines: chosen.map((l) => l.key),
      effectiveFrom: appliesFrom || null,
      forkTitle: mode === 'FORK' && usableTargets.length === 1 && forkTitle.trim() ? forkTitle.trim() : null,
    };
  }, [source, mode, chosen, usableTargets, kinds, appliesFrom, forkTitle, why]);
  const requestKey = request ? JSON.stringify(request) : '';

  useEffect(() => {
    const ticket = ++planTicket.current;
    if (!open || !request) {
      setPlan(null);
      setPlanError(null);
      setPlanLoading(false);
      return;
    }
    setPlanLoading(true);
    const timer = setTimeout(() => {
      previewCopy(request)
        .then((p) => {
          if (ticket !== planTicket.current) return;
          setPlan(p);
          setPlanError(null);
        })
        .catch((e) => {
          if (ticket !== planTicket.current) return;
          setPlan(null);
          setPlanError(e);
        })
        .finally(() => ticket === planTicket.current && setPlanLoading(false));
    }, 300);
    return () => clearTimeout(timer);
    // The key stands in for `request`, which is rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, requestKey]);

  // ── choosing lines ──────────────────────────────────────────────────────
  const toggleLine = (key: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const copyable = (l: CopyLine) => !l.inactive;
  const ofKind = (k: ContentKind) => lines.filter((l) => l.kind === k && copyable(l));
  const kindFullyPicked = (k: ContentKind) => ofKind(k).length > 0 && ofKind(k).every((l) => picked.has(l.key));
  const toggleKind = (k: ContentKind) =>
    setPicked((prev) => {
      const next = new Set(prev);
      const all = kindFullyPicked(k);
      for (const l of ofKind(k)) {
        if (all) next.delete(l.key);
        else next.add(l.key);
      }
      return next;
    });
  const pickAll = () => setPicked(new Set(lines.filter(copyable).map((l) => l.key)));

  const needle = filter.trim().toLowerCase();
  const visible = (l: CopyLine) => !needle || `${l.name} ${l.description ?? ''} ${l.groupName ?? ''}`.toLowerCase().includes(needle);

  // ── words ───────────────────────────────────────────────────────────────
  const targetNames = plan?.targets.map((t) => t.label) ?? [];
  const sentences = plan ? describe(plan, targetNames) : null;

  async function confirm() {
    if (!request || !plan) return;
    const done = await runCopy({ ...request, confirm: { seats: plan.confirmSeats } });
    setResult(done);
    onDone?.(done);
    toast.success(done.totals.created ? `Added ${plural(done.totals.created, 'line')}.` : 'Nothing needed adding — it was all there.');
  }

  /* ════════════════════════════════════════════════════════════════════════
   * Render
   * ═════════════════════════════════════════════════════════════════════ */

  const modeCards: { value: CopyMode; title: string; body: string; number: string; wide: boolean }[] = [
    {
      value: 'SEAT',
      title: reach.seatCount > 1 ? 'These positions only' : 'This position only',
      body: "Adds the lines as the position's own extra duties. The role, and every other position that holds it, stays exactly as it is.",
      number: `Changes ${plural(reach.seatCount, 'position')}`,
      wide: false,
    },
    {
      value: 'ROLE',
      title: reach.roleIds.length === 1
        ? `Add to the role “${roles.find((r) => r.id === reach.roleIds[0])?.title ?? ''}”`
        : `Add to ${plural(reach.roleIds.length, 'role')}`,
      body: 'Changes the role itself, so every position that holds it gets these lines in its job description and its people in their profile.',
      number: `Changes ${plural(reach.roleSeats, 'position')}${reach.roleSeats === 0 ? ' — nobody holds it yet' : ''}`,
      wide: reach.roleSeats > 1,
    },
    {
      value: 'FORK',
      title: reach.seatCount > 1 ? 'Give each position its own role' : 'Give this position its own role',
      body: "Creates a new role that starts as a copy of the position's current one, adds the lines, and moves the position onto it. The old role and its other positions don't change. Heavier: it is one more role to keep up to date.",
      number: `Creates ${plural(reach.seatCount, 'role')} · changes ${plural(reach.seatCount, 'position')}`,
      wide: false,
    },
  ];

  const body: ReactNode = result ? (
    <Done result={result} company={company} go={(to) => { onClose(); navigate(to); }} />
  ) : (
    <Stack spacing={3}>
      {catalogError ? <ErrorNotice error={catalogError} fallback="The roles and positions could not be loaded." /> : null}

      {/* 1 ── FROM ─────────────────────────────────────────────────────── */}
      <Section n={1} title="Copy from">
        <Autocomplete
          size="small"
          options={sourceOptions}
          value={source ? sourceOptions.find((o) => o.type === source.type && o.id === source.id) ?? null : null}
          onChange={(_, v) => setSource(v ? { type: v.type, id: v.id } : null)}
          groupBy={(o) => o.group}
          getOptionLabel={(o) => o.label}
          isOptionEqualToValue={(a, b) => a.type === b.type && a.id === b.id}
          renderOption={(props, o) => <OptionRow {...props} key={`${o.type}:${o.id}`} o={o} />}
          renderInput={(p) => <TextField {...p} label="A role or a position" placeholder="Search…" />}
        />
        {src && (
          <Box sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
            {src.source.type === 'role'
              ? `Role · held by ${plural(src.source.seats, 'position')}`
              : `Position · it carries what its role “${src.source.roleTitle}” says, plus its own exceptions`}
            {' · '}in force on {src.asOf}
          </Box>
        )}
        {srcError ? <ErrorNotice error={srcError} fallback="That could not be read." /> : null}
      </Section>

      {/* 2 ── WHAT ─────────────────────────────────────────────────────── */}
      <Section
        n={2}
        title="What to copy"
        aside={src ? <Mono muted>{chosen.length} of {lines.filter(copyable).length} chosen</Mono> : null}
      >
        {!source ? (
          <Hint>Choose where to copy from first.</Hint>
        ) : srcLoading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'var(--c-text-3)', fontSize: 13 }}>
            <CircularProgress size={14} /> Reading what it carries…
          </Box>
        ) : !lines.length ? (
          <Hint>This {src?.source.type === 'role' ? 'role' : 'position'} carries nothing yet, so there is nothing to copy.</Hint>
        ) : (
          <>
            <Stack direction="row" flexWrap="wrap" sx={{ gap: 0.75 }}>
              <FacetChip label="Everything" active={chosen.length > 0 && chosen.length === lines.filter(copyable).length} onClick={pickAll} />
              {KIND_ORDER.filter((k) => ofKind(k).length).map((k) => (
                <FacetChip key={k} label={KIND[k].many} count={ofKind(k).length} active={kindFullyPicked(k)} onClick={() => toggleKind(k)} />
              ))}
              <FacetChip label="None" active={false} onClick={() => setPicked(new Set())} />
            </Stack>
            {lines.length > 12 && (
              <TextField size="small" placeholder="Filter these lines…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            )}
            <Stack spacing={1.5}>
              {KIND_ORDER.filter((k) => lines.some((l) => l.kind === k)).map((k) => {
                const rows = lines.filter((l) => l.kind === k && visible(l));
                if (!rows.length) return null;
                return (
                  <Box key={k}>
                    <CapsLabel sx={{ mb: 0.5 }}>
                      {KIND[k].many} · {lines.filter((l) => l.kind === k).length}
                      {!KIND[k].overlay && <Box component="span" sx={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}> — role level only</Box>}
                    </CapsLabel>
                    <Surface e={0} sx={{ maxHeight: 232, overflowY: 'auto', py: 0.25 }}>
                      {rows.map((l) => (
                        <LineRow key={l.key} line={l} on={picked.has(l.key)} toggle={() => toggleLine(l.key)} />
                      ))}
                    </Surface>
                  </Box>
                );
              })}
            </Stack>
          </>
        )}
      </Section>

      {/* 3 ── WHERE ────────────────────────────────────────────────────── */}
      <Section n={3} title="Copy to">
        <ToggleButtonGroup
          exclusive
          size="small"
          value={toType}
          onChange={(_, v: 'role' | 'position' | null) => {
            if (!v || v === toType) return;
            setToType(v);
            setTargets([]);
            // Back to the default for the new kind of target: the safe way is
            // never left behind by an earlier detour through the wide one.
            setMode(null);
          }}
          aria-label="What to copy to"
        >
          <ToggleButton value="position">Positions</ToggleButton>
          <ToggleButton value="role">Roles</ToggleButton>
        </ToggleButtonGroup>

        <Autocomplete
          multiple
          disableCloseOnSelect
          size="small"
          limitTags={3}
          options={targetOptions}
          value={targetOptions.filter((o) => targets.some((t) => t.type === o.type && t.id === o.id))}
          onChange={(_, v) => setTargets(v.map((o) => ({ type: o.type, id: o.id })))}
          groupBy={(o) => o.group}
          getOptionLabel={(o) => o.label}
          isOptionEqualToValue={(a, b) => a.type === b.type && a.id === b.id}
          getOptionDisabled={(o) => sharesSourceRole({ type: o.type, id: o.id })}
          renderOption={(props, o, { selected }) => (
            <OptionRow
              {...props}
              key={`${o.type}:${o.id}`}
              o={o}
              selected={selected}
              note={sharesSourceRole({ type: o.type, id: o.id }) ? 'same role as the source' : undefined}
            />
          )}
          renderInput={(p) => (
            <TextField {...p} label={toType === 'role' ? 'Roles' : 'Positions'} placeholder={targets.length ? '' : 'Search…'} />
          )}
        />
        {toType === 'position' && (
          <Autocomplete
            size="small"
            options={roleOptions.filter((r) => r.roleId !== sourceRoleId)}
            value={null}
            blurOnSelect
            clearOnBlur
            onChange={(_, role) => {
              if (!role) return;
              const ids = positions.filter((s) => s.roleId === role.id).map((s) => s.id);
              setTargets((prev) => [...prev, ...ids.filter((id) => !prev.some((t) => t.type === 'position' && t.id === id)).map((id) => ({ type: 'position' as const, id }))]);
            }}
            getOptionLabel={(o) => o.label}
            renderOption={(props, o) => <OptionRow {...props} key={`${o.type}:${o.id}`} o={o} />}
            renderInput={(p) => <TextField {...p} label="Or add every position of a role" placeholder="Search roles…" />}
          />
        )}
        {droppedTargets > 0 && (
          <Hint tone="info">
            {plural(droppedTargets, 'chosen target')} {droppedTargets === 1 ? 'shares' : 'share'} the role of what you are copying from — everything it says is already there — so
            {' '}{droppedTargets === 1 ? 'it is' : 'they are'} left out.
          </Hint>
        )}
        {usableTargets.length > 0 && (
          <Box sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
            {toType === 'role' ? plural(usableTargets.length, 'role') : plural(usableTargets.length, 'position')} chosen
          </Box>
        )}
      </Section>

      {/* 4 ── HOW ──────────────────────────────────────────────────────── */}
      <Section n={4} title="How widely should it apply?">
        {!usableTargets.length || !chosen.length ? (
          <Hint>Choose what to copy and where to, and the ways to do it appear here with what each one changes.</Hint>
        ) : (
          <RadioGroup value={mode ?? ''} onChange={(e) => setMode(e.target.value as CopyMode)} aria-label="How widely it should apply">
            <Stack spacing={1}>
              {modeCards
                .filter((m) => toType === 'position' || m.value === 'ROLE')
                .map((m) => {
                  const blocked = why[m.value];
                  const on = mode === m.value;
                  return (
                    <Box
                      key={m.value}
                      component="label"
                      sx={{
                        display: 'flex', gap: 1.25, alignItems: 'flex-start', p: 1.5,
                        borderRadius: 'var(--r-md)', cursor: blocked ? 'not-allowed' : 'pointer',
                        border: '1px solid', borderColor: on ? 'var(--c-primary-500)' : 'var(--c-border)',
                        background: on ? 'var(--c-primary-50)' : 'var(--c-surface)',
                        opacity: blocked ? 0.62 : 1,
                        '&:hover': blocked ? undefined : { borderColor: 'var(--c-primary-200)' },
                      }}
                    >
                      <Radio value={m.value} disabled={!!blocked} size="small" sx={{ mt: '-4px', ml: '-6px' }} />
                      <Box sx={{ minWidth: 0 }}>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ rowGap: 0.5 }}>
                          <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{m.title}</Typography>
                          {m.value === 'SEAT' && !blocked && <ToneBadge tone="success" noIcon label="Safest" />}
                          {m.value === 'ROLE' && m.wide && <ToneBadge tone="warning" noIcon label="Wide" />}
                          {m.value === 'FORK' && <ToneBadge tone="neutral" noIcon label="Heavier" />}
                        </Stack>
                        <Box sx={{ fontSize: 13, color: 'var(--c-text-2)', mt: 0.25, lineHeight: 1.5 }}>{m.body}</Box>
                        <Box sx={{ mt: 0.75, fontSize: 13, fontWeight: 600, color: m.wide ? 'var(--c-warning-800)' : 'var(--c-text)' }}>
                          {m.number}
                        </Box>
                        {blocked && <Box sx={{ mt: 0.5, fontSize: 12.5, color: 'var(--c-warning-800)', lineHeight: 1.45 }}>{blocked}</Box>}
                      </Box>
                    </Box>
                  );
                })}
            </Stack>
          </RadioGroup>
        )}
        {request && (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            {mode === 'FORK' && usableTargets.length === 1 && (
              <TextField
                size="small"
                fullWidth
                label="Title of the new role"
                value={forkTitle}
                onChange={(e) => setForkTitle(e.target.value)}
                placeholder={plan?.targets[0]?.fork?.newRoleTitle ?? ''}
                helperText="Leave empty to use the suggestion."
                slotProps={{ htmlInput: { maxLength: 200 } }}
              />
            )}
            <TextField
              size="small"
              type="date"
              label="Applies from (optional)"
              value={appliesFrom}
              onChange={(e) => setAppliesFrom(e.target.value)}
              helperText="Empty means it simply applies."
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ minWidth: 190 }}
            />
          </Stack>
        )}
      </Section>

      {/* 5 ── REVIEW ───────────────────────────────────────────────────── */}
      {request && (
        <Section
          n={5}
          title="What will happen"
          aside={planLoading ? <CircularProgress size={14} /> : null}
        >
          <Box aria-live="polite" sx={{ display: 'grid', gap: 1.5 }}>
            {planError ? <ErrorNotice error={planError} fallback="That could not be worked out." /> : null}
            {plan && sentences && !planError && (
              <>
                <Surface
                  e={0}
                  sx={{
                    p: 1.5,
                    borderLeft: '3px solid',
                    borderLeftColor: plan.mode === 'ROLE' && plan.totals.seats > 1 ? 'var(--c-warning-600)' : 'var(--c-success-600)',
                  }}
                >
                  <Box sx={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.45 }}>{sentences.reach}</Box>
                  {sentences.untouched && <Box sx={{ fontSize: 13, color: 'var(--c-text-2)', mt: 0.5, lineHeight: 1.5 }}>{sentences.untouched}</Box>}
                </Surface>

                <Stack direction="row" flexWrap="wrap" sx={{ gap: 1 }}>
                  <Count status="COPY_ADDED" n={plan.totals.created} verb="will be added" />
                  <Count status="COPY_REUSED" n={plan.totals.reused} verb="already there" />
                  <Count status="COPY_BLOCKED" n={plan.totals.blocked} verb="can't be added" />
                </Stack>

                <Box sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>
                  By kind:{' '}
                  {kinds.map((k) => {
                    const c = plan.totals.byKind[k];
                    return c ? `${KIND[k].many} ${c.created} of ${c.selected}` : null;
                  }).filter(Boolean).join(' · ')}
                  {' · '}No new definitions are created — the master lists do not grow.
                </Box>

                {plan.targets.some((t) => t.exceptions.length) && (
                  <Surface e={0} sx={{ p: 1.25 }}>
                    <CapsLabel sx={{ mb: 0.75 }}>Left alone</CapsLabel>
                    <Stack spacing={0.75}>
                      {plan.targets
                        .flatMap((t) => t.exceptions.map((x) => ({ ...x, at: plan.targets.length > 1 ? t.label : null })))
                        .slice(0, showAllExceptions ? 500 : 6)
                        .map((x, i) => (
                          <Stack key={`${x.key}:${i}`} direction="row" spacing={1} alignItems="flex-start">
                            <Box sx={{ flexShrink: 0 }}>
                              <StatusBadge status={x.outcome === 'REUSED' ? 'COPY_REUSED' : 'COPY_BLOCKED'} />
                            </Box>
                            <Box sx={{ fontSize: 13, minWidth: 0, lineHeight: 1.45 }}>
                              <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{x.name}</Box>
                              <Box sx={{ color: 'var(--c-text-2)', fontSize: 12.5 }}>
                                {x.at ? `${x.at}: ` : ''}{x.why}
                              </Box>
                            </Box>
                          </Stack>
                        ))}
                    </Stack>
                    {plan.targets.reduce((n, t) => n + t.exceptions.length, 0) > 6 && (
                      <Button size="small" sx={{ mt: 0.5 }} onClick={() => setShowAllExceptions((v) => !v)}>
                        {showAllExceptions ? 'Show fewer' : `Show all ${plan.targets.reduce((n, t) => n + t.exceptions.length, 0)}`}
                      </Button>
                    )}
                  </Surface>
                )}

                {plan.notices.map((n) => (
                  <Callout key={n.text} tone={n.tone === 'warning' ? 'warning' : 'neutral'} title={n.text} sx={{ mb: 0 }} />
                ))}
              </>
            )}
          </Box>
        </Section>
      )}
    </Stack>
  );

  const created = plan?.totals.created ?? 0;
  const primary = plan && sentences ? sentences.button : 'Copy';
  const ready = !!plan && !planLoading && !planError && created > 0 && !result;

  return (
    <>
      <SideSheet
        open={open}
        onClose={onClose}
        width={700}
        title={
          <Stack direction="row" spacing={1} alignItems="center">
            <ContentCopyRounded sx={{ fontSize: 20, color: 'var(--c-primary-600)' }} aria-hidden />
            <span>Copy content</span>
          </Stack>
        }
        subtitle="KRAs, responsibilities, KPIs, qualifications — from one role or position to others."
        actions={
          result ? (
            <>
              <Button
                onClick={() => {
                  setResult(null);
                  setPicked(new Set());
                  setPlan(null);
                }}
              >
                Copy more
              </Button>
              <Button variant="contained" onClick={onClose}>Close</Button>
            </>
          ) : (
            <>
              {plan && !planLoading && !planError && created === 0 && (
                <Box sx={{ mr: 'auto', fontSize: 13, color: 'var(--c-text-2)' }}>Nothing to add — it is all there already.</Box>
              )}
              <Button onClick={onClose}>Cancel</Button>
              <Button variant="contained" disabled={!ready} onClick={() => setConfirming(true)}>
                {primary}
              </Button>
            </>
          )
        }
      >
        {body}
      </SideSheet>

      <ConfirmDialog
        open={confirming}
        title={sentences?.confirmTitle ?? 'Copy this content?'}
        entityName={targetNames.slice(0, 4).join(' · ') + (targetNames.length > 4 ? ` · … and ${targetNames.length - 4} more` : '')}
        body={
          plan && sentences ? (
            <Stack spacing={1}>
              <Box sx={{ color: 'var(--c-text)', fontWeight: 600 }}>{sentences.reach}</Box>
              {sentences.untouched && <Box>{sentences.untouched}</Box>}
              <Box>
                Adds {plural(plan.totals.created, 'line')}
                {plan.totals.reused ? `; ${plan.totals.reused} already there stay as they are` : ''}
                {plan.totals.blocked ? `; ${plan.totals.blocked} cannot be added` : ''}. Nothing else changes, and no new definitions are created.
              </Box>
            </Stack>
          ) : null
        }
        confirmLabel={sentences?.confirmLabel ?? 'Copy'}
        onClose={() => setConfirming(false)}
        onConfirm={confirm}
      />
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
 * The sentences. One place, so the button, the confirm and the review agree.
 * ══════════════════════════════════════════════════════════════════════════ */

function describe(plan: CopyPlan, names: string[]) {
  const t = plan.totals;
  const lines = plural(t.created, 'line');
  const one = plan.targets.length === 1;
  const first = plan.targets[0];
  if (plan.mode === 'SEAT') {
    return {
      reach: `This changes ${plural(t.seats, 'position')} — ${one ? first.label : names.slice(0, 3).join(', ') + (names.length > 3 ? ` and ${names.length - 3} more` : '')}.`,
      untouched: one
        ? `The role “${first.roleTitle}” and its other positions are not touched; these lines are this position's own.`
        : 'Their roles, and every other position holding them, are not touched; these lines are each position’s own.',
      button: one ? `Add ${lines} to this position only` : `Add ${lines} to ${plural(t.seats, 'position')} — those positions only`,
      confirmTitle: one ? 'Add to this position only?' : `Add to ${plural(t.seats, 'position')}, each on its own?`,
      confirmLabel: one ? `Add ${lines} to 1 position` : `Add ${lines} to ${plural(t.seats, 'position')}`,
    };
  }
  if (plan.mode === 'ROLE') {
    const roles = plan.targets.length;
    const who = t.people ? ` and ${plural(t.people, 'person', 'people')} in them` : '';
    return {
      reach: roles === 1
        ? `This changes the role “${first.roleTitle}” itself — ${plural(t.seats, 'position')}${who}.`
        : `This changes ${plural(roles, 'role')} themselves — ${plural(t.seats, 'position')}${who}.`,
      untouched: null as string | null,
      button: roles === 1
        ? `Add ${lines} to role “${first.roleTitle}” — affects ${plural(t.seats, 'position')}`
        : `Add ${lines} to ${plural(roles, 'role')} — affects ${plural(t.seats, 'position')}`,
      confirmTitle: roles === 1 ? `Add to the role “${first.roleTitle}”?` : `Add to ${plural(roles, 'role')}?`,
      confirmLabel: `Add ${lines} — affects ${plural(t.seats, 'position')}`,
    };
  }
  const moved = t.assignmentsMoved ? ` ${plural(t.assignmentsMoved, 'person', 'people')}’s work ${t.assignmentsMoved === 1 ? 'assignment moves' : 'assignments move'} with ${one ? 'it' : 'them'}.` : '';
  return {
    reach: one
      ? `This creates the role “${first.fork?.newRoleTitle ?? ''}” and moves 1 position onto it.${moved}`
      : `This creates ${plural(t.newRoles, 'new role')} and moves ${plural(t.seats, 'position')}, one onto each.${moved}`,
    untouched: one
      ? `“${first.roleTitle}” and its other positions are not touched.`
      : 'The old roles, and every other position holding them, are not touched.',
    button: one ? `Give this position its own role, with ${lines} added` : `Give ${plural(t.seats, 'position')} their own roles, with ${lines} added`,
    confirmTitle: one ? 'Give this position a role of its own?' : `Give ${plural(t.seats, 'position')} roles of their own?`,
    confirmLabel: one ? 'Create role and move position' : `Create ${plural(t.newRoles, 'role')} and move positions`,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 * Pieces
 * ══════════════════════════════════════════════════════════════════════════ */

function Section({ n, title, aside, children }: { n: number; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <Box component="section" aria-label={title}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Box
          aria-hidden
          sx={{
            width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0,
            background: 'var(--c-primary-50)', color: 'var(--c-primary-700)', fontSize: 12, fontWeight: 600,
            border: '1px solid var(--c-primary-200)',
          }}
        >
          {n}
        </Box>
        <Typography component="h3" sx={{ fontSize: 14.5, fontWeight: 600 }}>{title}</Typography>
        <Box sx={{ flex: 1 }} />
        {aside}
      </Stack>
      <Stack spacing={1.25}>{children}</Stack>
    </Box>
  );
}

function Hint({ children, tone }: { children: ReactNode; tone?: 'info' }) {
  return (
    <Box
      sx={{
        fontSize: 13, lineHeight: 1.5, color: 'var(--c-text-2)', p: 1.25,
        borderRadius: 'var(--r-sm)', background: tone === 'info' ? 'var(--c-info-50)' : 'var(--c-surface-2)',
        border: '1px dashed var(--c-border)',
      }}
    >
      {children}
    </Box>
  );
}

function Count({ status, n, verb }: { status: string; n: number; verb: string }) {
  return (
    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ opacity: n ? 1 : 0.55 }}>
      <StatusBadge status={status} label={`${n}`} />
      <Box sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{verb}</Box>
    </Stack>
  );
}

function OptionRow({ o, selected, note, ...props }: { o: Opt; selected?: boolean; note?: string } & React.HTMLAttributes<HTMLLIElement>) {
  return (
    <Box component="li" {...props} sx={{ alignItems: 'flex-start !important', gap: 0.5 }}>
      {selected !== undefined && (
        <Checkbox
          size="small"
          sx={{ p: 0.25, mr: 0.5 }}
          icon={<CheckBoxOutlineBlankRounded fontSize="small" />}
          checkedIcon={<CheckBoxRounded fontSize="small" />}
          checked={selected}
          tabIndex={-1}
          disableRipple
        />
      )}
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ fontSize: 14 }}>{o.label}</Box>
        <Box sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{[o.sub, note].filter(Boolean).join(' · ')}</Box>
      </Box>
    </Box>
  );
}

function LineRow({ line, on, toggle }: { line: CopyLine; on: boolean; toggle: () => void }) {
  const detail = line.description && line.description !== line.name ? line.description : null;
  return (
    <FormControlLabel
      sx={{
        m: 0, px: 1, py: 0.25, alignItems: 'flex-start', width: '100%',
        '&:hover': { background: 'var(--c-surface-2)' },
        opacity: line.inactive ? 0.55 : 1,
      }}
      control={<Checkbox size="small" checked={on} onChange={toggle} disabled={line.inactive} sx={{ py: 0.5 }} />}
      label={
        <Box sx={{ minWidth: 0, py: 0.25 }}>
          <Box sx={{ fontSize: 13.5, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {line.name}
          </Box>
          {detail && (
            <Box sx={{ fontSize: 12, color: 'var(--c-text-3)', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{detail}</Box>
          )}
          {(line.origin === 'POSITION' || line.inactive || line.groupName || line.endsOn) && (
            <Stack direction="row" spacing={0.5} sx={{ mt: 0.25 }} flexWrap="wrap">
              {line.origin === 'POSITION' && <ToneBadge tone="info" noIcon label="this position's own" />}
              {line.inactive && <ToneBadge tone="warning" noIcon label="inactive — can't be copied" />}
              {line.groupName && <ToneBadge tone="neutral" noIcon label={`under ${line.groupName}`} />}
              {line.endsOn && <ToneBadge tone="neutral" noIcon label={`ends ${line.endsOn}`} />}
            </Stack>
          )}
        </Box>
      }
    />
  );
}

/** The result, in the same words the review used, with a way to see it. */
function Done({ result, company, go }: { result: CopyPlan; company: string; go: (to: string) => void }) {
  const t = result.totals;
  const target = (x: CopyPlan['targets'][number]) => (x.type === 'role' ? `/${company}/cf_hrms/roles/${x.id}` : `/${company}/cf_hrms/positions/${x.id}`);
  return (
    <Stack spacing={2}>
      <Callout
        tone={t.created ? 'success' : 'neutral'}
        title={t.created ? `Added ${plural(t.created, 'line')}` : 'Nothing needed adding — it was all there already'}
        sx={{ mb: 0 }}
      >
        {result.mode === 'ROLE' && `Applied to the role${result.targets.length === 1 ? '' : 's'} itself: ${plural(t.seats, 'position')} now carry${t.seats === 1 ? 'es' : ''} ${t.created === 1 ? 'it' : 'them'}.`}
        {result.mode === 'SEAT' && `Added as ${t.seats === 1 ? "the position's own" : "each position's own"} lines; the roles are unchanged.`}
        {result.mode === 'FORK' && `Created ${plural(t.newRoles, 'role')} and moved ${plural(t.seats, 'position')} onto ${t.newRoles === 1 ? 'it' : 'them'}.`}
        {' '}No new definitions were created.
      </Callout>
      <Stack direction="row" flexWrap="wrap" sx={{ gap: 1 }}>
        <Count status="COPY_ADDED" n={t.created} verb="added" />
        <Count status="COPY_REUSED" n={t.reused} verb="already there" />
        <Count status="COPY_BLOCKED" n={t.blocked} verb="not added" />
      </Stack>
      {t.assignmentsMoved > 0 && (
        <Box sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{plural(t.assignmentsMoved, 'work assignment')} moved onto the new role with the position.</Box>
      )}
      <Stack spacing={0.75}>
        <CapsLabel>Where</CapsLabel>
        {result.targets.slice(0, 12).map((x) => {
          const k = Object.values(x.kinds).reduce((n, c) => n + (c?.created ?? 0), 0);
          return (
            <Stack key={`${x.type}:${x.id}`} direction="row" alignItems="center" spacing={1}>
              <Box sx={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>
                {x.label}
                <Box component="span" sx={{ color: 'var(--c-text-3)', fontSize: 12 }}>
                  {' · '}{plural(k, 'line')} added{x.fork?.newRoleTitle ? ` · new role “${x.fork.newRoleTitle}”` : ''}
                </Box>
              </Box>
              <Button size="small" onClick={() => go(x.fork?.newRoleId ? `/${company}/cf_hrms/roles/${x.fork.newRoleId}` : target(x))}>
                Open
              </Button>
            </Stack>
          );
        })}
        {result.targets.length > 12 && <Box sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>… and {result.targets.length - 12} more</Box>}
      </Stack>
    </Stack>
  );
}

export default ContentCopySheet;
