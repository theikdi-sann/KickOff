import type { Database } from '@kickoff/shared';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Next 16 Proxy (formerly middleware). Refreshes the Supabase session cookie on
 * every dashboard/login navigation and gates /dashboard behind a signed-in
 * **admin** account.
 *
 * The role is read from the validated JWT (`app_metadata.role`) — the same
 * claim `public.is_admin()` and the Edge Function guards authorise on. The
 * database still refuses a non-admin's writes; this layer makes sure such an
 * account never reaches the console in the first place.
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

  const isAdmin = (user?.app_metadata as Record<string, unknown> | undefined)?.role === 'admin';

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

  // A signed-in account without the admin claim must not reach the console.
  if (user && !isAdmin && pathname.startsWith('/dashboard')) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.search = '';
    redirectUrl.searchParams.set('error', 'not-admin');
    return NextResponse.redirect(redirectUrl);
  }

  if (user && requiresMfa && pathname.startsWith('/dashboard')) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login/mfa';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  // Only an admin is sent into the console; anyone else keeps the sign-in
  // form (otherwise the two redirects would fight each other).
  if (user && isAdmin && !requiresMfa && (pathname === '/login' || pathname === '/login/mfa')) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/dashboard';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/login/mfa'],
};
