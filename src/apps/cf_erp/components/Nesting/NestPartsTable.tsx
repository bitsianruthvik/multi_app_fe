import { useMemo, useState } from 'react';
import { Autocomplete, Box, Button, TextField, Tooltip, Typography, createFilterOptions } from '@mui/material';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import type { NestCandidate, NestPartRow } from '../../api/nesting';
import { mm, needsPick, partHow, partName, type CutPieceName } from '../../lib/nesting';
import { Badge, CapsLabel, Mono } from '../ui';

/**
 * THE PARTS TABLE — where the matching of a nesting upload is read (2026-10-14).
 *
 * One row per DISTINCT part (a ProNest job: per part name; the DXFs together: per
 * size + mark + thickness): what the part is called, what was drawn, which cut piece
 * it went to and how. A part with no cut piece, or one that could be several, is
 * amber and asks for a choice; any match can be changed. The cut pieces to choose
 * from come in the order the server ranked them for that part — best fit first —
 * and are never re-sorted here. Only ONE picker is open at a time.
 */

/** Matched parts above this many are folded away; the rows that need a look always show. */
const MATCHED_SHOWN = 6;

/** What the table needs from the dialog. */
export interface PartSettle {
  busy: boolean;
  /** Has the user chosen a cut piece for this row (in the request that is sent)? */
  hasChoice: (job: string | null, row: NestPartRow) => boolean;
  /** Choose the cut piece (null takes the choice away). The dialog sends the preview again. */
  choose: (job: string | null, row: NestPartRow, cutPlateId: number | null) => void;
}

const sizeOf = (c: { thickness: number; width: number; length: number }) => `${mm(c.thickness)} × ${mm(c.width)} × ${mm(c.length)}`;

const filterCandidates = createFilterOptions<NestCandidate>({
  ignoreCase: true, trim: true,
  stringify: (c) => [c.code, c.name, c.grade, c.thickness, c.width, c.length, `${c.length}x${c.width}`, `${c.width}x${c.length}`, mm(c.length), mm(c.width)].filter((x) => x != null && x !== '').join(' '),
});

/** The searchable list of cut pieces for one part. It keeps the server's order; a piece that cannot be cut from this plate is muted, and still choosable (the server then says why in words). */
function PartPicker({ row, onPick, onCancel }: { row: NestPartRow; onPick: (c: NestCandidate) => void; onCancel: () => void }) {
  const name = partName(row);
  return (
    <Box data-testid="part-picker" sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.75, minWidth: 0 }}>
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
        Best fit first. The words say how the nested part compares with each cut piece.
      </Typography>
      <Autocomplete<NestCandidate>
        open disablePortal autoHighlight blurOnSelect size="small" options={row.candidates} value={null}
        filterOptions={filterCandidates} getOptionLabel={(c) => c.code} getOptionKey={(c) => c.cutPlateId}
        noOptionsText="No cut piece of this line matches what you typed."
        onChange={(_, c) => { if (c) onPick(c); }}
        onClose={(_, reason) => { if (reason === 'escape') onCancel(); }}
        // The list is part of the page, under the box, not floating over the rows below.
        slotProps={{
          popper: { sx: { position: 'static !important', transform: 'none !important', width: '100% !important', mt: 0.5 } },
          listbox: { sx: { maxHeight: 280 }, 'aria-label': `Cut pieces for ${name}, best fit first` },
          paper: { sx: { boxShadow: 'none', border: '1px solid var(--c-border)' } },
        }}
        renderInput={(params) => (
          <TextField {...params} autoFocus label={`Cut piece for ${name}`} placeholder="Type a code or a size, e.g. 6120"
            slotProps={{ inputLabel: { shrink: true } }} />
        )}
        renderOption={(props, c) => {
          const { key, ...rest } = props as typeof props & { key: string };
          return (
            <li key={key} {...rest} data-testid="part-option" data-code={c.code} data-possible={c.possible ? 'true' : 'false'}>
              <Box sx={{ minWidth: 0, color: c.possible ? 'inherit' : 'var(--c-text-3)' }}>
                <Box sx={{ fontSize: 13, overflowWrap: 'anywhere' }}>
                  <Mono>{c.code}</Mono>
                  {` · ${sizeOf(c)}${c.grade ? ` · ${c.grade}` : ''} · needs ${c.needed}`}
                </Box>
                <Box sx={{ fontSize: 12, color: c.possible ? 'var(--c-text-2)' : 'var(--c-text-3)', overflowWrap: 'anywhere' }}>{c.why}</Box>
              </Box>
            </li>
          );
        }}
      />
      <Box><Button size="small" onClick={onCancel}>Cancel</Button></Box>
    </Box>
  );
}

function PartRowLine({ row, job, settle, editing, onEdit, names }: {
  row: NestPartRow; job: string | null; settle: PartSettle; editing: boolean; onEdit: (open: boolean) => void; names?: (code: string) => CutPieceName;
}) {
  const name = partName(row);
  const m = row.matched;
  const pick = needsPick(row);
  const allowance = m?.allowanceMm ?? 0;
  const chose = settle.hasChoice(job, row);
  const cutPiece = m ? row.candidates.find((c) => c.cutPlateId === m.cutPlateId) : undefined;
  const shared = (row.matchedTo ?? []).length > 1 ? row.matchedTo ?? [] : [];
  const differs = m?.outlineDiffers;
  const cell = { py: 1, px: 1, verticalAlign: 'top', borderBottom: '1px solid var(--c-divider)', overflowWrap: 'anywhere', fontSize: 13 } as const;
  // A cut piece by its short name and part, the code on hover; a code that does not shorten is shown as it is, with its size.
  const piece = (code: string) => {
    const n = names?.(code);
    return n && n.short !== code
      ? <Tooltip title={n.title}><Box component="span" data-testid="cut-piece-name" data-code={code}>{n.short}{n.part && <Box component="span" sx={{ color: 'var(--c-text-2)' }}>{` · ${n.part}`}</Box>}</Box></Tooltip>
      : null;
  };
  return (
    <>
      <Box component="tr" data-testid="part-row" data-part={row.key} data-status={row.status} sx={{ background: pick ? 'var(--c-warning-50)' : 'transparent' }}>
        <Box component="td" sx={{ ...cell, fontWeight: 500 }}>
          {name}
          {row.partName == null && row.thickness != null && <Box component="span" sx={{ color: 'var(--c-text-2)', fontWeight: 400 }}>{` · ${mm(row.thickness)} mm`}</Box>}
        </Box>
        <Box component="td" sx={cell}>{`${mm(row.drawn?.[0])} × ${mm(row.drawn?.[1])}`}</Box>
        <Box component="td" sx={{ ...cell, textAlign: 'right' }}>{row.pieces}</Box>
        <Box component="td" data-testid="part-matched-to" sx={cell}>
          {shared.length > 0
            ? shared.map((x, i) => <span key={x.cutPlateId}>{i > 0 ? ', ' : ''}{piece(x.code) ?? <Mono>{x.code}</Mono>}{` ×${x.pieces}`}</span>)
            : m
              ? piece(m.code) ?? <><Mono>{m.code}</Mono>{cutPiece && <Box component="span" sx={{ color: 'var(--c-text-2)' }}>{` · ${mm(cutPiece.length)} × ${mm(cutPiece.width)}`}</Box>}</>
              : <Box component="span" sx={{ color: 'var(--c-warning-800)', fontWeight: 500 }}>Not matched</Box>}
          {allowance > 0 && (
            <Box component="span" data-testid="part-allowance-badge" sx={{ ml: 0.75 }}>
              <Badge family="warning" noIcon label={`+${allowance} mm`} />
            </Box>
          )}
        </Box>
        <Box component="td" sx={cell}>
          <Box data-testid="part-how" sx={{ color: pick ? 'var(--c-warning-800)' : 'inherit' }}>{partHow(row.status, m, shared)}</Box>
          {pick && row.open > 0 && row.open < row.pieces && (
            <Box data-testid="part-open" sx={{ fontSize: 12.5, color: 'var(--c-warning-800)' }}>{`${row.open} of ${row.pieces} pieces not matched`}</Box>
          )}
          {allowance > 0 && (
            <Box data-testid="part-allowance" sx={{ fontSize: 12.5, color: 'var(--c-warning-800)' }}>
              {`nested ${allowance} mm longer than the cut piece — taken as the cutting allowance`}
            </Box>
          )}
          {differs && allowance === 0 && (
            <Box data-testid="part-sizes" sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
              {`drawn ${mm(differs.drawn[0])} × ${mm(differs.drawn[1])}, the cut piece is ${mm(differs.cutPiece[0])} × ${mm(differs.cutPiece[1])}`}
            </Box>
          )}
        </Box>
        <Box component="td" sx={{ ...cell, textAlign: 'right' }}>
          {pick
            ? (
              <Button size="small" variant="contained" data-testid="part-choose" aria-label={`Choose cut piece for ${name}`} aria-expanded={editing}
                disabled={settle.busy} onClick={() => onEdit(!editing)}>
                Choose cut piece
              </Button>
            )
            : (
              <Button size="small" data-testid="part-change" aria-label={`Change the cut piece for ${name}`} aria-expanded={editing}
                disabled={settle.busy} onClick={() => onEdit(!editing)}>
                Change
              </Button>
            )}
          {chose && (
            <Button size="small" color="inherit" data-testid="part-undo" aria-label={`Undo your choice for ${name}`}
              disabled={settle.busy} onClick={() => { onEdit(false); settle.choose(job, row, null); }}>
              Undo
            </Button>
          )}
        </Box>
      </Box>
      {editing && (
        <Box component="tr" data-testid="part-picker-row">
          <Box component="td" colSpan={6} sx={{ py: 1, px: 1, borderBottom: '1px solid var(--c-divider)' }}>
            <PartPicker row={row} onCancel={() => onEdit(false)} onPick={(c) => { onEdit(false); settle.choose(job, row, c.cutPlateId); }} />
          </Box>
        </Box>
      )}
    </>
  );
}

/** The parts of one ProNest job (`job` = its file name), or of the DXFs together (`job` null). */
export function PartsTable({ rows, job, settle, label, names }: {
  rows: NestPartRow[]; job: string | null; settle: PartSettle; label: string; names?: (code: string) => CutPieceName;
}) {
  const [all, setAll] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const matchedRows = useMemo(() => rows.filter((r) => r.status === 'matched').length, [rows]);
  const fold = matchedRows > MATCHED_SHOWN && !all;
  const shown = fold ? rows.filter((r) => r.status !== 'matched') : rows;
  const toAsk = rows.filter(needsPick).length;
  if (!rows.length) return null;
  const th = { py: 0.75, px: 1, textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', borderBottom: '1px solid var(--c-border)' } as const;
  return (
    <Box data-testid="parts-table" sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.5, minWidth: 0 }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <CapsLabel>{`Parts (${rows.length})`}</CapsLabel>
        {toAsk > 0 && <Badge family="warning" noIcon label={`${toAsk} to choose`} />}
      </Box>
      {/* No minimum width: the cells wrap, so the table never pushes the dialog sideways (it used to be 640 px at least). */}
      <Box sx={{ minWidth: 0 }}>
        <Box component="table" aria-label={label} sx={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '27%' }} /><col style={{ width: '11%' }} /><col style={{ width: '7%' }} /><col style={{ width: '20%' }} /><col style={{ width: '20%' }} /><col style={{ width: '15%' }} />
          </colgroup>
          <thead>
            <Box component="tr">
              <Box component="th" scope="col" sx={th}>Part</Box>
              <Box component="th" scope="col" sx={th}>Drawn</Box>
              <Box component="th" scope="col" sx={{ ...th, textAlign: 'right' }}>Pieces</Box>
              <Box component="th" scope="col" sx={th}>Matched to</Box>
              <Box component="th" scope="col" sx={th}>How</Box>
              <Box component="th" scope="col" sx={th}><Box component="span" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Change</Box></Box>
            </Box>
          </thead>
          <tbody>
            {shown.map((r) => (
              <PartRowLine key={r.key} row={r} job={job} settle={settle} names={names} editing={editing === r.key} onEdit={(open) => setEditing(open ? r.key : null)} />
            ))}
          </tbody>
        </Box>
      </Box>
      {matchedRows > MATCHED_SHOWN && (
        <Box>
          <Button size="small" data-testid="parts-show-all" aria-expanded={all} onClick={() => setAll((o) => !o)}
            endIcon={all ? <ExpandMoreRounded /> : <ChevronRightRounded />}>
            {all ? 'Show fewer parts' : `Show all ${rows.length} parts`}
          </Button>
        </Box>
      )}
    </Box>
  );
}
