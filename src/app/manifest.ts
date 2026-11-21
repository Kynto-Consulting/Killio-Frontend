import type { MetadataRoute } from 'next';
import { getTenantConfig } from '@/lib/tenant/server';
import { buildWebManifest } from '@/lib/pwa/manifest';

// Served at /manifest.webmanifest, generated per request from the instance's tenant configuration so
// every deployment installs with its own name, colours and logo.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const tenant = await getTenantConfig();
  return buildWebManifest(tenant) as MetadataRoute.Manifest;
}
