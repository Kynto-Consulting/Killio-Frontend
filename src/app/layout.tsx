import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Killio',
  description: 'Restriction-free productivity execution platform.',
};

import { SessionProvider } from '@/components/providers/session-provider';
import { Toaster } from '@/components/ui/toaster';

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <SessionProvider>
          {children}
          <Toaster />
        </SessionProvider>
      </body>
    </html>
);
}
