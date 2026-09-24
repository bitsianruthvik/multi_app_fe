import { Box, Dialog, DialogContent, DialogTitle } from '@mui/material';
import { DialogCloseButton } from './FormDialog';

/**
 * The `?` shortcuts overlay — the keyboard contract, written down.
 *
 * Keep it in step with the real bindings. A shortcuts sheet that lists a key
 * which doesn't work is a bug, not documentation — which is why the default
 * groups only cover bindings the kit itself provides (⌘K, `?`, Esc, row
 * navigation, the palette, the form-dialog Enter rule). An app adds its own
 * through `extraGroups`.
 */
export interface ShortcutGroup {
  title: string;
  rows: [keys: string, description: string][];
}

const DEFAULT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Anywhere',
    rows: [
      ['⌘K  /  Ctrl K', 'Open the command palette'],
      ['?', 'Show this sheet'],
      ['Esc', 'Close a dialog, sheet or the palette'],
    ],
  },
  {
    title: 'Lists and tables',
    rows: [
      ['↑  ↓', 'Move between rows'],
      ['Enter', 'Open the highlighted row'],
      ['Esc', 'Clear the search box'],
    ],
  },
  {
    title: 'Forms',
    rows: [
      ['Enter', 'Save the dialog you are in'],
      ['Shift Enter', 'A new line in a notes field'],
    ],
  },
  {
    title: 'Command palette',
    rows: [
      ['↑  ↓', 'Move between results'],
      ['Enter', 'Go to the highlighted result'],
    ],
  },
];

export function ShortcutsHelp({
  open,
  onClose,
  extraGroups = [],
}: {
  open: boolean;
  onClose: () => void;
  /** App-specific bindings, appended after the kit's own. */
  extraGroups?: ShortcutGroup[];
}) {
  const groups = [...DEFAULT_GROUPS, ...extraGroups];
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogCloseButton absolute onClose={onClose} />
      <DialogTitle>Keyboard shortcuts</DialogTitle>
      <DialogContent sx={{ pb: 3 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {groups.map((g) => (
            <Box key={g.title}>
              <Box
                sx={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                  color: 'var(--c-text-3)',
                  mb: 1,
                }}
              >
                {g.title}
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {g.rows.map(([keys, desc]) => (
                  <Box key={keys + desc} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box
                      sx={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11.5,
                        color: 'var(--c-text-2)',
                        background: 'var(--c-surface-2)',
                        border: '1px solid var(--c-border)',
                        borderRadius: 'var(--r-sm)',
                        px: 0.875,
                        py: 0.25,
                        minWidth: 104,
                        textAlign: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {keys}
                    </Box>
                    <Box sx={{ fontSize: 13.5, color: 'var(--c-text)' }}>{desc}</Box>
                  </Box>
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      </DialogContent>
    </Dialog>
  );
}
