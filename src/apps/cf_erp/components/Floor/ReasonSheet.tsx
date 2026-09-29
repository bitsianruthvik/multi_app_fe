import { useState } from 'react';
import { TextField } from '@mui/material';
import type { FloorReason } from '../../api/types';
import { BigButton, Choice, ChoiceRow, Sheet } from './floorUi';

/**
 * Pick why the machine stood still. One tap on a reason finishes it — except a
 * reason that needs a note ("Other"), which asks for a few words first.
 * Reasons belong to the machine's time, not to a person.
 */
export function ReasonSheet({ open, reasons, initial, title, onClose, onPick }: {
  open: boolean; reasons: FloorReason[]; initial: FloorReason | null; title: string; onClose: () => void; onPick: (r: FloorReason, note: string) => void;
}) {
  const [chosen, setChosen] = useState<FloorReason | null>(null);
  const [note, setNote] = useState('');
  const [seen, setSeen] = useState(false);
  // A fresh open starts from the reason the caller chose (or none).
  if (open && !seen) { setSeen(true); setChosen(initial); setNote(''); }
  if (!open && seen) setSeen(false);
  const needsNote = !!chosen?.needsNote;
  return (
    <Sheet open={open} title={title} onClose={onClose}
      footer={needsNote ? <>
        <BigButton variant="outlined" onClick={() => setChosen(null)}>Back</BigButton>
        <BigButton sx={{ flex: 1 }} disabled={!note.trim()} onClick={() => chosen && onPick(chosen, note.trim())}>Save</BigButton>
      </> : undefined}>
      {needsNote && chosen ? (
        <TextField autoFocus multiline minRows={2} label={`${chosen.label} — what happened?`} value={note} onChange={(e) => setNote(e.target.value)} inputProps={{ style: { fontSize: 18 } }} />
      ) : (
        <ChoiceRow>
          {reasons.map((r) => <Choice key={r.id} onClick={() => (r.needsNote ? setChosen(r) : onPick(r, ''))}>{r.label}</Choice>)}
        </ChoiceRow>
      )}
    </Sheet>
  );
}
