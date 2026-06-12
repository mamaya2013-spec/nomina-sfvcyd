import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";


export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const semestreId = searchParams.get("semestre_id");

  if (!semestreId) {
    return NextResponse.json({ error: "Falta el parámetro 'semestre_id'." }, { status: 400 });
  }

  try {
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

    // 3. Sync executed amounts in DB and trigger alerts
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

      // Threshold alerts trigger
      const pct = ocRecord.monto_asignado > 0 ? (ocRecord.monto_ejecutado / ocRecord.monto_asignado) : 0;
      if (pct >= 0.80) {
        const threshold = pct >= 0.95 ? 95 : 80;
        const alertType = threshold === 95 ? "alerta" : "warning";
        const title = threshold === 95
          ? `Alerta Presupuestaria: Límite 95% superado en OC ${ocRecord.numero_oc}`
          : `Advertencia Presupuestaria: Límite 80% superado en OC ${ocRecord.numero_oc}`;
        const msg = threshold === 95
          ? `La Orden de Compromiso ${ocRecord.numero_oc} (${ocRecord.tipo.toUpperCase()}) se encuentra al ${(pct * 100).toFixed(1)}% de ejecución (Monto: $${Number(ocRecord.monto_ejecutado).toLocaleString("es-AR")}).`
          : `La Orden de Compromiso ${ocRecord.numero_oc} (${ocRecord.tipo.toUpperCase()}) ha superado el 80% de ejecución (Monto: $${Number(ocRecord.monto_ejecutado).toLocaleString("es-AR")}).`;

        // Check if notification already exists
        const { data: existingNotif } = await supabase
          .from("notificaciones")
          .select("id")
          .eq("titulo", title)
          .limit(1);

        if (!existingNotif || existingNotif.length === 0) {
          // Send notification to all admin/editor users
          const { data: adminUsers } = await supabase
            .from("users")
            .select("id")
            .in("rol", ["admin", "editor"]);

          if (adminUsers && adminUsers.length > 0) {
            const notifs = adminUsers.map((u) => ({
              usuario_id: u.id,
              titulo: title,
              mensaje: msg,
              tipo: alertType,
              link: "/dashboard/ordenes",
              leida: false,
            }));
            await supabase.from("notificaciones").insert(notifs);
          }
        }
      }
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

  } catch (err: any) {
    console.error("Error in GET api/ordenes:", err);
    return NextResponse.json({ error: err.message || "Error al obtener órdenes de compromiso." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  try {
    const body = await req.json();
    const { id, semestre_id, tipo, monto_asignado, numero_oc, descripcion } = body;

    if (!semestre_id || !tipo || !monto_asignado || !numero_oc) {
      return NextResponse.json({ error: "Faltan parámetros obligatorios." }, { status: 400 });
    }

    if (!["becas", "monotributos", "activa_becas", "activa_monotributos"].includes(tipo)) {
      return NextResponse.json({ error: "Tipo de Orden de Compromiso inválido." }, { status: 400 });
    }

    // Check if semester is locked
    const { data: semester } = await supabase
      .from("semestres")
      .select("bloqueado")
      .eq("id", semestre_id)
      .single();

    if (semester?.bloqueado) {
      return NextResponse.json({ error: "El semestre correspondiente está cerrado y no se puede modificar." }, { status: 400 });
    }

    let result;
    if (id) {
      // Update existing
      const { data, error } = await supabase
        .from("ordenes_compromiso")
        .update({
          monto_asignado,
          numero_oc,
          descripcion,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Check if this type already exists in this semester
      const { data: existing } = await supabase
        .from("ordenes_compromiso")
        .select("id")
        .eq("semestre_id", semestre_id)
        .eq("tipo", tipo)
        .maybeSingle();

      if (existing) {
        return NextResponse.json({ error: "Ya existe una asignación presupuestaria de este tipo para el semestre." }, { status: 400 });
      }

      // Insert new
      const { data, error } = await supabase
        .from("ordenes_compromiso")
        .insert({
          semestre_id,
          tipo,
          monto_asignado,
          numero_oc,
          descripcion,
          monto_ejecutado: 0.00,
        })
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    // Audit log
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("audit_log").insert({
      usuario_id: user?.id,
      accion: id ? "Modificación de Asignación OC" : "Creación de Asignación OC",
      tabla_afectada: "ordenes_compromiso",
      registro_id: result.id,
      datos_nuevos: { numero_oc, monto_asignado, tipo },
    });

    return NextResponse.json({ success: true, orden: result });

  } catch (err: any) {
    console.error("Error in POST api/ordenes:", err);
    return NextResponse.json({ error: err.message || "Error al guardar la orden de compromiso." }, { status: 500 });
  }
}
