import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPortalSession } from "@/lib/portal/auth";

export async function GET() {
  try {
    const session = await getPortalSession();

    if (!session) {
      return NextResponse.json(
        { error: "No autorizado. Sesión no encontrada o expirada." },
        { status: 401 }
      );
    }

    if (!session.es_secretario) {
      return NextResponse.json(
        { error: "No autorizado. Esta acción requiere permisos de Secretario." },
        { status: 403 }
      );
    }

    const supabase = await createClient();

    // Fetch all active managers in the system
    const { data: responsables, error } = await supabase
      .from("responsables")
      .select("id, nombre_completo, cargo")
      .eq("activo", true)
      .order("nombre_completo", { ascending: true });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      responsables: responsables || [],
    });
  } catch (error: any) {
    console.error("Portal Responsables API Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
