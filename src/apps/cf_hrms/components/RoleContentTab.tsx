/**
 * The KRA → Responsibility → KPI structure of one role (DESIGN_SYSTEM §4.7,
 * inside the Record screen's Content tab).
 *
 * This is the screen the whole model exists for. Three ideas, shown as three
 * things:
 *
 *   KRA            an AREA of outcome the role is accountable for
 *     Responsibility   an activity or duty that serves it
 *     KPI              a number that says whether it is being achieved
 *
 * Two rules are visible in the layout rather than written in a note:
 *
 *   - Content is ASSIGNED, never typed. Every "Add" opens a picker over the
 *     master, and the master is a link away.
 *   - Ungrouped content is not dropped. A responsibility that belongs to no KRA
 *     is still a duty of the role, so it sits in "Additional" where someone can
 *     see it and file it — invisible content is how a JD quietly loses a duty.
 *
 * Weights are optional (many SMEs never use them). When they are used they
 * should total 100, so the total is shown and a shortfall warns. It does not
 * block: a role mid-edit is allowed to be arithmetically wrong for a minute.
 */
import { useMemo, useState } from 'react';
import { Box, Button, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded';
import FlagRounded from '@mui/icons-material/FlagRounded';
import {
  SectionCard, EntityRow, EmptyState, ToneBadge, Mono, ConfirmDialog, Surface, useToast,
} from '@shared/ui';
import {
  removeContent, reorderContent, pretty, targetText,
  type ContentKind, type ContentRow, type KraGroup, type RoleContent,
} from '../api/roles';
import { RoleAssignDialog } from './RoleAssignDialog';

const KIND_NOUN: Record<string, string> = {
  kras: 'KRA',
  responsibilities: 'responsibility',
  kpis: 'KPI',
};

function Dates({ row }: { row: ContentRow }) {
  if (!row.effectiveFrom && !row.effectiveTo) return null;
  return (
    <Box sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
      {row.effectiveFrom ? `from ${row.effectiveFrom}` : 'always'}
      {row.effectiveTo ? ` to ${row.effectiveTo}` : ''}
    </Box>
  );
}

export function RoleContentTab({
  content,
  canManage,
  onChanged,
}: {
  content: RoleContent;
  canManage: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [assign, setAssign] = useState<{ kind: ContentKind; row: ContentRow | null; kraId?: number | null } | null>(null);
  const [removing, setRemoving] = useState<{ kind: ContentKind; row: ContentRow } | null>(null);

  const { kras, additional, weights } = content;

  /**
   * The flat order of one kind across every group — what the reorder endpoint
   * takes. Sequence is one series per kind per role (it is what the JD prints
   * in), so moving a responsibility up inside its KRA still renumbers the whole
   * kind; the move itself is confined to its group.
   */
  const flat = useMemo(() => {
    const resp: ContentRow[] = [];
    const kpis: ContentRow[] = [];
    for (const k of kras) {
      resp.push(...k.responsibilities);
      kpis.push(...k.kpis);
    }
    resp.push(...additional.responsibilities);
    kpis.push(...additional.kpis);
    return { responsibilities: resp, kpis };
  }, [kras, additional]);

  async function move(kind: ContentKind, row: ContentRow, siblings: ContentRow[], delta: -1 | 1) {
    const within = siblings.findIndex((r) => r.id === row.id);
    const swapWith = siblings[within + delta];
    if (!swapWith) return;
    const all = kind === 'kras' ? kras.map((k) => k.id) : flat[kind === 'kpis' ? 'kpis' : 'responsibilities'].map((r) => r.id);
    const a = all.indexOf(row.id);
    const b = all.indexOf(swapWith.id);
    const next = [...all];
    next[a] = swapWith.id;
    next[b] = row.id;
    await reorderContent(content.role.id, kind, next);
    onChanged();
  }

  function rowActions(kind: ContentKind, row: ContentRow, siblings: ContentRow[]) {
    if (!canManage) return null;
    const i = siblings.findIndex((r) => r.id === row.id);
    return (
      <Stack direction="row" spacing={0.25}>
        <Tooltip title="Move up">
          <span>
            <IconButton size="small" aria-label="Move up" disabled={i <= 0} onClick={() => void move(kind, row, siblings, -1)}>
              <ArrowUpwardRounded sx={{ fontSize: 16 }} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Move down">
          <span>
            <IconButton size="small" aria-label="Move down" disabled={i < 0 || i >= siblings.length - 1} onClick={() => void move(kind, row, siblings, 1)}>
              <ArrowDownwardRounded sx={{ fontSize: 16 }} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Edit">
          <IconButton size="small" aria-label="Edit" onClick={() => setAssign({ kind, row })}>
            <EditRounded sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Unassign">
          <IconButton size="small" aria-label="Unassign" onClick={() => setRemoving({ kind, row })}>
            <DeleteOutlineRounded sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Stack>
    );
  }

  const responsibilityRow = (row: ContentRow, siblings: ContentRow[]) => (
    <EntityRow
      key={row.id}
      primary={row.definition?.name ?? '—'}
      secondary={
        <Stack spacing={0.25}>
          <Box sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{row.definition?.description}</Box>
          <Dates row={row} />
        </Stack>
      }
      trailing={
        <Stack direction="row" spacing={0.75} alignItems="center">
          {row.responsibilityClass && <ToneBadge tone="neutral" label={pretty(row.responsibilityClass)} noIcon />}
          {row.isMandatory === false && <ToneBadge tone="warning" label="Optional" noIcon />}
        </Stack>
      }
      actions={rowActions('responsibilities', row, siblings)}
    />
  );

  const kpiRow = (row: ContentRow, siblings: ContentRow[]) => (
    <EntityRow
      key={row.id}
      code={row.definition?.code ?? undefined}
      primary={row.definition?.name ?? '—'}
      secondary={
        <Stack spacing={0.25}>
          <Box sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
            {targetText(row)}
            {row.frequency ? ` · ${pretty(row.frequency)}` : ''}
            {row.definition?.dataSource ? ` · ${row.definition.dataSource}` : ''}
          </Box>
          <Dates row={row} />
        </Stack>
      }
      trailing={
        <Stack direction="row" spacing={0.75} alignItems="center">
          {row.weightPercent != null && <ToneBadge tone="info" label={`${row.weightPercent}%`} noIcon />}
          {row.definition?.direction && <ToneBadge tone="neutral" label={pretty(row.definition.direction)} noIcon />}
        </Stack>
      }
      actions={rowActions('kpis', row, siblings)}
    />
  );

  const nest = (label: string, children: React.ReactNode, count: number, onAdd?: () => void, addLabel?: string) => (
    <Box sx={{ mt: 1.5 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.75 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)' }}>
          {label} {count > 0 && `· ${count}`}
        </Typography>
        <Box sx={{ flex: 1, borderBottom: '1px solid var(--c-border)' }} />
        {onAdd && canManage && (
          <Button size="small" startIcon={<AddRounded sx={{ fontSize: 16 }} />} onClick={onAdd} sx={{ fontSize: 12 }}>
            {addLabel}
          </Button>
        )}
      </Stack>
      {count === 0 ? (
        <Box sx={{ fontSize: 12.5, color: 'var(--c-text-3)', pl: 1.5, pb: 0.5 }}>None yet.</Box>
      ) : (
        <Stack spacing={0.75} sx={{ pl: 1.5, borderLeft: '1px solid var(--c-border)' }}>
          {children}
        </Stack>
      )}
    </Box>
  );

  return (
    <Stack spacing={2}>
      {/* The weight band. A warning, never a block — weights are optional. */}
      {(weights.kraWeighted > 0 || kras.length > 0) && (
        <Surface
          e={1}
          sx={{
            p: 1.5, display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center',
            borderLeft: weights.kraBalanced ? '3px solid var(--c-success-600)' : '3px solid var(--c-warning-600)',
          }}
        >
          <Box sx={{ fontSize: 13 }}>
            <strong>{kras.length}</strong> KRA{kras.length === 1 ? '' : 's'} ·{' '}
            <strong>{content.counts.responsibilities}</strong> responsibilities ·{' '}
            <strong>{content.counts.kpis}</strong> KPIs
          </Box>
          <Box sx={{ flex: 1 }} />
          {weights.kraWeighted > 0 && (
            <Box sx={{ fontSize: 13, color: weights.kraBalanced ? 'var(--c-text-2)' : 'var(--c-warning-700)' }}>
              KRA weight total <strong>{weights.kraTotal}%</strong>
              {!weights.kraBalanced && ' — these do not add up to 100'}
            </Box>
          )}
          {canManage && (
            <Button variant="contained" size="small" startIcon={<AddRounded />} onClick={() => setAssign({ kind: 'kras', row: null })}>
              Assign a KRA
            </Button>
          )}
        </Surface>
      )}

      {kras.length === 0 && !content.counts.ungrouped ? (
        <EmptyState
          icon={<FlagRounded />}
          title="No content yet"
          hint="A role's content is three separate things: KRAs are the outcome areas it is accountable for, responsibilities are the duties expected of it, and KPIs are the numbers it is judged by. Start with the KRAs — the rest hangs under them."
          action={
            canManage ? (
              <Button variant="contained" startIcon={<AddRounded />} onClick={() => setAssign({ kind: 'kras', row: null })}>
                Assign a KRA
              </Button>
            ) : undefined
          }
        />
      ) : (
        kras.map((k: KraGroup) => (
          <SectionCard
            key={k.id}
            title={
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                {k.definition?.code && <Mono sx={{ fontSize: 12 }}>{k.definition.code}</Mono>}
                <span>{k.definition?.name}</span>
                {k.weightPercent != null && <ToneBadge tone="info" label={`${k.weightPercent}%`} noIcon />}
                {k.isMandatory === false && <ToneBadge tone="warning" label="Optional" noIcon />}
              </Stack>
            }
            subtitle={
              <Stack spacing={0.25}>
                <Box>{k.definition?.description}</Box>
                <Dates row={k} />
                {k.notes && <Box sx={{ fontStyle: 'italic' }}>{k.notes}</Box>}
              </Stack>
            }
            actions={rowActions('kras', k, kras)}
          >
            {nest(
              'Responsibilities',
              k.responsibilities.map((r) => responsibilityRow(r, k.responsibilities)),
              k.responsibilities.length,
              () => setAssign({ kind: 'responsibilities', row: null, kraId: k.id }),
              'Assign',
            )}
            {nest(
              'KPIs',
              k.kpis.map((r) => kpiRow(r, k.kpis)),
              k.kpis.length,
              () => setAssign({ kind: 'kpis', row: null, kraId: k.id }),
              'Assign',
            )}
          </SectionCard>
        ))
      )}

      {/* Ungrouped content. Present even when empty is wrong — but present the
          moment anything is ungrouped, because that is exactly when it would
          otherwise vanish. */}
      {(additional.responsibilities.length > 0 || additional.kpis.length > 0) && (
        <SectionCard
          title="Additional"
          subtitle="Content assigned to this role but not grouped under any KRA. It still counts — edit an item to file it under the outcome area it serves."
        >
          {additional.responsibilities.length > 0 &&
            nest(
              'Responsibilities',
              additional.responsibilities.map((r) => responsibilityRow(r, additional.responsibilities)),
              additional.responsibilities.length,
            )}
          {additional.kpis.length > 0 &&
            nest('KPIs', additional.kpis.map((r) => kpiRow(r, additional.kpis)), additional.kpis.length)}
        </SectionCard>
      )}

      {canManage && kras.length > 0 && (
        <Stack direction="row" spacing={1}>
          <Button size="small" startIcon={<AddRounded />} onClick={() => setAssign({ kind: 'responsibilities', row: null, kraId: null })}>
            Assign a responsibility
          </Button>
          <Button size="small" startIcon={<AddRounded />} onClick={() => setAssign({ kind: 'kpis', row: null, kraId: null })}>
            Assign a KPI
          </Button>
        </Stack>
      )}

      {assign && (
        <RoleAssignDialog
          open
          roleId={content.role.id}
          kind={assign.kind}
          row={assign.row}
          kras={kras}
          defaultKraId={assign.kraId ?? null}
          assigned={
            assign.kind === 'kras'
              ? kras.map((k) => k.definitionId!).filter(Boolean)
              : assign.kind === 'responsibilities'
                ? flat.responsibilities.map((r) => r.definitionId!).filter(Boolean)
                : flat.kpis.map((r) => r.definitionId!).filter(Boolean)
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
        body={
          removing?.kind === 'kras'
            ? 'The KRA stops applying from today. Anything grouped under it stays on the role and moves to Additional — nothing is deleted, and the definition itself is untouched.'
            : 'It stops applying from today. The definition stays in the master for every other role that uses it.'
        }
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
