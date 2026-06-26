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
      return NextResponse.json({ monotributistas: [], total: 0 });
    }

    const { searchParams } = new URL(req.url);
    const semestreId = searchParams.get("semestre_id");
    const filterSub = searchParams.get("subsecretaria_id") || "all";
    const filterArea = searchParams.get("area_id") || "all";
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "all";

    if (!semestreId) {
      return NextResponse.json(
        { error: "semestre_id es requerido" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // 1. Fetch semester info
    const { data: semestre } = await supabase
      .from("semestres")
      .select("*")
      .eq("id", semestreId)
      .single();

    if (!semestre) {
      return NextResponse.json({ error: "Semestre no encontrado" }, { status: 404 });
    }

    // Determine target areas and subsecretarías based on filters
    let targetSubIds = [...subsecretarias_ids];
    let targetAreaIds = [...areas_ids];

    // Fetch areas for reference
    const { data: allAreas } = await supabase.from("areas").select("id, nombre, subsecretaria_id");
    const areaSubMap = new Map(allAreas?.map((a) => [a.id, a.subsecretaria_id]));

    if (filterSub !== "all") {
      if (!subsecretarias_ids.includes(filterSub)) {
        return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
      }
      targetSubIds = [filterSub];
      targetAreaIds = allAreas?.filter((a) => a.subsecretaria_id === filterSub && (areas_ids.includes(a.id) || subsecretarias_ids.includes(a.subsecretaria_id))).map((a) => a.id) || [];
    }

    if (filterArea !== "all") {
      if (!areas_ids.includes(filterArea)) {
        const parentSubId = areaSubMap.get(filterArea);
        if (!parentSubId || !subsecretarias_ids.includes(parentSubId)) {
          return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
        }
      }
      targetAreaIds = [filterArea];
      const parentSubId = areaSubMap.get(filterArea);
      targetSubIds = parentSubId ? [parentSubId] : [];
    }

    let monotributistas: any[] = [];

    // 2. Fetch data
    if (semestre.bloqueado) {
      // Historical Snapshot
      const { data: snap } = await supabase
        .from("snapshots_semestre")
        .select("nomina_monos_snapshot")
        .eq("semestre_id", semestreId)
        .maybeSingle();

      if (snap && snap.nomina_monos_snapshot) {
        monotributistas = (snap.nomina_monos_snapshot as any[]).filter((m: any) =>
          targetAreaIds.includes(m.area_id) || targetSubIds.includes(m.subsecretaria_id)
        );
      }
    } else {
      // Live Data
      let queryFilter = "";
      if (targetAreaIds.length > 0) {
        queryFilter += `area_id.in.(${targetAreaIds.join(",")})`;
      }
      if (targetSubIds.length > 0) {
        if (queryFilter) queryFilter += ",";
        queryFilter += `subsecretaria_id.in.(${targetSubIds.join(",")})`;
      }

      if (queryFilter) {
        const { data } = await supabase
          .from("monotributistas")
          .select("*, subsecretarias(id, nombre), areas(id, nombre)")
          .or(queryFilter);

        monotributistas = data || [];
      }
    }

    // 3. Apply search & status filters
    let filtered = [...monotributistas];

    if (status !== "all") {
      filtered = filtered.filter((m) => m.estado === status);
    }

    if (search.trim() !== "") {
      const q = search.toLowerCase().trim();
      filtered = filtered.filter(
        (m) =>
          m.apellido_nombre?.toLowerCase().includes(q) ||
          m.dni?.toLowerCase().includes(q) ||
          m.cuit?.toLowerCase().includes(q)
      );
    }

    // Sort by name
    filtered.sort((a, b) => a.apellido_nombre.localeCompare(b.apellido_nombre));

    // Fetch approved document counts
    const agentIds = filtered.map((m) => m.id);
    let docsMap: Record<string, any[]> = {};
    let insurancesMap: Record<string, any> = {};

    if (agentIds.length > 0) {
      // Documents
      const { data: docs } = await supabase
        .from("documentos")
        .select("id, persona_id, tipo_documento, url_supabase, url_google_drive, estado_revision, created_at, fecha_vencimiento")
        .in("persona_id", agentIds);

      docs?.forEach((d) => {
        if (!docsMap[d.persona_id]) docsMap[d.persona_id] = [];
        docsMap[d.persona_id].push(d);
      });

      // Insurance expirations
      const { data: insurances } = await supabase
        .from("vencimientos_seguros")
        .select("*")
        .in("monotributista_id", agentIds);

      insurances?.forEach((ins) => {
        insurancesMap[ins.monotributista_id] = ins;
      });
    }

    // Map counts, docs and insurances
    const results = filtered.map((m) => {
      const pDocs = docsMap[m.id] || [];
      const approvedCount = pDocs.filter((d) => d.estado_revision === "aprobado").length;
      return {
        ...m,
        subsecretaria_nombre: m.subsecretarias?.nombre || m.subsecretaria_nombre || "-",
        area_nombre: m.areas?.nombre || m.area_nombre || "-",
        documentos_aprobados: approvedCount,
        documentos: pDocs,
        seguro: insurancesMap[m.id] || null,
      };
    });

    return NextResponse.json({
      monotributistas: results,
      total: results.length,
    });
  } catch (error: any) {
    console.error("Portal Monotributistas API Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
