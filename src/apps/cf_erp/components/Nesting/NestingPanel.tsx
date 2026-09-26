import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  Alert, Box, Button, CircularProgress, MenuItem, Switch, TextField, Tooltip, Typography,
} from '@mui/material';
import GridViewRounded from '@mui/icons-material/GridViewRounded';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import TaskAltRounded from '@mui/icons-material/TaskAltRounded';
import UndoRounded from '@mui/icons-material/UndoRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ExpandLessRounded from '@mui/icons-material/ExpandLessRounded';
import LayersRounded from '@mui/icons-material/LayersRounded';
import ScaleRounded from '@mui/icons-material/ScaleRounded';
import DeleteSweepRounded from '@mui/icons-material/DeleteSweepRounded';
import PanToolRounded from '@mui/icons-material/PanToolRounded';
import LightbulbOutlined from '@mui/icons-material/LightbulbOutlined';
import { cfApi, type CfApiError } from '../../api/client';
import type {
  Nest, NestCutPlate, NestGroup, NestingAccepted, NestingPlan,
} from '../../api/types';
import { useLoad } from '../../hooks/useLoad';
import {
  ACCEPT_AGAIN, ACCEPT_WHAT_HAPPENS, EFFORTS, LOOK_IS_A_LOOK, MANUAL_HELP, NO_MANAGE,
  acceptBody, adviceSentence, adviceTitle, basisWord, colourIndex, cutOrderSentence, dedupeAdvice, driftWords, kg, marginOf,
  marginSentence, mm, mmPair, pct, pieceColour, platePieceKinds, sequenceOver, steelWord, tonnes,
  type Effort,
} from '../../lib/nesting';
import {
  Badge, CapsLabel, EmptyState, ErrorNotice, Mono, SectionCard, SkeletonRows, StatStrip, Surface,
  type Stat,
} from '../ui';
import { useToast } from '../toastContext';
import { PlateDrawing } from './PlateDrawing';

/**
 * THE NESTING SCREEN — a sales order line's rectangles laid out on real plates.
 *
 * Four rules hold it together, and each of them is a decision somebody already
 * took (CF_ERP_NESTING_PLAN.md):
 *
 *   1. A LOOK IS A LOOK. Opening this reads the saved plan. It never re-packs:
 *      re-solving on every open cost the other system a 36-second spinner, and
 *      a saved plan IS the plan the floor cuts to.
 *   2. SUGGEST, THEN ACCEPT. `Propose a layout` runs the packer and writes
 *      nothing at all; `Accept` is the only thing on this screen that writes.
 *      Until it is pressed, what is on screen is an argument, not a plan.
 *   3. THE SEQUENCES ARE THE POINT. The floor pierces sequence 1 in full, then
 *      2, then 3 — that ordering is why the plan is divided at all — so every
 *      plate is drawn with its sequences banded and numbered in cut order.
 *   4. THE TWO SIZES ARE BOTH SHOWN. What the layout needs and what is bought
 *      are different numbers on purpose: +100 mm of length and +50 mm of width,
 *      because a mill edge is not straight. Reporting only the difference would
 *      read as waste, which it is not.
 *
 * Counting, in the words the API uses: COUNT LOTS FOR PLATES, SUM PLACEMENTS
 * FOR PIECES. One lot is one physical plate; one placement is one piece on it.
 */

/** How many plates a steel group draws before it asks. A line can hold a hundred. */
const FIRST_PLATES = 4;
const MORE_PLATES = 12;

/** A tinted note — the same one the order's stage screens use, so the app has one voice. */
function Note({ tone = 'info', children }: { tone?: 'info' | 'warning'; children: ReactNode }) {
  return (
    <Box sx={{
      display: 'flex', gap: 1, alignItems: 'flex-start', p: 1.25, minWidth: 0, fontSize: 13,
      borderRadius: 'var(--r-md)', background: `var(--c-${tone}-50)`, border: `1px solid var(--c-${tone}-200)`, color: `var(--c-${tone}-800)`,
    }}>
      <Box sx={{ minWidth: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.75 }}>{children}</Box>
    </Box>
  );
}

/** A label/value pair, tight enough to sit four to a row on a plate card. */
function Cell({ label, children, title }: { label: string; children: ReactNode; title?: string }) {
  const body = (
    <Box sx={{ minWidth: 0 }}>
      <CapsLabel>{label}</CapsLabel>
      <Box sx={{ fontSize: 13, color: 'var(--c-text)', overflowWrap: 'anywhere' }}>{children}</Box>
    </Box>
  );
  return title ? <Tooltip title={title} placement="top-start"><Box sx={{ minWidth: 0 }}>{body}</Box></Tooltip> : body;
}

/** One plate: its drawing, its two sizes, its wastage and what is on it. */
function PlateCard({ nest, group, colourOf }: {
  nest: Nest; group: NestGroup; colourOf: (id: number) => string;
}) {
  const margin = marginOf(nest, group);
  const kinds = platePieceKinds(nest);
  const over = nest.sequences.filter(sequenceOver);
  return (
    <Surface e={1} sx={{ p: { xs: 1.5, sm: 2 }, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.5, minWidth: 0 }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap', minWidth: 0 }}>
        <Mono chip>{nest.lotNo ?? '—'}</Mono>
        <Box sx={{ fontSize: 13.5, fontWeight: 500, minWidth: 0, overflowWrap: 'anywhere' }}>{nest.plateCode ?? nest.plateName ?? 'Unnamed plate'}</Box>
        {nest.source === 'offcut' && <Badge family="success" label="Offcut" title="Left over from another plate, so it costs no new steel." />}
        {nest.isManual && <Badge family="warning" label="By hand" title="This plate was laid out by a person, not the packer." />}
      </Box>

      <PlateDrawing nest={nest} colourOf={colourOf} />

      <Box sx={{
        display: 'grid', gap: 1.25, minWidth: 0,
        gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' },
      }}>
        <Cell label="Needs" title="What the layout takes up, with one kerf cut off each rim.">
          <Mono>{mmPair(nest.requiredLength, nest.requiredWidth)}</Mono>
        </Cell>
        <Cell label="Plate bought" title="The stocked plate this lot is cut from. The shop always buys a stocked size, so this IS what is purchased — the spare over what the layout needs is deliberate, because mill edges are not straight.">
          <Mono>{mmPair(nest.length, nest.width)}</Mono>
        </Cell>
        <Cell label="Margin" title={marginSentence(margin)}>
          {margin.length == null ? <Mono muted>—</Mono> : (
            <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
              <Mono>{`+${mm(margin.length)} / +${mm(margin.width)}`}</Mono>
              {margin.short && <Badge family="danger" label="Too small" noIcon />}
              {!margin.short && margin.thin && <Badge family="warning" label="Thin" noIcon title={`The shop asks for +${mm(margin.wantLength)} length and +${mm(margin.wantWidth)} width.`} />}
            </Box>
          )}
        </Cell>
        <Cell label="Wastage" title="The plate bought, less the rectangles on it.">
          <Mono>{`${kg(nest.wasteKg)} kg · ${pct(nest.wastePct)}`}</Mono>
        </Cell>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.75, minWidth: 0 }}>
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{cutOrderSentence(nest)}</Typography>
        {over.length > 0 && (
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-warning-800)' }}>
            {`Sequence ${over.map((s) => s.seqNo).join(', ')} holds more rows than its part size allows — a sequence of small parts holds 2 rows, one with anything big holds 3.`}
          </Typography>
        )}
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', minWidth: 0 }}>
          {kinds.map((k) => (
            <Box key={k.cutPlateId} sx={{
              display: 'inline-flex', alignItems: 'center', gap: 0.75, minWidth: 0, maxWidth: '100%',
              background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', px: 0.75, py: 0.25,
            }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '3px', background: colourOf(k.cutPlateId), flexShrink: 0 }} />
              <Mono sx={{ overflowWrap: 'anywhere' }}>{k.cutPlateCode}</Mono>
              <Box sx={{ fontSize: 12, color: 'var(--c-text-2)', flexShrink: 0 }}>{`×${k.count}`}</Box>
            </Box>
          ))}
        </Box>
      </Box>
    </Surface>
  );
}

/** One steel — thickness, grade and material together, never thickness alone. */
function GroupCard({ group, colourOf, open, onToggle }: {
  group: NestGroup; colourOf: (id: number) => string; open: boolean; onToggle: () => void;
}) {
  const [shown, setShown] = useState(FIRST_PLATES);
  const m = group.metrics;
  const plates = group.nests.slice(0, open ? shown : 0);
  return (
    <SectionCard
      title={<Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span>{steelWord(group)}</span>
        <Mono muted>{`${m.plates} ${m.plates === 1 ? 'plate' : 'plates'} · ${m.pieces} pieces`}</Mono>
      </Box>}
      subtitle={`Kerf ${mm(group.kerfMm)} mm, charged at the rim as well as between pieces · sequence gap ${mm(group.seqGapMinMm)}–${mm(group.seqGapMaxMm)} mm · ${group.settingsBasis}`}
      actions={group.nests.length > 0
        ? (
          <Button size="small" onClick={onToggle} endIcon={open ? <ExpandLessRounded /> : <ExpandMoreRounded />}>
            {open ? 'Hide the plates' : `Draw the ${group.nests.length} ${group.nests.length === 1 ? 'plate' : 'plates'}`}
          </Button>
        )
        : undefined}
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.5, minWidth: 0 }}>
        <Box sx={{
          display: 'grid', gap: 1.25, minWidth: 0,
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' },
        }}>
          <Cell label="Steel bought"><Mono>{`${tonnes(m.weightKg)} t`}</Mono></Cell>
          <Cell label="Wastage" title="Every plate of this steel, added up."><Mono>{`${kg(m.wasteKg)} kg · ${pct(m.wastePct)}`}</Mono></Cell>
          <Cell label="Rectangles"><Mono>{group.cutPlates.length}</Mono></Cell>
          {/* Which plates the catalog offered is a fact about the RUN, not about
              the lots, so a saved plan does not have it and must not print 0. */}
          <Cell label="Plates offered"
            title={group.candidates.length
              ? "Catalog plates of this thickness whose grade and material do not contradict the rectangles'."
              : 'A saved plan records the plates it chose, not the ones it was offered. Propose again to see the choice.'}>
            {group.candidates.length ? <Mono>{group.candidates.length}</Mono> : <Mono muted>not recorded</Mono>}
          </Cell>
        </Box>

        {group.unplaced.length > 0 && (
          <Note tone="warning">
            <Box><strong>{`${group.unplaced.length} ${group.unplaced.length === 1 ? 'rectangle' : 'rectangles'} could not be placed on this steel.`}</strong></Box>
            <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.5 }}>
              {group.unplaced.map((u) => (
                <li key={`${u.cutPlateId}-${u.reason}`}>
                  <Mono>{u.cutPlateCode}</Mono>{` ×${u.qty} — ${u.reason}`}
                </li>
              ))}
            </Box>
          </Note>
        )}

        {group.nests.length === 0
          ? <EmptyState icon={<GridViewRounded />} title="No plate carries this steel" hint="Nothing was laid out here. The reasons are listed above." />
          : open && (
            <>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.5, minWidth: 0 }}>
                {plates.map((n) => <PlateCard key={n.id ?? n.lotNo ?? `${n.plateItemId}`} nest={n} group={group} colourOf={colourOf} />)}
              </Box>
              {shown < group.nests.length && (
                <Button size="small" variant="outlined" onClick={() => setShown((s) => s + MORE_PLATES)}>
                  {`Draw ${Math.min(MORE_PLATES, group.nests.length - shown)} more — ${group.nests.length - shown} still hidden`}
                </Button>
              )}
            </>
          )}
      </Box>
    </SectionCard>
  );
}

export function NestingPanel({ orderId, lineId, canManage, onChanged }: {
  orderId: number;
  lineId: number;
  /** The sales-order grant. Without it the screen is a look, and says so. */
  canManage: boolean;
  /** Accepting rewrites what the order will buy, so the page around it reloads. */
  onChanged?: () => void;
}) {
  const toast = useToast();
  const path = `/orders/${orderId}/lines/${lineId}/nesting`;
  // THE SAVED PLAN, READ ON OPEN. This is the only request the screen makes by
  // itself, and it does not re-pack.
  const saved = useLoad(() => cfApi.get<NestingPlan>(path), [path]);
  const [proposal, setProposal] = useState<NestingPlan | null>(null);
  const [effort, setEffort] = useState<Effort>('standard');
  const [busy, setBusy] = useState<'plan' | 'accept' | null>(null);
  const [manualBusy, setManualBusy] = useState<number | null>(null);
  const [actionError, setActionError] = useState<CfApiError | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const plan = proposal ?? saved.data;
  const colours = useMemo(() => (plan ? colourIndex(plan) : new Map<number, number>()), [plan]);
  const colourOf = useCallback((id: number) => pieceColour(colours.get(id) ?? id), [colours]);

  const propose = async () => {
    setBusy('plan'); setActionError(null);
    try {
      const out = await cfApi.post<NestingPlan>(`${path}/plan`, { effort });
      setProposal(out);
      setOpenGroup(out.groups.find((g) => g.nests.length)?.key ?? null);
      toast.success(`${out.totals.plates} plates, ${out.totals.pieces} pieces. Nothing is written until you accept it.`);
    } catch (e) { setActionError(e as CfApiError); } finally { setBusy(null); }
  };

  const accept = async () => {
    if (!proposal) return;
    setBusy('accept'); setActionError(null);
    try {
      const out = await cfApi.post<NestingAccepted>(`${path}/accept`, acceptBody(proposal));
      setProposal(null);
      saved.reload();
      onChanged?.();
      toast.success(`${out.plates} plates and ${out.pieces} pieces written${out.replacedLots ? `, replacing ${out.replacedLots}` : ''}.`);
    } catch (e) { setActionError(e as CfApiError); } finally { setBusy(null); }
  };

  /**
   * NEST_MANUAL is a specification value on the cut plate itself, written the
   * way every other value on this app is written. It only takes a rectangle out
   * of the pack — it changes nothing that is already saved — so the proposal on
   * screen is dropped rather than left describing a world that has moved.
   */
  const setManual = async (cp: NestCutPlate, next: boolean) => {
    setManualBusy(cp.id); setActionError(null);
    try {
      await cfApi.put(`/records/${cp.id}/values`, { values: [{ specCode: 'NEST_MANUAL', value: next }] });
      setProposal(null);
      saved.reload();
      toast.success(next
        ? `${cp.code ?? cp.name} is laid out by hand from now on. Propose again to pack the rest around it.`
        : `${cp.code ?? cp.name} goes back into the pack. Propose again to place it.`);
    } catch (e) { setActionError(e as CfApiError); } finally { setManualBusy(null); }
  };

  if (saved.error) return <ErrorNotice error={saved.error} onRetry={saved.reload} />;
  if (!plan) {
    return (
      <SectionCard title="Nesting" subtitle="Laying this line's rectangles out on the plates they are cut from.">
        <SkeletonRows rows={4} height={52} />
      </SectionCard>
    );
  }

  const basis = basisWord(plan);
  const t = plan.totals;
  const everyCutPlate: NestCutPlate[] = [
    ...plan.groups.flatMap((g) => g.cutPlates),
    ...plan.manual,
  ].filter((cp, i, all) => all.findIndex((x) => x.id === cp.id) === i)
    .sort((a, b) => (a.code ?? '').localeCompare(b.code ?? ''));
  const manualIds = new Set(plan.manual.map((cp) => cp.id));
  const unplaced = plan.groups.flatMap((g) => g.unplaced);
  const advice = dedupeAdvice(plan.sizeAdvice);
  // Drift only means something against a plan that EXISTS. The API answers it
  // for an empty line too, where every rectangle is "needs n, placed 0" — which
  // is not drift, it is simply not nested yet, and saying so would be a lie.
  const drift = plan.saved ? (plan.drift ?? []) : [];

  const stats: Stat[] = [
    { label: 'Plates', value: t.plates, icon: <LayersRounded />, hint: 'One plate is one lot — one physical sheet this line draws from stock.' },
    { label: 'Pieces', value: t.pieces, hint: 'Every rectangle placed, counted one by one. A plate of six is six pieces.' },
    { label: 'Steel bought', value: Math.round(t.weightKg), display: `${tonnes(t.weightKg)} t`, icon: <ScaleRounded />, hint: 'The whole plates, not the parts cut from them.' },
    { label: 'Wastage', value: Math.round(t.wasteKg), display: `${kg(t.wasteKg)} kg`, tone: 'warning', icon: <DeleteSweepRounded />, hint: 'Steel bought that no rectangle sits on.' },
    { label: 'Wastage', value: t.wastePct, display: pct(t.wastePct), tone: 'warning', hint: 'The same figure as a share of the steel bought.' },
    { label: 'Not placed', value: t.unplaced, tone: 'danger', hint: 'Rectangles the packer could not find room for. Each one says why.' },
  ];

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, minWidth: 0 }}>
      <SectionCard
        title="Nesting"
        subtitle={`Line ${plan.line.lineNo} of ${plan.line.orderCode} · plate → sequence → row → part, and the floor cuts in that order.`}
        actions={(
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField select size="small" label="Effort" value={effort} onChange={(e) => setEffort(e.target.value as Effort)}
              sx={{ minWidth: 132 }} disabled={busy != null}>
              {EFFORTS.map((e) => <MenuItem key={e.value} value={e.value}>{e.label}</MenuItem>)}
            </TextField>
            <Tooltip title="Runs the packer and shows what it would do. Nothing is written.">
              <span>
                <Button variant={proposal ? 'outlined' : 'contained'} disabled={busy != null}
                  startIcon={busy === 'plan' ? <CircularProgress size={14} color="inherit" /> : <AutoAwesomeRounded />}
                  onClick={propose}>
                  {proposal ? 'Propose again' : 'Propose a layout'}
                </Button>
              </span>
            </Tooltip>
          </Box>
        )}
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.5, minWidth: 0 }}>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
            <Badge family={basis.family} label={basis.label} title={basis.help} />
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', flex: '1 1 260px', minWidth: 0 }}>
              {proposal ? 'Nothing here is written down yet. Read it, then accept it or propose again.' : LOOK_IS_A_LOOK}
            </Typography>
          </Box>
          {plan.settingsNote && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{plan.settingsNote}</Typography>}
          <ErrorNotice error={actionError} sx={{ mb: 0 }} />
          {/*
            The commitment is laid out BEFORE the button that makes it, not
            after — and the button sits here rather than in the card's header so
            it wraps with the words instead of running off a narrow screen.
          */}
          {proposal && (
            <>
              <Note>
                <Box><strong>Accepting writes it down.</strong></Box>
                <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.4 }}>
                  {ACCEPT_WHAT_HAPPENS.map((x) => <li key={x}>{x}</li>)}
                </Box>
                <Box>{ACCEPT_AGAIN}</Box>
              </Note>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', minWidth: 0 }}>
                <Tooltip title={canManage ? 'Writes this layout down. It becomes what the shop cuts to and what the order buys.' : NO_MANAGE}>
                  <span>
                    <Button variant="contained" color="primary" disabled={!canManage || busy != null || t.plates === 0}
                      startIcon={busy === 'accept' ? <CircularProgress size={14} color="inherit" /> : <TaskAltRounded />}
                      onClick={accept}>
                      Accept this layout
                    </Button>
                  </span>
                </Tooltip>
                <Button size="small" startIcon={<UndoRounded />} onClick={() => { setProposal(null); setActionError(null); }} disabled={busy != null}>
                  Back to what is saved
                </Button>
              </Box>
            </>
          )}
          {!canManage && <Note tone="warning"><Box>{NO_MANAGE}</Box></Note>}
        </Box>
      </SectionCard>

      <StatStrip stats={stats} />

      {plan.problems.length > 0 && (
        <Alert severity="warning">
          <Box sx={{ fontWeight: 600, mb: 0.5 }}>Some rectangles were left out of the pack.</Box>
          <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.5, minWidth: 0, overflowWrap: 'anywhere' }}>
            {plan.problems.map((p) => <li key={p}>{p}</li>)}
          </Box>
        </Alert>
      )}

      {drift.length > 0 && (
        <SectionCard title="This layout is out of date"
          subtitle="The structure changed after this layout was accepted, so these rectangles no longer match it. The layout is still exactly what was agreed — nest the line again so the plates it buys match what it cuts.">
          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.5, minWidth: 0 }}>
            {drift.map((d) => (
              <Box key={d.cutPlateId} sx={{ fontSize: 13, overflowWrap: 'anywhere' }}>
                <Mono>{d.code ?? 'A cut piece'}</Mono>{driftWords(d)}
              </Box>
            ))}
          </Box>
        </SectionCard>
      )}

      {unplaced.length > 0 && (
        <SectionCard title={`${unplaced.length} ${unplaced.length === 1 ? 'rectangle' : 'rectangles'} could not be placed`}
          subtitle="Each one says why. A layout cannot be accepted while anything the line needs is missing from it.">
          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.75, minWidth: 0 }}>
            {unplaced.map((u) => (
              <Box key={`${u.cutPlateId}-${u.reason}`} sx={{ fontSize: 13, overflowWrap: 'anywhere' }}>
                <Mono>{u.cutPlateCode}</Mono>{` ×${u.qty} — ${u.reason}`}
              </Box>
            ))}
          </Box>
        </SectionCard>
      )}

      {/* Which rectangles the packer is allowed to touch. */}
      <SectionCard title="Laid out by hand" subtitle={MANUAL_HELP}
        actions={<Badge family={plan.manual.length ? 'warning' : 'neutral'} label={`${plan.manual.length} held back`} noIcon />}>
        {everyCutPlate.length === 0
          ? (
            <EmptyState icon={<PanToolRounded />}
              title={plan.saved ? 'No cut plates on this line' : 'Nothing to list yet'}
              hint={plan.saved
                ? 'A line has rectangles to nest once its structure has plate parts under it.'
                : 'The rectangles appear here once a layout has been proposed — each one with a switch to keep it out of the pack.'} />
          )
          : (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0, minWidth: 0 }}>
              {everyCutPlate.map((cp) => {
                const isManual = manualIds.has(cp.id);
                return (
                  <Box key={cp.id} sx={{
                    display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr) auto', sm: 'minmax(0, 1fr) 150px auto' },
                    alignItems: 'center', columnGap: 1.5, rowGap: 0.25, py: 1, borderBottom: '1px solid var(--c-divider)', minWidth: 0,
                  }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', minWidth: 0 }}>
                        <Box sx={{ width: 10, height: 10, borderRadius: '3px', background: colourOf(cp.id), flexShrink: 0 }} />
                        <Mono sx={{ overflowWrap: 'anywhere' }}>{cp.code ?? cp.name}</Mono>
                      </Box>
                      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>
                        {`${mmPair(cp.length, cp.width)} · ${mm(cp.thickness)} mm ${cp.grade ?? ''} ${cp.material ?? ''}`.trim()}
                      </Typography>
                    </Box>
                    <Box sx={{ display: { xs: 'none', sm: 'block' }, fontSize: 12.5, color: 'var(--c-text-2)' }}>
                      <Mono>{cp.pieces}</Mono>{cp.pieces === 1 ? ' piece' : ' pieces'}
                    </Box>
                    <Tooltip title={canManage
                      ? (isManual ? 'Put it back into the pack.' : 'Keep it out of the pack so it can be placed by hand.')
                      : NO_MANAGE}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifySelf: 'end' }}>
                        {manualBusy === cp.id && <CircularProgress size={14} />}
                        <Switch size="small" checked={isManual} disabled={!canManage || manualBusy != null}
                          slotProps={{ input: { 'aria-label': `Lay ${cp.code ?? cp.name} out by hand` } }}
                          onChange={(e) => setManual(cp, e.target.checked)} />
                      </Box>
                    </Tooltip>
                  </Box>
                );
              })}
            </Box>
          )}
      </SectionCard>

      {plan.groups.length === 0
        ? (
          <SectionCard title="Nothing is laid out yet">
            <EmptyState icon={<GridViewRounded />} title={plan.saved ? 'This line has no plates' : 'No layout has been proposed'}
              hint={plan.saved
                ? 'Nothing was written for this line.'
                : 'Propose a layout to see how many plates this line needs and what they would waste. Nothing is written until you accept it.'} />
          </SectionCard>
        )
        : plan.groups.map((g) => (
          <GroupCard key={g.key} group={g} colourOf={colourOf}
            open={openGroup === g.key}
            onToggle={() => setOpenGroup((k) => (k === g.key ? null : g.key))} />
        ))}

      {plan.sizeAdvice.length > 0 && (
        <SectionCard title="The size the catalogue should have offered"
          subtitle="Waste that belongs to the plate list rather than to the layout: a size nobody stocks that would have fitted, or a stocked plate too tight to carry the ordering margin.">
          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1, minWidth: 0 }}>
            {advice.slice(0, 20).map(({ advice: a, count }, i) => (
              <Box key={`${a.kind ?? 'catalog'}-${a.plateCode ?? a.sheetKey ?? i}-${i}`} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', minWidth: 0 }}>
                <LightbulbOutlined sx={{ fontSize: 17, mt: '2px', color: 'var(--c-warning-600)', flexShrink: 0 }} aria-hidden />
                <Box sx={{ minWidth: 0 }}>
                  <Box sx={{ fontSize: 13, fontWeight: 500, overflowWrap: 'anywhere' }}>
                    {adviceTitle(a)}{count > 1 ? ` · on ${count} plates` : ''}
                  </Box>
                  <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{adviceSentence(a)}</Typography>
                </Box>
              </Box>
            ))}
            {advice.length > 20 && (
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>
                {`${advice.length - 20} more plates have advice of their own.`}
              </Typography>
            )}
          </Box>
        </SectionCard>
      )}
    </Box>
  );
}
