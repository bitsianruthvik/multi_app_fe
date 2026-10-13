import { useState, type ReactNode } from 'react';
import {
  Box,
  Button,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import EditOutlined from '@mui/icons-material/EditOutlined';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import HighlightOffRounded from '@mui/icons-material/HighlightOffRounded';
import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined';
import EventBusyOutlined from '@mui/icons-material/EventBusyOutlined';
import BlockRounded from '@mui/icons-material/BlockRounded';
import MoreVertRounded from '@mui/icons-material/MoreVertRounded';

export interface RowAction {
  key: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  /** A business reason the action cannot be done now. Shown with the disabled action. */
  disabledReason?: string | null;
}

/** The glyph for the screen's own word for removing. */
function removeIcon(label: string): ReactNode {
  const word = label.trim().toLowerCase();
  if (word.startsWith('close')) return <HighlightOffRounded fontSize="small" />;
  if (word.startsWith('retire')) return <ArchiveOutlined fontSize="small" />;
  if (word.startsWith('end')) return <EventBusyOutlined fontSize="small" />;
  if (word.startsWith('disable')) return <BlockRounded fontSize="small" />;
  return <DeleteOutlineRounded fontSize="small" />;
}

/**
 * The actions at the end of a list row (§13.1): Edit and Remove — or the
 * screen's own word — the same glyphs in the same order on every screen.
 *
 * Callers pass only what the person has a right to; a `disabledReason` is for a
 * business reason ("still has 3 positions"), never for a missing right.
 */
export function RowActions({
  name,
  onEdit,
  onRemove,
  removeLabel = 'Remove',
  editLabel = 'Edit',
  more,
  editDisabledReason,
  removeDisabledReason,
}: {
  /** What the row is, for aria-labels: "Printing". */
  name: string;
  onEdit?: () => void;
  onRemove?: () => void;
  /** The screen's own word where removing is not what happens: "Close", "Retire", "End", "Disable". */
  removeLabel?: string;
  editLabel?: string;
  /** Further actions, shown before Edit (e.g. "Add under this"). */
  more?: RowAction[];
  /** A business reason Edit cannot be done now. */
  editDisabledReason?: string | null;
  /** A business reason Remove cannot be done now. */
  removeDisabledReason?: string | null;
}) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true });
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const actions: RowAction[] = [...(more ?? [])];
  if (onEdit) {
    actions.push({
      key: '__edit',
      label: editLabel,
      icon: <EditOutlined fontSize="small" />,
      onClick: onEdit,
      disabledReason: editDisabledReason,
    });
  }
  if (onRemove) {
    actions.push({
      key: '__remove',
      label: removeLabel,
      icon: removeIcon(removeLabel),
      onClick: onRemove,
      danger: true,
      disabledReason: removeDisabledReason,
    });
  }
  if (actions.length === 0) return null;

  const collapsed = actions.length > (phone ? 2 : 3);

  return (
    <Box
      // A row is often clickable; its actions must not also open the row.
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, flexShrink: 0 }}
    >
      {collapsed ? (
        <>
          <Tooltip title="Actions">
            <IconButton
              size="small"
              aria-label={`Actions for ${name}`}
              aria-haspopup="menu"
              aria-expanded={anchor ? true : undefined}
              onClick={(e) => setAnchor(e.currentTarget)}
              sx={{ color: 'var(--c-text-2)' }}
            >
              <MoreVertRounded fontSize="small" />
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={anchor}
            open={!!anchor}
            onClose={() => setAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            {actions.map((a) => (
              <MenuItem
                key={a.key}
                disabled={!!a.disabledReason}
                onClick={() => {
                  setAnchor(null);
                  a.onClick();
                }}
                sx={{
                  maxWidth: 320,
                  whiteSpace: 'normal',
                  color: a.danger ? 'var(--c-danger-600)' : 'var(--c-text)',
                  // A disabled line still has to be read: it carries the reason.
                  '&.Mui-disabled': { opacity: 0.75 },
                }}
              >
                {a.icon && (
                  <ListItemIcon sx={{ color: 'inherit', minWidth: 32 }}>{a.icon}</ListItemIcon>
                )}
                <ListItemText
                  primary={a.label}
                  secondary={a.disabledReason || undefined}
                  slotProps={{
                    primary: { sx: { fontSize: 14 } },
                    secondary: { sx: { fontSize: 12, color: 'var(--c-text-2)' } },
                  }}
                  sx={a.icon ? undefined : { pl: 4 }}
                />
              </MenuItem>
            ))}
          </Menu>
        </>
      ) : (
        actions.map((a) => {
          const disabled = !!a.disabledReason;
          const aria = a.disabledReason
            ? `${a.label} ${name}. ${a.disabledReason}`
            : `${a.label} ${name}`;
          const colour = a.danger ? 'var(--c-danger-600)' : 'var(--c-primary-700)';
          return (
            <Tooltip key={a.key} title={a.disabledReason || a.label}>
              {/* span keeps the tooltip alive while the button is disabled */}
              <span style={{ display: 'inline-flex' }}>
                {a.icon ? (
                  <IconButton
                    size="small"
                    aria-label={aria}
                    disabled={disabled}
                    onClick={a.onClick}
                    sx={{ color: 'var(--c-text-2)', '&:hover': { color: colour } }}
                  >
                    {a.icon}
                  </IconButton>
                ) : (
                  <Button
                    size="small"
                    aria-label={aria}
                    disabled={disabled}
                    onClick={a.onClick}
                    sx={{ minWidth: 0, px: 1, whiteSpace: 'nowrap', color: a.danger ? colour : undefined }}
                  >
                    {a.label}
                  </Button>
                )}
              </span>
            </Tooltip>
          );
        })
      )}
    </Box>
  );
}
