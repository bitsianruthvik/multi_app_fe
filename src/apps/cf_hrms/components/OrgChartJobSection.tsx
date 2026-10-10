/**
 * A job's KRAs → responsibilities and KPIs inside the org chart panel, with
 * the editor for them in place. WHICH editor is decided by the view the panel
 * is in — never by a prompt (the client's decision, 2026-10-10):
 *
 *   a POSITION (the view a box opens)
 *       Shows the position's RESOLVED content: the role's KRAs as fixed
 *       headings, and under them the position's responsibilities and KPIs.
 *       Editing is POSITION-LEVEL only — add a line, change its wording or a
 *       KPI's target, switch a line off, undo — through the seat endpoints
 *       (`SeatJobContentEditor`, embedded). KRAs cannot be touched here; one
 *       sentence says so and opens the role view. Other positions holding the
 *       role are not affected, and the edit surface says that.
 *
 *   a ROLE (reached by clicking the role's name)
 *       The role's own content, with ROLE-level editing through the role
 *       endpoints (`RoleContentTab`): KRAs, lines, moves, default targets. A
 *       role is shared, so the editor says who it reaches before anything is
 *       saved — "Changes the role X — 2 positions" — above the editor and in
 *       every dialog; the number is the role's own `positionCount`.
 *
 * A ROLE EDIT DOES NOT OVERWRITE WHAT A POSITION CHANGED FOR ITSELF. That is
 * the resolver's behaviour, checked 2026-10-10 on Karni: a role KPI target was
 * changed while one position held its own target — that position kept its
 * value and showed the new role target as "what the role says"; its sibling
 * got the new one. And a role KRA was deleted while a position had added a
 * line under it — the line stayed on the position, ungrouped, with a note.
 */
import { useCallback, useEffect, useState } from 'react';
import { Box, Button, Skeleton, Stack, Typography } from '@mui/material';
import EditRounded from '@mui/icons-material/EditRounded';
import DoneRounded from '@mui/icons-material/DoneRounded';
import { ErrorNotice, useIsPermitted } from '@shared/ui';
import { getRoleContent, type RoleContent } from '../api/roles';
import { JobContentPanel } from './JobContentPanel';
import { RoleContentTab } from './RoleContentTab';
import { SeatJobContentEditor } from './SeatJobContentEditor';
import { reachSentence } from './orgChartPanelNav';

export function OrgChartJobSection({
  target,
  roleId,
  asOf,
  company,
  onChanged,
  onOpenRole,
}: {
  /** From a seat: opens the role's view in the panel (where KRAs are edited). */
  onOpenRole?: (roleId: number, title: string) => void;
  /** What is being read: a seat (resolved, with its own changes marked) or the role itself. */
  target: { type: 'position' | 'role'; id: number };
  roleId: number | null;
  asOf?: string;
  company: string;
  /** After a role edit — other boxes holding the role count their content from it. */
  onChanged?: () => void;
}) {
  const can = useIsPermitted();
  const canEditRole = can('cf_hrms_roles_manage') && roleId != null;
  const canEditSeat = can('cf_hrms_org_manage');
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState<RoleContent | null>(null);
  const [error, setError] = useState<unknown>(null);
  // Bumped when editing ends, so the read view is fetched again with the edits in it.
  const [readKey, setReadKey] = useState(0);

  // A different seat or role: back to reading, with nothing carried over.
  useEffect(() => {
    setEditing(false);
    setContent(null);
    setError(null);
  }, [target.type, target.id, roleId]);

  const load = useCallback(() => {
    if (roleId == null) return;
    setError(null);
    getRoleContent(roleId, { scope: 'all' })
      .then(setContent)
      .catch(setError);
  }, [roleId]);

  useEffect(() => {
    if (editing) load();
  }, [editing, load]);

  // A POSITION is edited at the position: its own responsibilities, KPIs and
  // targets, through the seat endpoints. KRAs are not touched here.
  if (target.type === 'position') {
    return (
      <SeatJobContentEditor
        embedded
        positionId={target.id}
        company={company}
        canManage={canEditSeat}
        asOf={asOf}
        onOpenRole={onOpenRole}
        onChanged={() => onChanged?.()}
      />
    );
  }

  if (editing && roleId != null) {
    const role = content?.role ?? null;
    const reach = role ? reachSentence(role.title, role.positionCount) : null;
    return (
      <Box data-jobedit="">
        <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ mb: 1 }}>
          <Box
            data-reach=""
            role="status"
            sx={{
              flex: 1,
              fontSize: 13,
              lineHeight: 1.5,
              color: 'var(--c-warning-800)',
              background: 'var(--c-warning-50)',
              borderRadius: 'var(--r-sm)',
              px: 1.25,
              py: 0.75,
            }}
          >
            {reach ? (
              <>
                <strong>{reach}.</strong> Every position holding this role gets what you change here — except a line
                a position has changed or switched off for itself: that position keeps its own version.
              </>
            ) : (
              'Loading the role…'
            )}
          </Box>
          <Button
            size="small"
            variant="contained"
            startIcon={<DoneRounded />}
            onClick={() => {
              setEditing(false);
              setReadKey((k) => k + 1);
            }}
          >
            Done
          </Button>
        </Stack>
        {!!error && <ErrorNotice error={error} fallback="The role could not be loaded." onRetry={load} />}
        {!content && !error && (
          <Stack spacing={1} aria-busy="true">
            <Skeleton variant="rounded" height={44} />
            <Skeleton variant="rounded" height={44} />
          </Stack>
        )}
        {content && reach && (
          <RoleContentTab
            content={content}
            canManage
            dense
            reach={reach}
            onChanged={() => {
              load();
              onChanged?.();
            }}
          />
        )}
      </Box>
    );
  }

  return (
    <Box data-jobread="">
      <JobContentPanel
        key={readKey}
        target={target}
        asOf={asOf}
        dense
        noKrasAction={
          canEditRole ? (
            <Box
              component="button"
              type="button"
              onClick={() => setEditing(true)}
              sx={{ border: 0, background: 'none', p: 0, font: 'inherit', color: 'var(--c-primary-700)', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Write them
            </Box>
          ) : undefined
        }
        after={() => (
            <Stack spacing={0.75} sx={{ mt: 1.25 }}>
              {canEditRole && (
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Button size="small" variant="outlined" startIcon={<EditRounded />} onClick={() => setEditing(true)}>
                    Edit KRAs, responsibilities and KPIs
                  </Button>
                  <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
                    Edits here change the role, for every position holding it.
                  </Typography>
                </Stack>
              )}
              {!canEditRole && (
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
                  You can read this; changing a role needs the role-editing permission.
                </Typography>
              )}
            </Stack>
        )}
      />
    </Box>
  );
}

export default OrgChartJobSection;
