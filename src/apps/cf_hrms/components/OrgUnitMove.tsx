import { useEffect, useMemo, useState } from 'react';
import { Autocomplete, Box, Button, FormControlLabel, Radio, RadioGroup, Snackbar, TextField, Typography } from '@mui/material';
import { ConfirmDialog, FormDialog } from '@shared/ui';
import { orgApi, type Department, type MoveCheck } from '../api/organisation';
import { descendantIds } from './OrgData';
import { unitLabel } from './orgUnits';
import { posLine } from './unitReportingText';
import { switchChoiceText, type PendingMove } from './orgMove';

/**
 * Moving an org unit (CF_HRMS_HIRING_SPEC.md §34.3), the pieces a screen puts together:
 *
 *   <MoveToDialog>     "Move to…" — the keyboard / touch way: pick where it goes. The unit
 *                      itself and everything under it are not offered; "At the top (no parent)" is.
 *   <MoveConfirm>      the confirm, in the server's words (GET …/move-check): "Move Lamination
 *                      (Section) from Production to Operations — 6 positions and 2 units under it
 *                      move with it". A refused move (inside itself) says why and offers no button.
 *   <UndoBar>          "Moved. Undo" for a few seconds after a move or a reorder.
 *
 * The server does the move (PUT /organisation/departments/:id { parentId, sortOrder? }) and
 * refuses a cycle or another company's unit whatever the screen offered.
 */

const TOP = { id: 0, label: 'At the top (no parent)' };

export function MoveToDialog({ unit, rows, onClose, onPick }: {
  unit: Department | null;
  rows: Department[];
  onClose: () => void;
  /** The chosen parent: an id, or null for the top level. */
  onPick: (parentId: number | null) => void;
}) {
  const [choice, setChoice] = useState<{ id: number; label: string } | null>(null);
  useEffect(() => { setChoice(null); }, [unit]);
  const options = useMemo(() => {
    if (!unit) return [];
    const inside = descendantIds(rows, unit.id);
    return [
      ...(unit.parentId != null ? [TOP] : []),
      ...rows.filter((r) => !inside.has(r.id) && r.id !== unit.parentId).map((r) => ({ id: r.id, label: unitLabel(r.name, r.type), depth: r.depth })),
    ];
  }, [unit, rows]);
  return (
    <FormDialog
      open={!!unit}
      title={unit ? `Move ${unitLabel(unit.name, unit.type)}` : 'Move'}
      subtitle="Choose where it goes. Everything under it moves with it."
      onClose={onClose}
      submitLabel="Next"
      submitDisabled={!choice}
      onSubmit={async () => { if (choice) onPick(choice.id === 0 ? null : choice.id); }}
    >
      <Autocomplete
        size="small"
        openOnFocus
        options={options}
        value={choice}
        onChange={(_, v) => setChoice(v)}
        getOptionLabel={(o) => o.label}
        getOptionKey={(o) => o.id}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        renderOption={(props, o) => {
          const { key, ...rest } = props as React.HTMLAttributes<HTMLLIElement> & { key: string };
          const depth = (o as { depth?: number }).depth ?? 0;
          return <li key={key} {...rest} style={{ paddingLeft: 12 + depth * 14, fontStyle: o.id === 0 ? 'italic' : undefined }}>{o.label}</li>;
        }}
        renderInput={(p) => <TextField {...p} autoFocus label="Move it under" placeholder="Search org units" />}
      />
      {unit && (
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mt: 1 }}>
          It sits under {unit.parentId != null ? rows.find((r) => r.id === unit.parentId)?.name ?? 'another unit' : 'nothing (the top level)'} now. Units under it are not offered: a unit cannot sit inside itself.
        </Typography>
      )}
    </FormDialog>
  );
}

export type { PendingMove };

/**
 * The confirm. The move it SHOWS is the move it MAKES: the server's check is kept together with
 * the exact move it was made for (`checked`), the words come from that pair, and "Move" sends
 * that pair's move — never whatever `move` the page holds by the time the button is pressed
 * (browser check 2026-10-27: the dialog said "to BFL" and the unit landed under Slitting, a later
 * drop having replaced the pending move under the open dialog).
 */
export function MoveConfirm({ move, onClose, onConfirm }: {
  move: PendingMove | null;
  onClose: () => void;
  onConfirm: (move: PendingMove) => Promise<void>;
}) {
  const [checked, setChecked] = useState<{ move: PendingMove; check: MoveCheck } | null>(null);
  const [problem, setProblem] = useState<{ move: PendingMove; text: string } | null>(null);
  const [choice, setChoice] = useState<'KEEP' | 'SWITCH' | null>(null);
  useEffect(() => {
    setChecked(null);
    setProblem(null);
    setChoice(null);
    if (!move) return undefined;
    let live = true;
    orgApi.departments.moveCheck(move.unitId, move.parentId)
      .then((c) => { if (live) setChecked({ move, check: c }); })
      .catch((e: { message?: string; problems?: string[] }) => { if (live) setProblem({ move, text: e?.problems?.[0] || e?.message || 'Could not check that move.' }); });
    return () => { live = false; };
  }, [move]);
  // Only a check made for THIS move counts (a stale one from an earlier move is never shown or used).
  const check = checked && checked.move === move ? checked.check : null;
  const failed = problem && problem.move === move ? problem.text : null;
  const refused = check && !check.allowed ? check.problem : failed;
  const ri = check?.allowed ? check.reportsInto : undefined;
  const ask = !!ri?.ask;
  return (
    <ConfirmDialog
      open={!!move}
      title="Move this org unit?"
      body={
        <Box data-move-confirm="" data-move-unit={check ? checked?.move.unitId : undefined} data-move-to={check ? checked?.move.parentId ?? 'top' : undefined}>
          {check ? (
            <Typography sx={{ fontSize: 14, color: 'var(--c-text)' }}>
              {/[.?!]$/.test(check.sentence.trim()) ? check.sentence : `${check.sentence}.`}
            </Typography>
          ) : (
            !refused && <Typography sx={{ fontSize: 14 }}>Checking…</Typography>
          )}
          {refused && <Typography role="alert" sx={{ fontSize: 13.5, color: 'var(--c-danger-600)', mt: check ? 1 : 0 }}>{refused}</Typography>}
          {ask && ri && (
            <Box data-move-choice="" sx={{ mt: 1.25 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>Its Reports into was chosen by hand</Typography>
              <RadioGroup value={choice ?? ''} onChange={(e) => setChoice(e.target.value as 'KEEP' | 'SWITCH')}>
                <FormControlLabel
                  value="KEEP"
                  control={<Radio size="small" />}
                  label={<Typography sx={{ fontSize: 13.5 }}>Keep {ri.current ? posLine(ri.current) : 'the chosen position'}</Typography>}
                />
                <FormControlLabel
                  value="SWITCH"
                  control={<Radio size="small" />}
                  label={<Typography sx={{ fontSize: 13.5 }}>{switchChoiceText(ri)}</Typography>}
                />
              </RadioGroup>
            </Box>
          )}
          {check?.allowed && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mt: 1 }}>You can undo it right after.</Typography>}
        </Box>
      }
      confirmLabel="Move"
      onConfirm={async () => {
        if (!checked || !check?.allowed) throw new Error(refused || 'This move cannot be made.');
        if (ask && !choice) throw new Error('Choose whether it keeps its Reports into or switches to the default.');
        // Exactly the move the words above were written for.
        await onConfirm(ask && choice ? { ...checked.move, reportsInto: choice } : checked.move);
      }}
      onClose={onClose}
    />
  );
}

/** "Moved. Undo" — a few seconds after a move or a reorder. */
export function UndoBar({ text, onUndo, onClose }: { text: string | null; onUndo: () => Promise<void> | void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Snackbar
      open={!!text}
      autoHideDuration={8000}
      onClose={(_, reason) => { if (reason !== 'clickaway') onClose(); }}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      message={<span data-undo-bar="">{text}</span>}
      action={
        <Button
          size="small"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try { await onUndo(); } finally { setBusy(false); onClose(); }
          }}
          sx={{ color: 'var(--c-primary-200)', fontWeight: 600 }}
        >
          Undo
        </Button>
      }
    />
  );
}
