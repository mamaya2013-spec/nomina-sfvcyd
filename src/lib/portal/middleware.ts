import { NextResponse, type NextRequest } from "next/server";
import { verifyPortalToken, PORTAL_COOKIE_NAME } from "./auth";

export async function updatePortalSession(request: NextRequest): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl;

  // We only care about /portal paths
  if (!pathname.startsWith("/portal")) {
    return null;
  }

  const token = request.cookies.get(PORTAL_COOKIE_NAME)?.value;
  const session = token ? await verifyPortalToken(token) : null;

  // Protect /portal/login - redirect logged-in users to /portal/dashboard
  if (pathname === "/portal/login") {
    if (session) {
      const url = request.nextUrl.clone();
      url.pathname = "/portal/dashboard";
      return NextResponse.redirect(url);
    }
    return null;
  }

  // Protect all other /portal routes (excluding API routes which handle their own validation)
  if (!pathname.startsWith("/portal/api") && !session) {
    const url = request.nextUrl.clone();
    url.pathname = "/portal/login";
    return NextResponse.redirect(url);
  }

  return null;
}
