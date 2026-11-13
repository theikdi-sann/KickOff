import type { Database } from '@kickoff/shared';
import { isAdminRole, isStaffRole } from '@kickoff/shared';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/** The one screen a gatekeeper may use — and its (currently empty) subtree. */
const GATE_SURFACE = '/dashboard/scan';

function isGateSurface(pathname: string): boolean {
  return pathname === GATE_SURFACE || pathname.startsWith(`${GATE_SURFACE}/`);
}

/**
 * Next 16 Proxy (formerly middleware). Refreshes the Supabase session cookie on
 * every dashboard/login navigation and gates /dashboard behind a signed-in
 * **staff** account.
 *
 * The role is read from the validated JWT (`app_metadata.role`) — the same
 * claim `public.is_admin()`/`public.is_staff()` and the Edge Function guards
 * authorise on. Two staff roles exist (GAP-03a): an `admin` may use the whole
 * console, a `gatekeeper` may use the gate surface and nothing else. The
 * database still refuses anything a gatekeeper is not entitled to; this layer
 * makes sure such an account never reaches those screens in the first place.
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

  const role = (user?.app_metadata as Record<string, unknown> | undefined)?.role;
  const isAdmin = isAdminRole(role);
  const isStaff = isStaffRole(role);

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

  // A signed-in account without a staff claim must not reach the console.
  if (user && !isStaff && pathname.startsWith('/dashboard')) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.search = '';
    redirectUrl.searchParams.set('error', 'not-staff');
    return NextResponse.redirect(redirectUrl);
  }

  if (user && requiresMfa && pathname.startsWith('/dashboard')) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login/mfa';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  // A gatekeeper's console is exactly the gate surface. Everything else
  // (fixtures, seating, orders, refunds, users, settings) is admin-only.
  if (
    user &&
    isStaff &&
    !isAdmin &&
    pathname.startsWith('/dashboard') &&
    !isGateSurface(pathname)
  ) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/dashboard/scan';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  // Only a staff account is sent into the console; anyone else keeps the
  // sign-in form (otherwise the two redirects would fight each other).
  if (user && isStaff && !requiresMfa && (pathname === '/login' || pathname === '/login/mfa')) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = isAdmin ? '/dashboard' : '/dashboard/scan';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/login/mfa'],
};
