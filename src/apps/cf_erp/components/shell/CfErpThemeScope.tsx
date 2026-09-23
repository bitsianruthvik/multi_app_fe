import { useEffect, useMemo, type ReactNode } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { useThemePreference } from '@core/contexts/ThemeContext';
import { createCfErpTheme } from '../../theme';
import { ToastProvider } from '../Toast';
import { CommandPaletteProvider } from '../CommandPalette';

/**
 * Scopes the design system to cf_erp routes: `data-app="cf_erp"` on <html>
 * switches on the shared tokens (src/theme/tokens.css), and the nested MUI
 * theme covers what MUI does not read from CSS variables. It sits on <html>,
 * not a wrapper, because MUI dialogs and menus portal to document.body.
 */
export function CfErpThemeScope({ children }: { children: ReactNode }) {
  const { resolvedMode } = useThemePreference();
  const theme = useMemo(() => createCfErpTheme(resolvedMode), [resolvedMode]);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-app', 'cf_erp');
    return () => { root.removeAttribute('data-app'); };
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <ToastProvider>
        {/* Above the shell, so ⌘K works on every cf_erp route (as in fab_erp). */}
        <CommandPaletteProvider>{children}</CommandPaletteProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
