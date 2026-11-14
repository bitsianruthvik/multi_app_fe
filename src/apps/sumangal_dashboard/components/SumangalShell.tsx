import type { ReactNode } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { AppShell, ThemeScope, ToastProvider, CommandPaletteProvider } from '@shared/ui';
import { FLOW_SECTIONS, INTENT_SECTIONS, SECTIONS } from '../navMeta';
import { getLayout, HOME, setLayout, type Layout } from '../layout';
import { useReport, type Meta } from '../api';
import { MetaContext } from '../filters';

/** ORDER MATTERS: ThemeScope > CommandPaletteProvider > AppShell (see CfHrmsShell). */
export function SumangalShell({ children }: { children: ReactNode }) {
  const { data } = useReport<Meta>('/meta');
  const layout = getLayout(); const sections = layout === 'flow' ? FLOW_SECTIONS : layout === 'intent' ? INTENT_SECTIONS : SECTIONS;
  return (
    <ThemeScope appSlug="sumangal_dashboard">
      <ToastProvider>
        <CommandPaletteProvider appSlug="sumangal_dashboard" sections={sections} actions={[]} placeholder="Jump to a screen">
          <AppShell appSlug="sumangal_dashboard" sections={sections} brand={{ label: layout === 'flow' ? 'Sumangal · by flow' : layout === 'intent' ? 'Sumangal · by intent' : 'Sumangal · by topic', initial: 'S' }} homePath={HOME[layout]}>
            <MetaContext.Provider value={data}>{children}</MetaContext.Provider>
          </AppShell>
        </CommandPaletteProvider>
      </ToastProvider>
    </ThemeScope>
  );
}

/** The platform's landing URLs for this app open the home screen of the layout last used in this browser. */
export function ToHome() {
  const { company } = useParams();
  return <Navigate to={`/${company}/sumangal_dashboard/${HOME[getLayout()]}`} replace />;
}

/** Switches to the other layout and opens its home screen. */
export function SwitchLayout({ to }: { to: Layout }) {
  const { company } = useParams();
  setLayout(to);
  return <Navigate to={`/${company}/sumangal_dashboard/${HOME[to]}`} replace />;
}
