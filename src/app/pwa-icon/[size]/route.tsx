import { ImageResponse } from 'next/og';
import { getTenantConfig } from '@/lib/tenant/server';
import { iconVariantSpec, isIconVariant, iconBackground, manifestColors, tenantIconSource } from '@/lib/pwa/manifest';

export const runtime = 'nodejs';

const NATIVE = new Set(['image/png', 'image/jpeg']);
const CONVERTIBLE = new Set(['image/webp', 'image/avif', 'image/gif', 'image/svg+xml', 'image/tiff', 'image/x-icon', 'image/vnd.microsoft.icon']);
const CACHE = 'public, max-age=3600, stale-while-revalidate=86400';

/** Average luminance of the logo's visible (non-transparent) pixels, or null when it can not be measured. */
async function visibleLuma(bytes: Buffer): Promise<number | null> {
  try {
    const { default: sharp } = await import('sharp');
    const { data } = await sharp(bytes).resize(48, 48, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let sum = 0;
    let weight = 0;
    for (let i = 0; i + 3 < data.length; i += 4) {
      const a = data[i + 3] / 255;
      sum += a * (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
      weight += a * 255;
    }
    return weight > 0 ? sum / weight : null;
  } catch {
    return null;
  }
}

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
    let type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!res.ok || !(NATIVE.has(type) || CONVERTIBLE.has(type))) return staticFallback(request, size);
    let bytes: Buffer = Buffer.from(await res.arrayBuffer());
    if (bytes.byteLength > 2_000_000) return staticFallback(request, size);
    if (!NATIVE.has(type)) {
      // WebP, AVIF, GIF, SVG, ICO... are re-encoded to PNG, which the renderer can draw. sharp ships with
      // Next.js; if it is missing the icon falls back to Killio's own instead of failing.
      const { default: sharp } = await import('sharp');
      bytes = await sharp(bytes, { limitInputPixels: 50_000_000 }).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
      type = 'image/png';
    }
    const luma = await visibleLuma(bytes);
    const dataUri = `data:${type};base64,${bytes.toString('base64')}`;

    const padding = Math.round(size * (maskable ? 0.2 : 0.12));
    const background = luma === null ? manifestColors(tenant).background : iconBackground(manifestColors(tenant).background, luma);
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
