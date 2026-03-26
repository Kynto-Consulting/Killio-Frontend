import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Killio',
  description: 'Restriction-free productivity execution platform.',
};

import { SessionProvider } from '@/components/providers/session-provider';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { Toaster } from '@/components/ui/toaster';

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <SessionProvider>
          <I18nProvider>
            {children}
            <Toaster />
          </I18nProvider>
        </SessionProvider>
      </body>
    </html>
);
}
