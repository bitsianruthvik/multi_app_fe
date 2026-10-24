import { useEffect, useRef, useState } from 'react';
import { Box, Button, CircularProgress, Link, MenuItem, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import LockRounded from '@mui/icons-material/LockRounded';
import { CfApiError } from '../../api/client';
import {
  getExecutionPlan, saveExecutionPlan,
  type DispatchLevel, type ExecutionPlan, type ExecutionPlanLine, type ExecutionPlanView, type PlanPreviewPart, type ProductionLevel,
} from '../../api/executionPlan';
import { useLoad } from '../../hooks/useLoad';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { useFullScreen } from '../../hooks/useFullScreen';
import {
  PRODUCTION_HELP, barOptions, decodeChoice, dispatchTooBig, draftChanged, draftOf, encodeChoice, inputOf, lineCountWords, lineOptionGroup,
  savedWords, showsLineTable, visibleOptions, type PlanDraft,
} from '../../lib/executionPlan';
import { ErrorNotice, Mono, SectionCard, SkeletonRows } from '../ui';
import { FullScreenFrame, FullScreenToggle } from '../FullScreen';
import { useToast } from '../toastContext';
import { nudgeIfRefused } from '../salesMotion';
import { FlashOnChange } from '../../motion';

const SHOWN = 12;
const cellSx = { px: 1, py: 0.5, borderBottom: '1px solid var(--c-divider)', fontSize: 13, verticalAlign: 'middle' } as const;
const selectSx = { minWidth: 170, '& .MuiInputBase-root': { fontSize: 13 }, '& .MuiSelect-select': { py: '4px' } } as const;

/** The live list: the sentence, the first few, and the rest on request. */
function PreviewList({ title, part, testId }: { title: string; part: PlanPreviewPart; testId: string }) {
  const [all, setAll] = useState(false);
  const items = all ? part.items : part.items.slice(0, SHOWN);
  const hidden = part.count - items.length;
  return (
    <Box data-testid={testId} sx={{ minWidth: 0, border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', p: 1.25 }}>
      <Typography sx={{ fontSize: 12, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 0.5 }}>{title}</Typography>
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

/**
 * EXECUTION PLAN — the sales order's second step (user, 2026-10-18), before Freeze design: how the order is MADE
 * (whole order / per line / per unit / per sub-assembly — the production orders) and SHIPPED (the dispatch units,
 * the same or finer). Prefilled with the usual (one production order per line, dispatched the same way); a line
 * can differ in the grid below. Every change shows at once what the order will make (a dry run on the server — the
 * same rules the save uses). Fixed once a line's design is frozen.
 *
 * 2026-10-24: every choice is labelled with what it makes (the server's `options`); one giving the same as a simpler
 * one is left out, named in a note under its bar. With NOTHING TO CHOOSE the panel is one sentence and "Change";
 * the per-line table shows only when the order has more than one line.
 */
export function ExecutionPlanPanel({ orderId, onChanged }: { orderId: number; onChanged?: () => void }) {
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_orders_manage');
  const full = useFullScreen('so-execution-plan');
  const loaded = useLoad(() => getExecutionPlan(orderId), [orderId]);
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [preview, setPreview] = useState<ExecutionPlanView | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  // Nothing to choose: the panel is one sentence until "Change" opens it.
  const [expanded, setExpanded] = useState(false);
  const seq = useRef(0);

  const saved = loaded.data;
  useEffect(() => { if (saved) { setDraft(draftOf(saved)); setPreview(null); } }, [saved]);

  const dirty = !!draft && !!saved && draftChanged(draft, saved);
  // Live preview: a dry run a moment after the last change.
  useEffect(() => {
    if (!draft || !saved || !dirty) { setPreview(null); return undefined; }
    const my = ++seq.current;
    const t = window.setTimeout(async () => {
      setChecking(true);
      try {
        const v = await saveExecutionPlan(orderId, inputOf(draft, saved, true));
        if (seq.current === my) setPreview(v);
      } catch (e) {
        if (seq.current === my) setError(e as CfApiError);
      } finally { if (seq.current === my) setChecking(false); }
    }, 250);
    return () => window.clearTimeout(t);
  }, [draft, saved, dirty, orderId]);

  const shown = preview ?? saved;
  const editable = !!saved?.editable && canManage;
  if (loaded.error) return <ErrorNotice error={loaded.error} onRetry={loaded.reload} />;
  if (!saved || !draft || !shown) return <SkeletonRows rows={4} height={64} />;

  const setOrder = (patch: Partial<Pick<PlanDraft, 'production' | 'dispatch'>>) => setDraft((d) => {
    if (!d) return d;
    const next = { ...d, ...patch };
    // A dispatch that no longer fits inside the production order goes back to "the same".
    if (dispatchTooBig(next.production.level, next.dispatch.level)) next.dispatch = { level: 'same', levelId: null };
    return next;
  });
  const setOwn = (lineId: number, own: ExecutionPlan | null) => setDraft((d) => (d ? { ...d, own: { ...d.own, [lineId]: own } } : d));
  const applyTemplate = (plan: ExecutionPlan) => setDraft((d) => (d ? { production: { ...plan.production }, dispatch: { ...plan.dispatch }, own: Object.fromEntries(Object.keys(d.own).map((k) => [k, null])) } : d));
  const save = async (button?: HTMLElement) => {
    setSaving(true); setError(null);
    try {
      const v = await saveExecutionPlan(orderId, inputOf(draft, saved));
      loaded.setData(v);
      toast.success('Execution plan saved.');
      onChanged?.();
    } catch (e) { setError(e as CfApiError); nudgeIfRefused(e, button); } finally { setSaving(false); }
  };

  // A line's select: "As the order" (saying what that gives), then every option not folded into a simpler one.
  const lineOptions = (l: ExecutionPlanLine, kind: 'production' | 'dispatch', current: string) => {
    const group = lineOptionGroup(l, kind);
    return [
      <MenuItem key="as-order" value="">{group.asOrder ?? 'As the order'}</MenuItem>,
      ...visibleOptions(group, current).map((o) => (
        <MenuItem key={o.key} value={o.key} disabled={kind === 'dispatch' && dispatchTooBig(l.plan.production.level, o.choice.level as DispatchLevel)}>{o.label}</MenuItem>
      )),
    ];
  };

  const problems = shown.problems;
  const prodGroup = barOptions(shown, 'production');
  const dispGroup = barOptions(shown, 'dispatch');
  const prodKey = encodeChoice(draft.production);
  const dispKey = encodeChoice(draft.dispatch);
  const optionTestId = (kind: string, key: string) => `${kind}-${key.replace(':', '-')}`;

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

          {editable && saved.templates.length > 0 && (
            <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }} data-testid="plan-templates">
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Start from:</Typography>
              {saved.templates.map((t) => <Button key={t.key} size="small" variant="outlined" onClick={() => applyTemplate(t.plan)}>{t.label}</Button>)}
            </Box>
          )}

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 600, mb: 0.75 }}>Production orders</Typography>
              {/* Choose by result: each option says what it makes; one giving the same as a simpler one is folded in. */}
              <ToggleButtonGroup exclusive size="small" value={prodKey} disabled={!editable} aria-label="Production order level"
                onChange={(_, v: string | null) => { if (v) setOrder({ production: decodeChoice<ProductionLevel>(v) }); }}
                sx={{ flexWrap: 'wrap' }}>
                {visibleOptions(prodGroup, prodKey).map((o) => (
                  <ToggleButton key={o.key} value={o.key} disabled={!editable} data-testid={optionTestId('prod', o.key)} sx={{ textTransform: 'none' }}>
                    <Tooltip title={PRODUCTION_HELP[o.choice.level]}><span>{o.label}</span></Tooltip>
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              {prodGroup.note && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 0.5 }} data-testid="prod-note">{prodGroup.note}</Typography>}
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.5 }}>{PRODUCTION_HELP[draft.production.level]}</Typography>
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 600, mb: 0.75 }}>Dispatch</Typography>
              <ToggleButtonGroup exclusive size="small" value={dispKey} disabled={!editable} aria-label="Dispatch level"
                onChange={(_, v: string | null) => { if (v) setOrder({ dispatch: decodeChoice<DispatchLevel>(v) }); }}
                sx={{ flexWrap: 'wrap' }}>
                {visibleOptions(dispGroup, dispKey).map((o) => (
                  <ToggleButton key={o.key} value={o.key} data-testid={optionTestId('disp', o.key)} sx={{ textTransform: 'none' }}
                    disabled={!editable || dispatchTooBig(draft.production.level, o.choice.level)}>{o.label}</ToggleButton>
                ))}
              </ToggleButtonGroup>
              {dispGroup.note && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 0.5 }} data-testid="disp-note">{dispGroup.note}</Typography>}
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.5 }}>Never bigger than a production order.</Typography>
            </Box>
          </Box>

          {/* The per-line table only when the order has more than one line (2026-10-24). */}
          {showsLineTable(shown) && <Box sx={{ overflowX: 'auto', minWidth: 0 }}>
            <Box component="table" sx={{ borderCollapse: 'collapse', width: '100%', minWidth: 640 }} data-testid="plan-lines">
              <thead>
                <tr>
                  {['Line', 'Sells', 'Production orders', 'Dispatch', 'Makes'].map((h) => (
                    <Box component="th" key={h} sx={{ ...cellSx, textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--c-text-3)' }}>{h}</Box>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.lines.map((l) => {
                  const own = draft.own[l.lineId] ?? null;
                  const fixed = l.frozen || !editable || !l.made;
                  // A line's own plan holds both columns; "As the order" in one column takes the order's choice there.
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

          <Box sx={{ display: 'grid', gap: 0.5 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 600 }} aria-live="polite" data-testid="plan-sentence">
              <FlashOnChange value={shown.preview.production.sentence}>{shown.preview.production.sentence}</FlashOnChange>{checking ? ' …' : ''}
            </Typography>
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{shown.preview.dispatch.sentence}</Typography>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
            <PreviewList title="Production orders" part={shown.preview.production} testId="preview-production" />
            <PreviewList title="Dispatch units" part={shown.preview.dispatch} testId="preview-dispatch" />
          </Box>

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
              <Button variant="contained" onClick={(e) => void save(e.currentTarget)} disabled={saving || problems.length > 0 || (!dirty && !!saved.saved)} data-testid="plan-save"
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
