import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, MenuItem, TextField, Typography } from '@mui/material';
import { FormDialog, useToast } from '@shared/ui';
import { useCan } from '../access/can';
import { leaveApi, type Effective, type PolicySummary, type Ref } from '../api/leave';

/**
 * Where a leave policy is SHOWN outside its own screen (CF_HRMS_HIRING_SPEC.md §8.4):
 *
 *   on a position   the policy it ends up with, and from where — "Office staff —
 *                   from the role". Read-only: a position has no policy of its
 *                   own; it is decided by its role, its department's labels, its location, or the company.
 *   on a role       the role's OWN policy, or "Follows the location", with the
 *                   one change that can be made there.
 *
 * The line on a position is the server's sentence. Both are drawn only for
 * someone who may read leave policies; nobody else is shown an empty label.
 */

/** The effective policy of a position: the read's own `leavePolicy` when it has one, else asked for. */
export function PositionLeavePolicy({
  positionId,
  effective,
  company,
}: {
  positionId: number;
  /** `leavePolicy` from the position read, where the server already sends it. */
  effective?: Effective | null;
  company: string;
}) {
  const canView = useCan().leave.view;
  const [asked, setAsked] = useState<Effective | null>(null);

  useEffect(() => {
    if (effective || !canView) return undefined;
    let live = true;
    setAsked(null);
    leaveApi
      .policyFor({ positionId })
      .then((e) => {
        if (live) setAsked(e);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [positionId, effective, canView]);

  const e = effective ?? asked;
  if (!canView || !e) return null;
  return (
    <Box component="span" data-leavepolicy="" sx={{ overflowWrap: 'anywhere' }}>
      {e.policy && canView ? (
        <Box component={RouterLink} to={`/${company}/cf_hrms/leave-policies/${e.policy.id}`} sx={{ color: 'var(--c-primary-700)' }}>
          {e.line}
        </Box>
      ) : (
        <Box component="span" sx={{ color: e.policy ? 'inherit' : 'var(--c-text-2)' }}>{e.line}</Box>
      )}
    </Box>
  );
}

/** A role's own leave policy, with "Change". Null for someone who cannot read leave policies. */
export function RoleLeavePolicy({ roleId, roleTitle, company }: { roleId: number; roleTitle: string; company: string }) {
  const can = useCan();
  const canView = can.leave.view;
  const canManage = can.leave.edit;
  const canRemove = can.leave.remove;
  const toast = useToast();
  const [own, setOwn] = useState<Ref | null | undefined>(undefined);
  const [policies, setPolicies] = useState<PolicySummary[] | null>(null);
  const [choice, setChoice] = useState<number | '' | null>(null);

  const load = useCallback(() => {
    if (!canView) return;
    leaveApi
      .assignments()
      // Only roles WITH a policy of their own are listed; a role that is not there follows its location.
      .then((a) => setOwn(a.roles.find((r) => r.roleId === roleId)?.policy ?? null))
      .catch(() => setOwn(undefined));
  }, [roleId, canView]);

  useEffect(() => {
    load();
  }, [load]);

  if (!canView || own === undefined) return null;

  const openChange = () => {
    setChoice(own?.id ?? '');
    if (!policies) leaveApi.policies().then(setPolicies).catch(() => setPolicies([]));
  };

  return (
    <Box component="span" data-roleleave="" sx={{ display: 'inline-flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 0.75 }}>
      {own ? (
        <Box component={RouterLink} to={`/${company}/cf_hrms/leave-policies/${own.id}`} sx={{ color: 'var(--c-primary-700)' }}>
          {own.name}
        </Box>
      ) : (
        <Box component="span" sx={{ color: 'var(--c-text-2)' }}>Follows its org unit kind, location or the company</Box>
      )}
      {canManage && (
        <Button size="small" variant="text" onClick={openChange} sx={{ minWidth: 0, px: 0.5, py: 0, fontSize: 12.5, lineHeight: 1.5, textTransform: 'none' }}>
          Change
        </Button>
      )}
      <FormDialog
        open={choice !== null}
        title="Leave policy for this role"
        subtitle={roleTitle}
        onClose={() => setChoice(null)}
        onSubmit={async () => {
          await leaveApi.assign({ scope: 'ROLE', roleId, policyId: choice === '' || choice == null ? null : choice });
          toast.success(choice === '' ? `${roleTitle} follows its location again.` : `${roleTitle} now has its own leave policy.`);
          load();
        }}
        submitLabel="Save"
        submitDisabled={(choice ?? '') === (own?.id ?? '')}
        maxWidth="xs"
      >
        <TextField
          select
          size="small"
          fullWidth
          label="Leave policy"
          value={choice ?? ''}
          onChange={(e) => setChoice(e.target.value === '' ? '' : Number(e.target.value))}
          slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
          sx={{ mt: 0.75 }}
          helperText="A role’s own policy applies to every position of the role, whatever its location."
        >
          {(canRemove || !own) && <MenuItem value="">Follows its org unit kind, location or the company</MenuItem>}
          {(policies ?? []).filter((p) => p.status !== 'ARCHIVED' || p.id === own?.id).map((p) => (
            <MenuItem key={p.id} value={p.id} disabled={p.status !== 'ACTIVE' && p.id !== own?.id}>
              {p.name}{p.status !== 'ACTIVE' ? ' — a draft; make it active first' : ''}
            </MenuItem>
          ))}
        </TextField>
        {policies && policies.length === 0 && (
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 1 }}>There is no leave policy yet. Create one under Leave policies first.</Typography>
        )}
      </FormDialog>
    </Box>
  );
}
