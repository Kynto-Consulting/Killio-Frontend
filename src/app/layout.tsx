import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
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

import { SessionProvider } from '@/components/providers/session-provider';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { Toaster } from '@/components/ui/toaster';
import { PlatformProvider } from '@/components/providers/platform-provider';
import { CallProvider } from '@/components/providers/call-provider';
import { RealtimeProvider } from '@/components/providers/realtime-provider';
import { getPlatform } from '@/lib/platform';

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const platform = await getPlatform();

  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <PlatformProvider platform={platform}>
          <SessionProvider>
            <RealtimeProvider>
              <I18nProvider>
                <CallProvider>
                  {children}
                </CallProvider>
                <Toaster />
              </I18nProvider>
            </RealtimeProvider>
          </SessionProvider>
        </PlatformProvider>
      </body>
    </html>
  );
}
