import { createTheme } from '@mui/material/styles';
import type { AppThemeMode } from '../../theme';

/**
 * fab_erp's own MUI theme — violet accent, Geist/JetBrains Mono, solid
 * surfaces with layered elevation instead of glass (see DESIGN_SYSTEM.md §5).
 *
 * Deliberately NOT based on the shared `createAppTheme` (src/theme.ts) — that
 * theme (and the "color" and "sidebar" CSS vars in src/styles/theme.css) is
 * shared by audio_intelligence and sales_control, which this redesign must
 * not touch. This theme is applied only within a nested ThemeProvider
 * scoped to fab_erp routes (see core/components/AppShell.tsx), and the
 * matching CSS-variable overrides in src/theme/tokens.css are scoped under
 * the [data-app="fab_erp"] attribute selector for the same reason.
 */
export function createFabErpTheme(mode: AppThemeMode) {
  const isDark = mode === 'dark';
  return createTheme({
    palette: {
      mode,
      primary: { main: '#6D28D9', light: '#A570EF', dark: '#5B21B6', contrastText: '#fff' },
      secondary: { main: '#0D9488', light: '#5EEAD4', dark: '#0F766E', contrastText: '#fff' },
      error: { main: '#E11D48', light: '#FCE9EC', dark: '#8A1230', contrastText: '#fff' },
      warning: { main: '#D97706', light: '#FBF0DD', dark: '#7A3E06', contrastText: '#fff' },
      info: { main: '#0284C7', light: '#E2F1FB', dark: '#0A4A75', contrastText: '#fff' },
      success: { main: '#0E9F6E', light: '#E7F6EF', dark: '#075E45', contrastText: '#fff' },
      background: isDark
        ? { default: '#0C0E17', paper: '#161826' }
        : { default: '#F6F7FB', paper: '#FFFFFF' },
      text: isDark
        ? { primary: '#EAECF8', secondary: '#A7ABC6', disabled: '#6E7290' }
        : { primary: '#1A1C2E', secondary: '#5A5E78', disabled: '#8A8EA8' },
      divider: isDark ? 'rgba(255,255,255,.06)' : '#ECEDF5',
    },
    typography: {
      fontFamily: "'Geist', system-ui, -apple-system, 'Segoe UI', sans-serif",
      h1: { fontSize: '22px', fontWeight: 600, lineHeight: 1.3 },
      h2: { fontSize: '18px', fontWeight: 600, lineHeight: 1.3 },
      h3: { fontSize: '16px', fontWeight: 500, lineHeight: 1.4 },
      h4: { fontSize: '15px', fontWeight: 500, lineHeight: 1.4 },
      h5: { fontSize: '14px', fontWeight: 500, lineHeight: 1.4 },
      h6: { fontSize: '13px', fontWeight: 500, lineHeight: 1.4 },
      body1: { fontSize: '14px', lineHeight: 1.5 },
      body2: { fontSize: '13px', lineHeight: 1.5 },
      caption: { fontSize: '12px', lineHeight: 1.4 },
      button: { fontSize: '14px', fontWeight: 500, textTransform: 'none' },
    },
    shape: { borderRadius: 12 },
    components: {
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { textTransform: 'none', borderRadius: '8px', fontWeight: 500, padding: '8px 16px' },
          contained: { boxShadow: 'none', '&:hover': { boxShadow: 'none' } },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            border: `1px solid ${isDark ? 'rgba(255,255,255,.09)' : '#E4E6F0'}`,
            borderRadius: '12px',
            boxShadow: '0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { borderRadius: '12px' },
          elevation1: { boxShadow: '0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)' },
        },
      },
      MuiTextField: {
        defaultProps: { variant: 'outlined' },
        styleOverrides: { root: { '& .MuiOutlinedInput-root': { borderRadius: '8px' } } },
      },
      MuiOutlinedInput: { styleOverrides: { root: { borderRadius: '8px' } } },
      MuiChip: { styleOverrides: { root: { borderRadius: '8px', fontWeight: 500 } } },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: isDark ? '#2C2E40' : '#1A1C2E',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 500,
            padding: '6px 10px',
          },
          arrow: { color: isDark ? '#2C2E40' : '#1A1C2E' },
        },
      },
      MuiTableHead: {
        styleOverrides: {
          root: {
            backgroundColor: isDark ? '#1C1F2E' : '#F7F8FD',
            '& .MuiTableCell-head': {
              fontWeight: 600,
              fontSize: '12px',
              color: isDark ? '#A7ABC6' : '#5A5E78',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            },
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: { '&:hover': { backgroundColor: isDark ? '#1C1F2E' : '#F7F8FD' } },
        },
      },
      MuiDivider: {
        styleOverrides: { root: { borderColor: isDark ? 'rgba(255,255,255,.06)' : '#ECEDF5' } },
      },
      MuiListItemButton: { styleOverrides: { root: { borderRadius: '8px' } } },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 'var(--r-lg)',
            boxShadow: 'var(--e-3)',
            border: `1px solid ${isDark ? 'rgba(255,255,255,.09)' : '#E4E6F0'}`,
          },
        },
      },
      MuiDialogTitle: {
        styleOverrides: {
          root: {
            fontFamily: "'Geist', system-ui, -apple-system, 'Segoe UI', sans-serif",
            fontSize: '20px',
            fontWeight: 600,
            padding: '20px 24px 12px',
          },
        },
      },
      MuiDialogContent: {
        styleOverrides: {
          root: { padding: '4px 24px', fontSize: '14px' },
        },
      },
      MuiDialogActions: {
        styleOverrides: {
          root: { padding: '16px 24px 20px', gap: '8px' },
        },
      },
      MuiBackdrop: {
        styleOverrides: {
          root: {
            backgroundColor: 'var(--glass-bg)',
            backdropFilter: 'var(--glass-blur)',
            WebkitBackdropFilter: 'var(--glass-blur)',
            '@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))': {
              backgroundColor: isDark ? 'rgba(12,14,23,.72)' : 'rgba(26,28,46,.48)',
            },
            '@media (prefers-reduced-transparency: reduce)': {
              backgroundColor: isDark ? 'rgba(12,14,23,.72)' : 'rgba(26,28,46,.48)',
              backdropFilter: 'none',
              WebkitBackdropFilter: 'none',
            },
          },
        },
      },
    },
  });
}
