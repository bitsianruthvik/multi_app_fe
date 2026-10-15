import { Box } from '@mui/material';
import type { DepartmentLabelRef } from '../api/organisation';

/**
 * A department's labels as small chips, Kind first (spec §15.4). `skipKind`
 * leaves Kind out where the row already says it. Each chip's title names its
 * group: "Unit: Unit 2".
 */
export function LabelChips({ labels, skipKind = false, kindGroupId, size = 'sm' }: {
  labels: DepartmentLabelRef[] | undefined;
  skipKind?: boolean;
  kindGroupId?: number;
  size?: 'sm' | 'xs';
}) {
  const shown = (labels ?? []).filter((l) => !(skipKind && l.groupId === kindGroupId));
  if (!shown.length) return null;
  return (
    <Box component="span" sx={{ display: 'inline-flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center', minWidth: 0 }}>
      {shown.map((l) => (
        <Box
          component="span"
          key={l.groupId}
          title={`${l.groupName}: ${l.name}`}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            px: size === 'xs' ? 0.5 : 0.75,
            minHeight: size === 'xs' ? 16 : 20,
            borderRadius: 'var(--r-sm)',
            border: '1px solid var(--c-border)',
            background: 'var(--c-surface-2)',
            color: 'var(--c-text-2)',
            fontSize: size === 'xs' ? 10.5 : 11.5,
            fontWeight: 500,
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
            maxWidth: 160,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {l.name}
        </Box>
      ))}
    </Box>
  );
}
