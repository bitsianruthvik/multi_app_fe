import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Collapse, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, ListSubheader, MenuItem, TextField, Typography,
} from '@mui/material';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import ExpandLessRounded from '@mui/icons-material/ExpandLessRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';

import { backendMessage, Surface } from '../components';
import { DialogCloseButton } from './FormDialog';
import {
  getTemplateQuestions, instantiateTemplate, listTemplates, previewTemplate,
  type StructureTemplate, type TemplateParameter, type TemplateParams,
  type TemplatePerInstance, type TemplatePreview,
} from '../api/templates';

/**
 * Structure wizard — the generic one (FAB_ERP_FIELDS_REDESIGN.md §5, §7 step 7).
 *
 * NOTHING IN THIS FILE KNOWS WHAT A GIRDER IS. The screen it replaces,
 * BoqWizardDialog, has "Girders" and "Segments each" as literal labels, exactly
 * two count inputs because exactly three levels are assumed, `useState('6')` and
 * `useState('5')` as the defaults, and an `if (!girders)` branch for a PEB. Here
 * the inputs are one per entry in `parameters`, the labels are the child item's
 * own name, the defaults are `default_qty`, and a PEB is a template with no
 * Girder line — or a Girder count of zero.
 *
 * THE PREVIEW IS THE SAFETY RAIL. The old wizard's guarantee was that it
 * produced a spreadsheet you could read before uploading it; this one writes
 * rows directly, so the equivalent guarantee has to come from somewhere. It
 * comes from POST /preview, which walks the same expander and writes nothing.
 * Nobody presses Create without having seen the row count and the codes.
 *
 * A COUNT OF ZERO IS AN ANSWER, not a missing one. It collapses its level, which
 * is how a PEB stops having girders. Every read of a number here therefore goes
 * through an explicit blank check — `Number(raw) || fallback` would silently
 * turn a deliberate 0 back into 6.
 */

/** Above this, a per-parent grid is a wall of boxes nobody fills in by hand. */
const MAX_OVERRIDE_BOXES = 100;

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

  const [parameters, setParameters] = useState<TemplateParameter[]>([]);
  const [loadingParams, setLoadingParams] = useState(false);
  /**
   * Answers as STRINGS, deliberately.
   *
   * A number would have no way to say "blank", and blank has to stay distinct
   * from 0: blank means "use the template's default" (the param is left out of
   * the payload entirely) while 0 means "none of these, collapse the level".
   * Collapsing the two is the bug this whole screen exists to avoid.
   */
  const [answers, setAnswers] = useState<Record<string, string>>({});
  /** param -> per-parent counts as typed. A blank box means "same as above". */
  const [overrides, setOverrides] = useState<Record<string, string[]>>({});
  const [gridOpen, setGridOpen] = useState<Record<string, boolean>>({});

  const [preview, setPreview] = useState<TemplatePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  /**
   * Preview responses can land out of order — a slow request for 6 girders
   * arriving after a fast one for 7 would show counts that match nothing on
   * screen. Only the newest request is allowed to write state.
   */
  const previewSeq = useRef(0);

  // ── the questions ─────────────────────────────────────────────────────────

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
    setParameters([]);
    setAnswers({});
    setOverrides({});
    setGridOpen({});
    setPreview(null);
  }, [open]);

  useEffect(() => {
    if (itemId === '') { setParameters([]); setAnswers({}); return; }
    let live = true;
    setLoadingParams(true);
    setPreview(null);
    getTemplateQuestions(itemId)
      .then((r) => {
        if (!live) return;
        const params = r.parameters ?? [];
        setParameters(params);
        // Seed from default_qty — the data that replaced the hardcoded 6 and 5.
        // A template with no default seeds blank rather than 0, because "we did
        // not say" is not the same claim as "there are none of these".
        setAnswers(Object.fromEntries(
          params.map((p) => [p.param, p.defaultQty == null ? '' : String(p.defaultQty)]),
        ));
        setOverrides({});
        setGridOpen({});
      })
      .catch((e) => { if (live) setError(backendMessage(e, 'Could not read that template.')); })
      .finally(() => { if (live) setLoadingParams(false); });
    return () => { live = false; };
  }, [itemId]);

  // ── answers -> payload ────────────────────────────────────────────────────

  /** The number this parameter is currently worth, blanks resolved to the default. */
  const effective = useCallback((p: TemplateParameter): number => {
    const raw = answers[p.param];
    if (raw == null || raw.trim() === '') return p.defaultQty ?? 0;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : (p.defaultQty ?? 0);
  }, [answers]);

  /** Whatever a person typed that is not a count. Reported per field, not as one blanket error. */
  const badAnswers = useMemo(() => {
    const bad = new Set<string>();
    for (const p of parameters) {
      const raw = answers[p.param];
      if (raw == null || raw.trim() === '') continue; // blank is legitimate
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) bad.add(p.param);
    }
    return bad;
  }, [parameters, answers]);

  const params = useMemo<TemplateParams>(() => {
    const out: TemplateParams = {};
    for (const p of parameters) {
      const raw = answers[p.param];
      if (raw == null || raw.trim() === '') continue; // omitted -> server uses default_qty
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) continue;
      out[p.param] = n; // 0 travels, and collapses the level
    }
    return out;
  }, [parameters, answers]);

  /**
   * The per-parent overrides, trimmed to the last one actually filled in.
   *
   * The server indexes this array by the parent's 1-based ordinal and falls back
   * to the single figure for anything past the end, so a short array is not a
   * lossy one — it is how "only G3 is different" is expressed. Length is
   * therefore driven by what was typed, NOT by the parent count, which keeps
   * this independent of the preview that renders below it.
   */
  const perInstance = useMemo<TemplatePerInstance>(() => {
    const out: TemplatePerInstance = {};
    for (const p of parameters) {
      if (!p.perInstance) continue;
      const raw = overrides[p.param];
      if (!raw) continue;
      let last = -1;
      raw.forEach((v, i) => { if (v != null && v.trim() !== '') last = i; });
      if (last < 0) continue;
      const base = effective(p);
      out[p.param] = raw.slice(0, last + 1).map((v) => {
        if (v == null || v.trim() === '') return base;
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 ? n : base;
      });
    }
    return out;
  }, [parameters, overrides, effective]);

  // ── preview ───────────────────────────────────────────────────────────────

  const paramsKey = JSON.stringify(params);
  const perInstanceKey = JSON.stringify(perInstance);

  useEffect(() => {
    if (!open || itemId === '' || badAnswers.size) return;
    const seq = ++previewSeq.current;
    setPreviewing(true);
    // Debounced because every keystroke would otherwise walk the whole BOM
    // server-side; 400ms is long enough to swallow typing "12" as one request.
    const t = setTimeout(() => {
      // Sent by re-reading the serialised keys rather than closing over the
      // objects: the keys are what this effect actually depends on, so the
      // request and the dependency array cannot describe different answers —
      // and no exhaustive-deps suppression is needed to say so.
      previewTemplate(itemId, JSON.parse(paramsKey), JSON.parse(perInstanceKey))
        .then((r) => { if (seq === previewSeq.current) { setPreview(r); setError(''); } })
        .catch((e) => {
          if (seq !== previewSeq.current) return;
          setPreview(null);
          setError(backendMessage(e, 'Could not work out what that would build.'));
        })
        .finally(() => { if (seq === previewSeq.current) setPreviewing(false); });
    }, 400);
    return () => { clearTimeout(t); };
  }, [open, itemId, paramsKey, perInstanceKey, badAnswers.size]);

  /**
   * How many boxes a per-parent grid needs — i.e. how many parents there are.
   *
   * The API does not say which parameter is a given one's parent, so this reads
   * it back out of the preview instead: find the depth the counted item sits at,
   * and sum the levels one depth above it. That is the same fact, taken from the
   * only place that actually knows it. Before the first preview lands, the
   * top-down order of `parameters` gives the fallback — the entry before a
   * per-instance one is its parent in a depth-first walk.
   *
   * Returning 0 means "not known yet", and the grid stays hidden. Offering six
   * boxes for a level that turned out to have four parents is worse than
   * offering none.
   */
  const parentCountOf = useCallback((p: TemplateParameter): number => {
    if (preview && p.askedBy) {
      const depth = preview.sample.find((s) => s.name === p.askedBy)?.depth;
      if (depth != null && depth > 0) {
        const parents = new Set(
          preview.sample.filter((s) => s.depth === depth - 1).map((s) => s.name),
        );
        let n = 0;
        parents.forEach((name) => { n += preview.byName[name] ?? 0; });
        if (n > 0) return n;
      }
      // Not in the sample at all: this level collapsed, so it has no parents
      // worth overriding.
      if (depth == null) return 0;
    }
    const i = parameters.findIndex((x) => x.param === p.param);
    if (i <= 0) return preview ? 0 : 1; // directly under the root — one parent
    return effective(parameters[i - 1]);
  }, [preview, parameters, effective]);

  const setOverride = (param: string, index: number, value: string) =>
    setOverrides((prev) => {
      const next = [...(prev[param] ?? [])];
      while (next.length <= index) next.push('');
      next[index] = value;
      return { ...prev, [param]: next };
    });

  const overrideCount = (param: string) =>
    (overrides[param] ?? []).filter((v) => v != null && v.trim() !== '').length;

  // ── create ────────────────────────────────────────────────────────────────

  async function create() {
    if (itemId === '') return;
    setBusy(true); setError('');
    try {
      await instantiateTemplate(orderId, {
        itemId,
        orderLineId: orderLine?.id ?? null,
        params,
        perInstance,
        lineCode: orderLine?.code ?? null,
      });
      onDone();
      onClose();
    } catch (e) {
      // Stay open on failure. The answers took effort and re-typing them is the
      // fastest way to make somebody give up on the wizard.
      setError(backendMessage(e, 'Could not create that structure.'));
    } finally {
      setBusy(false);
    }
  }

  // ── render ────────────────────────────────────────────────────────────────

  const chosen = templates.find((t) => t.id === itemId) ?? null;
  const canCreate = itemId !== '' && !!preview && !previewing && !busy && !badAnswers.size;

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

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogCloseButton absolute onClose={onClose} disabled={busy} />
      <DialogTitle sx={{ fontWeight: 600 }}>Build the structure</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 2 }}>
          Pick what you are building, answer how many of each, then check the preview before
          creating anything. Nothing is written until you press <strong>Create</strong> — and
          everything created here can still be edited in the tree afterwards.
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

        {/* 2 — the questions the BOM asks. However many there are. */}
        {loadingParams && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
            <CircularProgress size={16} />
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Reading the template…</Typography>
          </Box>
        )}

        {!loadingParams && itemId !== '' && parameters.length === 0 && (
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)', mb: 2 }}>
            This template asks nothing — every quantity in its BOM is fixed. The preview below is
            exactly what it will create.
          </Typography>
        )}

        {parameters.map((p) => {
          const label = p.askedBy ? plural(p.askedBy) : p.param;
          const parents = p.perInstance ? parentCountOf(p) : 0;
          const showGrid = parents > 0 && parents <= MAX_OVERRIDE_BOXES;
          const n = overrideCount(p.param);
          return (
            <Box key={p.param} sx={{ mb: 2 }}>
              <TextField
                label={label}
                size="small"
                type="number"
                value={answers[p.param] ?? ''}
                disabled={busy}
                sx={{ width: 200 }}
                slotProps={{ inputLabel: { shrink: true } }}
                placeholder={p.defaultQty == null ? '' : String(p.defaultQty)}
                error={badAnswers.has(p.param)}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [p.param]: e.target.value }))}
                // 0 is a real answer — it collapses this level — so the helper
                // text says so rather than leaving someone to wonder whether the
                // field will be treated as empty.
                helperText={badAnswers.has(p.param)
                  ? 'A whole number, 0 or more.'
                  : p.helpText ?? '0 removes this level entirely'}
              />

              {/* Per-parent override. Girders on one span genuinely differ — an
                  end girder need not be cut into the same number of pieces as a
                  middle one. COLLAPSED BY DEFAULT because almost every job uses
                  one number, and this grid was the fiddliest thing on the old
                  screen for the jobs that did not need it. */}
              {p.perInstance && (
                <Box sx={{ mt: 0.5 }}>
                  <Button
                    size="small"
                    disabled={!showGrid || busy}
                    startIcon={gridOpen[p.param] ? <ExpandLessRounded /> : <ExpandMoreRounded />}
                    onClick={() => setGridOpen((g) => ({ ...g, [p.param]: !g[p.param] }))}
                  >
                    {gridOpen[p.param] ? 'Hide' : 'Set per'}
                    {' '}{(p.askedBy ? parentLabel(parameters, p) : 'parent').toLowerCase()}
                  </Button>
                  <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)', ml: 1 }}>
                    {parents === 0
                      ? 'available once the level above has a count'
                      : parents > MAX_OVERRIDE_BOXES
                        ? `${parents} of them — too many to set individually here; edit the tree afterwards`
                        : n > 0
                          ? `${n} of ${parents} set individually`
                          : `all ${parents} use the number above`}
                  </Typography>

                  <Collapse in={!!gridOpen[p.param] && showGrid} unmountOnExit>
                    <Box sx={{
                      display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1, mb: 0.5,
                      maxHeight: 240, overflowY: 'auto',
                    }}>
                      {Array.from({ length: parents }, (_, i) => (
                        <TextField
                          key={i}
                          label={`#${i + 1}`}
                          size="small"
                          type="number"
                          value={overrides[p.param]?.[i] ?? ''}
                          placeholder={String(effective(p))}
                          sx={{ width: 84 }}
                          slotProps={{ inputLabel: { shrink: true } }}
                          onChange={(e) => setOverride(p.param, i, e.target.value)}
                        />
                      ))}
                    </Box>
                    {n > 0 && (
                      <Button
                        size="small"
                        sx={{ color: 'var(--c-text-3)' }}
                        onClick={() => setOverrides((prev) => ({ ...prev, [p.param]: [] }))}
                      >
                        Clear overrides
                      </Button>
                    )}
                  </Collapse>
                </Box>
              )}
            </Box>
          );
        })}

        {/* 3 — what that would produce. The whole reason this dialog is safe to
            press Create on: 247 rows should never be a surprise. */}
        {itemId !== '' && (
          <Surface e={1} sx={{ p: 2, mt: 1 }}>
            <Typography sx={{
              fontSize: 11, fontWeight: 600, letterSpacing: '.06em',
              textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 1,
            }}>
              Preview — nothing is created yet
            </Typography>

            {previewing && !preview && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={16} />
                <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Working it out…</Typography>
              </Box>
            )}

            {preview && (
              <Box sx={{ opacity: previewing ? 0.55 : 1, transition: 'opacity .15s' }}>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1 }}>
                  <Typography sx={{ fontSize: 30, fontWeight: 700, lineHeight: 1, color: 'var(--c-text)' }}>
                    {preview.nodes}
                  </Typography>
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
        <Button
          variant="contained"
          disabled={!canCreate}
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <CheckRoundedIcon />}
          onClick={create}
        >
          {preview ? `Create ${preview.nodes} item${preview.nodes === 1 ? '' : 's'}` : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * "Girder" -> "Girders". The label is the child item's NAME, which is written
 * singular because it names one thing; the question counts them.
 *
 * Deliberately crude — English -s/-es, and -y to -ies. A wrong plural reads
 * slightly odd; a plural column on the catalog would be a second place to keep
 * the item's name, which reads slightly odd forever.
 */
function plural(name: string): string {
  const s = name.trim();
  if (!s) return s;
  if (/(s|x|z|ch|sh)$/i.test(s)) return `${s}es`;
  if (/[^aeiou]y$/i.test(s)) return `${s.slice(0, -1)}ies`;
  return `${s}s`;
}

/**
 * What to call the thing a per-instance override is set per — "per girder"
 * rather than "per parent". Taken from the preceding question, which in a
 * top-down walk is the level above.
 */
function parentLabel(all: TemplateParameter[], p: TemplateParameter): string {
  const i = all.findIndex((x) => x.param === p.param);
  return (i > 0 ? all[i - 1].askedBy : null) ?? 'parent';
}
