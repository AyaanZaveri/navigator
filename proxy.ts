import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
    const path = request.nextUrl.pathname;
    const isStaticAsset =
        path.startsWith("/_next/") ||
        path.startsWith("/_vercel/") ||
        path === "/favicon.ico" ||
        path === "/manifest.json" ||
        path === "/apple-icon.png" ||
        path === "/icon0.svg" ||
        path === "/icon1.png" ||
        /\.[a-zA-Z0-9]+$/.test(path);

    if (isStaticAsset) {
        return NextResponse.next();
    }

    const isPublicPath = path === "/login" || path.startsWith("/logo/");

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

// See "Matching Paths" below to learn more, this matcher is used to apply the proxy only to specific paths
export const config = {
    matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next (Next.js internals)
     * - _vercel (Vercel analytics/speed-insights scripts)
     * - files with an extension (assets, icons, manifests, etc)
     */
        "/((?!api|_next|_vercel|.*\\..*).*)",
    ],
};
