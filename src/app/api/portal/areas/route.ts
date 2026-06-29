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

    const { subsecretarias_ids, areas_ids, es_secretario } = session;

    const supabase = await createClient();

    let subsecretarias: any[] = [];
    let areas: any[] = [];

    if (es_secretario) {
      // Secretario has access to all active subsecretarias and areas
      const { data: allSubs } = await supabase
        .from("subsecretarias")
        .select("id, nombre")
        .eq("activa", true)
        .order("nombre", { ascending: true });

      const { data: allAreas } = await supabase
        .from("areas")
        .select("id, nombre, subsecretaria_id")
        .eq("activa", true)
        .order("nombre", { ascending: true });

      return NextResponse.json({
        subsecretarias: allSubs || [],
        areas: allAreas || [],
      });
    }

    if (!subsecretarias_ids?.length && !areas_ids?.length) {
      return NextResponse.json({
        subsecretarias: [],
        areas: [],
      });
    }

    // Fetch subsecretarias if any
    if (subsecretarias_ids && subsecretarias_ids.length > 0) {
      const { data, error } = await supabase
        .from("subsecretarias")
        .select("id, nombre")
        .in("id", subsecretarias_ids)
        .eq("activa", true)
        .order("nombre", { ascending: true });

      if (!error && data) {
        subsecretarias = data;
      }
    }

    // Fetch areas if any
    if (areas_ids && areas_ids.length > 0) {
      const { data, error } = await supabase
        .from("areas")
        .select("id, nombre, subsecretaria_id")
        .in("id", areas_ids)
        .eq("activa", true)
        .order("nombre", { ascending: true });

      if (!error && data) {
        areas = data;
      }
    }

    return NextResponse.json({
      subsecretarias,
      areas,
    });
  } catch (error: any) {
    console.error("Portal Areas API Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
