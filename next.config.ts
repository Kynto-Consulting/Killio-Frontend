import type { NextConfig } from 'next';
import withSerwistInit from '@serwist/next';

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  // Cache every visited page on first online navigation so a cold PWA launch
  // offline can still load it — fixes start_url failing with ERR_NAME_NOT_RESOLVED.
  cacheOnNavigation: true,
  reloadOnOnline: true,
});

const BACKEND_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  async rewrites() {
    return [
      {
        source: '/uploads/:path*',
        destination: `${BACKEND_URL}/uploads/:path*`,
      },
      {
        // Same-origin proxy for the bundled HDR environment maps used by the 3D
        // model viewer (model-viewer fetches environment-image with CORS; serving
        // them from our origin avoids cross-origin failures).
        source: '/hdr/:file*',
        destination: 'https://modelviewer.dev/shared-assets/environments/:file*',
      },
    ];
  },
};

export default withSerwist(nextConfig);
