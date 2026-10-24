import { Box } from '@mui/material';

/** An org unit's kind (its ONE label, spec §9 / §33) as a small chip. Nothing when it has none. */
export function LabelChip({ name, size = 'sm' }: { name: string | null | undefined; size?: 'sm' | 'xs' }) {
  if (!name) return null;
  return (
    <Box
      component="span"
      title={`Kind: ${name}`}
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
      {name}
    </Box>
  );
}
