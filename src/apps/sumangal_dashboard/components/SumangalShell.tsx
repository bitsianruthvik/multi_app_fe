import type { ReactNode } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { AppShell, ThemeScope, ToastProvider, CommandPaletteProvider } from '@shared/ui';
import { SECTIONS } from '../navMeta';
import { useReport, type Meta } from '../api';
import { MetaContext } from '../filters';

/** ORDER MATTERS: ThemeScope > CommandPaletteProvider > AppShell (see CfHrmsShell). */
export function SumangalShell({ children }: { children: ReactNode }) {
  const { data } = useReport<Meta>('/meta');
  return (
    <ThemeScope appSlug="sumangal_dashboard">
      <ToastProvider>
        <CommandPaletteProvider appSlug="sumangal_dashboard" sections={SECTIONS} actions={[]} placeholder="Jump to a screen">
          <AppShell appSlug="sumangal_dashboard" sections={SECTIONS} brand={{ label: 'Sumangal Dashboard', initial: 'S' }} homePath="what-changed">
            <MetaContext.Provider value={data}>{children}</MetaContext.Provider>
          </AppShell>
        </CommandPaletteProvider>
      </ToastProvider>
    </ThemeScope>
  );
}

/** The platform's landing URLs for this app open What changed. */
export function ToHome() {
  const { company } = useParams();
  return <Navigate to={`/${company}/sumangal_dashboard/what-changed`} replace />;
}
