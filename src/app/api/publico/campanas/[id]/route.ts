import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { uploadToGoogleDrive } from "@/lib/google-drive";

// Helper to calculate total days in a month
function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const dni = searchParams.get("dni");

  if (!id) {
    return NextResponse.json({ error: "Falta el ID de la campaña." }, { status: 400 });
  }

  if (!dni) {
    return NextResponse.json({ error: "Falta ingresar el DNI del agente." }, { status: 400 });
  }

  const supabase = await createClient();

  try {
    // 1. Fetch Campaign
    const { data: campaign, error: campErr } = await supabase
      .from("campanas_documentacion")
      .select("*")
      .eq("id", id)
      .single();

    if (campErr || !campaign) {
      return NextResponse.json({ error: "Campaña no encontrada." }, { status: 404 });
    }

    // 2. Search Person (try becarios first, then monotributistas)
    const { data: becario } = await supabase
      .from("becarios")
      .select("id, apellido_nombre, cuit, dni, subsecretaria_id, subsecretarias(nombre)")
      .eq("dni", dni)
      .maybeSingle();

    const { data: monotributista } = await supabase
      .from("monotributistas")
      .select("id, apellido_nombre, cuit, dni, subsecretaria_id, subsecretarias(nombre)")
      .eq("dni", dni)
      .maybeSingle();

    const person = becario || monotributista;

    if (!person) {
      return NextResponse.json(
        { error: "El DNI ingresado no corresponde a ningún agente registrado." },
        { status: 404 }
      );
    }

    const tipoPersona = becario ? "becario" : "monotributista";

    // 3. Verify enrollment in campaign
    const { data: delivery } = await supabase
      .from("campana_entregas")
      .select("*")
      .eq("campana_id", id)
      .eq("persona_id", person.id)
      .maybeSingle();

    if (!delivery) {
      return NextResponse.json(
        { error: "El agente no está afectado por esta campaña de actualización." },
        { status: 403 }
      );
    }

    // 4. Fetch already uploaded documents for this campaign
    const { data: docs } = await supabase
      .from("documentos")
      .select("id, tipo_documento, nombre_archivo, url_supabase, estado_revision, observaciones_revision, es_turno, fecha_turno")
      .eq("persona_id", person.id)
      .eq("campana_id", id);

    return NextResponse.json({
      success: true,
      persona: {
        id: person.id,
        apellido_nombre: person.apellido_nombre,
        cuit: person.cuit || "-",
        dni: person.dni,
        tipo_persona: tipoPersona,
        subsecretaria: (person as any).subsecretarias?.nombre || "Sin Subsecretaría",
      },
      campana: {
        id: campaign.id,
        nombre: campaign.nombre,
        descripcion: campaign.descripcion,
        fecha_limite: campaign.fecha_limite,
        tipo_documentos_requeridos: campaign.tipo_documentos_requeridos,
      },
      documentos: docs || [],
      entrega: delivery,
    });
  } catch (err: any) {
    console.error("Error in public portal GET:", err);
    return NextResponse.json({ error: err.message || "Error al procesar consulta." }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  if (!id) {
    return NextResponse.json({ error: "Falta el ID de la campaña." }, { status: 400 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const personaId = formData.get("persona_id") as string | null;
    const tipoPersona = formData.get("tipo_persona") as string | null;
    const tipoDocumento = formData.get("tipo_documento") as string | null;
    const fechaEmisionStr = formData.get("fecha_emision") as string | null;
    const fechaVencimientoStr = formData.get("fecha_vencimiento") as string | null;
    const esTurnoStr = formData.get("es_turno") as string | null;
    const fechaTurnoStr = formData.get("fecha_turno") as string | null;

    if (!file || !personaId || !tipoPersona || !tipoDocumento) {
      return NextResponse.json({ error: "Faltan parámetros obligatorios para la carga." }, { status: 400 });
    }

    if (!["becario", "monotributista"].includes(tipoPersona)) {
      return NextResponse.json({ error: "Tipo de persona inválido." }, { status: 400 });
    }

    // PDF Validation
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      return NextResponse.json({ error: "Sólo se permiten archivos en formato PDF." }, { status: 400 });
    }

    const fileArrayBuffer = await file.arrayBuffer();
    const fileBuffer = new Uint8Array(fileArrayBuffer);
    const cleanFileName = `${tipoDocumento}_${Date.now()}.pdf`;
    const filePath = `${tipoPersona}/${personaId}/${cleanFileName}`;

    // 1. Upload to Supabase Storage
    let urlSupabase = "";
    try {
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from("documentos")
        .upload(filePath, fileBuffer, {
          contentType: "application/pdf",
          upsert: true,
        });

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ntglefztorxxdixpmnaj.supabase.co";
      if (uploadErr) {
        urlSupabase = `${supabaseUrl}/storage/v1/object/public/documentos/${filePath}`;
      } else {
        const { data: urlData } = supabase.storage.from("documentos").getPublicUrl(filePath);
        urlSupabase = urlData?.publicUrl || "";
      }
    } catch (storageErr: any) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ntglefztorxxdixpmnaj.supabase.co";
      urlSupabase = `${supabaseUrl}/storage/v1/object/public/documentos/${filePath}`;
    }

    // 2. Upload to Google Drive
    let urlGoogleDrive = "";
    try {
      urlGoogleDrive = await uploadToGoogleDrive(file.name, "application/pdf", fileArrayBuffer);
    } catch (gdErr) {
      console.warn("Google Drive upload failed:", gdErr);
    }

    // 3. Save Document metadata in DB
    const insertData: any = {
      tipo_persona: tipoPersona,
      persona_id: personaId,
      nombre_archivo: file.name,
      tipo_documento: tipoDocumento,
      url_supabase: urlSupabase,
      url_google_drive: urlGoogleDrive,
      tamano_bytes: file.size,
      estado_revision: "pendiente",
      campana_id: id,
    };

    if (fechaEmisionStr && fechaEmisionStr.trim() !== "") {
      insertData.fecha_emision = fechaEmisionStr;
    }

    if (fechaVencimientoStr && fechaVencimientoStr.trim() !== "") {
      insertData.fecha_vencimiento = fechaVencimientoStr;
    }

    if (esTurnoStr === "true") {
      insertData.es_turno = true;
    }

    if (fechaTurnoStr && fechaTurnoStr.trim() !== "") {
      insertData.fecha_turno = fechaTurnoStr;
    }

    // Check and remove old doc for this person, type and campaign
    const { data: existingDoc } = await supabase
      .from("documentos")
      .select("id, url_supabase")
      .eq("persona_id", personaId)
      .eq("tipo_documento", tipoDocumento)
      .eq("campana_id", id)
      .limit(1);

    if (existingDoc && existingDoc.length > 0) {
      const oldPath = existingDoc[0].url_supabase?.split("/public/documentos/")[1];
      if (oldPath) {
        await supabase.storage.from("documentos").remove([oldPath]);
      }
      await supabase.from("documentos").delete().eq("id", existingDoc[0].id);
    }

    const { data: savedDoc, error: docErr } = await supabase
      .from("documentos")
      .insert(insertData)
      .select()
      .single();

    if (docErr) throw docErr;

    // 4. Handle insurance tracker
    if (tipoDocumento === "seguro_vigente" && tipoPersona === "monotributista" && fechaVencimientoStr) {
      const { data: existingInsurance } = await supabase
        .from("vencimientos_seguros")
        .select("id")
        .eq("monotributista_id", personaId)
        .maybeSingle();

      const insuranceData = {
        monotributista_id: personaId,
        documento_id: savedDoc.id,
        fecha_vencimiento: fechaVencimientoStr,
        alerta_30_dias_enviada: false,
        alerta_15_dias_enviada: false,
        alerta_7_dias_enviada: false,
        alerta_vencido_enviada: false,
        estado: "vigente",
      };

      if (existingInsurance) {
        await supabase.from("vencimientos_seguros").update(insuranceData).eq("id", existingInsurance.id);
      } else {
        await supabase.from("vencimientos_seguros").insert(insuranceData);
      }
    }

    // 5. Recalculate campaign delivery state for this person
    const { data: camp } = await supabase
      .from("campanas_documentacion")
      .select("tipo_documentos_requeridos")
      .eq("id", id)
      .single();
    const requiredDocs = (camp?.tipo_documentos_requeridos || []) as string[];

    const { data: personDocs } = await supabase
      .from("documentos")
      .select("tipo_documento, estado_revision")
      .eq("persona_id", personaId)
      .eq("campana_id", id);

    let allApproved = true;
    let anyRejected = false;

    for (const reqType of requiredDocs) {
      // Use the newly uploaded doc's pending state if it matches reqType
      const matchingDoc = reqType === tipoDocumento
        ? { estado_revision: "pendiente" }
        : (personDocs || []).find((d) => d.tipo_documento === reqType);

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

    await supabase
      .from("campana_entregas")
      .update({
        estado_entrega: newDeliveryStatus,
        fecha_entrega: allApproved ? new Date().toISOString().split("T")[0] : null,
        observaciones: null, // Clear old admin comments upon re-upload
      })
      .eq("campana_id", id)
      .eq("persona_id", personaId);

    // 6. Audit Log
    await supabase.from("audit_log").insert({
      usuario_id: null, // Public portal upload
      accion: "Carga Pública de Documento (Portal)",
      tabla_afectada: "documentos",
      registro_id: savedDoc.id,
      datos_nuevos: { tipo_documento: tipoDocumento, nombre_archivo: file.name, campana_id: id },
    });

    return NextResponse.json({ success: true, documento: savedDoc });
  } catch (err: any) {
    console.error("Error in public portal POST upload:", err);
    return NextResponse.json({ error: err.message || "Error al subir el archivo." }, { status: 500 });
  }
}
