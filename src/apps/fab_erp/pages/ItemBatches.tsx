/**
 * ItemBatches — item-level stock summary view (live-aggregated from
 * fab_stock_pieces via the /stock/summary route), with a "Segment by"
 * dimension per item (batch, heat, or individual stock piece) that expands
 * the row in place into sub-rows, and a drill-down into the stock ledger for
 * a clicked sub-row. Stock Piece segments additionally show every
 * stock-piece-level field value inline, and are the one place in the app where
 * a value can be SET on an individual piece.
 *
 * WHY THE PIECE EDITOR LIVES HERE. A physical plate is not its catalog item:
 * the item says "MS Plate E350 16mm", the plate in the rack says "5850 long,
 * because that is what the mill actually sent". Until this screen had a write
 * path there was none anywhere in the frontend — /stock/summary returned each
 * piece's values and the row rendered them read-only, so the only way a piece
 * ever acquired a value was a hand-written INSERT. Everything downstream that
 * matches steel to a nest reads those values, so "no editor" meant "the size
 * on the shelf is whatever the item guessed".
 *
 * IT WRITES THROUGH THE FIELD REGISTRY, NOT fab_custom_fields. POST
 * /fields/values -> setFields is the only path that validates: it refuses an
 * unknown key, a non-number in a number field, an out-of-list enum, and — the
 * one that matters here — a value at a rung the field may not be set on. It
 * also stores value_num and unit_code separately, which is what stops the
 * fused "2000 mm" strings the legacy table is full of.
 *
 * THE LADDER GATE IS SHOWN, NOT SWALLOWED. `appliesAt` names the NARROWEST rung
 * a field may be set on. A field declared to be the same for every piece
 * (appliesAt = catalog_item / order_item) is rendered read-only with the reason
 * printed next to it, and if the server refuses a write anyway its `rejected[]`
 * is displayed verbatim and the dialog stays open. A refusal that looks like a
 * save is the failure mode worth engineering against.
 */

import { Fragment, useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { Link as RouterLink, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, IconButton, Link, Menu, MenuItem, Select, Switch, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import KeyboardArrowDownRounded from '@mui/icons-material/KeyboardArrowDownRounded';
import TuneRounded from '@mui/icons-material/TuneRounded';

import { fabQuery, fabGet, type FilterValue } from '../api/client';
import {
  getFieldValues, getFieldVocabulary, setFieldValues,
  type FieldDef, type FieldVocabulary, type ResolvedValue,
} from '../api/fields';
import type { FabPlant, FabStockLedger, FabStockLocation } from '../types';
import { usePermission } from '@core/hooks/usePermission';
import { useAuth } from '@core/contexts/AuthContext';
import { isAdminRole } from '@core/utils/roles';
import { Surface, PageHeader, Mono, EmptyState, ListSkeleton, FilterBar, useToast, backendMessage } from '../components';
import { DialogCloseButton } from '../components/FormDialog';

const th = { fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '.05em', borderColor: 'var(--c-divider)' } as const;
const td = { borderColor: 'var(--c-divider)', fontSize: 13, color: 'var(--c-text)' } as const;

// ---------------------------------------------------------------------------
// /stock/summary response shape (see multi_app_be/apps/fab_erp/routes/stock.js)
// ---------------------------------------------------------------------------

interface StockSummaryCustomField { fieldKey: string; fieldValue: string | null }
interface StockSummarySegment {
  value: string | number | null;
  qty: number;
  pieceId?: number;
  batchNo?: string | null;
  heatNo?: string | null;
  serialNo?: string | null;
  markNo?: string | null;
  status?: string | null;
  customFields?: StockSummaryCustomField[];
}
interface StockSummaryItem {
  catalogItemId: number;
  name: string;
  code: string;
  unit: string | null;
  qty: number;
  segments?: StockSummarySegment[];
}
interface StockSummaryResponse { ok: boolean; data: { items: StockSummaryItem[] } }

// Segmentation options — value is the exact `groupBy` query param the
// backend accepts.
const BASE_SEGMENT_OPTIONS: { key: string; label: string }[] = [
  { key: 'batchNo', label: 'Batch' },
  { key: 'heatNo', label: 'Heat' },
  { key: 'piece', label: 'Stock Piece' },
];

// groupBy keys that map onto a fab_stock_ledger column we can filter on for
// the drill-down dialog.
const LEDGER_FILTER_FIELD: Record<string, string> = {
  batchNo: 'batchNo',
  heatNo: 'heatNo',
  piece: 'pieceId',
};

interface DrillTarget {
  catalogItemId: number;
  groupByKey: string;
  segmentLabel: string;
  value: string | number | null;
  displayValue: string | number | null;
}

interface ExpandedState {
  groupByKey: string;
  optionLabel: string;
  loading: boolean;
  error?: string;
  segments: StockSummarySegment[];
}

// ---------------------------------------------------------------------------
// Field-value helpers
// ---------------------------------------------------------------------------

/** Where a resolved value came from, in words a person can act on. */
const RUNG_LABEL: Record<string, string> = {
  default: 'the field default',
  category: 'the category',
  group: 'the group',
  subgroup: 'the subgroup',
  catalog_item: 'the item',
  order_item: 'the order item',
  stock_piece: 'this piece',
};

/** The item's place in the taxonomy, used to hide fields that do not apply. */
interface Taxonomy { categoryId: number | null; groupId: number | null; subgroupId: number | null }
const NO_TAXONOMY: Taxonomy = { categoryId: null, groupId: null, subgroupId: null };

/**
 * A field carrying a category/group/subgroup is offered only under that branch.
 * A null on the field means "anywhere", which is why each test is skipped
 * rather than compared against null — comparing would hide every global field.
 */
function taxonomyMatches(def: FieldDef, tax: Taxonomy): boolean {
  if (def.categoryId != null && def.categoryId !== tax.categoryId) return false;
  if (def.groupId != null && def.groupId !== tax.groupId) return false;
  if (def.subgroupId != null && def.subgroupId !== tax.subgroupId) return false;
  return true;
}

function formatValue(v: ResolvedValue['value']): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

function withUnit(v: ResolvedValue): string {
  const text = formatValue(v.value);
  return v.unit && text !== '—' ? `${text} ${v.unit}` : text;
}

/** The editor's text form of a resolved value. Booleans become the Select's keys. */
function toDraft(v: ResolvedValue | undefined): string {
  if (!v || v.value === null || v.value === undefined) return '';
  if (typeof v.value === 'boolean') return v.value ? 'true' : 'false';
  return String(v.value);
}

/**
 * Run `fn` over `items` with at most `limit` in flight.
 *
 * An expanded item can hold fifty pieces and each needs its own
 * /fields/values call — the route resolves one target at a time. Firing all
 * fifty at once is what turns a table expansion into a stalled browser.
 */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function ReceiptsDialog({ target, onClose }: { target: DrillTarget | null; onClose: () => void }) {
  const [rows, setRows] = useState<FabStockLedger[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const ledgerField = target ? LEDGER_FILTER_FIELD[target.groupByKey] : undefined;

  useEffect(() => {
    if (!target) return;
    setLoading(true); setError('');
    const filters: Record<string, FilterValue> = { catalogItemId: target.catalogItemId };
    if (ledgerField) filters[ledgerField] = target.value;
    fabQuery<{ data: FabStockLedger[] }>('fabErpStockLedger', { filters, orderBy: [{ field: 'txnDate', direction: 'desc' }] })
      .then((res) => setRows(res.data ?? []))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return (
    <Dialog open={!!target} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogCloseButton absolute onClose={() => onClose()} />
      <DialogTitle sx={{ fontWeight: 600 }}>
        Ledger — <Mono>{target?.displayValue ?? '—'}</Mono>
      </DialogTitle>
      <DialogContent>
        {!ledgerField && target && (
          <Alert severity="info" sx={{ mb: 2 }}>
            The stock ledger doesn't track "{target.segmentLabel}" values directly — showing all
            ledger entries for this item instead.
          </Alert>
        )}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
        ) : rows.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 2 }}>No ledger entries found.</Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow sx={{ background: 'var(--c-surface-2)' }}>
                <TableCell sx={th}>Txn date</TableCell>
                <TableCell sx={th} align="right">Qty</TableCell>
                <TableCell sx={th} align="right">Unit cost</TableCell>
                <TableCell sx={th}>Type</TableCell>
                <TableCell sx={th}>Batch / heat</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell sx={td}><Mono>{r.txnDate}</Mono></TableCell>
                  <TableCell sx={td} align="right"><Mono tabular>{r.qty}</Mono></TableCell>
                  <TableCell sx={td} align="right">{r.unitCost ?? '—'}</TableCell>
                  {/* Supplier and a link to the GRN used to sit here. With no
                      purchase order there is no supplier to name and no receipt
                      document to open, so the row carries what it can still
                      prove instead: what kind of movement this was, and which
                      physical piece it touched. */}
                  <TableCell sx={td}>{r.txnType ?? '—'}</TableCell>
                  <TableCell sx={td}>{r.batchCode ?? r.heatNo ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// PieceFieldsDialog — the write path for a single physical piece
// ---------------------------------------------------------------------------

interface PieceEditTarget {
  pieceId: number;
  catalogItemId: number;
  /** What the row calls this piece, so the dialog title names the same thing. */
  label: string;
}

/** One field's editing state. Kept as text so a half-typed number is not lost. */
type DraftMap = Record<string, string>;

function PieceFieldsDialog({ target, onClose, onSaved }: {
  target: PieceEditTarget | null;
  onClose: () => void;
  /** Hand the freshly resolved values back so the row behind updates. */
  onSaved: (pieceId: number, values: Record<string, ResolvedValue>, defs: FieldDef[]) => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [defs, setDefs] = useState<FieldDef[]>([]);
  const [values, setValues] = useState<Record<string, ResolvedValue>>({});
  const [tax, setTax] = useState<Taxonomy>(NO_TAXONOMY);
  const [vocab, setVocab] = useState<FieldVocabulary | null>(null);
  const [draft, setDraft] = useState<DraftMap>({});
  const [units, setUnits] = useState<DraftMap>({});
  const [rejected, setRejected] = useState<Array<{ fieldKey: string; why: string }>>([]);
  const [showAll, setShowAll] = useState(false);

  const catalogItemId = target?.catalogItemId ?? null;

  const seed = useCallback((fieldDefs: FieldDef[], resolved: Record<string, ResolvedValue>) => {
    const d: DraftMap = {};
    const u: DraftMap = {};
    for (const f of fieldDefs) {
      const v = resolved[f.fieldKey];
      // Only a value AUTHORED on this piece prefills the box. Prefilling an
      // inherited one would turn every save into a copy of the item's value
      // onto the piece, which is precisely the drift this screen prevents.
      d[f.fieldKey] = v && v.from.scope === 'stock_piece' ? toDraft(v) : '';
      u[f.fieldKey] = (v && v.from.scope === 'stock_piece' ? v.unit : null) ?? f.unit ?? '';
    }
    setDraft(d);
    setUnits(u);
  }, []);

  // Keyed on the target OBJECT, not its id: reopening the same piece must
  // refetch, or a stale copy of values someone else has since changed would be
  // what the next edit is based on.
  const load = useCallback(async () => {
    if (!target) return;
    setLoading(true); setError(''); setRejected([]);
    try {
      const res = await getFieldValues('stock_piece', target.pieceId);
      setDefs(res.fields ?? []);
      setValues(res.values ?? {});
      seed(res.fields ?? [], res.values ?? {});
    } catch (e) {
      setError(backendMessage(e, 'Could not load this piece’s fields.'));
    } finally {
      setLoading(false);
    }
  }, [target, seed]);

  useEffect(() => { void load(); }, [load]);

  // The item's branch of the taxonomy, so a plate is not offered the
  // depreciation fields that belong to machines. Best-effort: a failure here
  // only means the unfiltered list, never a blocked editor.
  useEffect(() => {
    if (catalogItemId == null) { setTax(NO_TAXONOMY); return; }
    let cancelled = false;
    fabQuery<{ data: Array<{ id: number; categoryId: number | null; groupId: number | null; subgroupId: number | null }> }>(
      'fabErpItemCatalog',
      { filters: { id: catalogItemId }, pagination: { limit: 1 } },
    ).then((r) => {
      if (cancelled) return;
      const row = (r.data ?? [])[0];
      setTax(row
        ? { categoryId: row.categoryId ?? null, groupId: row.groupId ?? null, subgroupId: row.subgroupId ?? null }
        : NO_TAXONOMY);
    }).catch(() => { if (!cancelled) setTax(NO_TAXONOMY); });
    return () => { cancelled = true; };
  }, [catalogItemId]);

  // Units carry conversion factors, so a length authored in metres lands in the
  // column as millimetres. Optional — without it the field's declared unit is
  // simply the only choice.
  useEffect(() => {
    if (target == null || vocab != null) return;
    let cancelled = false;
    getFieldVocabulary().then((v) => { if (!cancelled) setVocab(v); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [target, vocab]);

  const inBranch = useCallback(
    (f: FieldDef) => showAll || taxonomyMatches(f, tax) || values[f.fieldKey]?.from.scope === 'stock_piece',
    [showAll, tax, values],
  );

  /** Fields this piece may hold a value of its own for. */
  const settable = useMemo(
    () => defs.filter((f) => f.appliesAt === 'stock_piece' && inBranch(f)),
    [defs, inBranch],
  );

  /**
   * Fields that resolve onto this piece but may NOT be set on it — the ladder
   * gate, rendered rather than hidden. Hiding them would leave someone hunting
   * a box that is deliberately absent.
   */
  const fixed = useMemo(
    () => defs.filter((f) => f.appliesAt !== 'stock_piece' && values[f.fieldKey] != null && inBranch(f)),
    [defs, values, inBranch],
  );

  const unitOptions = useCallback((f: FieldDef) => {
    if (!vocab || !f.dimension) return f.unit ? [f.unit] : [];
    const codes = vocab.units.filter((u) => u.dimension === f.dimension).map((u) => u.code);
    if (f.unit && !codes.includes(f.unit)) codes.unshift(f.unit);
    return codes;
  }, [vocab]);

  /** Only what the user actually changed, so an untouched form writes nothing. */
  const payload = useMemo(() => {
    const out: Record<string, string | null | { value: string; unit?: string }> = {};
    for (const f of settable) {
      const next = (draft[f.fieldKey] ?? '').trim();
      const current = values[f.fieldKey];
      const own = current?.from.scope === 'stock_piece';
      const ownText = own ? toDraft(current) : '';
      const ownUnit = (own ? current.unit : null) ?? f.unit ?? '';
      const nextUnit = units[f.fieldKey] ?? f.unit ?? '';

      if (next === '') {
        // Clearing something never set on the piece is a no-op, not a delete.
        if (own) out[f.fieldKey] = null;
        continue;
      }
      if (next === ownText && nextUnit === ownUnit) continue;
      out[f.fieldKey] = f.dataType === 'number' && nextUnit
        ? { value: next, unit: nextUnit }
        : next;
    }
    return out;
  }, [settable, draft, units, values]);

  const changedCount = Object.keys(payload).length;

  async function save() {
    if (!target) return;
    if (changedCount === 0) { setError('Nothing has changed.'); return; }
    setSaving(true); setError(''); setRejected([]);
    try {
      const res = await setFieldValues('stock_piece', target.pieceId, payload);

      // Refetch rather than patch: the server converts units and applies the
      // ladder, so what it now resolves is the only trustworthy answer.
      const fresh = await getFieldValues('stock_piece', target.pieceId);
      setDefs(fresh.fields ?? []);
      setValues(fresh.values ?? {});
      seed(fresh.fields ?? [], fresh.values ?? {});
      onSaved(target.pieceId, fresh.values ?? {}, fresh.fields ?? []);

      // A refusal is reported, never swallowed. setFields returns 200 with the
      // rejects listed precisely so one bad key does not discard the rest —
      // which also means a silent client would show a green tick over a value
      // that was thrown away.
      if (res.rejected?.length) {
        setRejected(res.rejected);
        toast(`${res.written} saved, ${res.rejected.length} refused.`, 'error');
        return;
      }
      toast(res.written > 0 || res.cleared > 0 ? 'Piece values saved.' : 'Nothing to save.', 'success');
      onClose();
    } catch (e) {
      setError(backendMessage(e, 'Could not save this piece’s values.'));
    } finally {
      setSaving(false);
    }
  }

  function renderInput(f: FieldDef) {
    const current = values[f.fieldKey];
    const inherited = current && current.from.scope !== 'stock_piece';
    const placeholder = inherited ? `${withUnit(current)} (inherited)` : '';
    const value = draft[f.fieldKey] ?? '';
    const set = (v: string) => setDraft((prev) => ({ ...prev, [f.fieldKey]: v }));

    if (f.dataType === 'bool') {
      return (
        <Select size="small" displayEmpty value={value} sx={{ width: 220 }}
          onChange={(e) => set(String(e.target.value))}>
          <MenuItem value="">{placeholder || '— not set —'}</MenuItem>
          <MenuItem value="true">Yes</MenuItem>
          <MenuItem value="false">No</MenuItem>
        </Select>
      );
    }
    if (f.dataType === 'enum') {
      return (
        <Select size="small" displayEmpty value={value} sx={{ width: 220 }}
          onChange={(e) => set(String(e.target.value))}>
          <MenuItem value="">{placeholder || '— not set —'}</MenuItem>
          {(f.allowedValues ?? []).map((a) => <MenuItem key={a} value={a}>{a}</MenuItem>)}
        </Select>
      );
    }
    if (f.dataType === 'date') {
      return (
        <TextField size="small" type="date" sx={{ width: 220 }} value={value}
          InputLabelProps={{ shrink: true }} helperText={placeholder || ' '}
          onChange={(e) => set(e.target.value)} />
      );
    }

    const opts = f.dataType === 'number' ? unitOptions(f) : [];
    return (
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <TextField
          size="small"
          type={f.dataType === 'number' ? 'number' : 'text'}
          sx={{ width: opts.length > 1 ? 150 : 220 }}
          value={value}
          placeholder={placeholder}
          onChange={(e) => set(e.target.value)}
        />
        {opts.length > 1 && (
          <Select size="small" sx={{ width: 100 }} value={units[f.fieldKey] ?? f.unit ?? ''}
            onChange={(e) => setUnits((prev) => ({ ...prev, [f.fieldKey]: String(e.target.value) }))}>
            {opts.map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}
          </Select>
        )}
        {opts.length === 1 && (
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', pt: 1.2 }}>{opts[0]}</Typography>
        )}
      </Box>
    );
  }

  return (
    <Dialog open={!!target} onClose={saving ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogCloseButton absolute onClose={onClose} disabled={saving} label="Close without saving" />
      <DialogTitle sx={{ fontWeight: 600 }}>
        Piece values — <Mono>{target?.label ?? ''}</Mono>
        <Typography sx={{ fontSize: 13, fontWeight: 400, color: 'var(--c-text-2)', mt: 0.5 }}>
          What is true of THIS physical piece. Leave a box empty to keep inheriting the item's
          value; type one to record what was actually measured.
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

        {rejected.length > 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography sx={{ fontWeight: 600, fontSize: 13.5, mb: 0.5 }}>
              {rejected.length} value{rejected.length > 1 ? 's were' : ' was'} refused and NOT saved
            </Typography>
            {rejected.map((r) => (
              <Typography key={r.fieldKey} sx={{ fontSize: 12.5 }}>
                <Mono>{r.fieldKey}</Mono> — {r.why}
              </Typography>
            ))}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={22} /></Box>
        ) : (
          <>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
              <FormControlLabel
                control={<Switch size="small" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />}
                label={<Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>Show fields from other categories</Typography>}
              />
            </Box>

            {settable.length === 0 ? (
              <Alert severity="info">
                No field in the registry may be set on an individual piece for this item.
                Turn on "Show fields from other categories" to see the rest.
              </Alert>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ ...th, width: 220 }}>Field</TableCell>
                    <TableCell sx={{ ...th, width: 280 }}>This piece</TableCell>
                    <TableCell sx={th}>Currently resolves to</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {settable.map((f) => {
                    const current = values[f.fieldKey];
                    const own = current?.from.scope === 'stock_piece';
                    return (
                      <TableRow key={f.fieldKey}>
                        <TableCell sx={td}>
                          {f.label}
                          <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>
                            <Mono>{f.fieldKey}</Mono>
                          </Typography>
                        </TableCell>
                        <TableCell sx={td}>{renderInput(f)}</TableCell>
                        <TableCell sx={td}>
                          {current ? (
                            <>
                              {withUnit(current)}{' '}
                              <Chip
                                size="small"
                                variant={own ? 'filled' : 'outlined'}
                                color={own ? 'primary' : 'default'}
                                label={own ? 'set on this piece' : `from ${RUNG_LABEL[current.from.scope] ?? current.from.scope}`}
                                sx={{ height: 20, fontSize: 11 }}
                              />
                            </>
                          ) : <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>not set anywhere</Typography>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}

            {fixed.length > 0 && (
              <Box sx={{ mt: 3 }}>
                <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-text-2)', mb: 0.5 }}>
                  Same for every piece — cannot be changed here
                </Typography>
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mb: 1 }}>
                  These fields are declared to be a property of the item, not of one plate. Two rows
                  disagreeing about them would leave nothing to say which is right, so the server
                  refuses the write; change them on the item instead.
                </Typography>
                <Table size="small">
                  <TableBody>
                    {fixed.map((f) => (
                      <TableRow key={f.fieldKey}>
                        <TableCell sx={{ ...td, width: 220 }}>{f.label}</TableCell>
                        <TableCell sx={{ ...td, width: 280 }}>{withUnit(values[f.fieldKey])}</TableCell>
                        <TableCell sx={{ ...td, color: 'var(--c-text-3)', fontSize: 12 }}>
                          set at <Mono>{f.appliesAt}</Mono> or broader
                          {' · '}currently from {RUNG_LABEL[values[f.fieldKey].from.scope] ?? values[f.fieldKey].from.scope}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions>
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mr: 'auto', pl: 1 }}>
          {changedCount === 0 ? 'No changes' : `${changedCount} change${changedCount > 1 ? 's' : ''} to save`}
        </Typography>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button
          variant="contained"
          onClick={save}
          disabled={saving || loading || changedCount === 0}
          startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {saving ? 'Saving…' : 'Save piece values'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function ItemBatches() {
  const canView = usePermission('fab_erp_inventory_view');
  const canEditFields = usePermission('fab_erp_items_meta_manage');
  const { user } = useAuth();
  const canEdit = canEditFields || isAdminRole(user?.role);
  const { company } = useParams<{ company: string }>();
  const [searchParams] = useSearchParams();
  const itemIdParam = searchParams.get('itemId');
  const focusedItemId = itemIdParam ? Number(itemIdParam) : null;

  const [items, setItems] = useState<StockSummaryItem[]>([]);
  const [plants, setPlants] = useState<FabPlant[]>([]);
  const [locations, setLocations] = useState<FabStockLocation[]>([]);
  const [plantId, setPlantId] = useState<number | ''>('');
  const [locationId, setLocationId] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [expanded, setExpanded] = useState<Record<number, ExpandedState>>({});
  const [menuAnchor, setMenuAnchor] = useState<{ el: HTMLElement; catalogItemId: number } | null>(null);
  const [drillTarget, setDrillTarget] = useState<DrillTarget | null>(null);
  const [editTarget, setEditTarget] = useState<PieceEditTarget | null>(null);

  /**
   * Registry values per piece, and the labels to print them with.
   *
   * /stock/summary still answers with the LEGACY fab_custom_fields rows, so a
   * value written through the field registry would otherwise be invisible on
   * the very row that was just edited. Read here until that route resolves
   * fields itself.
   */
  const [pieceValues, setPieceValues] = useState<Record<number, Record<string, ResolvedValue>>>({});
  const [fieldLabels, setFieldLabels] = useState<Record<string, string>>({});

  const rememberLabels = useCallback((defs: FieldDef[]) => {
    if (!defs.length) return;
    setFieldLabels((prev) => {
      const next = { ...prev };
      for (const f of defs) next[f.fieldKey] = f.label;
      return next;
    });
  }, []);

  useEffect(() => {
    fabQuery<{ data: FabPlant[] }>('fabErpPlant', { orderBy: [{ field: 'name', direction: 'asc' }] })
      .then((res) => setPlants(res.data ?? []))
      .catch((e) => setError((e as Error).message));
  }, []);

  useEffect(() => {
    const params: { orderBy: { field: string; direction: 'asc' | 'desc' }[]; filters?: Record<string, FilterValue> } = { orderBy: [{ field: 'name', direction: 'asc' }] };
    if (plantId !== '') params.filters = { plantId };
    fabQuery<{ data: FabStockLocation[] }>('fabErpStockLocation', params)
      .then((res) => setLocations(res.data ?? []))
      .catch((e) => setError((e as Error).message));
  }, [plantId]);

  const fetchItems = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params: Record<string, unknown> = {};
      if (plantId !== '') params.plantId = plantId;
      if (locationId !== '') params.stockLocationId = locationId;
      const res = await fabGet<StockSummaryResponse>('stock/summary', params);
      let rows = res.data?.items ?? [];
      if (focusedItemId != null) rows = rows.filter((r) => r.catalogItemId === focusedItemId);
      setItems(rows);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [plantId, locationId, focusedItemId]);

  useEffect(() => { fetchItems(); setExpanded({}); setPieceValues({}); }, [fetchItems]);

  /** Pull the registry values for the pieces just revealed, a few at a time. */
  const loadPieceValues = useCallback(async (ids: number[]) => {
    if (!ids.length) return;
    const results = await mapPool(ids, 6, async (id) => {
      try {
        const res = await getFieldValues('stock_piece', id);
        rememberLabels(res.fields ?? []);
        return { id, values: res.values ?? {} };
      } catch {
        // A piece whose values cannot be read still shows its quantity and its
        // legacy fields — losing the whole expansion over it would be worse.
        return { id, values: {} as Record<string, ResolvedValue> };
      }
    });
    setPieceValues((prev) => {
      const next = { ...prev };
      for (const r of results) next[r.id] = r.values;
      return next;
    });
  }, [rememberLabels]);

  function openSegmentMenu(e: MouseEvent<HTMLElement>, catalogItemId: number) {
    setMenuAnchor({ el: e.currentTarget, catalogItemId });
  }

  async function selectSegment(catalogItemId: number, groupByKey: string, optionLabel: string) {
    setMenuAnchor(null);

    const current = expanded[catalogItemId];
    if (current && current.groupByKey === groupByKey) {
      // Toggle off — collapse.
      setExpanded((prev) => { const next = { ...prev }; delete next[catalogItemId]; return next; });
      return;
    }

    setExpanded((prev) => ({ ...prev, [catalogItemId]: { groupByKey, optionLabel, loading: true, segments: [] } }));
    try {
      const params: Record<string, unknown> = { groupBy: groupByKey, catalogItemId };
      if (plantId !== '') params.plantId = plantId;
      if (locationId !== '') params.stockLocationId = locationId;
      const res = await fabGet<StockSummaryResponse>('stock/summary', params);
      // The backend's catalogItemId scoping is best-effort; filter client-side
      // to the item we asked about regardless of what came back.
      const match = (res.data?.items ?? []).find((it) => it.catalogItemId === catalogItemId);
      const segments = match?.segments ?? [];
      setExpanded((prev) => ({ ...prev, [catalogItemId]: { groupByKey, optionLabel, loading: false, segments } }));
      if (groupByKey === 'piece') {
        void loadPieceValues(segments.map((s) => s.pieceId).filter((id): id is number => id != null));
      }
    } catch (e) {
      setExpanded((prev) => ({ ...prev, [catalogItemId]: { groupByKey, optionLabel, loading: false, segments: [], error: (e as Error).message } }));
    }
  }

  function segmentValueLabel(value: string | number | null): string {
    if (value === null || value === undefined || value === '') return '(none)';
    return String(value);
  }

  /**
   * What the piece row prints: its LEGACY custom fields plus every registry
   * value authored on the piece itself. Inherited values are left off on
   * purpose — the row is a list of the ways this plate differs from its item,
   * and repeating the item on every row would bury exactly that.
   */
  function pieceFieldText(seg: StockSummarySegment): string {
    const parts = (seg.customFields ?? []).map((cf) => `${cf.fieldKey}: ${cf.fieldValue ?? '—'}`);
    const own = seg.pieceId != null ? pieceValues[seg.pieceId] : undefined;
    if (own) {
      for (const [key, v] of Object.entries(own)) {
        if (v.from.scope !== 'stock_piece') continue;
        parts.push(`${fieldLabels[key] ?? key}: ${withUnit(v)}`);
      }
    }
    return parts.join('  ·  ');
  }

  if (!canView) return <Alert severity="warning" sx={{ maxWidth: 960, mx: 'auto' }}>You don't have permission to view this page.</Alert>;

  const menuItemId = menuAnchor?.catalogItemId;

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
      <PageHeader title="Item Batches" subtitle="Live stock on hand by item, segmentable by batch, heat, or individual stock piece" />

      {focusedItemId != null && (
        <Box sx={{ mb: 2 }}>
          <Link component={RouterLink} to={`/${company}/fab_erp/item-batches`} sx={{ color: 'var(--c-primary-700)' }}>
            Clear item filter — show all items
          </Link>
          {' · '}
          <Link component={RouterLink} to={`/${company}/fab_erp/item-catalog`} sx={{ color: 'var(--c-primary-700)' }}>
            Back to Item Catalog
          </Link>
        </Box>
      )}

      <FilterBar>
        <Select size="small" displayEmpty sx={{ minWidth: 180 }} value={plantId} onChange={(e) => { setPlantId(e.target.value as number | ''); setLocationId(''); }}>
          <MenuItem value="">All plants</MenuItem>
          {plants.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
        </Select>
        <Select size="small" displayEmpty sx={{ minWidth: 200 }} value={locationId} onChange={(e) => setLocationId(e.target.value as number | '')}>
          <MenuItem value="">All stock locations</MenuItem>
          {locations.map((l) => <MenuItem key={l.id} value={l.id}>{l.name}</MenuItem>)}
        </Select>
      </FilterBar>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <ListSkeleton rows={4} />
      ) : items.length === 0 ? (
        <EmptyState icon={<Inventory2Rounded />} title="No stock found" />
      ) : (
        <Surface e={1} sx={{ overflow: 'hidden' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ ...th, minWidth: 200 }}>Item</TableCell>
                <TableCell sx={{ ...th, width: 120 }}>Code</TableCell>
                <TableCell sx={{ ...th, width: 90 }}>Unit</TableCell>
                <TableCell sx={{ ...th, width: 110 }} align="right">Qty</TableCell>
                <TableCell sx={{ ...th, width: 160 }} align="right">Segment by</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item) => {
                const exp = expanded[item.catalogItemId];
                return (
                  <Fragment key={item.catalogItemId}>
                    <TableRow hover>
                      <TableCell sx={td}>{item.name}</TableCell>
                      <TableCell sx={td}><Mono chip>{item.code}</Mono></TableCell>
                      <TableCell sx={td}>{item.unit ?? '—'}</TableCell>
                      <TableCell sx={td} align="right"><Mono tabular>{item.qty}</Mono></TableCell>
                      <TableCell sx={td} align="right">
                        <Button
                          size="small"
                          variant="outlined"
                          endIcon={<KeyboardArrowDownRounded fontSize="small" />}
                          onClick={(e) => openSegmentMenu(e, item.catalogItemId)}
                        >
                          {exp ? exp.optionLabel : 'Segment by'}
                        </Button>
                      </TableCell>
                    </TableRow>

                    {exp && (
                      <TableRow>
                        <TableCell colSpan={5} sx={{ borderColor: 'var(--c-divider)', p: 0, background: 'var(--c-surface-2)' }}>
                          {exp.loading ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={20} /></Box>
                          ) : exp.error ? (
                            <Alert severity="error" sx={{ m: 1 }}>{exp.error}</Alert>
                          ) : exp.segments.length === 0 ? (
                            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', px: 3, py: 1.5 }}>
                              No {exp.optionLabel.toLowerCase()} segments found.
                            </Typography>
                          ) : (
                            <Table size="small">
                              <TableBody>
                                {exp.segments.map((seg, i) => {
                                  const isPiece = exp.groupByKey === 'piece';
                                  const customFieldsText = isPiece ? pieceFieldText(seg) : '';
                                  return (
                                    <TableRow
                                      key={`${item.catalogItemId}-${exp.groupByKey}-${i}`}
                                      hover
                                      sx={{ cursor: 'pointer' }}
                                      onClick={() => setDrillTarget({
                                        catalogItemId: item.catalogItemId,
                                        groupByKey: exp.groupByKey,
                                        segmentLabel: exp.optionLabel,
                                        value: isPiece ? (seg.pieceId ?? null) : seg.value,
                                        displayValue: seg.value,
                                      })}
                                    >
                                      <TableCell sx={{ ...td, pl: 5, width: 200 }}>
                                        <ExpandMoreRounded fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5, color: 'var(--c-text-2)', transform: 'rotate(-90deg)' }} />
                                        {segmentValueLabel(seg.value)}
                                      </TableCell>
                                      <TableCell sx={td}>
                                        {isPiece ? (seg.heatNo ?? '—') : ''}
                                      </TableCell>
                                      <TableCell sx={{ ...td, color: 'var(--c-text-2)' }}>
                                        {isPiece ? (customFieldsText || '—') : ''}
                                      </TableCell>
                                      <TableCell sx={td} align="right"><Mono tabular>{seg.qty}</Mono></TableCell>
                                      <TableCell sx={{ ...td, whiteSpace: 'nowrap' }} align="right">
                                        {isPiece && seg.pieceId != null && canEdit && (
                                          <Tooltip title="Set values on this piece">
                                            <IconButton
                                              size="small"
                                              aria-label={`Edit values for piece ${segmentValueLabel(seg.value)}`}
                                              // The row itself opens the ledger; this must not.
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setEditTarget({
                                                  pieceId: seg.pieceId!,
                                                  catalogItemId: item.catalogItemId,
                                                  label: segmentValueLabel(seg.value),
                                                });
                                              }}
                                            >
                                              <TuneRounded fontSize="small" sx={{ color: 'var(--c-text-2)' }} />
                                            </IconButton>
                                          </Tooltip>
                                        )}
                                        <ReceiptLongRounded fontSize="small" sx={{ color: 'var(--c-text-2)', verticalAlign: 'middle', ml: 0.5 }} />
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </Surface>
      )}

      <Menu anchorEl={menuAnchor?.el ?? null} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
        {BASE_SEGMENT_OPTIONS.map((opt) => (
          <MenuItem key={opt.key} onClick={() => menuItemId != null && selectSegment(menuItemId, opt.key, opt.label)}>
            {opt.label}
          </MenuItem>
        ))}
      </Menu>

      <ReceiptsDialog target={drillTarget} onClose={() => setDrillTarget(null)} />

      <PieceFieldsDialog
        target={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={(id, values, defs) => {
          rememberLabels(defs);
          setPieceValues((prev) => ({ ...prev, [id]: values }));
        }}
      />
    </Box>
  );
}
