import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Killio',
  description: 'Restriction-free productivity execution platform.',
};

import { SessionProvider } from '@/components/providers/session-provider';

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
