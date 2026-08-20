import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, IconButton, MenuItem,
  TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import LockRounded from '@mui/icons-material/LockRounded';
import UndoRounded from '@mui/icons-material/UndoRounded';

import api, { API_HOST } from '@core/utils/axiosConfig';
import { Surface, EmptyState, useToast, backendMessage, RawMaterialSelect } from '../components';
import { fetchRawMaterials, type RawMaterial } from '../api/rawMaterials';
import type { OrderReadiness } from '../api/readiness';
import NestingSuggestor from './NestingSuggestor';

/**
 * Nesting as a board: parts on the left, plates on the right, drag between them.
 *
 * Laying out a plate is a spatial decision — what else will fit alongside this
 * flange — and a spreadsheet is a poor way to make it. The Excel path stays for
 * bulk entry; this is for the rest of the job: seeing what is left, filling the
 * next plate, and moving a part from one to another.
 *
 * A NEST IS ONE PHYSICAL PLATE, so it can only hold parts cut from that one
 * material. The BOM is where a part records what it is cut from, which is what
 * makes this filter possible at all: pick a plate and the left-hand list narrows
 * to the parts that could actually go on it. Everything else is dimmed rather
 * than hidden — knowing a part exists but belongs elsewhere is useful; wondering
 * where it went is not.
 *
 * The server re-checks every drop. This screen makes the wrong move hard; it is
 * not what makes it impossible.
 */

interface BoardPart {
  linkId?: number;
  partId: number;
  code: string | null;
  name: string;
  qty: number | null;
  length: number | null;
  width: number | null;
  thick: number | null;
  materialId: number | null;
  materialCode: string | null;
}
interface BoardNest {
  key: string;
  nestNo: string;
  materialId: number;
  materialCode: string;
  materialName: string;
  length: number | null;
  width: number | null;
  thick: number | null;
  plates: number;
  issued: boolean;
  parts: BoardPart[];
}
interface BoardMaterial { id: number; code: string; name: string; unit?: string | null }
interface Board {
  materials: BoardMaterial[];
  nests: BoardNest[];
  unnested: BoardPart[];
  noMaterial: BoardPart[];
  nextNestNo: string;
  readiness?: OrderReadiness | null;
}

const dim = (p: { length: number | null; width: number | null; thick: number | null }) =>
  [p.thick, p.length, p.width].every((v) => v == null)
    ? null
    : `${p.thick ?? '?'} × ${p.length ?? '?'} × ${p.width ?? '?'}`;

/** A draft plate, held here until something is dropped on it — see the service. */
interface DraftNest { nestNo: string; materialId: number }

export default function NestingBoard({ orderId, canManage = false, onStageChanged }: {
  orderId: number;
  canManage?: boolean;
  onStageChanged?: (next?: OrderReadiness | null) => void;
}) {
  const { toast } = useToast();
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState<BoardPart | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftNest | null>(null);
  const [newMaterialId, setNewMaterialId] = useState<number | ''>('');

  const base = useCallback(
    () => `${API_HOST}/api/${localStorage.getItem('companySlug')}/fab_erp/orders/${orderId}`,
    [orderId],
  );

  const apply = useCallback((data: Board) => {
    setBoard(data);
    onStageChanged?.(data.readiness ?? undefined);
  }, [onStageChanged]);

  const load = useCallback(async () => {
    try {
      const res = await api.get<Board>(`${base()}/nesting/board`);
      setBoard(res.data);
    } catch (e) {
      setError(backendMessage(e, 'Could not load the nesting board.'));
    } finally { setLoading(false); }
  }, [base]);

  useEffect(() => { load(); }, [load]);

  /**
   * The full catalogue, for the "Cut from" pickers on the un-materialled parts.
   *
   * `board.materials` is only what this order already uses, which is exactly
   * the wrong list for a part that has none — it would offer nothing on a fresh
   * order and quietly hide any material nobody had picked yet.
   */
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [pendingMaterial, setPendingMaterial] = useState<Record<number, number | ''>>({});
  const [savingMaterial, setSavingMaterial] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetchRawMaterials()
      .then((m) => { if (alive) setMaterials(m); })
      .catch(() => { if (alive) setMaterials([]); });
    return () => { alive = false; };
  }, []);

  async function assignMaterial(partId: number, value: string) {
    const id = value === '' ? null : Number(value);
    setPendingMaterial((p) => ({ ...p, [partId]: id ?? '' }));
    setSavingMaterial(partId);
    setError('');
    try {
      // NOT under base() — that is `…/orders/:orderId`, and the material route
      // hangs off the app root because it identifies the part by id alone.
      await api.post(
        `${API_HOST}/api/${localStorage.getItem('companySlug')}/fab_erp/items/${partId}/material`,
        { materialId: id },
      );
      // Reload rather than patch: the part leaves "no material" and joins the
      // nestable list, and the board decides which list it belongs in.
      await load();
      onStageChanged?.();
    } catch (e) {
      setPendingMaterial((p) => ({ ...p, [partId]: '' }));
      setError(backendMessage(e, 'Could not set the material.'));
    } finally { setSavingMaterial(null); }
  }

  async function move(part: BoardPart, nestNo: string | null, materialId?: number) {
    if (!part.linkId) return;
    setBusy(true); setError('');
    try {
      const res = await api.post<Board>(`${base()}/nesting/assign`, {
        linkIds: [part.linkId], nestNo,
      });
      apply(res.data);
      // The draft becomes real the moment it holds something.
      if (nestNo && draft?.nestNo === nestNo && draft.materialId === materialId) setDraft(null);
    } catch (e) {
      setError(backendMessage(e, 'Could not move that part.'));
    } finally { setBusy(false); setDragging(null); setOverKey(null); }
  }

  async function breakUp(nest: BoardNest) {
    setBusy(true); setError('');
    try {
      const res = await api.delete<Board>(`${base()}/nests/${encodeURIComponent(nest.nestNo)}`);
      apply(res.data);
      toast(`${nest.nestNo} broken up — its parts kept their material`);
    } catch (e) {
      setError(backendMessage(e, 'Could not break that nest up.'));
    } finally { setBusy(false); }
  }

  async function setPlate(nest: BoardNest, patch: Record<string, number | null>) {
    try {
      const res = await api.patch<Board>(`${base()}/nests/${encodeURIComponent(nest.nestNo)}`, { plate: patch });
      apply(res.data);
    } catch (e) {
      setError(backendMessage(e, 'Could not set the plate size.'));
    }
  }

  /** Cards shown on the left: everything not yet on a plate. */
  const pool = useMemo(() => board?.unnested ?? [], [board]);

  /**
   * Which material the left-hand list is currently "about". Dragging narrows it
   * to what you are holding; otherwise a hovered draft plate decides.
   */
  const focusMaterial = dragging?.materialId ?? draft?.materialId ?? null;

  if (loading) {
    return <Surface e={1} sx={{ p: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Surface>;
  }
  if (!board) return <Alert severity="error">{error || 'No board.'}</Alert>;

  const nests: (BoardNest | DraftNest)[] = draft
    ? [...board.nests, draft as DraftNest]
    : board.nests;

  const canDrop = (nestMaterialId: number, issued: boolean) =>
    !!dragging && dragging.materialId === nestMaterialId && !issued && canManage;

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '340px 1fr' }, gap: 2, alignItems: 'start' }}>

        {/* ── Left: parts waiting for a plate ────────────────────────────── */}
        <Surface e={1} sx={{ p: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)' }}>
              Parts to nest
            </Typography>
            <Typography sx={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--c-text-2)' }}>{pool.length}</Typography>
          </Box>

          {pool.length === 0 && board.noMaterial.length === 0 ? (
            <EmptyState title="Everything is nested" hint="Every part with a material is on a plate." />
          ) : (
            <Box
              onDragOver={(e) => { if (dragging) { e.preventDefault(); setOverKey('__pool__'); } }}
              onDragLeave={() => setOverKey((k) => (k === '__pool__' ? null : k))}
              onDrop={(e) => { e.preventDefault(); if (dragging) move(dragging, null); }}
              sx={{
                minHeight: 80, borderRadius: 'var(--r-sm)', p: 0.5,
                outline: overKey === '__pool__' ? '2px dashed var(--c-primary-500)' : '2px dashed transparent',
                transition: 'outline-color var(--t-fast) var(--ease)',
              }}
            >
              {pool.map((p) => {
                const faded = focusMaterial != null && p.materialId !== focusMaterial;
                return (
                  <PartCard
                    key={p.linkId}
                    part={p}
                    draggable={canManage}
                    faded={faded}
                    onDragStart={() => setDragging(p)}
                    onDragEnd={() => { setDragging(null); setOverKey(null); }}
                  />
                );
              })}
            </Box>
          )}

          {board.noMaterial.length > 0 && (
            <Box sx={{ mt: 1.5 }}>
              <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-warning-600)', mb: 0.75 }}>
                No material yet · {board.noMaterial.length}
              </Typography>
              {/*
                MATERIAL IS SET HERE, not on the Structure step (2026-08-18).

                It briefly lived on the part row in the item tree, which put
                "what is this cut from" one step away from "which plate does it
                come off" — two halves of the same decision, asked on two
                different screens. Both are nesting's question, so both are
                asked here: pick the material and the part moves straight into
                the list above, ready to drop onto a plate.

                The BOQ sheet's Raw Material column still works and is still the
                fast path for hundreds of parts at once.
              */}
              <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-2)', mb: 1 }}>
                Pick what each is cut from and it joins the list above, ready to nest.
                For a whole order at once, the Raw Material column in the BOQ sheet is quicker.
              </Typography>
              {board.noMaterial.map((p) => (
                <Box key={p.partId} sx={{ mb: 1 }}>
                  <PartCard part={p} draggable={false} faded />
                  {canManage && (
                    <Box sx={{ pl: 1, pt: 0.5 }}>
                      <RawMaterialSelect
                        materials={materials}
                        thickness={p.thick}
                        value={pendingMaterial[p.partId] ?? ''}
                        onChange={(v) => assignMaterial(p.partId, v)}
                        valueOf={(m) => m.id}
                        label="Cut from"
                        disabled={savingMaterial === p.partId}
                        sx={{ minWidth: 260 }}
                      />
                      {savingMaterial === p.partId && <CircularProgress size={12} sx={{ ml: 1 }} />}
                    </Box>
                  )}
                </Box>
              ))}
            </Box>
          )}
        </Surface>

        {/* ── Right: the plates ──────────────────────────────────────────── */}
        <Box>
          {canManage && (
            <Surface e={1} sx={{ p: 1.5, mb: 2, display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
              <TextField
                select size="small" label="New plate of" value={newMaterialId} sx={{ minWidth: 240 }}
                onChange={(e) => setNewMaterialId(e.target.value === '' ? '' : Number(e.target.value))}
              >
                {board.materials.length === 0 && <MenuItem value="" disabled>No materials on this order yet</MenuItem>}
                {board.materials.map((m) => (
                  <MenuItem key={m.id} value={m.id}>{m.code} — {m.name}</MenuItem>
                ))}
              </TextField>
              <Button
                variant="outlined" size="small" startIcon={<AddIcon />}
                disabled={newMaterialId === '' || !!draft}
                onClick={() => setDraft({ nestNo: board.nextNestNo, materialId: Number(newMaterialId) })}
              >
                Add plate
              </Button>
              {/*
                The third way in. Filling plates by hand is still the way to
                arrange a job you know; this is for the four-hundred-part order
                where somewhere to start is worth more than a blank board. It
                proposes only — accepting drops the result here, where every
                plate can still be dragged apart.
              */}
              <NestingSuggestor
                orderId={orderId}
                disabled={!!draft}
                // Reload the board AND tell the parent, the same pair every
                // other mutation here does. Reloading only the board left the
                // panel underneath still calling every part "un-nested" while
                // the plates above it plainly held them.
                onAccepted={async () => { await load(); onStageChanged?.(); }}
              />
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                A plate holds one material. Drag parts onto it — the list on the left dims
                anything that could not go there.
              </Typography>
            </Surface>
          )}

          {nests.length === 0 ? (
            <EmptyState
              title="No plates yet"
              hint="Add a plate, then drag the parts that come off it. Or upload a nesting sheet."
            />
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 1.5 }}>
              {nests.map((n) => {
                const real = 'parts' in n ? (n as BoardNest) : null;
                const materialId = real ? real.materialId : (n as DraftNest).materialId;
                const material = board.materials.find((m) => m.id === materialId);
                const droppable = canDrop(materialId, real?.issued ?? false);
                const key = real ? real.key : `draft|${n.nestNo}`;
                return (
                  <Surface
                    key={key}
                    e={1}
                    onDragOver={(e: React.DragEvent) => { if (droppable) { e.preventDefault(); setOverKey(key); } }}
                    onDragLeave={() => setOverKey((k) => (k === key ? null : k))}
                    onDrop={(e: React.DragEvent) => {
                      e.preventDefault();
                      if (droppable && dragging) move(dragging, n.nestNo, materialId);
                    }}
                    sx={{
                      p: 1.5,
                      outline: overKey === key
                        ? '2px dashed var(--c-primary-500)'
                        : dragging && !droppable ? '2px dashed transparent' : '2px dashed transparent',
                      opacity: dragging && !droppable ? 0.45 : 1,
                      transition: 'opacity var(--t-fast) var(--ease), outline-color var(--t-fast) var(--ease)',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Typography sx={{ fontSize: 13.5, fontWeight: 600, fontFamily: 'monospace', color: 'var(--c-text)' }}>
                        {n.nestNo}
                      </Typography>
                      {real?.issued && (
                        <Tooltip title="This plate has gone to the floor — it cannot be re-arranged">
                          <Chip size="small" icon={<LockRounded sx={{ fontSize: 13 }} />} label="Issued"
                            sx={{ height: 20, fontSize: 10.5, bgcolor: 'var(--c-neutral-50)', color: 'var(--c-neutral-800)' }} />
                        </Tooltip>
                      )}
                      {!real && (
                        <Chip size="small" label="New — drop a part to keep it"
                          sx={{ height: 20, fontSize: 10.5, bgcolor: 'var(--c-info-50)', color: 'var(--c-info-800)' }} />
                      )}
                      <Box sx={{ flex: 1 }} />
                      {canManage && real && !real.issued && (
                        <Tooltip title="Break up — parts go back to the list, keeping their material">
                          <IconButton size="small" aria-label={`Break up ${n.nestNo}`} onClick={() => breakUp(real)}>
                            <UndoRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {!real && (
                        <Tooltip title="Discard this empty plate">
                          <IconButton size="small" aria-label="Discard plate" onClick={() => setDraft(null)}>
                            <DeleteOutlineRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>

                    <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mb: 1 }}>
                      {material?.code ?? real?.materialCode}
                      {real && dim(real) ? ` · ${dim(real)}` : ''}
                      {real && real.plates > 1 ? ` · ×${real.plates}` : ''}
                    </Typography>

                    {real && !real.issued && canManage && (
                      <Box sx={{ display: 'flex', gap: 0.75, mb: 1 }}>
                        {(['thick', 'length', 'width'] as const).map((f) => (
                          <TextField
                            key={f} size="small" type="number" label={f} defaultValue={real[f] ?? ''}
                            sx={{ width: 84 }}
                            slotProps={{ inputLabel: { shrink: true } }}
                            onBlur={(e) => {
                              const v = e.target.value === '' ? null : Number(e.target.value);
                              if (v !== real[f]) setPlate(real, { [f]: v });
                            }}
                          />
                        ))}
                      </Box>
                    )}

                    {!real || real.parts.length === 0 ? (
                      <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', py: 1.5, textAlign: 'center' }}>
                        Drop parts here
                      </Typography>
                    ) : (
                      real.parts.map((p) => (
                        <PartCard
                          key={p.linkId}
                          part={p}
                          draggable={canManage && !real.issued}
                          onDragStart={() => setDragging(p)}
                          onDragEnd={() => { setDragging(null); setOverKey(null); }}
                          onRemove={canManage && !real.issued ? () => move(p, null) : undefined}
                        />
                      ))
                    )}
                  </Surface>
                );
              })}
            </Box>
          )}
        </Box>
      </Box>

      {busy && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5 }}>
          <CircularProgress size={14} />
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>Saving…</Typography>
        </Box>
      )}
    </Box>
  );
}

function PartCard({ part, draggable, faded, onDragStart, onDragEnd, onRemove }: {
  part: BoardPart;
  draggable: boolean;
  faded?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onRemove?: () => void;
}) {
  const d = dim(part);
  return (
    <Box
      draggable={draggable}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart?.(); }}
      onDragEnd={onDragEnd}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1,
        px: 1, py: 0.6, mb: 0.5,
        border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)',
        bgcolor: 'var(--c-surface)',
        cursor: draggable ? 'grab' : 'default',
        opacity: faded ? 0.35 : 1,
        '&:active': { cursor: draggable ? 'grabbing' : 'default' },
        '&:hover': draggable ? { borderColor: 'var(--c-primary-200)' } : undefined,
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {part.code ?? '—'}
        </Typography>
        <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {part.name}{d ? ` · ${d}` : ''}
        </Typography>
      </Box>
      {onRemove && (
        <Tooltip title="Take off this plate">
          <IconButton size="small" aria-label={`Remove ${part.code ?? 'part'}`} onClick={onRemove}>
            <DeleteOutlineRounded sx={{ fontSize: 15 }} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}
