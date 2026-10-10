/**
 * The KRA → Responsibility → KPI structure of one role, and its editor
 * (DESIGN_SYSTEM §4.7, inside the Record screen's Content tab).
 *
 * The picture is `JobContent` — the same component the org chart panel, the
 * position page, the Departments screen and My place draw — so what a role says
 * reads identically wherever it is read. This file adds the role's edits to it:
 *
 *   a KRA     write a new one · rename · set its weight · reorder · delete
 *   a line    assign · edit · move to another KRA · reorder · unassign
 *   several   tick them, then "Move to" — one write, however many
 *
 * THREE THINGS THE LAYOUT SAYS WITHOUT A NOTE:
 *
 *   - A KRA is written here, freely, per role. (The KRA list is the shared
 *     vocabulary behind it; "Use an existing KRA" picks from it.)
 *   - Deleting a KRA never deletes its lines. They stay on the role and drop to
 *     "Not yet grouped under a KRA" — and the confirm says so, with the count.
 *   - Ungrouped content is not hidden. A responsibility under no KRA is still a
 *     duty of the role; invisible content is how a JD quietly loses a duty.
 *
 * Weights are optional (many SMEs never use them). When used they should total
 * 100, so the total is shown and a shortfall warns. It never blocks.
 */
import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Divider, IconButton, ListItemText, Menu, MenuItem, Stack, TextField, Tooltip } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import FlagRounded from '@mui/icons-material/FlagRounded';
import MoreVertRounded from '@mui/icons-material/MoreVertRounded';
import DriveFileMoveRounded from '@mui/icons-material/DriveFileMoveRounded';
import { ConfirmDialog, EmptyState, FormDialog, Surface, useToast } from '@shared/ui';
import {
  masterUsage, removeContent, reorderContent, regroupContent,
  type ContentKind, type ContentRow, type KraGroup, type RoleContent,
} from '../api/roles';
import { fromRoleContent, jobContentApi, type JobKra, type JobLine } from '../api/jobContent';
import { JobContent } from './JobContent';
import { RoleAssignDialog } from './RoleAssignDialog';

const KIND_OF: Record<JobLine['kind'], 'responsibilities' | 'kpis'> = { RESPONSIBILITY: 'responsibilities', KPI: 'kpis' };
const KIND_NOUN: Record<string, string> = { kras: 'KRA', responsibilities: 'responsibility', kpis: 'KPI' };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function RoleContentTab({
  content,
  canManage,
  onChanged,
  dense = false,
  reach,
}: {
  content: RoleContent;
  canManage: boolean;
  onChanged: () => void;
  /** The 500px org chart panel: tighter lines, sections folded until opened. */
  dense?: boolean;
  /**
   * Who an edit reaches, as a sentence — "Changes the role X — 2 positions".
   * Set where the editor is opened from ONE seat (the org chart panel), so
   * every dialog says it before saving. The role's own page has it in its title.
   */
  reach?: string;
}) {
  const toast = useToast();
  const { kras, additional, weights } = content;
  const view = useMemo(() => fromRoleContent(content), [content]);

  const [assign, setAssign] = useState<{ kind: ContentKind; row: ContentRow | null; kraId?: number | null } | null>(null);
  const [removing, setRemoving] = useState<{ kind: ContentKind; row: ContentRow } | null>(null);
  const [lineMenu, setLineMenu] = useState<{ anchor: HTMLElement; line: JobLine; kra: JobKra | null } | null>(null);
  const [kraMenu, setKraMenu] = useState<{ anchor: HTMLElement; kra: KraGroup } | null>(null);
  const [moveMenu, setMoveMenu] = useState<HTMLElement | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [kraForm, setKraForm] = useState<{ kra: KraGroup | null } | null>(null);
  const [kraName, setKraName] = useState('');
  const [kraDescription, setKraDescription] = useState('');
  const [sharedWith, setSharedWith] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<KraGroup | null>(null);

  /** The role's own rows, by id — what the existing dialogs and the reorder take. */
  const rows = useMemo(() => {
    const responsibilities = [...kras.flatMap((k) => k.responsibilities), ...additional.responsibilities];
    const kpis = [...kras.flatMap((k) => k.kpis), ...additional.kpis];
    return {
      responsibilities,
      kpis,
      byKey: new Map<string, ContentRow>([
        ...responsibilities.map((r) => [`RESPONSIBILITY:${r.id}`, r] as const),
        ...kpis.map((r) => [`KPI:${r.id}`, r] as const),
      ]),
      kra: new Map(kras.map((k) => [k.id, k])),
    };
  }, [kras, additional]);

  // A selection only means something while its lines are still on the role.
  useEffect(() => {
    setSelected((s) => {
      const next = new Set([...s].filter((k) => rows.byKey.has(k)));
      return next.size === s.size ? s : next;
    });
  }, [rows]);

  // Opening the KRA form: a blank one, or the KRA being renamed — and, for a
  // rename, how many OTHER roles share its wording.
  useEffect(() => {
    if (!kraForm) return;
    setKraName(kraForm.kra?.definition?.name ?? '');
    setKraDescription(kraForm.kra?.definition?.description ?? '');
    setSharedWith(null);
    const definitionId = kraForm.kra?.definitionId;
    if (!definitionId) return;
    let live = true;
    masterUsage('kras', definitionId)
      .then((u) => {
        if (live) setSharedWith(u.roles.filter((r) => r.id !== content.role.id).length);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [kraForm, content.role.id]);

  const run = async (work: () => Promise<unknown>, message: string) => {
    try {
      await work();
      toast.success(message);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'That did not save.');
    }
  };

  /**
   * Sequence is one series per kind per role (it is what the JD prints in), so
   * moving a line up inside its KRA still renumbers the whole kind; the move
   * itself is confined to its group.
   */
  const moveBy = (kind: 'kras' | 'responsibilities' | 'kpis', id: number, siblings: number[], delta: -1 | 1) => {
    const swapWith = siblings[siblings.indexOf(id) + delta];
    if (swapWith == null) return;
    const all = kind === 'kras' ? kras.map((k) => k.id) : rows[kind].map((r) => r.id);
    const next = [...all];
    next[all.indexOf(id)] = swapWith;
    next[all.indexOf(swapWith)] = id;
    void run(() => reorderContent(content.role.id, kind, next), 'Order saved.');
  };

  const siblingsOf = (line: JobLine, kra: JobKra | null): number[] => {
    const group = kra ? rows.kra.get(kra.roleRowId ?? -1) : null;
    const list = line.kind === 'KPI' ? (group ? group.kpis : additional.kpis) : group ? group.responsibilities : additional.responsibilities;
    return list.map((r) => r.id);
  };

  const moveSelected = (roleKraAssignmentId: number | null, label: string) => {
    const pick = (prefix: string) =>
      [...selected].filter((k) => k.startsWith(prefix)).map((k) => rows.byKey.get(k)?.id).filter((id): id is number => id != null);
    const responsibilities = pick('RESPONSIBILITY:');
    const kpis = pick('KPI:');
    const n = responsibilities.length + kpis.length;
    void run(async () => {
      await jobContentApi.moveLines(content.role.id, { roleKraAssignmentId, responsibilities, kpis });
      setSelected(new Set());
    }, `${plural(n, 'line')} moved to ${label}.`);
  };

  const saveKra = async () => {
    if (!kraForm) return;
    const body = { name: kraName.trim(), description: kraDescription.trim() };
    if (kraForm.kra) {
      const r = await jobContentApi.renameKra(kraForm.kra.id, body);
      toast.success(r.forked ? 'Renamed for this role. The other roles keep the old wording.' : 'KRA saved.');
    } else {
      await jobContentApi.createKra(content.role.id, body);
      toast.success('KRA added. Move the lines that serve it under it.');
    }
    setKraForm(null);
    onChanged();
  };

  const lineActions = (line: JobLine, kra: JobKra | null) => (
    <Tooltip title="Edit, move or unassign">
      <IconButton
        size="small"
        aria-label={`Actions for: ${line.name}`}
        aria-haspopup="menu"
        onClick={(e) => setLineMenu({ anchor: e.currentTarget, line, kra })}
      >
        <MoreVertRounded sx={{ fontSize: 18 }} />
      </IconButton>
    </Tooltip>
  );

  const kraActions = (kra: JobKra) => {
    const group = rows.kra.get(kra.roleRowId ?? -1);
    if (!group) return null;
    return (
      <Tooltip title="Rename, reorder or delete this KRA">
        <IconButton
          size="small"
          aria-label={`Actions for the KRA: ${kra.name}`}
          aria-haspopup="menu"
          onClick={(e) => setKraMenu({ anchor: e.currentTarget, kra: group })}
        >
          <MoreVertRounded sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>
    );
  };

  const sectionFooter = (kra: JobKra | null) => (
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1.25 }}>
      <Button
        size="small"
        startIcon={<AddRounded sx={{ fontSize: 16 }} />}
        onClick={() => setAssign({ kind: 'responsibilities', row: null, kraId: kra?.roleRowId ?? null })}
        sx={{ textTransform: 'none' }}
      >
        Add a responsibility{kra ? ' here' : ''}
      </Button>
      <Button
        size="small"
        startIcon={<AddRounded sx={{ fontSize: 16 }} />}
        onClick={() => setAssign({ kind: 'kpis', row: null, kraId: kra?.roleRowId ?? null })}
        sx={{ textTransform: 'none' }}
      >
        Add a KPI{kra ? ' here' : ''}
      </Button>
    </Stack>
  );

  const menuLine = lineMenu?.line ?? null;
  const menuRow = menuLine ? rows.byKey.get(menuLine.key) ?? null : null;
  const menuSiblings = lineMenu && menuLine ? siblingsOf(menuLine, lineMenu.kra) : [];
  const menuIndex = menuRow ? menuSiblings.indexOf(menuRow.id) : -1;
  const kraIds = kras.map((k) => k.id);
  const deletingLines = deleting ? deleting.responsibilities.length + deleting.kpis.length : 0;
  const empty = kras.length === 0 && !content.counts.ungrouped;

  return (
    <Stack spacing={2}>
      {/* The summary band: what is here, whether the weights add up, and the way in. */}
      <Surface
        e={1}
        sx={{
          p: 1.5, display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center',
          borderLeft: weights.kraBalanced ? '3px solid var(--c-success-600)' : '3px solid var(--c-warning-600)',
        }}
      >
        <Box sx={{ fontSize: 13 }}>
          <strong>{kras.length}</strong> KRA{kras.length === 1 ? '' : 's'} ·{' '}
          <strong>{content.counts.responsibilities}</strong> responsibilities ·{' '}
          <strong>{content.counts.kpis}</strong> KPIs
          {content.counts.ungrouped > 0 && kras.length > 0 && (
            <> · <strong>{content.counts.ungrouped}</strong> not yet under a KRA</>
          )}
        </Box>
        <Box sx={{ flex: 1 }} />
        {weights.kraWeighted > 0 && (
          <Box sx={{ fontSize: 13, color: weights.kraBalanced ? 'var(--c-text-2)' : 'var(--c-warning-700)' }}>
            KRA weight total <strong>{weights.kraTotal}%</strong>
            {!weights.kraBalanced && ' — these do not add up to 100'}
          </Box>
        )}
        {canManage && (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button size="small" onClick={() => setAssign({ kind: 'kras', row: null })} sx={{ textTransform: 'none' }}>
              Use an existing KRA
            </Button>
            <Button variant="contained" size="small" startIcon={<AddRounded />} onClick={() => setKraForm({ kra: null })}>
              New KRA
            </Button>
          </Stack>
        )}
      </Surface>

      {empty ? (
        <EmptyState
          icon={<FlagRounded />}
          title="No KRAs written for this role yet"
          hint="A role's content is three separate things: KRAs are the outcome areas it is accountable for, responsibilities are the tasks under each, and KPIs are the measures it is judged by. Start with the KRAs — the rest hangs under them."
          action={
            canManage ? (
              <Button variant="contained" startIcon={<AddRounded />} onClick={() => setKraForm({ kra: null })}>
                New KRA
              </Button>
            ) : undefined
          }
        />
      ) : (
        <JobContent
          content={view}
          initiallyOpen={dense ? 'auto' : 'all'}
          dense={dense}
          summary={false}
          lineActions={canManage ? lineActions : undefined}
          kraActions={canManage ? kraActions : undefined}
          sectionFooter={canManage ? sectionFooter : undefined}
          selection={
            canManage
              ? {
                  selected,
                  toggle: (line) =>
                    setSelected((s) => {
                      const next = new Set(s);
                      if (next.has(line.key)) next.delete(line.key);
                      else next.add(line.key);
                      return next;
                    }),
                }
              : undefined
          }
          noKrasAction={
            canManage ? (
              <Box
                component="button"
                type="button"
                onClick={() => setKraForm({ kra: null })}
                sx={{ border: 0, background: 'none', p: 0, font: 'inherit', color: 'var(--c-primary-700)', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Write the first KRA
              </Box>
            ) : undefined
          }
        />
      )}

      {/* Sticks to the bottom of the view, so it is in reach wherever the ticks were made. */}
      {canManage && selected.size > 0 && (
        <Surface
          e={2}
          data-selectionbar=""
          sx={{
            p: 1, pl: 1.5, display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center',
            position: 'sticky', bottom: 12, zIndex: 2, border: '1px solid var(--c-primary-500)',
          }}
        >
          <Box sx={{ fontSize: 13, fontWeight: 500, flex: 1 }}>
            {plural(selected.size, 'line')} selected{reach ? ` · ${reach}` : ''}
          </Box>
          <Button
            size="small"
            variant="contained"
            startIcon={<DriveFileMoveRounded />}
            aria-haspopup="menu"
            onClick={(e) => setMoveMenu(e.currentTarget)}
          >
            Move to…
          </Button>
          <Button size="small" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </Surface>
      )}

      {/* ── one line's menu ─────────────────────────────────────────────── */}
      <Menu anchorEl={lineMenu?.anchor} open={!!lineMenu} onClose={() => setLineMenu(null)}>
        {menuRow && menuLine && [
          <MenuItem
            key="edit"
            onClick={() => {
              setAssign({ kind: KIND_OF[menuLine.kind], row: menuRow });
              setLineMenu(null);
            }}
          >
            <ListItemText primary="Edit…" />
          </MenuItem>,
          <Divider key="d1" />,
          <MenuItem key="head" disabled sx={{ fontSize: 12, opacity: '1 !important', color: 'var(--c-text-2)' }}>
            Move to
          </MenuItem>,
          ...kras
            .filter((k) => k.id !== menuRow.roleKraAssignmentId)
            .map((k) => (
              <MenuItem
                key={`k${k.id}`}
                onClick={() => {
                  setLineMenu(null);
                  void run(() => regroupContent(KIND_OF[menuLine.kind], menuRow.id, k.id), `Moved to ${k.definition?.name ?? 'the KRA'}.`);
                }}
              >
                <ListItemText primary={k.definition?.name ?? '—'} />
              </MenuItem>
            )),
          ...(menuRow.roleKraAssignmentId != null && lineMenu?.kra
            ? [
                <MenuItem
                  key="none"
                  onClick={() => {
                    setLineMenu(null);
                    void run(() => regroupContent(KIND_OF[menuLine.kind], menuRow.id, null), 'Moved out of the KRA.');
                  }}
                >
                  <ListItemText primary="Not under a KRA" />
                </MenuItem>,
              ]
            : []),
          ...(kras.length === 0
            ? [
                <MenuItem key="nokra" disabled>
                  <ListItemText primary="No KRAs yet — write one first" />
                </MenuItem>,
              ]
            : []),
          <Divider key="d2" />,
          <MenuItem
            key="up"
            disabled={menuIndex <= 0}
            onClick={() => {
              setLineMenu(null);
              moveBy(KIND_OF[menuLine.kind], menuRow.id, menuSiblings, -1);
            }}
          >
            <ListItemText primary="Move up" />
          </MenuItem>,
          <MenuItem
            key="down"
            disabled={menuIndex < 0 || menuIndex >= menuSiblings.length - 1}
            onClick={() => {
              setLineMenu(null);
              moveBy(KIND_OF[menuLine.kind], menuRow.id, menuSiblings, 1);
            }}
          >
            <ListItemText primary="Move down" />
          </MenuItem>,
          <Divider key="d3" />,
          <MenuItem
            key="remove"
            onClick={() => {
              setRemoving({ kind: KIND_OF[menuLine.kind], row: menuRow });
              setLineMenu(null);
            }}
          >
            <ListItemText primary="Unassign from this role…" />
          </MenuItem>,
        ]}
      </Menu>

      {/* ── one KRA's menu ──────────────────────────────────────────────── */}
      <Menu anchorEl={kraMenu?.anchor} open={!!kraMenu} onClose={() => setKraMenu(null)}>
        {kraMenu && [
          <MenuItem
            key="rename"
            onClick={() => {
              setKraForm({ kra: kraMenu.kra });
              setKraMenu(null);
            }}
          >
            <ListItemText primary="Rename…" />
          </MenuItem>,
          <MenuItem
            key="weight"
            onClick={() => {
              setAssign({ kind: 'kras', row: kraMenu.kra });
              setKraMenu(null);
            }}
          >
            <ListItemText primary="Weight and dates…" />
          </MenuItem>,
          <Divider key="d1" />,
          <MenuItem
            key="up"
            disabled={kraIds.indexOf(kraMenu.kra.id) <= 0}
            onClick={() => {
              const id = kraMenu.kra.id;
              setKraMenu(null);
              moveBy('kras', id, kraIds, -1);
            }}
          >
            <ListItemText primary="Move up" />
          </MenuItem>,
          <MenuItem
            key="down"
            disabled={kraIds.indexOf(kraMenu.kra.id) >= kraIds.length - 1}
            onClick={() => {
              const id = kraMenu.kra.id;
              setKraMenu(null);
              moveBy('kras', id, kraIds, 1);
            }}
          >
            <ListItemText primary="Move down" />
          </MenuItem>,
          <Divider key="d2" />,
          <MenuItem
            key="delete"
            onClick={() => {
              setDeleting(kraMenu.kra);
              setKraMenu(null);
            }}
          >
            <ListItemText primary="Delete this KRA…" secondary="Its lines stay on the role" />
          </MenuItem>,
        ]}
      </Menu>

      {/* ── where the ticked lines go ───────────────────────────────────── */}
      <Menu anchorEl={moveMenu} open={!!moveMenu} onClose={() => setMoveMenu(null)}>
        {kras.map((k) => (
          <MenuItem
            key={k.id}
            onClick={() => {
              setMoveMenu(null);
              moveSelected(k.id, k.definition?.name ?? 'the KRA');
            }}
          >
            <ListItemText primary={k.definition?.name ?? '—'} />
          </MenuItem>
        ))}
        {kras.length === 0 && (
          <MenuItem disabled>
            <ListItemText primary="No KRAs yet — write one first" />
          </MenuItem>
        )}
        <Divider />
        <MenuItem
          onClick={() => {
            setMoveMenu(null);
            moveSelected(null, '“Not yet grouped under a KRA”');
          }}
        >
          <ListItemText primary="Not under a KRA" />
        </MenuItem>
      </Menu>

      <FormDialog
        open={!!kraForm}
        title={kraForm?.kra ? 'Rename this KRA' : 'New KRA'}
        subtitle={
          reach
            ? `${reach}. ${kraForm?.kra ? 'The responsibilities and KPIs under it stay where they are.' : 'Its responsibilities and KPIs are filed under it afterwards.'}`
            : kraForm?.kra
            ? 'The responsibilities and KPIs under it stay where they are.'
            : 'An outcome area this role is accountable for — "Machine uptime", "Dispatch on time". Its responsibilities and KPIs are filed under it afterwards.'
        }
        onClose={() => setKraForm(null)}
        onSubmit={saveKra}
        submitLabel={kraForm?.kra ? 'Save' : 'Add the KRA'}
        submitDisabled={!kraName.trim()}
      >
        <TextField
          label="KRA"
          value={kraName}
          onChange={(e) => setKraName(e.target.value.slice(0, 200))}
          required
          autoFocus
          fullWidth
          size="small"
        />
        <TextField
          label="What it covers (optional)"
          value={kraDescription}
          onChange={(e) => setKraDescription(e.target.value)}
          fullWidth
          multiline
          minRows={2}
          size="small"
        />
        {kraForm?.kra && sharedWith != null && sharedWith > 0 && (
          <Box sx={{ fontSize: 12.5, color: 'var(--c-text-2)', lineHeight: 1.55 }}>
            {plural(sharedWith, 'other role')} {sharedWith === 1 ? 'uses' : 'use'} a KRA with this exact name. Renaming it
            here gives this role its own KRA and leaves {sharedWith === 1 ? 'that role' : 'those roles'} untouched. Changing
            only the description changes it for all of them.
          </Box>
        )}
      </FormDialog>

      <ConfirmDialog
        open={!!deleting}
        title="Delete this KRA from the role?"
        entityName={deleting?.definition?.name}
        body={(
          deletingLines > 0
            ? `Only the KRA goes. Its ${plural(deleting?.responsibilities.length ?? 0, 'responsibility', 'responsibilities')} and ${plural(deleting?.kpis.length ?? 0, 'KPI')} are NOT deleted — they stay on this role and move to “Not yet grouped under a KRA”, where you can file them under another KRA.`
            : 'Nothing is filed under it, so nothing else changes. Seats holding this role lose the heading too.'
        ) + (reach ? ` ${reach}.` : '')}
        confirmLabel="Delete the KRA"
        danger
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          const r = await jobContentApi.deleteKra(deleting.id);
          toast.success(r.ungrouped > 0 ? `KRA deleted. ${plural(r.ungrouped, 'line')} kept, now ungrouped.` : 'KRA deleted.');
          setDeleting(null);
          onChanged();
        }}
      />

      {assign && (
        <RoleAssignDialog
          open
          roleId={content.role.id}
          kind={assign.kind}
          row={assign.row}
          kras={kras}
          defaultKraId={assign.kraId ?? null}
          notice={reach}
          assigned={
            assign.kind === 'kras'
              ? kras.map((k) => k.definitionId!).filter(Boolean)
              : assign.kind === 'responsibilities'
                ? rows.responsibilities.map((r) => r.definitionId!).filter(Boolean)
                : rows.kpis.map((r) => r.definitionId!).filter(Boolean)
          }
          onClose={() => setAssign(null)}
          onSaved={(m) => {
            setAssign(null);
            toast.success(m);
            onChanged();
          }}
        />
      )}

      <ConfirmDialog
        open={!!removing}
        title={`Unassign this ${KIND_NOUN[removing?.kind ?? 'kras'] ?? 'item'}?`}
        entityName={removing?.row.definition?.name}
        body={`It stops applying to this role from today, for every seat that holds the role. It stays readable as history.${reach ? ` ${reach}.` : ''}`}
        confirmLabel="Unassign"
        danger
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          await removeContent(removing.kind, removing.row.id);
          toast.success('Ended. It stays readable as history.');
          setRemoving(null);
          onChanged();
        }}
      />
    </Stack>
  );
}

export default RoleContentTab;
