import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Collapse, Dialog, DialogActions, DialogContent, IconButton, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import BlockRounded from '@mui/icons-material/BlockRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import PrecisionManufacturingRounded from '@mui/icons-material/PrecisionManufacturingRounded';
import RestartAltRounded from '@mui/icons-material/RestartAltRounded';
import { cfApi, CfApiError } from '../api/client';
import { useLoad } from '../hooks/useLoad';
import { ConfirmDialog } from './ConfirmDialog';
import { DialogHeader } from './FormDialog';
import { EmptyState, ErrorNotice, Mono, SkeletonRows, StatusBadge, Surface } from './ui';
import { useToast } from './toastContext';

/* ── The shapes GET/POST /machine-types speak ────────────────────────────── */

/** The deepest level of a machine family (a Variant with scope Machine) — machines sit on it. */
export interface MachineTypeNode { id: number; code: string; name: string; status: 'active' | 'inactive'; machineCount: number }
export interface MachineSubfamilyNode { id: number; code: string; name: string; status: 'active' | 'inactive'; types: MachineTypeNode[] }
export interface MachineFamilyNode { id: number; code: string; name: string; status: 'active' | 'inactive'; subfamilies: MachineSubfamilyNode[] }
export interface MachineTypeTree { families: MachineFamilyNode[] }
/** What POST /machine-types hands back — `created` says whether it had to make the levels above. */
export interface CreatedMachineType {
  id: number; code: string; name: string; familyId: number; subfamilyId: number;
  created: { family: boolean; subfamily: boolean };
}

/** Which of the three levels a row is — they are written through the same two routes. */
type NodeLevel = 'family' | 'subfamily' | 'type';
const LEVEL_WORD: Record<NodeLevel, string> = { family: 'family', subfamily: 'subfamily', type: 'type' };

/**
 * The backend's refusals, in words. `invalid()` already sends a `message` and a
 * `problems` list, which ErrorNotice shows — these only replace the message
 * where this screen can say something more useful than a generic rule name.
 * Anything else keeps the backend's own wording, and IN_USE especially: it
 * names what is in the way and how many, which nothing here could improve on.
 */
const REFUSAL: Record<string, string> = {
  NOT_A_MACHINE_FAMILY: 'That family holds items, not machines. Pick a machine family, or add a new one here.',
  WRONG_PARENT: 'That subfamily is not under the family you chose. Pick one from the list, or add a new one.',
  // The backend may or may not split these two; both mean the same thing here.
  NOT_A_MACHINE_TYPE: 'That is not something the Machines screen manages — only machine families, their subfamilies and their types.',
  NOT_A_MACHINE_NODE: 'That is not something the Machines screen manages — only machine families, their subfamilies and their types.',
};

/** What a delete takes with it, and what will refuse it, per level. */
const DELETE_BODY: Record<NodeLevel, string> = {
  family: 'Its subfamilies, its types and every rule set on them go with it. It is refused while anything still lives under it — retire it instead to keep the history and take the whole branch out of the pickers.',
  subfamily: 'Its types and every rule set on them go with it. It is refused while anything still lives under it — retire it instead to keep the history and take it out of the pickers.',
  type: 'Its specification rules and defaults go with it. It is refused while any machine still sits on it — retire it instead to keep the history and take it out of the pickers.',
};

function asRefusal(e: unknown): CfApiError {
  const err = e instanceof CfApiError ? e : new CfApiError(0, e instanceof Error ? e.message : String(e));
  const said = err.code ? REFUSAL[err.code] : undefined;
  return said ? new CfApiError(err.status, said, err.code, err.problems) : err;
}

/* ── Adding one ───────────────────────────────────────────────────────────── */

const NEW = '__new__';

interface AddForm {
  familyId: string; familyCode: string; familyName: string;
  subfamilyId: string; subfamilyCode: string; subfamilyName: string;
  code: string; name: string; description: string;
}
const BLANK: AddForm = { familyId: '', familyCode: '', familyName: '', subfamilyId: '', subfamilyCode: '', subfamilyName: '', code: '', name: '', description: '' };

/**
 * The add block: a machine type always needs a family and a subfamily above
 * it, so both are chosen here — an existing one from the list, or a new one
 * typed inline. One Create writes all three; the backend says which it made.
 */
function AddType({ families, busy, onCreate }: {
  families: MachineFamilyNode[];
  busy: boolean;
  /** Resolves false when the backend refused — the form keeps everything that was typed. */
  onCreate: (body: unknown) => Promise<boolean>;
}) {
  const [form, setForm] = useState<AddForm>(BLANK);
  const set = (k: keyof AddForm) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  // A new family has nothing under it yet, so its subfamily is new too.
  const pickFamily = (v: string) => setForm((f) => ({ ...f, familyId: v, subfamilyId: v === NEW ? NEW : '', subfamilyCode: '', subfamilyName: '' }));
  const family = families.find((f) => String(f.id) === form.familyId) ?? null;
  const newFamily = form.familyId === NEW;
  const newSubfamily = form.subfamilyId === NEW;

  const familyOk = newFamily ? !!form.familyCode.trim() && !!form.familyName.trim() : !!form.familyId;
  const subfamilyOk = newSubfamily ? !!form.subfamilyCode.trim() && !!form.subfamilyName.trim() : !!form.subfamilyId;
  const ready = familyOk && subfamilyOk && !!form.code.trim() && !!form.name.trim();

  const create = async () => {
    const ok = await onCreate({
      family: newFamily ? { code: form.familyCode.trim(), name: form.familyName.trim() } : { id: Number(form.familyId) },
      subfamily: newSubfamily ? { code: form.subfamilyCode.trim(), name: form.subfamilyName.trim() } : { id: Number(form.subfamilyId) },
      code: form.code.trim(),
      name: form.name.trim(),
      description: form.description.trim() || null,
    });
    if (ok) setForm(BLANK);
  };

  return (
    <Surface e={0} sx={{ p: 2, background: 'var(--c-surface-2)', borderStyle: 'dashed', mb: 2 }}>
      <Box sx={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)', mb: 0.25 }}>Add a machine type</Box>
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 1.75 }}>
        Machines › a family › a subfamily › the type itself, e.g. Cutting › CNC plasma. Choose the levels above it or type new ones.
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
        <TextField select size="small" label="Family" value={form.familyId} onChange={(e) => pickFamily(e.target.value)} disabled={busy}
          helperText={newFamily ? 'A new machine family' : 'Machines of a kind — Cutting, Welding'}>
          {families.map((f) => <MenuItem key={f.id} value={String(f.id)}>{f.name}{f.status === 'inactive' ? ' (inactive)' : ''}</MenuItem>)}
          <MenuItem value={NEW}>+ New family…</MenuItem>
        </TextField>
        <TextField select size="small" label="Subfamily" value={form.subfamilyId} onChange={set('subfamilyId')} disabled={busy || !form.familyId || newFamily}
          helperText={newFamily ? 'A new family starts with a new subfamily' : !form.familyId ? 'Choose a family first' : 'The group the type sits in'}>
          {(family?.subfamilies ?? []).map((s) => <MenuItem key={s.id} value={String(s.id)}>{s.name}{s.status === 'inactive' ? ' (inactive)' : ''}</MenuItem>)}
          <MenuItem value={NEW}>+ New subfamily…</MenuItem>
        </TextField>

        {newFamily && (
          <>
            <TextField size="small" label="New family code" value={form.familyCode} onChange={set('familyCode')} disabled={busy} required
              inputProps={{ style: { fontFamily: 'var(--font-mono)' } }} helperText="Used in generated codes" />
            <TextField size="small" label="New family name" value={form.familyName} onChange={set('familyName')} disabled={busy} required />
          </>
        )}
        {newSubfamily && (
          <>
            <TextField size="small" label="New subfamily code" value={form.subfamilyCode} onChange={set('subfamilyCode')} disabled={busy} required
              inputProps={{ style: { fontFamily: 'var(--font-mono)' } }} />
            <TextField size="small" label="New subfamily name" value={form.subfamilyName} onChange={set('subfamilyName')} disabled={busy} required />
          </>
        )}

        <TextField size="small" label="Type code" value={form.code} onChange={set('code')} disabled={busy} required autoFocus
          inputProps={{ style: { fontFamily: 'var(--font-mono)' } }} helperText="A machine's code is numbered from it — PLS-01" />
        <TextField size="small" label="Type name" value={form.name} onChange={set('name')} disabled={busy} required />
        <TextField size="small" label="Description" value={form.description} onChange={set('description')} disabled={busy} sx={{ gridColumn: '1 / -1' }} />
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
        <Button variant="contained" startIcon={<AddRounded />} disabled={busy || !ready} onClick={() => void create()}>
          {busy ? 'Creating…' : 'Create machine type'}
        </Button>
      </Box>
    </Surface>
  );
}

/* ── The dialog ───────────────────────────────────────────────────────────── */

/**
 * Manages machine types from wherever machines are (the Machines screen and
 * the machine form), instead of sending people to Setup › Classification —
 * which is a different screen behind a different permission. A machine type is
 * still the same thing it always was: the deepest level of a Family with scope
 * Machine; this dialog just writes that part of the tree through /machine-types.
 * PUT and DELETE take any machine-scope node, so all three levels are edited
 * here and Setup › Classification is no longer needed for machines at all.
 *
 * `closeOnCreate` is for the machine form: there the point is to get one type
 * and carry on, so the dialog hands the new type back and steps out of the way.
 */
export function MachineTypeDialog({ open, canManage, closeOnCreate = false, onClose, onCreated, onChanged }: {
  open: boolean;
  /** The machines screen's own permission — the same one that gates New machine. */
  canManage: boolean;
  closeOnCreate?: boolean;
  onClose: () => void;
  /** The new type, right after it is created — the machine form selects it. */
  onCreated?: (type: CreatedMachineType) => void;
  /** After any write, so the caller can refresh its tree, list and filters. */
  onChanged?: () => void;
}) {
  const toast = useToast();
  // Nothing is fetched while it is shut; every opening starts from the truth.
  const list = useLoad(() => (open ? cfApi.get<MachineTypeTree>('/machine-types') : Promise.resolve(null)), [open]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<{ id: number; code: string; name: string; level: NodeLevel } | null>(null);
  const [deleting, setDeleting] = useState<{ id: number; code: string; name: string; level: NodeLevel } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  useEffect(() => {
    if (!open) return;
    setAdding(closeOnCreate); setEditing(null); setDeleting(null); setBusy(false); setError(null);
  }, [open, closeOnCreate]);

  const families = useMemo(() => list.data?.families ?? [], [list.data]);
  const typeCount = useMemo(() => families.reduce((n, f) => n + f.subfamilies.reduce((m, s) => m + s.types.length, 0), 0), [families]);
  // With nothing to pick from, the form is the screen — no point hiding it
  // behind a button. Only once something has actually loaded, or it flashes
  // open on the way in.
  const showAdd = canManage && (adding || (!!list.data && typeCount === 0));

  /** Every write runs through here: one busy flag, one refusal line, one refresh. */
  const run = async <T,>(what: () => Promise<T>, done?: string): Promise<T | null> => {
    setBusy(true); setError(null);
    try {
      const out = await what();
      list.reload();
      onChanged?.();
      if (done) toast.success(done);
      return out;
    } catch (e) {
      setError(asRefusal(e));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const create = async (body: unknown) => {
    const made = await run(() => cfApi.post<CreatedMachineType>('/machine-types', body));
    if (!made) return false;
    const also = [made.created.family && 'its family', made.created.subfamily && 'its subfamily'].filter(Boolean).join(' and ');
    toast.success(`${made.code} created${also ? `, with ${also}` : ''}.`);
    setAdding(false);
    onCreated?.(made);
    if (closeOnCreate) onClose();
    return true;
  };

  const saveEdit = async () => {
    if (!editing) return;
    const ok = await run(() => cfApi.put<{ id: number }>(`/machine-types/${editing.id}`, { code: editing.code.trim(), name: editing.name.trim() }),
      `Machine ${LEVEL_WORD[editing.level]} saved.`);
    if (ok) setEditing(null);
  };

  /* ── Rows ───────────────────────────────────────────────────────────────
   * A family, a subfamily and a type are three sizes of the same thing, and
   * since PUT and DELETE take any of them, they get the same three controls.
   * The label differs per level, so each row passes its own and these two
   * helpers supply the rest — plain functions, not components, so a row never
   * remounts mid-rename.
   */
  type Row = { id: number; code: string; name: string; status: 'active' | 'inactive' };

  const editor = () => editing && (
    <>
      <TextField size="small" label="Code" value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value })}
        disabled={busy} sx={{ width: 150 }} inputProps={{ style: { fontFamily: 'var(--font-mono)' } }} />
      <TextField size="small" label="Name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })}
        disabled={busy} sx={{ flex: 1, minWidth: 120 }} />
      <Tooltip title="Save"><span><IconButton size="small" aria-label={`Save ${editing.code}`} color="primary"
        disabled={busy || !editing.code.trim() || !editing.name.trim()} onClick={() => void saveEdit()}><CheckRounded fontSize="small" /></IconButton></span></Tooltip>
      <Tooltip title="Cancel"><span><IconButton size="small" aria-label="Cancel rename" disabled={busy} onClick={() => setEditing(null)}><CloseRounded fontSize="small" /></IconButton></span></Tooltip>
    </>
  );

  const actions = (n: Row, level: NodeLevel) => canManage && (
    <Box className="row-actions" sx={{ display: 'flex', gap: 0.25, opacity: 0, pointerEvents: 'none', transition: 'opacity 140ms var(--ease)' }}>
      <Tooltip title="Rename"><span><IconButton size="small" aria-label={`Rename ${n.code}`} disabled={busy}
        onClick={() => setEditing({ id: n.id, code: n.code, name: n.name, level })}><EditRounded fontSize="small" /></IconButton></span></Tooltip>
      <Tooltip title={n.status === 'active'
        ? level === 'type' ? 'Retire — kept, but out of the pickers' : 'Retire — it and everything under it leave the pickers'
        : 'Put it back in the pickers'}>
        <span><IconButton size="small" aria-label={n.status === 'active' ? `Retire ${n.code}` : `Restore ${n.code}`} disabled={busy}
          onClick={() => void run(() => cfApi.put(`/machine-types/${n.id}`, { status: n.status === 'active' ? 'inactive' : 'active' }),
            n.status === 'active' ? `${n.code} retired.` : `${n.code} is active again.`)}>
          {n.status === 'active' ? <BlockRounded fontSize="small" /> : <RestartAltRounded fontSize="small" />}
        </IconButton></span>
      </Tooltip>
      <Tooltip title={level === 'type' ? 'Delete — refused while machines still sit on it' : 'Delete — refused while anything still lives under it'}>
        <span><IconButton size="small" aria-label={`Delete ${n.code}`} disabled={busy}
          onClick={() => setDeleting({ id: n.id, code: n.code, name: n.name, level })}><DeleteOutlineRounded fontSize="small" /></IconButton></span></Tooltip>
    </Box>
  );

  const rowSx = {
    display: 'flex', alignItems: 'center', gap: 1.25, px: 1, py: 0.75, borderRadius: 'var(--r-sm)', minWidth: 0,
    '&:hover': { background: 'var(--c-surface-2)' },
    '&:hover .row-actions, &:focus-within .row-actions': { opacity: 1, pointerEvents: 'auto' },
    '@media (hover: none)': { '& .row-actions': { opacity: 1, pointerEvents: 'auto' } },
  };
  const familyRowSx = { ...rowSx, py: 0.5, borderRadius: 'var(--r-sm) var(--r-sm) 0 0', borderBottom: '1px solid var(--c-divider)' };
  const subfamilyRowSx = { ...rowSx, py: 0.25, mb: 0.25 };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogHeader busy={busy} onClose={onClose} title="Machine types"
        subtitle="What a machine is a kind of. Its type decides what it must carry — a plasma cutter its cutting speed — and which operation rules reach it. Any row here can be renamed, retired or deleted: the family, the subfamily or the type." />
      <DialogContent>
        <ErrorNotice error={error ?? list.error} onRetry={list.error ? list.reload : undefined} />

        {canManage && !showAdd && (
          <Box sx={{ mb: 2 }}>
            <Button variant="contained" startIcon={<AddRounded />} onClick={() => setAdding(true)} disabled={busy}>Add machine type</Button>
          </Box>
        )}
        <Collapse in={showAdd} timeout={200} unmountOnExit>
          <AddType families={families} busy={busy} onCreate={create} />
        </Collapse>

        {/* A failed load shows the notice above and its Retry, not a shimmer that never ends. */}
        {!list.data ? (!list.error && <SkeletonRows rows={5} />) : families.length === 0 ? (
          <EmptyState icon={<PrecisionManufacturingRounded />} title="No machine types yet"
            hint={canManage ? 'Add the first one above — a family, a subfamily and the type, in one go.' : 'Ask someone who can manage production to add one.'} />
        ) : (
          <Box sx={{ display: 'grid', gap: 2 }}>
            {families.map((f) => (
              <Box key={f.id}>
                <Box sx={familyRowSx}>
                  {editing?.id === f.id ? editor() : (
                    <>
                      <Box sx={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</Box>
                      <Mono chip>{f.code}</Mono>
                      {f.status === 'inactive' && <StatusBadge status="inactive" />}
                      <Tooltip title={`${f.subfamilies.length} subfamil${f.subfamilies.length === 1 ? 'y' : 'ies'} under it`}>
                        <Box component="span"><Mono muted>{f.subfamilies.length}s</Mono></Box>
                      </Tooltip>
                      {actions(f, 'family')}
                    </>
                  )}
                </Box>
                {f.subfamilies.length === 0 && (
                  <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', pl: 1, pt: 1 }}>Nothing under it yet.</Typography>
                )}
                {f.subfamilies.map((s) => (
                  <Box key={s.id} sx={{ pl: 1, pt: 1.25 }}>
                    <Box sx={subfamilyRowSx}>
                      {editing?.id === s.id ? editor() : (
                        <>
                          <Typography sx={{ flex: 1, minWidth: 0, fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</Typography>
                          <Mono muted>{s.code}</Mono>
                          {s.status === 'inactive' && <StatusBadge status="inactive" />}
                          <Tooltip title={`${s.types.length} type(s) under it`}>
                            <Box component="span"><Mono muted>{s.types.length}t</Mono></Box>
                          </Tooltip>
                          {actions(s, 'subfamily')}
                        </>
                      )}
                    </Box>
                    {s.types.length === 0 ? (
                      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', pl: 1 }}>No types here yet.</Typography>
                    ) : s.types.map((t) => (
                      <Box key={t.id} sx={rowSx}>
                        {editing?.id === t.id ? editor() : (
                          <>
                            <Mono chip>{t.code}</Mono>
                            <Box sx={{ flex: 1, minWidth: 0, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</Box>
                            {t.status === 'inactive' && <StatusBadge status="inactive" />}
                            <Tooltip title={`${t.machineCount} machine(s) of this type`}>
                              <Box component="span"><Mono muted>{t.machineCount}m</Mono></Box>
                            </Tooltip>
                            {actions(t, 'type')}
                          </>
                        )}
                      </Box>
                    ))}
                  </Box>
                ))}
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" onClick={onClose} disabled={busy}>Done</Button>
      </DialogActions>

      {/* The refusal lands in the confirm, not as a toast that vanishes — and
          IN_USE arrives naming what is in the way and how many, so asRefusal
          leaves it exactly as the backend wrote it. */}
      <ConfirmDialog open={!!deleting} danger confirmLabel={deleting ? `Delete ${LEVEL_WORD[deleting.level]}` : 'Delete'}
        title={`Delete this machine ${deleting ? LEVEL_WORD[deleting.level] : 'type'}?`}
        entityName={deleting ? `${deleting.code} · ${deleting.name}` : undefined}
        body={deleting ? DELETE_BODY[deleting.level] : ''}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          const level = deleting?.level ?? 'type';
          try {
            await cfApi.del(`/machine-types/${deleting?.id}`);
          } catch (e) {
            throw asRefusal(e);
          }
          list.reload();
          onChanged?.();
          toast.success(`Machine ${LEVEL_WORD[level]} deleted.`);
        }} />
    </Dialog>
  );
}
