import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  try {
    const body = await req.json();
    const { mes, anio, nuevo_estado } = body;

    if (!mes || !anio || !nuevo_estado) {
      return NextResponse.json({ error: "Faltan parámetros 'mes', 'anio' o 'nuevo_estado'." }, { status: 400 });
    }

    if (!["pendiente", "procesada", "pagada"].includes(nuevo_estado)) {
      return NextResponse.json({ error: "Estado de liquidación no válido." }, { status: 400 });
    }

    // 1. Resolve Semester
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
      return NextResponse.json({ error: "El semestre correspondiente está bloqueado y no permite modificaciones." }, { status: 400 });
    }

    // 2. Check if liquidation records exist
    const { data: existing } = await supabase
      .from("liquidaciones_mensuales")
      .select("estado_liquidacion")
      .eq("anio", anio)
      .eq("mes", mes)
      .limit(1);

    if (!existing || existing.length === 0) {
      return NextResponse.json({ error: "No existe liquidación generada para este período." }, { status: 404 });
    }

    // Prevent changing state if already "pagada" (payment is final, unless custom override)
    if (existing[0].estado_liquidacion === "pagada" && nuevo_estado !== "pagada") {
      // You can block or allow going back from Pagada, let's block to prevent edits once paid.
      return NextResponse.json({ error: "La liquidación ya se encuentra Pagada y no puede ser modificada." }, { status: 400 });
    }

    // 3. Update status
    const { error: updErr } = await supabase
      .from("liquidaciones_mensuales")
      .update({ estado_liquidacion: nuevo_estado })
      .eq("anio", anio)
      .eq("mes", mes);

    if (updErr) throw updErr;

    // 4. Audit Log
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("audit_log").insert({
      usuario_id: user?.id,
      accion: "Actualización de Estado de Liquidación",
      tabla_afectada: "liquidaciones_mensuales",
      datos_anteriores: { estado: existing[0].estado_liquidacion },
      datos_nuevos: { anio, mes, estado: nuevo_estado },
    });

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("Error updating liquidation status:", err);
    return NextResponse.json({ error: err.message || "Error al actualizar estado de la liquidación." }, { status: 500 });
  }
}
