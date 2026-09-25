import React from 'react';
import { useMatch } from 'react-router-dom';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import UserLayout from '@core/layouts/UserLayout';
import { useThemePreference } from '@core/contexts/ThemeContext';
import { createFabErpTheme } from '@apps/fab_erp/theme';
import { ToastProvider } from '@apps/fab_erp/components/Toast';
import { CommandPaletteProvider } from '@apps/fab_erp/components/CommandPalette';
import { FabErpShell } from '@apps/fab_erp/components/nav/FabErpShell';
import { CfErpThemeScope } from '@apps/cf_erp/components/shell/CfErpThemeScope';
import { CfErpShell } from '@apps/cf_erp/components/shell/CfErpShell';
import { ThemeScope } from '@shared/ui';

/**
 * Scopes the fab_erp redesign (violet accent, Geist, solid-elevation surfaces)
 * to fab_erp routes only — `data-app="fab_erp"` activates the CSS-variable
 * overrides in src/theme/tokens.css, and the nested ThemeProvider overrides
 * MUI's palette/typography (which aren't CSS vars) for everything rendered
 * inside it. audio_intelligence and sales_control are untouched.
 *
 * data-app is set on <html> (not a wrapper element) because MUI's
 * Drawer/Menu/Dialog/Tooltip all portal their content to document.body,
 * which would otherwise sit outside a wrapper's DOM subtree and never see
 * the CSS-variable overrides. ThemeContext.tsx already manages a
 * data-theme attribute on <html> for light/dark mode — tokens.css's
 * [data-app="fab_erp"][data-theme="dark"] rule reuses that same attribute
 * rather than introducing a second, redundant one.
 */
function FabErpThemeScope({ children }: { children: React.ReactNode }) {
  const { resolvedMode } = useThemePreference();
  const fabErpTheme = React.useMemo(() => createFabErpTheme(resolvedMode), [resolvedMode]);

  React.useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-app', 'fab_erp');
    return () => { root.removeAttribute('data-app'); };
  }, []);

  return (
    <MuiThemeProvider theme={fabErpTheme}>
      <ToastProvider>
        {/* Mounted here, above the shell, so ⌘K works on every fab_erp route
            including the admin ones that don't get FabErpShell. */}
        <CommandPaletteProvider>{children}</CommandPaletteProvider>
      </ToastProvider>
    </MuiThemeProvider>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const isAdminRoute      = !!useMatch('/:company/:app/admin/*');
  const onLogin           = !!useMatch('/:company/:app/login');
  const onRegister        = !!useMatch('/:company/:app/register');
  const onForgotPassword  = !!useMatch('/:company/:app/forgot-password');
  const onLoginPage       = onLogin || onRegister || onForgotPassword;
  const onCompanyLanding  = !!useMatch({ path: '/:company', end: true });
  const onAppSelector     = !!useMatch('/:company/apps');
  const onAudioFlow        = !!useMatch('/:company/audio_intelligence/flow/*');
  const onSalesFlow        = !!useMatch('/:company/sales_control/flow/*');
  const onFabErp           = !!useMatch('/:company/fab_erp/*');
  const onCfErp            = !!useMatch('/:company/cf_erp/*');
  const onCfHrms           = !!useMatch('/:company/cf_hrms/*');

  const isGlassPage = onCompanyLanding || onAppSelector || onLoginPage;

  if (isGlassPage || onAudioFlow || onSalesFlow) return <>{children}</>;

  // Admin routes (AdminLayout) render their own shell — they don't get UserLayout —
  // but an app's admin pages should still pick up that app's theme and tokens.
  // An app missing from this list does not fall back to something reasonable: it
  // renders on raw MUI defaults, which is a different product sitting under the
  // same company's name. cf_hrms shipped that way and it was the first thing the
  // client noticed.
  if (isAdminRoute) {
    if (onFabErp) return <FabErpThemeScope>{children}</FabErpThemeScope>;
    if (onCfErp) return <CfErpThemeScope>{children}</CfErpThemeScope>;
    if (onCfHrms) return <ThemeScope appSlug="cf_hrms">{children}</ThemeScope>;
    return <>{children}</>;
  }

  // cf_erp follows the same design rules with its own shell and theme scope
  // (apps/cf_erp/components/shell); the tokens in src/theme/tokens.css are shared.
  if (onCfErp) {
    return (
      <CfErpThemeScope>
        <CfErpShell>{children}</CfErpShell>
      </CfErpThemeScope>
    );
  }

  // cf_hrms renders its own shell from @shared/ui (the platform kit), which
  // carries its own ThemeScope. Without this branch it falls through to
  // UserLayout and gets TWO shells: a 240px sidebar rail with nothing in it
  // (cf_hrms/index.ts returns an empty nav by design) sitting beside its real
  // top nav. Every app with its own shell needs an entry here.
  if (onCfHrms) return <>{children}</>;

  // fab_erp uses its own two-row top-nav shell instead of UserLayout's sidebar
  // rail (FAB_ERP_UX_ELEVATION_PLAN.md §2.1). UserLayout and Sidebar.tsx are
  // shared with audio_intelligence and sales_control, so they are left alone —
  // fab_erp simply never renders them.
  if (onFabErp) {
    return (
      <FabErpThemeScope>
        <FabErpShell>{children}</FabErpShell>
      </FabErpThemeScope>
    );
  }

  return <UserLayout>{children}</UserLayout>;
}
