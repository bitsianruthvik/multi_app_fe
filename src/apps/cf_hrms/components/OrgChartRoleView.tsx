import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Stack, Typography } from '@mui/material';
import { ErrorNotice, Mono, StatusBadge, ToneBadge } from '@shared/ui';
import { getRole, type Role } from '../api/roles';
import type { ChartModel } from './orgChartLayout';
import { seatCount } from './orgChartLayout';
import { OrgChartJobSection } from './OrgChartJobSection';
import { SectionTitle } from './OrgChartSeatView';
import { inPanelLink, type PanelNav, type PanelView } from './orgChartPanelNav';

/**
 * A role, in the org chart's floating panel (spec §17): what it is for, the
 * positions that hold it — each one a way back into a seat — and its KRAs,
 * responsibilities and KPIs, editable here by someone who may edit roles.
 *
 * The positions listed are the ones on the chart (the same graph the boxes are
 * drawn from); the role's own count, which also includes a closed position, is
 * the number the editor quotes when it says who an edit reaches.
 */

type RoleView = Extract<PanelView, { kind: 'role' }>;

export function OrgChartRoleView({
  view,
  model,
  asOf,
  company,
  nav,
  onChanged,
}: {
  view: RoleView;
  model: ChartModel | null;
  asOf: string;
  company: string;
  nav: PanelNav;
  onChanged?: () => void;
}) {
  const [role, setRole] = useState<Role | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
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

  const seats = model ? [...model.byId.values()].filter((n) => n.roleId === view.roleId) : [];

  return (
    <Box data-roleview="">
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
        {role?.roleCode && <Mono sx={{ fontSize: 12.5 }}>{role.roleCode}</Mono>}
        {role && <StatusBadge status={role.status} />}
        {role && !role.jdReady && (
          <ToneBadge tone="warning" noIcon label={!role.hasPurpose ? 'No purpose written' : 'No KRAs written'} />
        )}
      </Stack>
      {!!error && <ErrorNotice error={error} fallback="That role could not be loaded." />}

      {role && (
        <Typography
          data-purpose=""
          sx={{ fontSize: 13, lineHeight: 1.55, color: role.rolePurpose ? 'var(--c-text)' : 'var(--c-text-2)' }}
        >
          {role.rolePurpose ?? 'No purpose is written for this role yet.'}
        </Typography>
      )}

      <Box sx={{ mt: 1.75 }} data-rolepositions="">
        <SectionTitle count={seats.length || undefined}>Positions holding this role</SectionTitle>
        {seats.length === 0 ? (
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
            No position on the chart holds this role on {asOf}.
          </Typography>
        ) : (
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {seats.map((n) => {
              const c = seatCount(n, 'all');
              return (
                <Box
                  component="li"
                  key={n.id}
                  sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 0.75, py: 0.25, fontSize: 13 }}
                >
                  <Box
                    component="button"
                    type="button"
                    onClick={() => nav.push({ kind: 'seat', positionId: n.id, title: n.displayTitle || n.title })}
                    sx={inPanelLink}
                  >
                    {n.displayTitle || n.title}
                  </Box>
                  {n.positionCode && <Mono sx={{ fontSize: 11.5 }}>{n.positionCode}</Mono>}
                  <Box component="span" sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                    {n.occupants.length ? n.occupants.map((o) => o.name).join(', ') : 'open'} · {c.filled} of {c.seats}
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>

      <Box sx={{ mt: 1.75 }}>
        <SectionTitle>KRAs, responsibilities and KPIs</SectionTitle>
        <OrgChartJobSection
          target={{ type: 'role', id: view.roleId }}
          roleId={view.roleId}
          asOf={asOf}
          company={company}
          onChanged={onChanged}
        />
      </Box>

      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 2 }}>
        <Button size="small" variant="outlined" component={RouterLink} to={`/${company}/cf_hrms/roles/${view.roleId}`}>
          Role page
        </Button>
      </Stack>
    </Box>
  );
}

export default OrgChartRoleView;
