import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const semestreId = searchParams.get("semestre_id");

  try {
    // 1. Pending documents count
    const { count: pendingDocsCount, error: docsErr } = await supabase
      .from("documentos")
      .select("*", { count: "exact", head: true })
      .eq("estado_revision", "pendiente");

    if (docsErr) throw docsErr;

    // 2. Insurances expiring or expired (only active monotributistas)
    const { data: insurances, error: insErr } = await supabase
      .from("vencimientos_seguros")
      .select(`
        id,
        fecha_vencimiento,
        estado,
        monotributistas (
          id,
          apellido_nombre,
          cuit,
          estado
        )
      `)
      .order("fecha_vencimiento", { ascending: true });

    if (insErr) throw insErr;

    // Filter active monotributistas and insurances that are expired or expiring in <= 30 days
    const today = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(today.getDate() + 30);

    const insuranceAlerts = (insurances || [])
      .filter((ins: any) => {
        if (!ins.monotributistas || ins.monotributistas.estado !== "Activo") {
          return false;
        }
        const vDate = new Date(ins.fecha_vencimiento);
        return vDate <= thirtyDaysFromNow;
      })
      .map((ins: any) => {
        const vDate = new Date(ins.fecha_vencimiento);
        const diffTime = vDate.getTime() - today.getTime();
        const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        let severity: "danger" | "warning" = "warning";
        let message = "";

        if (daysRemaining <= 0) {
          severity = "danger";
          message = `Seguro Vencido: El seguro de ${ins.monotributistas.apellido_nombre} venció el ${vDate.toLocaleDateString("es-AR")}.`;
        } else {
          severity = "warning";
          message = `Seguro por Vencer: El seguro de ${ins.monotributistas.apellido_nombre} vence en ${daysRemaining} días (${vDate.toLocaleDateString("es-AR")}).`;
        }

        return {
          id: ins.id,
          tipo: "seguro",
          persona_id: ins.monotributistas.id,
          nombre: ins.monotributistas.apellido_nombre,
          fecha_vencimiento: ins.fecha_vencimiento,
          daysRemaining,
          severity,
          message,
        };
      });

    // 3. Órdenes de Compromiso warnings
    let ocAlerts: any[] = [];
    if (semestreId) {
      const { data: ocs, error: ocsErr } = await supabase
        .from("ordenes_compromiso")
        .select("*")
        .eq("semestre_id", semestreId);

      if (ocsErr) throw ocsErr;

      ocAlerts = (ocs || [])
        .map((oc: any) => {
          const asignado = Number(oc.monto_asignado);
          const ejecutado = Number(oc.monto_ejecutado || 0);
          const ratio = asignado > 0 ? ejecutado / asignado : 0;
          const pct = ratio * 100;

          let severity: "danger" | "warning" | null = null;
          let message = "";

          if (ratio >= 0.95) {
            severity = "danger";
            message = `Presupuesto Crítico: OC ${oc.numero_oc} (${oc.tipo.toUpperCase()}) al ${pct.toFixed(1)}% de ejecución (${ejecutado.toLocaleString("es-AR", { style: "currency", currency: "ARS" })} de ${asignado.toLocaleString("es-AR", { style: "currency", currency: "ARS" })}).`;
          } else if (ratio >= 0.80) {
            severity = "warning";
            message = `Presupuesto Límite: OC ${oc.numero_oc} (${oc.tipo.toUpperCase()}) al ${pct.toFixed(1)}% de ejecución (${ejecutado.toLocaleString("es-AR", { style: "currency", currency: "ARS" })} de ${asignado.toLocaleString("es-AR", { style: "currency", currency: "ARS" })}).`;
          }

          if (severity) {
            return {
              id: oc.id,
              tipo: "oc",
              numero_oc: oc.numero_oc,
              tipo_oc: oc.tipo,
              porcentaje_ejecucion: pct,
              severity,
              message,
            };
          }
          return null;
        })
        .filter(Boolean);
    }

    return NextResponse.json({
      success: true,
      pendingDocsCount: pendingDocsCount || 0,
      insuranceAlerts,
      ocAlerts,
    });
  } catch (err: any) {
    console.error("Error in GET /api/dashboard/alertas:", err);
    return NextResponse.json(
      { error: err.message || "Error al obtener alertas del dashboard." },
      { status: 500 }
    );
  }
}
