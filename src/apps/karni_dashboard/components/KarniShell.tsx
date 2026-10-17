import type { ReactNode } from 'react';
import { AppShell, ThemeScope, ToastProvider, CommandPaletteProvider } from '@shared/ui';
import { SECTIONS } from '../navMeta';

/**
 * The karni_dashboard shell. Everything structural is the platform kit
 * (@shared/ui, DESIGN_SYSTEM.md) — the same design rules as cf_erp / cf_hrms.
 * ORDER MATTERS: ThemeScope > CommandPaletteProvider > AppShell (see CfHrmsShell).
 */
export function KarniShell({ children }: { children: ReactNode }) {
  return (
    <ThemeScope appSlug="karni_dashboard">
      <ToastProvider>
        <CommandPaletteProvider
          appSlug="karni_dashboard"
          sections={SECTIONS}
          actions={[]}
          placeholder="Jump to a report"
        >
          <AppShell
            appSlug="karni_dashboard"
            sections={SECTIONS}
            brand={{ label: 'Karni Dashboard', initial: 'K' }}
            homePath="overview"
          >
            {children}
          </AppShell>
        </CommandPaletteProvider>
      </ToastProvider>
    </ThemeScope>
  );
}

export default KarniShell;
