import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  try {
    const body = await req.json();
    const { semesterId, categorias_becas, categorias_monotributistas, cascadeUpdatePersonnel } = body;

    if (!semesterId) {
      return NextResponse.json({ error: "Falta el ID del semestre." }, { status: 400 });
    }

    // Verify semester is active and not blocked
    const { data: semester, error: semErr } = await supabase
      .from("semestres")
      .select("*")
      .eq("id", semesterId)
      .single();

    if (semErr) throw semErr;

    if (semester.bloqueado) {
      return NextResponse.json({ error: "El semestre está cerrado y es inmutable." }, { status: 400 });
    }

    const { data: { user } } = await supabase.auth.getUser();

    // 1. Update Becas Categories
    for (const cat of categorias_becas) {
      const { data: updatedCat, error: catError } = await supabase
        .from("categorias_becas")
        .update({ monto: cat.monto })
        .eq("id", cat.id)
        .select()
        .single();

      if (catError) throw catError;

      // Cascade update to active becarios
      if (cascadeUpdatePersonnel) {
        const { data: affectedBecs } = await supabase
          .from("becarios")
          .select("*")
          .eq("categoria_beca_id", cat.id)
          .eq("estado", "Activo");

        if (affectedBecs) {
          for (const bec of affectedBecs) {
            // Only update if the amount actually changed
            if (Number(bec.importe_mensual_beca) !== Number(updatedCat.monto)) {
              const { error: updateBecError } = await supabase
                .from("becarios")
                .update({
                  importe_mensual_beca: updatedCat.monto,
                  importe_tarjeta_activa: updatedCat.monto_activa,
                  importe_total: updatedCat.total,
                })
                .eq("id", bec.id);

              if (updateBecError) throw updateBecError;

              // Log movements
              await supabase.from("movimientos").insert({
                tipo_persona: "becario",
                persona_id: bec.id,
                tipo_movimiento: "cambio_monto",
                anio: semester.anio,
                mes: new Date().getMonth() + 1,
                descripcion: `Actualización masiva de montos: Categoría ${cat.numero_categoria} a $${updatedCat.total}`,
                datos_anteriores: {
                  monto: bec.importe_mensual_beca,
                  total: bec.importe_total,
                },
                datos_nuevos: {
                  monto: updatedCat.monto,
                  total: updatedCat.total,
                },
                usuario_id: user?.id,
              });
            }
          }
        }
      }
    }

    // 2. Update Monotributo Categories
    for (const cat of categorias_monotributistas) {
      const { data: updatedCat, error: catError } = await supabase
        .from("categorias_monotributistas")
        .update({
          monto: cat.monto,
          descripcion_categoria: cat.descripcion_categoria || null,
        })
        .eq("id", cat.id)
        .select()
        .single();

      if (catError) throw catError;

      // Cascade update to active monotributistas
      if (cascadeUpdatePersonnel) {
        const { data: affectedMonos } = await supabase
          .from("monotributistas")
          .select("*")
          .eq("categoria_mono_id", cat.id)
          .eq("estado", "Activo");

        if (affectedMonos) {
          for (const mono of affectedMonos) {
            if (Number(mono.importe_mensual_monotributo) !== Number(updatedCat.monto)) {
              const { error: updateMonoError } = await supabase
                .from("monotributistas")
                .update({
                  importe_mensual_monotributo: updatedCat.monto,
                  importe_tarjeta_activa: updatedCat.monto_activa,
                  importe_total: updatedCat.total,
                })
                .eq("id", mono.id);

              if (updateMonoError) throw updateMonoError;

              // Log movements
              await supabase.from("movimientos").insert({
                tipo_persona: "monotributista",
                persona_id: mono.id,
                tipo_movimiento: "cambio_monto",
                anio: semester.anio,
                mes: new Date().getMonth() + 1,
                descripcion: `Actualización masiva de montos: Letra ${cat.letra} a $${updatedCat.total}`,
                datos_anteriores: {
                  monto: mono.importe_mensual_monotributo,
                  total: mono.importe_total,
                },
                datos_nuevos: {
                  monto: updatedCat.monto,
                  total: updatedCat.total,
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
      accion: "Actualización de Categorías y Haberes",
      tabla_afectada: "categorias_becas",
      registro_id: semesterId,
      datos_nuevos: { semesterId, cascadeUpdatePersonnel },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Error updating categories:", err);
    return NextResponse.json({ error: err.message || "Error al actualizar categorías" }, { status: 500 });
  }
}
