/**
 * The roles and positions inside one department, and the side sheet that opens
 * a role's or a position's job content from them.
 *
 * Positions are grouped by role because that is the question the screen is
 * asked: "what kinds of job does Stores have, how many positions of each, and who
 * is in them". A role's row opens what the role says; a position's row opens
 * what that POSITION does — the role's content with the position's own changes marked.
 *
 * The numbers come from `GET /organisation/departments/staffing`, which is cut
 * from the org chart's own nodes, so positions / filled / vacant here are the
 * chart's numbers by construction. One request serves every department.
 */
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Box, Button, Stack, Typography } from '@mui/material';
import EditRounded from '@mui/icons-material/EditRounded';
import { Mono, SideSheet, ToneBadge, useIsPermitted } from '@shared/ui';
import type { PositionShift } from '../api/positions';
import { PositionShiftControl } from './PositionShiftControl';
import { HiringEntry } from './HiringEntry';
import type { DepartmentStaffing, StaffingPosition, StaffingRole } from '../api/jobContent';
import { JobContentPanel } from './JobContentPanel';

const SHIFT_NAME: Record<string, string> = { G: 'General', D: 'Day', N: 'Night' };
/** The shift's NAME when the row carries one, else the code mapped to its usual name. */
const shiftOf = (p: StaffingPosition): string =>
  p.shift?.name ?? (p.shiftPattern ? (SHIFT_NAME[p.shiftPattern] ?? p.shiftPattern) : '');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What the side sheet is showing. */
export interface JobPeek {
  type: 'role' | 'position';
  id: number;
  title: string;
  subtitle: string;
  roleId: number | null;
  /** Position peeks only: what the side sheet needs to change the shift and offer hiring. */
  shift?: { id?: number | null; code?: string | null; name?: string | null } | null;
  occupantName?: string | null;
  positionCode?: string | null;
  roleTitle?: string | null;
}

const countsText = (x: { filled: number; vacant: number }, n: number) =>
  `${plural(n, 'position')} · ${x.filled} filled · ${x.vacant} vacant`;

function who(p: StaffingPosition): string {
  if (p.occupants.length === 0) return 'Vacant';
  return p.occupants.map((o) => o.name).join(', ');
}

const linkButton = {
  border: 0,
  background: 'none',
  p: 0,
  font: 'inherit',
  textAlign: 'left' as const,
  cursor: 'pointer',
  color: 'var(--c-primary-700)',
  overflowWrap: 'anywhere' as const,
  '&:hover': { textDecoration: 'underline' },
  '&:focus-visible': { outline: '2px solid var(--c-primary-500)', outlineOffset: 2, borderRadius: '4px' },
};

export function DepartmentStaffingPanel({
  name,
  staffing,
  hasChildren,
  onPeek,
}: {
  name: string;
  staffing: DepartmentStaffing | null;
  /** It has sub-departments — said when it has no positions of its own. */
  hasChildren: boolean;
  onPeek: (peek: JobPeek) => void;
}) {
  const roles = staffing?.roles ?? [];
  const peekRole = (r: StaffingRole) => {
    if (r.roleId == null) return;
    onPeek({
      type: 'role',
      id: r.roleId,
      title: r.roleTitle,
      subtitle: `Role · in ${name} · ${countsText(r, r.positions.length)}`,
      roleId: r.roleId,
    });
  };
  const peekPosition = (r: StaffingRole, p: StaffingPosition) =>
    onPeek({
      type: 'position',
      id: p.positionId,
      title: p.title,
      subtitle: `Position${p.positionCode ? ` ${p.positionCode}` : ''} · role ${r.roleTitle} · ${who(p)}`,
      roleId: r.roleId,
      shift: p.shift ?? (p.shiftPattern ? { code: p.shiftPattern, name: shiftOf(p) } : null),
      occupantName: p.occupants[0]?.name ?? null,
      positionCode: p.positionCode,
      roleTitle: r.roleTitle,
    });

  return (
    <Box
      data-deptstaffing=""
      sx={{
        mt: 0.75,
        mb: 0.5,
        ml: { xs: 0, sm: 4 },
        p: 1.5,
        border: '1px solid var(--c-border)',
        borderRadius: 'var(--r-sm)',
        background: 'var(--c-surface-2)',
      }}
    >
      <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>
        Roles and positions in {name}
      </Typography>
      {roles.length === 0 ? (
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mt: 0.5 }}>
          No positions sit in this department.
          {hasChildren ? ' The departments under it hold their own — open one of them.' : ''}
        </Typography>
      ) : (
        <>
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.25 }}>
            {plural(staffing!.counts.roles, 'role')} · {countsText(staffing!.counts, staffing!.counts.positions)}. Click a role or a position to see its KRAs, responsibilities and KPIs.
          </Typography>
          <Stack spacing={1} sx={{ mt: 1.25 }}>
            {roles.map((r) => (
              <Box
                key={r.roleId ?? 0}
                data-staffrole=""
                sx={{
                  background: 'var(--c-surface)',
                  border: '1px solid var(--c-border)',
                  borderRadius: 'var(--r-sm)',
                  p: 1.25,
                }}
              >
                <Stack direction="row" alignItems="baseline" flexWrap="wrap" useFlexGap columnGap={1} rowGap={0.25}>
                  <Typography
                    sx={{
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: '.06em',
                      textTransform: 'uppercase',
                      color: 'var(--c-text-3)',
                    }}
                  >
                    Role
                  </Typography>
                  {r.roleId != null ? (
                    <Box
                      component="button"
                      type="button"
                      onClick={() => peekRole(r)}
                      sx={{ ...linkButton, fontSize: 14, fontWeight: 600 }}
                    >
                      {r.roleTitle}
                    </Box>
                  ) : (
                    <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{r.roleTitle}</Typography>
                  )}
                  <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                    {countsText(r, r.positions.length)}
                  </Typography>
                </Stack>
                <Box
                  component="ul"
                  sx={{ listStyle: 'none', m: 0, mt: 0.75, p: 0, pl: 1.25, borderLeft: '2px solid var(--c-divider)' }}
                >
                  {r.positions.map((p) => (
                    <Box
                      component="li"
                      key={p.positionId}
                      data-staffposition=""
                      sx={{ py: 0.5, display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 1, rowGap: 0.25 }}
                    >
                      <Box
                        component="button"
                        type="button"
                        onClick={() => peekPosition(r, p)}
                        sx={{ ...linkButton, fontSize: 13.5 }}
                      >
                        {p.title}
                      </Box>
                      {p.positionCode && <Mono sx={{ fontSize: 11.5 }}>{p.positionCode}</Mono>}
                      <Typography
                        sx={{ fontSize: 12.5, color: p.occupants.length ? 'var(--c-text)' : 'var(--c-text-2)' }}
                      >
                        {who(p)}
                      </Typography>
                      <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
                        {shiftOf(p) || 'No shift'}
                      </Typography>
                      {p.hasSeatChanges && <ToneBadge tone="warning" noIcon label="Differs from its role" />}
                    </Box>
                  ))}
                </Box>
              </Box>
            ))}
          </Stack>
        </>
      )}
    </Box>
  );
}

/**
 * The peek: a role's or a position's job content beside the department list,
 * with Edit going to the screen that owns the edit — the role's Content tab, or
 * the position's job-content editor. Edit is hidden from a login that cannot
 * use it (`cf_hrms_roles_manage` for a role, `cf_hrms_org_manage` for a position).
 */
export function JobPeekSheet({
  peek,
  company,
  onClose,
  onChanged,
}: {
  peek: JobPeek | null;
  company: string;
  onClose: () => void;
  /** After the shift of the peeked position changed, so the list behind can reload. */
  onChanged?: (shift: PositionShift) => void;
}) {
  const can = useIsPermitted();
  const navigate = useNavigate();
  const isRole = peek?.type === 'role';
  const full = peek ? `/${company}/cf_hrms/${isRole ? 'roles' : 'positions'}/${peek.id}` : '';
  const edit = peek ? `${full}${isRole ? '?tab=content' : '?tab=job&edit=1'}` : '';
  const canEdit = isRole ? can('cf_hrms_roles_manage') : can('cf_hrms_org_manage');
  const roleHref = peek?.roleId ? `/${company}/cf_hrms/roles/${peek.roleId}?tab=content` : null;

  return (
    <SideSheet
      open={!!peek}
      onClose={onClose}
      title={peek?.title ?? ''}
      subtitle={peek?.subtitle}
      width={520}
      onExpand={peek ? () => navigate(full) : undefined}
      expandLabel={isRole ? 'Open the role' : 'Open the position'}
      actions={
        peek && canEdit ? (
          <Button component={RouterLink} to={edit} variant="contained" size="small" startIcon={<EditRounded />}>
            {isRole ? 'Edit the role’s content' : 'Edit for this position'}
          </Button>
        ) : undefined
      }
    >
      {peek && !isRole && (
        <Stack spacing={1} sx={{ mb: 1.5 }}>
          <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>Shift</Typography>
            <PositionShiftControl
              positionId={peek.id}
              shift={peek.shift ?? null}
              occupantName={peek.occupantName ?? null}
              onChanged={(s) => onChanged?.(s)}
            />
          </Stack>
          {!peek.occupantName && (
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>Vacant</Typography>
              {can('cf_hrms_org_manage') && (
                <>
                  <Button component={RouterLink} to={`/${company}/cf_hrms/assignments?new=1&positionId=${peek.id}`} size="small" variant="outlined">
                    Move an existing employee here
                  </Button>
                  <HiringEntry positionId={peek.id} positionCode={peek.positionCode ?? null} roleTitle={peek.roleTitle ?? null} onChanged={() => onChanged?.(peek.shift as PositionShift)} />
                </>
              )}
            </Stack>
          )}
        </Stack>
      )}
      {peek && (
        <JobContentPanel
          target={{ type: peek.type, id: peek.id }}
          dense
          noKrasAction={
            roleHref ? (
              <Box component={RouterLink} to={roleHref} sx={{ color: 'var(--c-primary-700)' }}>
                {can('cf_hrms_roles_manage') ? 'Write them on the role' : 'Open the role'}
              </Box>
            ) : undefined
          }
          after={() => (
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 1.5, lineHeight: 1.55 }}>
              {isRole ? (
                'This is what the role says. Every position holding it starts from this; open a position to see what that one does differently.'
              ) : (
                <>
                  KRAs come from the role and are the same for every position holding it.{' '}
                  {roleHref && (
                    <Box component={RouterLink} to={roleHref} sx={{ color: 'var(--c-primary-700)' }}>
                      Open the role
                    </Box>
                  )}
                </>
              )}
            </Typography>
          )}
        />
      )}
    </SideSheet>
  );
}
