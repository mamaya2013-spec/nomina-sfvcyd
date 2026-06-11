import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  try {
    const body = await req.json();
    const {
      anio,
      numero_semestre,
      nombre_display,
      fecha_inicio,
      fecha_fin,
      categorias_becas,
      categorias_monotributistas,
    } = body;

    // Validate request
    if (!anio || !numero_semestre || !nombre_display || !fecha_inicio || !fecha_fin) {
      return NextResponse.json({ error: "Faltan datos obligatorios para el semestre." }, { status: 400 });
    }

    // Get current active semester
    const { data: oldSemester, error: oldSemError } = await supabase
      .from("semestres")
      .select("*")
      .eq("activo", true)
      .maybeSingle();

    if (oldSemError) throw oldSemError;

    // If there is an old semester, we must generate a snapshot and close it
    let oldSemesterId = oldSemester?.id;
    if (oldSemester) {
      // 1. Fetch categories of old semester
      const { data: oldCatsBeca } = await supabase
        .from("categorias_becas")
        .select("*")
        .eq("semestre_id", oldSemesterId);

      const { data: oldCatsMono } = await supabase
        .from("categorias_monotributistas")
        .select("*")
        .eq("semestre_id", oldSemesterId);

      // 2. Fetch active personnel linked to old semester
      const { data: activeBecarios } = await supabase
        .from("becarios")
        .select("*, areas(nombre), subsecretarias(nombre), responsables(nombre_completo)")
        .eq("estado", "Activo");

      const { data: activeMonotributistas } = await supabase
        .from("monotributistas")
        .select("*, areas(nombre), subsecretarias(nombre), responsables(nombre_completo)")
        .eq("estado", "Activo");

      // 3. Fetch OCs
      const { data: oldOcs } = await supabase
        .from("ordenes_compromiso")
        .select("*")
        .eq("semestre_id", oldSemesterId);

      // Calculate totals
      const total_becarios_activos = activeBecarios?.length || 0;
      const total_monotributistas_activos = activeMonotributistas?.length || 0;
      
      const total_monto_becas = (activeBecarios || []).reduce((acc, curr) => acc + Number(curr.importe_mensual_beca || 0), 0);
      const total_monto_monotributos = (activeMonotributistas || []).reduce((acc, curr) => acc + Number(curr.importe_mensual_monotributo || 0), 0);
      
      const total_activa_becas = (activeBecarios || []).reduce((acc, curr) => acc + Number(curr.importe_tarjeta_activa || 0), 0);
      const total_activa_monos = (activeMonotributistas || []).reduce((acc, curr) => acc + Number(curr.importe_tarjeta_activa || 0), 0);
      
      const gran_total_semestre = total_monto_becas + total_monto_monotributos + total_activa_becas + total_activa_monos;

      // 4. Create snapshot
      const { error: snapshotError } = await supabase.from("snapshots_semestre").insert({
        semestre_id: oldSemesterId,
        total_becarios_activos,
        total_monotributistas_activos,
        total_monto_becas,
        total_monto_monotributos,
        total_activa_becas,
        total_activa_monos,
        gran_total_semestre,
        categorias_becas_snapshot: oldCatsBeca || [],
        categorias_monos_snapshot: oldCatsMono || [],
        nomina_becarios_snapshot: activeBecarios || [],
        nomina_monos_snapshot: activeMonotributistas || [],
        ordenes_compromiso_snapshot: oldOcs || [],
      });

      if (snapshotError) throw snapshotError;

      // 5. Deactivate and Lock previous semester
      const { error: updateOldError } = await supabase
        .from("semestres")
        .update({ activo: false, bloqueado: true })
        .eq("id", oldSemesterId);

      if (updateOldError) throw updateOldError;
    }

    // 6. Create the NEW semester
    const { data: newSemester, error: newSemError } = await supabase
      .from("semestres")
      .insert({
        anio,
        numero_semestre,
        nombre_display,
        fecha_inicio,
        fecha_fin,
        activo: true,
        bloqueado: false,
      })
      .select()
      .single();

    if (newSemError) throw newSemError;
    const newSemesterId = newSemester.id;

    // 7. Save new categories
    const newBecaCatsMap = new Map<number, any>();
    for (const cat of categorias_becas) {
      const { data: newCat, error: catError } = await supabase
        .from("categorias_becas")
        .insert({
          semestre_id: newSemesterId,
          numero_categoria: cat.numero_categoria,
          monto: cat.monto,
          porcentaje_activa: 10.00,
        })
        .select()
        .single();

      if (catError) throw catError;
      newBecaCatsMap.set(cat.numero_categoria, newCat);
    }

    const newMonoCatsMap = new Map<string, any>();
    for (const cat of categorias_monotributistas) {
      const { data: newCat, error: catError } = await supabase
        .from("categorias_monotributistas")
        .insert({
          semestre_id: newSemesterId,
          letra: cat.letra,
          descripcion_categoria: cat.descripcion_categoria || null,
          monto: cat.monto,
          porcentaje_activa: 10.00,
        })
        .select()
        .single();

      if (catError) throw catError;
      newMonoCatsMap.set(cat.letra, newCat);
    }

    // 8. Rollover Active Personnel to the new semester categories
    const { data: { user } } = await supabase.auth.getUser();

    if (oldSemesterId) {
      // 8a. Rollover Becarios
      const { data: activeBecs } = await supabase
        .from("becarios")
        .select(`
          *,
          categorias_becas(numero_categoria)
        `)
        .eq("estado", "Activo");

      if (activeBecs) {
        for (const bec of activeBecs) {
          const oldNumCat = bec.categorias_becas?.numero_categoria;
          if (oldNumCat) {
            const newCatRecord = newBecaCatsMap.get(oldNumCat);
            if (newCatRecord) {
              const { error: updateBecError } = await supabase
                .from("becarios")
                .update({
                  categoria_beca_id: newCatRecord.id,
                  importe_mensual_beca: newCatRecord.monto,
                  importe_tarjeta_activa: newCatRecord.monto_activa,
                  importe_total: newCatRecord.total,
                })
                .eq("id", bec.id);

              if (updateBecError) throw updateBecError;

              // Log movement
              await supabase.from("movimientos").insert({
                tipo_persona: "becario",
                persona_id: bec.id,
                tipo_movimiento: "cambio_categoria",
                anio: anio,
                mes: parseInt(fecha_inicio.split("-")[1]),
                descripcion: `Traspaso de semestre: Categoría ${oldNumCat} a nuevo monto $${newCatRecord.total}`,
                datos_anteriores: {
                  monto: bec.importe_mensual_beca,
                  total: bec.importe_total,
                  semester_id: oldSemesterId,
                },
                datos_nuevos: {
                  monto: newCatRecord.monto,
                  total: newCatRecord.total,
                  semester_id: newSemesterId,
                },
                usuario_id: user?.id,
              });
            }
          }
        }
      }

      // 8b. Rollover Monotributistas
      const { data: activeMonos } = await supabase
        .from("monotributistas")
        .select(`
          *,
          categorias_monotributistas(letra)
        `)
        .eq("estado", "Activo");

      if (activeMonos) {
        for (const mono of activeMonos) {
          const oldLetra = mono.categorias_monotributistas?.letra;
          if (oldLetra) {
            const newCatRecord = newMonoCatsMap.get(oldLetra);
            if (newCatRecord) {
              const { error: updateMonoError } = await supabase
                .from("monotributistas")
                .update({
                  categoria_mono_id: newCatRecord.id,
                  importe_mensual_monotributo: newCatRecord.monto,
                  importe_tarjeta_activa: newCatRecord.monto_activa,
                  importe_total: newCatRecord.total,
                })
                .eq("id", mono.id);

              if (updateMonoError) throw updateMonoError;

              // Log movement
              await supabase.from("movimientos").insert({
                tipo_persona: "monotributista",
                persona_id: mono.id,
                tipo_movimiento: "cambio_categoria",
                anio: anio,
                mes: parseInt(fecha_inicio.split("-")[1]),
                descripcion: `Traspaso de semestre: Letra ${oldLetra} a nuevo monto $${newCatRecord.total}`,
                datos_anteriores: {
                  monto: mono.importe_mensual_monotributo,
                  total: mono.importe_total,
                  semester_id: oldSemesterId,
                },
                datos_nuevos: {
                  monto: newCatRecord.monto,
                  total: newCatRecord.total,
                  semester_id: newSemesterId,
                },
                usuario_id: user?.id,
              });
            }
          }
        }
      }
    }

    // Log audit
    await supabase.from("audit_log").insert({
      usuario_id: user?.id,
      accion: "Creación de Semestre y Rollover",
      tabla_afectada: "semestres",
      registro_id: newSemesterId,
      datos_nuevos: { newSemesterId, anio, numero_semestre },
    });

    return NextResponse.json({ success: true, semesterId: newSemesterId });
  } catch (err: any) {
    console.error("Error in semester creation:", err);
    return NextResponse.json({ error: err.message || "Error al crear semestre" }, { status: 500 });
  }
}
