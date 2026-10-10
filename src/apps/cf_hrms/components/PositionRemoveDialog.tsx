import { useEffect, useState, type ReactNode } from 'react';
import { Box, FormControlLabel, Radio, RadioGroup, Typography } from '@mui/material';
import { ConfirmDialog, Mono, useToast } from '@shared/ui';
import type { PositionRemovalImpact, RemovalResult } from '../api/positions';
import { positionsApi } from '../api/positions';

/**
 * Closing or deleting a position — one dialog, three outcomes, none of them silent.
 *
 * WHY A DIALOG WITH A CHOICE AND NOT A PLAIN "ARE YOU SURE". Deleting a seat used
 * to quietly cut loose everyone who reported to it: delete "Production Manager"
 * and its ten reports became ten new tops of the chart, with no warning, no
 * count and no choice. The client's own chart tool has two buttons for this —
 * "Delete this position only" and "Delete with its team (N)" — and this is that,
 * plus the option the client's tool does not have and an organisation usually
 * wants: CLOSE the seat, which keeps its history.
 *
 *   - CLOSE is the first choice and the default. It is reversible (reopen the
 *     seat) and keeps history, so it is the one a person gets by pressing Enter.
 *   - DELETING is a deliberate second step: choosing it turns the button red and
 *     puts the count of what it destroys in the button itself, because a
 *     destructive action whose label does not say how much it destroys is the
 *     thing this dialog exists to fix.
 *   - A choice the server will refuse is shown disabled WITH the server's own
 *     reason, so nobody finds out by pressing it. (The server checks again when
 *     the request arrives and sends `expect`-ed numbers back if the dialog went
 *     stale; see IMPACT_CHANGED below.)
 *
 * The team moves UP to the seat's manager — the PRIMARY_MANAGER line, the one the
 * chart draws its tree on — whenever the seat goes without it. A seat with no
 * open position above it has nowhere to send them, so close and delete-alone are
 * refused for it rather than creating a row of new tops.
 *
 * Built on the kit's ConfirmDialog (it echoes the position back in mono and
 * shows a refusal in place); the choice list lives in its body. Opened through
 * usePositionRemoval, which reads the impact first — this component is given an
 * impact that already exists and never opens half-empty.
 */

type Choice = 'CLOSE' | 'DELETE_ONLY' | 'DELETE_TEAM';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

interface ChoiceView {
  value: Choice;
  label: string;
  description: string;
  allowed: boolean;
  reason: string | null;
  code: string | null;
  destructive: boolean;
}

function choicesFor(impact: PositionRemovalImpact): ChoiceView[] {
  const { outcomes: o, directReports, team, manager, ownAssignments, otherLines, position } = impact;
  const direct = directReports.length;
  // Reports stay with the role card when another of its positions remains
  // (they move to that sibling); only the card's last position sends them up.
  const seatName = (s: { title: string; positionCode: string | null }) => (s.positionCode ? `${s.title} (${s.positionCode})` : s.title);
  const siblings = impact.movesReportsTo === 'CARD' ? (impact.moveTargets ?? []) : [];
  const moves = (verb: string) => {
    if (direct === 0) return '';
    const who = ` Its ${plural(direct, 'direct report')} ${direct === 1 ? `${verb}s` : verb}`;
    return siblings.length
      ? `${who} to ${siblings.map(seatName).join(' and ')}, the other position${siblings.length === 1 ? '' : 's'} of this role here.`
      : `${who} up to ${manager?.title ?? 'its manager'}.`;
  };

  const list: ChoiceView[] = [];

  if (position.status !== 'CLOSED') {
    let d = 'Keeps its history. The chart stops showing it.';
    d += moves('move');
    if (ownAssignments > 0) {
      d += ` The ${plural(ownAssignments, 'work assignment')} stay${ownAssignments === 1 ? 's' : ''}, but the chart no longer shows the position.`;
    }
    list.push({ value: 'CLOSE', label: 'Close this position', description: d, allowed: o.close.allowed, reason: o.close.reason, code: o.close.code, destructive: false });
  }

  let d = 'Removes the position and its history.';
  d += moves('move');
  if (otherLines.thisOnly > 0) d += ` ${plural(otherLines.thisOnly, 'other reporting line')} to or from it go with it.`;
  list.push({
    value: 'DELETE_ONLY',
    label: direct > 0 ? 'Delete this position only' : 'Delete this position',
    description: d,
    allowed: o.deleteOnly.allowed,
    reason: o.deleteOnly.reason,
    code: o.deleteOnly.code,
    destructive: true,
  });

  if (team.count > 0) {
    let t = `Removes this position and the ${team.count} under it, with their history.`;
    if (team.closed > 0) t += ` ${team.closed} of them ${team.closed === 1 ? 'is' : 'are'} already closed.`;
    if (otherLines.withTeam > 0) t += ` ${plural(otherLines.withTeam, 'other reporting line')} to or from them go too.`;
    list.push({
      // The number in the label is what gets deleted, the seat included — the same count the client's chart tool prints.
      value: 'DELETE_TEAM',
      label: `Delete with its team (${team.total})`,
      description: t,
      allowed: o.deleteWithTeam.allowed,
      reason: o.deleteWithTeam.reason,
      code: o.deleteWithTeam.code,
      destructive: true,
    });
  }
  return list;
}

const firstAllowed = (impact: PositionRemovalImpact): Choice | null =>
  choicesFor(impact).find((c) => c.allowed)?.value ?? null;

function ChoiceRow({
  c, selected, blockers,
}: {
  c: ChoiceView;
  selected: boolean;
  blockers: PositionRemovalImpact['team']['blockers'];
}) {
  const edge = selected ? (c.destructive ? 'var(--c-danger-600)' : 'var(--c-primary-500)') : 'var(--c-border)';
  return (
    <FormControlLabel
      value={c.value}
      disabled={!c.allowed}
      control={<Radio size="small" color={c.destructive ? 'error' : 'primary'} sx={{ mt: '-1px', mr: 0.5 }} />}
      sx={{
        alignItems: 'flex-start',
        m: 0,
        mb: 1,
        py: 1,
        pl: 1,
        pr: 1.5,
        border: '1px solid',
        borderColor: edge,
        borderRadius: 'var(--r-sm)',
        background: selected ? 'var(--c-surface-2)' : 'transparent',
        '&.Mui-disabled': { cursor: 'default' },
      }}
      slotProps={{ typography: { component: 'div', sx: { width: '100%', minWidth: 0 } } }}
      label={
        <Box>
          <Typography sx={{ fontSize: 14, fontWeight: 600, color: c.allowed ? 'var(--c-text)' : 'var(--c-text-3)' }}>
            {c.label}
          </Typography>
          {c.allowed ? (
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', lineHeight: 1.45, mt: 0.25 }}>{c.description}</Typography>
          ) : (
            <Box
              sx={{
                mt: 0.75,
                p: 1,
                fontSize: 13,
                lineHeight: 1.45,
                color: 'var(--c-danger-800)',
                background: 'var(--c-danger-50)',
                border: '1px solid var(--c-danger-200)',
                borderRadius: 'var(--r-sm)',
              }}
            >
              {c.reason}
              {c.code === 'TEAM_IN_USE' && blockers.length > 0 && (
                <Box
                  component="ul"
                  aria-label="Positions with people assigned"
                  sx={{ m: 0, mt: 0.75, pl: 2, maxHeight: 132, overflowY: 'auto', color: 'var(--c-text-2)' }}
                >
                  {blockers.map((b) => (
                    <li key={b.id}>
                      {b.title} {b.positionCode && <Mono sx={{ fontSize: 12 }}>{b.positionCode}</Mono>} — {plural(b.assignments, 'assignment')}
                    </li>
                  ))}
                </Box>
              )}
            </Box>
          )}
        </Box>
      }
    />
  );
}

export function PositionRemoveDialog({
  impact, onReload, onClose, onDone,
}: {
  impact: PositionRemovalImpact;
  onReload: () => void;
  onClose: () => void;
  onDone: (result: RemovalResult) => void;
}) {
  const toast = useToast();
  const { position, directReports, team, outcomes: o } = impact;
  const direct = directReports.length;
  const choices = choicesFor(impact);
  const [choice, setChoice] = useState<Choice | null>(() => firstAllowed(impact));

  // After a reload (the numbers changed under the dialog) the selected choice may
  // no longer be allowed; fall back to the first one that is.
  useEffect(() => {
    setChoice((cur) => (cur && choicesFor(impact).find((c) => c.value === cur)?.allowed ? cur : firstAllowed(impact)));
  }, [impact]);

  const destructive = choice === 'DELETE_ONLY' || choice === 'DELETE_TEAM';
  const nothingAllowed = choice === null;

  const confirmLabel = nothingAllowed
    ? 'OK'
    : choice === 'CLOSE'
      ? 'Close position'
      : choice === 'DELETE_TEAM'
        ? `Delete ${team.total} positions`
        : direct > 0 ? `Delete, move ${direct} up` : 'Delete position';

  const confirm = async () => {
    if (!choice) return; // nothing was allowed: OK just closes the dialog
    const id = position.id;
    let result: RemovalResult;
    try {
      if (choice === 'CLOSE') result = await positionsApi.close(id, o.close.movesReports);
      else if (choice === 'DELETE_TEAM') result = await positionsApi.remove(id, { mode: 'WITH_TEAM', expect: o.deleteWithTeam.deletes });
      else result = await positionsApi.remove(id, { mode: 'THIS_ONLY', expect: o.deleteOnly.movesReports });
    } catch (e) {
      // The server refused (or the numbers moved while the dialog was open):
      // show its words in place, and re-read the impact so the choices and the
      // counts in the labels match what is true now.
      if ((e as { status?: number })?.status === 409) onReload();
      throw e;
    }
    const moved = result.movedReports.length;
    const target = result.movedWithinCard && result.movedToPositions?.length
      ? result.movedToPositions.map((s) => (s.positionCode ? `${s.title} (${s.positionCode})` : s.title)).join(' and ')
      : (result.movedTo?.title ?? null);
    const where = target ? ` ${plural(moved, 'direct report')} now ${moved === 1 ? 'reports' : 'report'} to ${target}.` : '';
    toast.success(
      choice === 'CLOSE'
        ? `Closed ${position.title}.${where}`
        : choice === 'DELETE_TEAM'
          ? `Deleted ${plural(result.deletedCount ?? team.total, 'position')}.`
          : `Deleted ${position.title}.${where}`,
    );
    onDone(result);
  };

  const body: ReactNode = (
    <Box>
      <Typography sx={{ fontSize: 14, color: 'var(--c-text-2)', mb: 1.5 }}>
        {direct > 0
          ? `${plural(direct, 'position')} ${direct === 1 ? 'reports' : 'report'} to it directly${team.count > direct ? `; ${team.count} sit under it in all` : ''}.`
          : 'Nobody reports to it.'}
        {impact.ownAssignments > 0 && ` ${plural(impact.ownAssignments, 'work assignment')} ${impact.ownAssignments === 1 ? 'is' : 'are'} held in this position.`}
      </Typography>
      <RadioGroup value={choice ?? ''} onChange={(e) => setChoice(e.target.value as Choice)} aria-label="What to do with this position">
        {choices.map((c) => (
          <ChoiceRow key={c.value} c={c} selected={choice === c.value} blockers={team.blockers} />
        ))}
      </RadioGroup>
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mt: 0.5 }}>
        A closed position can be reopened. A deleted one cannot.
      </Typography>
    </Box>
  );

  return (
    <ConfirmDialog
      open
      danger={destructive}
      title={nothingAllowed ? 'This position cannot be closed or deleted yet' : 'Close or delete this position?'}
      entityName={position.positionCode ? `${position.positionCode} · ${position.title}` : position.title}
      body={body}
      confirmLabel={confirmLabel}
      onConfirm={confirm}
      onClose={onClose}
    />
  );
}
