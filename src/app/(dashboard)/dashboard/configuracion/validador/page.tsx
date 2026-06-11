"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldAlert, CheckCircle, RefreshCw, Download, ExternalLink, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSemester } from "@/lib/contexts/SemesterContext";
import { toast, Toaster } from "sonner";

import styles from "./validador.module.css";

interface Anomaly {
  id: string;
  nombre: string;
  dni: string;
  tipo_persona: "Becario" | "Monotributista";
  gravedad: "critico" | "advertencia" | "info";
  categoria_control: string;
  descripcion: string;
  link: string;
}

export default function ValidadorPage() {
  const supabase = createClient();
  const { selectedSemester } = useSemester();

  const [loading, setLoading] = useState(true);
  const [becarios, setBecarios] = useState<any[]>([]);
  const [monotributistas, setMonotributistas] = useState<any[]>([]);
  const [seguros, setSeguros] = useState<any[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);

  // CUIL verification algorithm (Argentina CUIL/CUIT check)
  const validateCUIL = (cuil: string): boolean => {
    const clean = cuil.replace(/\-/g, "").trim();
    if (clean.length !== 11 || isNaN(Number(clean))) return false;

    const factors = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += parseInt(clean[i]) * factors[i];
    }

    const mod = sum % 11;
    let verifier = 11 - mod;
    if (verifier === 11) verifier = 0;
    if (verifier === 10) verifier = 9;

    return verifier === parseInt(clean[10]);
  };

  const loadAndAudit = async () => {
    if (!selectedSemester) return;
    setLoading(true);
    try {
      let activeBecs: any[] = [];
      let activeMonos: any[] = [];

      // Load personnel
      if (selectedSemester.bloqueado) {
        const { data: snapshot } = await supabase
          .from("snapshots_semestre")
          .select("*")
          .eq("semestre_id", selectedSemester.id)
          .maybeSingle();

        if (snapshot) {
          activeBecs = (snapshot.nomina_becarios_snapshot || []).filter((b: any) => b.estado === "Activo");
          activeMonos = (snapshot.nomina_monos_snapshot || []).filter((m: any) => m.estado === "Activo");
        }
      } else {
        const { data: becs } = await supabase
          .from("becarios")
          .select(`
            *,
            categorias_becas(id, numero_categoria, monto)
          `)
          .eq("estado", "Activo");
        const { data: monos } = await supabase
          .from("monotributistas")
          .select(`
            *,
            categorias_monotributistas(id, letra, monto)
          `)
          .eq("estado", "Activo");
        
        activeBecs = becs || [];
        activeMonos = monos || [];
      }

      // Fetch insurances
      const { data: ins } = await supabase.from("vencimientos_seguros").select("*");
      const activeIns = ins || [];

      // ----------------------------------------------------
      // AUDIT ALGORITHMS
      // ----------------------------------------------------
      const compiledAnomalies: Anomaly[] = [];

      // 1. DNI Duplicates scan
      const dniMap: { [key: string]: any[] } = {};
      activeBecs.forEach((b) => {
        dniMap[b.dni] = dniMap[b.dni] || [];
        dniMap[b.dni].push({ ...b, tipo: "Becario" });
      });
      activeMonos.forEach((m) => {
        dniMap[m.dni] = dniMap[m.dni] || [];
        dniMap[m.dni].push({ ...m, tipo: "Monotributista" });
      });

      Object.entries(dniMap).forEach(([dni, occurrences]) => {
        if (occurrences.length > 1) {
          occurrences.forEach((occ) => {
            compiledAnomalies.push({
              id: occ.id,
              nombre: occ.apellido_nombre,
              dni,
              tipo_persona: occ.tipo,
              gravedad: "critico",
              categoria_control: "DNI Duplicado",
              descripcion: `DNI duplicado: asignado a ${occurrences.length} agentes simultáneamente.`,
              link: occ.tipo === "Becario" ? `/dashboard/becarios/${occ.id}` : `/dashboard/monotributistas/${occ.id}`,
            });
          });
        }
      });

      // 2. CUIL Audit
      activeBecs.forEach((b) => {
        if (!b.cuit) {
          compiledAnomalies.push({
            id: b.id,
            nombre: b.apellido_nombre,
            dni: b.dni,
            tipo_persona: "Becario",
            gravedad: "critico",
            categoria_control: "CUIL Ausente",
            descripcion: "CUIL/CUIT no registrado en la ficha del becario.",
            link: `/dashboard/becarios/${b.id}`,
          });
        } else if (!validateCUIL(b.cuit)) {
          compiledAnomalies.push({
            id: b.id,
            nombre: b.apellido_nombre,
            dni: b.dni,
            tipo_persona: "Becario",
            gravedad: "critico",
            categoria_control: "CUIL Inválido",
            descripcion: `CUIL inválido (${b.cuit}): falla validación de dígito verificador.`,
            link: `/dashboard/becarios/${b.id}`,
          });
        }
      });

      activeMonos.forEach((m) => {
        if (!m.cuit) {
          compiledAnomalies.push({
            id: m.id,
            nombre: m.apellido_nombre,
            dni: m.dni,
            tipo_persona: "Monotributista",
            gravedad: "critico",
            categoria_control: "CUIT Ausente",
            descripcion: "CUIT no registrado en la ficha del monotributista.",
            link: `/dashboard/monotributistas/${m.id}`,
          });
        } else if (!validateCUIL(m.cuit)) {
          compiledAnomalies.push({
            id: m.id,
            nombre: m.apellido_nombre,
            dni: m.dni,
            tipo_persona: "Monotributista",
            gravedad: "critico",
            categoria_control: "CUIT Inválido",
            descripcion: `CUIT inválido (${m.cuit}): falla validación de dígito verificador.`,
            link: `/dashboard/monotributistas/${m.id}`,
          });
        }
      });

      // 3. CBU Audit (Active agents)
      activeBecs.forEach((b) => {
        if (!b.cbu) {
          compiledAnomalies.push({
            id: b.id,
            nombre: b.apellido_nombre,
            dni: b.dni,
            tipo_persona: "Becario",
            gravedad: "advertencia",
            categoria_control: "CBU Faltante",
            descripcion: "Sin CBU registrado (requerido por Tesorería para acreditar haberes).",
            link: `/dashboard/becarios/${b.id}`,
          });
        } else if (b.cbu.replace(/\D/g, "").length !== 22) {
          compiledAnomalies.push({
            id: b.id,
            nombre: b.apellido_nombre,
            dni: b.dni,
            tipo_persona: "Becario",
            gravedad: "critico",
            categoria_control: "CBU Inválido",
            descripcion: `CBU inválido (${b.cbu}): debe poseer exactamente 22 dígitos numéricos.`,
            link: `/dashboard/becarios/${b.id}`,
          });
        }
      });

      activeMonos.forEach((m) => {
        if (!m.cbu) {
          compiledAnomalies.push({
            id: m.id,
            nombre: m.apellido_nombre,
            dni: m.dni,
            tipo_persona: "Monotributista",
            gravedad: "advertencia",
            categoria_control: "CBU Faltante",
            descripcion: "Sin CBU registrado (requerido por Tesorería para acreditar haberes).",
            link: `/dashboard/monotributistas/${m.id}`,
          });
        } else if (m.cbu.replace(/\D/g, "").length !== 22) {
          compiledAnomalies.push({
            id: m.id,
            nombre: m.apellido_nombre,
            dni: m.dni,
            tipo_persona: "Monotributista",
            gravedad: "critico",
            categoria_control: "CBU Inválido",
            descripcion: `CBU inválido (${m.cbu}): debe poseer exactamente 22 dígitos numéricos.`,
            link: `/dashboard/monotributistas/${m.id}`,
          });
        }
      });

      // 4. Insurance policy Audit (Monotributistas only)
      activeMonos.forEach((m) => {
        const insPolicy = activeIns.find((i) => i.monotributista_id === m.id);
        if (!insPolicy) {
          compiledAnomalies.push({
            id: m.id,
            nombre: m.apellido_nombre,
            dni: m.dni,
            tipo_persona: "Monotributista",
            gravedad: "critico",
            categoria_control: "Seguro Faltante",
            descripcion: "Falta póliza y certificado de cobertura de Seguro de Vida Obligatorio.",
            link: `/dashboard/monotributistas/${m.id}`,
          });
        } else {
          const vDate = new Date(insPolicy.fecha_vencimiento);
          const today = new Date();
          if (vDate < today) {
            compiledAnomalies.push({
              id: m.id,
              nombre: m.apellido_nombre,
              dni: m.dni,
              tipo_persona: "Monotributista",
              gravedad: "critico",
              categoria_control: "Seguro Vencido",
              descripcion: `El seguro de vida expiró el ${vDate.toLocaleDateString("es-AR")}.`,
              link: `/dashboard/monotributistas/${m.id}`,
            });
          } else {
            const diff = vDate.getTime() - today.getTime();
            const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
            if (days <= 30) {
              compiledAnomalies.push({
                id: m.id,
                nombre: m.apellido_nombre,
                dni: m.dni,
                tipo_persona: "Monotributista",
                gravedad: "advertencia",
                categoria_control: "Seguro por Vencer",
                descripcion: `El seguro de vida expira en ${days} días (${vDate.toLocaleDateString("es-AR")}).`,
                link: `/dashboard/monotributistas/${m.id}`,
              });
            }
          }
        }
      });

      // 5. Amount/Scale mismatch Audit
      activeBecs.forEach((b) => {
        if (b.categorias_becas) {
          const expected = Number(b.categorias_becas.monto);
          const actual = Number(b.importe_mensual_beca);
          if (actual !== expected) {
            compiledAnomalies.push({
              id: b.id,
              nombre: b.apellido_nombre,
              dni: b.dni,
              tipo_persona: "Becario",
              gravedad: "advertencia",
              categoria_control: "Desvío Salarial",
              descripcion: `Importe liquidado ($${actual.toLocaleString()}) difiere de la categoría ${b.categorias_becas.numero_categoria} ($${expected.toLocaleString()}).`,
              link: `/dashboard/becarios/${b.id}`,
            });
          }
        }
      });

      activeMonos.forEach((m) => {
        if (m.categorias_monotributistas) {
          const expected = Number(m.categorias_monotributistas.monto);
          const actual = Number(m.importe_mensual_monotributo);
          if (actual !== expected) {
            compiledAnomalies.push({
              id: m.id,
              nombre: m.apellido_nombre,
              dni: m.dni,
              tipo_persona: "Monotributista",
              gravedad: "advertencia",
              categoria_control: "Desvío Salarial",
              descripcion: `Importe liquidado ($${actual.toLocaleString()}) difiere de la escala Letra ${m.categorias_monotributistas.letra} ($${expected.toLocaleString()}).`,
              link: `/dashboard/monotributistas/${m.id}`,
            });
          }
        }
      });

      // 6. Tarjeta Activa Faltante Audit
      activeBecs.forEach((b) => {
        if (!b.tarjeta_activa_nro) {
          compiledAnomalies.push({
            id: b.id,
            nombre: b.apellido_nombre,
            dni: b.dni,
            tipo_persona: "Becario",
            gravedad: "info",
            categoria_control: "Tarjeta Faltante",
            descripcion: "Falta número de Tarjeta Activa registrado (no cobrará incentivo 10%).",
            link: `/dashboard/becarios/${b.id}`,
          });
        }
      });

      activeMonos.forEach((m) => {
        if (!m.tarjeta_activa_nro) {
          compiledAnomalies.push({
            id: m.id,
            nombre: m.apellido_nombre,
            dni: m.dni,
            tipo_persona: "Monotributista",
            gravedad: "info",
            categoria_control: "Tarjeta Faltante",
            descripcion: "Falta número de Tarjeta Activa registrado (no cobrará incentivo 10%).",
            link: `/dashboard/monotributistas/${m.id}`,
          });
        }
      });

      setAnomalies(compiledAnomalies);
      toast.success("Auditoría de consistencia finalizada.");
    } catch (err: any) {
      console.error("Error running validator checks:", err);
      toast.error("Error al ejecutar auditoría: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSemester) {
      loadAndAudit();
    }
  }, [selectedSemester]);

  // KPIs
  const kpiStats = useMemo(() => {
    return {
      total: anomalies.length,
      critico: anomalies.filter((a) => a.gravedad === "critico").length,
      advertencia: anomalies.filter((a) => a.gravedad === "advertencia").length,
      info: anomalies.filter((a) => a.gravedad === "info").length,
    };
  }, [anomalies]);

  // Export anomalies list to Excel
  const handleExportExcel = async () => {
    if (anomalies.length === 0) {
      toast.warning("No hay inconsistencias para exportar.");
      return;
    }
    try {
      const XLSX = await import("xlsx");
      const dataToExport = anomalies.map((a) => ({
        Agente: a.nombre,
        DNI: a.dni,
        Tipo: a.tipo_persona,
        Criticidad: a.gravedad.toUpperCase(),
        Control: a.categoria_control,
        Descripcion: a.descripcion,
      }));

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();

      // Autowidth
      const wscols = Object.keys(dataToExport[0]).map((key) => {
        let max = key.length;
        dataToExport.forEach((row: any) => {
          const val = row[key] ? row[key].toString() : "";
          if (val.length > max) max = val.length;
        });
        return { wch: max + 2 };
      });
      ws["!cols"] = wscols;

      XLSX.utils.book_append_sheet(wb, ws, "Inconsistencias");
      XLSX.writeFile(wb, `Reporte_Consistencia_Nomina_${selectedSemester?.nombre_display}.xlsx`);
      toast.success("Excel de auditoría exportado.");
    } catch (err: any) {
      toast.error("Error al exportar a Excel: " + err.message);
    }
  };

  return (
    <div className={styles.container}>
      <Toaster position="top-right" richColors />

      {/* Header */}
      <div className={styles.header}>
        <Link href="/dashboard/configuracion" className={styles.backLink}>
          <ArrowLeft size={16} />
          <span>Volver a Configuración</span>
        </Link>
        <h1>Validador de Integridad de Datos</h1>
        <p className="text-secondary">
          Auditoría de consistencia presupuestaria y documental de la nómina activa del semestre seleccionado.
        </p>
      </div>

      {/* KPI Cards */}
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Total Inconsistencias</span>
          <span className={styles.kpiValue}>{kpiStats.total}</span>
        </div>

        <div className={`${styles.kpiCard} ${styles.criticalCard}`}>
          <span className={styles.kpiLabel}>Crítico (DNI, CUIT, CBU, Seguro)</span>
          <span className={styles.kpiValue}>{kpiStats.critico}</span>
        </div>

        <div className={`${styles.kpiCard} ${styles.warningCard}`}>
          <span className={styles.kpiLabel}>Advertencias (CBU, Haberes)</span>
          <span className={styles.kpiValue}>{kpiStats.advertencia}</span>
        </div>

        <div className={`${styles.kpiCard} ${styles.infoCard}`}>
          <span className={styles.kpiLabel}>Alertas Informativas</span>
          <span className={styles.kpiValue}>{kpiStats.info}</span>
        </div>
      </div>

      {/* Anomalies List */}
      <div className={styles.auditCard}>
        <div className={styles.cardHeader}>
          <div className={styles.cardTitleGroup}>
            <h3>Planilla de Anomalías y Desvíos</h3>
            <p>Historial en vivo de los controles y validación de la nómina activa.</p>
          </div>

          <div className={styles.actionButtons}>
            <button
              onClick={loadAndAudit}
              className={styles.secondaryBtn}
              disabled={loading}
              title="Volver a auditar base de datos"
            >
              <RefreshCw size={16} className={loading ? styles.spin : ""} />
              <span>Re-Auditar</span>
            </button>

            <button
              onClick={handleExportExcel}
              className={styles.primaryBtn}
              disabled={loading || anomalies.length === 0}
              title="Exportar reporte de consistencia a Excel"
            >
              <Download size={16} />
              <span>Exportar Excel</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className={styles.emptyState}>
            <Loader2 className={`${styles.spin} text-secondary`} size={36} />
            <p style={{ marginTop: "12px" }}>Escaneando base de datos relacional y seguros...</p>
          </div>
        ) : anomalies.length === 0 ? (
          <div className={styles.emptyState}>
            <CheckCircle size={48} style={{ color: "#10b981", marginBottom: "12px" }} />
            <p><strong>¡Base de datos consistente!</strong> No se encontraron desvíos presupuestarios o inconsistencias documentales.</p>
          </div>
        ) : (
          <div className={styles.tableResponsive}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Agente Municipal</th>
                  <th>DNI</th>
                  <th>Control Fallido</th>
                  <th>Gravedad</th>
                  <th>Descripción del Desvío</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {anomalies.map((anom, idx) => (
                  <tr key={idx}>
                    <td>
                      <div className={styles.agentCell}>
                        <span className={styles.agentName}>{anom.nombre}</span>
                        <span className={styles.agentType}>{anom.tipo_persona}</span>
                      </div>
                    </td>
                    <td className={styles.dniCell}>{anom.dni}</td>
                    <td>
                      <span style={{ fontWeight: "600" }}>{anom.categoria_control}</span>
                    </td>
                    <td>
                      <span
                        className={`${styles.severityBadge} ${
                          anom.gravedad === "critico"
                            ? styles.critical
                            : anom.gravedad === "advertencia"
                            ? styles.warning
                            : styles.info
                        }`}
                      >
                        {anom.gravedad}
                      </span>
                    </td>
                    <td>
                      <span className={styles.description}>{anom.descripcion}</span>
                    </td>
                    <td>
                      <Link href={anom.link} className={styles.linkBtn} title="Editar ficha de nómina">
                        <span>Editar</span>
                        <ExternalLink size={12} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
