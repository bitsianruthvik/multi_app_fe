import React from 'react';
import { useMatch } from 'react-router-dom';
import UserLayout from '@core/layouts/UserLayout';

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

  const isGlassPage = onCompanyLanding || onAppSelector || onLoginPage;

  if (isGlassPage || isAdminRoute || onAudioFlow || onSalesFlow) return <>{children}</>;
  return <UserLayout>{children}</UserLayout>;
}
