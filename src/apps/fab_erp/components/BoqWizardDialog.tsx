import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, MenuItem, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import DownloadIcon from '@mui/icons-material/Download';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ExpandLessRounded from '@mui/icons-material/ExpandLessRounded';

import api, { API_HOST } from '@core/utils/axiosConfig';
import { fabQuery } from '../api/client';
import {
  fetchRawMaterials, materialsForThickness as materialsFor, materialLabel, withSelected,
  type RawMaterial as Material,
} from '../api/rawMaterials';
import { Surface } from '../components';

/**
 * Structure wizard — scaffolding for the BOQ sheet.
 *
 * It exists to save typing "S1 / G1 / 3" four hundred times, and it produces a
 * SPREADSHEET, never database rows. Everything it lays out is meant to be
 * edited before upload, which is also why nothing here has to be right first
 * time: a wrong guess costs a re-download, not a half-built order.
 *
 * Counts of zero collapse their level, so a PEB with no girders and no segments
 * uses the same wizard as a six-girder span.
 */

interface PartSpec {
  key: number;
  code: string;
  name: string;
  qty: string;
  /** Plate thickness in mm — also what filters this part's material list. */
  thick: string;
  rmCode: string;
}

/**
 * One part of a structure type's BOM template — the company's answer to "what
 * is a composite girder made of", editable in Setup rather than compiled in.
 */
interface TemplatePart {
  id: number;
  lineType: string;
  code: string;
  name?: string | null;
  qty?: number | null;
  thicknessMm?: number | null;
  rmCode?: string | null;
}



/** One line's worth of wizard settings, as the endpoint wants them. */
interface LineSpec {
  spanCode: string;
  girders: number;
  segmentsPerGirder: number;
  segmentCounts: number[];
  parts: { code: string; name?: string; qty: number; thick?: number; rmCode?: string }[];
  overrides: Record<string, { rmCode?: string; thick?: number }>;
}

let nextKey = 1;
const blankPart = (): PartSpec => ({ key: nextKey++, code: '', name: '', qty: '1', thick: '', rmCode: '' });

/**
 * Freeze a line's part list into a spec, for parking while another line is
 * edited. Girder and segment counts are re-read on restore from the same
 * fields, so only what the form holds needs capturing here.
 */
function buildSpecFrom(spanCode: string, parts: PartSpec[], girders = 0, segs = 0,
  counts: number[] = [], overrides: Record<string, { rmCode?: string; thick?: number }> = {}): LineSpec {
  return {
    spanCode,
    girders,
    segmentsPerGirder: segs,
    segmentCounts: counts,
    parts: parts.map((p) => ({
      code: p.code.trim(),
      name: p.name.trim() || undefined,
      qty: Number(p.qty) || 1,
      thick: p.thick.trim() ? Number(p.thick) : undefined,
      rmCode: p.rmCode || undefined,
    })),
    overrides,
  };
}

export interface WizardLine {
  id: number;
  code?: string | null;
  description?: string | null;
  lineType?: string | null;
}

export default function BoqWizardDialog({ open, orderId, lines, onClose, onImported }: {
  open: boolean;
  orderId: number;
  /** The order's lines. The chosen one supplies the span code and the defaults. */
  lines: WizardLine[];
  onClose: () => void;
  /** Fired after a sheet is uploaded here, so the tree behind refreshes. */
  onImported?: () => void;
}) {
  const [lineId, setLineId] = useState<number | ''>('');
  const [girders, setGirders] = useState('6');
  const [segments, setSegments] = useState('5');
  /** Per-girder overrides, index 0 = G1. Blank means "use the default above". */
  const [perGirder, setPerGirder] = useState<string[]>([]);
  const [parts, setParts] = useState<PartSpec[]>([blankPart()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [materials, setMaterials] = useState<Material[]>([]);
  /** The company's BOM templates, grouped by structure type. */
  const [templates, setTemplates] = useState<Record<string, TemplatePart[]>>({});
  /** Per-instance material/thickness, keyed "girder/segment/partCode". */
  const [overrides, setOverrides] = useState<Record<string, { rmCode?: string; thick?: number }>>({});
  const [expanded, setExpanded] = useState(false);
  /**
   * What has been set up for the lines NOT currently on screen.
   *
   * The panel below edits one line at a time — six girders and their parts is
   * already a dense form, and showing three lines' worth at once would be
   * unreadable. So switching lines parks the current settings here and pulls
   * back whatever that line had, and Generate emits every one of them.
   */
  const [configs, setConfigs] = useState<Record<number, LineSpec>>({});
  const prevLineRef = useRef<number | ''>('');
  /**
   * Which line's part list has been seeded, and whether from a real template.
   *
   * `fromTemplates: false` means the list on screen is the blank placeholder
   * put there before the template fetch came back — the one case where seeding
   * again is an upgrade rather than a clobbering.
   */
  const seededRef = useRef<{ lineId: number | ''; fromTemplates: boolean }>(
    { lineId: '', fromTemplates: false },
  );
  const fileRef = useRef<HTMLInputElement>(null);

  const line = lines.find((l) => l.id === lineId) ?? null;
  /**
   * THE SPAN CODE IS THE LINE'S CODE, not a separate thing to type.
   *
   * It was a free text field defaulting to "S1", which meant the sheet's top
   * level and the line it belongs to could disagree — and that match is exactly
   * how an imported row finds its line. Typing it twice was an invitation to
   * get it wrong once.
   */
  const spanCode = line?.code?.trim() ?? '';

  // Opening on a single-line order should not make anyone choose from a list of one.
  useEffect(() => {
    if (!open) return;
    setError('');
    if (lines.length === 1) setLineId(lines[0].id);
  }, [open, lines]);

  /**
   * Picking a line pulls in what that kind of structure is usually made of.
   *
   * These come from the company's own BOM templates now, not a constant baked
   * into the bundle — so a shop that builds its girders differently, or one that
   * works in structure types nobody has hardcoded, changes them in Setup instead
   * of asking for a deploy.
   */
  useEffect(() => {
    if (!line) return;

    // Park what the previous line had before overwriting the form with this
    // one's — otherwise switching to check something silently discards it.
    const prev = prevLineRef.current;
    if (prev !== '' && prev !== line.id) {
      const prevLine = lines.find((l) => l.id === prev);
      const prevParts = parts.filter((p) => p.code.trim());
      if (prevLine?.code && prevParts.length) {
        setConfigs((c) => ({
          ...c,
          [prev]: buildSpecFrom(prevLine.code!.trim(), prevParts, g, s, segmentCounts, overrides),
        }));
      }
    }
    const switching = prev !== '' && prev !== line.id;
    prevLineRef.current = line.id;

    /**
     * Templates arriving must never overwrite a form somebody is filling in.
     *
     * This effect also runs when `templates` resolves, which is a fetch — so on
     * a slow connection the order was: seed one blank row, user starts typing,
     * templates land, effect re-runs, and every keystroke is replaced by the
     * template. Re-seeding the SAME line is only ever an upgrade from that
     * placeholder, so it is allowed only while the placeholder is untouched.
     */
    if (!switching && seededRef.current.lineId === line.id) {
      const pristine = parts.length === 1 && !parts[0].code.trim() && !parts[0].name.trim();
      if (seededRef.current.fromTemplates || !pristine) return;
    }

    // Already configured in this session? Restore it rather than resetting to
    // the template, which would throw away work the moment somebody looked away.
    const saved = configs[line.id];
    if (saved) {
      seededRef.current = { lineId: line.id, fromTemplates: true };
      setGirders(String(saved.girders));
      setSegments(String(saved.segmentsPerGirder));
      setPerGirder(saved.segmentCounts.map(String));
      setParts(saved.parts.map((p) => ({
        key: nextKey++, code: p.code, name: p.name ?? '', qty: String(p.qty ?? 1),
        thick: p.thick != null ? String(p.thick) : '', rmCode: p.rmCode ?? '',
      })));
      setOverrides(saved.overrides ?? {});
      return;
    }

    const defaults = line.lineType ? templates[line.lineType] : undefined;
    // Only a list that actually came from a template counts as seeded — a blank
    // row put there while the fetch was still in flight is still a placeholder,
    // and must stay replaceable when the real thing arrives.
    seededRef.current = { lineId: line.id, fromTemplates: !!defaults?.length };
    setParts(defaults?.length
      ? defaults.map((d) => ({
        key: nextKey++,
        code: d.code,
        name: d.name ?? '',
        // DECIMAL arrives from mysql2 as a string, so a qty of 1 reaches the
        // field as "1.0000" unless it is put back through Number first.
        qty: d.qty != null ? String(Number(d.qty)) : '1',
        thick: d.thicknessMm != null ? String(Number(d.thicknessMm)) : '',
        rmCode: d.rmCode ?? '',
      }))
      : [blankPart()]);
    // Overrides are keyed by part code, so a different part list makes them
    // meaningless — clearing beats silently applying them to the wrong rows.
    setOverrides({});
  }, [line?.id, line?.lineType, templates]); // eslint-disable-line react-hooks/exhaustive-deps

  const setPart = (key: number, patch: Partial<PartSpec>) =>
    setParts((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  useEffect(() => {
    if (!open) return;
    // Only what a part can actually be cut from: the catalog's bought items.
    fetchRawMaterials().then(setMaterials).catch(() => setMaterials([]));

    // Every template in one query rather than one per line selected — there are
    // a handful of structure types, and re-fetching each time somebody changes
    // the line would make the parts list flicker for no reason.
    fabQuery<{ data: TemplatePart[] }>('fabErpBomTemplate', {
      filters: { active: 1 },
      orderBy: [{ field: 'sortOrder', direction: 'asc' }, { field: 'id', direction: 'asc' }],
      pagination: { limit: 500 },
    })
      .then((r) => {
        const by: Record<string, TemplatePart[]> = {};
        for (const t of r.data ?? []) {
          if (!t.lineType || !t.code) continue;
          (by[t.lineType] ??= []).push(t);
        }
        setTemplates(by);
      })
      .catch(() => setTemplates({}));
  }, [open]);

  const partCount = parts.filter((p) => p.code.trim()).length;
  const g = Math.max(0, Number(girders) || 0);
  const s = Math.max(0, Number(segments) || 0);

  /** What each girder will actually get, after the per-girder overrides. */
  const segmentCounts = Array.from({ length: g }, (_, i) => {
    const raw = perGirder[i];
    const n = raw != null && raw !== '' ? Number(raw) : s;
    return Math.max(0, Number.isFinite(n) ? n : 0);
  });
  const totalSegments = segmentCounts.reduce((a, b) => a + b, 0);
  /**
   * How many times the part list gets laid out.
   *
   * A girder with NO segments still gets one set of parts — the girder is then
   * the assembly. So it is `n || 1` per girder, not the plain segment total:
   * summing segments alone quietly undercounts every collapsed girder, and a
   * preview that disagrees with the sheet it is previewing is worse than none.
   */
  const partSets = g === 0 ? 1 : segmentCounts.reduce((a, n) => a + (n || 1), 0);
  const totalParts = partCount * partSets;

  /**
   * Every part the sheet will contain, one row each.
   *
   * This mirrors buildWizardRows on the server — girders, then segments within
   * them, then the parts in each — because the override keys have to be the
   * exact strings that side builds ("G2/1/TF"). Two expansions of the same rule
   * is a duplication worth being honest about: if the shape of the tree ever
   * changes, both move together or overrides land on rows that do not exist.
   */
  const instances = useMemo(() => {
    const live = parts.filter((p) => p.code.trim());
    const out: { key: string; label: string; thick: string; rmCode: string }[] = [];
    const push = (girder: string, segment: string) => {
      for (const p of live) {
        const code = p.code.trim();
        out.push({
          key: `${girder}/${segment}/${code}`,
          label: [girder, segment, code].filter(Boolean).join(' / ') || code,
          thick: p.thick,
          rmCode: p.rmCode,
        });
      }
    };
    if (!g) { push('', ''); return out; }
    for (let i = 1; i <= g; i++) {
      const girder = `G${i}`;
      const n = segmentCounts[i - 1] ?? 0;
      if (!n) { push(girder, ''); continue; }
      for (let sg = 1; sg <= n; sg++) push(girder, String(sg));
    }
    return out;
  }, [parts, g, segmentCounts]);

  const overrideCount = Object.keys(overrides).filter((k) => {
    const o = overrides[k];
    return o && (o.rmCode || o.thick != null);
  }).length;

  /**
   * Upload the sheet that was just filled in.
   *
   * Always APPEND. The wizard's whole purpose is adding structure to an order,
   * and a replace here would wipe a tree somebody else spent the morning on
   * because a colleague generated a starter sheet for one more line. Replace
   * stays on the Items / BOM tab, where it is a deliberate choice with a
   * confirmation in front of it.
   */
  async function upload(file: File) {
    setBusy(true); setError('');
    try {
      const companySlug = localStorage.getItem('companySlug');
      const form = new FormData();
      form.append('excel_file', file);
      form.append('mode', 'append');
      const res = await api.post<{ itemsCreated?: number; rmLinks?: number }>(
        `${API_HOST}/api/${companySlug}/fab_erp/orders/${orderId}/boq/import`, form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      // Refresh either way: even a sheet that created no items may have linked
      // raw materials to rows that were already there.
      onImported?.();

      /**
       * A sheet that added nothing KEEPS THE DIALOG OPEN.
       *
       * This used to close first and set the message after, so the one case the
       * message exists for — a Span column that matches no line code, which is
       * the easiest thing in the world to get wrong — closed the dialog, left
       * the tree looking exactly as before, and said nothing at all. The upload
       * lives here now, so the explanation has to live here too.
       */
      const n = res.data?.itemsCreated ?? 0;
      if (!n) {
        setError('That sheet added no rows — check the Span column matches a line code.');
        return;
      }
      onClose();
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string } }; message?: string };
      setError(ax.response?.data?.message ?? ax.message ?? 'Could not read that sheet');
    } finally {
      setBusy(false);
    }
  }

  /** The spec for whichever line is on screen right now. */
  function currentSpec(): LineSpec {
    return {
      spanCode,
      girders: g,
      segmentsPerGirder: s,
      segmentCounts,
      parts: parts.filter((p) => p.code.trim()).map((p) => ({
        code: p.code.trim(),
        name: p.name.trim() || undefined,
        qty: Number(p.qty) || 1,
        thick: p.thick.trim() ? Number(p.thick) : undefined,
        rmCode: p.rmCode || undefined,
      })),
      overrides,
    };
  }

  async function generate() {
    setBusy(true); setError('');
    try {
      const companySlug = localStorage.getItem('companySlug');
      /**
       * EVERY configured line goes in one sheet.
       *
       * The wizard used to build a sheet for the single line on screen, so a
       * two-line order meant running it twice and stitching the downloads —
       * or, far more likely, forgetting the second line entirely. Each line
       * becomes its own span, keyed by that line's code, which is the same
       * string the importer matches a row back to.
       */
      const specs = lines
        .map((l) => (l.id === lineId ? currentSpec() : configs[l.id]))
        .filter((sp): sp is LineSpec =>
          !!sp && !!sp.spanCode && sp.parts.length > 0);
      if (!specs.length) { setError('Nothing to generate — give at least one line some parts.'); setBusy(false); return; }

      const res = await api.post(
        `${API_HOST}/api/${companySlug}/fab_erp/orders/${orderId}/boq/wizard`,
        { specs },
        { responseType: 'blob' },
      );
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'Order_BOQ_starter.xlsx'; a.click();
      URL.revokeObjectURL(url);
      onClose();
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string } }; message?: string };
      setError(ax.response?.data?.message ?? ax.message ?? 'Could not build the sheet');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>Build a starting BOQ sheet</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 2 }}>
          This only makes a spreadsheet — nothing is saved to the order. Lay out the shape roughly,
          then fill in dimensions and change whatever you like in Excel before uploading.
          Material and operation flows are set later, on the Nesting sheet and in flow allocation.
        </Typography>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2, alignItems: 'flex-start' }}>
          <TextField
            select label="Line item" size="small" value={lineId} sx={{ minWidth: 260 }}
            onChange={(e) => setLineId(e.target.value === '' ? '' : Number(e.target.value))}
            helperText={line
              ? `Span code will be ${spanCode}${line.lineType ? ` · ${line.lineType}` : ''}`
              : 'Its code becomes the top of the sheet'}
          >
            {lines.length === 0 && <MenuItem value="" disabled>No line items yet</MenuItem>}
            {lines.map((l) => (
              <MenuItem key={l.id} value={l.id}>
                {l.code}{l.description ? ` — ${l.description}` : ''}
              </MenuItem>
            ))}
          </TextField>
          <Tooltip title="0 if this job has no girders — the level collapses and parts sit under the span">
            <TextField label="Girders" size="small" type="number" value={girders} sx={{ width: 110 }}
              onChange={(e) => setGirders(e.target.value)} />
          </Tooltip>
          <Tooltip title="The default for every girder. Override individual ones below.">
            <TextField label="Segments each" size="small" type="number" value={segments} sx={{ width: 130 }}
              onChange={(e) => setSegments(e.target.value)} />
          </Tooltip>
        </Box>

        {/* Per-girder override. Girders on one span genuinely differ — an end
            girder need not be cut into the same number of pieces as a middle
            one — and one number for all of them meant deleting rows out of the
            sheet afterwards. Blank means "whatever the default says", so the
            simple case still reads as one number. */}
        {g > 0 && g <= 20 && (
          <Box sx={{ mb: 2 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 1 }}>
              Segments per girder
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {Array.from({ length: g }, (_, i) => (
                <TextField
                  key={i}
                  label={`G${i + 1}`}
                  size="small"
                  type="number"
                  value={perGirder[i] ?? ''}
                  placeholder={String(s)}
                  sx={{ width: 84 }}
                  slotProps={{ inputLabel: { shrink: true } }}
                  onChange={(e) => setPerGirder((prev) => {
                    const next = [...prev];
                    next[i] = e.target.value;
                    return next;
                  })}
                />
              ))}
            </Box>
          </Box>
        )}

        <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 1 }}>
          Parts in every segment
          {line?.lineType && templates[line.lineType]?.length ? (
            <Box component="span" sx={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400, color: 'var(--c-text-3)' }}>
              {' '}— from your {line.lineType} template; edit freely
            </Box>
          ) : null}
        </Typography>

        <Surface e={1} sx={{ p: 1.5, mb: 1 }}>
          {parts.map((p) => (
            <Box key={p.key} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <TextField label="Code" size="small" value={p.code} sx={{ width: 96 }} placeholder="TF1"
                onChange={(e) => setPart(p.key, { code: e.target.value })} />
              <TextField label="Part name" size="small" value={p.name} sx={{ flex: '2 1 180px' }} placeholder="Top Flange"
                onChange={(e) => setPart(p.key, { name: e.target.value })} />
              <TextField label="Qty" size="small" type="number" value={p.qty} sx={{ width: 72 }}
                onChange={(e) => setPart(p.key, { qty: e.target.value })} />
              {/* Thickness first, because it is what narrows the material list
                  below it — choosing a material for an unknown thickness would
                  mean choosing from everything. */}
              <TextField label="Thick" size="small" type="number" value={p.thick} sx={{ width: 80 }}
                onChange={(e) => setPart(p.key, { thick: e.target.value, rmCode: '' })} />
              <TextField
                select label="Raw material" size="small" value={p.rmCode} sx={{ flex: '1 1 190px' }}
                onChange={(e) => setPart(p.key, { rmCode: e.target.value })}
                helperText={p.thick.trim() && materialsFor(materials, p.thick).length === 0
                  ? 'Nothing stocked at that thickness' : ' '}
              >
                <MenuItem value="">— not set —</MenuItem>
                {withSelected(materialsFor(materials, p.thick), materials,
                  (m) => !!p.rmCode && m.code === p.rmCode).map((m) => (
                  <MenuItem key={m.id} value={m.code}>
                    {materialLabel(m)}
                  </MenuItem>
                ))}
              </TextField>
              <IconButton size="small" color="error" aria-label="Remove part"
                onClick={() => setParts((ps) => (ps.length > 1 ? ps.filter((x) => x.key !== p.key) : ps))}>
                <DeleteOutlineRounded fontSize="small" />
              </IconButton>
            </Box>
          ))}
          <Button size="small" startIcon={<AddIcon />} onClick={() => setParts((ps) => [...ps, blankPart()])}>
            Add part
          </Button>
        </Surface>

        {/* The common parts above cover the usual case: every web plate on the
            span is the same 20mm plate. This is for the handful that are not —
            an end girder's flange is routinely thicker than the middle ones, and
            without this the only way to say so was to edit the sheet after. */}
        {instances.length > 0 && (
          <Surface e={1} sx={{ p: 1.5, mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Button
                size="small"
                onClick={() => setExpanded((v) => !v)}
                startIcon={expanded ? <ExpandLessRounded /> : <ExpandMoreRounded />}
              >
                {expanded ? 'Hide parts' : 'Set material per part'}
              </Button>
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                {instances.length} part{instances.length === 1 ? '' : 's'} will be generated
                {overrideCount > 0 ? ' · ' + overrideCount + ' set individually' : ''}
              </Typography>
              {overrideCount > 0 && (
                <Button
                  size="small"
                  onClick={() => setOverrides({})}
                  sx={{ ml: 'auto', color: 'var(--c-text-3)' }}
                >
                  Clear all
                </Button>
              )}
            </Box>

            {expanded && (
              <Box sx={{ mt: 1, maxHeight: 320, overflowY: 'auto' }}>
                {instances.map((inst) => {
                  const o = overrides[inst.key] ?? {};
                  const thick = o.thick != null ? String(o.thick) : inst.thick;
                  const rm = o.rmCode ?? inst.rmCode;
                  const set = (patch: { rmCode?: string; thick?: number }) =>
                    setOverrides((prev) => ({ ...prev, [inst.key]: { ...prev[inst.key], ...patch } }));
                  return (
                    <Box key={inst.key} sx={{ display: 'flex', gap: 1, mb: 0.75, alignItems: 'center' }}>
                      <Typography sx={{
                        fontSize: 11.5, fontFamily: 'monospace', width: 160, flexShrink: 0,
                        color: overrides[inst.key] ? 'var(--c-primary-700)' : 'var(--c-text-2)',
                      }}>
                        {inst.label}
                      </Typography>
                      <TextField
                        size="small" type="number" label="Thick" value={thick} sx={{ width: 88 }}
                        onChange={(e) => set({
                          thick: e.target.value === '' ? undefined : Number(e.target.value),
                          rmCode: '',
                        })}
                      />
                      <TextField
                        select size="small" label="Raw material" value={rm} sx={{ flex: 1 }}
                        onChange={(e) => set({ rmCode: e.target.value })}
                      >
                        <MenuItem value="">— not set —</MenuItem>
                        {withSelected(materialsFor(materials, thick), materials,
                          (m) => !!rm && m.code === rm).map((m) => (
                          <MenuItem key={m.id} value={m.code}>
                            {materialLabel(m)}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Box>
                  );
                })}
              </Box>
            )}
          </Surface>
        )}

        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>
          {partCount === 0
            ? 'Add at least one part — or generate anyway to get just the span and girder rows.'
            : `${totalParts} part row${totalParts === 1 ? '' : 's'} across ${g || 1} girder${g === 1 ? '' : 's'}`
              + `${totalSegments ? ` and ${totalSegments} segment${totalSegments === 1 ? '' : 's'}` : ''},`
              + ' with dimensions left blank for you to fill in.'}
        </Typography>
        {parts.some((p) => p.code.trim().toUpperCase().endsWith('/D')) && (
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mt: 0.75 }}>
            Codes ending <strong>/D</strong> are picked up by the drilled flow rule, so the holed
            variants get drilling without anyone assigning it per item.
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Box sx={{ flex: 1 }} />
        {/* Download and upload belong together. The upload used to live on the
            Items / BOM tab, so the round trip was: wizard, download, fill in,
            close, find the other tab, upload. Two places for one job. */}
        <input
          ref={fileRef} type="file" accept=".xlsx" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }}
        />
        <Button
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <UploadFileIcon />}
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          Upload filled sheet
        </Button>
        <Button
          variant="contained"
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <DownloadIcon />}
          disabled={busy}
          onClick={generate}
        >
          Download sheet
        </Button>
      </DialogActions>
    </Dialog>
  );
}
