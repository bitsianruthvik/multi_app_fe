import { useRef, useState, type ReactNode } from 'react';
import { Alert, Box, Button, Checkbox, CircularProgress, Tooltip, Typography } from '@mui/material';
import { CfApiError } from '../../api/client';
import { getNestingChoices, saveNestingChoices, setPlateKind } from '../../api/nesting';
import type { NestChoiceGroup, NestChoicePiece, NestChoicePlate, NestingChoices } from '../../api/types';
import { choicesLine, kg, mm, steelWord } from '../../lib/nesting';
import { priceText } from '../../lib/money';
import { Badge, ErrorNotice, Mono, SectionCard } from '../ui';

/**
 * BEFORE ANY NESTING: WHAT THE RUN WILL CONSIDER (init.sql §40).
 *
 * The user, 2026-10-02: "show the cut pieces and let the user remove any from
 * the list to be considered for nesting", then "show the list of RMs you will
 * consider based on the thickness of the cut plates. Let the user unselect any."
 *
 *   Step A — Pieces  every cut piece of the line, grouped by steel (thickness ×
 *            grade × material, the packer's grouping), ticked by default. An
 *            unticked piece is left out of every run and keeps "plate chosen at
 *            nesting". NEST_MANUAL pieces are always out, and say why.
 *   Step B — Plates  per steel that still has a ticked piece, the raw plates the
 *            packer would be offered — the server's own candidate list — with
 *            stock, last paid and list price. A steel with every plate
 *            unticked blocks Nest.
 *
 * Each tick is saved at once (PUT …/nesting/choices, the whole selection), so
 * what is on screen is what the next run uses; the server's answer replaces the
 * screen's guess.
 */

const cell = { fontSize: 12.5, color: 'var(--c-text-2)', minWidth: 0 } as const;

/** "34 of 40 pieces · 1,234 of 1,500 kg" */
const tickedLine = (s: NestChoiceGroup['summary']) =>
  `${s.ticked.cutPlates} of ${s.cutPlates} cut ${s.cutPlates === 1 ? 'piece' : 'pieces'} · ${s.ticked.pieces} of ${s.pieces} pcs · ${kg(s.ticked.kg)} of ${kg(s.kg)} kg`;

const sizeOf = (p: { length: number | null; width: number | null; thickness: number | null }) =>
  `${mm(p.length)} × ${mm(p.width)} × ${mm(p.thickness)}`;


function GroupTick({ all, some, disabled, label, onChange }: { all: boolean; some: boolean; disabled: boolean; label: string; onChange: (next: boolean) => void }) {
  return (
    <Checkbox size="small" checked={all} indeterminate={!all && some} disabled={disabled}
      slotProps={{ input: { 'aria-label': label } }} onChange={(e) => onChange(e.target.checked)} sx={{ p: 0.5 }} />
  );
}

function PieceRow({ p, disabled, onToggle }: { p: NestChoicePiece; disabled: boolean; onToggle: (next: boolean) => void }) {
  const out = p.manual || p.toNest === 0;
  return (
    <Box data-testid="choice-piece" data-id={p.cutPlateId} sx={{
      display: 'grid', gridTemplateColumns: { xs: 'auto minmax(0, 1fr) auto', sm: 'auto minmax(0, 1.4fr) minmax(0, 1fr) 70px 90px' },
      alignItems: 'center', columnGap: 1.25, rowGap: 0.25, py: 0.5, borderBottom: '1px solid var(--c-divider)', minWidth: 0,
      opacity: out ? 0.7 : 1,
    }}>
      <Checkbox size="small" checked={!p.excluded && !out} disabled={disabled || out} sx={{ p: 0.5 }}
        slotProps={{ input: { 'aria-label': `Nest ${p.code ?? p.name ?? p.cutPlateId}` } }}
        onChange={(e) => onToggle(e.target.checked)} />
      <Box sx={{ minWidth: 0, display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
        <Mono sx={{ overflowWrap: 'anywhere' }}>{p.code ?? p.name ?? `#${p.cutPlateId}`}</Mono>
        {p.manual && <Badge family="warning" label="NEST_MANUAL" noIcon title={p.note ?? ''} />}
        {!p.manual && p.excluded && <Badge family="neutral" label="Left out" noIcon title="Plate chosen at nesting: nest it later, or choose its plate by hand." />}
        {p.onImported > 0 && <Badge family="info" label={`${p.onImported} on imported nests`} noIcon />}
      </Box>
      <Box sx={{ ...cell, display: { xs: 'none', sm: 'block' } }}>{`${sizeOf(p)} mm`}</Box>
      <Box sx={{ ...cell, textAlign: 'right' }}><Mono>{p.toNest}</Mono>{' pcs'}</Box>
      <Box sx={{ ...cell, textAlign: 'right', display: { xs: 'none', sm: 'block' } }}><Mono>{kg(p.kg)}</Mono>{' kg'}</Box>
      {p.manual && p.note && (
        <Typography sx={{ gridColumn: '2 / -1', fontSize: 12, color: 'var(--c-warning-800)' }}>{p.note}</Typography>
      )}
    </Box>
  );
}

function PlateRow({ p, disabled, onToggle, onFlip }: { p: NestChoicePlate; disabled: boolean; onToggle: (next: boolean) => void; onFlip: ((to: 'STANDARD' | 'CUSTOM') => void) | null }) {
  const standard = p.kind === 'STANDARD';
  const notAllowed = p.allowed === false;
  const stock = [
    p.stock.theirs > 0 ? `${p.stock.theirs} customer's` : null,
    `${mm(p.stock.ours)} in stock`,
  ].filter(Boolean).join(' · ');
  return (
    <Box data-testid="choice-plate" data-id={p.plateItemId} sx={{
      display: 'grid', gridTemplateColumns: { xs: 'auto minmax(0, 1fr)', sm: 'auto minmax(0, 1.3fr) minmax(0, 0.9fr) minmax(0, 0.9fr) minmax(0, 1fr)' },
      alignItems: 'center', columnGap: 1.25, rowGap: 0.25, py: 0.5, borderBottom: '1px solid var(--c-divider)', minWidth: 0,
      opacity: notAllowed ? 0.55 : 1,
    }}>
      <Checkbox size="small" checked={!p.excluded} disabled={disabled} sx={{ p: 0.5 }}
        slotProps={{ input: { 'aria-label': `Use plate ${p.code ?? p.plateItemId}` } }}
        onChange={(e) => onToggle(e.target.checked)} />
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
          <Mono sx={{ overflowWrap: 'anywhere' }}>{p.code ?? p.name ?? `#${p.plateItemId}`}</Mono>
          {p.preferred && <Badge family="success" label="Customer's — used first" noIcon title="The order's customer sent this plate: the packer offers it first, and it costs nothing." />}
          {p.excluded && <Badge family="neutral" label="Excluded" noIcon />}
          <Tooltip title={onFlip ? (standard ? 'Mark as custom' : 'Mark as standard') : (p.kind == null ? 'Not marked — counted as custom' : '')}>
            <Box component="span" data-testid="plate-kind" data-kind={standard ? 'STANDARD' : 'CUSTOM'}
              onClick={onFlip ? () => onFlip(standard ? 'CUSTOM' : 'STANDARD') : undefined}
              sx={{ display: 'inline-flex', cursor: onFlip ? 'pointer' : 'default' }}>
              <Badge family={standard ? 'success' : 'neutral'} label={standard ? 'Standard' : 'Custom'} noIcon />
            </Box>
          </Tooltip>
          {notAllowed && <Box component="span" data-testid="plate-not-used" sx={{ fontSize: 12, color: 'var(--c-warning-800)' }}>Not used — standard plates only</Box>}
        </Box>
        <Box sx={cell}>{`${mm(p.length)} × ${mm(p.width)} × ${mm(p.thickness)} mm${p.grade ? ` · ${p.grade}` : ''}${p.material ? ` ${p.material}` : ''}${p.kgEach != null ? ` · ${kg(p.kgEach)} kg` : ''}`}</Box>
      </Box>
      <Box sx={{ ...cell, gridColumn: { xs: '2', sm: 'auto' } }}>{stock}</Box>
      <Box sx={{ ...cell, gridColumn: { xs: '2', sm: 'auto' } }} title={p.lastPaid?.orderCode ? `On ${p.lastPaid.orderCode}${p.lastPaid.orderedAt ? `, ${String(p.lastPaid.orderedAt).slice(0, 10)}` : ''}` : undefined}>
        {p.lastPaid ? <>{'Last paid '}<Mono>{priceText(p.lastPaid.unitPrice)}</Mono></> : 'Never bought'}
      </Box>
      <Box sx={{ ...cell, gridColumn: { xs: '2', sm: 'auto' } }}>
        {p.listPrice ? <>{'List '}<Mono>{priceText(p.listPrice.perPlate ?? null, '—')}</Mono>{' / plate'}</> : 'No list price'}
      </Box>
    </Box>
  );
}

function Step({ n, title, hint, children, actions }: { n: number; title: string; hint: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1, minWidth: 0 }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <Box sx={{
          width: 22, height: 22, borderRadius: 999, display: 'grid', placeItems: 'center', fontSize: 12.5, fontWeight: 700,
          background: 'var(--c-primary-50)', color: 'var(--c-primary-700)', border: '1px solid var(--c-primary-200)',
        }}>{n}</Box>
        <Box sx={{ fontSize: 14, fontWeight: 600 }}>{title}</Box>
        <Box sx={{ fontSize: 12.5, color: 'var(--c-text-2)', flex: '1 1 240px', minWidth: 0 }}>{hint}</Box>
        {actions}
      </Box>
      {children}
    </Box>
  );
}

export function NestChoices({ orderId, lineId, choices, canManage, canEditCatalog = false, onChange, open, onOpenChange }: {
  orderId: number;
  lineId: number;
  choices: NestingChoices;
  canManage: boolean;
  /** The catalog grant: lets a plate's Standard / Custom chip be flipped. */
  canEditCatalog?: boolean;
  /** The server's answer after a save — the panel above re-reads its block from it. */
  onChange: (next: NestingChoices) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [step, setStep] = useState<'pieces' | 'plates'>('pieces');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  const seq = useRef(0);
  const editable = canManage && choices.canSave;
  const disabled = !editable || saving;
  const mayFlip = canEditCatalog;

  // The whole selection, saved at once. A later save wins; an earlier answer is ignored.
  const save = async (cutIds: number[], plateIds: number[]) => {
    const mine = ++seq.current;
    setSaving(true); setError(null);
    try {
      const next = await saveNestingChoices(orderId, lineId, cutIds, plateIds);
      if (mine === seq.current) onChange(next);
    } catch (e) {
      if (mine === seq.current) setError(e as CfApiError);
    } finally {
      if (mine === seq.current) setSaving(false);
    }
  };
  const setPieces = (ids: number[], tick: boolean) => {
    const out = new Set(choices.excluded.cutPlateIds);
    for (const id of ids) { if (tick) out.delete(id); else out.add(id); }
    void save([...out], choices.excluded.plateIds);
  };
  const setPlates = (ids: number[], tick: boolean) => {
    const out = new Set(choices.excluded.plateIds);
    for (const id of ids) { if (tick) out.delete(id); else out.add(id); }
    void save(choices.excluded.cutPlateIds, [...out]);
  };
  const reset = () => void save([], []);
  // Flip a catalog plate Standard <-> Custom, then re-read the choices so `allowed` follows.
  const flip = async (plateItemId: number, to: 'STANDARD' | 'CUSTOM') => {
    const mine = ++seq.current;
    setSaving(true); setError(null);
    try {
      await setPlateKind(plateItemId, to);
      const next = await getNestingChoices(orderId, lineId);
      if (mine === seq.current) onChange(next);
    } catch (e) {
      if (mine === seq.current) setError(e as CfApiError);
    } finally {
      if (mine === seq.current) setSaving(false);
    }
  };

  const s = choices.summary;
  const anyOut = s.piecesLeftOut > 0 || s.platesExcluded > 0;
  const withPieces = choices.groups.filter((g) => g.summary.ticked.cutPlates > 0);
  const totalPieces = choices.groups.reduce((a, g) => a + g.summary.cutPlates, 0) + choices.unusable.length;

  const summaryBar = (
    <Box data-testid="choices-summary" sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
      <Box component="span" sx={{ fontWeight: 500 }}>{choicesLine(choices)}</Box>
      <Box component="span" sx={{ color: 'var(--c-text-2)' }}>
        {`· ${s.ticked.pieces} of ${s.pieces} pcs and ${kg(s.ticked.kg)} of ${kg(s.kg)} kg go to nesting`}
      </Box>
      {saving && <CircularProgress size={13} aria-label="Saving" />}
      {anyOut && editable && <Button size="small" onClick={reset} disabled={saving} sx={{ py: 0 }}>Reset</Button>}
      <Button size="small" onClick={() => onOpenChange(!open)} sx={{ py: 0 }}>{open ? 'Hide' : 'Choose pieces and plates'}</Button>
    </Box>
  );

  if (!open) return <Box sx={{ minWidth: 0 }}>{summaryBar}</Box>;

  return (
    <SectionCard title="What to nest" subtitle="Before nesting: the cut pieces to lay out, then the plates they may be cut from. Every run uses these.">
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.75, minWidth: 0 }}>
        {summaryBar}
        {!choices.canSave && choices.readOnlyReason && <Alert severity="info" sx={{ py: 0 }}>{choices.readOnlyReason}</Alert>}
        <ErrorNotice error={error} sx={{ mb: 0 }} />
        <Box role="tablist" sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
          <Button role="tab" aria-selected={step === 'pieces'} size="small" variant={step === 'pieces' ? 'contained' : 'outlined'} onClick={() => setStep('pieces')}>
            {`1 · Pieces (${totalPieces})`}
          </Button>
          <Button role="tab" aria-selected={step === 'plates'} size="small" variant={step === 'plates' ? 'contained' : 'outlined'} onClick={() => setStep('plates')}>
            {`2 · Plates (${withPieces.reduce((a, g) => a + g.summary.platesTicked, 0)} ticked)`}
          </Button>
        </Box>

        {step === 'pieces' && (
          <Step n={1} title="Pieces" hint="Untick a piece to leave it out of this line's nesting — its plate stays chosen at nesting, to nest later or choose by hand."
            actions={<Button size="small" variant="outlined" onClick={() => setStep('plates')}>Next: plates</Button>}>
            {choices.groups.length === 0 && choices.unusable.length === 0 && (
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>This line has no cut pieces to nest.</Typography>
            )}
            {choices.groups.map((g) => {
              const can = g.pieces.filter((p) => !p.manual && p.toNest > 0);
              const ticked = can.filter((p) => !p.excluded);
              return (
                <Box key={g.key} data-testid="choice-group" sx={{ minWidth: 0 }}>
                  <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap', py: 0.5, borderBottom: '1px solid var(--c-border)' }}>
                    <GroupTick all={can.length > 0 && ticked.length === can.length} some={ticked.length > 0} disabled={disabled || !can.length}
                      label={`Nest every ${steelWord(g)} piece`} onChange={(next) => setPieces(can.map((p) => p.cutPlateId), next)} />
                    <Box sx={{ fontSize: 13.5, fontWeight: 600 }}>{steelWord(g)}</Box>
                    <Box sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{tickedLine(g.summary)}</Box>
                  </Box>
                  {g.pieces.map((p) => <PieceRow key={p.cutPlateId} p={p} disabled={disabled} onToggle={(next) => setPieces([p.cutPlateId], next)} />)}
                </Box>
              );
            })}
            {choices.unusable.length > 0 && (
              <Box sx={{ minWidth: 0 }}>
                <Box sx={{ fontSize: 13, fontWeight: 600, color: 'var(--c-warning-800)', py: 0.5 }}>Cannot be nested — the steel is not stated</Box>
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', pb: 0.5 }}>
                  Each blocks the run until its values are set. Untick it to leave it out and nest the rest.
                </Typography>
                {choices.unusable.map((p) => (
                  <Box key={p.cutPlateId}>
                    <PieceRow p={{ ...p, toNest: p.toNest || p.pieces }} disabled={disabled} onToggle={(next) => setPieces([p.cutPlateId], next)} />
                    {p.reason && <Typography sx={{ fontSize: 12, color: 'var(--c-warning-800)', pl: 5 }}>{p.reason}</Typography>}
                  </Box>
                ))}
              </Box>
            )}
          </Step>
        )}

        {step === 'plates' && (
          <Step n={2} title="Plates" hint="The raw plates the packer would consider for the ticked pieces — the same list it is given. Untick any it must not use."
            actions={<Button size="small" variant="outlined" onClick={() => setStep('pieces')}>Back: pieces</Button>}>
            {withPieces.length === 0 && (
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>No piece is ticked, so there are no plates to choose.</Typography>
            )}
            {withPieces.map((g) => {
              const ticked = g.plates.filter((p) => !p.excluded);
              return (
                <Box key={g.key} data-testid="choice-plate-group" sx={{ minWidth: 0 }}>
                  <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap', py: 0.5, borderBottom: '1px solid var(--c-border)' }}>
                    <GroupTick all={g.plates.length > 0 && ticked.length === g.plates.length} some={ticked.length > 0} disabled={disabled || !g.plates.length}
                      label={`Use every ${steelWord(g)} plate`} onChange={(next) => setPlates(g.plates.map((p) => p.plateItemId), next)} />
                    <Box sx={{ fontSize: 13.5, fontWeight: 600 }}>{steelWord(g)}</Box>
                    <Box sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                      {`${g.summary.platesTicked} of ${g.summary.platesOffered} plates · for ${g.summary.ticked.pieces} pcs · kerf ${mm(g.kerfMm)} mm`}
                    </Box>
                  </Box>
                  {g.blocked && <Alert severity="warning" sx={{ my: 0.75 }} data-testid="choice-blocked">{g.blocked}</Alert>}
                  {g.noCandidate && <Alert severity="info" sx={{ my: 0.75 }}>{g.noCandidate}</Alert>}
                  {g.offcutsInStock.count > 0 && (
                    <Tooltip title={g.offcutsInStock.note}>
                      <Box sx={{ fontSize: 12.5, color: 'var(--c-success-800)', py: 0.5 }}>
                        {`${g.offcutsInStock.count} ${g.offcutsInStock.count === 1 ? 'offcut' : 'offcuts'} of this steel in stock (${kg(g.offcutsInStock.kg)} kg) — use them by hand; automatic nesting buys by catalog size.`}
                      </Box>
                    </Tooltip>
                  )}
                  {g.plates.map((p) => <PlateRow key={p.plateItemId} p={p} disabled={disabled} onToggle={(next) => setPlates([p.plateItemId], next)}
                    onFlip={mayFlip && !saving ? (to) => void flip(p.plateItemId, to) : null} />)}
                </Box>
              );
            })}
          </Step>
        )}
      </Box>
    </SectionCard>
  );
}
