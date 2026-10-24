import { useEffect, useMemo, useState } from 'react';
import { Autocomplete, Box, Button, Snackbar, TextField, Typography } from '@mui/material';
import { ConfirmDialog, FormDialog } from '@shared/ui';
import { orgApi, type Department, type MoveCheck } from '../api/organisation';
import { descendantIds } from './OrgData';
import { unitLabel } from './orgUnits';

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

/** A move the screen is asking about: the unit, where to, and (between siblings) the place. */
export interface PendingMove {
  unitId: number;
  parentId: number | null;
  sortOrder?: number;
}

export function MoveConfirm({ move, onClose, onConfirm }: {
  move: PendingMove | null;
  onClose: () => void;
  onConfirm: (move: PendingMove) => Promise<void>;
}) {
  const [check, setCheck] = useState<MoveCheck | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    setCheck(null);
    setProblem(null);
    if (!move) return undefined;
    let live = true;
    orgApi.departments.moveCheck(move.unitId, move.parentId)
      .then((c) => { if (live) setCheck(c); })
      .catch((e: { message?: string; problems?: string[] }) => { if (live) setProblem(e?.problems?.[0] || e?.message || 'Could not check that move.'); });
    return () => { live = false; };
  }, [move]);
  const refused = check && !check.allowed ? check.problem : problem;
  return (
    <ConfirmDialog
      open={!!move}
      title="Move this org unit?"
      body={
        <Box data-move-confirm="">
          {check ? <Typography sx={{ fontSize: 14, color: 'var(--c-text)' }}>{check.sentence}.</Typography> : !refused && <Typography sx={{ fontSize: 14 }}>Checking…</Typography>}
          {refused && <Typography role="alert" sx={{ fontSize: 13.5, color: 'var(--c-danger-600)', mt: check ? 1 : 0 }}>{refused}</Typography>}
          {check?.allowed && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mt: 1 }}>You can undo it right after.</Typography>}
        </Box>
      }
      confirmLabel="Move"
      onConfirm={async () => {
        if (!move || !check?.allowed) throw new Error(refused || 'This move cannot be made.');
        await onConfirm(move);
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
