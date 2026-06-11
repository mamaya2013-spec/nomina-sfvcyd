import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();

  try {
    // 1. Fetch campaigns
    const { data: campaigns, error: campErr } = await supabase
      .from("campanas_documentacion")
      .select("*")
      .order("created_at", { ascending: false });

    if (campErr) throw campErr;

    // 2. Fetch deliveries count and approved count for each campaign to provide stats
    const campaignsWithStats = await Promise.all(
      (campaigns || []).map(async (camp) => {
        const { data: deliveries } = await supabase
          .from("campana_entregas")
          .select("estado_entrega")
          .eq("campana_id", camp.id);

        const total = deliveries?.length || 0;
        const approved = deliveries?.filter((d) => d.estado_entrega === "entregado").length || 0;
        const pending = deliveries?.filter((d) => d.estado_entrega === "pendiente").length || 0;
        const rejected = deliveries?.filter((d) => d.estado_entrega === "rechazado").length || 0;

        return {
          ...camp,
          stats: {
            total,
            approved,
            pending,
            rejected,
            progress: total > 0 ? (approved / total) * 100 : 0,
          },
        };
      })
    );

    return NextResponse.json({ success: true, campaigns: campaignsWithStats });
  } catch (err: any) {
    console.error("Error in GET api/campanas:", err);
    return NextResponse.json({ error: err.message || "Error al obtener campañas." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  try {
    const body = await req.json();
    const { nombre, descripcion, tipo_documentos_requeridos, aplica_a, fecha_inicio, fecha_limite } = body;

    if (!nombre || !tipo_documentos_requeridos || !aplica_a || !fecha_inicio || !fecha_limite) {
      return NextResponse.json({ error: "Faltan parámetros obligatorios para la campaña." }, { status: 400 });
    }

    if (!["becarios", "monotributistas", "ambos"].includes(aplica_a)) {
      return NextResponse.json({ error: "Alcance 'aplica_a' inválido." }, { status: 400 });
    }

    const { data: { user } } = await supabase.auth.getUser();

    // 1. Insert Campaign
    const { data: campaign, error: campErr } = await supabase
      .from("campanas_documentacion")
      .insert({
        nombre,
        descripcion,
        tipo_documentos_requeridos,
        aplica_a,
        fecha_inicio,
        fecha_limite,
        estado: "activa",
        creado_por: user?.id || null,
      })
      .select()
      .single();

    if (campErr) throw campErr;

    // 2. Fetch eligible personnel who are 'Activo'
    let becarios: any[] = [];
    let monotributistas: any[] = [];

    if (aplica_a === "becarios" || aplica_a === "ambos") {
      const { data } = await supabase
        .from("becarios")
        .select("id")
        .eq("estado", "Activo");
      becarios = data || [];
    }

    if (aplica_a === "monotributistas" || aplica_a === "ambos") {
      const { data } = await supabase
        .from("monotributistas")
        .select("id")
        .eq("estado", "Activo");
      monotributistas = data || [];
    }

    // 3. Create deliveries checklist rows in DB
    const deliveriesToInsert: any[] = [];

    becarios.forEach((b) => {
      deliveriesToInsert.push({
        campana_id: campaign.id,
        tipo_persona: "becario",
        persona_id: b.id,
        estado_entrega: "pendiente",
      });
    });

    monotributistas.forEach((m) => {
      deliveriesToInsert.push({
        campana_id: campaign.id,
        tipo_persona: "monotributista",
        persona_id: m.id,
        estado_entrega: "pendiente",
      });
    });

    if (deliveriesToInsert.length > 0) {
      const { error: delErr } = await supabase
        .from("campana_entregas")
        .insert(deliveriesToInsert);

      if (delErr) throw delErr;
    }

    // 4. Audit Log
    await supabase.from("audit_log").insert({
      usuario_id: user?.id,
      accion: "Creación de Campaña de Documentación",
      tabla_afectada: "campanas_documentacion",
      registro_id: campaign.id,
      datos_nuevos: { nombre, aplica_a, total_entregas: deliveriesToInsert.length },
    });

    return NextResponse.json({ success: true, campaign, count: deliveriesToInsert.length });

  } catch (err: any) {
    console.error("Error in POST api/campanas:", err);
    return NextResponse.json({ error: err.message || "Error al crear campaña." }, { status: 500 });
  }
}
