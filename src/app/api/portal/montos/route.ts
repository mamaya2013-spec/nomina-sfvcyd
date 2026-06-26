import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPortalSession } from "@/lib/portal/auth";

export async function GET(req: NextRequest) {
  try {
    const session = await getPortalSession();
    if (!session) {
      return NextResponse.json(
        { error: "No autorizado. Sesión no encontrada o expirada." },
        { status: 401 }
      );
    }

    const { subsecretarias_ids, areas_ids } = session;
    if (!subsecretarias_ids?.length && !areas_ids?.length) {
      return NextResponse.json(
        { error: "No autorizado. No tiene áreas asignadas." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const semestreId = searchParams.get("semestre_id");

    if (!semestreId) {
      return NextResponse.json(
        { error: "semestre_id es requerido" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Verify semester exists
    const { data: semestre, error: semErr } = await supabase
      .from("semestres")
      .select("*")
      .eq("id", semestreId)
      .single();

    if (semErr || !semestre) {
      return NextResponse.json({ error: "Semestre no encontrado" }, { status: 404 });
    }

    // Fetch becas categories
    const { data: becas, error: becasErr } = await supabase
      .from("categorias_becas")
      .select("*")
      .eq("semestre_id", semestreId)
      .order("numero_categoria", { ascending: true });

    if (becasErr) {
      return NextResponse.json({ error: "Error al obtener categorías de becas" }, { status: 500 });
    }

    // Fetch monotributistas categories
    const { data: monos, error: monosErr } = await supabase
      .from("categorias_monotributistas")
      .select("*")
      .eq("semestre_id", semestreId)
      .order("letra", { ascending: true });

    if (monosErr) {
      return NextResponse.json({ error: "Error al obtener categorías de monotributistas" }, { status: 500 });
    }

    return NextResponse.json({
      becas: becas || [],
      monotributistas: monos || [],
    });
  } catch (error: any) {
    console.error("Error in /api/portal/montos:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
