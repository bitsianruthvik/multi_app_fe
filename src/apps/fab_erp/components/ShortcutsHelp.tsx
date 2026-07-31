import { Box, Dialog, DialogContent, DialogTitle } from '@mui/material';

/**
 * The `?` shortcuts overlay (DESIGN_SYSTEM.md §11, the keyboard contract).
 *
 * This is also what the sidebar help button now opens — it previously ran
 * `console.log('Help clicked')`, which is worse than having no button at all,
 * because it advertises help and then silently does nothing.
 *
 * Keep this table in sync with the actual bindings. A shortcuts sheet that
 * lists a key that doesn't work is a bug, not documentation.
 */

const GROUPS: { title: string; rows: [string, string][] }[] = [
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
      ['/', 'Focus the filter box'],
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

export function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Keyboard shortcuts</DialogTitle>
      <DialogContent sx={{ pb: 3 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {GROUPS.map((g) => (
            <Box key={g.title}>
              <Box
                sx={{
                  fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase',
                  color: 'var(--c-text-3)', mb: 1,
                }}
              >
                {g.title}
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {g.rows.map(([keys, desc]) => (
                  <Box key={keys} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box
                      sx={{
                        fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--c-text-2)',
                        background: 'var(--c-surface-2)', border: '1px solid var(--c-border)',
                        borderRadius: 'var(--r-sm)', px: 0.875, py: 0.25,
                        minWidth: 104, textAlign: 'center', flexShrink: 0,
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

