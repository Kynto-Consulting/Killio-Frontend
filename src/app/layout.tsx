import type { Metadata } from 'next';
import './globals.css';
import { getTenantConfig } from '@/lib/tenant/server';
import { buildTenantThemeCss, initialHtmlClass, SYSTEM_THEME_SCRIPT, tenantFontPreloads } from '@/lib/tenant/theme';
import { TENANT_RESTORE_SCRIPT } from '@/lib/tenant/persist';
import { TenantProvider } from '@/components/providers/tenant-provider';
import { PoweredByBadge } from '@/components/marketing/powered-by-badge';

const baseMetadata: Metadata = {
  title: 'Killio',
  description: 'Restriction-free productivity execution platform.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Killio',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

// Public mode keeps the Killio metadata; tenant mode uses the customer's name, tagline and favicon.
export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getTenantConfig();
  if (tenant.mode !== 'tenant') return baseMetadata;
  return {
    ...baseMetadata,
    title: tenant.brand.name,
    description: tenant.brand.tagline || baseMetadata.description,
    appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: tenant.brand.shortName },
    ...(tenant.brand.faviconUrl ? { icons: { icon: tenant.brand.faviconUrl } } : {}),
  };
}

import { SessionProvider } from '@/components/providers/session-provider';
import { PasswordChangeGuard } from '@/components/auth/password-change-guard';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { Toaster } from '@/components/ui/toaster';
import { OfflineIndicator } from '@/components/ui/offline-indicator';
import { SwUpdater } from '@/components/ui/sw-updater';
import { ActiveListeningHost } from '@/components/app-shell/active-listening-host';
import { AppNotificationsHost } from '@/components/app-shell/app-notifications-host';
import { PlatformProvider } from '@/components/providers/platform-provider';
import { CallProvider } from '@/components/providers/call-provider';
import { RealtimeProvider } from '@/components/providers/realtime-provider';
import { getPlatform } from '@/lib/platform';

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const platform = await getPlatform();
  const tenant = await getTenantConfig();
  const themeCss = buildTenantThemeCss(tenant);

  return (
    <html lang="en" className={initialHtmlClass(tenant)} suppressHydrationWarning>
      <head>
        {tenantFontPreloads(tenant).map((font) => (
          <link key={font.href} rel="preload" as="font" type={font.type} href={font.href} crossOrigin="anonymous" />
        ))}
        {themeCss ? <style id="tenant-theme" dangerouslySetInnerHTML={{ __html: themeCss }} /> : null}
        {tenant.degraded ? <script dangerouslySetInnerHTML={{ __html: TENANT_RESTORE_SCRIPT }} /> : null}
        {tenant.mode === 'tenant' && tenant.theme.defaultMode === 'system' ? (
          <script dangerouslySetInnerHTML={{ __html: SYSTEM_THEME_SCRIPT }} />
        ) : null}
      </head>
      <body className="antialiased">
        <TenantProvider value={tenant} degraded={tenant.degraded === true}>
          <PlatformProvider platform={platform}>
            <SessionProvider>
              <RealtimeProvider>
                <I18nProvider>
                  <PasswordChangeGuard />
                  <CallProvider>
                    {children}
                  </CallProvider>
                  <Toaster />
                  <OfflineIndicator />
                  <SwUpdater />
                  <ActiveListeningHost />
                  <AppNotificationsHost />
                  <PoweredByBadge />
                </I18nProvider>
              </RealtimeProvider>
            </SessionProvider>
          </PlatformProvider>
        </TenantProvider>
      </body>
    </html>
  );
}
