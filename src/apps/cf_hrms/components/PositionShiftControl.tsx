import { useState } from 'react';
import { Box, Button, ListItemText, Menu, MenuItem } from '@mui/material';
import CheckRounded from '@mui/icons-material/CheckRounded';
import { useToast } from '@shared/ui';
import { useCan } from '../access/can';
import { positionsApi, type PositionShift } from '../api/positions';
import { shiftsApi } from '../api/shifts';
import { shiftWord } from './usePositionCard';

/**
 * A position's shift, with "Change shift" beside it — on every screen that
 * shows one position: the org chart panel (filled or vacant), the position
 * page, the Departments side sheet.
 *
 * A shift is a property of the POSITION (General, Day and Night are shift
 * records), so this is a position update with `defaultShiftId`. The server also
 * moves the shift of whoever is in the position; the menu says so when someone
 * is. The caller refreshes whatever shows the shift (`onChanged`).
 */

// The company's shifts, read once per page load: every control offers the same list.
const SHIFT_ORDER: Record<string, number> = { G: 0, D: 1, N: 2 };
/** A shift as the menu lists it: its name, and its days and hours so two shifts can be told apart. */
interface ShiftChoice { id: number; code?: string | null; name: string; status?: string | null; summary?: string | null }
let shiftsOnce: Promise<ShiftChoice[]> | null = null;
function loadShifts(fromTimeArea: boolean): Promise<ShiftChoice[]> {
  if (!shiftsOnce) {
    // The shifts themselves carry the summary line; the position options are the fallback
    // (names only) for a server that does not have it.
    // The Shifts screen's list carries the summary line, but it is the time area's; without its view right ask the position options only.
    shiftsOnce = (fromTimeArea ? shiftsApi.list() : Promise.reject(new Error('no time access')))
      .then((list): ShiftChoice[] => list)
      .catch(() => positionsApi.options().then((o): ShiftChoice[] => o.shifts))
      .then((list) =>
        list
          .filter((s) => !s.status || s.status === 'ACTIVE')
          // General, Day, Night first — the order the chart lists a card's rows in.
          .sort((a, b) => (SHIFT_ORDER[a.code ?? ''] ?? 3) - (SHIFT_ORDER[b.code ?? ''] ?? 3) || a.name.localeCompare(b.name)),
      )
      .catch((e) => {
        shiftsOnce = null;
        throw e;
      });
  }
  return shiftsOnce;
}

export function PositionShiftControl({
  positionId,
  shift,
  occupantName,
  onChanged,
  showName = true,
}: {
  positionId: number;
  /** The position's shift now. `id` may be missing on an older payload; the name is still shown. */
  shift: { id?: number | null; code?: string | null; name?: string | null; summary?: string | null } | null;
  /** The person in the position, if any — their shift moves with it, and the menu says so. */
  occupantName?: string | null;
  onChanged: (shift: PositionShift) => void;
  /** False where the caller already prints the shift and wants only the button. */
  showName?: boolean;
}) {
  const can = useCan();
  const toast = useToast();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [shifts, setShifts] = useState<ShiftChoice[] | null>(null);
  const [busy, setBusy] = useState(false);

  const open = (el: HTMLElement) => {
    setAnchor(el);
    loadShifts(can.time.view)
      .then(setShifts)
      .catch((e) => {
        setAnchor(null);
        toast.error(e instanceof Error ? e.message : 'The shifts could not be loaded.');
      });
  };

  const pick = async (s: ShiftChoice) => {
    setAnchor(null);
    if (s.id === shift?.id) return;
    setBusy(true);
    try {
      await positionsApi.update(positionId, { defaultShiftId: s.id });
      toast.success(
        occupantName
          ? `This position is now on ${shiftWord(s.name)}; ${occupantName} moves with it.`
          : `This position is now on ${shiftWord(s.name)}.`,
      );
      onChanged({ id: s.id, code: s.code ?? null, name: s.name, summary: s.summary ?? null });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The shift could not be changed.');
    } finally {
      setBusy(false);
    }
  };

  const name = shiftWord(shift?.name) || '—';
  return (
    <Box
      component="span"
      data-shiftcontrol={positionId}
      sx={{ display: 'inline-flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 0.75 }}
    >
      {showName && <span>{name}</span>}
      {can.positions.edit && (
        <>
          <Button
            size="small"
            variant="text"
            disabled={busy}
            aria-haspopup="menu"
            aria-label={`Change shift. Now ${name}.`}
            onClick={(e) => open(e.currentTarget)}
            sx={{ minWidth: 0, px: 0.5, py: 0, fontSize: 12.5, lineHeight: 1.5, textTransform: 'none' }}
          >
            {busy ? 'Changing…' : 'Change shift'}
          </Button>
          <Menu anchorEl={anchor} open={!!anchor && !!shifts} onClose={() => setAnchor(null)}>
            {occupantName && (
              <Box sx={{ px: 2, pb: 0.75, maxWidth: 260, fontSize: 12.5, color: 'var(--c-text-2)', lineHeight: 1.45 }}>
                {occupantName} is in this position and moves to the shift you pick.
              </Box>
            )}
            {(shifts ?? []).map((s) => (
              <MenuItem key={s.id} selected={s.id === shift?.id} onClick={() => void pick(s)} dense>
                <ListItemText
                  primary={shiftWord(s.name)}
                  secondary={s.summary || undefined}
                  slotProps={{ secondary: { sx: { fontSize: 12, color: 'var(--c-text-2)' } } }}
                />
                {s.id === shift?.id && <CheckRounded fontSize="small" sx={{ ml: 1.5, color: 'var(--c-text-2)' }} />}
              </MenuItem>
            ))}
          </Menu>
        </>
      )}
      {/* Which days, from when to when — under the name, wherever a position's shift is shown. */}
      {showName && shift?.summary && (
        <Box component="span" data-shiftsummary="" sx={{ flexBasis: '100%', fontSize: 12.5, color: 'var(--c-text-2)', fontWeight: 400 }}>
          {shift.summary}
        </Box>
      )}
    </Box>
  );
}

export default PositionShiftControl;
