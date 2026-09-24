import { useEffect, useMemo, type ReactNode } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { useThemePreference } from '@core/contexts/ThemeContext';
import { createPlatformTheme } from './theme';
import { ToastProvider } from '../Toast';
import { setUiStorageNamespace } from '../storage';
import '../tokens.css';

/**
 * Turns the design system on for an app's routes, and nothing else's.
 *
 * `data-ui="platform"` on <html> is what switches the tokens in tokens.css on;
 * `data-app="<slug>"` is there for an app that needs a stylesheet hook of its
 * own. Both sit on <html>, not on a wrapper, because MUI dialogs, menus and
 * tooltips portal to document.body and would otherwise fall outside the scope.
 *
 * It also nests the MUI theme and mounts the toast stack, so an app gets the
 * whole visual contract from one wrapper. The command palette goes *inside*
 * this (see the kit README) because it needs the app's own nav and actions.
 */
export function ThemeScope({
  appSlug,
  children,
}: {
  /** The app's slug — scopes stored UI preferences and the data-app hook. */
  appSlug: string;
  children: ReactNode;
}) {
  const { resolvedMode } = useThemePreference();
  const theme = useMemo(() => createPlatformTheme(resolvedMode), [resolvedMode]);

  // Before first paint: table preferences read from storage during render, and
  // reading them under the wrong namespace once would show another app's
  // columns for a frame.
  useMemo(() => setUiStorageNamespace(appSlug), [appSlug]);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-ui', 'platform');
    root.setAttribute('data-app', appSlug);
    return () => {
      root.removeAttribute('data-ui');
      root.removeAttribute('data-app');
    };
  }, [appSlug]);

  return (
    <ThemeProvider theme={theme}>
      <ToastProvider>{children}</ToastProvider>
    </ThemeProvider>
  );
}
