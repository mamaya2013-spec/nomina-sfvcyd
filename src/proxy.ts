import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { updatePortalSession } from "@/lib/portal/middleware";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/portal")) {
    const portalResponse = await updatePortalSession(request);
    if (portalResponse) return portalResponse;
  } else {
    return await updateSession(request);
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes handle their own auth)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - manifest.json / PWA files
     * - png/jpg/etc (local logos/icons)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
