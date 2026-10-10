import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Typography } from '@mui/material';
import PersonAddAltRounded from '@mui/icons-material/PersonAddAltRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import { errorMessage, useCompanySlug, useIsPermitted, useToast } from '@shared/ui';
import { hiringApi, openHiringIdOf, type HiringRef } from '../api/hiring';

/**
 * "Hire a new person" for a VACANT position — the one door into hiring.
 *
 * A position gets a person in one of two ways, and they are kept apart: moving
 * someone already employed into it (an assignment), or hiring. Hiring is a
 * workflow of its own — job description, offer letter, appointment letter, and
 * only then an employee code and an employee — so nothing on a position screen
 * creates an employee or types an employee code.
 *
 * Every screen that offers hiring goes through this component (the org chart
 * panel's vacant position, the position page, the Departments side sheet). It
 * does one of two things and then goes to the hiring's own screen:
 *
 *   no open hiring   "Hire a new person" starts one (`POST /positions/:id/hiring`).
 *   an open hiring   "Continue hiring", with the status line beside it.
 *
 * ONE OPEN HIRING PER POSITION is the server's rule. A caller that knows about
 * the open one passes `hiring`; one that does not still ends up in the right
 * place, because starting a second is refused with 409 `HIRING_OPEN` naming the
 * open one, and this goes there instead of showing the refusal.
 */
export function HiringEntry({
  positionId,
  positionCode,
  roleTitle,
  onChanged,
  hiring,
}: {
  positionId: number;
  positionCode: string | null;
  roleTitle: string | null;
  /** Called once a hiring has been started for the position, so the screen behind can reload. */
  onChanged: () => void;
  /** The open hiring on this position, where the call site already has it. */
  hiring?: HiringRef | null;
}) {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const can = useIsPermitted();
  const canStart = can('cf_hrms_people_manage');
  const canRead = can('cf_hrms_people_view');
  const [busy, setBusy] = useState(false);

  const open = (id: number) => navigate(`/${company}/cf_hrms/hiring/${id}`);
  const what = [roleTitle, positionCode].filter(Boolean).join(' · ');

  const start = async () => {
    setBusy(true);
    try {
      const { hiring: started } = await hiringApi.start(positionId);
      onChanged();
      open(started.id);
    } catch (e) {
      // Someone started one meanwhile: go to it rather than report a refusal.
      let existing = openHiringIdOf(e);
      if (existing == null && (e as { code?: string })?.code === 'HIRING_OPEN') {
        existing = await hiringApi
          .list({ status: 'open', positionId })
          .then((r) => r.hirings[0]?.id ?? null)
          .catch(() => null);
      }
      if (existing != null) {
        onChanged();
        open(existing);
        return;
      }
      toast.error(errorMessage(e, 'Hiring could not be started for this position.'));
    } finally {
      setBusy(false);
    }
  };

  if (hiring) {
    return (
      <Box
        data-hiringentry={positionId}
        sx={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 1, rowGap: 0.5, minWidth: 0 }}
      >
        <Button
          size="small"
          variant="contained"
          endIcon={<ArrowForwardRounded />}
          disabled={!canRead}
          onClick={() => open(hiring.id)}
          aria-label={`Continue hiring${what ? ` for ${what}` : ''}`}
        >
          Continue hiring
        </Button>
        <Typography data-hiringstatus="" sx={{ fontSize: 12.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>
          {hiring.statusLine}
        </Typography>
      </Box>
    );
  }

  if (!canStart) {
    return (
      <Typography data-hiringentry={positionId} sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
        Hiring needs the permission to manage people.
      </Typography>
    );
  }

  return (
    <Button
      size="small"
      variant="outlined"
      startIcon={<PersonAddAltRounded />}
      data-hiringentry={positionId}
      disabled={busy}
      onClick={() => void start()}
      aria-label={`Hire a new person${what ? ` for ${what}` : ''}`}
    >
      {busy ? 'Starting…' : 'Hire a new person'}
    </Button>
  );
}

export default HiringEntry;
