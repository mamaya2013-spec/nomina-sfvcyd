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

    if (!session.es_secretario) {
      return NextResponse.json(
        { error: "No autorizado. Esta acción requiere permisos de Secretario." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const semestreId = searchParams.get("semestre_id");

    if (!semestreId) {
      return NextResponse.json({ error: "Falta el parámetro 'semestre_id'." }, { status: 400 });
    }

    const supabase = await createClient();

    // 1. Fetch current OCs for the semester
    const { data: ocs, error: ocsErr } = await supabase
      .from("ordenes_compromiso")
      .select("*")
      .eq("semestre_id", semestreId);

    if (ocsErr) throw ocsErr;

    // 2. Fetch processed/paid liquidations for this semester
    const { data: liqs, error: liqsErr } = await supabase
      .from("liquidaciones_mensuales")
      .select("tipo_persona, monto_beca_o_mono, monto_tarjeta_activa")
      .eq("semestre_id", semestreId)
      .in("estado_liquidacion", ["procesada", "pagada"]);

    if (liqsErr) throw liqsErr;

    // Calculate execution amounts
    let becasExec = 0;
    let monosExec = 0;
    let activaBecasExec = 0;
    let activaMonosExec = 0;

    for (const l of (liqs || [])) {
      if (l.tipo_persona === "becario") {
        becasExec += Number(l.monto_beca_o_mono || 0);
        activaBecasExec += Number(l.monto_tarjeta_activa || 0);
      } else if (l.tipo_persona === "monotributista") {
        monosExec += Number(l.monto_beca_o_mono || 0);
        activaMonosExec += Number(l.monto_tarjeta_activa || 0);
      }
    }

    const execMap = {
      becas: Math.round(becasExec * 100) / 100,
      monotributos: Math.round(monosExec * 100) / 100,
      activa_becas: Math.round(activaBecasExec * 100) / 100,
      activa_monotributos: Math.round(activaMonosExec * 100) / 100,
    };

    // Slices of updated OCs
    const updatedOcs: any[] = [];

    // 3. Sync executed amounts in DB
    for (const oc of (ocs || [])) {
      const currentExec = execMap[oc.tipo as keyof typeof execMap] || 0;
      let ocRecord = { ...oc };

      if (Number(oc.monto_ejecutado) !== currentExec) {
        const { data: updOc } = await supabase
          .from("ordenes_compromiso")
          .update({ monto_ejecutado: currentExec })
          .eq("id", oc.id)
          .select()
          .single();
        if (updOc) {
          ocRecord = updOc;
        }
      }

      updatedOcs.push(ocRecord);
    }

    // --- Proyecciones Presupuestarias ---
    const { data: semester } = await supabase
      .from("semestres")
      .select("*")
      .eq("id", semestreId)
      .single();

    const numSemestre = semester?.numero_semestre || 1;
    const monthsOfSemester = numSemestre === 1 ? [1, 2, 3, 4, 5, 6] : [7, 8, 9, 10, 11, 12];

    const { data: liquidatedMonthsData } = await supabase
      .from("liquidaciones_mensuales")
      .select("mes")
      .eq("semestre_id", semestreId)
      .in("estado_liquidacion", ["procesada", "pagada"]);

    const uniqueLiquidatedMonths = Array.from(
      new Set((liquidatedMonthsData || []).map((l) => l.mes))
    );

    const remainingMonths = semester?.bloqueado
      ? []
      : monthsOfSemester.filter((m) => !uniqueLiquidatedMonths.includes(m));
    const qtyRemainingMonths = remainingMonths.length;

    const { data: activeBecarios } = await supabase
      .from("becarios")
      .select("importe_mensual_beca, importe_tarjeta_activa")
      .eq("estado", "Activo");

    const { data: activeMonotributistas } = await supabase
      .from("monotributistas")
      .select("importe_mensual_monotributo, importe_tarjeta_activa")
      .eq("estado", "Activo");

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

    return NextResponse.json({
      success: true,
      ordenes: updatedOcs,
      ejecucion_mensual: execMap,
      proyecciones: projectionsMap,
    });
  } catch (error: any) {
    console.error("Portal OCs API error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}
