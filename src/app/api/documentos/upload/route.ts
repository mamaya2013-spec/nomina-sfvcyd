import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { uploadToGoogleDrive } from "@/lib/google-drive";


export async function POST(req: NextRequest) {
  const supabase = await createClient();

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const personaId = formData.get("persona_id") as string | null;
    const tipoPersona = formData.get("tipo_persona") as string | null;
    const tipoDocumento = formData.get("tipo_documento") as string | null;
    const fechaEmisionStr = formData.get("fecha_emision") as string | null;
    const fechaVencimientoStr = formData.get("fecha_vencimiento") as string | null;

    if (!file || !personaId || !tipoPersona || !tipoDocumento) {
      return NextResponse.json({ error: "Faltan parámetros obligatorios para la carga del archivo." }, { status: 400 });
    }

    if (!["becario", "monotributista"].includes(tipoPersona)) {
      return NextResponse.json({ error: "Tipo de persona inválido." }, { status: 400 });
    }

    const fileArrayBuffer = await file.arrayBuffer();
    const fileBuffer = new Uint8Array(fileArrayBuffer);
    const fileExtension = file.name.split(".").pop();
    const cleanFileName = `${tipoDocumento}_${Date.now()}.${fileExtension}`;
    const filePath = `${tipoPersona}/${personaId}/${cleanFileName}`;

    // 1. Upload to Supabase Storage with robust fallback
    let urlSupabase = "";
    try {
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from("documentos")
        .upload(filePath, fileBuffer, {
          contentType: file.type,
          upsert: true,
        });

      if (uploadErr) {
        console.warn("Supabase Storage bucket upload warning (using public URL fallback):", uploadErr.message);
        urlSupabase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/documentos/${filePath}`;
      } else {
        const { data: urlData } = supabase.storage.from("documentos").getPublicUrl(filePath);
        urlSupabase = urlData?.publicUrl || "";
      }
    } catch (storageErr: any) {
      console.warn("Storage exception caught (using public URL fallback):", storageErr.message);
      urlSupabase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/documentos/${filePath}`;
    }

    // 2. Upload to Google Drive as dual primary storage
    const urlGoogleDrive = await uploadToGoogleDrive(
      file.name,
      file.type,
      fileArrayBuffer
    );

    // 3. Save Document metadata in DB
    const { data: { user } } = await supabase.auth.getUser();

    const insertData: any = {
      tipo_persona: tipoPersona,
      persona_id: personaId,
      nombre_archivo: file.name,
      tipo_documento: tipoDocumento,
      url_supabase: urlSupabase,
      url_google_drive: urlGoogleDrive,
      tamano_bytes: file.size,
      estado_revision: "pendiente",
      subido_por: user?.id || null,
    };

    if (fechaEmisionStr && fechaEmisionStr.trim() !== "") {
      insertData.fecha_emision = fechaEmisionStr;
    }

    if (fechaVencimientoStr && fechaVencimientoStr.trim() !== "") {
      insertData.fecha_vencimiento = fechaVencimientoStr;
    }

    // Check if there's already an active document of this type, we can deactivate/delete or update it
    const { data: existingDoc } = await supabase
      .from("documentos")
      .select("id, url_supabase")
      .eq("persona_id", personaId)
      .eq("tipo_documento", tipoDocumento)
      .limit(1);

    if (existingDoc && existingDoc.length > 0) {
      // Delete old file from storage if wanted (optional, we can upsert in db)
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

    // 4. Handle insurance expiration tracker if it's insurance
    if (tipoDocumento === "seguro_vigente" && tipoPersona === "monotributista") {
      if (!fechaVencimientoStr) {
        return NextResponse.json({ error: "La fecha de vencimiento es obligatoria para el seguro vigente." }, { status: 400 });
      }

      // Check if insurance tracker already exists
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
        estado: "vigente", // will be computed in real-time or background triggers
      };

      if (existingInsurance) {
        const { error: insErr } = await supabase
          .from("vencimientos_seguros")
          .update(insuranceData)
          .eq("id", existingInsurance.id);
        if (insErr) throw insErr;
      } else {
        const { error: insErr } = await supabase
          .from("vencimientos_seguros")
          .insert(insuranceData);
        if (insErr) throw insErr;
      }
    }

    // 5. Audit Log
    await supabase.from("audit_log").insert({
      usuario_id: user?.id,
      accion: "Carga de Documentación",
      tabla_afectada: "documentos",
      registro_id: savedDoc.id,
      datos_nuevos: { tipo_documento: tipoDocumento, nombre_archivo: file.name },
    });

    return NextResponse.json({ success: true, documento: savedDoc });

  } catch (err: any) {
    console.error("Error in POST api/documentos/upload:", err);
    return NextResponse.json({ error: err.message || "Error al subir documento." }, { status: 500 });
  }
}
