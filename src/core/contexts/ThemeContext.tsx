/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext, useContext, useState, useEffect, useMemo, useCallback,
} from 'react';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { createAppTheme, type AppThemeMode } from '../../theme';

export type ThemePreference = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  resolvedMode: AppThemeMode;
}

const ThemeContext = createContext<ThemeContextValue>({
  preference: 'system',
  setPreference: () => {},
  resolvedMode: 'light',
});

export function useThemePreference() {
  return useContext(ThemeContext);
}

const LS_KEY = 'themePreference';

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    const saved = localStorage.getItem(LS_KEY) as ThemePreference | null;
    return saved ?? 'system';
  });

  const systemPrefersDark = useMediaQuery('(prefers-color-scheme: dark)', { noSsr: true });

  const resolvedMode: AppThemeMode = useMemo(() => {
    if (preference === 'dark') return 'dark';
    if (preference === 'light') return 'light';
    return systemPrefersDark ? 'dark' : 'light';
  }, [preference, systemPrefersDark]);

  // Keep the HTML data-theme attribute in sync so CSS variables react too
  useEffect(() => {
    const root = document.documentElement;
    if (preference === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', resolvedMode);
    }
  }, [preference, resolvedMode]);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    localStorage.setItem(LS_KEY, p);
  }, []);

  const muiTheme = useMemo(() => createAppTheme(resolvedMode), [resolvedMode]);

  return (
    <ThemeContext.Provider value={{ preference, setPreference, resolvedMode }}>
      <MuiThemeProvider theme={muiTheme}>
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
}
