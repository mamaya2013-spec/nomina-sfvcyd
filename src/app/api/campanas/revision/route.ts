import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  try {
    const body = await req.json();
    const { documento_id, estado_revision, observaciones_revision } = body;

    if (!documento_id || !estado_revision) {
      return NextResponse.json({ error: "Faltan parámetros 'documento_id' o 'estado_revision'." }, { status: 400 });
    }

    if (!["aprobado", "rechazado"].includes(estado_revision)) {
      return NextResponse.json({ error: "Estado de revisión inválido." }, { status: 400 });
    }

    const { data: { user } } = await supabase.auth.getUser();

    // 1. Update Document status
    const { data: doc, error: docErr } = await supabase
      .from("documentos")
      .update({
        estado_revision,
        observaciones_revision: observaciones_revision || null,
        revisado_por: user?.id || null,
      })
      .eq("id", documento_id)
      .select()
      .single();

    if (docErr) throw docErr;

    // 2. Fetch active campaigns for this person's type
    const { data: campaigns } = await supabase
      .from("campanas_documentacion")
      .select("*")
      .eq("estado", "activa");

    const filteredCampaigns = (campaigns || []).filter((c) => {
      // Check if campaign applies to this person type
      if (c.aplica_a === "ambos") return true;
      if (c.aplica_a === "becarios" && doc.tipo_persona === "becario") return true;
      if (c.aplica_a === "monotributistas" && doc.tipo_persona === "monotributista") return true;
      return false;
    });

    // 3. For each campaign, recalculate overall status for this person
    for (const c of filteredCampaigns) {
      const requiredDocs = c.tipo_documentos_requeridos as string[];

      // Check if this campaign requires the document that was just reviewed
      if (!requiredDocs.includes(doc.tipo_documento)) {
        continue;
      }

      // Fetch all documents uploaded by this person
      const { data: personDocs } = await supabase
        .from("documentos")
        .select("tipo_documento, estado_revision")
        .eq("persona_id", doc.persona_id);

      // Evaluate overall status
      let allApproved = true;
      let anyRejected = false;

      for (const reqType of requiredDocs) {
        const matchingDoc = (personDocs || []).find((d) => d.tipo_documento === reqType);

        if (!matchingDoc) {
          allApproved = false;
        } else {
          if (matchingDoc.estado_revision === "rechazado") {
            anyRejected = true;
          }
          if (matchingDoc.estado_revision !== "aprobado") {
            allApproved = false;
          }
        }
      }

      let newDeliveryStatus: "pendiente" | "entregado" | "rechazado" = "pendiente";
      if (allApproved) {
        newDeliveryStatus = "entregado";
      } else if (anyRejected) {
        newDeliveryStatus = "rechazado";
      }

      // Update the delivery row for this person and campaign
      await supabase
        .from("campana_entregas")
        .update({
          estado_entrega: newDeliveryStatus,
          fecha_entrega: allApproved ? new Date().toISOString().split("T")[0] : null,
          revisado_por: user?.id || null,
          observaciones: observaciones_revision || null,
        })
        .eq("campana_id", c.id)
        .eq("persona_id", doc.persona_id);
    }

    // 4. Audit Log
    await supabase.from("audit_log").insert({
      usuario_id: user?.id,
      accion: `Revisión de Documento: ${estado_revision.toUpperCase()}`,
      tabla_afectada: "documentos",
      registro_id: doc.id,
      datos_nuevos: { estado_revision, observaciones_revision },
    });

    return NextResponse.json({ success: true, documento: doc });

  } catch (err: any) {
    console.error("Error in POST api/campanas/revision:", err);
    return NextResponse.json({ error: err.message || "Error al procesar revisión." }, { status: 500 });
  }
}
