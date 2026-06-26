import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPortalSession, PORTAL_COOKIE_NAME } from "@/lib/portal/auth";

export async function POST(req: NextRequest) {
  try {
    const session = await getPortalSession();
    
    if (session) {
      const supabase = await createClient();
      const ipAddress = req.headers.get("x-forwarded-for") || (req as any).ip || "unknown";
      const userAgent = req.headers.get("user-agent") || "unknown";

      // Log successful logout
      await supabase.from("portal_sesiones_log").insert({
        responsable_id: session.responsable_id,
        accion: "logout",
        ip_address: ipAddress,
        user_agent: userAgent,
      });
    }

    const response = NextResponse.json({ success: true });
    
    // Clear cookie
    response.cookies.set(PORTAL_COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0, // Expire immediately
    });

    return response;
  } catch (error: any) {
    console.error("Logout API Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
