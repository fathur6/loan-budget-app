import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const SESSION_COOKIE_PREFIX = 'sb-'
const SESSION_COOKIE_SUFFIX = '-auth-token'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // Fast path: no Supabase session cookie -> nothing to validate against the
  // auth server. Redirect straight to /login with ZERO network calls. This is
  // the common case (fresh visitor, logged-out prefetch) and is what prevents
  // the MIDDLEWARE_INVOCATION_TIMEOUT (504) caused by a blocking getUser()
  // remote round-trip on every request.
  const hasSessionCookie = request.cookies
    .getAll()
    .some(({ name }) =>
      name.startsWith(SESSION_COOKIE_PREFIX) && name.endsWith(SESSION_COOKIE_SUFFIX)
    )

  if (!hasSessionCookie) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Create a Supabase client configured to read server cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Check if a user is logged in
  const { data: { user } } = await supabase.auth.getUser()

  // If NO user is found, kick them to the login page
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // If user is found, let them pass
  return response
}

export const config = {
  matcher: [
    // Protect every page except static assets and the login page itself
    '/((?!_next/static|_next/image|favicon.ico|login|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
