import { useEffect, useMemo, useState } from 'react';
import { Box, Button, ButtonBase, Checkbox, Chip, CircularProgress, IconButton, Link, MenuItem, TextField, Typography } from '@mui/material';
import LockRounded from '@mui/icons-material/LockRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import { CfApiError } from '../../api/client';
import {
  getExecutionPlan, saveExecutionPlan,
  type DispatchLevel, type ExecutionPlanInput, type ExecutionPlanView, type PlanChoice, type PlanGroup, type ProductionLevel,
} from '../../api/executionPlan';
import { useLoad } from '../../hooks/useLoad';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { useFullScreen } from '../../hooks/useFullScreen';
import { DISPATCH_WORDS, barOptions, customTree, decodeChoice, dispatchTooBig, encodeChoice, plainLabel, savedWords, visibleOptions, type CustomRow } from '../../lib/executionPlan';
import { ErrorNotice, InfoTip, Mono, SectionCard, SkeletonRows } from '../ui';
import { FullScreenFrame, FullScreenToggle } from '../FullScreen';
import { useToast } from '../toastContext';
import { nudgeIfRefused } from '../salesMotion';
import { ConfirmDialog } from '../ConfirmDialog';

/** A colour per custom production order (its chip and its rows); the ninth takes the first again. */
const PO_COLOURS = ['#1e6fd9', '#2e7d32', '#c75a00', '#8e24aa', '#00838f', '#c62828', '#6d4c41', '#3949ab'];
const colourOf = (i: number) => PO_COLOURS[i % PO_COLOURS.length];
const SHOWN = 8;

type Mode = 'order' | 'line' | 'unit' | 'custom';
const MODES: { mode: Mode; title: string; tip: string }[] = [
  { mode: 'order', title: 'Entire order', tip: 'One production order for everything on the order.' },
  { mode: 'line', title: 'Per line', tip: 'One production order for each line of the order. The usual choice.' },
  { mode: 'unit', title: 'Per qty', tip: 'One production order for each unit of a line — a line of 3 spans makes 3.' },
  { mode: 'custom', title: 'Custom', tip: 'Pick rows of the BOM and make a production order of them. A row picked takes everything under it that is not in another production order yet. Whatever nobody picks is one more production order per line.' },
];

/** One big choice (a radio): its title and what it makes. */
function ModeCard({ title, tip, extra, selected, disabled, onClick, testId }: {
  title: string; tip: string; extra: string | null; selected: boolean; disabled: boolean; onClick: () => void; testId: string;
}) {
  return (
    <Box sx={{ position: 'relative', minWidth: 0 }}>
      <ButtonBase role="radio" aria-checked={selected} disabled={disabled} onClick={onClick} data-testid={testId} focusRipple
        sx={{
          display: 'block', textAlign: 'left', width: '100%', p: 1.5, pr: 4, borderRadius: 'var(--r-md)', minWidth: 0, height: '100%',
          border: selected ? '2px solid var(--c-primary-600, #1e6fd9)' : '1px solid var(--c-border)',
          background: selected ? 'var(--c-primary-50, rgba(30,111,217,.06))' : 'transparent',
          opacity: disabled && !selected ? 0.6 : 1,
        }}>
        <Typography sx={{ fontSize: 15, fontWeight: 700 }}>{title}</Typography>
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.25, minHeight: 18 }}>{extra ?? ' '}</Typography>
      </ButtonBase>
      <Box sx={{ position: 'absolute', top: 10, right: 10 }}><InfoTip text={tip} label={`About ${title}`} size={16} /></Box>
    </Box>
  );
}

/**
 * CUSTOM (user, 2026-11-12): the whole BOM of every line; tick rows (a row takes everything under it) and make a production
 * order of them. Rows already in one are not shown — unless that production order's chip is picked, then they show in its
 * colour. Whatever nobody picks is one production order per line ("the rest").
 */
function CustomPicker({ view, groups, editable, busy, onGroups }: {
  view: ExecutionPlanView; groups: PlanGroup[]; editable: boolean; busy: boolean; onGroups: (g: PlanGroup[]) => void;
}) {
  const [showing, setShowing] = useState<ReadonlySet<number>>(new Set());
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(view.lines.filter((l) => l.made).map((l) => `L${l.lineId}`)));
  const tree = useMemo(() => customTree(view, groups), [view, groups]);
  // A tick goes when its row joins a production order (or the BOM changes).
  useEffect(() => { setTicked((t) => new Set([...t].filter((k) => tree.byKey.has(k) && tree.byKey.get(k)!.group == null))); }, [tree]);
  useEffect(() => { setShowing((s) => new Set([...s].filter((i) => i < groups.length))); }, [groups.length]);

  const tickedAbove = (r: CustomRow) => { for (let p = r.parent; p; p = tree.byKey.get(p)?.parent ?? null) if (ticked.has(p)) return true; return false; };
  const visible = (r: CustomRow) => r.group == null || showing.has(r.group);
  const toggleTick = (key: string) => setTicked((t) => {
    const n = new Set(t);
    if (n.has(key)) n.delete(key);
    else {
      n.add(key);
      // A row ticked takes its children with it: their own ticks go.
      for (const k of [...n]) if (k !== key && tree.isUnder(k, key)) n.delete(k);
    }
    return n;
  });
  const make = () => { onGroups([...groups, { name: null, keys: [...ticked] }]); setTicked(new Set()); };
  const remove = (i: number) => { onGroups(groups.filter((_, j) => j !== i)); setShowing(new Set()); };

  const rows: CustomRow[] = [];
  const walk = (key: string) => {
    const r = tree.byKey.get(key);
    if (!r || !visible(r)) return;
    rows.push(r);
    if (open.has(key)) for (const k of r.children) walk(k);
  };
  for (const root of tree.roots) walk(root);
  const restLines = tree.restLines;

  return (
    <Box sx={{ display: 'grid', gap: 1.25, minWidth: 0 }} data-testid="custom-picker">
      {/* The production orders made so far: a chip each; a click shows its rows in the BOM, in its colour. */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }} data-testid="custom-chips">
        <Typography sx={{ fontSize: 13, fontWeight: 600, mr: 0.5 }}>Production orders</Typography>
        {groups.map((g, i) => {
          const on = showing.has(i);
          return (
            <Chip key={`${i}:${g.keys[0]}`} size="small" data-testid={`po-chip-${i}`} aria-pressed={on}
              label={`${g.name || `PO ${i + 1}`} · ${g.keys.length} ${g.keys.length === 1 ? 'row' : 'rows'}`}
              onClick={() => setShowing((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
              onDelete={editable && !busy ? () => remove(i) : undefined}
              sx={{ fontWeight: 600, border: '1px solid', borderColor: colourOf(i), background: on ? colourOf(i) : `${colourOf(i)}1f`, color: on ? '#fff' : 'inherit', '& .MuiChip-deleteIcon': { color: on ? '#fff' : colourOf(i) } }} />
          );
        })}
        {restLines.map((l) => (
          <Chip key={`rest-${l.lineId}`} size="small" variant="outlined" data-testid={`po-rest-${l.lineNo}`}
            label={view.lines.filter((x) => x.made).length > 1 ? `Rest of line ${l.lineNo}` : groups.length ? 'The rest' : 'Everything (nothing picked yet)'}
            sx={{ borderStyle: 'dashed', color: 'var(--c-text-2)' }} />
        ))}
        <InfoTip text="Each chip is one production order. Click a chip to see its rows in the BOM below (in its colour); × removes it and its rows come back. Whatever nobody picks is made as one more production order per line (the dashed chip)." />
      </Box>

      {/* The BOM: what is not in a production order yet. */}
      <Box sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', maxHeight: 460, overflow: 'auto', minWidth: 0 }} data-testid="custom-bom">
        {rows.length === 0 && (
          <Typography sx={{ p: 1.5, fontSize: 13, color: 'var(--c-text-2)' }}>Every row is in a production order.</Typography>
        )}
        {rows.map((r) => {
          const kids = r.children.filter((k) => visible(tree.byKey.get(k)!));
          const isOpen = open.has(r.key);
          const inPo = r.group != null;
          const under = !inPo && tickedAbove(r);
          const colour = inPo ? colourOf(r.group!) : null;
          return (
            <Box key={r.key} data-testid={`bom-row-${r.key}`} data-group={r.group ?? ''}
              sx={{
                display: 'flex', alignItems: 'center', gap: 0.5, pl: 0.5 + r.depth * 2.25, pr: 1, minHeight: 32, borderBottom: '1px solid var(--c-divider)', fontSize: 13,
                background: colour ? `${colour}1f` : ticked.has(r.key) || under ? 'var(--c-primary-50, rgba(30,111,217,.06))' : 'transparent',
                borderLeft: colour ? `3px solid ${colour}` : '3px solid transparent',
              }}>
              <IconButton size="small" sx={{ p: 0.25, visibility: kids.length ? 'visible' : 'hidden' }} aria-label={isOpen ? `Fold ${r.label}` : `Open ${r.label}`} aria-expanded={isOpen}
                onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(r.key)) n.delete(r.key); else n.add(r.key); return n; })}>
                {isOpen ? <ExpandMoreRounded sx={{ fontSize: 18 }} /> : <ChevronRightRounded sx={{ fontSize: 18 }} />}
              </IconButton>
              {inPo
                ? <Box sx={{ width: 30, flexShrink: 0 }} />
                : <Checkbox size="small" sx={{ p: 0.5 }} checked={ticked.has(r.key) || under} disabled={!editable || busy || under}
                    onChange={() => toggleTick(r.key)} inputProps={{ 'aria-label': `Pick ${r.label}`, ...{ 'data-testid': `tick-${r.key}` } }} />}
              <Box component="span" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: r.depth === 0 ? 600 : 400 }}>{r.label}</Box>
              {inPo && <Mono sx={{ fontSize: 12, color: colour ?? undefined }}>{groups[r.group!]?.name || `PO ${r.group! + 1}`}</Mono>}
              <Mono muted>×{r.qty}</Mono>
            </Box>
          );
        })}
        {tree.cut && <Typography sx={{ p: 1, fontSize: 12, color: 'var(--c-text-3)' }}>Very large BOM: only its first rows are listed.</Typography>}
      </Box>

      {editable && (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button variant="contained" disabled={!ticked.size || busy} onClick={make} data-testid="custom-make"
            startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>
            Create production order{ticked.size ? ` (${ticked.size} ${ticked.size === 1 ? 'row' : 'rows'})` : ''}
          </Button>
          {ticked.size > 0 && <Button onClick={() => setTicked(new Set())} disabled={busy}>Clear ticks</Button>}
        </Box>
      )}
    </Box>
  );
}

/**
 * EXECUTION PLAN — the sales order's step before Freeze design: how the order is MADE (its production orders).
 *
 * 2026-11-12 (user: "needs to be super simplified. First give options of entire order, per line, per qty and custom … If you
 * need to add any text to describe things, just give an i button"): four cards; a click saves the choice. Custom shows the
 * whole BOM (CustomPicker). Shipping is one select behind "More options". A line's own plan (the older per-line table) is
 * cleared when a choice is saved here: the choice is the order's.
 */
export function ExecutionPlanPanel({ orderId, onChanged }: { orderId: number; onChanged?: () => void }) {
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_orders_manage');
  const full = useFullScreen('so-execution-plan');
  const loaded = useLoad(() => getExecutionPlan(orderId), [orderId]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [more, setMore] = useState(false);
  const [listAll, setListAll] = useState(false);
  // Leaving Custom drops the production orders picked there: asked first.
  const [leaving, setLeaving] = useState<Mode | null>(null);

  const view = loaded.data;
  if (loaded.error) return <ErrorNotice error={loaded.error} onRetry={loaded.reload} />;
  if (!view) return <SkeletonRows rows={4} height={64} />;

  const editable = !!view.editable && canManage;
  const P = view.plan.production;
  const mode: Mode | null = P.level === 'assembly' ? null : (P.level as Mode);
  const groups = P.level === 'custom' ? view.plan.groups ?? [] : [];
  const prodGroup = barOptions(view, 'production');
  const countOf = (key: string) => {
    const o = prodGroup.options.find((x) => x.key === key);
    if (!o) return null;
    if (o.problem) return `Not possible: ${o.problem}`;
    return o.count == null ? null : `${o.count} production order${o.count === 1 ? '' : 's'}`;
  };
  const made = view.lines.filter((l) => l.made);

  const save = async (body: ExecutionPlanInput, done: string, button?: HTMLElement) => {
    setSaving(true); setError(null);
    try {
      const v = await saveExecutionPlan(orderId, {
        ...body,
        // The choice is the order's: a line's own older plan goes (frozen lines keep theirs — the server pins them).
        lines: view.lines.filter((l) => l.made && !l.frozen && l.own).map((l) => ({ lineId: l.lineId, own: null })),
      });
      loaded.setData(v);
      toast.success(done);
      onChanged?.();
    } catch (e) { setError(e as CfApiError); nudgeIfRefused(e, button); } finally { setSaving(false); }
  };
  const choose = (m: Mode, button?: HTMLElement, sure = false) => {
    if (m === mode && view.saved?.at) return;
    if (mode === 'custom' && m !== 'custom' && groups.length && !sure) { setLeaving(m); return; }
    const production: PlanChoice<ProductionLevel> = { level: m, levelId: null };
    const dispatch: PlanChoice<DispatchLevel> = m === 'custom' || dispatchTooBig(m, view.plan.dispatch.level) ? { level: 'same', levelId: null } : view.plan.dispatch;
    void save({ production, dispatch, ...(m === 'custom' ? { groups: P.level === 'custom' ? groups : [] } : {}) }, 'Execution plan saved.', button);
  };
  const setGroups = (g: PlanGroup[]) => void save({ production: { level: 'custom', levelId: null }, dispatch: { level: 'same', levelId: null }, groups: g },
    g.length > groups.length ? 'Production order created.' : 'Production order removed.');

  // NOTHING TO CHOOSE (2026-10-24): one sentence, and "Change" opens the whole panel.
  if (view.nothingToChoose && !expanded && P.level !== 'custom') {
    return (
      <SectionCard title="Execution plan">
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap' }} data-testid="execution-plan">
          <Typography sx={{ fontSize: 14 }} data-testid="plan-nothing">{view.summary ?? 'Nothing to choose for this order.'}</Typography>
          <Link component="button" type="button" onClick={() => setExpanded(true)} data-testid="plan-change" sx={{ fontSize: 13.5 }}>Change</Link>
        </Box>
      </SectionCard>
    );
  }

  const prodPreview = view.preview.production;
  const dispGroup = barOptions(view, 'dispatch');
  const dispKey = encodeChoice(view.plan.dispatch);
  const dispOptions = visibleOptions(dispGroup, dispKey);
  const anyMany = made.some((l) => l.quantity > 1);

  return (
    <FullScreenFrame on={full.on} onExit={() => full.set(false)}>
      <SectionCard
        title={<Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>Execution plan
          <InfoTip testId="plan-info" text="How the order is split into production orders. Pick one; it is saved at once. Set it before you freeze the design — after that it is fixed. The Production step then creates these production orders." /></Box>}
        actions={<FullScreenToggle on={full.on} onToggle={full.toggle} />}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, minWidth: 0 }} data-testid="execution-plan">
          <ErrorNotice error={error} sx={{ mb: 0 }} />
          {!view.editable && (
            <Box role="status" sx={{ display: 'flex', gap: 1, alignItems: 'center', p: 1, borderRadius: 'var(--r-md)', background: 'var(--c-info-50)', border: '1px solid var(--c-info-200)', fontSize: 13 }}>
              <LockRounded sx={{ fontSize: 17 }} aria-hidden />{view.readOnlyReason}
            </Box>
          )}

          <Box role="radiogroup" aria-label="How the production orders are made"
            sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1 }}>
            {MODES.map((m) => (
              <ModeCard key={m.mode} title={m.title} tip={m.tip} testId={`mode-${m.mode}`}
                extra={m.mode === 'custom' ? (mode === 'custom' ? `${prodPreview.count} production order${prodPreview.count === 1 ? '' : 's'}` : 'Pick from the BOM')
                  : m.mode === 'unit' && !anyMany ? 'Every line is 1 unit' : countOf(m.mode)}
                selected={mode === m.mode} disabled={!editable || saving} onClick={() => choose(m.mode)} />
            ))}
          </Box>
          {P.level === 'assembly' && (
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }} data-testid="plan-older">
              Saved earlier as “{plainLabel(view.planWords)}”. Pick one above to change it.
            </Typography>
          )}

          {mode === 'custom' && <CustomPicker view={view} groups={groups} editable={editable} busy={saving} onGroups={setGroups} />}

          {/* What it makes: one line, the list on request. */}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: 14, fontWeight: 600 }} aria-live="polite" data-testid="plan-sentence">
              Makes {prodPreview.count} production order{prodPreview.count === 1 ? '' : 's'}{saving ? ' …' : ''}
            </Typography>
            {prodPreview.items.length > 0 && (
              <Link component="button" type="button" sx={{ fontSize: 13 }} onClick={() => setListAll((o) => !o)} data-testid="plan-list-toggle">
                {listAll ? 'Hide the list' : 'Show the list'}
              </Link>
            )}
          </Box>
          {listAll && (
            <Box component="ol" sx={{ m: 0, pl: 3, display: 'grid', gap: 0.25, fontSize: 12.5, color: 'var(--c-text-2)' }} data-testid="preview-production">
              {prodPreview.items.slice(0, listAll ? undefined : SHOWN).map((x, i) => <li key={`${i}:${x}`}><Mono>{x}</Mono></li>)}
              {prodPreview.more > 0 && <li style={{ listStyle: 'none' }}>and {prodPreview.more} more</li>}
            </Box>
          )}

          {view.problems.length > 0 && (
            <Box role="alert" data-testid="plan-problems" sx={{ p: 1, borderRadius: 'var(--r-md)', background: 'var(--c-warning-50)', border: '1px solid var(--c-warning-200)', fontSize: 13 }}>
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>{view.problems.map((p) => <li key={p}>{p}</li>)}</Box>
            </Box>
          )}

          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--c-divider)', pt: 1.25 }}>
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', flex: '1 1 220px' }} data-testid="plan-saved">{savedWords(view)}</Typography>
            {mode !== 'custom' && (
              <Link component="button" type="button" sx={{ fontSize: 13 }} onClick={() => setMore((o) => !o)} aria-expanded={more} data-testid="plan-more">
                {more ? 'Fewer options' : 'More options'}
              </Link>
            )}
            {editable && !view.saved?.at && mode && (
              <Button variant="contained" size="small" disabled={saving} onClick={(e) => choose(mode, e.currentTarget)} data-testid="plan-save">Save the plan</Button>
            )}
          </Box>
          {more && mode !== 'custom' && (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }} data-testid="shipping">
              <TextField select size="small" label="Ship as" value={dispKey} disabled={!editable || saving} sx={{ minWidth: 260, maxWidth: 460 }}
                onChange={(e) => void save({ production: view.plan.production, dispatch: decodeChoice<DispatchLevel>(e.target.value), ...(view.plan.groups?.length ? { groups: view.plan.groups } : {}) }, 'Shipping saved.')}
                inputProps={{ 'aria-label': 'Ship as' }}>
                {dispOptions.map((o) => (
                  <MenuItem key={o.key} value={o.key} data-testid={`disp-${o.key.replace(':', '-')}`} disabled={dispatchTooBig(view.plan.production.level, o.choice.level)}>{plainLabel(o.label)}</MenuItem>
                ))}
              </TextField>
              <InfoTip text={`How the order is shipped: ${DISPATCH_WORDS[view.plan.dispatch.level].toLowerCase()} now. A shipment is never bigger than a production order. ${view.preview.dispatch.sentence}`} />
            </Box>
          )}
        </Box>
      </SectionCard>
      <ConfirmDialog open={leaving != null} title={`Switch to ${MODES.find((x) => x.mode === leaving)?.title ?? ''}?`} confirmLabel="Switch"
        body={`The ${groups.length} production order${groups.length === 1 ? '' : 's'} picked in Custom will be dropped.`}
        onConfirm={async () => { const m = leaving; setLeaving(null); if (m) choose(m, undefined, true); }} onClose={() => setLeaving(null)} />
    </FullScreenFrame>
  );
}
