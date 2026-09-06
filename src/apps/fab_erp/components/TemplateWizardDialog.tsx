import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Collapse, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, ListSubheader, MenuItem, Stack, TextField,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';

import { backendMessage, Surface } from '../components';
import { DialogCloseButton } from './FormDialog';
import {
  instantiateTemplate, listTemplates, outlineTemplate, previewTemplate,
  type OutlineLine, type OutlineStep, type StructureOutline, type StructureSpec,
  type StructureTemplate, type TemplatePreview,
} from '../api/templates';

/**
 * Structure wizard — a DRILL-DOWN, one step per rung.
 *
 * NOTHING IN THIS FILE KNOWS WHAT A GIRDER IS. The screen it replaced,
 * BoqWizardDialog, had "Girders" and "Segments each" as literal labels, exactly
 * two inputs because exactly three levels were assumed, and an `if (!girders)`
 * branch for a PEB. Here every label is a catalog item's own name and every
 * rung comes from the BOM.
 *
 * WHY A DRILL-DOWN AND NOT ONE FORM. The version before this asked every
 * question at once — "girders 6, segments 5, end diaphragms 6" as a flat list of
 * numbers. That reads as unrelated fields, and more importantly it gives nobody
 * anywhere to say "this girder is different from that one", because at the time
 * the form is filled in the girders do not exist yet. Walking down one rung at a
 * time means each step's parents were produced by the step above it: answer
 * "2 lines" and the next step is about L1 and L2 by name.
 *
 * SPLIT AND SIMILAR ARE ONE CONTROL. They are inverses of each other at the same
 * rung — "these are individually different" and "these are the same, edit one
 * and apply to all". Built as two features they would be two data shapes with an
 * undefined state when both were used. Built as one grouping control they are
 * the same thing: a group per row, uniform is one group holding everyone, split
 * is a group each, similar is anything in between.
 *
 * A COUNT OF ZERO IS AN ANSWER, not a missing one. It collapses its rung and
 * hoists what it contained — that is how a PEB stops having girders while
 * keeping its parts. Every read of a number here goes through an explicit blank
 * check, because `Number(raw) || fallback` would silently turn a deliberate 0
 * back into 6.
 *
 * THE PREVIEW IS THE SAFETY RAIL. This writes rows directly, so the guarantee
 * the old wizard got from producing a spreadsheet has to come from somewhere:
 * it comes from POST /preview, which walks the same expander and writes nothing.
 */

/** Above this, a per-node grid is a wall of boxes nobody fills in by hand. */
const MAX_GRID_ROWS = 100;

/** Group labels. Past Z the letters repeat as AA, AB — rare and still unique. */
const groupLabel = (i: number): string => {
  let n = i;
  let out = '';
  do { out = String.fromCharCode(65 + (n % 26)) + out; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return out;
};

export interface TemplateWizardLine {
  id: number;
  code: string | null;
}

export default function TemplateWizardDialog({
  open, orderId, orderLine, onClose, onDone,
}: {
  open: boolean;
  orderId: number;
  /** The line this structure hangs off. Its code becomes the top of every code below. */
  orderLine: TemplateWizardLine | null;
  onClose: () => void;
  /** Fired after rows are created, so the tree behind refreshes. */
  onDone: () => void;
}) {
  const [templates, setTemplates] = useState<StructureTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [itemId, setItemId] = useState<number | ''>('');

  /**
   * THE ANSWER SHEET, and the only state the drill-down keeps.
   *
   * `defaults` is keyed by catalog item — "every Line takes 3 Segments" — so the
   * uniform answer is one entry however many Lines there are. `nodes` is keyed
   * by code path and holds the exceptions, plus the `sameAs` links the grouping
   * control writes. An absent node inherits, so a structure where nothing is
   * special carries no node entries at all.
   */
  const [spec, setSpec] = useState<StructureSpec>({ version: 2, defaults: {}, nodes: {} });
  const [outline, setOutline] = useState<StructureOutline | null>(null);
  const [loadingOutline, setLoadingOutline] = useState(false);
  const [stepKey, setStepKey] = useState<string | null>(null);
  /** Step key -> the grid is open. Closed means "they are all the same". */
  const [gridOpen, setGridOpen] = useState<Record<string, boolean>>({});

  const [preview, setPreview] = useState<TemplatePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  /**
   * Responses can land out of order — a slow request for 6 girders arriving
   * after a fast one for 7 would show counts that match nothing on screen. Only
   * the newest request is allowed to write state.
   */
  const seqRef = useRef(0);

  // ── templates ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    setError('');
    setLoadingTemplates(true);
    listTemplates()
      .then((r) => setTemplates(r.templates ?? []))
      .catch((e) => setError(backendMessage(e, 'Could not load the templates.')))
      .finally(() => setLoadingTemplates(false));
  }, [open]);

  // Reopening must not greet anyone with the last run's answers or its preview.
  useEffect(() => {
    if (open) return;
    setItemId('');
    setSpec({ version: 2, defaults: {}, nodes: {} });
    setOutline(null);
    setStepKey(null);
    setGridOpen({});
    setPreview(null);
  }, [open]);

  // A different template is a different structure; its answers do not carry over.
  useEffect(() => {
    setSpec({ version: 2, defaults: {}, nodes: {} });
    setOutline(null);
    setStepKey(null);
    setGridOpen({});
    setPreview(null);
  }, [itemId]);

  // ── outline + preview, both from the spec as it stands ────────────────────

  const specKey = JSON.stringify(spec);

  useEffect(() => {
    if (!open || itemId === '') return undefined;
    const seq = ++seqRef.current;
    setPreviewing(true);
    /**
     * Debounced because a keystroke would otherwise walk the whole BOM twice
     * server-side. 400ms swallows typing "12" as one request.
     *
     * Sent by re-reading the serialised key rather than closing over the object,
     * so the request and the dependency array cannot describe different answers.
     */
    const t = setTimeout(() => {
      const body = JSON.parse(specKey) as StructureSpec;
      setLoadingOutline(true);
      Promise.all([
        outlineTemplate(itemId, { structure: body }),
        previewTemplate(itemId, {}, {}, body),
      ])
        .then(([o, p]) => {
          if (seq !== seqRef.current) return;
          setOutline(o);
          setPreview(p);
          setError('');
          // Stay on the same rung across a refetch; fall to the first one when
          // the answers have removed the rung that was open.
          setStepKey((cur) => (cur && o.steps.some((s) => s.key === cur) ? cur : o.steps[0]?.key ?? null));
        })
        .catch((e) => {
          if (seq !== seqRef.current) return;
          setPreview(null);
          setError(backendMessage(e, 'Could not work out what that would build.'));
        })
        .finally(() => {
          if (seq !== seqRef.current) return;
          setPreviewing(false);
          setLoadingOutline(false);
        });
    }, 400);
    return () => { clearTimeout(t); };
  }, [open, itemId, specKey]);

  // ── writing answers into the spec ─────────────────────────────────────────

  /**
   * The uniform answer for a rung: every node of this KIND takes this many.
   *
   * Blank deletes the entry rather than writing 0 — "we did not say" has to stay
   * distinct from "there are none of these", because the second collapses a
   * rung and the first leaves the template's own answer standing.
   */
  const setUniform = useCallback((catalogItemId: number, lineId: number, raw: string) => {
    setSpec((prev) => {
      const defaults = { ...(prev.defaults ?? {}) };
      const forKind = { ...(defaults[String(catalogItemId)] ?? {}) };
      if (raw.trim() === '') delete forKind[String(lineId)];
      else {
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return prev;
        forKind[String(lineId)] = n;
      }
      if (Object.keys(forKind).length) defaults[String(catalogItemId)] = forKind;
      else delete defaults[String(catalogItemId)];
      return { ...prev, defaults };
    });
  }, []);

  /** One node's exception to the uniform answer. Blank returns it to the group. */
  const setNodeQty = useCallback((path: string, lineId: number, raw: string) => {
    setSpec((prev) => {
      const nodes = { ...prev.nodes };
      const node = { ...(nodes[path] ?? {}) };
      const children = { ...(node.children ?? {}) };
      if (raw.trim() === '') delete children[String(lineId)];
      else {
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return prev;
        children[String(lineId)] = n;
      }
      if (Object.keys(children).length) node.children = children;
      else delete node.children;
      if (Object.keys(node).length) nodes[path] = node;
      else delete nodes[path];
      return { ...prev, nodes };
    });
  }, []);

  /**
   * Put a node in a group, or take it out of one.
   *
   * `canonical === path` means "this one answers for itself", which is what
   * splitting is. Anything else is a `sameAs` link. There is no third state,
   * which is the whole reason split and similar are one control.
   */
  const setGroup = useCallback((path: string, canonical: string) => {
    setSpec((prev) => {
      const nodes = { ...prev.nodes };
      const node = { ...(nodes[path] ?? {}) };
      if (canonical === path) delete node.sameAs;
      else node.sameAs = canonical;
      if (Object.keys(node).length) nodes[path] = node;
      else delete nodes[path];
      return { ...prev, nodes };
    });
  }, []);

  /** Everyone in one group (uniform) or everyone in their own (split). */
  const regroupAll = useCallback((paths: string[], mode: 'same' | 'split') => {
    setSpec((prev) => {
      const nodes = { ...prev.nodes };
      const [first, ...rest] = paths;
      for (const p of [first, ...rest]) {
        const node = { ...(nodes[p] ?? {}) };
        if (mode === 'split' || p === first) delete node.sameAs;
        else node.sameAs = first;
        if (Object.keys(node).length) nodes[p] = node;
        else delete nodes[p];
      }
      return { ...prev, nodes };
    });
  }, []);

  // ── create ────────────────────────────────────────────────────────────────

  /**
   * Set when the line already has a structure. Not an error to dismiss — a
   * question. The answers are still on screen and the only thing left to decide
   * is whether to replace what is there.
   */
  const [existing, setExisting] = useState<number | null>(null);

  async function create(replace = false) {
    if (itemId === '') return;
    setBusy(true); setError(''); setExisting(null);
    try {
      await instantiateTemplate(orderId, {
        itemId,
        orderLineId: orderLine?.id ?? null,
        structure: spec,
        lineCode: orderLine?.code ?? null,
        ...(replace ? { replace: true } : {}),
      });
      onDone();
      onClose();
    } catch (e) {
      const res = (e as { response?: { status?: number; data?: { code?: string; existing?: number } } }).response;
      if (res?.status === 409 && res.data?.code === 'ALREADY_BUILT') {
        setExisting(res.data.existing ?? 0);
      } else {
        // Stay open on failure. The answers took effort and re-typing them is
        // the fastest way to make somebody give up on the wizard.
        setError(backendMessage(e, 'Could not create that structure.'));
      }
    } finally {
      setBusy(false);
    }
  }

  // ── render ────────────────────────────────────────────────────────────────

  const chosen = templates.find((t) => t.id === itemId) ?? null;
  const canCreate = itemId !== '' && !!preview && !previewing && !busy;
  const step = outline?.steps.find((s) => s.key === stepKey) ?? null;
  const stepIdx = outline ? outline.steps.findIndex((s) => s.key === stepKey) : -1;

  /** Category -> its templates, so a long catalog reads as a short list of groups. */
  const grouped = useMemo(() => {
    const map = new Map<string, StructureTemplate[]>();
    for (const t of templates) {
      const key = t.categoryName ?? 'Uncategorised';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return [...map.entries()];
  }, [templates]);

  /** The sample grouped by depth — one line per level, which is how a code reads. */
  const sampleByDepth = useMemo(() => {
    if (!preview) return [];
    const map = new Map<number, typeof preview.sample>();
    for (const s of preview.sample) {
      if (!map.has(s.depth)) map.set(s.depth, []);
      map.get(s.depth)!.push(s);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [preview]);

  /**
   * The groups on the open step, in the order they first appear.
   *
   * Read out of the spec rather than stored beside it, so there is one source of
   * truth for "which of these are the same" and no way for a letter on screen to
   * disagree with what would be built.
   */
  const groups = useMemo(() => {
    if (!step) return { canonicalOf: new Map<string, string>(), letters: new Map<string, string>(), order: [] as string[] };
    const canonicalOf = new Map<string, string>();
    const order: string[] = [];
    for (const p of step.parents) {
      const c = spec.nodes[p.path]?.sameAs ?? p.path;
      canonicalOf.set(p.path, c);
      if (!order.includes(c)) order.push(c);
    }
    const letters = new Map(order.map((c, i) => [c, groupLabel(i)]));
    return { canonicalOf, letters, order };
  }, [step, spec]);

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogCloseButton absolute onClose={onClose} disabled={busy} />
      <DialogTitle sx={{ fontWeight: 600 }}>Build the structure</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

        {existing != null && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            This line already has <b>{existing}</b> item(s). Building again would add a second
            copy of everything — every code is prefixed by the line, so the duplicates would look
            like ordinary rows. Replace what is there, or close and pick a different line.
          </Alert>
        )}

        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 2 }}>
          Pick what you are building, then work down it one level at a time. Nothing is written
          until you press <strong>Create</strong>.
        </Typography>

        {/* 1 — what are we building */}
        <TextField
          select
          fullWidth
          size="small"
          label="Structure"
          value={itemId}
          disabled={busy}
          sx={{ mb: 2 }}
          onChange={(e) => setItemId(e.target.value === '' ? '' : Number(e.target.value))}
          helperText={
            loadingTemplates ? 'Loading…'
              : chosen ? `${chosen.code ?? ''}${chosen.code ? ' · ' : ''}${chosen.childLines} line${chosen.childLines === 1 ? '' : 's'} directly under it`
                : orderLine?.code
                  ? `Codes will read ${orderLine.code}-… under this order`
                  : 'Anything with a BOM under it and nothing above it'
          }
        >
          {!loadingTemplates && templates.length === 0 && (
            <MenuItem value="" disabled>No templates yet — build a BOM in the catalog first</MenuItem>
          )}
          {/* Flattened deliberately: MUI's Select wants a flat child list, and a
              subheader is not a selectable option, so the groups are labels. */}
          {grouped.flatMap(([category, items]) => [
            <ListSubheader key={`h-${category}`}>{category}</ListSubheader>,
            ...items.map((t) => (
              <MenuItem key={t.id} value={t.id}>
                {t.name}{t.code ? ` — ${t.code}` : ''}
              </MenuItem>
            )),
          ])}
        </TextField>

        {itemId !== '' && !outline && loadingOutline && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
            <CircularProgress size={16} />
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Reading the template…</Typography>
          </Box>
        )}

        {outline && outline.steps.length === 0 && (
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)', mb: 2 }}>
            This template contains nothing — it has no BOM lines to ask about.
          </Typography>
        )}

        {/* 2 — the rungs, as a breadcrumb you can jump around in */}
        {outline && outline.steps.length > 0 && (
          <>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center', mb: 1.5 }}>
              {outline.steps.map((s, i) => (
                <Box key={s.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {i > 0 && <ChevronRightRounded sx={{ fontSize: 15, color: 'var(--c-text-3)' }} />}
                  <Chip
                    size="small"
                    label={`${s.label}${s.parentCount > 1 ? ` ×${s.parentCount}` : ''}`}
                    color={s.key === stepKey ? 'primary' : 'default'}
                    variant={s.key === stepKey ? 'filled' : 'outlined'}
                    onClick={() => setStepKey(s.key)}
                    sx={{ ml: i > 0 ? 0 : 0 }}
                  />
                </Box>
              ))}
            </Box>

            {step && (
              <Surface e={1} sx={{ p: 2, mb: 2 }}>
                <Typography sx={{ fontWeight: 600, fontSize: 14, mb: 0.25 }}>
                  {step.parentCount === 1 ? `${step.label} contains` : `Each ${step.label} contains`}
                </Typography>
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mb: 1.5 }}>
                  {step.parentCount === 1
                    ? 'The top of this structure.'
                    : `${step.parentCount} of them — ${step.parents.slice(0, 6).map((p) => p.path).join(', ')}`
                      + `${step.parentCount > 6 ? ' …' : ''}`}
                </Typography>

                {/* The uniform answer: one number per BOM line. */}
                <Stack spacing={1.5}>
                  {step.lines.map((l) => (
                    <LineInput
                      key={l.lineId}
                      line={l}
                      value={spec.defaults?.[String(step.catalogItemId)]?.[String(l.lineId)]}
                      fallback={firstValue(step, l.lineId)}
                      disabled={busy}
                      onChange={(raw) => setUniform(step.catalogItemId, l.lineId, raw)}
                    />
                  ))}
                </Stack>

                {/* 3 — the ONE grouping control: split and similar together. */}
                {step.parentCount > 1 && (
                  <Box sx={{ mt: 2 }}>
                    {!step.perNode ? (
                      <Alert severity="info" sx={{ mt: 1 }}>
                        {step.parentCount} of these is too many to set individually — a grid that
                        size is boxes nobody fills in. The number above applies to all of them.
                        Individual ones can still be edited in the tree after it is built.
                      </Alert>
                    ) : (
                      <>
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => setGridOpen((p) => ({ ...p, [step.key]: !p[step.key] }))}
                        >
                          {gridOpen[step.key] ? 'Hide the individual ones' : 'They are not all the same…'}
                        </Button>
                        <Collapse in={!!gridOpen[step.key]} unmountOnExit>
                          <GroupGrid
                            step={step}
                            spec={spec}
                            groups={groups}
                            disabled={busy}
                            onQty={setNodeQty}
                            onGroup={setGroup}
                            onRegroup={regroupAll}
                          />
                        </Collapse>
                      </>
                    )}
                  </Box>
                )}
              </Surface>
            )}

            {/* Next/Back, for people who would rather walk than click a chip. */}
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <Button
                size="small"
                disabled={stepIdx <= 0}
                onClick={() => setStepKey(outline.steps[stepIdx - 1].key)}
              >
                Back
              </Button>
              <Button
                size="small"
                disabled={stepIdx < 0 || stepIdx >= outline.steps.length - 1}
                onClick={() => setStepKey(outline.steps[stepIdx + 1].key)}
              >
                Next level
              </Button>
              {previewing && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, ml: 1 }}>
                  <CircularProgress size={13} />
                  <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>Working it out…</Typography>
                </Box>
              )}
            </Box>
          </>
        )}

        {/* 4 — what it would build */}
        {itemId !== '' && (
          <Surface e={1} sx={{ p: 2 }}>
            {preview && (
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1 }}>
                  <Typography sx={{ fontSize: 22, fontWeight: 700 }}>{preview.nodes}</Typography>
                  <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
                    item{preview.nodes === 1 ? '' : 's'} will be created
                    {orderLine?.code ? ` under ${orderLine.code}` : ''}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 1.5 }}>
                  {Object.entries(preview.byName).map(([name, count]) => (
                    <Chip key={name} size="small" label={`${count} × ${name}`} />
                  ))}
                </Box>

                <Divider sx={{ mb: 1.5 }} />

                {/* The codes, read back. This is the check somebody actually
                    performs — a code that reads wrong here reads wrong on every
                    drawing, cut list and tag downstream. */}
                <Typography sx={{
                  fontSize: 11, fontWeight: 600, letterSpacing: '.06em',
                  textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 0.75,
                }}>
                  Codes
                </Typography>
                {sampleByDepth.map(([depth, nodes]) => (
                  <Box key={depth} sx={{ display: 'flex', gap: 1, mb: 0.4, alignItems: 'baseline' }}>
                    <Typography sx={{
                      fontSize: 11.5, color: 'var(--c-text-3)', width: 110, flexShrink: 0,
                      pl: `${Math.min(depth, 4) * 8}px`,
                    }}>
                      {nodes[0].name}
                    </Typography>
                    <Typography sx={{ fontSize: 11.5, fontFamily: 'monospace', color: 'var(--c-text-2)' }}>
                      {nodes.map((s) => s.code).join('   ')}
                      {(preview.byName[nodes[0].name] ?? 0) > nodes.length ? '   …' : ''}
                    </Typography>
                  </Box>
                ))}
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 1 }}>
                  The order's own prefix is added to these when they are created.
                </Typography>
              </Box>
            )}

            {!preview && !previewing && !error && (
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>
                Fix the counts above to see what this would build.
              </Typography>
            )}
          </Surface>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Box sx={{ flex: 1 }} />
        {existing != null ? (
          <Button
            variant="contained"
            color="warning"
            disabled={busy}
            startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <CheckRoundedIcon />}
            onClick={() => void create(true)}
          >
            Replace the {existing} item(s)
          </Button>
        ) : (
          <Button
            variant="contained"
            disabled={!canCreate}
            startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <CheckRoundedIcon />}
            onClick={() => void create(false)}
          >
            {preview ? `Create ${preview.nodes} item${preview.nodes === 1 ? '' : 's'}` : 'Create'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

/**
 * The count in force for a line right now, taken from the first parent.
 *
 * Placeholder text rather than a value, so the box stays empty until somebody
 * types in it — an empty box that shows "3" says "3 unless you say otherwise",
 * which is exactly what an absent spec entry means. Pre-filling it with 3 would
 * write 3 into the spec on the first keystroke anywhere else on the form.
 */
function firstValue(step: OutlineStep, lineId: number): number | undefined {
  const p = step.parents[0];
  return p ? step.values[p.path]?.[String(lineId)] : undefined;
}

/** One BOM line's number, labelled by what answering it actually does. */
function LineInput({ line, value, fallback, disabled, onChange }: {
  line: OutlineLine;
  value: number | undefined;
  fallback: number | undefined;
  disabled: boolean;
  onChange: (raw: string) => void;
}) {
  const name = line.childName ?? `line ${line.lineId}`;
  return (
    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
      <TextField
        size="small"
        type="number"
        label={name}
        value={value ?? ''}
        placeholder={fallback == null ? '' : String(fallback)}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        sx={{ width: 150, flexShrink: 0 }}
        inputProps={{ min: 0, step: 1 }}
        InputLabelProps={{ shrink: true }}
      />
      <Box sx={{ pt: 0.5 }}>
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
          {line.explode
            ? `Each one becomes its own item with its own code${line.hasChildren ? ' and its own contents' : ''}.`
            : `One row of this many — they are cut and marked together.`}
          {line.hasChildren && ' Set it to 0 and what it holds moves up a level instead of disappearing.'}
        </Typography>
        {line.helpText && (
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', fontStyle: 'italic' }}>
            {line.helpText}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

/**
 * THE GROUPING CONTROL — split and similar in one grid.
 *
 * Rows are the nodes at this rung, columns are the BOM lines under them, and the
 * first column is the group. Everything in group A shares one set of answers;
 * moving a row to its own letter is splitting it; moving two rows onto the same
 * letter is marking them similar. There is no separate "split" mode and no
 * separate "similar" mode, so there is no state where both are half-applied.
 *
 * WHAT A GROUP DOES NOT DO is freeze the members together. It saves typing —
 * the answer is written once and applies to all — and it is stamped onto
 * `similar_group` so a field value typed on one member later reaches the others.
 * Somebody can still give one girder a thicker web afterwards, and nothing
 * overwrites it. The code is never propagated: that is the one thing every
 * member must keep for itself.
 */
function GroupGrid({ step, spec, groups, disabled, onQty, onGroup, onRegroup }: {
  step: OutlineStep;
  spec: StructureSpec;
  groups: { canonicalOf: Map<string, string>; letters: Map<string, string>; order: string[] };
  disabled: boolean;
  onQty: (path: string, lineId: number, raw: string) => void;
  onGroup: (path: string, canonical: string) => void;
  onRegroup: (paths: string[], mode: 'same' | 'split') => void;
}) {
  const paths = step.parents.map((p) => p.path);
  const rows = Math.min(step.parents.length, MAX_GRID_ROWS);
  return (
    <Box sx={{ mt: 1.5 }}>
      <Box sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
        <ToggleButtonGroup size="small" exclusive value={groups.order.length === 1 ? 'same' : groups.order.length === paths.length ? 'split' : null}>
          <Tooltip title="One group — every one of them takes the same answers.">
            <ToggleButton value="same" onClick={() => onRegroup(paths, 'same')} disabled={disabled}>
              All the same
            </ToggleButton>
          </Tooltip>
          <Tooltip title="A group each — every one of them is set individually.">
            <ToggleButton value="split" onClick={() => onRegroup(paths, 'split')} disabled={disabled}>
              All different
            </ToggleButton>
          </Tooltip>
        </ToggleButtonGroup>
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
          {groups.order.length === 1
            ? 'All in one group.'
            : `${groups.order.length} group(s) — same letter means same answers.`}
        </Typography>
      </Box>

      <Box sx={{ overflowX: 'auto' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: `120px 90px repeat(${step.lines.length}, minmax(110px, 1fr))`, gap: 0.75, minWidth: 'max-content' }}>
          <GridHead>Item</GridHead>
          <GridHead>Group</GridHead>
          {step.lines.map((l) => <GridHead key={l.lineId}>{l.childName ?? l.lineId}</GridHead>)}

          {step.parents.slice(0, rows).map((p) => {
            const canonical = groups.canonicalOf.get(p.path) ?? p.path;
            const isFollower = canonical !== p.path;
            return (
              <Box key={p.path} sx={{ display: 'contents' }}>
                <Typography sx={{ fontSize: 12, fontFamily: 'monospace', alignSelf: 'center' }}>
                  {p.path}
                </Typography>
                <TextField
                  select
                  size="small"
                  value={canonical}
                  disabled={disabled}
                  onChange={(e) => onGroup(p.path, e.target.value)}
                  SelectProps={{ sx: { fontSize: 12 } }}
                >
                  {/* Its own letter first, then everyone else's — so "leave the
                      group" is always the top option rather than hidden. */}
                  <MenuItem value={p.path}>{groups.letters.get(p.path) ?? '—'} (own)</MenuItem>
                  {groups.order.filter((c) => c !== p.path).map((c) => (
                    <MenuItem key={c} value={c}>{groups.letters.get(c)} · like {c}</MenuItem>
                  ))}
                </TextField>
                {step.lines.map((l) => (
                  <TextField
                    key={l.lineId}
                    size="small"
                    type="number"
                    disabled={disabled || isFollower}
                    value={spec.nodes[p.path]?.children?.[String(l.lineId)] ?? ''}
                    placeholder={String(step.values[p.path]?.[String(l.lineId)] ?? '')}
                    onChange={(e) => onQty(p.path, l.lineId, e.target.value)}
                    inputProps={{ min: 0, step: 1, style: { fontSize: 12 } }}
                    // A follower shows what its group decided, greyed: the number
                    // is true, it is just not this row's to change.
                    title={isFollower ? `Set by ${canonical}` : undefined}
                  />
                ))}
              </Box>
            );
          })}
        </Box>
      </Box>

      {step.parents.length > rows && (
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 1 }}>
          Showing the first {rows} of {step.parentCount}.
        </Typography>
      )}
    </Box>
  );
}

function GridHead({ children }: { children: React.ReactNode }) {
  return (
    <Typography sx={{
      fontSize: 11, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase',
      color: 'var(--c-text-3)', alignSelf: 'center',
    }}>
      {children}
    </Typography>
  );
}
