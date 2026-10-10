import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import { ErrorNotice, Mono, StatusBadge, ToneBadge, useIsPermitted, useToast } from '@shared/ui';
import { getRole, type Role } from '../api/roles';
import { positionsApi, type LookupRow } from '../api/positions';
import { cardCount, rowsOf, vacantLine, type ChartCard, type ChartModel } from './orgChartLayout';
import { OrgChartJobSection } from './OrgChartJobSection';
import { PositionListRow, SectionTitle } from './OrgChartPositionParts';
import { shiftWord } from './usePositionCard';
import { inPanelLink, positionView, smallLabel, type PanelNav, type PanelView } from './orgChartPanelNav';

/**
 * A ROLE, in the org chart's floating panel — what a card's headline opens.
 *
 * TOP TO BOTTOM (the user's order, 2026-10-10):
 *   1. the role and the department of THIS card;
 *   2. "Positions" — this card's positions as rows (the person or Vacant, the
 *      shift, the code), each opening that position, and "Add a position",
 *      which asks for a shift and makes one more vacant position in this card;
 *   3. the one-sentence purpose;
 *   4. the role's KRAs → responsibilities and KPIs, edited at ROLE level.
 *
 * A ROLE IS SHARED, AND THE VIEW SAYS SO BEFORE THE EDITOR: when other cards
 * hold the same role, "This role is used in N places. A change here changes
 * all of them." with those cards listed — each one re-centres the chart on it
 * and opens its role view.
 *
 * Nothing here counts on its own: a card's numbers are `cardCount` and its
 * rows are `rowsOf`, the same the chart draws.
 */

type RoleView = Extract<PanelView, { kind: 'role' }>;

function AddPosition({ card, onAdded }: { card: ChartCard; onAdded: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [shifts, setShifts] = useState<LookupRow[] | null>(null);
  const [shiftId, setShiftId] = useState<number | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const source = card.positions[0];
  const start = () => {
    setOpen(true);
    setError(null);
    if (shifts) return;
    positionsApi
      .options()
      .then((o) => {
        const rank: Record<string, number> = { G: 0, D: 1, N: 2 };
        const list = o.shifts
          .filter((s) => !s.status || s.status === 'ACTIVE')
          .sort((a, b) => (rank[a.code ?? ''] ?? 3) - (rank[b.code ?? ''] ?? 3) || a.name.localeCompare(b.name));
        setShifts(list);
        // Start on the source position's shift; the person adding picks.
        const own = source?.defaultShift?.id;
        setShiftId(list.some((s) => s.id === own) ? own! : (list[0]?.id ?? ''));
      })
      .catch(setError);
  };

  const add = async () => {
    if (!source || shiftId === '') return;
    setBusy(true);
    setError(null);
    try {
      const made = await positionsApi.addSibling(source.id, { shiftId });
      const name = shifts?.find((s) => s.id === shiftId)?.name;
      toast.success(
        `A vacant position${made.position?.positionCode ? ` (${made.position.positionCode})` : ''} was added${name ? ` on ${shiftWord(name)}` : ''}.`,
      );
      setOpen(false);
      onAdded();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  if (!source) return null;
  if (!open) {
    return (
      <Box>
        <Button size="small" startIcon={<AddRounded />} onClick={start} data-addposition="">
          Add a position
        </Button>
      </Box>
    );
  }
  return (
    <Box
      data-addposition-form=""
      sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', p: 1.25 }}
    >
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', lineHeight: 1.5, mb: 1 }}>
        One more position for this role, in this department, reporting to the same manager. It starts vacant.
      </Typography>
      {!!error && <ErrorNotice error={error} fallback="The position could not be added." />}
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <TextField
          select
          size="small"
          label="Shift"
          required
          value={shiftId}
          onChange={(e) => setShiftId(Number(e.target.value))}
          disabled={!shifts}
          sx={{ minWidth: 150 }}
        >
          {(shifts ?? []).map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {shiftWord(s.name)}
            </MenuItem>
          ))}
        </TextField>
        <Button size="small" variant="contained" disabled={busy || shiftId === ''} onClick={() => void add()}>
          {busy ? 'Adding…' : 'Add position'}
        </Button>
        <Button size="small" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
      </Stack>
    </Box>
  );
}

export function OrgChartRoleView({
  view,
  model,
  asOf,
  company,
  nav,
  onChanged,
  onOpenCard,
  children,
}: {
  view: RoleView;
  model: ChartModel | null;
  asOf: string;
  company: string;
  nav: PanelNav;
  onChanged?: () => void;
  /** Re-centres the chart on another card and opens its role view. */
  onOpenCard?: (cardId: number) => void;
  /** The viewer's own drawing options for this card, at the very bottom. */
  children?: ReactNode;
}) {
  const can = useIsPermitted();
  const canManage = can('cf_hrms_org_manage');
  const [role, setRole] = useState<Role | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (view.roleId == null) return;
    let live = true;
    setRole(null);
    setError(null);
    getRole(view.roleId)
      .then((r) => {
        if (live) setRole(r);
      })
      .catch((e) => {
        if (live) setError(e);
      });
    return () => {
      live = false;
    };
  }, [view.roleId]);

  const card = view.cardId != null ? (model?.byId.get(view.cardId) ?? null) : null;
  // Every OTHER card holding this role — the places an edit here also reaches.
  const others = useMemo(
    () =>
      model && view.roleId != null
        ? [...model.byId.values()].filter((c) => c.roleId === view.roleId && c.id !== view.cardId)
        : [],
    [model, view.roleId, view.cardId],
  );
  const places = others.length + (card ? 1 : 0);
  const rows = card ? rowsOf(card, 'all') : [];
  const count = card ? cardCount(card) : null;

  const placeList = (
    <Box component="ul" data-roleplaces="" sx={{ listStyle: 'none', m: 0, mt: 0.5, p: 0, fontSize: 13 }}>
      {others.map((c) => {
        const n = cardCount(c);
        const dept = c.departmentName ?? 'No department';
        // Two cards of the role in one department are told apart by the card's own title.
        const twin = others.some((x) => x.id !== c.id && (x.departmentName ?? 'No department') === dept);
        const place = twin ? `${dept} — ${c.displayTitle || c.title}` : dept;
        const label = `${place} — ${n.filled} of ${n.positions} filled`;
        return (
          <Box component="li" key={c.id} sx={{ py: 0.15 }}>
            {onOpenCard ? (
              <Box component="button" type="button" onClick={() => onOpenCard(c.id)} sx={inPanelLink}>
                {place}
              </Box>
            ) : (
              <span>{place}</span>
            )}
            <Box component="span" sx={{ color: 'var(--c-text-2)' }} aria-label={label}>
              {' '}
              · {n.filled} of {n.positions} filled
            </Box>
          </Box>
        );
      })}
    </Box>
  );

  return (
    <Box data-roleview="">
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.75 }}>
        {role?.roleCode && <Mono sx={{ fontSize: 12.5 }}>{role.roleCode}</Mono>}
        {role && role.status !== 'ACTIVE' && <StatusBadge status={role.status} />}
        {role && !role.jdReady && (
          <ToneBadge tone="warning" noIcon label={!role.hasPurpose ? 'No purpose written' : 'No KRAs written'} />
        )}
      </Stack>
      {card && (
        <Typography data-roledept="" sx={{ fontSize: 13, lineHeight: 1.5 }}>
          <Box component="span" sx={{ ...smallLabel, mr: 0.75 }}>
            Department
          </Box>
          {card.departmentName ?? '—'}
        </Typography>
      )}
      {!!error && <ErrorNotice error={error} fallback="That role could not be loaded." />}

      {/* 2 ── this card's positions */}
      {card && count && (
        <Box sx={{ mt: 1.5 }} data-rolepositions="">
          <SectionTitle count={count.vacant ? `${count.positions} · ${vacantLine(count)}` : `${count.positions} · all filled`}>
            Positions
          </SectionTitle>
          <Stack spacing={0.5}>
            {rows.map((r) =>
              r.positionId == null ? null : (
                <PositionListRow
                  key={r.positionId}
                  name={r.occupant ? r.occupant.name?.trim() || 'Name not recorded' : null}
                  shift={r.shiftName}
                  code={r.positionCode}
                  hiring={r.hiring}
                  joining={r.joining}
                  onClick={() => nav.push(positionView(model, r.positionId!))}
                />
              ),
            )}
            {canManage && <AddPosition card={card} onAdded={() => onChanged?.()} />}
          </Stack>
        </Box>
      )}

      {/* 3 ── what the job is for */}
      {role && (
        <Typography
          data-purpose=""
          sx={{ fontSize: 13, lineHeight: 1.55, mt: 1.75, color: role.rolePurpose ? 'var(--c-text)' : 'var(--c-text-2)' }}
        >
          <Box component="span" sx={{ ...smallLabel, mr: 0.75 }}>
            Purpose
          </Box>
          {role.rolePurpose ?? 'No purpose is written for this role yet.'}
        </Typography>
      )}

      {/* 4 ── the role's content, edited at role level */}
      {view.roleId != null ? (
        <Box sx={{ mt: 1.75 }}>
          <SectionTitle>KRAs, responsibilities and KPIs</SectionTitle>
          {others.length > 0 && (
            <Box
              data-roleshared=""
              role="note"
              sx={{
                fontSize: 13,
                lineHeight: 1.5,
                color: 'var(--c-warning-800)',
                background: 'var(--c-warning-50)',
                borderRadius: 'var(--r-sm)',
                px: 1.25,
                py: 0.75,
                mb: 1,
              }}
            >
              <strong>
                This role is used in {places} place{places === 1 ? '' : 's'}.
              </strong>{' '}
              A change here changes all of them.
              <Box sx={{ color: 'var(--c-text)', mt: 0.25 }}>
                {card ? 'The others:' : 'They are:'}
                {placeList}
              </Box>
            </Box>
          )}
          <OrgChartJobSection
            target={{ type: 'role', id: view.roleId }}
            roleId={view.roleId}
            asOf={asOf}
            company={company}
            onChanged={onChanged}
          />
        </Box>
      ) : (
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mt: 1.75 }}>
          The role&apos;s KRAs, responsibilities and KPIs are not part of this view.
        </Typography>
      )}

      {view.roleId != null && (
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 2 }}>
          <Button size="small" variant="outlined" component={RouterLink} to={`/${company}/cf_hrms/roles/${view.roleId}`}>
            Role page
          </Button>
        </Stack>
      )}

      {children}
    </Box>
  );
}

export default OrgChartRoleView;
