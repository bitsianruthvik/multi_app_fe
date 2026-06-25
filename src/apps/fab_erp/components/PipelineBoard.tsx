import React from 'react';
import { Box, Typography } from '@mui/material';
import { Surface } from './Surface';

export interface PipelineStage {
  key: string;
  label: string;
  /** Board stage accent (DESIGN_SYSTEM.md §5.1 board colors). */
  accent: string;
}

/**
 * A single card on the pipeline board. Left edge carries the stage accent.
 */
export function PipelineCard({
  accent,
  children,
  onClick,
}: {
  accent: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Surface
      e={1}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      sx={{
        p: 1.5,
        pl: 1.75,
        position: 'relative',
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
        borderLeft: `3px solid ${accent}`,
        borderTopLeftRadius: 0,
        borderBottomLeftRadius: 0,
        transition: 'box-shadow var(--t-fast) var(--ease), transform var(--t-fast) var(--ease)',
        '&:hover': { boxShadow: 'var(--e-2)', transform: 'translateY(-1px)' },
      }}
    >
      {children}
    </Surface>
  );
}

/**
 * Pipeline / board (DESIGN_SYSTEM.md §4.4/§7.5): horizontal lifecycle columns,
 * each a solid surface with a sticky header (stage accent + count). Cards are
 * grouped by stage via `cardsByStage[stage.key]`.
 */
export function PipelineBoard({
  stages,
  cardsByStage,
  emptyHint = 'No orders in this stage',
}: {
  stages: PipelineStage[];
  cardsByStage: Record<string, React.ReactNode[]>;
  emptyHint?: string;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        gap: 1.5,
        overflowX: 'auto',
        pb: 1.5,
        alignItems: 'stretch',
      }}
    >
      {stages.map((stage) => {
        const cards = cardsByStage[stage.key] ?? [];
        return (
          <Box
            key={stage.key}
            sx={{
              flex: '1 0 248px',
              minWidth: 248,
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 'var(--r-md)',
              background: 'var(--c-surface-2)',
              border: '1px solid var(--c-border)',
            }}
          >
            <Box
              sx={{
                position: 'sticky',
                top: 0,
                zIndex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1.5,
                py: 1.25,
                borderBottom: '1px solid var(--c-border)',
                borderTopLeftRadius: 'var(--r-md)',
                borderTopRightRadius: 'var(--r-md)',
                background: 'var(--c-surface)',
              }}
            >
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', background: stage.accent, flexShrink: 0 }} />
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)', flex: 1 }}>
                {stage.label}
              </Typography>
              <Box
                component="span"
                sx={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500, color: 'var(--c-text-2)' }}
              >
                {cards.length}
              </Box>
            </Box>
            <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minHeight: 80 }}>
              {cards.length === 0 ? (
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', textAlign: 'center', mt: 3 }}>
                  {emptyHint}
                </Typography>
              ) : (
                cards
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
