import { useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import PersonAddAltRounded from '@mui/icons-material/PersonAddAltRounded';

/**
 * "Hire a new person" for a VACANT position — the one door into hiring.
 *
 * A position gets a person in one of two ways, and they are kept apart: moving
 * someone already employed into it (an assignment), or hiring. Hiring is a
 * workflow of its own — job description, offer letter, appointment letter, and
 * only then an employee code and an employee — so nothing on a position screen
 * creates an employee or types an employee code any more.
 *
 * THIS IS THE PLACEHOLDER for that workflow: the button, and a dialog saying
 * hiring starts here. Every screen that offers hiring goes through this
 * component (the org chart panel's vacant position, the position page, the
 * Departments side sheet), so the workflow replaces the inside of this file and
 * no call site changes.
 */
export function HiringEntry({
  positionId,
  positionCode,
  roleTitle,
  onChanged,
}: {
  positionId: number;
  positionCode: string | null;
  roleTitle: string | null;
  /** Called once hiring has changed the position (a person now holds it). Unused until the workflow exists. */
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  // Held for the workflow that replaces this dialog; nothing here changes the position yet.
  void onChanged;
  const what = [roleTitle, positionCode].filter(Boolean).join(' · ');
  return (
    <>
      <Button
        size="small"
        variant="outlined"
        startIcon={<PersonAddAltRounded />}
        data-hiringentry={positionId}
        onClick={() => setOpen(true)}
      >
        Hire a new person
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Hire for this position</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 14, lineHeight: 1.55 }}>
            Hiring for this position{what ? ` (${what})` : ''} starts here.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default HiringEntry;
