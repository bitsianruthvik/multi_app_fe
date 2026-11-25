import type { ReactNode } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { AppShell, ThemeScope, ToastProvider, CommandPaletteProvider } from '@shared/ui';
import { ERP_SECTIONS } from '../navMeta';
import { HOME, getLayout } from '../layout';
import { isErpPath } from '../erpScreens';
import { ErpDataProvider, ErpDataStatus } from '../erpData';

/**
 * ORDER MATTERS: ThemeScope > CommandPaletteProvider > AppShell (see CfHrmsShell).
 * Only the dashboard (formerly "ERP dashboard", V15) is on (layout.ts). Its screens share one page (a frame that
 * takes a few seconds to start), so they share one content key: moving between them keeps the page. When the data
 * was loaded, and Refresh, sit once in the top bar.
 */
export function SumangalShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const contentKey = isErpPath(pathname) ? 'erp' : pathname;
  return (
    <ThemeScope appSlug="sumangal_dashboard">
      <ToastProvider>
        <ErpDataProvider>
          <CommandPaletteProvider appSlug="sumangal_dashboard" sections={ERP_SECTIONS} actions={[]} placeholder="Jump to a screen">
            <AppShell appSlug="sumangal_dashboard" sections={ERP_SECTIONS} brand={{ label: 'Sumangal Dashboard', initial: 'S' }} homePath={HOME.erp}
              contentKey={contentKey} topActions={<ErpDataStatus />}>
              {children}
            </AppShell>
          </CommandPaletteProvider>
        </ErpDataProvider>
      </ToastProvider>
    </ThemeScope>
  );
}

/** The platform's landing URLs for this app, and the addresses of the switched-off layouts, open the home screen. */
export function ToHome() {
  const { company } = useParams();
  return <Navigate to={`/${company}/sumangal_dashboard/${HOME[getLayout()]}`} replace />;
}
