import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/therapist/dashboard');

  if (isProtected) {
    const auth = request.cookies.get('jalbon_auth');
    if (!auth || auth.value !== 'true') {
      return NextResponse.redirect(new URL('/therapist/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/therapist/dashboard/:path*'],
};
