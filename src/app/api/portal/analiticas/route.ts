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
      return NextResponse.json({
        personalStats: { total: 0, becarios: 0, monotributistas: 0, byArea: [], byCategory: [] },
        financialStats: { totalBudget: 0, becariosBudget: 0, monosBudget: 0, byArea: [], evolution: [] },
        docStats: { completionByArea: [], docTypesChecklist: [], docTypesMissing: [] },
        calendarEvents: [],
      });
    }

    const { searchParams } = new URL(req.url);
    const semestreId = searchParams.get("semestre_id");
    const filterSub = searchParams.get("subsecretaria_id") || "all";
    const filterArea = searchParams.get("area_id") || "all";
    const responsableId = searchParams.get("responsable_id") || "all";

    if (!semestreId) {
      return NextResponse.json(
        { error: "semestre_id es requerido" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // 1. Fetch semester info
    const { data: semestre, error: semErr } = await supabase
      .from("semestres")
      .select("*")
      .eq("id", semestreId)
      .single();

    if (semErr || !semestre) {
      return NextResponse.json({ error: "Semestre no encontrado" }, { status: 404 });
    }

    // 2. Fetch area/sub names
    const { data: allSubs } = await supabase.from("subsecretarias").select("id, nombre");
    const { data: allAreas } = await supabase.from("areas").select("id, nombre, subsecretaria_id");
    
    const subMap = new Map(allSubs?.map((s) => [s.id, s.nombre]));
    const areaMap = new Map(allAreas?.map((a) => [a.id, a.nombre]));
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

    let becarios: any[] = [];
    let monotributistas: any[] = [];
    let snaps: any = null;

    // 3. Fetch data (from Snapshots or Live)
    if (semestre.bloqueado) {
      // Historical Snapshot
      const { data: snap } = await supabase
        .from("snapshots_semestre")
        .select("*")
        .eq("semestre_id", semestreId)
        .maybeSingle();

      if (snap) {
        snaps = snap;
        const rawBecs = snap.nomina_becarios_snapshot || [];
        const rawMonos = snap.nomina_monos_snapshot || [];
        
        becarios = rawBecs.filter((b: any) =>
          targetAreaIds.includes(b.area_id) || targetSubIds.includes(b.subsecretaria_id)
        );
        monotributistas = rawMonos.filter((m: any) =>
          targetMonoAreaIds.includes(m.area_id) || targetMonoSubIds.includes(m.subsecretaria_id)
        );
      }
    } else {
      // Live Data
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
          const { data: becs } = await supabase
            .from("becarios")
            .select("*, categorias_becas(id, numero_categoria, monto)")
            .or(queryFilterBec);
          becarios = becs || [];
        }

        if (queryFilterMono) {
          const { data: monos } = await supabase
            .from("monotributistas")
            .select("*, categorias_monotributistas(id, letra, monto)")
            .or(queryFilterMono);
          monotributistas = monos || [];
        }
      }
    }

    if (responsableId !== "all") {
      becarios = becarios.filter((b) => b.responsable_id === responsableId);
      monotributistas = monotributistas.filter((m) => m.responsable_id === responsableId);
    }

    const activeBecs = becarios.filter((b) => b.estado === "Activo");
    const activeMonos = monotributistas.filter((m) => m.estado === "Activo");
    const totalActiveCount = activeBecs.length + activeMonos.length;

    const becsCost = activeBecs.reduce((sum, b) => sum + Number(b.importe_total || 0), 0);
    const monosCost = activeMonos.reduce((sum, m) => sum + Number(m.importe_total || 0), 0);
    const totalCost = becsCost + monosCost;

    // A. Personal Stats by Area & Category
    const countMapByArea: Record<string, { becs: number; monos: number; total: number }> = {};
    targetAreaIds.forEach((id) => {
      const aName = areaMap.get(id);
      if (aName) countMapByArea[aName] = { becs: 0, monos: 0, total: 0 };
    });

    activeBecs.forEach((b) => {
      const aName = areaMap.get(b.area_id) || "Sin Area";
      if (!countMapByArea[aName]) countMapByArea[aName] = { becs: 0, monos: 0, total: 0 };
      countMapByArea[aName].becs++;
      countMapByArea[aName].total++;
    });

    activeMonos.forEach((m) => {
      const aName = areaMap.get(m.area_id) || "Sin Area";
      if (!countMapByArea[aName]) countMapByArea[aName] = { becs: 0, monos: 0, total: 0 };
      countMapByArea[aName].monos++;
      countMapByArea[aName].total++;
    });

    const personalByArea = Object.entries(countMapByArea)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total);

    // Personal by Category
    const countMapByCategory: Record<string, number> = {};
    activeBecs.forEach((b) => {
      const cat = b.categorias_becas?.numero_categoria 
        ? `Beca Cat. ${b.categorias_becas.numero_categoria}` 
        : b.categoria_beca_nombre || "Beca Sin Categoría";
      countMapByCategory[cat] = (countMapByCategory[cat] || 0) + 1;
    });
    activeMonos.forEach((m) => {
      const cat = m.categorias_monotributistas?.letra 
        ? `Monotributo Letra ${m.categorias_monotributistas.letra}` 
        : m.categoria_mono_letra || "Monotributo Sin Letra";
      countMapByCategory[cat] = (countMapByCategory[cat] || 0) + 1;
    });

    const personalByCategory = Object.entries(countMapByCategory)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // B. Financial Stats by Area & 6 Months Evolution
    const costMapByArea: Record<string, { becs: number; monos: number; total: number }> = {};
    targetAreaIds.forEach((id) => {
      const aName = areaMap.get(id);
      if (aName) costMapByArea[aName] = { becs: 0, monos: 0, total: 0 };
    });

    activeBecs.forEach((b) => {
      const aName = areaMap.get(b.area_id) || "Sin Area";
      if (!costMapByArea[aName]) costMapByArea[aName] = { becs: 0, monos: 0, total: 0 };
      costMapByArea[aName].becs += Number(b.importe_total || 0);
      costMapByArea[aName].total += Number(b.importe_total || 0);
    });

    activeMonos.forEach((m) => {
      const aName = areaMap.get(m.area_id) || "Sin Area";
      if (!costMapByArea[aName]) costMapByArea[aName] = { becs: 0, monos: 0, total: 0 };
      costMapByArea[aName].monos += Number(m.importe_total || 0);
      costMapByArea[aName].total += Number(m.importe_total || 0);
    });

    const financialByArea = Object.entries(costMapByArea)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total);

    // Cost Evolution
    const allAgentIds = [...becarios.map((b) => b.id), ...monotributistas.map((m) => m.id)];
    let evolution: any[] = [];
    
    if (allAgentIds.length > 0) {
      const { data: movs } = await supabase
        .from("movimientos")
        .select("*")
        .eq("anio", semestre.anio)
        .in("persona_id", allAgentIds);

      const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
      const evolutionMap: Record<number, { monthName: string; altas: number; bajas: number; cambios: number }> = {};
      const currentMonth = new Date().getMonth() + 1;
      
      for (let i = 5; i >= 0; i--) {
        let m = currentMonth - i;
        if (m <= 0) m += 12;
        evolutionMap[m] = { monthName: monthNames[m - 1], altas: 0, bajas: 0, cambios: 0 };
      }

      movs?.forEach((m) => {
        if (evolutionMap[m.mes]) {
          if (m.tipo_movimiento === "alta") evolutionMap[m.mes].altas++;
          else if (m.tipo_movimiento === "baja") evolutionMap[m.mes].bajas++;
          else evolutionMap[m.mes].cambios++;
        }
      });
      evolution = Object.values(evolutionMap);
    }

    // C. Documentation Stats (completion per Area and checklist counts)
    let docStats = { completionByArea: [] as any[], docTypesChecklist: [] as any[], docTypesMissing: [] as any[] };
    let calendarEvents: any[] = [];

    if (totalActiveCount > 0) {
      const activeIds = [...activeBecs.map((b) => b.id), ...activeMonos.map((m) => m.id)];
      
      const { data: docs } = await supabase
        .from("documentos")
        .select("persona_id, tipo_documento, estado_revision, fecha_vencimiento")
        .in("persona_id", activeIds);

      const docsCounts: Record<string, number> = {};
      const docsMapByType: Record<string, { approved: number; pending: number; rejected: number; missing: number }> = {};
      
      // Initialize typical document types
      const docCodes = ["DNI", "CV", "TITULO", "CONTRATO_FIRMADO", "CBU", "CERTIFICADO_ANTECEDENTES", "CONSTANCIA_ARCA", "SEGURO_VIDA"];
      docCodes.forEach(code => {
        docsMapByType[code] = { approved: 0, pending: 0, rejected: 0, missing: 0 };
      });

      docs?.forEach((d) => {
        if (d.estado_revision === "aprobado") {
          docsCounts[d.persona_id] = (docsCounts[d.persona_id] || 0) + 1;
        }

        const type = d.tipo_documento || "OTRO";
        if (!docsMapByType[type]) {
          docsMapByType[type] = { approved: 0, pending: 0, rejected: 0, missing: 0 };
        }
        if (d.estado_revision === "aprobado") docsMapByType[type].approved++;
        else if (d.estado_revision === "pendiente") docsMapByType[type].pending++;
        else if (d.estado_revision === "rechazado") docsMapByType[type].rejected++;

        // Add document expiration to calendar if exists
        if (d.fecha_vencimiento) {
          const person = becarios.find(b => b.id === d.persona_id) || monotributistas.find(m => m.id === d.persona_id);
          calendarEvents.push({
            id: `doc-exp-${d.persona_id}-${d.tipo_documento}`,
            date: d.fecha_vencimiento,
            title: `Vence ${d.tipo_documento} - ${person?.apellido_nombre || "Agente"}`,
            type: "vencimiento_documento",
            severity: "warning",
          });
        }
      });

      // Calculate legajo completion per area
      const areaCompletion: Record<string, { total: number; complete: number }> = {};
      targetAreaIds.forEach(id => {
        const aName = areaMap.get(id);
        if (aName) areaCompletion[aName] = { total: 0, complete: 0 };
      });

      activeBecs.forEach((b) => {
        const aName = areaMap.get(b.area_id) || "Sin Area";
        if (!areaCompletion[aName]) areaCompletion[aName] = { total: 0, complete: 0 };
        areaCompletion[aName].total++;
        if ((docsCounts[b.id] || 0) >= 6) areaCompletion[aName].complete++;

        // Count missing docs
        docCodes.slice(0, 6).forEach(code => {
          const hasDoc = docs?.some(d => d.persona_id === b.id && d.tipo_documento === code && d.estado_revision === "aprobado");
          if (!hasDoc) docsMapByType[code].missing++;
        });
      });

      activeMonos.forEach((m) => {
        const aName = areaMap.get(m.area_id) || "Sin Area";
        if (!areaCompletion[aName]) areaCompletion[aName] = { total: 0, complete: 0 };
        areaCompletion[aName].total++;
        if ((docsCounts[m.id] || 0) >= 7) areaCompletion[aName].complete++;

        // Count missing docs (monotributistas require CONSTANCIA_ARCA and SEGURO_VIDA as well)
        docCodes.forEach(code => {
          const hasDoc = docs?.some(d => d.persona_id === m.id && d.tipo_documento === code && d.estado_revision === "aprobado");
          if (!hasDoc) docsMapByType[code].missing++;
        });
      });

      const completionByArea = Object.entries(areaCompletion).map(([name, data]) => ({
        name,
        total: data.total,
        complete: data.complete,
        percentage: data.total > 0 ? Math.round((data.complete / data.total) * 100) : 0,
      })).sort((a, b) => b.percentage - a.percentage);

      const docTypesChecklist = Object.entries(docsMapByType).map(([name, data]) => ({
        name,
        ...data,
      }));

      docStats = {
        completionByArea,
        docTypesChecklist,
        docTypesMissing: docTypesChecklist.map(d => ({ name: d.name, value: d.missing })).filter(d => d.value > 0),
      };
    }

    // D. Insurance Expirations and Campaign Deadlines for Calendar
    if (activeMonos.length > 0) {
      const activeMonoIds = activeMonos.map((m) => m.id);
      const { data: insurances } = await supabase
        .from("vencimientos_seguros")
        .select("*")
        .in("monotributista_id", activeMonoIds);

      insurances?.forEach((ins) => {
        const mono = activeMonos.find((m) => m.id === ins.monotributista_id);
        if (mono) {
          calendarEvents.push({
            id: ins.id,
            date: ins.fecha_vencimiento,
            title: `Vence Seguro - ${mono.apellido_nombre}`,
            type: "seguro",
            severity: new Date(ins.fecha_vencimiento) <= new Date() ? "danger" : "warning",
            agentName: mono.apellido_nombre,
          });
        }
      });
    }

    // Campaign deadlines
    const { data: campaigns } = await supabase
      .from("campanas_documentacion")
      .select("id, nombre, fecha_fin");

    campaigns?.forEach((c) => {
      calendarEvents.push({
        id: c.id,
        date: c.fecha_fin,
        title: `Fecha Límite: ${c.nombre}`,
        type: "campaña",
        severity: "info",
      });
    });

    return NextResponse.json({
      personalStats: {
        total: totalActiveCount,
        becarios: activeBecs.length,
        monotributistas: activeMonos.length,
        byArea: personalByArea,
        byCategory: personalByCategory,
      },
      financialStats: {
        totalBudget: totalCost,
        becariosBudget: becsCost,
        monosBudget: monosCost,
        byArea: financialByArea,
        evolution,
      },
      docStats,
      calendarEvents,
    });
  } catch (error: any) {
    console.error("Portal Analytics API Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
