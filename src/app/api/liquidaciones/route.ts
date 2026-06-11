import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = 'edge';

// Helper to calculate total days in a month
function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const mesStr = searchParams.get("mes");
  const anioStr = searchParams.get("anio");

  if (!mesStr || !anioStr) {
    return NextResponse.json({ error: "Faltan parámetros 'mes' y 'anio'." }, { status: 400 });
  }

  const mes = parseInt(mesStr);
  const anio = parseInt(anioStr);

  if (isNaN(mes) || isNaN(anio) || mes < 1 || mes > 12) {
    return NextResponse.json({ error: "Parámetros 'mes' y 'anio' inválidos." }, { status: 400 });
  }

  try {
    // 1. Resolve Semester covering this period
    const { data: semester, error: semErr } = await supabase
      .from("semestres")
      .select("*")
      .eq("anio", anio)
      .eq("numero_semestre", mes <= 6 ? 1 : 2)
      .maybeSingle();

    if (semErr) throw semErr;

    // 2. Query existing liquidations in DB
    const { data: savedLiquidations, error: liqErr } = await supabase
      .from("liquidaciones_mensuales")
      .select("*")
      .eq("anio", anio)
      .eq("mes", mes);

    if (liqErr) throw liqErr;

    const exists = savedLiquidations && savedLiquidations.length > 0;

    if (exists) {
      // Retrieve list with names and CBU/CUIL from live tables
      // For becarios
      const { data: becariosLiq } = await supabase
        .from("liquidaciones_mensuales")
        .select(`
          *,
          becarios(id, apellido_nombre, cuit, cbu, categorias_becas(numero_categoria))
        `)
        .eq("anio", anio)
        .eq("mes", mes)
        .eq("tipo_persona", "becario");

      // For monotributistas
      const { data: monosLiq } = await supabase
        .from("liquidaciones_mensuales")
        .select(`
          *,
          monotributistas(id, apellido_nombre, cuit, cbu, categorias_monotributistas(letra))
        `)
        .eq("anio", anio)
        .eq("mes", mes)
        .eq("tipo_persona", "monotributista");

      const list = [
        ...(becariosLiq || []).map((l: any) => ({
          id: l.id,
          tipo_persona: "becario",
          persona_id: l.persona_id,
          apellido_nombre: l.becarios?.apellido_nombre || "Desconocido",
          cuit: l.becarios?.cuit || "-",
          cbu: l.becarios?.cbu || "-",
          categoria: l.becarios?.categorias_becas?.numero_categoria 
            ? `Cat. ${l.becarios.categorias_becas.numero_categoria}`
            : "-",
          monto_base: Number(l.monto_beca_o_mono),
          monto_tarjeta_activa: Number(l.monto_tarjeta_activa),
          total_liquidado: Number(l.total_liquidado),
        })),
        ...(monosLiq || []).map((l: any) => ({
          id: l.id,
          tipo_persona: "monotributista",
          persona_id: l.persona_id,
          apellido_nombre: l.monotributistas?.apellido_nombre || "Desconocido",
          cuit: l.monotributistas?.cuit || "-",
          cbu: l.monotributistas?.cbu || "-",
          categoria: l.monotributistas?.categorias_monotributistas?.letra 
            ? `Letra ${l.monotributistas.categorias_monotributistas.letra}`
            : "-",
          monto_base: Number(l.monto_beca_o_mono),
          monto_tarjeta_activa: Number(l.monto_tarjeta_activa),
          total_liquidado: Number(l.total_liquidado),
        })),
      ];

      const status = savedLiquidations[0].estado_liquidacion || "pendiente";

      return NextResponse.json({
        exists: true,
        status,
        semester,
        liquidations: list,
      });
    }

    // 3. If it doesn't exist, calculate PREVIEW in memory (if semester exists and is not locked)
    if (!semester) {
      return NextResponse.json({
        exists: false,
        status: "preview",
        semester: null,
        liquidations: [],
        message: "No hay un semestre configurado para este período.",
      });
    }

    if (semester.bloqueado) {
      return NextResponse.json({
        exists: false,
        status: "preview",
        semester,
        liquidations: [],
        message: "El semestre correspondiente está cerrado y no registra liquidaciones para este mes.",
      });
    }

    // Load active people or people dada de baja in this month
    const startOfMonthStr = `${anio}-${mes.toString().padStart(2, "0")}-01`;
    const daysInMonth = getDaysInMonth(anio, mes);
    const endOfMonthStr = `${anio}-${mes.toString().padStart(2, "0")}-${daysInMonth}`;

    const startOfMonth = new Date(anio, mes - 1, 1);
    const endOfMonth = new Date(anio, mes - 1, daysInMonth);

    // Fetch Becarios eligible
    const { data: becarios, error: becErr } = await supabase
      .from("becarios")
      .select(`
        *,
        categorias_becas(numero_categoria)
      `)
      .lte("fecha_alta", endOfMonthStr);

    if (becErr) throw becErr;

    // Fetch Monotributistas eligible
    const { data: monotributistas, error: monoErr } = await supabase
      .from("monotributistas")
      .select(`
        *,
        categorias_monotributistas(letra)
      `)
      .lte("fecha_alta", endOfMonthStr);

    if (monoErr) throw monoErr;

    const previewList: any[] = [];

    // Filter and calculate for becarios
    for (const b of (becarios || [])) {
      if (b.estado === "Baja" && new Date(b.fecha_baja) < startOfMonth) {
        continue; // Exclude
      }

      // Calculate active days
      const altaDate = new Date(b.fecha_alta);
      const start = altaDate > startOfMonth ? altaDate : startOfMonth;
      const end = b.estado === "Baja" && b.fecha_baja ? new Date(b.fecha_baja) : endOfMonth;

      let activeDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      if (activeDays < 0) activeDays = 0;
      if (activeDays > daysInMonth) activeDays = daysInMonth;

      const proration = activeDays / daysInMonth;

      const base = Number(b.importe_mensual_beca) * proration;
      const activa = Number(b.importe_tarjeta_activa) * proration;
      const total = Number(b.importe_total) * proration;

      previewList.push({
        persona_id: b.id,
        tipo_persona: "becario",
        apellido_nombre: b.apellido_nombre,
        cuit: b.cuit || "-",
        cbu: b.cbu || "-",
        categoria: b.categorias_becas?.numero_categoria ? `Cat. ${b.categorias_becas.numero_categoria}` : "-",
        monto_base: Math.round(base * 100) / 100,
        monto_tarjeta_activa: Math.round(activa * 100) / 100,
        total_liquidado: Math.round(total * 100) / 100,
        dias_activos: activeDays,
      });
    }

    // Filter and calculate for monotributistas
    for (const m of (monotributistas || [])) {
      if (m.estado === "Baja" && new Date(m.fecha_baja) < startOfMonth) {
        continue;
      }

      const altaDate = new Date(m.fecha_alta);
      const start = altaDate > startOfMonth ? altaDate : startOfMonth;
      const end = m.estado === "Baja" && m.fecha_baja ? new Date(m.fecha_baja) : endOfMonth;

      let activeDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      if (activeDays < 0) activeDays = 0;
      if (activeDays > daysInMonth) activeDays = daysInMonth;

      const proration = activeDays / daysInMonth;

      const base = Number(m.importe_mensual_monotributo) * proration;
      const activa = Number(m.importe_tarjeta_activa) * proration;
      const total = Number(m.importe_total) * proration;

      previewList.push({
        persona_id: m.id,
        tipo_persona: "monotributista",
        apellido_nombre: m.apellido_nombre,
        cuit: m.cuit || "-",
        cbu: m.cbu || "-",
        categoria: m.categorias_monotributistas?.letra ? `Letra ${m.categorias_monotributistas.letra}` : "-",
        monto_base: Math.round(base * 100) / 100,
        monto_tarjeta_activa: Math.round(activa * 100) / 100,
        total_liquidado: Math.round(total * 100) / 100,
        dias_activos: activeDays,
      });
    }

    return NextResponse.json({
      exists: false,
      status: "preview",
      semester,
      liquidations: previewList,
    });

  } catch (err: any) {
    console.error("Error loading liquidations:", err);
    return NextResponse.json({ error: err.message || "Error al cargar liquidaciones." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  try {
    const body = await req.json();
    const { mes, anio } = body;

    if (!mes || !anio) {
      return NextResponse.json({ error: "Faltan parámetros 'mes' y 'anio'." }, { status: 400 });
    }

    // 1. Check Semester
    const { data: semester, error: semErr } = await supabase
      .from("semestres")
      .select("*")
      .eq("anio", anio)
      .eq("numero_semestre", mes <= 6 ? 1 : 2)
      .maybeSingle();

    if (semErr) throw semErr;
    if (!semester) {
      return NextResponse.json({ error: "No hay un semestre configurado para este período." }, { status: 400 });
    }

    if (semester.bloqueado) {
      return NextResponse.json({ error: "El semestre correspondiente está bloqueado. No se permiten cambios." }, { status: 400 });
    }

    // 2. Check if already exists and is locked (procesada/pagada)
    const { data: existing } = await supabase
      .from("liquidaciones_mensuales")
      .select("estado_liquidacion")
      .eq("anio", anio)
      .eq("mes", mes)
      .limit(1);

    if (existing && existing.length > 0 && existing[0].estado_liquidacion !== "pendiente") {
      return NextResponse.json({ error: "La liquidación está procesada o pagada y no se puede modificar." }, { status: 400 });
    }

    // 3. Clear existing pending liquidations for this month
    if (existing && existing.length > 0) {
      const { error: delErr } = await supabase
        .from("liquidaciones_mensuales")
        .delete()
        .eq("anio", anio)
        .eq("mes", mes);
      if (delErr) throw delErr;
    }

    // 4. Calculate liquidations (same logic as GET preview)
    const startOfMonth = new Date(anio, mes - 1, 1);
    const daysInMonth = getDaysInMonth(anio, mes);
    const endOfMonthStr = `${anio}-${mes.toString().padStart(2, "0")}-${daysInMonth}`;
    const endOfMonth = new Date(anio, mes - 1, daysInMonth);

    // Fetch Becarios
    const { data: becarios } = await supabase
      .from("becarios")
      .select("*")
      .lte("fecha_alta", endOfMonthStr);

    // Fetch Monotributistas
    const { data: monotributistas } = await supabase
      .from("monotributistas")
      .select("*")
      .lte("fecha_alta", endOfMonthStr);

    const insertRows: any[] = [];

    // Process Becarios
    for (const b of (becarios || [])) {
      if (b.estado === "Baja" && new Date(b.fecha_baja) < startOfMonth) {
        continue;
      }

      const altaDate = new Date(b.fecha_alta);
      const start = altaDate > startOfMonth ? altaDate : startOfMonth;
      const end = b.estado === "Baja" && b.fecha_baja ? new Date(b.fecha_baja) : endOfMonth;

      let activeDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      if (activeDays < 0) activeDays = 0;
      if (activeDays > daysInMonth) activeDays = daysInMonth;

      const proration = activeDays / daysInMonth;

      insertRows.push({
        tipo_persona: "becario",
        persona_id: b.id,
        anio,
        mes,
        monto_beca_o_mono: Math.round(Number(b.importe_mensual_beca) * proration * 100) / 100,
        monto_tarjeta_activa: Math.round(Number(b.importe_tarjeta_activa) * proration * 100) / 100,
        total_liquidado: Math.round(Number(b.importe_total) * proration * 100) / 100,
        estado_liquidacion: "pendiente",
        semestre_id: semester.id,
      });
    }

    // Process Monotributistas
    for (const m of (monotributistas || [])) {
      if (m.estado === "Baja" && new Date(m.fecha_baja) < startOfMonth) {
        continue;
      }

      const altaDate = new Date(m.fecha_alta);
      const start = altaDate > startOfMonth ? altaDate : startOfMonth;
      const end = m.estado === "Baja" && m.fecha_baja ? new Date(m.fecha_baja) : endOfMonth;

      let activeDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      if (activeDays < 0) activeDays = 0;
      if (activeDays > daysInMonth) activeDays = daysInMonth;

      const proration = activeDays / daysInMonth;

      insertRows.push({
        tipo_persona: "monotributista",
        persona_id: m.id,
        anio,
        mes,
        monto_beca_o_mono: Math.round(Number(m.importe_mensual_monotributo) * proration * 100) / 100,
        monto_tarjeta_activa: Math.round(Number(m.importe_tarjeta_activa) * proration * 100) / 100,
        total_liquidado: Math.round(Number(m.importe_total) * proration * 100) / 100,
        estado_liquidacion: "pendiente",
        semestre_id: semester.id,
      });
    }

    if (insertRows.length > 0) {
      const { error: insErr } = await supabase
        .from("liquidaciones_mensuales")
        .insert(insertRows);
      if (insErr) throw insErr;
    }

    // Audit log
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("audit_log").insert({
      usuario_id: user?.id,
      accion: "Generación de Liquidación Mensual",
      tabla_afectada: "liquidaciones_mensuales",
      datos_nuevos: { anio, mes, cantidad_registros: insertRows.length },
    });

    return NextResponse.json({ success: true, count: insertRows.length });

  } catch (err: any) {
    console.error("Error generating liquidations:", err);
    return NextResponse.json({ error: err.message || "Error al generar liquidaciones." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const mesStr = searchParams.get("mes");
  const anioStr = searchParams.get("anio");

  if (!mesStr || !anioStr) {
    return NextResponse.json({ error: "Faltan parámetros 'mes' y 'anio'." }, { status: 400 });
  }

  const mes = parseInt(mesStr);
  const anio = parseInt(anioStr);

  try {
    // Check status first
    const { data: existing } = await supabase
      .from("liquidaciones_mensuales")
      .select("estado_liquidacion")
      .eq("anio", anio)
      .eq("mes", mes)
      .limit(1);

    if (!existing || existing.length === 0) {
      return NextResponse.json({ error: "La liquidación no existe." }, { status: 404 });
    }

    if (existing[0].estado_liquidacion !== "pendiente") {
      return NextResponse.json({ error: "No se puede eliminar una liquidación que no esté en estado pendiente." }, { status: 400 });
    }

    const { error: delErr } = await supabase
      .from("liquidaciones_mensuales")
      .delete()
      .eq("anio", anio)
      .eq("mes", mes);

    if (delErr) throw delErr;

    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("audit_log").insert({
      usuario_id: user?.id,
      accion: "Eliminación de Liquidación Mensual",
      tabla_afectada: "liquidaciones_mensuales",
      datos_anteriores: { anio, mes },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Error deleting liquidation:", err);
    return NextResponse.json({ error: err.message || "Error al eliminar la liquidación." }, { status: 500 });
  }
}
