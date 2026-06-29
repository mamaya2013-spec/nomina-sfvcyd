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
        metrics: {
          totalPersonal: 0,
          becariosCount: 0,
          monotributistasCount: 0,
          costoMensualTotal: 0,
          docsCompletosPct: 0,
          alertasCount: 0,
        },
        charts: { distribution: [], costByArea: [], evolution: [], docsStatus: [] },
        recentActivity: [],
        alertsList: [],
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
      return NextResponse.json(
        { error: "Semestre no encontrado" },
        { status: 404 }
      );
    }

    // 2. Fetch area names and subsecretaria names for mapping
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
      targetSubIds = [...(subsecretarias_ids || [])];
      targetAreaIds = [...(areas_ids || [])];

      if (filterSub !== "all") {
        if (!subsecretarias_ids.includes(filterSub)) {
          return NextResponse.json({ error: "Acceso denegado a la subsecretaría filtrada" }, { status: 403 });
        }
        targetSubIds = [filterSub];
        // Filter target areas to only those belonging to this subsecretaría that the user has access to
        const allowedAreasInSub = allAreas
          ?.filter((a) => a.subsecretaria_id === filterSub && (areas_ids.includes(a.id) || subsecretarias_ids.includes(a.subsecretaria_id)))
          .map((a) => a.id) || [];
        targetAreaIds = allowedAreasInSub;
      }

      if (filterArea !== "all") {
        if (!areas_ids.includes(filterArea)) {
          // Check if it belongs to an allowed subsecretaría
          const parentSubId = areaSubMap.get(filterArea);
          if (!parentSubId || !subsecretarias_ids.includes(parentSubId)) {
            return NextResponse.json({ error: "Acceso denegado al área filtrada" }, { status: 403 });
          }
        }
        targetAreaIds = [filterArea];
        const parentSubId = areaSubMap.get(filterArea);
        targetSubIds = parentSubId ? [parentSubId] : [];
      }
    }

    let becarios: any[] = [];
    let monotributistas: any[] = [];
    let ocs: any[] = [];

    // 3. Load Nominas (either from snapshots or live)
    if (semestre.bloqueado) {
      // Historical Snapshot
      const { data: snap } = await supabase
        .from("snapshots_semestre")
        .select("*")
        .eq("semestre_id", semestreId)
        .maybeSingle();

      if (snap) {
        const rawBecs = snap.nomina_becarios_snapshot || [];
        const rawMonos = snap.nomina_monos_snapshot || [];
        ocs = snap.ordenes_compromiso_snapshot || [];

        // Filter snapshots in memory by target subsecretaría and area
        becarios = rawBecs.filter((b: any) => 
          (targetAreaIds.includes(b.area_id) || targetSubIds.includes(b.subsecretaria_id))
        );
        monotributistas = rawMonos.filter((m: any) => 
          (targetAreaIds.includes(m.area_id) || targetSubIds.includes(m.subsecretaria_id))
        );
      }
    } else {
      // Live Data
      // To build the OR filter for security:
      let queryFilter = "";
      if (targetAreaIds.length > 0) {
        queryFilter += `area_id.in.(${targetAreaIds.join(",")})`;
      }
      if (targetSubIds.length > 0) {
        if (queryFilter) queryFilter += ",";
        queryFilter += `subsecretaria_id.in.(${targetSubIds.join(",")})`;
      }

      if (queryFilter) {
        const { data: becs } = await supabase
          .from("becarios")
          .select("*")
          .or(queryFilter);
        const { data: monos } = await supabase
          .from("monotributistas")
          .select("*")
          .or(queryFilter);

        becarios = becs || [];
        monotributistas = monos || [];

        const { data: activeOcs } = await supabase
          .from("ordenes_compromiso")
          .select("*")
          .eq("semestre_id", semestreId);
        ocs = activeOcs || [];
      }
    }

    if (responsableId !== "all") {
      becarios = becarios.filter((b) => b.responsable_id === responsableId);
      monotributistas = monotributistas.filter((m) => m.responsable_id === responsableId);
    }

    // Filter people list for counts (Active only)
    const activeBecarios = becarios.filter((b) => b.estado === "Activo");
    const activeMonotributistas = monotributistas.filter((m) => m.estado === "Activo");
    const totalActiveCount = activeBecarios.length + activeMonotributistas.length;

    // Cost calculations
    const becariosCost = activeBecarios.reduce((sum, b) => sum + Number(b.importe_total || 0), 0);
    const monosCost = activeMonotributistas.reduce((sum, m) => sum + Number(m.importe_total || 0), 0);
    const totalCost = becariosCost + monosCost;

    // 4. Fetch approved document counts to calculate legajo completion
    // Get all active agent IDs
    const activeAgentIds = [...activeBecarios.map((b) => b.id), ...activeMonotributistas.map((m) => m.id)];

    let docsCounts: Record<string, number> = {};
    let pendingDocsCount = 0;
    let alertsList: any[] = [];

    if (activeAgentIds.length > 0) {
      // Fetch approved documents for active personnel
      const { data: docs } = await supabase
        .from("documentos")
        .select("persona_id, estado_revision, tipo_documento, fecha_vencimiento")
        .in("persona_id", activeAgentIds);

      docs?.forEach((d) => {
        if (d.estado_revision === "aprobado") {
          docsCounts[d.persona_id] = (docsCounts[d.persona_id] || 0) + 1;
        } else if (d.estado_revision === "pendiente") {
          pendingDocsCount++;
        }
      });

      // Filter docs for alerts (rejected documents)
      const rejectedDocs = docs?.filter((d) => d.estado_revision === "rechazado") || [];
      rejectedDocs.forEach((d) => {
        const person = becarios.find(b => b.id === d.persona_id) || monotributistas.find(m => m.id === d.persona_id);
        if (person && person.estado === "Activo") {
          alertsList.push({
            id: `doc-rej-${d.persona_id}-${d.tipo_documento}`,
            tipo: "documento_rechazado",
            persona_id: d.persona_id,
            nombre: person.apellido_nombre,
            tipo_persona: becarios.some(b => b.id === d.persona_id) ? "becario" : "monotributista",
            message: `Documento Rechazado: El documento '${d.tipo_documento}' de ${person.apellido_nombre} fue rechazado.`,
            severity: "warning",
          });
        }
      });
    }

    // Calculate complete legajos
    let completeLegajos = 0;
    activeBecarios.forEach((b) => {
      if ((docsCounts[b.id] || 0) >= 6) completeLegajos++;
    });
    activeMonotributistas.forEach((m) => {
      if ((docsCounts[m.id] || 0) >= 7) completeLegajos++;
    });

    const docsCompletosPct = totalActiveCount > 0 ? Math.round((completeLegajos / totalActiveCount) * 100) : 0;

    // 5. Insurance alerts (active monotributistas only)
    if (activeMonotributistas.length > 0) {
      const activeMonoIds = activeMonotributistas.map((m) => m.id);
      const { data: insurances } = await supabase
        .from("vencimientos_seguros")
        .select("*")
        .in("monotributista_id", activeMonoIds);

      const today = new Date();
      const thirtyDays = new Date();
      thirtyDays.setDate(today.getDate() + 30);

      insurances?.forEach((ins) => {
        const vDate = new Date(ins.fecha_vencimiento);
        if (vDate <= thirtyDays) {
          const mono = activeMonotributistas.find((m) => m.id === ins.monotributista_id);
          if (mono) {
            const diff = vDate.getTime() - today.getTime();
            const daysRemaining = Math.ceil(diff / (1000 * 60 * 60 * 24));
            const severity = daysRemaining <= 0 ? "danger" : "warning";
            const message = daysRemaining <= 0
              ? `Seguro Vencido: El seguro de ${mono.apellido_nombre} venció el ${vDate.toLocaleDateString("es-AR")}.`
              : `Seguro por Vencer: El seguro de ${mono.apellido_nombre} vence en ${daysRemaining} días (${vDate.toLocaleDateString("es-AR")}).`;

            alertsList.push({
              id: ins.id,
              tipo: "seguro",
              persona_id: mono.id,
              nombre: mono.apellido_nombre,
              tipo_persona: "monotributista",
              fecha_vencimiento: ins.fecha_vencimiento,
              daysRemaining,
              severity,
              message,
            });
          }
        }
      });
    }

    // Sort alerts by severity (danger first)
    alertsList.sort((a, b) => (a.severity === "danger" ? -1 : 1));

    // 6. Fetch movements for their personnel
    // We get all agent IDs (both active and inactive, to map history)
    const allAgentIds = [...becarios.map((b) => b.id), ...monotributistas.map((m) => m.id)];
    
    let recentActivity: any[] = [];
    let movementsForEvolution: any[] = [];

    if (allAgentIds.length > 0) {
      const { data: movs } = await supabase
        .from("movimientos")
        .select("*")
        .eq("anio", semestre.anio)
        .in("persona_id", allAgentIds)
        .order("created_at", { ascending: false });

      movementsForEvolution = movs || [];

      // Format recent activity
      recentActivity = (movs || []).slice(0, 10).map((m) => {
        const person = becarios.find((b) => b.id === m.persona_id) || monotributistas.find((mono) => mono.id === m.persona_id);
        return {
          id: m.id,
          tipo_movimiento: m.tipo_movimiento,
          tipo_persona: m.tipo_persona,
          persona_id: m.persona_id,
          nombre_persona: person ? person.apellido_nombre : "Desconocido",
          descripcion: m.descripcion,
          fecha: m.created_at,
          mes: m.mes,
          anio: m.anio,
        };
      });
    }

    // 7. Assemble Chart Data
    // A. Distribution
    const distribution = [
      { name: "Becarios", value: activeBecarios.length, color: "#3b82f6" },
      { name: "Monotributistas", value: activeMonotributistas.length, color: "#10b981" },
    ];

    // B. Cost by Area
    const costMap: Record<string, number> = {};
    // Initialize keys with all allowed area names to ensure they show up even with 0 cost
    targetAreaIds.forEach((aId) => {
      const aName = areaMap.get(aId);
      if (aName) costMap[aName] = 0;
    });

    activeBecarios.forEach((b) => {
      const aName = areaMap.get(b.area_id) || "Sin Area";
      costMap[aName] = (costMap[aName] || 0) + Number(b.importe_total || 0);
    });
    activeMonotributistas.forEach((m) => {
      const aName = areaMap.get(m.area_id) || "Sin Area";
      costMap[aName] = (costMap[aName] || 0) + Number(m.importe_total || 0);
    });

    const costByArea = Object.entries(costMap)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);

    // C. Evolution (Last 6 months altas vs bajas)
    const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const evolutionMap: Record<number, { monthName: string; altas: number; bajas: number }> = {};
    
    // Default last 6 months
    const currentMonthNum = new Date().getMonth() + 1; // 1-12
    for (let i = 5; i >= 0; i--) {
      let m = currentMonthNum - i;
      if (m <= 0) m += 12;
      evolutionMap[m] = { monthName: monthNames[m - 1], altas: 0, bajas: 0 };
    }

    movementsForEvolution.forEach((m) => {
      if (evolutionMap[m.mes]) {
        if (m.tipo_movimiento === "alta") {
          evolutionMap[m.mes].altas++;
        } else if (m.tipo_movimiento === "baja") {
          evolutionMap[m.mes].bajas++;
        }
      }
    });

    const evolution = Object.values(evolutionMap);

    // D. Docs status
    const docsStatus = [
      { name: "Al día (Legajo Completo)", value: completeLegajos, color: "#10b981" },
      { name: "Pendiente / Incompleto", value: totalActiveCount - completeLegajos, color: "#f59e0b" },
    ];

    // Calculate Month-over-Month comparison
    const now = new Date();
    const curMonth = now.getMonth() + 1;
    const curYear = now.getFullYear();

    let personalDiff = 0;
    let costDiff = 0;

    if (allAgentIds.length > 0) {
      const { data: monthMovs } = await supabase
        .from("movimientos")
        .select("*")
        .eq("mes", curMonth)
        .eq("anio", curYear)
        .in("persona_id", allAgentIds);

      const altasCount = monthMovs?.filter((m) => m.tipo_movimiento === "alta").length || 0;
      const bajasCount = monthMovs?.filter((m) => m.tipo_movimiento === "baja").length || 0;
      personalDiff = altasCount - bajasCount;

      monthMovs?.forEach((m) => {
        const amtNew = Number(m.datos_nuevos?.importe_total || m.datos_nuevos?.importe_mensual_beca || m.datos_nuevos?.importe_mensual_monotributo || 0);
        const amtOld = Number(m.datos_anteriores?.importe_total || m.datos_anteriores?.importe_mensual_beca || m.datos_anteriores?.importe_mensual_monotributo || 0);
        
        if (m.tipo_movimiento === "alta") {
          costDiff += amtNew;
        } else if (m.tipo_movimiento === "baja") {
          costDiff -= amtOld;
        } else if (m.tipo_movimiento === "cambio_monto" || m.tipo_movimiento === "cambio_categoria") {
          costDiff += (amtNew - amtOld);
        }
      });
    }

    const prevPersonal = totalActiveCount - personalDiff;
    const prevCost = totalCost - costDiff;

    const personalDiffPct = prevPersonal > 0 ? Math.round((personalDiff / prevPersonal) * 100) : 0;
    const costDiffPct = prevCost > 0 ? Math.round((costDiff / prevCost) * 100) : 0;

    // --- Proyecciones Presupuestarias para el Secretario ---
    const numSemestre = semestre?.numero_semestre || 1;
    const monthsOfSemester = numSemestre === 1 ? [1, 2, 3, 4, 5, 6] : [7, 8, 9, 10, 11, 12];

    const { data: liquidatedMonthsData } = await supabase
      .from("liquidaciones_mensuales")
      .select("mes")
      .eq("semestre_id", semestreId)
      .in("estado_liquidacion", ["procesada", "pagada"]);

    const uniqueLiquidatedMonths = Array.from(
      new Set((liquidatedMonthsData || []).map((l) => l.mes))
    );

    const remainingMonths = semestre?.bloqueado
      ? []
      : monthsOfSemester.filter((m) => !uniqueLiquidatedMonths.includes(m));
    const qtyRemainingMonths = remainingMonths.length;

    const monthlyCost = {
      becas: (activeBecarios || []).reduce((sum, b) => sum + Number(b.importe_mensual_beca || 0), 0),
      monotributos: (activeMonotributistas || []).reduce((sum, m) => sum + Number(m.importe_mensual_monotributo || 0), 0),
      activa_becas: (activeBecarios || []).reduce((sum, b) => sum + Number(b.importe_tarjeta_activa || 0), 0),
      activa_monotributos: (activeMonotributistas || []).reduce((sum, m) => sum + Number(m.importe_tarjeta_activa || 0), 0),
    };

    const projectionsMap = {
      becas: {
        costo_mensual: Math.round(monthlyCost.becas * 100) / 100,
        meses_restantes: qtyRemainingMonths,
        meses_restantes_list: remainingMonths,
      },
      monotributos: {
        costo_mensual: Math.round(monthlyCost.monotributos * 100) / 100,
        meses_restantes: qtyRemainingMonths,
        meses_restantes_list: remainingMonths,
      },
      activa_becas: {
        costo_mensual: Math.round(monthlyCost.activa_becas * 100) / 100,
        meses_restantes: qtyRemainingMonths,
        meses_restantes_list: remainingMonths,
      },
      activa_monotributos: {
        costo_mensual: Math.round(monthlyCost.activa_monotributos * 100) / 100,
        meses_restantes: qtyRemainingMonths,
        meses_restantes_list: remainingMonths,
      },
    };

    // Response object
    return NextResponse.json({
      metrics: {
        totalPersonal: totalActiveCount,
        becariosCount: activeBecarios.length,
        monotributistasCount: activeMonotributistas.length,
        costoMensualTotal: totalCost,
        docsCompletosPct,
        alertasCount: alertsList.length + pendingDocsCount,
        comparison: {
          personalDiff,
          personalDiffPct,
          costDiff,
          costDiffPct,
        }
      },
      charts: {
        distribution,
        costByArea,
        evolution,
        docsStatus,
      },
      recentActivity,
      alertsList,
      ocs: ocs || [],
      proyecciones: projectionsMap,
    });
  } catch (error: any) {
    console.error("Portal Dashboard API Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
