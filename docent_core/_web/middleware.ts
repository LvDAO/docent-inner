import { NextRequest, NextResponse } from 'next/server';
import { getUser } from './app/services/dal';
import { INTERNAL_BASE_URL } from './app/constants';

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const user = await getUser();

  // If not, we might be able to create an anonymous session, if the path contains a collection_id
  if (!user) {
    const isCollectionRoute = pathname.match(
      /^\/dashboard\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\/.*)?$/i
    );
    if (isCollectionRoute) {
      try {
        const anonResponse = await fetch(
          `${INTERNAL_BASE_URL}/rest/anonymous_session`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
        const setCookie = anonResponse.headers.get('set-cookie');
        if (anonResponse.ok && setCookie) {
          // Reissue the request with the new cookie so every layout verifies /rest/me.
          const response = NextResponse.redirect(request.nextUrl);
          response.headers.set('set-cookie', setCookie);
          return response;
        }
      } catch {
        // Fall through to the normal signup redirect when the backend is unavailable.
      }
    }
  }

  // At this point, if there is no user, we need to redirect to login
  if (!user) {
    return NextResponse.redirect(new URL('/signup', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
