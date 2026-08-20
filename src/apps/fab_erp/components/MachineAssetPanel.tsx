/**
 * MachineAssetPanel — the machine as a thing somebody bought and has to look
 * after, rather than a capacity figure.
 *
 * Three sections, in the order the questions get asked:
 *   ASSET        what it cost and what it is worth now
 *   MAINTENANCE  what is due, and starting/stopping the work
 *   PURCHASES    what has been bought for it
 *
 * It owns its own saving, like CustomFieldsEditor — the dialog's Save button is
 * scoped to the first two tabs. That matters here beyond tidiness: starting
 * maintenance takes the machine out of service, which is not something to
 * perform as a side effect of pressing Save on an unrelated form.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Divider, IconButton, MenuItem,
  TextField, Tooltip, Typography,
} from '@mui/material';
import BuildRounded from '@mui/icons-material/BuildRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import StopRounded from '@mui/icons-material/StopRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import AddRounded from '@mui/icons-material/AddRounded';

import { fabMutate, fabGet, fabPost } from '../api/client';
import OrderSparesDialog from './OrderSparesDialog';
import { backendMessage, useToast } from '../components';
import {
  DEPRECIATION_METHODS, fetchMachineMaintenance, fetchValuation, fetchAssetPurchases,
  saveMaintenancePlan, deleteMaintenancePlan, startMaintenance, stopMaintenance,
  fetchMachineLocation, fetchMachineAreas, moveMachine, fetchSpareSpend,
  type MaintenanceView, type Valuation, type AssetPurchase, type MaintenancePlan,
  type MachineLocation, type MachineArea, type SpareSpend,
} from '../api/assets';

interface Props {
  resourceId: number;
  /** The fab_resources row as the dialog already loaded it. */
  resource: Record<string, unknown>;
  canManage: boolean;
  onChanged?: () => void;
}

const STATUS_TONE: Record<string, { bg: string; fg: string; label: string }> = {
  ok:          { bg: 'var(--c-ok-50, #e8f5e9)',   fg: 'var(--c-ok-800, #1b5e20)',   label: 'On schedule' },
  due:         { bg: 'var(--c-warn-50, #fff8e1)', fg: 'var(--c-warn-800, #8a5a00)', label: 'Due' },
  overdue:     { bg: 'var(--c-err-50, #ffebee)',  fg: 'var(--c-err-800, #b71c1c)',  label: 'Overdue' },
  in_progress: { bg: 'var(--c-info-50, #e3f2fd)', fg: 'var(--c-info-800, #0d47a1)', label: 'In maintenance' },
};

/**
 * The machine's WORK area — where its work-in-process sits — as answered by
 * GET/POST /resources/:id/area.
 *
 * Deliberately NOT the same thing as the "Where it is" section below, which
 * moves the machine's own asset piece (`stock_piece_id`) through
 * /assets/resources/:id/move. One is where the metal stands, the other is where
 * the job sits; they are separate columns and separate decisions, and the panel
 * shows them as two sections for that reason.
 */
interface AreaPreview {
  currentLocationId: number | null;
  areaOwnership: 'dedicated' | 'shared' | 'empty' | 'none';
  sharedWith: { id: number; name: string; code: string | null }[];
  pieceCount: number;
}
interface AreaSkip {
  pieceId: number; pieceCode: string | null; qty: number; status: string;
  reason: string; reasonText: string; heldBy: string | null;
}
interface AreaResult {
  changed: boolean;
  provisioned: boolean;
  message: string;
  movedCount: number;
  skippedCount: number;
  to: { id: number; code: string | null; name: string };
  skipped: AreaSkip[];
}

const str = (v: unknown) => (v == null ? '' : String(v));
const dateOnly = (v: unknown) => (v == null ? '' : String(v).slice(0, 10));
const money = (n: number | null, ccy: string | null) =>
  n == null ? '—' : `${ccy ? `${ccy} ` : ''}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function MachineAssetPanel({ resourceId, resource, canManage, onChanged }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ── asset register ────────────────────────────────────────────────────────
  const [asset, setAsset] = useState({
    purchase_date: dateOnly(resource.purchaseDate),
    commissioned_date: dateOnly(resource.commissionedDate),
    warranty_until: dateOnly(resource.warrantyUntil),
    asset_cost: str(resource.assetCost),
    salvage_value: str(resource.salvageValue),
    useful_life_years: str(resource.usefulLifeYears),
    depreciation_method: str(resource.depreciationMethod),
    depreciation_rate_pct: str(resource.depreciationRatePct),
    useful_life_units: str(resource.usefulLifeUnits),
    units_used: str(resource.unitsUsed),
    units_uom: str(resource.unitsUom),
  });

  const [valuation, setValuation] = useState<Valuation | null>(null);
  const [maint, setMaint] = useState<MaintenanceView | null>(null);
  const [purchases, setPurchases] = useState<AssetPurchase[]>([]);
  const [location, setLocation] = useState<MachineLocation | null>(null);
  const [areas, setAreas] = useState<MachineArea[]>([]);
  const [spend, setSpend] = useState<SpareSpend | null>(null);
  const [loading, setLoading] = useState(true);
  const [sparesOpen, setSparesOpen] = useState(false);

  // ── work area (fab_resources.stock_location_id) ───────────────────────────
  const [areaInfo, setAreaInfo] = useState<AreaPreview | null>(null);
  const [areaResult, setAreaResult] = useState<AreaResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Each falls back to null rather than failing the panel: a machine with no
      // stock piece has no location, which is a state to render, not an error.
      const [v, m, p, loc, ar, sp, wa] = await Promise.all([
        fetchValuation(resourceId).catch(() => null),
        fetchMachineMaintenance(resourceId).catch(() => null),
        fetchAssetPurchases({ resourceId }).then((r) => r.orders).catch(() => []),
        fetchMachineLocation(resourceId).catch(() => null),
        fetchMachineAreas().then((r) => r.locations).catch(() => []),
        fetchSpareSpend(resourceId).catch(() => null),
        fabGet<AreaPreview>(`resources/${resourceId}/area`).catch(() => null),
      ]);
      setValuation(v); setMaint(m); setPurchases(p);
      setLocation(loc); setAreas(ar); setSpend(sp); setAreaInfo(wa);
    } finally { setLoading(false); }
  }, [resourceId]);

  /**
   * Reassign the WORK area, taking the stock with it.
   *
   * Never `fabMutate` — a column write moves the pointer and orphans the stock,
   * which is the whole reason this endpoint exists. `mode: 'dedicated'` is the
   * "this machine shares the pool and should not" case: it provisions the
   * machine's own WIP area and moves what it can attribute in one action.
   */
  async function reassignArea(body: { toLocationId?: number; mode?: 'dedicated' }) {
    setSaving(true); setError(''); setAreaResult(null);
    try {
      const r = await fabPost<AreaResult>(`resources/${resourceId}/area`, body);
      setAreaResult(r);
      toast(r.changed ? r.message : 'Already in that area — nothing moved.', r.changed ? 'success' : 'info');
      await load(); onChanged?.();
    } catch (e) {
      setError(backendMessage(e, 'Could not change this machine\'s work area.'));
    } finally { setSaving(false); }
  }

  async function move(stockLocationId: number) {
    if (!stockLocationId || stockLocationId === location?.locationId) return;
    setSaving(true); setError('');
    try {
      const r = await moveMachine(resourceId, stockLocationId);
      toast(r.offSite ? 'Moved off site — still schedulable' : `Moved to ${r.to.name}`, 'success');
      await load(); onChanged?.();
    } catch (e) {
      setError(backendMessage(e, 'Could not move this machine.'));
    } finally { setSaving(false); }
  }

  useEffect(() => { load(); }, [load]);

  async function saveAsset() {
    setSaving(true); setError('');
    try {
      const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s));
      await fabMutate('fabErpResource', 'update', {
        id: resourceId,
        purchase_date: asset.purchase_date || null,
        commissioned_date: asset.commissioned_date || null,
        warranty_until: asset.warranty_until || null,
        asset_cost: numOrNull(asset.asset_cost),
        salvage_value: numOrNull(asset.salvage_value),
        useful_life_years: numOrNull(asset.useful_life_years),
        depreciation_method: asset.depreciation_method || null,
        depreciation_rate_pct: numOrNull(asset.depreciation_rate_pct),
        useful_life_units: numOrNull(asset.useful_life_units),
        units_used: numOrNull(asset.units_used),
        units_uom: asset.units_uom.trim() || null,
      });
      toast('Asset details saved', 'success');
      await load(); onChanged?.();
    } catch (e) {
      setError(backendMessage(e, 'Could not save the asset details.'));
    } finally { setSaving(false); }
  }

  // ── maintenance ───────────────────────────────────────────────────────────
  const [newPlan, setNewPlan] = useState({ name: '', frequencyDays: '', leadDays: '7', lastDoneAt: '' });
  const openLog = maint?.openByResource?.find((o) => Number(o.resourceId) === resourceId) ?? null;

  async function addPlan() {
    if (!newPlan.name.trim() || !(Number(newPlan.frequencyDays) > 0)) {
      setError('A plan needs a name and a frequency in days.');
      return;
    }
    setSaving(true); setError('');
    try {
      await saveMaintenancePlan({
        resourceId,
        name: newPlan.name.trim(),
        frequencyDays: Number(newPlan.frequencyDays),
        leadDays: Number(newPlan.leadDays) || 0,
        lastDoneAt: newPlan.lastDoneAt || null,
      });
      setNewPlan({ name: '', frequencyDays: '', leadDays: '7', lastDoneAt: '' });
      await load(); onChanged?.();
    } catch (e) {
      setError(backendMessage(e, 'Could not save that plan.'));
    } finally { setSaving(false); }
  }

  async function removePlan(plan: MaintenancePlan) {
    setSaving(true); setError('');
    try {
      await deleteMaintenancePlan(plan.id);
      await load(); onChanged?.();
    } catch (e) {
      setError(backendMessage(e, 'Could not remove that plan.'));
    } finally { setSaving(false); }
  }

  async function begin(planId: number | null) {
    setSaving(true); setError('');
    try {
      await startMaintenance(resourceId, { planId });
      toast('Maintenance started — machine taken out of service', 'success');
      await load(); onChanged?.();
    } catch (e) {
      setError(backendMessage(e, 'Could not start maintenance.'));
    } finally { setSaving(false); }
  }

  async function finish() {
    setSaving(true); setError('');
    try {
      const r = await stopMaintenance(resourceId, {});
      toast(r.nextDueAt ? `Done — next due ${r.nextDueAt}` : 'Maintenance completed', 'success');
      await load(); onChanged?.();
    } catch (e) {
      setError(backendMessage(e, 'Could not complete maintenance.'));
    } finally { setSaving(false); }
  }

  const label = (t: string) => (
    <Typography sx={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em',
      textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 1 }}>{t}</Typography>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 1 }}>
      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

      {/* ── Asset ─────────────────────────────────────────────────────────── */}
      <Box>
        {label('Asset')}
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField size="small" type="date" label="Purchased" sx={{ width: 170 }}
            slotProps={{ inputLabel: { shrink: true } }} value={asset.purchase_date} disabled={!canManage}
            onChange={(e) => setAsset((a) => ({ ...a, purchase_date: e.target.value }))} />
          <TextField size="small" type="date" label="Commissioned" sx={{ width: 170 }}
            slotProps={{ inputLabel: { shrink: true } }} value={asset.commissioned_date} disabled={!canManage}
            helperText="Depreciation starts here if set"
            onChange={(e) => setAsset((a) => ({ ...a, commissioned_date: e.target.value }))} />
          <TextField size="small" type="date" label="Warranty until" sx={{ width: 170 }}
            slotProps={{ inputLabel: { shrink: true } }} value={asset.warranty_until} disabled={!canManage}
            onChange={(e) => setAsset((a) => ({ ...a, warranty_until: e.target.value }))} />
          {/*
            Serial no moved to Basic Info, and Asset tag is gone entirely
            (2026-08-18).

            The asset tag was a second internal identifier for a thing that
            already has `code`, so it was the same fact recorded twice with no
            rule about which one wins. The serial number is different in kind —
            it is stamped on the machine by whoever built it, is the number a
            supplier asks for, and nobody here gets to choose it. That makes it
            identity, which belongs with the name and code rather than filed
            under depreciation.
          */}
        </Box>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 2 }}>
          <TextField size="small" type="number" label="Cost" sx={{ width: 170 }} value={asset.asset_cost}
            disabled={!canManage}
            onChange={(e) => setAsset((a) => ({ ...a, asset_cost: e.target.value }))} />
          <TextField size="small" type="number" label="Salvage value" sx={{ width: 170 }} value={asset.salvage_value}
            disabled={!canManage} helperText="What it is worth at end of life"
            onChange={(e) => setAsset((a) => ({ ...a, salvage_value: e.target.value }))} />
          <TextField select size="small" label="Depreciation" sx={{ width: 210 }}
            value={asset.depreciation_method} disabled={!canManage}
            onChange={(e) => setAsset((a) => ({ ...a, depreciation_method: e.target.value }))}>
            <MenuItem value="">— not set —</MenuItem>
            {DEPRECIATION_METHODS.map((m) => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
          </TextField>
          {asset.depreciation_method === 'straight_line' && (
            <TextField size="small" type="number" label="Useful life (years)" sx={{ width: 170 }}
              value={asset.useful_life_years} disabled={!canManage}
              onChange={(e) => setAsset((a) => ({ ...a, useful_life_years: e.target.value }))} />
          )}
          {asset.depreciation_method === 'wdv' && (
            <TextField size="small" type="number" label="Rate (% per year)" sx={{ width: 170 }}
              value={asset.depreciation_rate_pct} disabled={!canManage}
              onChange={(e) => setAsset((a) => ({ ...a, depreciation_rate_pct: e.target.value }))} />
          )}
          {/* Both accelerated methods derive their rate from the life, so that
              is the only extra input either of them needs. */}
          {(asset.depreciation_method === 'double_declining'
            || asset.depreciation_method === 'sum_of_years') && (
            <TextField size="small" type="number" label="Useful life (years)" sx={{ width: 170 }}
              value={asset.useful_life_years} disabled={!canManage}
              onChange={(e) => setAsset((a) => ({ ...a, useful_life_years: e.target.value }))} />
          )}
          {asset.depreciation_method === 'units_of_production' && (
            <>
              <TextField size="small" type="number" label="Total expected" sx={{ width: 160 }}
                value={asset.useful_life_units} disabled={!canManage}
                helperText="Over its whole life"
                onChange={(e) => setAsset((a) => ({ ...a, useful_life_units: e.target.value }))} />
              <TextField size="small" type="number" label="Used so far" sx={{ width: 150 }}
                value={asset.units_used} disabled={!canManage}
                helperText="Off the hour meter"
                onChange={(e) => setAsset((a) => ({ ...a, units_used: e.target.value }))} />
              <TextField size="small" label="Measured in" sx={{ width: 140 }} placeholder="hours"
                value={asset.units_uom} disabled={!canManage}
                onChange={(e) => setAsset((a) => ({ ...a, units_uom: e.target.value }))} />
            </>
          )}
        </Box>
        {asset.depreciation_method && (
          <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mt: 1 }}>
            {DEPRECIATION_METHODS.find((m) => m.value === asset.depreciation_method)?.hint}
            {asset.depreciation_method === 'units_of_production'
              && '. Readings are entered, not taken from machine events — a book value that moved as the event log filled in could not be reconciled twice.'}
          </Typography>
        )}

        {/* Book value is computed server-side — never typed, never stored. */}
        {valuation && (
          <Box sx={{ mt: 2, p: 1.5, borderRadius: '8px', bgcolor: 'var(--c-surface-2, #fafafa)',
            border: '1px solid var(--c-border)' }}>
            {valuation.applicable ? (
              <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', fontSize: 13 }}>
                <span><b>Book value</b> {money(valuation.bookValue, valuation.currency)}</span>
                <span style={{ color: 'var(--c-text-2)' }}>
                  depreciated {money(valuation.accumulated, valuation.currency)} over {valuation.ageYears}y
                </span>
                {/* Units-of-production has no next-year figure without knowing
                    how hard the machine will be worked. Showing a zero there
                    would be a claim; showing the rate is the useful answer. */}
                {valuation.annualCharge != null ? (
                  <span style={{ color: 'var(--c-text-2)' }}>
                    next year {money(valuation.annualCharge, valuation.currency)}
                  </span>
                ) : valuation.perUnit != null ? (
                  <span style={{ color: 'var(--c-text-2)' }}>
                    {money(valuation.perUnit, valuation.currency)} per unit ·
                    {' '}{valuation.unitsUsed ?? 0} of {valuation.unitsTotal ?? 0} used
                  </span>
                ) : null}
              </Box>
            ) : (
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>
                No book value — {valuation.reason}.
              </Typography>
            )}
          </Box>
        )}

        {canManage && (
          <Button size="small" variant="outlined" sx={{ mt: 2 }} disabled={saving} onClick={saveAsset}>
            Save asset details
          </Button>
        )}
      </Box>

      <Divider />

      {/* ── Maintenance ───────────────────────────────────────────────────── */}
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          {label('Maintenance')}
          <Box sx={{ flex: 1 }} />
          {openLog ? (
            <Button size="small" variant="contained" color="warning" disabled={!canManage || saving}
              startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <StopRounded />}
              onClick={finish}>
              Finish maintenance
            </Button>
          ) : (
            <Tooltip title="Records an unplanned job and takes the machine out of service">
              <span>
                <Button size="small" variant="outlined" disabled={!canManage || saving}
                  startIcon={<BuildRounded />} onClick={() => begin(null)}>
                  Start unplanned
                </Button>
              </span>
            </Tooltip>
          )}
        </Box>

        {openLog && (
          <Alert severity="info" sx={{ mb: 2 }}>
            In maintenance since {String(openLog.startedAt).replace('T', ' ').slice(0, 16)}. The machine is
            marked down, so work cannot be started on it.
          </Alert>
        )}

        {loading ? <CircularProgress size={18} /> : (
          <>
            {(maint?.plans ?? []).length === 0 && (
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mb: 1.5 }}>
                No maintenance planned for this machine yet.
              </Typography>
            )}
            {(maint?.plans ?? []).map((p) => {
              const tone = STATUS_TONE[p.status] ?? STATUS_TONE.ok;
              return (
                <Box key={p.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1,
                  borderBottom: '1px solid var(--c-border)' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 13.5 }}>{p.name}</Typography>
                    <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
                      every {p.frequencyDays}d · warn {p.leadDays}d before
                      {p.lastDoneAt ? ` · last ${dateOnly(p.lastDoneAt)}` : ' · never done'}
                      {p.nextDueAt ? ` · next ${dateOnly(p.nextDueAt)}` : ''}
                    </Typography>
                  </Box>
                  <Chip size="small" label={tone.label}
                    sx={{ height: 22, fontSize: 11, bgcolor: tone.bg, color: tone.fg }} />
                  {canManage && !openLog && (
                    <Tooltip title="Start this job — the machine goes out of service">
                      <IconButton size="small" onClick={() => begin(p.id)} disabled={saving}>
                        <PlayArrowRounded fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  {canManage && (
                    <IconButton size="small" onClick={() => removePlan(p)} disabled={saving}
                      aria-label={`Remove ${p.name}`}>
                      <DeleteOutlineRounded fontSize="small" />
                    </IconButton>
                  )}
                </Box>
              );
            })}

            {canManage && (
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'flex-start', mt: 2 }}>
                <TextField size="small" label="New plan" placeholder="Grease the rails" sx={{ flex: 1, minWidth: 180 }}
                  value={newPlan.name} onChange={(e) => setNewPlan((n) => ({ ...n, name: e.target.value }))} />
                <TextField size="small" type="number" label="Every (days)" sx={{ width: 130 }}
                  value={newPlan.frequencyDays}
                  onChange={(e) => setNewPlan((n) => ({ ...n, frequencyDays: e.target.value }))} />
                <TextField size="small" type="number" label="Warn (days before)" sx={{ width: 150 }}
                  value={newPlan.leadDays}
                  onChange={(e) => setNewPlan((n) => ({ ...n, leadDays: e.target.value }))} />
                <TextField size="small" type="date" label="Last done" sx={{ width: 160 }}
                  slotProps={{ inputLabel: { shrink: true } }} value={newPlan.lastDoneAt}
                  helperText="Blank = due now"
                  onChange={(e) => setNewPlan((n) => ({ ...n, lastDoneAt: e.target.value }))} />
                <Button size="small" startIcon={<AddRounded />} onClick={addPlan} disabled={saving}>Add</Button>
              </Box>
            )}

            {(maint?.history ?? []).length > 0 && (
              <Box sx={{ mt: 2.5 }}>
                {label('Service history')}
                {(maint?.history ?? []).slice(0, 8).map((h) => (
                  <Typography key={h.id} sx={{ fontSize: 12, color: 'var(--c-text-2)', py: 0.25 }}>
                    {String(h.startedAt).replace('T', ' ').slice(0, 16)}
                    {h.planName ? ` · ${h.planName}` : ' · unplanned'}
                    {h.completedAt
                      ? ` · ${h.downtimeMinutes ?? 0} min`
                      : ' · still open'}
                  </Typography>
                ))}
              </Box>
            )}
          </>
        )}
      </Box>

      <Divider />

      {/* ── Where its WORK sits ───────────────────────────────────────────── */}
      <Box>
        {label('Where its work sits')}
        {!areaInfo ? (
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>
            No work area recorded for this machine yet.
          </Typography>
        ) : (
          <>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <TextField
                select size="small" label="Work area" sx={{ minWidth: 240 }}
                value={areaInfo.currentLocationId ?? ''} disabled={!canManage || saving}
                onChange={(e) => reassignArea({ toLocationId: Number(e.target.value) })}
              >
                {areas.map((a) => (
                  <MenuItem key={a.id} value={a.id}>
                    {a.name}{a.plantName ? ` · ${a.plantName}` : ''}
                  </MenuItem>
                ))}
              </TextField>
              {areaInfo.areaOwnership === 'shared' && (
                <Tooltip title={`Shared with ${areaInfo.sharedWith.map((s) => s.name).join(', ')}`}>
                  <Chip size="small" label={`Pooled · ${areaInfo.sharedWith.length} other machine${areaInfo.sharedWith.length === 1 ? '' : 's'}`}
                    sx={{ height: 22, fontSize: 11,
                      bgcolor: 'var(--c-warn-50, #fff8e1)', color: 'var(--c-warn-800, #8a5a00)' }} />
                </Tooltip>
              )}
              {areaInfo.areaOwnership === 'dedicated' && (
                <Chip size="small" label="Its own area" sx={{ height: 22, fontSize: 11,
                  bgcolor: 'var(--c-ok-50, #e8f5e9)', color: 'var(--c-ok-800, #1b5e20)' }} />
              )}
              <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
                {areaInfo.pieceCount} piece{areaInfo.pieceCount === 1 ? '' : 's'} in it
              </Typography>
              {canManage && areaInfo.areaOwnership === 'shared' && (
                <Button size="small" variant="outlined" disabled={saving}
                  onClick={() => reassignArea({ mode: 'dedicated' })}>
                  Give it its own area
                </Button>
              )}
            </Box>
            {/* The thing the old column write got wrong, said plainly. */}
            <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mt: 1 }}>
              This is where this machine&apos;s work in progress sits — not where the machine stands.
              Changing it moves the stock and records both halves in the ledger. In a pooled area only
              work this machine can be shown to hold moves; anything else stays, and is listed below.
            </Typography>
            {areaResult && (
              <Alert severity={areaResult.skippedCount ? 'warning' : 'success'} sx={{ mt: 1.5 }}
                onClose={() => setAreaResult(null)}>
                {areaResult.message}
                {areaResult.skipped.length > 0 && (
                  <Box component="ul" sx={{ m: '6px 0 0', pl: 2.5 }}>
                    {areaResult.skipped.map((s) => (
                      <li key={s.pieceId}>
                        <Typography component="span" sx={{ fontSize: 11.5 }}>
                          {s.pieceCode ?? `piece ${s.pieceId}`} ({s.qty}, {s.status}) — {s.reasonText}
                          {s.heldBy ? `: ${s.heldBy}` : ''}
                        </Typography>
                      </li>
                    ))}
                  </Box>
                )}
              </Alert>
            )}
          </>
        )}
      </Box>

      <Divider />

      {/* ── Where it is ───────────────────────────────────────────────────── */}
      <Box>
        {label('Where the machine stands')}
        {!location?.pieceId ? (
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>
            Not tracked as a physical asset yet — give this machine a plant and it registers automatically.
          </Typography>
        ) : (
          <>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <TextField
                select size="small" label="Stock area" sx={{ minWidth: 240 }}
                value={location.locationId ?? ''} disabled={!canManage || saving}
                onChange={(e) => move(Number(e.target.value))}
              >
                {areas.map((a) => (
                  <MenuItem key={a.id} value={a.id}>
                    {a.name}{a.plantName ? ` · ${a.plantName}` : ''}
                  </MenuItem>
                ))}
              </TextField>
              {location.offSite && (
                <Chip size="small" label="Off site" sx={{ height: 22, fontSize: 11,
                  bgcolor: 'var(--c-warn-50, #fff8e1)', color: 'var(--c-warn-800, #8a5a00)' }} />
              )}
              <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
                Serial {location.serialNo ?? '—'}
              </Typography>
            </Box>
            {/* Said out loud because it is the thing people assume changes. */}
            <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mt: 1 }}>
              Moving a machine records where it is — it stays schedulable wherever it goes, because
              off-site work is still work. To take it out of service, use maintenance or mark it down.
            </Typography>
            {location.history.length > 0 && (
              <Box sx={{ mt: 1.5 }}>
                {location.history.slice(0, 5).filter((h) => Number(h.qty) > 0).map((h) => (
                  <Typography key={h.id} sx={{ fontSize: 11.5, color: 'var(--c-text-2)', py: 0.2 }}>
                    {String(h.txnDate).slice(0, 10)} · {h.notes ?? `moved to ${h.locationName}`}
                  </Typography>
                ))}
              </Box>
            )}
          </>
        )}
      </Box>

      <Divider />

      {/* ── Purchases ─────────────────────────────────────────────────────── */}
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ flex: 1 }}>{label('Bought for this machine')}</Box>
          {canManage && (
            <Button size="small" variant="outlined" startIcon={<AddRounded />} onClick={() => setSparesOpen(true)}>
              Order spares
            </Button>
          )}
        </Box>
        {spend && spend.lineCount > 0 && (
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', fontSize: 12.5, mb: 1.5 }}>
            <span><b>Expensed</b> {money(spend.expensed, spend.currency)}</span>
            <span><b>Capitalised</b> {money(spend.capitalised, spend.currency)}</span>
            {spend.unclassified > 0 && (
              <Tooltip title="Free-text lines with no catalog item, so no cost treatment to inherit. Pick spares from the catalog to classify them.">
                <span style={{ color: 'var(--c-warn-fg, #8a5a00)' }}>
                  Unclassified {money(spend.unclassified, spend.currency)}
                </span>
              </Tooltip>
            )}
          </Box>
        )}
        {purchases.length === 0 ? (
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>
            No purchase orders raised for this machine yet.
          </Typography>
        ) : purchases.map((o) => (
          <Box key={o.id} sx={{ display: 'flex', gap: 2, py: 0.75, fontSize: 12.5,
            borderBottom: '1px solid var(--c-border)' }}>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{o.orderNumber}</span>
            <span style={{ color: 'var(--c-text-2)', flex: 1 }}>{o.supplierName ?? '—'}</span>
            <span style={{ color: 'var(--c-text-3)' }}>{o.lineCount} line(s)</span>
            <span>{money(Number(o.value), o.currency)}</span>
            <Chip size="small" label={o.status} sx={{ height: 20, fontSize: 10.5 }} />
          </Box>
        ))}
      </Box>

      {/* Raised against THIS machine — for_resource_id — so the spend is
          attributable rather than landing in a general maintenance pot. */}
      <OrderSparesDialog
        open={sparesOpen}
        resource={{
          id: resourceId,
          name: String(resource.name ?? ''),
          code: String(resource.code ?? ''),
        }}
        onClose={() => setSparesOpen(false)}
        onDone={() => { void load(); onChanged?.(); }}
      />
    </Box>
  );
}
