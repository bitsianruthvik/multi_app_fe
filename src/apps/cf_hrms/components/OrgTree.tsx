import { Box, IconButton } from '@mui/material';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import type { ReactNode } from 'react';
import { EntityRow, Mono } from '@shared/ui';
import type { TreeMeta } from '../api/organisation';
import { idsWithVisibleChildren, visibleRows } from './OrgData';

/**
 * The Hierarchy archetype (DESIGN_SYSTEM.md §4.7) for departments, locations
 * and work contexts: indented outline rows with expand/collapse, depth shown by
 * indentation plus a hairline guide, each row a kit `EntityRow`.
 *
 * Three of these screens are trees rather than tables because the parent is the
 * meaning. "Printing" tells you almost nothing; "Production › Printing" tells
 * you where a JD's department sits and which holiday calendar a location
 * inherits. A flat table of 40 departments with a "Parent" column makes the
 * reader rebuild the tree in their head, every time.
 *
 * The chevron is a real button, so the whole tree is reachable with Tab and
 * operated with Enter — §6.4 — and the row carries aria-level / aria-expanded so
 * a screen reader hears the depth that sighted users read from the indent.
 */
export function OrgTreeView<T extends TreeMeta>({
  rows,
  collapsed,
  onToggle,
  ariaLabel,
  renderCode,
  renderPrimary,
  renderSecondary,
  renderTrailing,
  renderActions,
}: {
  /** Pre-order, already searched. Collapsing is applied here. */
  rows: T[];
  collapsed: Set<number>;
  onToggle: (id: number) => void;
  ariaLabel: string;
  renderCode?: (row: T) => ReactNode;
  renderPrimary: (row: T) => ReactNode;
  renderSecondary?: (row: T) => ReactNode;
  renderTrailing?: (row: T) => ReactNode;
  renderActions?: (row: T) => ReactNode;
}) {
  const expandable = idsWithVisibleChildren(rows);
  const shown = visibleRows(rows, collapsed);

  return (
    <Box role="tree" aria-label={ariaLabel} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {shown.map((row) => {
        const canExpand = expandable.has(row.id);
        const open = canExpand && !collapsed.has(row.id);
        return (
          <Box
            key={row.id}
            role="treeitem"
            aria-level={row.depth + 1}
            aria-expanded={canExpand ? open : undefined}
            sx={{ display: 'flex', alignItems: 'stretch', minWidth: 0 }}
          >
            {/* Depth guides. Decorative — the level is announced by aria-level. */}
            {Array.from({ length: row.depth }).map((_, i) => (
              <Box
                key={i}
                aria-hidden
                sx={{
                  width: 20,
                  flexShrink: 0,
                  borderLeft: '1px solid var(--c-divider)',
                  ml: i === 0 ? 1.5 : 0,
                }}
              />
            ))}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <EntityRow
                code={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {canExpand ? (
                      <IconButton
                        size="small"
                        onClick={() => onToggle(row.id)}
                        aria-label={open ? `Collapse ${row.name}` : `Expand ${row.name}`}
                        sx={{
                          color: 'var(--c-text-2)',
                          '& svg': { transition: 'transform var(--t-mid) var(--ease)' },
                        }}
                      >
                        {open ? (
                          <ExpandMoreRounded fontSize="small" />
                        ) : (
                          <ChevronRightRounded fontSize="small" />
                        )}
                      </IconButton>
                    ) : (
                      // Keeps every row's text on the same left edge whether or
                      // not it has children — a ragged left edge reads as noise.
                      <Box aria-hidden sx={{ width: 30, flexShrink: 0 }} />
                    )}
                    {renderCode ? renderCode(row) : null}
                  </Box>
                }
                primary={renderPrimary(row)}
                secondary={renderSecondary?.(row)}
                trailing={renderTrailing?.(row)}
                actions={renderActions?.(row)}
              />
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

/** The code cell every tree row shares: mono, or a quiet reminder there is none. */
export function OrgCode({ code }: { code: string | null }) {
  if (!code) {
    return (
      <Box sx={{ fontSize: 12, color: 'var(--c-text-3)', minWidth: 52 }} title="No code set">
        —
      </Box>
    );
  }
  return <Mono sx={{ minWidth: 52 }}>{code}</Mono>;
}
