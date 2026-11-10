import type { Database } from '@kickoff/shared';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Next 16 Proxy (formerly middleware). Refreshes the Supabase session cookie on
 * every dashboard/login navigation and gates /dashboard behind a signed-in user.
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

  if (user && requiresMfa && pathname.startsWith('/dashboard')) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login/mfa';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  if (user && !requiresMfa && (pathname === '/login' || pathname === '/login/mfa')) {
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
