import { createTheme } from '@mui/material/styles';

export type AppThemeMode = 'light' | 'dark';

export function createAppTheme(mode: AppThemeMode) {
  const isDark = mode === 'dark';
  return createTheme({
  palette: {
    mode,
    primary:   { main: '#1d5fa8', light: '#5a9fe0', dark: '#1e4976', contrastText: '#fff' },
    secondary: { main: '#0891b2', light: '#cffafe', dark: '#065f7a', contrastText: '#fff' },
    error:     { main: '#dc2626', light: '#fee2e2', dark: '#991b1b', contrastText: '#fff' },
    warning:   { main: '#d97706', light: '#fef3c7', dark: '#92400e', contrastText: '#fff' },
    info:      { main: '#0284c7', light: '#e0f2fe', dark: '#0c4a6e', contrastText: '#fff' },
    success:   { main: '#059669', light: '#d1fae5', dark: '#065f46', contrastText: '#fff' },
    grey: {
      50: '#f9fafb', 100: '#f3f4f6', 200: '#e5e7eb', 300: '#d1d5db',
      400: '#9ca3af', 500: '#6b7280', 600: '#4b5563', 700: '#374151',
      800: '#1f2937', 900: '#111827',
    },
    background: isDark
      ? { default: '#071021', paper: '#0d1f35' }
      : { default: '#f0f4f8', paper: '#ffffff' },
    text: isDark
      ? { primary: '#e6eef8', secondary: '#9aa6b2', disabled: '#4a6a8a' }
      : { primary: '#0f1724', secondary: '#374151', disabled: '#9ca3af' },
    divider: isDark ? '#1e3a5f' : '#e2e8f0',
  },
  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    h1: { fontSize: '34px', fontWeight: 700, lineHeight: 1.2 },
    h2: { fontSize: '27px', fontWeight: 700, lineHeight: 1.2 },
    h3: { fontSize: '22px', fontWeight: 600, lineHeight: 1.3 },
    h4: { fontSize: '19px', fontWeight: 600, lineHeight: 1.3 },
    h5: { fontSize: '17px', fontWeight: 600, lineHeight: 1.4 },
    h6: { fontSize: '15px', fontWeight: 600, lineHeight: 1.4 },
    body1: { fontSize: '15px', lineHeight: 1.5 },
    body2: { fontSize: '13px', lineHeight: 1.5 },
    caption: { fontSize: '11px', lineHeight: 1.4 },
    button: { fontSize: '14px', fontWeight: 500, textTransform: 'none' },
  },
  shape: {
    borderRadius: 10,
  },
  components: {
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: '8px',
          fontWeight: 500,
          padding: '8px 18px',
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: 'none',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: '1px solid #e2e8f0',
          borderRadius: '14px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: '14px',
        },
        elevation1: {
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
      },
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: '8px',
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: '8px',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: '6px',
          fontWeight: 500,
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: '#0f1724',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: 500,
          padding: '6px 10px',
        },
        arrow: {
          color: '#0f1724',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#0c1a2e',
          border: 'none',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#ffffff',
          color: '#0f1724',
          boxShadow: '0 1px 0 #e2e8f0',
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          backgroundColor: '#f8fafc',
          '& .MuiTableCell-head': {
            fontWeight: 600,
            fontSize: '12px',
            color: '#6b7280',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          },
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: '#f9fafb',
          },
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: '#e2e8f0',
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: '8px',
        },
      },
    },
  },    // closes components
  });   // closes createTheme({
}

// Default light theme (used as fallback / for backward compat)
const theme = createAppTheme('light');
export default theme;
