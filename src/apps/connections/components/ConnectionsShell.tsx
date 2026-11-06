import type { ReactNode } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { AppShell, ThemeScope, ToastProvider, CommandPaletteProvider } from '@shared/ui';
import { SECTIONS } from '../navMeta';

/** ORDER MATTERS: ThemeScope > CommandPaletteProvider > AppShell (see CfHrmsShell). */
export function ConnectionsShell({ children }: { children: ReactNode }) {
  return (
    <ThemeScope appSlug="connections">
      <ToastProvider>
        <CommandPaletteProvider appSlug="connections" sections={SECTIONS} actions={[]} placeholder="Jump to a screen">
          <AppShell appSlug="connections" sections={SECTIONS} brand={{ label: 'Connections', initial: 'C' }} homePath="list">
            {children}
          </AppShell>
        </CommandPaletteProvider>
      </ToastProvider>
    </ThemeScope>
  );
}

/** The platform's landing URLs for this app open the list. */
export function ToList() {
  const { company } = useParams();
  return <Navigate to={`/${company}/connections/list`} replace />;
}
