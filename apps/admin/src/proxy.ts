import type { Database } from '@kickoff/shared';
import { isAdminRole, isPlatformMetadata, isStaffRole } from '@kickoff/shared';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/** The one screen a gatekeeper may use — and its (currently empty) subtree. */
const GATE_SURFACE = '/dashboard/scan';
/** The platform console's surface (ADR-004 §3) — the platform claim only. */
const PLATFORM_SURFACE = '/dashboard/platform';

function isGateSurface(pathname: string): boolean {
  return pathname === GATE_SURFACE || pathname.startsWith(`${GATE_SURFACE}/`);
}

function onPlatformSurface(pathname: string): boolean {
  return pathname === PLATFORM_SURFACE || pathname.startsWith(`${PLATFORM_SURFACE}/`);
}

/**
 * Next 16 Proxy (formerly middleware). Refreshes the Supabase session cookie on
 * every dashboard/login navigation and gates /dashboard behind a signed-in
 * **staff** account — or, for `/dashboard/platform`, the **platform** claim.
 *
 * The role is read from the validated JWT (`app_metadata.role`) — the same
 * claim `public.is_admin()`/`public.is_staff()` and the Edge Function guards
 * authorise on. Two staff roles exist (GAP-03a): an `admin` may use the whole
 * console, a `gatekeeper` may use the gate surface and nothing else. The
 * database still refuses anything a gatekeeper is not entitled to; this layer
 * makes sure such an account never reaches those screens in the first place.
 *
 * The platform surface is the mirror image (ADR-004 §3): club staff authority
 * is scoped to one club and never opens the cross-club console, so a club
 * account is turned away from `/dashboard/platform` and a platform-only
 * operator is routed there instead of to login.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Without env the app renders its setup error; don't crash the proxy layer.
  if (!url || !anonKey) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() validates the JWT with Supabase Auth (do not use getSession here).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  const metadata = user?.app_metadata as Record<string, unknown> | undefined;
  const role = metadata?.role;
  const isAdmin = isAdminRole(role);
  const isStaff = isStaffRole(role);
  const isPlatform = isPlatformMetadata(metadata);

  let requiresMfa = false;
  if (user) {
    const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    requiresMfa = assurance?.nextLevel === 'aal2' && assurance?.currentLevel !== 'aal2';
  }

  if (!user && pathname.startsWith('/dashboard')) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.search = '';
    redirectUrl.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(redirectUrl);
  }

  // The platform surface is platform-only: a club account — staff or not —
  // is turned away with the reason, so the refusal is explainable.
  if (user && onPlatformSurface(pathname) && !isPlatform) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.search = '';
    if (isStaff) {
      redirectUrl.pathname = '/dashboard';
      redirectUrl.searchParams.set('error', 'not-platform');
    } else {
      redirectUrl.pathname = '/login';
      redirectUrl.searchParams.set('error', 'not-staff');
    }
    return NextResponse.redirect(redirectUrl);
  }

  // A signed-in account with neither staff nor platform authority must not
  // reach the console.
  if (user && !isStaff && !isPlatform && pathname.startsWith('/dashboard')) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.search = '';
    redirectUrl.searchParams.set('error', 'not-staff');
    return NextResponse.redirect(redirectUrl);
  }

  // A platform-only operator's console is the platform surface: their club
  // pages are not theirs to see (the database would refuse the reads
  // anyway — this keeps the screens out of reach too).
  if (user && isPlatform && !isStaff && pathname.startsWith('/dashboard') && !onPlatformSurface(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = PLATFORM_SURFACE;
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  if (user && requiresMfa && pathname.startsWith('/dashboard')) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login/mfa';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  // A gatekeeper's console is exactly the gate surface. Everything else
  // (fixtures, seating, orders, refunds, users, settings) is admin-only —
  // except the platform surface, which belongs to the platform claim.
  if (
    user &&
    isStaff &&
    !isAdmin &&
    pathname.startsWith('/dashboard') &&
    !isGateSurface(pathname) &&
    !onPlatformSurface(pathname)
  ) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/dashboard/scan';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  // Only an account with console authority is sent out of the sign-in form;
  // anyone else keeps it (otherwise the two redirects would fight each other).
  if (user && (isStaff || isPlatform) && !requiresMfa && (pathname === '/login' || pathname === '/login/mfa')) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = !isStaff ? PLATFORM_SURFACE : isAdmin ? '/dashboard' : '/dashboard/scan';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/login/mfa'],
};
