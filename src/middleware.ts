import { NextRequest, NextResponse } from 'next/server';

/**
 * Killio Route Middleware
 * ─────────────────────────────────────────────────
 * - Unauthenticated users hitting any non-public route → redirect to /login
 * - Authenticated users hitting /login → redirect to /
 *
 * Authentication signal: `killio_token` cookie (set on login).
 * This middleware only runs on Node.js edge runtime so we only do
 * a simple cookie presence check here. Full JWT verification happens
 * server-side in each route handler / RSC via GET /auth/me.
 */

const PUBLIC_PATHS = ['/login', '/signup', '/api'];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
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

  // Authenticated user trying to access login → send to dashboard
  if (token && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Unauthenticated user trying to access a protected route → send to login
  if (!token && !isPublic(pathname)) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
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
