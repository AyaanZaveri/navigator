import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublicPath = path === "/login";

  // Get the token from the Stremio auth cookie
  const token = request.cookies.get("stremio-auth")?.value || "";

  let isAuthenticated = false;
  if (token) {
    try {
      const authData = JSON.parse(token);
      isAuthenticated = !!(authData.authKey && authData.user);
    } catch {
      isAuthenticated = false;
    }
  }

  if (isPublicPath && isAuthenticated && path === "/login") {
    return NextResponse.redirect(new URL("/", request.nextUrl));
  }

  if (!isPublicPath && !isAuthenticated) {
    return NextResponse.redirect(new URL("/login", request.nextUrl));
  }

  return NextResponse.next();
}

// See "Matching Paths" below to learn more, this matcher is used to apply the middleware only to specific paths
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
