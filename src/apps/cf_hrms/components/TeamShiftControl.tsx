import { useState } from 'react';
import { Box, Button, ListItemText, Menu, MenuItem } from '@mui/material';
import CheckRounded from '@mui/icons-material/CheckRounded';
import { errorMessage, useToast } from '@shared/ui';
import { getTeamShifts, setTeamPositionShift, type TeamShift } from '../api/self';

/**
 * "Change shift" for a position BELOW the signed-in person, on their own chart
 * (CF_HRMS_HIRING_SPEC.md §7.2–7.3).
 *
 * The HR control (`PositionShiftControl`) goes through the organisation routes,
 * which an employee login is refused. This one goes through
 * `/user/me/team/…`, where the server decides whether the position is in the
 * caller's team and answers 403 `NOT_YOUR_TEAM`, in a plain sentence, when it
 * is not. That sentence is shown as it comes.
 *
 * It is only ever drawn for a position the chart marked `canEdit`.
 */
export function TeamShiftControl({
  positionId,
  shift,
  shiftName,
  occupantName,
  onChanged,
}: {
  positionId: number;
  shift: { id?: number | null; code: string | null; name: string | null; summary?: string | null } | null;
  /** The shift's name as the card already prints it. */
  shiftName: string;
  /** The person in the position — their shift moves with it, and the menu says so. */
  occupantName: string | null;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [shifts, setShifts] = useState<TeamShift[] | null>(null);
  const [busy, setBusy] = useState(false);

  const open = (el: HTMLElement) => {
    setAnchor(el);
    getTeamShifts()
      .then(setShifts)
      .catch((e) => {
        setAnchor(null);
        toast.error(errorMessage(e, 'The shifts could not be loaded.'));
      });
  };

  const isCurrent = (s: TeamShift) => (shift?.id != null ? s.id === shift.id : !!shift?.code && s.code === shift.code);

  const pick = async (s: TeamShift) => {
    setAnchor(null);
    if (isCurrent(s)) return;
    setBusy(true);
    try {
      await setTeamPositionShift(positionId, s.id);
      toast.success(occupantName ? `${occupantName} is now on the ${s.name} shift.` : `This position is now on the ${s.name} shift.`);
      onChanged();
    } catch (e) {
      // "That position is not in your team." — the server's sentence.
      toast.error(errorMessage(e, 'The shift could not be changed.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box component="span" data-teamshift={positionId} sx={{ display: 'inline-flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 0.75 }}>
      <span>{shiftName || '—'}</span>
      <Button
        size="small"
        variant="text"
        disabled={busy}
        aria-haspopup="menu"
        aria-label={`Change shift. Now ${shiftName || 'not set'}.`}
        onClick={(e) => open(e.currentTarget)}
        sx={{ minWidth: 0, px: 0.5, py: 0, fontSize: 12.5, lineHeight: 1.5, textTransform: 'none' }}
      >
        {busy ? 'Changing…' : 'Change shift'}
      </Button>
      {shift?.summary && (
        <Box component="span" sx={{ flexBasis: '100%', fontSize: 12.5, color: 'var(--c-text-2)' }}>
          {shift.summary}
        </Box>
      )}
      <Menu anchorEl={anchor} open={!!anchor && !!shifts} onClose={() => setAnchor(null)}>
        {occupantName && (
          <Box sx={{ px: 2, pb: 0.75, maxWidth: 260, fontSize: 12.5, color: 'var(--c-text-2)', lineHeight: 1.45 }}>
            {occupantName} is in this position and moves to the shift you pick.
          </Box>
        )}
        {(shifts ?? []).map((s) => (
          <MenuItem key={s.id} selected={isCurrent(s)} onClick={() => void pick(s)} dense>
            <ListItemText
              primary={s.name}
              secondary={s.summary || undefined}
              slotProps={{ secondary: { sx: { fontSize: 12, color: 'var(--c-text-2)' } } }}
            />
            {isCurrent(s) && <CheckRounded fontSize="small" sx={{ ml: 1.5, color: 'var(--c-text-2)' }} />}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
}

export default TeamShiftControl;
