/**
 * OrderParameters.tsx — the values this order's operations actually need.
 *
 * THE STEP THAT DID NOT EXIST. The BOQ sheet asked for Thick / Length / Width on
 * every row, which was wrong in both directions: a plate has no meaningful
 * "height", and an assembly measured by weld length was never asked for one. Now
 * that flows are assigned BEFORE this step, the required set is derived rather
 * than guessed — the union of `item.*` variables across each flow's formulas.
 *
 * It is a GRID, not a form per part. A girder run is hundreds of near-identical
 * rows and the fastest way to fill them in is to see them together, which is why
 * the BOQ was a spreadsheet in the first place.
 *
 * A blank cell is not zero. The formula engine defaults unknown symbols to 0 so
 * `IF()` fallbacks can work, so a part with no thickness does not error — it is
 * estimated as free to cut. Blank cells are flagged, and the production order
 * refuses to be raised while any remain (see the FIELDS_MISSING gate).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, TextField, Tooltip, Typography,
} from '@mui/material';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';

import { fabQuery, fabMutate } from '../api/client';
import { getFieldReadiness, type FieldReadiness } from '../api/fieldReadiness';
import {
  Surface, EmptyState, ListSkeleton, useToast, backendMessage, Mono, StickyActionBar,
} from '../components';
import type { FabFieldDef } from '../types';

interface OrderItemRow {
  id: number;
  name: string | null;
  code: string | null;
  flowId: number | null;
  levelKind: string | null;
}

/** One editable cell: an item's value for one field. */
type CellKey = string; // `${itemId}:${fieldKey}`
const cellKey = (itemId: number, fieldKey: string): CellKey => `${itemId}:${fieldKey}`;

export default function OrderParameters({ orderId, canManage, onStageChanged }: {
  orderId: number;
  canManage: boolean;
  onStageChanged?: () => void;
}) {
  const { toast } = useToast();
  const [readiness, setReadiness] = useState<FieldReadiness | null>(null);
  const [items, setItems] = useState<OrderItemRow[]>([]);
  const [defs, setDefs] = useState<FabFieldDef[]>([]);
  const [values, setValues] = useState<Record<CellKey, string>>({});
  const [dirty, setDirty] = useState<Set<CellKey>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [r, itemRes, defRes, valRes] = await Promise.all([
        getFieldReadiness(orderId),
        fabQuery<{ data: OrderItemRow[] }>('fabErpItem', {
          filters: { orderId }, orderBy: [{ field: 'id', direction: 'asc' }], pagination: { limit: 2000 },
        }),
        fabQuery<{ data: FabFieldDef[] }>('fabErpFieldDef', {
          orderBy: [{ field: 'sortOrder', direction: 'asc' }], pagination: { limit: 500 },
        }),
        fabQuery<{ data: Array<{ levelId: number; fieldKey: string; fieldValue: string | null }> }>(
          'fabErpCustomField',
          { filters: { level: 'order_item' }, pagination: { limit: 5000 } },
        ),
      ]);
      setReadiness(r);
      setItems(itemRes.data ?? []);
      setDefs(defRes.data ?? []);
      const v: Record<CellKey, string> = {};
      for (const row of valRes.data ?? []) {
        v[cellKey(row.levelId, row.fieldKey)] = row.fieldValue ?? '';
      }
      setValues(v);
      setDirty(new Set());
    } catch (e) {
      setError(backendMessage(e, 'Could not load the order’s parameters.'));
    } finally { setLoading(false); }
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);

  const defByKey = useMemo(() => new Map(defs.map((d) => [d.fieldKey, d])), [defs]);

  /**
   * The columns: every field any of this order's flows asks for, in registry
   * order. Derived from what the formulas actually reference — nothing is shown
   * because it is conventionally a dimension.
   */
  const columns = useMemo(() => {
    const needed = new Set<string>();
    for (const m of readiness?.missingValues ?? []) m.missing.forEach((k) => needed.add(k));
    // A part that is already complete contributes no "missing" keys, so the
    // union above alone would hide columns the moment they were filled in.
    // Every value present on a flow-bearing item counts too.
    for (const k of Object.keys(values)) {
      const fk = k.split(':')[1];
      if (fk) needed.add(fk);
    }
    return [...needed]
      .map((k) => defByKey.get(k))
      .filter((d): d is FabFieldDef => !!d && Number(d.formulaUsable) === 1)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.fieldKey.localeCompare(b.fieldKey));
  }, [readiness, values, defByKey]);

  /** Only parts that carry a flow — the rest have no operations and need nothing. */
  const rows = useMemo(() => items.filter((i) => i.flowId != null), [items]);

  const missingByItem = useMemo(() => {
    const m = new Map<number, Set<string>>();
    for (const v of readiness?.missingValues ?? []) m.set(v.itemId, new Set(v.missing));
    return m;
  }, [readiness]);

  function setCell(itemId: number, fieldKey: string, raw: string) {
    const k = cellKey(itemId, fieldKey);
    setValues((prev) => ({ ...prev, [k]: raw }));
    setDirty((prev) => new Set(prev).add(k));
  }

  async function save() {
    if (!dirty.size) return;
    setSaving(true); setError('');
    try {
      // One mutate per changed cell. The generic write path has no bulk upsert,
      // and a changed cell is a deliberate edit — a girder run is filled in a
      // column at a time, not a thousand cells at once.
      for (const k of dirty) {
        const [idStr, fieldKey] = k.split(':');
        const itemId = Number(idStr);
        const raw = (values[k] ?? '').trim();
        const existingId = await findValueId(itemId, fieldKey);
        if (raw === '') {
          if (existingId) await fabMutate('fabErpCustomField', 'delete', { id: existingId });
          continue;
        }
        const payload = {
          level: 'order_item', level_id: itemId, field_key: fieldKey,
          field_type: 'number', field_value: raw, sort_order: 0,
        };
        if (existingId) await fabMutate('fabErpCustomField', 'update', { id: existingId, ...payload });
        else await fabMutate('fabErpCustomField', 'insert', payload);
      }
      toast(`${dirty.size} value(s) saved`, 'success');
      await load();
      onStageChanged?.();
    } catch (e) {
      setError(backendMessage(e, 'Could not save the parameters.'));
    } finally { setSaving(false); }
  }

  /** The row id of an existing value, or null. Re-read so a concurrent edit is not clobbered. */
  async function findValueId(itemId: number, fieldKey: string): Promise<number | null> {
    const res = await fabQuery<{ data: Array<{ id: number }> }>('fabErpCustomField', {
      filters: { level: 'order_item', levelId: itemId, fieldKey }, pagination: { limit: 1 },
    });
    return res.data?.[0]?.id ?? null;
  }

  if (loading) return <ListSkeleton rows={6} />;

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No parts with a flow yet"
        hint="Assign flows first — they decide which values each part needs. Nothing here is guessed."
      />
    );
  }

  if (columns.length === 0) {
    return (
      <EmptyState
        icon={<CheckCircleRounded />}
        title="Nothing to fill in"
        hint="None of this order's operations read a value off the part, so there is nothing to capture here."
      />
    );
  }

  const short = readiness?.itemsShort ?? 0;

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {(readiness?.unknownFields?.length ?? 0) > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.25 }}>
            Some operations name a field that does not exist
          </Typography>
          <Typography sx={{ fontSize: 12.5 }}>
            Filling in parts cannot fix these — the formula is wrong. Fix them in Operations:{' '}
            {readiness!.unknownFields.map((u) => `${u.operationName} (${u.keys.join(', ')})`).join('; ')}
          </Typography>
        </Alert>
      )}

      <Alert severity={short > 0 ? 'warning' : 'success'} sx={{ mb: 2 }}>
        {short > 0
          ? `${short} of ${readiness?.itemsChecked ?? rows.length} part(s) are missing a value their operations need. `
            + 'A blank is not zero — those tasks would be estimated as taking no time.'
          : `All ${readiness?.itemsChecked ?? rows.length} part(s) have what their operations need.`}
      </Alert>

      <Surface e={1} sx={{ p: 0, overflowX: 'auto' }}>
        <Box component="table" sx={{
          width: '100%', borderCollapse: 'collapse', fontSize: 13,
          '& th': {
            textAlign: 'left', px: 1.25, py: 1, fontSize: 10.5, fontWeight: 600,
            letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)',
            borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap',
            background: 'var(--c-surface-2)',
          },
          '& td': { px: 1.25, py: 0.5, borderBottom: '1px solid var(--c-border)', verticalAlign: 'middle' },
        }}>
          <thead>
            <tr>
              <th>Part</th>
              {columns.map((c) => (
                <th key={c.fieldKey} style={{ width: 130 }}>
                  {c.label}{c.unit ? ` (${c.unit})` : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const missing = missingByItem.get(item.id);
              return (
                <tr key={item.id}>
                  <td>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      {missing && missing.size > 0 && (
                        <Tooltip title={`Missing: ${[...missing].join(', ')}`}>
                          <WarningAmberRounded sx={{ fontSize: 15, color: 'var(--c-warning-600)' }} />
                        </Tooltip>
                      )}
                      {item.code ? <Mono chip>{item.code}</Mono> : null}
                      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{item.name}</Typography>
                    </Box>
                  </td>
                  {columns.map((c) => {
                    const k = cellKey(item.id, c.fieldKey);
                    const isMissing = missing?.has(c.fieldKey);
                    return (
                      <td key={c.fieldKey}>
                        <TextField
                          size="small" type="number" variant="standard" fullWidth
                          disabled={!canManage}
                          value={values[k] ?? ''}
                          onChange={(e) => setCell(item.id, c.fieldKey, e.target.value)}
                          slotProps={{ input: { disableUnderline: true } }}
                          sx={{
                            '& input': {
                              fontFamily: 'var(--font-mono)', fontSize: 12.5,
                              background: isMissing ? 'var(--c-warning-50)' : undefined,
                              borderRadius: 'var(--r-sm)', px: 0.5,
                            },
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </Box>
      </Surface>

      {canManage && (
        <StickyActionBar message={dirty.size ? `${dirty.size} unsaved change(s)` : 'No changes'}>
          <Button variant="contained" onClick={() => void save()} disabled={saving || dirty.size === 0}>
            {saving ? <CircularProgress size={16} color="inherit" /> : 'Save values'}
          </Button>
        </StickyActionBar>
      )}
    </Box>
  );
}
