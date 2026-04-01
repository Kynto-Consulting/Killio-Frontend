import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Killio',
  description: 'Restriction-free productivity execution platform.',
};

import { SessionProvider } from '@/components/providers/session-provider';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { Toaster } from '@/components/ui/toaster';
import { PlatformProvider } from '@/components/providers/platform-provider';
import { getPlatform } from '@/lib/platform';

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const platform = await getPlatform();

  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <PlatformProvider platform={platform}>
          <SessionProvider>
            <I18nProvider>
              {children}
              <Toaster />
            </I18nProvider>
          </SessionProvider>
        </PlatformProvider>
      </body>
    </html>
  );
}
