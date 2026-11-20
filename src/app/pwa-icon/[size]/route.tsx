import { ImageResponse } from 'next/og';
import { getTenantConfig } from '@/lib/tenant/server';
import { iconVariantSpec, isIconVariant, manifestColors, tenantIconSource } from '@/lib/pwa/manifest';

export const runtime = 'nodejs';

const SUPPORTED = new Set(['image/png', 'image/jpeg', 'image/svg+xml']);
const CACHE = 'public, max-age=3600, stale-while-revalidate=86400';

function staticFallback(request: Request, size: number): Response {
  const file = size >= 512 ? '/icon-512.png' : '/icon-192.png';
  return Response.redirect(new URL(file, request.url), 307);
}

/**
 * The installed app's icon: the tenant's logo centred on its background colour, in the three sizes the
 * manifest asks for (192, 512 and a 512 "maskable" with the 80% safe zone). Anything that goes wrong
 * (no logo, unreachable logo, an image format the renderer can not draw) falls back to Killio's own icons.
 */
export async function GET(request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: variant } = await params;
  if (!isIconVariant(variant)) return new Response('Not found', { status: 404 });
  const { size, maskable } = iconVariantSpec(variant);

  const tenant = await getTenantConfig();
  const source = tenantIconSource(tenant);
  if (!source) return staticFallback(request, size);

  try {
    const logoUrl = new URL(source, request.url).toString();
    const res = await fetch(logoUrl, { signal: AbortSignal.timeout(6_000) });
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!res.ok || !SUPPORTED.has(type)) return staticFallback(request, size);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.byteLength > 2_000_000) return staticFallback(request, size);
    const dataUri = `data:${type};base64,${bytes.toString('base64')}`;

    const padding = Math.round(size * (maskable ? 0.2 : 0.12));
    const { background } = manifestColors(tenant);
    return new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background, padding }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dataUri} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
      ),
      { width: size, height: size, headers: { 'Cache-Control': CACHE } },
    );
  } catch {
    return staticFallback(request, size);
  }
}
