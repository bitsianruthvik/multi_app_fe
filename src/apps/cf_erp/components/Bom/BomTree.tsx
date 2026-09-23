import { useState, type ReactNode } from 'react';
import { Box, IconButton, Menu, MenuItem, Tooltip, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import MoreVertRounded from '@mui/icons-material/MoreVertRounded';
import { useCompanySlug } from '../../hooks/useLoad';
import { appPath } from '../../navMeta';
import { recordPath } from '../../lib/paths';
import { KindChip, Mono, StatusBadge, WarnBadge } from '../ui';
import { FlowTag } from '../FlowTag';
import type { BomRow } from './bomModel';

/** What a row offers, in the order a menu shows it. */
export type BomAction = 'add' | 'choose' | 'change' | 'remove';

const ACTION_LABEL: Record<BomAction, string> = {
  add: 'Add a part…',
  choose: 'Choose the item…',
  change: 'Change quantity, role or flow…',
  remove: 'Remove…',
};

// Item · per parent · in total · status · the row's menu.
const COLUMNS = 'minmax(0, 1fr) 90px 90px 110px 44px';
const ROW_SX = { display: 'grid', gridTemplateColumns: COLUMNS, gap: 1, px: 1.5 } as const;

/** One step of indentation, with the hairline that shows which parent a row belongs to (§4.7). */
function Guides({ depth }: { depth: number }) {
  return (
    <>
      {Array.from({ length: depth }, (_, i) => (
        <Box key={i} aria-hidden sx={{ width: 18, flexShrink: 0, alignSelf: 'stretch', borderLeft: '1px solid var(--c-divider)' }} />
      ))}
    </>
  );
}

/**
 * The BOM, drawn the same way everywhere it appears (DESIGN_SYSTEM.md §4.7):
 * indented rows, each with its quantity per parent and its total. The root is a
 * row like the rest — it sits at its own depth and carries its own quantity —
 * so a BOM reads as one list rather than a heading with a table under it.
 * What a row may do is decided by the caller, which knows whose BOM it is.
 */
export function BomTree({ rows, label, actionsFor, onToggle, onAction, footer }: {
  rows: BomRow[];
  /** Names the tree for screen readers. */
  label: string;
  actionsFor: (row: BomRow) => BomAction[];
  onToggle: (key: string) => void;
  onAction: (action: BomAction, row: BomRow) => void;
  /** Shown under the last row — the empty state when nothing hangs below the root. */
  footer?: ReactNode;
}) {
  const company = useCompanySlug();
  const [menu, setMenu] = useState<{ anchor: HTMLElement; row: BomRow } | null>(null);
  const menuActions = menu ? actionsFor(menu.row) : [];

  return (
    <Box role="tree" aria-label={label} sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', background: 'var(--c-surface)', overflowX: 'auto' }}>
      <Box sx={{ minWidth: 720 }}>
        <Box sx={{ ...ROW_SX, py: 1, borderBottom: '1px solid var(--c-divider)', color: 'var(--c-text-3)', fontSize: 12, fontWeight: 600 }}>
          <span>Item</span>
          <Box sx={{ textAlign: 'right' }}>Per parent</Box>
          <Box sx={{ textAlign: 'right' }} title="Quantity per parent, multiplied by everything above it.">In total</Box>
          <span>Status</span>
          <span />
        </Box>
        {rows.map((row) => {
          const n = row.node;
          const actions = actionsFor(row);
          return (
            <Box key={n.key} role="treeitem" aria-level={n.depth + 1} aria-expanded={row.hasChildren ? row.open : undefined}
              sx={{ ...ROW_SX, py: 0.75, alignItems: 'center', borderBottom: '1px solid var(--c-divider)', '&:hover': { background: 'var(--c-surface-2)' }, '&:last-of-type': { borderBottom: 0 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                <Guides depth={n.depth} />
                {row.hasChildren ? (
                  <IconButton size="small" aria-label={row.open ? `Collapse ${n.code ?? n.name}` : `Expand ${n.code ?? n.name}`} onClick={() => onToggle(n.key)} sx={{ p: 0.25, flexShrink: 0 }}>
                    {row.open ? <ExpandMoreRounded fontSize="small" /> : <ChevronRightRounded fontSize="small" />}
                  </IconButton>
                ) : <Box sx={{ width: 26, flexShrink: 0 }} />}
                <Box sx={{ minWidth: 0 }}>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                    {n.lineNo != null && <Mono muted>{n.lineNo}</Mono>}
                    <Mono><Link to={appPath(company, recordPath(n.kind, n.id))}>{n.code ?? '—'}</Link></Mono>
                    <KindChip kind={n.kind} />
                    <FlowTag flow={n.flow} />
                    {n.selection && !n.resolved && <WarnBadge label="Choose item" title={`Choose a catalog item for ${n.selection.code ?? n.selection.name}.`} />}
                  </Box>
                  <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {n.name}{n.role ? ` · ${n.role}` : ''}{n.selection && n.resolved ? ` · for ${n.selection.code ?? n.selection.name}` : ''}
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ textAlign: 'right' }}><Mono>×{n.quantity}</Mono></Box>
              <Box sx={{ textAlign: 'right' }}><Mono>{n.total}</Mono>{n.uom && <Mono muted> {n.uom}</Mono>}</Box>
              <Box sx={{ minWidth: 0 }}><StatusBadge status={n.status} /></Box>
              <Box>
                {actions.length > 0 && (
                  <Tooltip title="Actions">
                    <IconButton size="small" aria-label={`Actions for ${n.code ?? n.name}`} onClick={(e) => setMenu({ anchor: e.currentTarget, row })}><MoreVertRounded fontSize="small" /></IconButton>
                  </Tooltip>
                )}
              </Box>
            </Box>
          );
        })}
        {footer}
      </Box>

      <Menu anchorEl={menu?.anchor} open={!!menu} onClose={() => setMenu(null)}>
        {menuActions.map((action) => (
          <MenuItem key={action} onClick={() => { if (menu) onAction(action, menu.row); setMenu(null); }}
            sx={action === 'remove' ? { color: 'var(--c-danger-700)' } : undefined}>
            {ACTION_LABEL[action]}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
}
