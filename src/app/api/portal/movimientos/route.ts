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
      return NextResponse.json({ movimientos: [], total: 0 });
    }

    const { searchParams } = new URL(req.url);
    const semestreId = searchParams.get("semestre_id");
    const filterSub = searchParams.get("subsecretaria_id") || "all";
    const filterArea = searchParams.get("area_id") || "all";
    const responsableId = searchParams.get("responsable_id") || "all";
    const search = searchParams.get("search") || "";
    const tipoPersona = searchParams.get("tipo_persona") || "all"; // 'all', 'becario', 'monotributista'
    const tipoMovimiento = searchParams.get("tipo_movimiento") || "all";

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

    // Fetch areas and subsecretarias for names lookup
    const { data: allSubs } = await supabase.from("subsecretarias").select("id, nombre");
    const { data: allAreas } = await supabase.from("areas").select("id, nombre, subsecretaria_id");
    
    const subNameMap = new Map(allSubs?.map((s) => [s.id, s.nombre]));
    const areaNameMap = new Map(allAreas?.map((a) => [a.id, a.nombre]));
    const areaSubMap = new Map(allAreas?.map((a) => [a.id, a.subsecretaria_id]));

    // Determine target areas and subsecretarías based on filters
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
        targetSubIds = allSubs?.map((s) => s.id) || [];
        targetAreaIds = allAreas?.map((a) => a.id) || [];
      }
    } else {
      if (areas_ids && areas_ids.length > 0) {
        targetSubIds = [];
        targetAreaIds = [...areas_ids];

        if (filterArea !== "all") {
          if (!areas_ids.includes(filterArea)) {
            return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
          }
          targetAreaIds = [filterArea];
        }
        if (filterSub !== "all") {
          const allowedAreasInSub = allAreas
            ?.filter((a) => a.subsecretaria_id === filterSub && areas_ids.includes(a.id))
            .map((a) => a.id) || [];
          if (allowedAreasInSub.length === 0) {
            return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
          }
          targetAreaIds = allowedAreasInSub;
        }
      } else {
        targetSubIds = [...(subsecretarias_ids || [])];
        targetAreaIds = allAreas?.filter((a) => subsecretarias_ids.includes(a.subsecretaria_id)).map((a) => a.id) || [];

        if (filterSub !== "all") {
          if (!subsecretarias_ids.includes(filterSub)) {
            return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
          }
          targetSubIds = [filterSub];
          targetAreaIds = allAreas?.filter((a) => a.subsecretaria_id === filterSub).map((a) => a.id) || [];
        }

        if (filterArea !== "all") {
          const parentSubId = areaSubMap.get(filterArea);
          if (!parentSubId || !subsecretarias_ids.includes(parentSubId)) {
            return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
          }
          targetAreaIds = [filterArea];
          targetSubIds = [parentSubId];
        }
      }
    }

    // Determine target areas and subsecretarías for monotributistas (always unrestricted at subsecretaría level)
    let targetMonoSubIds: string[] = [];
    let targetMonoAreaIds: string[] = [];

    if (es_secretario) {
      targetMonoSubIds = [...targetSubIds];
      targetMonoAreaIds = [...targetAreaIds];
    } else {
      targetMonoSubIds = [...(subsecretarias_ids || [])];
      targetMonoAreaIds = [...(areas_ids || [])];

      if (filterSub !== "all") {
        if (!subsecretarias_ids.includes(filterSub)) {
          return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
        }
        targetMonoSubIds = [filterSub];
        targetMonoAreaIds = allAreas?.filter((a) => a.subsecretaria_id === filterSub && (areas_ids.includes(a.id) || subsecretarias_ids.includes(a.subsecretaria_id))).map((a) => a.id) || [];
      }

      if (filterArea !== "all") {
        if (!areas_ids.includes(filterArea)) {
          const parentSubId = areaSubMap.get(filterArea);
          if (!parentSubId || !subsecretarias_ids.includes(parentSubId)) {
            return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
          }
        }
        targetMonoAreaIds = [filterArea];
        const parentSubId = areaSubMap.get(filterArea);
        targetMonoSubIds = parentSubId ? [parentSubId] : [];
      }
    }

    // 2. Fetch all becarios and monotributistas (both active and inactive) in allowed areas to build ID -> Area mapping
    let becarios: any[] = [];
    let monotributistas: any[] = [];

    if (semestre.bloqueado) {
      const { data: snap } = await supabase
        .from("snapshots_semestre")
        .select("nomina_becarios_snapshot, nomina_monos_snapshot")
        .eq("semestre_id", semestreId)
        .maybeSingle();

      if (snap) {
        becarios = snap.nomina_becarios_snapshot || [];
        monotributistas = snap.nomina_monos_snapshot || [];
      }
    } else {
      let queryFilterBec = "";
      if (targetAreaIds.length > 0) {
        queryFilterBec += `area_id.in.(${targetAreaIds.join(",")})`;
      }
      if (targetSubIds.length > 0) {
        if (queryFilterBec) queryFilterBec += ",";
        queryFilterBec += `subsecretaria_id.in.(${targetSubIds.join(",")})`;
      }

      let queryFilterMono = "";
      if (targetMonoAreaIds.length > 0) {
        queryFilterMono += `area_id.in.(${targetMonoAreaIds.join(",")})`;
      }
      if (targetMonoSubIds.length > 0) {
        if (queryFilterMono) queryFilterMono += ",";
        queryFilterMono += `subsecretaria_id.in.(${targetMonoSubIds.join(",")})`;
      }

      if (queryFilterBec || queryFilterMono) {
        if (queryFilterBec) {
          const { data: becs } = await supabase.from("becarios").select("*").or(queryFilterBec);
          becarios = becs || [];
        }
        if (queryFilterMono) {
          const { data: monos } = await supabase.from("monotributistas").select("*").or(queryFilterMono);
          monotributistas = monos || [];
        }
      }
    }

    const activeResponsableId = es_secretario ? responsableId : session.responsable_id;
    if (activeResponsableId !== "all") {
      becarios = becarios.filter((b) => b.responsable_id === activeResponsableId);
      monotributistas = monotributistas.filter((m) => m.responsable_id === activeResponsableId);
    }

    // Build map of allowed agent details
    const agentMap: Record<string, { nombre: string; area_id: string; subsecretaria_id: string }> = {};

    becarios.forEach((b) => {
      // Check if it belongs to filtered areas
      if (targetAreaIds.includes(b.area_id) || targetSubIds.includes(b.subsecretaria_id)) {
        agentMap[b.id] = {
          nombre: b.apellido_nombre,
          area_id: b.area_id,
          subsecretaria_id: b.subsecretaria_id,
        };
      }
    });

    monotributistas.forEach((m) => {
      if (targetMonoAreaIds.includes(m.area_id) || targetMonoSubIds.includes(m.subsecretaria_id)) {
        agentMap[m.id] = {
          nombre: m.apellido_nombre,
          area_id: m.area_id,
          subsecretaria_id: m.subsecretaria_id,
        };
      }
    });

    const allowedAgentIds = Object.keys(agentMap);
    if (allowedAgentIds.length === 0) {
      return NextResponse.json({ movimientos: [], total: 0 });
    }

    // 3. Fetch movements for these agents in the semester's year
    const { data: movs, error: movsErr } = await supabase
      .from("movimientos")
      .select("*")
      .eq("anio", semestre.anio)
      .in("persona_id", allowedAgentIds)
      .order("created_at", { ascending: false });

    if (movsErr) {
      return NextResponse.json({ error: movsErr.message }, { status: 500 });
    }

    // 4. Filter and map movements in memory
    let filtered = (movs || []).map((m) => {
      const agent = agentMap[m.persona_id];
      return {
        ...m,
        nombre_persona: agent ? agent.nombre : "Desconocido",
        subsecretaria_nombre: agent ? (subNameMap.get(agent.subsecretaria_id) || "-") : "-",
        area_nombre: agent ? (areaNameMap.get(agent.area_id) || "-") : "-",
      };
    });

    // Apply filters
    if (tipoPersona !== "all") {
      filtered = filtered.filter((m) => m.tipo_persona === tipoPersona);
    }

    if (tipoMovimiento !== "all") {
      filtered = filtered.filter((m) => m.tipo_movimiento === tipoMovimiento);
    }

    if (search.trim() !== "") {
      const q = search.toLowerCase().trim();
      filtered = filtered.filter(
        (m) =>
          m.nombre_persona.toLowerCase().includes(q) ||
          m.descripcion?.toLowerCase().includes(q)
      );
    }

    return NextResponse.json({
      movimientos: filtered,
      total: filtered.length,
    });
  } catch (error: any) {
    console.error("Portal Movimientos API Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
