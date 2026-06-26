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
      return NextResponse.json({ documentos: [], total: 0 });
    }

    const { searchParams } = new URL(req.url);
    const filterSub = searchParams.get("subsecretaria_id") || "all";
    const filterArea = searchParams.get("area_id") || "all";
    const status = searchParams.get("status") || "all"; // 'all', 'pendiente', 'aprobado', 'rechazado'
    const search = searchParams.get("search") || "";

    const supabase = await createClient();

    // 1. Fetch allowed people in these areas
    let allowedBecs: any[] = [];
    let allowedMonos: any[] = [];

    let queryFilter = "";
    if (areas_ids.length > 0) {
      queryFilter += `area_id.in.(${areas_ids.join(",")})`;
    }
    if (subsecretarias_ids.length > 0) {
      if (queryFilter) queryFilter += ",";
      queryFilter += `subsecretaria_id.in.(${subsecretarias_ids.join(",")})`;
    }

    if (queryFilter) {
      const { data: becs } = await supabase.from("becarios").select("id, apellido_nombre, subsecretaria_id, area_id");
      const { data: monos } = await supabase.from("monotributistas").select("id, apellido_nombre, subsecretaria_id, area_id");
      allowedBecs = becs || [];
      allowedMonos = monos || [];
    }

    const allowedPeopleMap = new Map<string, { nombre: string; tipo: string; subsecretaria_id: string; area_id: string }>();
    allowedBecs.forEach(b => allowedPeopleMap.set(b.id, { nombre: b.apellido_nombre, tipo: "becario", subsecretaria_id: b.subsecretaria_id, area_id: b.area_id }));
    allowedMonos.forEach(m => allowedPeopleMap.set(m.id, { nombre: m.apellido_nombre, tipo: "monotributista", subsecretaria_id: m.subsecretaria_id, area_id: m.area_id }));

    const allowedPersonaIds = Array.from(allowedPeopleMap.keys());
    if (allowedPersonaIds.length === 0) {
      return NextResponse.json({ documentos: [], total: 0 });
    }

    // 2. Fetch area/sub names
    const { data: allSubs } = await supabase.from("subsecretarias").select("id, nombre");
    const { data: allAreas } = await supabase.from("areas").select("id, nombre");
    
    const subNameMap = new Map(allSubs?.map((s) => [s.id, s.nombre]));
    const areaNameMap = new Map(allAreas?.map((a) => [a.id, a.nombre]));

    // 3. Fetch documents
    let query = supabase
      .from("documentos")
      .select("id, persona_id, tipo_persona, nombre_archivo, tipo_documento, url_supabase, url_google_drive, estado_revision, observaciones_revision, created_at, fecha_vencimiento")
      .in("persona_id", allowedPersonaIds)
      .order("created_at", { ascending: false });

    if (status !== "all") {
      query = query.eq("estado_revision", status);
    }

    const { data: docs, error: docsErr } = await query;
    if (docsErr) {
      return NextResponse.json({ error: docsErr.message }, { status: 500 });
    }

    // 4. Map names and filter in memory by search/subsecretaria/area
    const results = (docs || [])
      .map((d) => {
        const person = allowedPeopleMap.get(d.persona_id);
        return {
          ...d,
          nombre_persona: person ? person.nombre : "Desconocido",
          subsecretaria_id: person ? person.subsecretaria_id : null,
          area_id: person ? person.area_id : null,
          subsecretaria_nombre: person ? (subNameMap.get(person.subsecretaria_id) || "-") : "-",
          area_nombre: person ? (areaNameMap.get(person.area_id) || "-") : "-",
        };
      })
      .filter((d) => {
        // Area filter
        if (filterArea !== "all" && d.area_id !== filterArea) return false;
        // Subsecretaria filter
        if (filterSub !== "all" && d.subsecretaria_id !== filterSub) return false;
        
        // Search filter (name, file name, doc type)
        if (search.trim() !== "") {
          const q = search.toLowerCase().trim();
          return (
            d.nombre_persona.toLowerCase().includes(q) ||
            d.nombre_archivo?.toLowerCase().includes(q) ||
            d.tipo_documento?.toLowerCase().includes(q)
          );
        }
        
        return true;
      });

    return NextResponse.json({
      documentos: results,
      total: results.length,
    });
  } catch (error: any) {
    console.error("Portal Documentos API Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
