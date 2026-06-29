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
      return NextResponse.json({ becarios: [], total: 0 });
    }

    const { searchParams } = new URL(req.url);
    const semestreId = searchParams.get("semestre_id");
    const filterSub = searchParams.get("subsecretaria_id") || "all";
    const filterArea = searchParams.get("area_id") || "all";
    const responsableId = searchParams.get("responsable_id") || "all";
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "all"; // 'all', 'Activo', 'Baja'

    if (!semestreId) {
      return NextResponse.json(
        { error: "semestre_id es requerido" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // 1. Fetch semester info to check if blocked
    const { data: semestre } = await supabase
      .from("semestres")
      .select("*")
      .eq("id", semestreId)
      .single();

    if (!semestre) {
      return NextResponse.json({ error: "Semestre no encontrado" }, { status: 404 });
    }

    // Fetch areas and subsecretarías for reference
    const { data: allAreas } = await supabase.from("areas").select("id, nombre, subsecretaria_id");
    const areaSubMap = new Map(allAreas?.map((a) => [a.id, a.subsecretaria_id]));
    const { data: allSubsecretarias } = await supabase.from("subsecretarias").select("id, nombre");

    let targetSubIds: string[] = [];
    let targetAreaIds: string[] = [];

    if (es_secretario) {
      if (filterSub !== "all") {
        targetSubIds = [filterSub];
        targetAreaIds = allAreas?.filter((a) => a.subsecretaria_id === filterSub).map((a) => a.id) || [];
      } else if (filterArea !== "all") {
        targetAreaIds = [filterArea];
        const parentSubId = areaSubMap.get(filterArea);
        targetSubIds = parentSubId ? [parentSubId] : [];
      } else {
        targetSubIds = allSubsecretarias?.map((s) => s.id) || [];
        targetAreaIds = allAreas?.map((a) => a.id) || [];
      }
    } else {
      targetSubIds = [...(subsecretarias_ids || [])];
      targetAreaIds = [...(areas_ids || [])];

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
    }

    let becarios: any[] = [];

    // 2. Fetch data (from Snapshots or Live)
    if (semestre.bloqueado) {
      // Historical Snapshot
      const { data: snap } = await supabase
        .from("snapshots_semestre")
        .select("nomina_becarios_snapshot")
        .eq("semestre_id", semestreId)
        .maybeSingle();

      if (snap && snap.nomina_becarios_snapshot) {
        // Filter in memory by area/subsecretaría
        becarios = (snap.nomina_becarios_snapshot as any[]).filter((b: any) =>
          targetAreaIds.includes(b.area_id) || targetSubIds.includes(b.subsecretaria_id)
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
          .from("becarios")
          .select("*, subsecretarias(id, nombre), areas(id, nombre)")
          .or(queryFilter);

        becarios = data || [];
      }
    }

    // 3. Apply search & status filters in-memory (works uniformly for both live and snapshot data)
    let filtered = [...becarios];

    // Responsable filter
    if (responsableId !== "all") {
      filtered = filtered.filter((b) => b.responsable_id === responsableId);
    }

    // Status filter
    if (status !== "all") {
      filtered = filtered.filter((b) => b.estado === status);
    }

    // Search filter (name, DNI, CUIT)
    if (search.trim() !== "") {
      const q = search.toLowerCase().trim();
      filtered = filtered.filter(
        (b) =>
          b.apellido_nombre?.toLowerCase().includes(q) ||
          b.dni?.toLowerCase().includes(q) ||
          b.cuit?.toLowerCase().includes(q)
      );
    }

    // Sort by name ascending
    filtered.sort((a, b) => a.apellido_nombre.localeCompare(b.apellido_nombre));

    // Fetch approved document counts for detailed document checklist
    const agentIds = filtered.map((b) => b.id);
    let docsMap: Record<string, any[]> = {};

    if (agentIds.length > 0) {
      const { data: docs } = await supabase
        .from("documentos")
        .select("id, persona_id, tipo_documento, url_supabase, url_google_drive, estado_revision, created_at, fecha_vencimiento")
        .in("persona_id", agentIds);

      docs?.forEach((d) => {
        if (!docsMap[d.persona_id]) docsMap[d.persona_id] = [];
        docsMap[d.persona_id].push(d);
      });
    }

    // Map doc counts and attachments
    const results = filtered.map((b) => {
      const pDocs = docsMap[b.id] || [];
      const approvedCount = pDocs.filter((d) => d.estado_revision === "aprobado").length;
      return {
        ...b,
        subsecretaria_nombre: b.subsecretarias?.nombre || b.subsecretaria_nombre || "-",
        area_nombre: b.areas?.nombre || b.area_nombre || "-",
        documentos_aprobados: approvedCount,
        documentos: pDocs,
      };
    });

    return NextResponse.json({
      becarios: results,
      total: results.length,
    });
  } catch (error: any) {
    console.error("Portal Becarios API Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
