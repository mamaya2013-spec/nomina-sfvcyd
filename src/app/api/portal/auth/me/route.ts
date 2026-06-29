import { NextResponse } from "next/server";
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

    return NextResponse.json({
      authenticated: true,
      user: {
        responsable_id: session.responsable_id,
        username: session.username,
        nombre_completo: session.nombre_completo,
        subsecretarias_ids: session.subsecretarias_ids,
        areas_ids: session.areas_ids,
        es_secretario: session.es_secretario,
      },
    });
  } catch (error: any) {
    console.error("Auth Me API Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
