import { NextRequest, NextResponse } from 'next/server';

/**
 * Killio Route Middleware
 * ─────────────────────────────────────────────────
 * - Unauthenticated users hitting any non-public route → redirect to /login
 * - /login and /signup stay accessible; authenticated client logic can redirect after full session validation
 *
 * Authentication signal: `killio_token` cookie (set on login).
 * This middleware only runs on Node.js edge runtime so we only do
 * a simple cookie presence check here. Full JWT verification happens
 * server-side in each route handler / RSC via GET /auth/me.
 */

// `/offline` MUST stay public — it's the PWA's offline fallback. If middleware
// redirects an unauth user to /login here, the service worker precaches the
// redirect and the entire offline experience breaks (Chrome shows
// ERR_NAME_NOT_RESOLVED instead of the offline page).
const PUBLIC_EXACT_PATHS = ['/', '/login', '/signup', '/forgot-password', '/change-password', '/verify-otp', '/accept-invite', '/privacy', '/terms', '/cookies', '/offline', '/vault'];
const PUBLIC_PREFIX_PATHS = ['/api', '/public-board', '/public-document', '/download'];

function isPublic(pathname: string) {
  return PUBLIC_EXACT_PATHS.includes(pathname) || PUBLIC_PREFIX_PATHS.some((p) => pathname.startsWith(p));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('killio_token')?.value;

  // Skip middleware for Next.js internal paths and static files
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Device detection from User-Agent
  const userAgent = request.headers.get('user-agent') || '';
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  
  // Set x-device-type header on the response headers passed to the next component
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-device-type', isMobile ? 'mobile' : 'desktop');

  if (!token && !isPublic(pathname)) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl, { headers: requestHeaders });
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    }
  });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static  (static files)
     * - _next/image   (image optimization)
     * - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
