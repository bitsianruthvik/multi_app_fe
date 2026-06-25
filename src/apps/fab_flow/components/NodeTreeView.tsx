import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box, Chip, Collapse, IconButton, Tooltip, Typography,
} from '@mui/material';
import ExpandMoreIcon  from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import AccountTreeIcon  from '@mui/icons-material/AccountTree';

export interface TreeNode {
  id: number;
  nodeCode: string;
  displayName: string;
  levelName: string;
  quantity: number;
  unit: string;
  children: TreeNode[];
}

interface Props {
  nodes: TreeNode[];
  depth?: number;
}

function NodeRow({ node, depth = 0 }: { node: TreeNode; depth: number }) {
  const { company, planId } = useParams<{ company: string; planId: string }>();
  const navigate            = useNavigate();
  const [open, setOpen]     = useState(depth < 2);
  const hasChildren         = node.children.length > 0;

  return (
    <Box>
      <Box
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.5,
          pl: depth * 3 + 1, py: 0.4, pr: 1,
          borderRadius: 1, cursor: 'pointer',
          '&:hover': { bgcolor: 'action.hover' },
        }}
        onClick={() => navigate(`/${company}/fab_flow/plans/${planId}/nodes/${node.id}`)}
      >
        <Box sx={{ width: 24, flexShrink: 0 }}>
          {hasChildren ? (
            <IconButton
              size="small" sx={{ p: 0 }}
              onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
            >
              {open ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
            </IconButton>
          ) : (
            <Box sx={{ width: 24, display: 'inline-flex', justifyContent: 'center' }}>
              <AccountTreeIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
            </Box>
          )}
        </Box>

        <Tooltip title={node.displayName}>
          <Typography
            variant="body2"
            sx={{ fontWeight: depth === 0 ? 700 : 400, minWidth: 80, flexShrink: 0 }}
          >
            {node.nodeCode}
          </Typography>
        </Tooltip>

        <Typography variant="body2" color="text.secondary" noWrap sx={{ flex: 1 }}>
          {node.displayName}
        </Typography>

        {node.levelName && (
          <Chip label={node.levelName} size="small" variant="outlined" sx={{ ml: 1, fontSize: 10 }} />
        )}
        <Typography variant="caption" color="text.secondary" sx={{ ml: 1, whiteSpace: 'nowrap' }}>
          {node.quantity} {node.unit}
        </Typography>
      </Box>

      {hasChildren && (
        <Collapse in={open}>
          <Box sx={{ borderLeft: '2px solid', borderColor: 'divider', ml: depth * 3 + 2.5 }}>
            {node.children.map((child) => (
              <NodeRow key={child.id} node={child} depth={depth + 1} />
            ))}
          </Box>
        </Collapse>
      )}
    </Box>
  );
}

export function buildTree(
  nodes: Omit<TreeNode, 'children'>[],
  relationships: { parentNodeId: number; childNodeId: number; isPrimary: number }[],
): TreeNode[] {
  const map = new Map<number, TreeNode>();
  nodes.forEach((n) => map.set(n.id, { ...n, children: [] }));

  const childIds = new Set<number>();
  relationships
    .filter((r) => r.isPrimary)
    .forEach((r) => {
      const parent = map.get(r.parentNodeId);
      const child  = map.get(r.childNodeId);
      if (parent && child) {
        parent.children.push(child);
        childIds.add(r.childNodeId);
      }
    });

  // Nodes without a primary parent are root nodes
  return Array.from(map.values()).filter((n) => !childIds.has(n.id));
}

export default function NodeTreeView({ nodes }: Props) {
  if (!nodes.length) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography color="text.secondary">No nodes in this plan yet.</Typography>
      </Box>
    );
  }
  return (
    <Box sx={{ fontFamily: 'monospace' }}>
      {nodes.map((n) => <NodeRow key={n.id} node={n} depth={0} />)}
    </Box>
  );
}
