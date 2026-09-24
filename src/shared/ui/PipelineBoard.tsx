import type { ReactNode, KeyboardEvent } from 'react';
import { Box, Typography } from '@mui/material';
import { Surface } from './Surface';

export interface PipelineStage {
  key: string;
  label: string;
  /**
   * The stage accent — pass a token, e.g. `var(--c-stage-2)`. These are
   * categorical, NOT status colours: a stage is where something is in a
   * lifecycle, not whether it is in trouble.
   */
  accent: string;
}

/** A single card on the board. Its left edge carries the stage accent. */
export function PipelineCard({
  accent,
  children,
  onClick,
}: {
  accent: string;
  children: ReactNode;
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
          ? (e: KeyboardEvent) => {
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
 * Pipeline / board (DESIGN_SYSTEM.md §4.4/§7.5): lifecycle stages as columns,
 * each a solid surface with a sticky header carrying the stage accent and a
 * count.
 *
 * Only board something with a real lifecycle. A board of records that do not
 * move between its columns is a list with extra steps.
 */
export function PipelineBoard({
  stages,
  cardsByStage,
  emptyHint = 'Nothing in this stage',
  minColumnWidth = 248,
}: {
  stages: PipelineStage[];
  cardsByStage: Record<string, ReactNode[]>;
  emptyHint?: string;
  minColumnWidth?: number;
}) {
  return (
    <Box sx={{ display: 'flex', gap: 1.5, overflowX: 'auto', pb: 1.5, alignItems: 'stretch' }}>
      {stages.map((stage) => {
        const cards = cardsByStage[stage.key] ?? [];
        return (
          <Box
            key={stage.key}
            sx={{
              flex: `1 0 ${minColumnWidth}px`,
              minWidth: minColumnWidth,
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
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: stage.accent,
                  flexShrink: 0,
                }}
                aria-hidden
              />
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)', flex: 1 }}>
                {stage.label}
              </Typography>
              <Box
                component="span"
                sx={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  fontWeight: 500,
                  color: 'var(--c-text-2)',
                }}
              >
                {cards.length}
              </Box>
            </Box>
            <Box
              sx={{
                p: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                flex: 1,
                minHeight: 80,
              }}
            >
              {cards.length === 0 ? (
                <Typography
                  sx={{ fontSize: 12, color: 'var(--c-text-3)', textAlign: 'center', mt: 3 }}
                >
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
