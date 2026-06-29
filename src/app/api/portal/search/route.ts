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

    const { subsecretarias_ids, areas_ids, es_secretario } = session;
    if (!es_secretario && !subsecretarias_ids?.length && !areas_ids?.length) {
      return NextResponse.json({ results: [] });
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") || "";
    if (q.trim().length < 2) {
      return NextResponse.json({ results: [] });
    }

    const supabase = await createClient();
    const queryTerm = q.toLowerCase().trim();

    // 1. Build security filter
    let queryFilter = "";
    if (es_secretario) {
      const { data: allSubs } = await supabase.from("subsecretarias").select("id");
      const { data: allAreas } = await supabase.from("areas").select("id");
      const subIds = allSubs?.map(s => s.id) || [];
      const areaIds = allAreas?.map(a => a.id) || [];
      
      if (areaIds.length > 0) {
        queryFilter += `area_id.in.(${areaIds.join(",")})`;
      }
      if (subIds.length > 0) {
        if (queryFilter) queryFilter += ",";
        queryFilter += `subsecretaria_id.in.(${subIds.join(",")})`;
      }
    } else {
      if (areas_ids.length > 0) {
        queryFilter += `area_id.in.(${areas_ids.join(",")})`;
      }
      if (subsecretarias_ids.length > 0) {
        if (queryFilter) queryFilter += ",";
        queryFilter += `subsecretaria_id.in.(${subsecretarias_ids.join(",")})`;
      }
    }

    if (!queryFilter) {
      return NextResponse.json({ results: [] });
    }

    // 2. Fetch live data for active/all agents in those areas
    const { data: becs } = await supabase
      .from("becarios")
      .select("id, apellido_nombre, dni, estado, subsecretaria_id, area_id")
      .or(queryFilter);

    const { data: monos } = await supabase
      .from("monotributistas")
      .select("id, apellido_nombre, dni, estado, subsecretaria_id, area_id")
      .or(queryFilter);

    // 3. Fetch names for mapping
    const { data: allSubs } = await supabase.from("subsecretarias").select("id, nombre");
    const { data: allAreas } = await supabase.from("areas").select("id, nombre");
    
    const subMap = new Map(allSubs?.map((s) => [s.id, s.nombre]));
    const areaMap = new Map(allAreas?.map((a) => [a.id, a.nombre]));

    // 4. Combine and filter in-memory
    const results: any[] = [];

    (becs || []).forEach((b) => {
      if (
        b.apellido_nombre?.toLowerCase().includes(queryTerm) ||
        b.dni?.toLowerCase().includes(queryTerm)
      ) {
        results.push({
          id: b.id,
          nombre: b.apellido_nombre,
          dni: b.dni,
          tipo: "becario",
          estado: b.estado,
          subsecretaria: subMap.get(b.subsecretaria_id) || "-",
          area: areaMap.get(b.area_id) || "-",
        });
      }
    });

    (monos || []).forEach((m) => {
      if (
        m.apellido_nombre?.toLowerCase().includes(queryTerm) ||
        m.dni?.toLowerCase().includes(queryTerm)
      ) {
        results.push({
          id: m.id,
          nombre: m.apellido_nombre,
          dni: m.dni,
          tipo: "monotributista",
          estado: m.estado,
          subsecretaria: subMap.get(m.subsecretaria_id) || "-",
          area: areaMap.get(m.area_id) || "-",
        });
      }
    });

    // Sort by name
    results.sort((a, b) => a.nombre.localeCompare(b.nombre));

    // Limit to top 15 results
    return NextResponse.json({ results: results.slice(0, 15) });
  } catch (error: any) {
    console.error("Portal Search API Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
