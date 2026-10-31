import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Box, Button, ButtonBase, Chip, CircularProgress, Link, MenuItem, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import LockRounded from '@mui/icons-material/LockRounded';
import { CfApiError } from '../../api/client';
import {
  getExecutionPlan, saveExecutionPlan,
  type DispatchLevel, type ExecutionPlan, type ExecutionPlanLine, type ExecutionPlanView, type PlanChoice, type PlanGroup, type PlanPreviewPart,
  type ProductionLevel,
} from '../../api/executionPlan';
import { useLoad } from '../../hooks/useLoad';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { useFullScreen } from '../../hooks/useFullScreen';
import {
  DISPATCH_WORDS, barOptions, batchIndex, batchSummary, decodeChoice, dispatchTooBig, draftChanged, draftOf, encodeChoice, equalSizes,
  groupsFromSizes, inputOf, isSplit, lineCountWords, lineOptionGroup, lineProduction, movePiece, parseSizes, plainLabel, plural, savedWords,
  showsLineTable, sizesText, visibleOptions, type PlanDraft,
} from '../../lib/executionPlan';
import { ErrorNotice, Mono, SectionCard, SkeletonRows } from '../ui';
import { FullScreenFrame, FullScreenToggle } from '../FullScreen';
import { useToast } from '../toastContext';
import { nudgeIfRefused } from '../salesMotion';
import { FlashOnChange } from '../../motion';

const SHOWN = 12;
/** How long after the last change the live preview asks the server (typing batch sizes stays smooth). */
const PREVIEW_DELAY = 400;
const cellSx = { px: 1, py: 0.5, borderBottom: '1px solid var(--c-divider)', fontSize: 13, verticalAlign: 'middle' } as const;
const selectSx = { minWidth: 170, '& .MuiInputBase-root': { fontSize: 13 }, '& .MuiSelect-select': { py: '4px' } } as const;
const smallTitle = { fontSize: 12, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)' } as const;
/** A colour per batch (the pieces' chips); the ninth batch takes the first colour again. */
const BATCH_COLOURS = ['#1e6fd9', '#2e7d32', '#c75a00', '#8e24aa', '#00838f', '#c62828', '#6d4c41', '#3949ab'];
const colourOf = (i: number) => BATCH_COLOURS[i % BATCH_COLOURS.length];

/** The live list: the count, the first few, and the rest on request. */
function PreviewList({ title, part, testId }: { title: string; part: PlanPreviewPart; testId: string }) {
  const [all, setAll] = useState(false);
  const items = all ? part.items : part.items.slice(0, SHOWN);
  const hidden = part.count - items.length;
  return (
    <Box data-testid={testId} sx={{ minWidth: 0, border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', p: 1.25 }}>
      <Typography sx={{ ...smallTitle, mb: 0.5 }}>{title}</Typography>
      <Typography sx={{ fontSize: 13.5, fontWeight: 600, mb: 0.75 }} data-testid={`${testId}-count`}>{part.count} {part.count === 1 ? 'unit' : 'units'}</Typography>
      <Box component="ol" sx={{ m: 0, pl: 3, display: 'grid', gap: 0.25, fontSize: 12.5, color: 'var(--c-text-2)' }}>
        {items.map((x, i) => <li key={`${i}:${x}`}><Mono>{x}</Mono></li>)}
      </Box>
      {hidden > 0 && (
        part.items.length > items.length
          ? <Button size="small" onClick={() => setAll(true)} sx={{ mt: 0.5 }}>Show {part.items.length - items.length} more</Button>
          : <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mt: 0.5 }}>and {hidden} more</Typography>
      )}
    </Box>
  );
}

/** One big choice card (a radio). */
function ChoiceCard({ title, text, extra, selected, disabled, onClick, testId }: {
  title: string; text: string; extra?: string | null; selected: boolean; disabled: boolean; onClick: () => void; testId: string;
}) {
  return (
    <ButtonBase role="radio" aria-checked={selected} disabled={disabled} onClick={onClick} data-testid={testId} focusRipple
      sx={{
        display: 'block', textAlign: 'left', width: '100%', p: 1.5, borderRadius: 'var(--r-md)', minWidth: 0,
        border: selected ? '2px solid var(--c-primary-600, #1e6fd9)' : '1px solid var(--c-border)',
        background: selected ? 'var(--c-primary-50, rgba(30,111,217,.06))' : 'transparent',
        opacity: disabled && !selected ? 0.6 : 1,
      }}>
      <Typography sx={{ fontSize: 15, fontWeight: 700 }}>{title}</Typography>
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.25 }}>{text}</Typography>
      {extra && <Typography sx={{ fontSize: 12.5, fontWeight: 600, mt: 0.75 }}>{extra}</Typography>}
    </ButtonBase>
  );
}

/**
 * BATCHES for one line (§97, user 2026-11-01): its pieces as chips in tree order, coloured by the batch they are in.
 * Type the sizes ("4, 8") or press "Equal batches of N"; click a piece to move it to the next batch (rows mix freely).
 */
function BatchEditor({ line, noun, groups, ready, editable, onChange }: {
  line: ExecutionPlanLine; noun: string; groups: PlanGroup[]; ready: boolean; editable: boolean; onChange: (groups: PlanGroup[]) => void;
}) {
  const pieces = line.pieces ?? [];
  const n = line.lineNo;
  const [text, setText] = useState(() => sizesText(groups));
  const [equal, setEqual] = useState('');
  // A click on a piece changes the batches: the sizes box follows (typing "4," does not get rewritten to "4").
  useEffect(() => {
    if (sizesText(groupsFromSizes(pieces, parseSizes(text))) !== sizesText(groups)) setText(sizesText(groups));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);
  const head = `Line ${n} · ${line.item?.name ?? line.item?.code ?? 'Item'} ×${line.quantity}`;
  if (!ready) {
    return (
      <Box sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', p: 1.25 }} data-testid={`batches-line-${n}`}>
        <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{head}</Typography>
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mt: 0.5 }}>Working out the pieces…</Typography>
      </Box>
    );
  }
  if (!pieces.length) {
    return (
      <Box sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', p: 1.25 }} data-testid={`batches-line-${n}`}>
        <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{head}</Typography>
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.5 }}>Nothing to split on this line — it is made as one production order.</Typography>
      </Box>
    );
  }
  const at = batchIndex(groups);
  const { batches, alone } = batchSummary(pieces, groups, noun);
  const typed = (v: string) => { setText(v); onChange(groupsFromSizes(pieces, parseSizes(v))); };
  const applyEqual = () => { const sizes = equalSizes(pieces.length, parseSizes(equal)[0] ?? 0); if (sizes.length) typed(sizes.join(', ')); };
  const more = (line.piecesTotal ?? pieces.length) - pieces.length;
  return (
    <Box sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', p: 1.25, display: 'grid', gap: 1, minWidth: 0 }} data-testid={`batches-line-${n}`}>
      <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{head} — {pieces.length} {plural(noun, pieces.length)}</Typography>
      {editable && (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField size="small" label="Batch sizes" placeholder="e.g. 4, 8" value={text} onChange={(e) => typed(e.target.value)}
            inputProps={{ 'aria-label': `Line ${n}: batch sizes`, 'data-testid': `sizes-${n}` }} sx={{ width: 180 }}
            helperText={`Pieces fill the batches in order. Total ${pieces.length}.`} />
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>or equal batches of</Typography>
          <TextField size="small" value={equal} onChange={(e) => setEqual(e.target.value)} placeholder="N" sx={{ width: 70 }}
            inputProps={{ 'aria-label': `Line ${n}: equal batch size`, inputMode: 'numeric', 'data-testid': `equal-size-${n}` }}
            onKeyDown={(e) => { if (e.key === 'Enter') applyEqual(); }} />
          <Button size="small" variant="outlined" onClick={applyEqual} data-testid={`equal-${n}`} disabled={!parseSizes(equal).length}>Make batches</Button>
          {groups.length > 0 && <Button size="small" onClick={() => typed('')} data-testid={`clear-${n}`}>Clear</Button>}
        </Box>
      )}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }} data-testid={`pieces-${n}`}>
        {pieces.map((p, i) => {
          const b = at.get(p.key);
          const where = b == null ? 'on its own' : groups[b]?.name || `Batch ${b + 1}`;
          return (
            <Chip key={p.key} size="small" label={b == null ? p.label : `${b + 1} · ${p.label}`} data-testid={`piece-${n}-${i}`}
              aria-label={`${p.label}: ${where}`} title={editable ? `${where} — click to move to the next batch` : where}
              onClick={editable ? () => onChange(movePiece(groups, p.key, pieces)) : undefined}
              sx={{
                fontSize: 12, borderRadius: '6px', border: '1px solid',
                borderColor: b == null ? 'var(--c-border)' : colourOf(b),
                background: b == null ? 'transparent' : `${colourOf(b)}1f`,
                color: b == null ? 'var(--c-text-2)' : 'var(--c-text-1, inherit)',
              }} />
          );
        })}
        {more > 0 && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', alignSelf: 'center' }}>and {more} more (not shown)</Typography>}
      </Box>
      {editable && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>Click a piece to move it to the next batch — mix rows as you like.</Typography>}
      <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.25, fontSize: 13 }} data-testid={`batch-list-${n}`}>
        {batches.map((g, i) => (
          <li key={g.title} style={{ color: colourOf(i) }}>
            <Box component="span" sx={{ color: 'var(--c-text-1, inherit)' }}><b>{g.title}</b>: {g.labels.slice(0, 6).join(', ')}{g.labels.length > 6 ? ` (+${g.labels.length - 6} more)` : ''}</Box>
          </li>
        ))}
        {alone.length > 0 && (
          <li data-testid={`rest-${n}`}>
            {batches.length ? `${alone.length} left over` : `No batches yet: all ${alone.length}`} — {alone.length === 1 ? 'it becomes its own production order' : 'each becomes its own production order'}.
            {editable && batches.length > 0 && alone.length > 1 && (
              <Link component="button" type="button" sx={{ ml: 1, fontSize: 13 }} data-testid={`rest-batch-${n}`}
                onClick={() => onChange([...groups, { name: null, keys: alone.map((p) => p.key) }])}>Put them in one batch</Link>
            )}
          </li>
        )}
      </Box>
    </Box>
  );
}

/**
 * EXECUTION PLAN — the sales order's second step (user, 2026-10-18), before Freeze design: how the order is MADE
 * (its production orders) and SHIPPED (the dispatch units, the same or smaller). Fixed once a line's design is frozen.
 *
 * 2026-11-01 (user: "the UI is super difficult … they can group different things in a level into a PO … different
 * sizes for each PO … very easy"): one question as three cards — All at once / One per line / Split into batches.
 * Split asks what by (each unit, or the level's own name — Girder line) and shows each line's pieces as chips: type
 * batch sizes ("4, 8") or press Equal batches; click a piece to move it to the next batch. Shipping is one select,
 * folded away. Every change shows what the order will make (a dry run a moment after the last change).
 */
export function ExecutionPlanPanel({ orderId, onChanged }: { orderId: number; onChanged?: () => void }) {
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_orders_manage');
  const full = useFullScreen('so-execution-plan');
  const loaded = useLoad(() => getExecutionPlan(orderId), [orderId]);
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [preview, setPreview] = useState<ExecutionPlanView | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  // Nothing to choose: the panel is one sentence until "Change" opens it.
  const [expanded, setExpanded] = useState(false);
  const [shipOpen, setShipOpen] = useState(false);
  const [linesOpen, setLinesOpen] = useState(false);
  const seq = useRef(0);

  const saved = loaded.data;
  useEffect(() => { if (saved) { setDraft(draftOf(saved)); setPreview(null); } }, [saved]);

  const dirty = !!draft && !!saved && draftChanged(draft, saved);
  // Live preview: a dry run a moment after the last change. It never throws — a failure is one quiet line.
  useEffect(() => {
    if (!draft || !saved || !dirty) { setPreview(null); setPreviewError(null); return undefined; }
    const my = ++seq.current;
    const t = window.setTimeout(async () => {
      setChecking(true);
      try {
        const v = await saveExecutionPlan(orderId, inputOf(draft, saved, true));
        if (seq.current === my) { setPreview(v); setPreviewError(null); }
      } catch (e) {
        if (seq.current === my) setPreviewError((e as Error)?.message ?? 'The preview could not be worked out.');
      } finally { if (seq.current === my) setChecking(false); }
    }, PREVIEW_DELAY);
    return () => window.clearTimeout(t);
  }, [draft, saved, dirty, orderId]);

  const shown = preview ?? saved;
  const editable = !!saved?.editable && canManage;
  if (loaded.error) return <ErrorNotice error={loaded.error} onRetry={loaded.reload} />;
  if (!saved || !draft || !shown) return <SkeletonRows rows={4} height={64} />;

  const madeLines = shown.lines.filter((l) => l.made);
  // Changing how a line is made clears its batches (they were pieces of the old level).
  const setProduction = (production: PlanChoice<ProductionLevel>) => setDraft((d) => {
    if (!d) return d;
    const groups = { ...d.groups };
    if (encodeChoice(production) !== encodeChoice(d.production)) for (const l of shown.lines) if (!d.own[l.lineId]) groups[l.lineId] = [];
    const next: PlanDraft = { ...d, production, groups };
    // A shipment that no longer fits inside the production order goes back to "the same".
    if (dispatchTooBig(production.level, next.dispatch.level)) next.dispatch = { level: 'same', levelId: null };
    return next;
  });
  const setDispatch = (dispatch: PlanChoice<DispatchLevel>) => setDraft((d) => (d ? { ...d, dispatch } : d));
  const setGroups = (lineId: number, groups: PlanGroup[]) => setDraft((d) => (d ? { ...d, groups: { ...d.groups, [lineId]: groups } } : d));
  const setOwn = (lineId: number, own: ExecutionPlan | null) => setDraft((d) => {
    if (!d) return d;
    const was = d.own[lineId]?.production ?? d.production;
    const now = own?.production ?? d.production;
    return { ...d, own: { ...d.own, [lineId]: own }, groups: encodeChoice(was) === encodeChoice(now) ? d.groups : { ...d.groups, [lineId]: [] } };
  });
  const save = async (button?: HTMLElement) => {
    setSaving(true); setError(null);
    try {
      const v = await saveExecutionPlan(orderId, inputOf(draft, saved));
      loaded.setData(v);
      toast.success('Execution plan saved.');
      onChanged?.();
    } catch (e) { setError(e as CfApiError); nudgeIfRefused(e, button); } finally { setSaving(false); }
  };

  const problems = shown.problems;
  const prodGroup = barOptions(shown, 'production');
  const dispGroup = barOptions(shown, 'dispatch');
  const prodKey = encodeChoice(draft.production);
  const dispKey = encodeChoice(draft.dispatch);
  const optionOf = (key: string) => prodGroup.options.find((o) => o.key === key) ?? null;
  const countWords = (key: string) => {
    const o = optionOf(key);
    if (!o) return null;
    if (o.problem) return `Not possible: ${o.problem}`;
    return o.count == null ? null : `${o.count} production order${o.count === 1 ? '' : 's'}`;
  };
  const mode: 'order' | 'line' | 'split' = draft.production.level === 'order' ? 'order' : draft.production.level === 'line' ? 'line' : 'split';
  // "All at once" gives the same as "One per line" on an order of one line: the card is not offered then.
  const orderHidden = !!optionOf('order')?.hidden && prodKey !== 'order';
  // What a split can be by: each unit (when a line has more than one), and each level the lines have, by its own name.
  const unitName = madeLines.find((l) => l.item?.name)?.item?.name ?? 'unit';
  const splitBy: { key: string; label: string; choice: PlanChoice<ProductionLevel> }[] = [
    ...(madeLines.some((l) => l.quantity > 1) || prodKey === 'unit' ? [{ key: 'unit', label: `Each ${unitName}`, choice: { level: 'unit' as const, levelId: null } }] : []),
    ...shown.levels.map((lv) => ({ key: `assembly:${lv.id}`, label: `Each ${lv.name}`, choice: { level: 'assembly' as const, levelId: lv.id } })),
  ];
  const startSplit = () => {
    if (mode === 'split') return;
    const first = splitBy.find((s) => s.key.startsWith('assembly')) ?? splitBy[0];
    if (first) setProduction(first.choice);
  };
  const nounOf = (c: PlanChoice<ProductionLevel>, l: ExecutionPlanLine) => (c.level === 'unit'
    ? (l.item?.name ?? 'unit')
    : shown.levels.find((lv) => lv.id === c.levelId)?.name ?? l.levels.find((lv) => lv.id === c.levelId)?.name ?? 'piece');

  // NOTHING TO CHOOSE (2026-10-24): one sentence, and "Change" opens the whole panel.
  if (shown.nothingToChoose && !expanded && !dirty) {
    return (
      <SectionCard title="Execution plan" subtitle="How the order is made and shipped.">
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap' }} data-testid="execution-plan">
          <Typography sx={{ fontSize: 14 }} data-testid="plan-nothing">{shown.summary ?? 'Nothing to choose for this order.'}</Typography>
          <Link component="button" type="button" onClick={() => setExpanded(true)} data-testid="plan-change" sx={{ fontSize: 13.5 }}>Change</Link>
        </Box>
      </SectionCard>
    );
  }

  // The lines whose batches can be set: made, split (their own way or the order's).
  const batchLines = madeLines.filter((l) => isSplit(lineProduction(draft, l.lineId).level));
  const dispOptions = visibleOptions(dispGroup, dispKey);
  const tooBig = dispOptions.filter((o) => dispatchTooBig(draft.production.level, o.choice.level));

  // A line's select: "Same as the whole order" (saying what that gives), then every option not folded in.
  const lineOptions = (l: ExecutionPlanLine, kind: 'production' | 'dispatch', current: string) => {
    const group = lineOptionGroup(l, kind);
    return [
      <MenuItem key="as-order" value="">{group.asOrder ? plainLabel(group.asOrder) : 'Same as the whole order'}</MenuItem>,
      ...visibleOptions(group, current).map((o) => (
        <MenuItem key={o.key} value={o.key} disabled={kind === 'dispatch' && dispatchTooBig(l.plan.production.level, o.choice.level as DispatchLevel)}>{plainLabel(o.label)}</MenuItem>
      )),
    ];
  };
  const folded = (open: boolean, onToggle: () => void, label: ReactNode, testId: string) => (
    <Button size="small" onClick={onToggle} aria-expanded={open} data-testid={testId} sx={{ justifySelf: 'start', textTransform: 'none', px: 0.5 }}>
      {open ? '▾' : '▸'}&nbsp;{label}
    </Button>
  );

  return (
    <FullScreenFrame on={full.on} onExit={() => full.set(false)}>
      <SectionCard title="Execution plan" subtitle="How the order is made and shipped. Set it before you freeze the design."
        actions={<FullScreenToggle on={full.on} onToggle={full.toggle} />}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, minWidth: 0 }} data-testid="execution-plan">
          <ErrorNotice error={error} sx={{ mb: 0 }} />
          {!saved.editable && (
            <Box role="status" sx={{ display: 'flex', gap: 1, alignItems: 'center', p: 1, borderRadius: 'var(--r-md)', background: 'var(--c-info-50)', border: '1px solid var(--c-info-200)', fontSize: 13 }}>
              <LockRounded sx={{ fontSize: 17 }} aria-hidden />{saved.readOnlyReason}
            </Box>
          )}

          {/* 1. How the order is made: three cards. */}
          <Box sx={{ display: 'grid', gap: 1 }}>
            <Typography sx={{ fontSize: 14.5, fontWeight: 600 }}>How should the production orders be made?</Typography>
            <Box role="radiogroup" aria-label="How the production orders are made"
              sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: `repeat(${orderHidden ? 2 : 3}, minmax(0, 1fr))` }, gap: 1 }}>
              {!orderHidden && (
                <ChoiceCard title="All at once" text="One production order for the whole order." extra={countWords('order')}
                  selected={mode === 'order'} disabled={!editable} onClick={() => setProduction({ level: 'order', levelId: null })} testId="mode-order" />
              )}
              <ChoiceCard title="One per line" text="Each line is one production order. The usual choice." extra={countWords('line')}
                selected={mode === 'line'} disabled={!editable} onClick={() => setProduction({ level: 'line', levelId: null })} testId="mode-line" />
              <ChoiceCard title="Split into batches" text="Break a line into smaller production orders, of any sizes you like."
                extra={mode === 'split' ? `${shown.preview.production.count} production order${shown.preview.production.count === 1 ? '' : 's'}` : null}
                selected={mode === 'split'} disabled={!editable || !splitBy.length} onClick={startSplit} testId="mode-split" />
            </Box>
          </Box>

          {mode === 'split' && (
            <Box sx={{ display: 'grid', gap: 1.25, minWidth: 0 }}>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>Split by:</Typography>
                <ToggleButtonGroup exclusive size="small" value={prodKey} disabled={!editable} aria-label="Split by"
                  onChange={(_, v: string | null) => { if (v) setProduction(decodeChoice<ProductionLevel>(v)); }} sx={{ flexWrap: 'wrap' }}>
                  {splitBy.map((s) => {
                    const o = optionOf(s.key);
                    return (
                      <ToggleButton key={s.key} value={s.key} disabled={!editable || !!o?.problem} data-testid={`split-${s.key.replace(':', '-')}`} sx={{ textTransform: 'none' }}>
                        <Tooltip title={o?.problem ? `Not possible: ${o.problem}` : ''}><span>{s.label}</span></Tooltip>
                      </ToggleButton>
                    );
                  })}
                </ToggleButtonGroup>
              </Box>
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                Each piece is its own production order until you put pieces in a batch. A batch is one production order.
                {draft.production.level === 'assembly' ? ' What is not inside a piece (and the final assembly) stays one production order per unit.' : ''}
              </Typography>
              {batchLines.map((l) => {
                const c = lineProduction(draft, l.lineId);
                return (
                  <BatchEditor key={`${l.lineId}:${encodeChoice(c)}`} line={l} noun={nounOf(c, l)} groups={draft.groups[l.lineId] ?? []}
                    ready={encodeChoice(l.plan.production) === encodeChoice(c) && l.pieces !== undefined}
                    editable={editable && !l.frozen} onChange={(g) => setGroups(l.lineId, g)} />
                );
              })}
            </Box>
          )}

          {/* What it makes. */}
          <Box sx={{ display: 'grid', gap: 0.5 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 600 }} aria-live="polite" data-testid="plan-sentence">
              <FlashOnChange value={shown.preview.production.sentence}>{shown.preview.production.sentence}</FlashOnChange>{checking ? ' …' : ''}
            </Typography>
            {previewError && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }} data-testid="plan-preview-error">The preview could not be updated: {previewError}</Typography>}
          </Box>
          <PreviewList title="Production orders" part={shown.preview.production} testId="preview-production" />

          {/* 2. Shipping — folded away. */}
          <Box sx={{ display: 'grid', gap: 1, borderTop: '1px solid var(--c-divider)', pt: 1 }}>
            {folded(shipOpen, () => setShipOpen((o) => !o), <>Shipping: <b>{plainLabel(dispGroup.options.find((o) => o.key === dispKey)?.name ?? DISPATCH_WORDS[draft.dispatch.level])}</b></>, 'shipping-toggle')}
            {shipOpen && (
              <Box sx={{ display: 'grid', gap: 1, minWidth: 0 }} data-testid="shipping">
                <TextField select size="small" label="Ship as" value={dispKey} disabled={!editable} onChange={(e) => setDispatch(decodeChoice<DispatchLevel>(e.target.value))}
                  inputProps={{ 'aria-label': 'Ship as' }} sx={{ maxWidth: 460 }}>
                  {dispOptions.map((o) => (
                    <MenuItem key={o.key} value={o.key} data-testid={`disp-${o.key.replace(':', '-')}`} disabled={dispatchTooBig(draft.production.level, o.choice.level)}>{plainLabel(o.label)}</MenuItem>
                  ))}
                </TextField>
                {tooBig.length > 0 && (
                  <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }} data-testid="shipping-why">
                    {tooBig.map((o) => plainLabel(o.name)).join(' and ')} {tooBig.length === 1 ? 'is' : 'are'} not offered: a shipment cannot be bigger than a production order.
                  </Typography>
                )}
                {dispGroup.note && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }} data-testid="disp-note">{plainLabel(dispGroup.note)}</Typography>}
                <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{shown.preview.dispatch.sentence}</Typography>
                <PreviewList title="Dispatch units" part={shown.preview.dispatch} testId="preview-dispatch" />
              </Box>
            )}
          </Box>

          {/* 3. A line made differently — folded away; only with more than one line. */}
          {showsLineTable(shown) && (
            <Box sx={{ display: 'grid', gap: 1, borderTop: '1px solid var(--c-divider)', pt: 1, minWidth: 0 }}>
              {folded(linesOpen, () => setLinesOpen((o) => !o), <>A line made differently{Object.values(draft.own).some(Boolean) ? ` (${Object.values(draft.own).filter(Boolean).length})` : ''}</>, 'lines-toggle')}
              {linesOpen && <Box sx={{ overflowX: 'auto', minWidth: 0 }}>
                <Box component="table" sx={{ borderCollapse: 'collapse', width: '100%', minWidth: 640 }} data-testid="plan-lines">
                  <thead>
                    <tr>
                      {['Line', 'Sells', 'Production orders', 'Shipping', 'Makes'].map((h) => (
                        <Box component="th" key={h} sx={{ ...cellSx, textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--c-text-3)' }}>{h}</Box>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.lines.map((l) => {
                      const own = draft.own[l.lineId] ?? null;
                      const fixed = l.frozen || !editable || !l.made;
                      // A line's own plan holds both columns; "Same as the whole order" in one column takes the order's choice there.
                      const pick = (kind: 'production' | 'dispatch', value: string) => {
                        const base: ExecutionPlan = own ?? { production: { ...draft.production }, dispatch: { ...draft.dispatch } };
                        const next: ExecutionPlan = kind === 'production'
                          ? { ...base, production: value ? decodeChoice<ProductionLevel>(value) : { ...draft.production } }
                          : { ...base, dispatch: value ? decodeChoice<DispatchLevel>(value) : { ...draft.dispatch } };
                        const asOrder = encodeChoice(next.production) === encodeChoice(draft.production) && encodeChoice(next.dispatch) === encodeChoice(draft.dispatch);
                        setOwn(l.lineId, asOrder ? null : next);
                      };
                      return (
                        <tr key={l.lineId} data-testid={`plan-line-${l.lineNo}`}>
                          <Box component="td" sx={cellSx}><Mono muted>{l.lineNo}</Mono></Box>
                          <Box component="td" sx={{ ...cellSx, minWidth: 160 }}>
                            {l.item?.name ?? l.item?.code ?? '—'} <Mono muted>×{l.quantity}</Mono>
                            {l.frozen && <Tooltip title="Its design is frozen, so its plan is fixed. A change needs a revision."><LockRounded aria-label="Frozen" sx={{ fontSize: 15, ml: 0.5, verticalAlign: '-2px', color: 'var(--c-text-3)' }} /></Tooltip>}
                          </Box>
                          <Box component="td" sx={cellSx}>
                            {l.made
                              ? <TextField select size="small" value={own ? encodeChoice(own.production) : ''} disabled={fixed} onChange={(e) => pick('production', e.target.value)} sx={selectSx}
                                  inputProps={{ 'aria-label': `Line ${l.lineNo}: production orders` }} SelectProps={{ displayEmpty: true }}>
                                  {lineOptions(l, 'production', own ? encodeChoice(own.production) : '')}
                                </TextField>
                              : <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>Taken from stock</Typography>}
                          </Box>
                          <Box component="td" sx={cellSx}>
                            {l.made && (
                              <TextField select size="small" value={own ? encodeChoice(own.dispatch) : ''} disabled={fixed} onChange={(e) => pick('dispatch', e.target.value)} sx={selectSx}
                                inputProps={{ 'aria-label': `Line ${l.lineNo}: dispatch` }} SelectProps={{ displayEmpty: true }}>
                                {lineOptions(l, 'dispatch', own ? encodeChoice(own.dispatch) : '')}
                              </TextField>
                            )}
                          </Box>
                          <Box component="td" sx={cellSx}>
                            <Mono>{lineCountWords(l)}</Mono>
                            {l.problems.length > 0 && <Typography sx={{ fontSize: 12, color: 'var(--c-warning-800)' }}>{l.problems[0]}</Typography>}
                          </Box>
                        </tr>
                      );
                    })}
                  </tbody>
                </Box>
              </Box>}
              {!linesOpen && shown.lines.some((l) => !l.made) && (
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>
                  {shown.lines.filter((l) => !l.made).map((l) => `Line ${l.lineNo}`).join(', ')}: taken from stock — no production order.
                </Typography>
              )}
            </Box>
          )}

          {problems.length > 0 && (
            <Box role="alert" data-testid="plan-problems" sx={{ p: 1, borderRadius: 'var(--r-md)', background: 'var(--c-warning-50)', border: '1px solid var(--c-warning-200)', fontSize: 13 }}>
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>{problems.map((p) => <li key={p}>{p}</li>)}</Box>
            </Box>
          )}

          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--c-divider)', pt: 1.25 }}>
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', flex: '1 1 260px' }} data-testid="plan-saved">
              {dirty ? 'Changes not saved yet.' : savedWords(saved)} {shown.note}
            </Typography>
            {editable && dirty && <Button onClick={() => setDraft(draftOf(saved))} disabled={saving}>Undo changes</Button>}
            {editable && (
              <Button variant="contained" onClick={(e) => void save(e.currentTarget)} disabled={saving || checking || problems.length > 0 || (!dirty && !!saved.saved)} data-testid="plan-save"
                startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}>
                {saving ? 'Saving…' : saved.saved && !dirty ? 'Saved' : 'Save the plan'}
              </Button>
            )}
          </Box>
        </Box>
      </SectionCard>
    </FullScreenFrame>
  );
}
