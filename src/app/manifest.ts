import { MetadataRoute } from 'next';
import { getTenantConfig } from '@/lib/tenant/server';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const tenant = await getTenantConfig();
  const isTenant = tenant.mode === 'tenant';

  return {
    name: isTenant ? tenant.brand.name : 'Killio | Restriction-free productivity',
    short_name: isTenant ? tenant.brand.shortName : 'Killio',
    description: isTenant ? tenant.brand.tagline || tenant.brand.name : 'Restriction-free productivity execution platform.',
    start_url: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#000000',
    icons: [
      {
        src: '/favicon.ico',
        sizes: '32x32',
        type: 'image/x-icon',
      },
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/apple-icon.png',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
