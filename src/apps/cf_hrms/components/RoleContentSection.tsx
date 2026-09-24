/**
 * One flat section of a role's content — skills, qualifications, experience,
 * authorities, relationship expectations or working conditions.
 *
 * These six are lists rather than a hierarchy: nothing hangs under them, so
 * they get a card each instead of the KRA tree. What they share with the tree is
 * the rule that matters — the four that draw on a master are ASSIGNED from it,
 * and only experience, relationships and conditions are written in place,
 * because none of them is a vocabulary anything else reuses.
 */
import { useState } from 'react';
import { Box, Button, IconButton, Stack, Tooltip } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import { SectionCard, EntityRow, ToneBadge, ConfirmDialog, useToast } from '@shared/ui';
import {
  removeContent, pretty, limitText,
  type ContentKind, type ContentRow, type KraGroup,
} from '../api/roles';
import { RoleAssignDialog } from './RoleAssignDialog';

interface Presentation {
  primary: (row: ContentRow) => string;
  secondary?: (row: ContentRow) => string | null;
  trailing?: (row: ContentRow) => { tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger'; label: string }[];
}

const PRESENT: Record<string, Presentation> = {
  skills: {
    primary: (r) => r.definition?.name ?? '—',
    secondary: (r) => [r.definition?.skillType ? pretty(r.definition.skillType) : null, r.proficiencyLevel].filter(Boolean).join(' · ') || null,
    trailing: (r) => [{ tone: r.requirementLevel === 'REQUIRED' ? 'info' : 'neutral', label: pretty(r.requirementLevel) }],
  },
  qualifications: {
    primary: (r) => r.definition?.name ?? '—',
    secondary: (r) => (r.definition?.qualificationType ? pretty(r.definition.qualificationType) : null),
    trailing: (r) => [{ tone: r.requirementLevel === 'REQUIRED' ? 'info' : 'neutral', label: pretty(r.requirementLevel) }],
  },
  experience: {
    primary: (r) => {
      const years =
        r.minYears != null && r.preferredYears != null
          ? `${r.minYears}–${r.preferredYears} years`
          : r.minYears != null
            ? `${r.minYears}+ years`
            : r.preferredYears != null
              ? `${r.preferredYears} years preferred`
              : 'Experience';
      return r.experienceArea ? `${years} — ${r.experienceArea}` : years;
    },
    secondary: (r) => r.notes ?? null,
    trailing: (r) => [{ tone: r.requirementLevel === 'REQUIRED' ? 'info' : 'neutral', label: pretty(r.requirementLevel) }],
  },
  authorities: {
    primary: (r) => r.definition?.name ?? '—',
    secondary: (r) => limitText(r.limitJson),
    trailing: (r) => (r.definition?.authorityType ? [{ tone: 'neutral', label: pretty(r.definition.authorityType) }] : []),
  },
  relationships: {
    primary: (r) => r.counterparty ?? '—',
    secondary: (r) => r.purpose ?? null,
    trailing: (r) => [{ tone: r.relationshipScope === 'EXTERNAL' ? 'warning' : 'neutral', label: pretty(r.relationshipScope) }],
  },
  conditions: {
    primary: (r) => r.description ?? '—',
    secondary: () => null,
    trailing: (r) => [
      { tone: 'neutral', label: pretty(r.conditionType) },
      ...(r.isMandatory === false ? [{ tone: 'warning' as const, label: 'Advisory' }] : []),
    ],
  },
};

export function RoleContentSection({
  roleId,
  kind,
  rows,
  kras,
  title,
  subtitle,
  addLabel,
  emptyHint,
  canManage,
  onChanged,
}: {
  roleId: number;
  kind: ContentKind;
  rows: ContentRow[];
  kras: KraGroup[];
  title: string;
  subtitle?: string;
  addLabel: string;
  emptyHint: string;
  canManage: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const present = PRESENT[kind];
  const [assign, setAssign] = useState<{ row: ContentRow | null } | null>(null);
  const [removing, setRemoving] = useState<ContentRow | null>(null);

  return (
    <>
      <SectionCard
        title={title}
        subtitle={subtitle}
        actions={
          canManage ? (
            <Button size="small" startIcon={<AddRounded sx={{ fontSize: 16 }} />} onClick={() => setAssign({ row: null })}>
              {addLabel}
            </Button>
          ) : undefined
        }
      >
        {rows.length === 0 ? (
          <Box sx={{ fontSize: 13, color: 'var(--c-text-3)', py: 1 }}>{emptyHint}</Box>
        ) : (
          <Stack spacing={0.75}>
            {rows.map((r) => (
              <EntityRow
                key={r.id}
                primary={present.primary(r)}
                secondary={
                  <Stack spacing={0.25}>
                    {present.secondary?.(r) && <Box sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{present.secondary(r)}</Box>}
                    {(r.effectiveFrom || r.effectiveTo) && (
                      <Box sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
                        {r.effectiveFrom ? `from ${r.effectiveFrom}` : 'always'}
                        {r.effectiveTo ? ` to ${r.effectiveTo}` : ''}
                      </Box>
                    )}
                  </Stack>
                }
                trailing={
                  <Stack direction="row" spacing={0.75}>
                    {(present.trailing?.(r) ?? []).map((b) => (
                      <ToneBadge key={b.label} tone={b.tone} label={b.label} noIcon />
                    ))}
                  </Stack>
                }
                actions={
                  canManage ? (
                    <Stack direction="row" spacing={0.25}>
                      <Tooltip title="Edit">
                        <IconButton size="small" aria-label="Edit" onClick={() => setAssign({ row: r })}>
                          <EditRounded sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Remove">
                        <IconButton size="small" aria-label="Remove" onClick={() => setRemoving(r)}>
                          <DeleteOutlineRounded sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  ) : undefined
                }
              />
            ))}
          </Stack>
        )}
      </SectionCard>

      {assign && (
        <RoleAssignDialog
          open
          roleId={roleId}
          kind={kind}
          row={assign.row}
          kras={kras}
          assigned={rows.map((r) => r.definitionId).filter((id): id is number => !!id)}
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
        title="Remove this from the role?"
        entityName={removing ? present.primary(removing) : undefined}
        body="It stops applying from today and stays readable as history. Anything it was assigned from stays in its master."
        confirmLabel="Remove"
        danger
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          await removeContent(kind, removing.id);
          toast.success('Removed.');
          setRemoving(null);
          onChanged();
        }}
      />
    </>
  );
}

export default RoleContentSection;
