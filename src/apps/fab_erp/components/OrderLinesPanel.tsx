import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, MenuItem, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';
import EditRounded from '@mui/icons-material/EditRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';

import api, { API_HOST } from '@core/utils/axiosConfig';
import { fabQuery, fabMutate } from '../api/client';
import { Surface, EmptyState, useToast, Mono, backendMessage } from '../components';
import StructureEditor from './StructureEditor';
import { DialogCloseButton } from './FormDialog';

/**
 * A catalog item as the line picker needs it: what it is, and enough taxonomy
 * to tell two similarly-named things apart in a list.
 */
interface CatalogOption {
  id: number;
  name: string;
  code: string | null;
  categoryName?: string | null;
  groupName?: string | null;
  subgroupName?: string | null;
}

/**
 * Step 1: what this order is selling, AND what each of those is made of.
 *
 * ── WHY THESE ARE ONE SCREEN ─────────────────────────────────────────────────
 *
 * They were two, and the second one was quietly wrong: it rendered the BOM for
 * `buildable[0]` — the FIRST line, hardcoded. An order with two lines showed two
 * line items and one structure, and the second line's BOM could not be reached
 * at all once built. `currentTree` has the same shape of assumption in it: given
 * several roots it returns the first, because a caller that did not say which
 * line it meant had to be answered somehow.
 *
 * Splitting them was the mistake. A line and its BOM are one thought — "we are
 * selling two spans, here is what a span is made of" — and asking on one screen
 * then answering on another is what let the answer go missing for the second
 * line without anyone noticing.
 *
 * So a line is a card, and its BOM is inside the card. Two lines, two BOMs, each
 * expandable, each editable where it sits.
 *
 * A line used to be a catalog item. It cannot be — the item catalog holds raw
 * materials and consumables, and nobody is going to add "42m span composite
 * girder" to it, because every job is one-off and the catalog would be a
 * catalog of one. So a line is free text: a code the user types, a description,
 * a structure type and a quantity.
 *
 * THE CODE IS LOAD-BEARING. It becomes the top level of the BOM sheet, and is
 * how each row of that sheet finds the line it belongs to — which is in turn
 * how a line can report its own progress. Hence required, uppercased, and
 * checked for duplicates before the write rather than after.
 *
 * No date and no plant here. Both belong to the order: two places to answer one
 * question is two chances to disagree, and it is the order's answer that anyone
 * downstream acts on.
 */

/** What a line SAYS its steel is — its own stated values, not resolved ones. */
interface LineSpec { material: string | null; grade: string | null }

export interface FabOrderLine {
  id: number; orderId: number; lineNo: number;
  code?: string | null; description?: string | null; lineType?: string | null;
  qty: number; unit?: string | null; unitPrice?: number | null;
  qtyCompleted?: number | null;
  /** What it was sold AS — needed to re-open the picker on the right item. */
  templateItemId?: number | null; catalogItemId?: number | null;
}

export default function OrderLinesPanel({ orderId, canManage, onChanged }: {
  orderId: number;
  canManage: boolean;
  /** Fired after any write, so a wizard rail or order page can catch up. */
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const [lines, setLines] = useState<FabOrderLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /** Which line cards are open. A line you just added opens itself. */
  const [openLines, setOpenLines] = useState<Record<number, boolean>>({});
  const [treeVersion, setTreeVersion] = useState(0);

  const [description, setDescription] = useState('');
  const [qty, setQty] = useState('1');
  const [lineType, setLineType] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  /**
   * WHAT THE STEEL IS, stated once for the whole line.
   *
   * An order is normally one material and one grade throughout, and every part
   * under this line inherits these; a part that differs overrides them on
   * itself. Stating it here rather than on six hundred BOM rows is the point —
   * copy it onto every row and changing the line stops meaning anything,
   * because each row now overrides it.
   *
   * Two of the three axes nesting matches on; thickness is the part's own.
   * WHICH PLATE a part is cut from is decided later, at nesting.
   */
  const [material, setMaterial] = useState('');
  const [grade, setGrade] = useState('');

  /**
   * THE STEEL IS PICKED, NOT TYPED.
   *
   * A blank's identity is material + grade + size, so "E350 BO", "E350BO" and
   * "e350 bo" would mint three catalog items for one piece of steel. The real
   * list is one material and four grades, read off the raw materials somebody
   * can actually buy — short enough that free text only ever added spellings.
   *
   * Grades are held per material rather than flat. Every grade pairs with MS
   * today so the distinction is invisible; it stops being on the first job in
   * something other than mild steel.
   */
  const [steel, setSteel] = useState<{ materials: string[]; byMaterial: Record<string, string[]> }>(
    { materials: [], byMaterial: {} },
  );
  useEffect(() => {
    api.get<{ materials: string[]; byMaterial: Record<string, string[]> }>(
      `${API_HOST}/api/${localStorage.getItem('companySlug')}/fab_erp/steel-options`,
    ).then((r) => setSteel(r.data)).catch(() => {});
  }, []);
  const gradesFor = useCallback(
    (m: string) => (m && steel.byMaterial[m]) ? steel.byMaterial[m]
      : [...new Set(Object.values(steel.byMaterial).flat())].sort(),
    [steel],
  );
  const [spec, setSpec] = useState<Record<number, LineSpec>>({});
  /**
   * EDITING A LINE, not just its steel.
   *
   * There was no way to change a line once added — only to set its material and
   * grade, or delete it and start again. Deleting is not equivalent: the
   * structure built under a line is attached to it, so "change the quantity from
   * 1 to 2" meant losing 32 rows and rebuilding them.
   */
  const [editLine, setEditLine] = useState<{
    line: FabOrderLine; item: CatalogOption | null;
    description: string; qty: string; unitPrice: string; material: string; grade: string;
  } | null>(null);
  /** How many structure rows hang off each line — a warning before changing the item. */
  const [builtRows, setBuiltRows] = useState<Record<number, number>>({});
  const [savingSpec, setSavingSpec] = useState(false);
  const [adding, setAdding] = useState(false);
  const [delLine, setDelLine] = useState<FabOrderLine | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fabQuery<{ data: FabOrderLine[] }>('fabErpOrderLine', {
        filters: { orderId },
        orderBy: [{ field: 'lineNo', direction: 'asc' }],
        pagination: { limit: 500 },
      });
      const rows = res.data ?? [];
      setLines(rows);
      // What is already built under each line, so changing the item can say what
      // it would strand rather than doing it silently.
      Promise.all(rows.map((l) => fabQuery<{ total?: number | null }>('fabErpItem', {
        fields: ['id'], filters: { orderLineId: l.id, nodeKind: 'structure' }, pagination: { limit: 1 }, includeTotal: true,
      }).then((r) => [l.id, r.total ?? 0] as const).catch(() => [l.id, 0] as const)))
        .then((pairs) => setBuiltRows(Object.fromEntries(pairs)));
      // One call per line, but there are a handful of lines on an order — and
      // each asks what that LINE states, which no list endpoint answers.
      const specs = await Promise.all(rows.map((l) => api
        .get<LineSpec>(`${specBase()}/spec/lines/${l.id}`)
        .then((r) => [l.id, { material: r.data.material, grade: r.data.grade }] as const)
        .catch(() => [l.id, { material: null, grade: null }] as const)));
      setSpec(Object.fromEntries(specs));
    } catch (e) {
      setError(backendMessage(e, 'Could not load line items.'));
    } finally { setLoading(false); }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  /**
   * The spec routes hang off the APP root, not off `/orders/:orderId` — they
   * identify a line by its id alone, the same way the flow route does.
   */
  /**
   * HOW MANY OF THIS LINE, typed where it is read.
   *
   * The BOM rows beneath take their quantity in a box on the row; the line took
   * its own behind a pencil and a dialog. Same question, two different gestures,
   * on one screen — and the line's quantity is the one that multiplies
   * everything under it, so it is the last one that should be hard to reach.
   *
   * Saved on blur and only when it actually changed, matching the rows.
   */
  const saveQty = useCallback(async (lineId: number, raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return;
    try {
      await fabMutate('fabErpOrderLine', 'update', { id: lineId, qty: n });
      await load();
      onChanged?.();
    } catch (e) {
      setError(backendMessage(e, 'Could not change that quantity.'));
    }
  }, [load, onChanged]);

  async function saveLine() {
    if (!editLine) return;
    setSavingSpec(true); setError('');
    try {
      const e = editLine;
      await fabMutate('fabErpOrderLine', 'update', {
        id: e.line.id,
        description: e.description.trim() || null,
        qty: Number(e.qty) || 1,
        unit_price: e.unitPrice ? Number(e.unitPrice) : null,
        /*
         * All three move together or none does — they were always one fact.
         * Sent even when unchanged so a line that predates the picker acquires
         * them the first time somebody edits it.
         */
        catalog_item_id: e.item?.id ?? null,
        template_item_id: e.item?.id ?? null,
        line_type: e.item?.groupName ?? e.line.lineType ?? null,
      });
      // The steel is its own route: it is a field value on the line, not a
      // column, so the generic update cannot carry it.
      await api.post(`${specBase()}/spec/lines/${e.line.id}`, {
        material: e.material.trim(), grade: e.grade.trim(),
      });
      setEditLine(null);
      await load();
      onChanged?.();
      toast('Line updated');
    } catch (e) {
      setError(backendMessage(e, 'Could not update the line.'));
    } finally { setSavingSpec(false); }
  }

  /**
   * WHAT IS BEING SOLD, picked from the catalog rather than typed twice.
   *
   * This replaced a "Structure type" dropdown reading a hardcoded list, which
   * was the third place one fact was recorded: a line already carried
   * `catalog_item_id` and `template_item_id` holding the SAME number, beside a
   * `line_type` string holding that item's category. The picker sets the item;
   * the other two are derived from it.
   *
   * Raw materials are excluded. A plate is stock you consume, not a line you
   * sell, and 1,426 of the 1,536 catalog items are plates and angles — leaving
   * them in makes the search a raw-material search with a few girders lost in
   * it. Anything else is offered, so selling a single fabricated part still
   * works.
   */
  const [catalog, setCatalog] = useState<CatalogOption[]>([]);
  const [item, setItem] = useState<CatalogOption | null>(null);
  useEffect(() => {
    /**
     * THE EXCLUSION IS THE SERVER'S JOB, and doing it here cost the screen its
     * answer. Filtering after a `limit: 1000` filters what the limit LEFT: the
     * first thousand names run out inside the angle sections, at
     * "ISA 75 x 75 x 10 x 9000", so 42 of the 104 fabricated items ever reached
     * the browser and searching "Span" found only BowString Span — everything
     * from S onwards had been cut before the filter ran.
     */
    /*
     * Filtered on category_id, a column on the row itself, rather than on the
     * joined category NAME — a filter-only column depends on the join being
     * present, and a picker that silently returns the wrong set is the failure
     * being fixed here, not one to risk again.
     */
    (async () => {
      try {
        const cats = await fabQuery<{ data: { id: number; name: string }[] }>('fabErpItemCategory', {
          pagination: { limit: 200 },
        });
        /*
         * FABRICATED ONLY. Excluding raw materials left machines, spares and
         * consumables in the list, so the picker offered CNC Drilling, a Blast
         * Nozzle and Zinc Wire as things to sell a customer. Naming what belongs
         * rather than what does not also means a category added later has to be
         * let in deliberately, instead of appearing in a picker by default.
         */
        const wanted = (cats.data ?? [])
          .filter((c) => c.name === 'Fabricated')
          .map((c) => c.id);
        const r = await fabQuery<{ data: CatalogOption[] }>('fabErpItemCatalog', {
          filters: wanted.length ? { categoryId: wanted } : {},
          orderBy: [{ field: 'name', direction: 'asc' }],
          pagination: { limit: 1000 },
        });
        setCatalog(r.data ?? []);
      } catch { setCatalog([]); }
    })();
  }, []);

  const pickItem = (picked: CatalogOption | null) => {
    setItem(picked);
    if (!picked) return;
    // Only fill what is still blank — retyping over somebody's edit because
    // they changed their mind about the item is worse than leaving it stale.
    setDescription((d) => (d.trim() ? d : picked.name));
  };

  const lineNo = lines.length + 1;

  async function add() {
    if (!item || !qty) return;
    setAdding(true); setError('');
    try {
      await fabMutate('fabErpOrderLine', 'insert', {
        order_id: orderId,
        line_no: lineNo,
        description: description.trim() || null,
        qty: Number(qty),
        /**
         * ONE PICK, THREE COLUMNS — because all three were always the same
         * fact. `catalog_item_id` is what was chosen, `template_item_id` is the
         * BOM to expand and is the same item, and `line_type` is that item's
         * group. Written together from one answer instead of asked three times
         * and left to disagree.
         */
        catalog_item_id: item?.id ?? null,
        template_item_id: item?.id ?? null,
        line_type: item?.groupName ?? lineType ?? null,
        unit_price: unitPrice ? Number(unitPrice) : null,
      });
      /**
       * The steel is a SECOND call, because a line has to exist before a field
       * value can hang off it. Re-read to find the row just written rather than
       * trusting an insertId the mutate API does not return.
       */
      if (material.trim() || grade.trim()) {
        /**
         * Found by LINE NUMBER, not by "newest id". The mutate API does not hand
         * back the row it inserted, and ordering by id descending quietly
         * returned nothing here — so the steel typed into the form was silently
         * dropped and the line came out saying "not set".
         *
         * This used to key on the code, which is gone. `line_no` is written on
         * the same insert and is one per line within an order, so it identifies
         * the row just as reliably.
         */
        const fresh = await fabQuery<{ data: FabOrderLine[] }>('fabErpOrderLine', {
          filters: { orderId },
          pagination: { limit: 500 },
        }).then((r) => (r.data ?? []).find((l) => Number(l.lineNo) === lineNo));
        if (fresh) {
          await api.post(`${specBase()}/spec/lines/${fresh.id}`, {
            material: material.trim(), grade: grade.trim(),
          });
        }
      }
      // The item clears with the rest, or the next pick finds code and
      // description already filled and leaves the previous line's values in place.
      setItem(null);
      setDescription(''); setQty('1'); setLineType(''); setUnitPrice('');
      setMaterial(''); setGrade('');
      await load();
      onChanged?.();
      toast('Line item added');
    } catch (e) {
      setError(backendMessage(e, 'Could not add the line.'));
    } finally { setAdding(false); }
  }

  async function remove(line: FabOrderLine) {
    try {
      await fabMutate('fabErpOrderLine', 'delete', { id: line.id });
      setDelLine(null);
      await load();
      onChanged?.();
      toast('Line item removed');
    } catch (e) {
      setError(backendMessage(e, 'Could not remove the line.'));
    }
  }

  if (loading) {
    return <Surface e={1} sx={{ p: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Surface>;
  }

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {canManage && (
        <Surface e={1} sx={{ p: 2, mb: 2 }}>
          <Typography sx={{
            fontSize: 11, fontWeight: 600, letterSpacing: '.06em',
            textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 1.5,
          }}>
            Add line item
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {/*
              THE ONE THING THAT HAS TO BE CHOSEN. It decides the structure, so
              it comes first and everything after it is a detail of this line.
            */}
            <Autocomplete
              options={catalog}
              value={item}
              onChange={(_, v) => pickItem(v)}
              getOptionLabel={(o) => o.name}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              sx={{ flex: '2 1 260px' }}
              /**
               * THE NAME LEADS, THE TAXONOMY DISAMBIGUATES.
               *
               * Five items are called some kind of "Span" and one of them is
               * called just "Span" — the name alone cannot tell you which
               * structure you are about to build. Category, group and subgroup
               * underneath answer that without competing with the name for
               * attention.
               */
              renderOption={(props, o) => (
                <li {...props} key={o.id}>
                  <Box sx={{ py: 0.25 }}>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{o.name}</Typography>
                    <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>
                      {[o.categoryName, o.groupName, o.subgroupName].filter(Boolean).join(' › ')}
                      {o.code ? `  ·  ${o.code}` : ''}
                    </Typography>
                  </Box>
                </li>
              )}
              /**
               * Typing matches the taxonomy too, so "composite" finds the Span
               * that is only distinguishable by its group.
               */
              filterOptions={(opts, { inputValue }) => {
                const q = inputValue.trim().toLowerCase();
                if (!q) return opts;
                return opts.filter((o) => [
                  o.name, o.code, o.categoryName, o.groupName, o.subgroupName,
                ].filter(Boolean).join(' ').toLowerCase().includes(q));
              }}
              renderInput={(params) => (
                <TextField
                  {...params} label="Item" size="small" required
                  helperText="What you are selling — its BOM becomes the structure"
                />
              )}
            />
            {/*
              NO CODE HERE ANY MORE.

              A line's code was the top level of every item code beneath it, and
              the BOQ sheet keyed its rows on it. Neither exists now: the BOM
              step mints no codes, and the sheet is retired. What was left was a
              required box that invented SPAN1 so it could be carried nowhere.

              A line is identified by its number and what it is selling. Codes
              come back at production-order time, on the pieces that need them.
            */}
            <TextField
              label="Qty" size="small" type="number" value={qty} sx={{ flex: '0 1 90px' }}
              onChange={(e) => setQty(e.target.value)}
            />
            <TextField
              label="Unit price" size="small" type="number" value={unitPrice} sx={{ flex: '0 1 120px' }}
              onChange={(e) => setUnitPrice(e.target.value)}
            />
            {/* The steel, stated once for everything under this line. Blank is
                fine — a part can state its own, and nesting will ask for one
                before it can choose a plate. */}
            <TextField
              select label="Material" size="small" value={material} sx={{ flex: '0 1 130px' }}
              onChange={(e) => {
                const next = e.target.value;
                setMaterial(next);
                // A grade that does not exist for the new material is not a
                // choice somebody made — it is one they made about the old one.
                if (next && grade && !gradesFor(next).includes(grade)) setGrade('');
              }}
              helperText="Applies to every part"
            >
              <MenuItem value="">—</MenuItem>
              {steel.materials.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
            </TextField>
            <TextField
              select label="Grade" size="small" value={grade} sx={{ flex: '0 1 150px' }}
              onChange={(e) => setGrade(e.target.value)}
              helperText="Unless a part differs"
            >
              <MenuItem value="">—</MenuItem>
              {gradesFor(material).map((g) => <MenuItem key={g} value={g}>{g}</MenuItem>)}
            </TextField>
            <Button
              variant="contained" sx={{ mt: 0.25 }}
              startIcon={adding ? <CircularProgress size={14} color="inherit" /> : <AddIcon />}
              disabled={adding || !item || !qty}
              onClick={add}
            >
              Add
            </Button>
          </Box>
        </Surface>
      )}

      {lines.length === 0 ? (
        <EmptyState
          icon={<Inventory2Rounded />}
          title="No line items yet"
          hint="Add what this order is selling — a code, a description and a quantity. The code becomes the top of its BOM."
        />
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {lines.map((line) => {
            const isOpen = openLines[line.id] !== false;   // open unless collapsed
            const rows = builtRows[line.id] ?? 0;
            const sp = spec[line.id];
            const steel = [sp?.material, sp?.grade].filter(Boolean).join(' · ');
            return (
              <Surface key={line.id} e={1} sx={{ overflow: 'hidden' }}>
                {/* ── the line itself ─────────────────────────────────── */}
                {/*
                  THE LINE IS THE TOP ROW OF ITS OWN TREE, so it is shaped like
                  one: same height, same type size, quantity in the same column
                  as every quantity beneath it.

                  It used to be a card header — bigger text, a subtitle, its own
                  padding — which made the first row of the structure look like a
                  different kind of thing from the rows under it, when it is
                  simply the one they hang off.
                */}
                <Box sx={{
                  display: 'flex', alignItems: 'center', gap: 1,
                  px: 1.5, py: 0.4, minHeight: 40,
                  borderBottom: isOpen ? '1px solid var(--c-divider)' : undefined,
                  background: 'var(--c-surface-2)',
                }}>
                  <IconButton
                    size="small" sx={{ p: 0.25 }}
                    onClick={() => setOpenLines((o) => ({ ...o, [line.id]: !isOpen }))}
                    aria-label={isOpen ? 'Collapse this line' : 'Expand this line'}
                  >
                    {isOpen ? <ExpandMoreRounded fontSize="small" /> : <ChevronRightRounded fontSize="small" />}
                  </IconButton>

                  <Mono chip>{line.lineNo}</Mono>

                  <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 600, flexShrink: 0 }}>
                    {line.description ?? '—'}
                  </Typography>
                  <Typography noWrap sx={{ fontSize: 12, color: 'var(--c-text-3)', flex: 1, minWidth: 0 }}>
                    {[line.lineType, steel || null,
                      rows > 0 ? `${rows} rows` : 'nothing built yet',
                    ].filter(Boolean).join(' · ')}
                  </Typography>

                  <Box sx={{ flexShrink: 0, textAlign: 'right' }}>
                    <TextField
                      size="small" type="number" disabled={!canManage}
                      defaultValue={Number(line.qty ?? 1)}
                      onBlur={(e) => {
                        if (Number(e.target.value) === Number(line.qty ?? 1)) return;
                        void saveQty(line.id, e.target.value);
                      }}
                      sx={{ width: 76 }}
                      inputProps={{ min: 1, style: { fontSize: 11.5, textAlign: 'right' } }}
                    />

                  </Box>

                  {canManage && (
                    <Box sx={{ display: 'flex', flexShrink: 0 }}>
                      <Tooltip title="Edit this line">
                        <IconButton
                          size="small"
                          onClick={() => setEditLine({
                            line,
                            item: catalog.find((c) => c.id === (line.templateItemId ?? line.catalogItemId)) ?? null,
                            description: line.description ?? '',
                            // Number() first: the API returns DECIMAL as "1.0000",
                            // and a box that opens reading 1.0000 invites somebody
                            // to "fix" it.
                            qty: String(Number(line.qty ?? 1)),
                            unitPrice: line.unitPrice == null ? '' : String(line.unitPrice),
                            material: spec[line.id]?.material ?? '',
                            grade: spec[line.id]?.grade ?? '',
                          })}
                          aria-label={`Edit ${line.description ?? `line ${line.lineNo}`}`}
                        >
                          <EditRounded fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Remove">
                        <IconButton
                          size="small" color="error" onClick={() => setDelLine(line)}
                          aria-label={`Remove ${line.description ?? `line ${line.lineNo}`}`}
                        >
                          <DeleteOutlineRounded fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  )}
                </Box>

                {/*
                  ── AND WHAT IT IS MADE OF, in the same card ──────────────

                  `source` is per line: a line with nothing built opens on the
                  CATALOGUE's recipe, one that has opens on what this order
                  settled on. On a two-line order those can differ, which is the
                  case the old single-structure screen could not express at all.
                */}
                {isOpen && (
                  <StructureEditor
                    key={`line-${line.id}-${rows > 0 ? 'built' : 'new'}-${treeVersion}`}
                    variant="inline"
                    source={rows > 0 ? 'current' : 'bom'}
                    open
                    orderId={orderId}
                    orderLine={{
                      id: line.id,
                      code: line.code ?? null,
                      description: line.description ?? null,
                      itemId: line.templateItemId ?? line.catalogItemId ?? null,
                    }}
                    onClose={() => {}}
                    onDone={() => { setTreeVersion((v) => v + 1); void load(); onChanged?.(); }}
                  />
                )}
              </Surface>
            );
          })}
        </Box>
      )}

      <Dialog open={!!delLine} onClose={() => setDelLine(null)} maxWidth="xs" fullWidth>
      <DialogCloseButton absolute onClose={() => (() => setDelLine(null))()} />
        <DialogTitle sx={{ fontWeight: 600 }}>Remove line item</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13.5 }}>
            Remove <strong>{delLine?.description ?? `line ${delLine?.lineNo}`}</strong> from this
            order? Any structure rows under it stay where they are — they simply stop
            belonging to a line.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDelLine(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => delLine && remove(delLine)}>Remove</Button>
        </DialogActions>
      </Dialog>

      {/*
        WHAT THIS LINE IS MADE OF.

        Set here rather than on each BOM row because it is one statement about
        the whole line, and every part inherits it. A part that genuinely
        differs — a stainless insert in a mild-steel span — overrides it on
        itself, and nesting refuses any plate that disagrees with either.
      */}
      {/*
        ONE DIALOG FOR THE WHOLE LINE.
        It used to set only material and grade, so a line's item, quantity and
        price were fixed the moment it was added — and deleting to re-add is not
        equivalent, because the structure built under a line belongs to it.
      */}
      <Dialog open={!!editLine} onClose={() => setEditLine(null)} maxWidth="sm" fullWidth>
        <DialogCloseButton absolute onClose={() => setEditLine(null)} />
        <DialogTitle sx={{ fontWeight: 600 }}>
          Line {editLine?.line.lineNo}
        </DialogTitle>
        <DialogContent>
          {editLine && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 0.5 }}>
              <Autocomplete
                options={catalog}
                value={editLine.item}
                getOptionLabel={(o) => o.name}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                onChange={(_, v) => setEditLine((e) => (e ? {
                  ...e, item: v, description: v ? v.name : e.description,
                } : e))}
                filterOptions={(opts, { inputValue }) => {
                  const q = inputValue.trim().toLowerCase();
                  if (!q) return opts.slice(0, 50);
                  return opts.filter((o) => [o.name, o.code, o.categoryName, o.groupName, o.subgroupName]
                    .filter(Boolean).join(' ').toLowerCase().includes(q));
                }}
                renderOption={(props, o) => (
                  <li {...props} key={o.id}>
                    <Box>
                      <Typography sx={{ fontSize: 13 }}>{o.name}</Typography>
                      <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>
                        {[o.categoryName, o.groupName, o.subgroupName].filter(Boolean).join(' › ')}
                      </Typography>
                    </Box>
                  </li>
                )}
                renderInput={(p) => <TextField {...p} size="small" label="Item" />}
              />

              {/*
                CHANGING THE ITEM IS NOT A SMALL EDIT once a structure exists:
                those rows came from the old item's BOM and would stay exactly as
                they are. Said out loud, with the count, rather than discovered.
              */}
              {(builtRows[editLine.line.id] ?? 0) > 0
                && editLine.item?.id !== (editLine.line.templateItemId ?? editLine.line.catalogItemId) && (
                <Alert severity="warning" sx={{ py: 0.5 }}>
                  This line already has <b>{builtRows[editLine.line.id]}</b> structure row(s), built
                  from the item it was. They stay as they are — rebuild the structure if they should
                  follow the change.
                </Alert>
              )}

              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                  label="Qty" size="small" type="number" sx={{ flex: '0 1 110px' }}
                  value={editLine.qty}
                  onChange={(e) => setEditLine((v) => (v ? { ...v, qty: e.target.value } : v))}
                />
                <TextField
                  label="Unit price" size="small" type="number" sx={{ flex: '0 1 150px' }}
                  value={editLine.unitPrice}
                  onChange={(e) => setEditLine((v) => (v ? { ...v, unitPrice: e.target.value } : v))}
                />
              </Box>

              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                  select label="Material" size="small" sx={{ flex: 1 }}
                  value={editLine.material}
                  onChange={(e) => setEditLine((v) => {
                    if (!v) return v;
                    const next = e.target.value;
                    const keep = !next || !v.grade || gradesFor(next).includes(v.grade);
                    return { ...v, material: next, grade: keep ? v.grade : '' };
                  })}
                >
                  <MenuItem value="">—</MenuItem>
                  {steel.materials.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                </TextField>
                <TextField
                  select label="Grade" size="small" sx={{ flex: 1 }}
                  value={editLine.grade}
                  onChange={(e) => setEditLine((v) => (v ? { ...v, grade: e.target.value } : v))}
                >
                  <MenuItem value="">—</MenuItem>
                  {gradesFor(editLine.material).map((g) => <MenuItem key={g} value={g}>{g}</MenuItem>)}
                </TextField>
              </Box>
              <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
                Clearing the steel removes it, and the parts stop inheriting that value.
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditLine(null)} disabled={savingSpec}>Cancel</Button>
          <Button
            variant="contained" onClick={saveLine} disabled={savingSpec || !editLine?.item}
            startIcon={savingSpec ? <CircularProgress size={14} color="inherit" /> : undefined}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/** The fab_erp app root, which the spec routes hang off. */
function specBase() {
  return `${API_HOST}/api/${localStorage.getItem('companySlug')}/fab_erp`;
}
