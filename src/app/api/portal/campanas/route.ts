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

    const { subsecretarias_ids, areas_ids } = session;
    if (!subsecretarias_ids?.length && !areas_ids?.length) {
      return NextResponse.json({ campaigns: [] });
    }

    const { searchParams } = new URL(req.url);
    const campanaId = searchParams.get("campana_id");

    const supabase = await createClient();

    // 1. Fetch allowed becarios and monotributistas to get a list of allowed persona_ids
    let allowedBecs: any[] = [];
    let allowedMonos: any[] = [];

    // Query filters
    let queryFilter = "";
    if (areas_ids.length > 0) {
      queryFilter += `area_id.in.(${areas_ids.join(",")})`;
    }
    if (subsecretarias_ids.length > 0) {
      if (queryFilter) queryFilter += ",";
      queryFilter += `subsecretaria_id.in.(${subsecretarias_ids.join(",")})`;
    }

    if (queryFilter) {
      const { data: becs } = await supabase.from("becarios").select("id, apellido_nombre, estado, subsecretaria_id, area_id");
      const { data: monos } = await supabase.from("monotributistas").select("id, apellido_nombre, estado, subsecretaria_id, area_id");
      
      // Filter active or recently active
      allowedBecs = becs || [];
      allowedMonos = monos || [];
    }

    const allowedPeopleMap = new Map<string, { nombre: string; tipo: string; subsecretaria_id: string; area_id: string }>();
    allowedBecs.forEach(b => allowedPeopleMap.set(b.id, { nombre: b.apellido_nombre, tipo: "becario", subsecretaria_id: b.subsecretaria_id, area_id: b.area_id }));
    allowedMonos.forEach(m => allowedPeopleMap.set(m.id, { nombre: m.apellido_nombre, tipo: "monotributista", subsecretaria_id: m.subsecretaria_id, area_id: m.area_id }));

    const allowedPersonaIds = Array.from(allowedPeopleMap.keys());

    // 2. Fetch area and subsecretaria names for mapping
    const { data: allSubs } = await supabase.from("subsecretarias").select("id, nombre");
    const { data: allAreas } = await supabase.from("areas").select("id, nombre");
    
    const subNameMap = new Map(allSubs?.map((s) => [s.id, s.nombre]));
    const areaNameMap = new Map(allAreas?.map((a) => [a.id, a.nombre]));

    if (campanaId) {
      // Return specific campaign details and delivery checklist
      const { data: campaign, error: campErr } = await supabase
        .from("campanas_documentacion")
        .select("*")
        .eq("id", campanaId)
        .single();

      if (campErr || !campaign) {
        return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });
      }

      // Fetch deliveries for this campaign
      const { data: deliveries } = await supabase
        .from("campana_entregas")
        .select("*")
        .eq("campana_id", campanaId)
        .in("persona_id", allowedPersonaIds);

      // Fetch documents uploaded for this campaign
      const { data: docs } = await supabase
        .from("documentos")
        .select("id, persona_id, tipo_documento, estado_revision, url_supabase, url_google_drive")
        .eq("campana_id", campanaId);

      const docsMap: Record<string, any[]> = {};
      docs?.forEach(d => {
        if (!docsMap[d.persona_id]) docsMap[d.persona_id] = [];
        docsMap[d.persona_id].push(d);
      });

      // Format deliveries list
      const formattedDeliveries = (deliveries || []).map((d) => {
        const person = allowedPeopleMap.get(d.persona_id);
        const personDocs = docsMap[d.persona_id] || [];

        // Detail the status of each required document in this campaign
        const docChecklist = (campaign.tipo_documentos_requeridos || []).map((code: string) => {
          const doc = personDocs.find((pd) => pd.tipo_documento === code);
          return {
            code,
            status: doc ? doc.estado_revision : "faltante",
            url: doc?.url_google_drive || doc?.url_supabase || null,
          };
        });

        return {
          id: d.id,
          persona_id: d.persona_id,
          nombre_persona: person ? person.nombre : "Desconocido",
          tipo_persona: person ? person.tipo : "desconocido",
          subsecretaria_nombre: person ? (subNameMap.get(person.subsecretaria_id) || "-") : "-",
          area_nombre: person ? (areaNameMap.get(person.area_id) || "-") : "-",
          estado_entrega: d.estado_entrega,
          docChecklist,
        };
      });

      // Sort by name ascending
      formattedDeliveries.sort((a, b) => a.nombre_persona.localeCompare(b.nombre_persona));

      return NextResponse.json({
        campaign,
        deliveries: formattedDeliveries,
      });
    }

    // List all campaigns with stats for their areas
    const { data: campaigns } = await supabase
      .from("campanas_documentacion")
      .select("*")
      .order("created_at", { ascending: false });

    const campaignsWithStats = await Promise.all(
      (campaigns || []).map(async (camp) => {
        // Fetch deliveries in allowed areas
        const { data: deliveries } = await supabase
          .from("campana_entregas")
          .select("persona_id, estado_entrega")
          .eq("campana_id", camp.id)
          .in("persona_id", allowedPersonaIds);

        const total = deliveries?.length || 0;
        const approved = deliveries?.filter(d => d.estado_entrega === "entregado").length || 0;
        const incomplete = deliveries?.filter(d => d.estado_entrega === "incompleto").length || 0;
        const pending = total - approved - incomplete;

        return {
          ...camp,
          stats: {
            total,
            approved,
            incomplete,
            pending,
            progress: total > 0 ? Math.round((approved / total) * 100) : 0,
          },
        };
      })
    );

    // Filter out campaigns that have 0 deliveries in this responsable's areas (means they don't apply to them)
    const applicableCampaigns = campaignsWithStats.filter((c) => c.stats.total > 0);

    return NextResponse.json({
      campaigns: applicableCampaigns,
    });
  } catch (error: any) {
    console.error("Portal Campaigns GET Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
