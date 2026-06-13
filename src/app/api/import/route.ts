import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { ExcelImportRow } from "@/lib/excel-parser";


export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // 1. Verify user session
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Verify user permissions
    const { data: profile } = await supabase
      .from("users")
      .select("rol, activo")
      .eq("id", user.id)
      .single();

    if (!profile || !profile.activo || !["admin", "editor"].includes(profile.rol)) {
      return NextResponse.json(
        { error: "Permisos insuficientes para realizar importaciones" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { type, rows, fileName } = body as {
      type: "becarios" | "monotributistas";
      rows: ExcelImportRow[];
      fileName: string;
    };

    if (!type || !rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: "Datos de importación inválidos o vacíos" },
        { status: 400 }
      );
    }

    // 2. Fetch the active semester
    const { data: activeSemestre } = await supabase
      .from("semestres")
      .select("id, anio, numero_semestre")
      .eq("activo", true)
      .single();

    if (!activeSemestre) {
      return NextResponse.json(
        { error: "No hay un semestre activo configurado. Por favor, crea uno primero." },
        { status: 400 }
      );
    }

    // 3. Fetch categories for closest category matching
    let categories: any[] = [];
    if (type === "becarios") {
      const { data } = await supabase
        .from("categorias_becas")
        .select("id, numero_categoria, monto")
        .eq("semestre_id", activeSemestre.id);
      categories = data || [];
    } else {
      const { data } = await supabase
        .from("categorias_monotributistas")
        .select("id, letra, monto")
        .eq("semestre_id", activeSemestre.id);
      categories = data || [];
    }

    if (categories.length === 0) {
      return NextResponse.json(
        { error: "No hay categorías configuradas para el semestre activo." },
        { status: 400 }
      );
    }

    // Helper: Find closest category based on monthly amount
    const getClosestCategoryId = (amount: number): string | null => {
      let closestCat = categories[0];
      let minDiff = Math.abs(Number(closestCat.monto) - amount);

      for (let i = 1; i < categories.length; i++) {
        const diff = Math.abs(Number(categories[i].monto) - amount);
        if (diff < minDiff) {
          minDiff = diff;
          closestCat = categories[i];
        }
      }
      return closestCat?.id || null;
    };

    // 4. Fetch existing subsecretarías, areas, and responsables for lookup/caching
    const { data: existingSubs } = await supabase
      .from("subsecretarias")
      .select("id, nombre");
    const subMap = new Map<string, string>(); // normalized name -> ID
    existingSubs?.forEach((s) => subMap.set(normalizeString(s.nombre), s.id));

    const { data: existingAreas } = await supabase
      .from("areas")
      .select("id, nombre, subsecretaria_id");
    const areaMap = new Map<string, string>(); // "subid:normalized_areaname" -> ID
    existingAreas?.forEach((a) =>
      areaMap.set(`${a.subsecretaria_id}:${normalizeString(a.nombre)}`, a.id)
    );

    const { data: existingResps } = await supabase
      .from("responsables")
      .select("id, nombre_completo, area_id");
    const respMap = new Map<string, string>(); // "areaid:normalized_respname" -> ID
    existingResps?.forEach((r) =>
      respMap.set(`${r.area_id || "null"}:${normalizeString(r.nombre_completo)}`, r.id)
    );

    const { data: activeRespsData } = await supabase
      .from("responsables")
      .select("id, subsecretaria_id, area_id, nombre_completo")
      .eq("activo", true);
    const activeResps = activeRespsData || [];

    let successfulInserts = 0;
    let failedInserts = 0;
    const errorDetails: { row: number; error: string }[] = [];
    const insertsList: any[] = [];

    // Process rows sequentially to create parent records (subs, areas, resps) if missing
    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      const rowNumber = idx + 3; // 1-indexed (data starts at row 3)
      
      try {
        const subName = row.subsecretaria.trim();
        const areaName = row.area.trim();
        const respName = row.responsable.trim();

        // Resolve Subsecretaria
        let subId: string;
        const cachedSubId = subMap.get(normalizeString(subName));
        if (!cachedSubId) {
          const { data: newSub, error: subErr } = await supabase
            .from("subsecretarias")
            .insert({ nombre: subName, activa: true, orden: subMap.size + 1 })
            .select("id")
            .single();

          if (subErr || !newSub) {
            throw new Error(`Error al crear subsecretaría: ${subErr?.message}`);
          }
          subId = newSub.id as string;
          subMap.set(normalizeString(subName), subId);
        } else {
          subId = cachedSubId;
        }

        // Resolve Area
        const areaKey = `${subId}:${normalizeString(areaName)}`;
        let areaId: string;
        const cachedAreaId = areaMap.get(areaKey);
        if (!cachedAreaId) {
          const { data: newArea, error: areaErr } = await supabase
            .from("areas")
            .insert({ nombre: areaName, subsecretaria_id: subId, activa: true, orden: areaMap.size + 1 })
            .select("id")
            .single();

          if (areaErr || !newArea) {
            throw new Error(`Error al crear área: ${areaErr?.message}`);
          }
          areaId = newArea.id as string;
          areaMap.set(areaKey, areaId);
        } else {
          areaId = cachedAreaId;
        }

        // Resolve Responsable automatically first from configuration
        let respId: string | null = null;
        if (activeResps.length > 0) {
          // 1. Try area-specific first
          const matchingAreaResp = activeResps.find(
            (r) => r.subsecretaria_id === subId && r.area_id === areaId
          );
          if (matchingAreaResp) {
            respId = matchingAreaResp.id;
          } else {
            // 2. Try subsecretaria-wide (area_id is null)
            const matchingSubResp = activeResps.find(
              (r) => r.subsecretaria_id === subId && !r.area_id
            );
            if (matchingSubResp) {
              respId = matchingSubResp.id;
            }
          }
        }

        // If no active responsable is found in configuration, fall back to Excel row's "responsable"
        if (!respId) {
          const respKey = `${areaId}:${normalizeString(respName)}`;
          respId = respMap.get(respKey) || null;
          if (!respId && respName !== "Sin Asignar" && respName !== "") {
            // Check if exists in general first (without area restriction to avoid duplicate DNI trigger on insert)
            const { data: checkResp } = await supabase
              .from("responsables")
              .select("id")
              .eq("nombre_completo", respName)
              .limit(1);

            if (checkResp && checkResp.length > 0) {
              respId = checkResp[0].id as string;
            } else {
              // We generate a placeholder DNI based on name hash/random to avoid duplicates trigger
              const generatedDni = `IMP-${cleanDni(row.dni)}-${idx}`;
              const { data: newResp, error: respErr } = await supabase
                .from("responsables")
                .insert({
                  nombre_completo: respName,
                  dni: generatedDni,
                  area_id: areaId,
                  subsecretaria_id: subId,
                  cargo: "Responsable (importación)",
                  activo: true,
                })
                .select("id")
                .single();

              if (respErr || !newResp) {
                throw new Error(`Error al crear responsable: ${respErr?.message}`);
              }
              respId = newResp.id as string;
              respMap.set(respKey, respId);

              // Also add to activeResps in case subsequent rows map to it
              activeResps.push({
                id: respId,
                subsecretaria_id: subId,
                area_id: areaId,
                nombre_completo: respName
              });
            }
          }
        }

        // Map Category ID
        const categoryId = getClosestCategoryId(row.importe_mensual);

        // Prep Person Data
        const personData: any = {
          subsecretaria_id: subId,
          area_id: areaId,
          responsable_id: respId || null,
          cuit: row.cuit,
          dni: row.dni,
          apellido_nombre: row.apellido_nombre,
          fecha_nacimiento: row.fecha_nacimiento,
          cbu: row.cbu,
          tarjeta_activa_nro: row.tarjeta_activa_nro,
          telefono: row.telefono,
          email: row.email,
          nacionalidad: row.nacionalidad,
          codigo_postal: row.codigo_postal,
          provincia: row.provincia,
          departamento: row.departamento,
          localidad: row.localidad,
          barrio: row.barrio,
          calle: row.calle,
          nro: row.nro,
          piso: row.piso,
          depto: row.depto,
          lote: row.lote,
          manzana: row.manzana,
          importe_tarjeta_activa: row.importe_tarjeta_activa,
          importe_total: row.importe_total,
          estado: "Activo",
        };

        if (type === "becarios") {
          personData.categoria_beca_id = categoryId;
          personData.importe_mensual_beca = row.importe_mensual;
        } else {
          personData.categoria_mono_id = categoryId;
          personData.importe_mensual_monotributo = row.importe_mensual;
        }

        insertsList.push(personData);
      } catch (err: any) {
        failedInserts++;
        errorDetails.push({ row: rowNumber, error: err.message || "Error desconocido" });
      }
    }

    // Batch Insert / Upsert People in DB (to maximize speed)
    if (insertsList.length > 0) {
      const dbTable = type === "becarios" ? "becarios" : "monotributistas";
      const { error: batchErr } = await supabase
        .from(dbTable)
        .upsert(insertsList, { onConflict: "dni" });

      if (batchErr) {
        // Fallback row-by-row if batch upsert fails (to identify individual row errors)
        for (let idx = 0; idx < insertsList.length; idx++) {
          const person = insertsList[idx];
          const { error: rowErr } = await supabase.from(dbTable).upsert(person, { onConflict: "dni" });
          if (rowErr) {
            failedInserts++;
            errorDetails.push({
              row: idx + 3,
              error: `Error al insertar en Base de Datos: ${rowErr.message}`,
            });
          } else {
            successfulInserts++;
          }
        }
      } else {
        successfulInserts += insertsList.length;
      }
    }

    // 5. Log import history
    await supabase.from("historial_importaciones").insert({
      tipo: type,
      nombre_archivo: fileName,
      total_registros: rows.length,
      registros_exitosos: successfulInserts,
      registros_con_error: failedInserts,
      detalle_errores: errorDetails,
      resumen: {
        totalAmount: body.rows.reduce((sum: number, r: any) => sum + r.importe_total, 0),
        importType: type,
        activeSemester: activeSemestre.anio + "-" + activeSemestre.numero_semestre + "S",
      },
      usuario_id: user.id,
    });

    // Write audit log entry
    await supabase.from("audit_log").insert({
      usuario_id: user.id,
      accion: `Importación Masiva de ${type}`,
      tabla_afectada: type === "becarios" ? "becarios" : "monotributistas",
      datos_nuevos: {
        totalImportados: successfulInserts,
        totalErrores: failedInserts,
        archivo: fileName,
      },
    });

    return NextResponse.json({
      success: true,
      total: rows.length,
      successful: successfulInserts,
      failed: failedInserts,
      errors: errorDetails,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Error interno del servidor: " + err.message },
      { status: 500 }
    );
  }
}

function cleanDni(val: string): string {
  return val.replace(/[^0-9]/g, "");
}

function normalizeString(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
