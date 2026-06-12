"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Calendar,
  Lock,
  Unlock,
  AlertTriangle,
  FileCheck,
  TrendingUp,
  AlertCircle,
  TrendingDown,
  Loader2,
  Plus,
  Edit2,
  Settings,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSemester } from "@/lib/contexts/SemesterContext";
import Drawer from "@/components/ui/Drawer";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast, Toaster } from "sonner";
import styles from "./ordenes.module.css";

const CONCEPTS = [
  { tipo: "becas", label: "Becas (Sueldo Básico)", badge: "Becarios Base" },
  { tipo: "monotributos", label: "Honorarios Monotributo", badge: "Monotributistas Base" },
  { tipo: "activa_becas", label: "Tarjeta Activa Becas (10%)", badge: "Activa Becarios" },
  { tipo: "activa_monotributos", label: "Tarjeta Activa Monotributo (10%)", badge: "Activa Monotributistas" },
];

const ocFormSchema = z.object({
  id: z.string().optional(),
  tipo: z.string().min(1, "Tipo de concepto requerido"),
  numero_oc: z.string().min(1, "El número de Orden de Compromiso es obligatorio"),
  monto_asignado: z.number().positive("El monto asignado debe ser mayor a 0"),
  descripcion: z.string().optional(),
});

type OcFormValues = z.infer<typeof ocFormSchema>;

export default function OrdenesCompromisoPage() {
  const supabase = createClient();
  const { semesters, selectedSemester, loading: semesterLoading } = useSemester();

  // Local semester state for history selection
  const [localSemesterId, setLocalSemesterId] = useState<string>("");

  // Sync with global selection
  useEffect(() => {
    if (selectedSemester) {
      setLocalSemesterId(selectedSemester.id);
    }
  }, [selectedSemester]);

  // Compute current semester based on local selection
  const currentSemester = useMemo(() => {
    if (semesters.length === 0) return selectedSemester;
    if (!localSemesterId) return selectedSemester || semesters[0] || null;
    return semesters.find((s) => s.id === localSemesterId) || selectedSemester || semesters[0] || null;
  }, [localSemesterId, semesters, selectedSemester]);

  // Compute unique years from semesters
  const years = useMemo(() => {
    const uniqueYears = Array.from(new Set(semesters.map((s) => s.anio)));
    return uniqueYears.sort((a, b) => b - a);
  }, [semesters]);

  // Selected year of currently active local semester
  const selectedYear = currentSemester?.anio || new Date().getFullYear();

  // Semesters available for the selected year
  const availableSemestersForYear = useMemo(() => {
    return semesters
      .filter((s) => s.anio === selectedYear)
      .sort((a, b) => b.numero_semestre - a.numero_semestre);
  }, [semesters, selectedYear]);

  // Data States
  const [ocs, setOcs] = useState<any[]>([]);
  const [projections, setProjections] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [activeView, setActiveView] = useState<"partidas" | "proyecciones">("partidas");

  // Drawer States
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingOc, setEditingOc] = useState<any | null>(null);
  const [selectedConcept, setSelectedConcept] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  // Form Setup
  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<OcFormValues>({
    resolver: zodResolver(ocFormSchema),
    defaultValues: {
      tipo: "",
      numero_oc: "",
      monto_asignado: 0,
      descripcion: "",
    },
  });

  // Consolidated Calculations
  const consolidated = useMemo(() => {
    let totalAsignado = 0;
    let totalEjecutado = 0;
    let totalCostoMensual = 0;
    let totalProyectadoRestante = 0;
    let mesesRestantes = 0;
    let mesesRestantesList: number[] = [];

    CONCEPTS.forEach((concept) => {
      const oc = ocs.find((o) => o.tipo === concept.tipo);
      const proj = projections[concept.tipo] || { costo_mensual: 0, meses_restantes: 0, meses_restantes_list: [] };

      if (oc) {
        totalAsignado += Number(oc.monto_asignado || 0);
        totalEjecutado += Number(oc.monto_ejecutado || 0);
      }

      totalCostoMensual += Number(proj.costo_mensual || 0);
      totalProyectadoRestante += Number(proj.costo_mensual || 0) * Number(proj.meses_restantes || 0);

      if (proj.meses_restantes > mesesRestantes) {
        mesesRestantes = proj.meses_restantes;
        mesesRestantesList = proj.meses_restantes_list || [];
      }
    });

    const totalProyectado = totalEjecutado + totalProyectadoRestante;
    const balanceProyectado = totalAsignado - totalProyectado;

    return {
      totalAsignado,
      totalEjecutado,
      totalCostoMensual,
      totalProyectadoRestante,
      totalProyectado,
      balanceProyectado,
      mesesRestantes,
      mesesRestantesList,
    };
  }, [ocs, projections]);

  const loadOcsData = async () => {
    if (!currentSemester) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/ordenes?semestre_id=${currentSemester.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al cargar órdenes de compromiso");

      setOcs(data.ordenes || []);
      setProjections(data.proyecciones || {});
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentSemester) {
      loadOcsData();
    }
  }, [currentSemester]);

  // Open Drawer to Create/Edit OC
  const handleOpenDrawer = (concept: any, existingOc: any = null) => {
    if (currentSemester?.bloqueado) return;

    setSelectedConcept(concept);
    setEditingOc(existingOc);

    if (existingOc) {
      reset({
        id: existingOc.id,
        tipo: existingOc.tipo,
        numero_oc: existingOc.numero_oc,
        monto_asignado: Number(existingOc.monto_asignado),
        descripcion: existingOc.descripcion || "",
      });
    } else {
      reset({
        tipo: concept.tipo,
        numero_oc: "",
        monto_asignado: 0,
        descripcion: "",
      });
    }

    setIsDrawerOpen(true);
  };

  // Submit Drawer Form
  const onSubmitOc = async (values: OcFormValues) => {
    if (!currentSemester) return;
    setSaving(true);
    try {
      const payload = {
        ...values,
        semestre_id: currentSemester.id,
      };

      const res = await fetch("/api/ordenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar asignación presupuestaria");

      toast.success(editingOc ? "Orden de Compromiso modificada." : "Orden de Compromiso guardada.");
      setIsDrawerOpen(false);
      await loadOcsData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.container}>
      <Toaster position="top-right" richColors />

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTitleGroup}>
          <h1>Órdenes de Compromiso</h1>
          <p className="text-secondary">
            Administre las partidas de presupuesto semestrales asignadas a la Secretaría.
          </p>
        </div>

        {currentSemester?.bloqueado && (
          <div className={styles.lockAlert}>
            <Lock size={16} />
            <span>Semestre Cerrado (Solo Lectura)</span>
          </div>
        )}
      </div>

      {/* Selector de Período Local */}
      {!semesterLoading && semesters.length > 0 && (
        <div className={styles.filtersWrapper}>
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Año Fiscal</span>
            <div className={styles.selectWrapper}>
              <Calendar size={14} className={styles.selectIcon} />
              <select
                value={selectedYear}
                onChange={(e) => {
                  const year = Number(e.target.value);
                  const sems = semesters.filter((s) => s.anio === year);
                  if (sems.length > 0) {
                    const active = sems.find((s) => s.activo);
                    setLocalSemesterId(active ? active.id : sems[0].id);
                  }
                }}
                className={styles.filterSelect}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Período Semestral</span>
            <div className={styles.periodTabs}>
              {availableSemestersForYear.map((sem) => (
                <button
                  key={sem.id}
                  onClick={() => setLocalSemesterId(sem.id)}
                  className={`${styles.periodTab} ${
                    localSemesterId === sem.id ? styles.periodTabActive : ""
                  }`}
                >
                  <span>{sem.numero_semestre}º Semestre ({sem.numero_semestre === 1 ? "1S" : "2S"})</span>
                  {sem.bloqueado ? (
                    <Lock size={12} style={{ opacity: 0.6, marginLeft: "4px" }} />
                  ) : (
                    <span className={styles.activeIndicator} />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* View Selector Tabs */}
      <div className={styles.tabsContainer}>
        <button
          onClick={() => setActiveView("partidas")}
          className={`${styles.tabLink} ${activeView === "partidas" ? styles.tabLinkActive : ""}`}
        >
          <Settings size={16} />
          <span>Partidas Presupuestarias (OC)</span>
        </button>

        <button
          onClick={() => setActiveView("proyecciones")}
          className={`${styles.tabLink} ${activeView === "proyecciones" ? styles.tabLinkActive : ""}`}
        >
          <TrendingUp size={16} />
          <span>Consola de Proyecciones</span>
        </button>
      </div>

      {loading ? (
        <div className={styles.loadingSpinner}>
          <Loader2 className={styles.spin} size={48} />
          <p>Sincronizando ejecución presupuestaria...</p>
        </div>
      ) : activeView === "partidas" ? (
        <div className={styles.grid}>
          {CONCEPTS.map((concept) => {
            const oc = ocs.find((o) => o.tipo === concept.tipo);

            if (!oc) {
              return (
                <div key={concept.tipo} className={styles.emptyCard}>
                  <div className={styles.emptyIconWrapper}>
                    <Plus size={24} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <h4>{concept.label}</h4>
                    <span className={`${styles.conceptBadge} ${styles[`conceptBadge_${concept.tipo}`]}`} style={{ alignSelf: "center", marginTop: "6px" }}>
                      {concept.badge}
                    </span>
                  </div>
                  <p>Sin Orden de Compromiso presupuestaria registrada para este semestre.</p>
                  
                  {!currentSemester?.bloqueado && (
                    <button
                      onClick={() => handleOpenDrawer(concept)}
                      className={styles.createBtn}
                    >
                      <Plus size={14} />
                      <span>Cargar OC</span>
                    </button>
                  )}
                </div>
              );
            }

            // Calculations
            const asignado = Number(oc.monto_asignado);
            const ejecutado = Number(oc.monto_ejecutado);
            const remanente = asignado - ejecutado;
            const pct = asignado > 0 ? (ejecutado / asignado) * 100 : 0;

            // Semaphoric styles
            let progressClass = styles.progressGreen;
            let alertLevel: "none" | "warning" | "critical" = "none";

            if (pct >= 95) {
              progressClass = styles.progressRed;
              alertLevel = "critical";
            } else if (pct >= 80) {
              progressClass = styles.progressYellow;
              alertLevel = "warning";
            }

            // Projection Calculations
            const proj = projections[concept.tipo] || { costo_mensual: 0, meses_restantes: 0, meses_restantes_list: [] };
            const costoMensual = proj.costo_mensual;
            const mesesRestantes = proj.meses_restantes;
            const mesesRestantesList = proj.meses_restantes_list || [];
            const montoProyectadoRestante = costoMensual * mesesRestantes;
            const totalProyectado = ejecutado + montoProyectadoRestante;
            const balanceProyectado = asignado - totalProyectado;

            const getMonthName = (mNum: number) => {
              const months = [
                "Ene", "Feb", "Mar", "Abr", "May", "Jun",
                "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"
              ];
              return months[mNum - 1] || "";
            };
            const labelMeses = mesesRestantesList.map(getMonthName).join(", ");

            return (
              <div key={concept.tipo} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardTitleGroup}>
                    <h3>{concept.label}</h3>
                    <span>OC N° {oc.numero_oc}</span>
                  </div>
                  <span className={`${styles.conceptBadge} ${styles[`conceptBadge_${concept.tipo}`]}`}>
                    {concept.badge}
                  </span>
                </div>

                <div className={styles.amountsList}>
                   <div className={styles.amountItem}>
                     <span className={styles.amountLabel}>Asignado</span>
                     <span className={styles.amountVal}>
                       ${asignado.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                     </span>
                   </div>
 
                   <div className={styles.amountItem}>
                     <span className={styles.amountLabel}>Ejecutado (Real)</span>
                     <span className={styles.amountVal}>
                       ${ejecutado.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                     </span>
                   </div>
 
                   <div className={`${styles.amountItem} ${styles.totalRow}`}>
                     <span className={styles.amountLabel}>Remanente Disponible</span>
                     <span className={styles.amountVal} style={{ color: remanente >= 0 ? "#10b981" : "#f43f5e" }}>
                       ${remanente.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                     </span>
                   </div>
                </div>

                {/* Progress bar */}
                <div className={styles.progressContainer}>
                  <div className={styles.progressLabelGroup}>
                    <span className={styles.amountLabel}>Progreso de Ejecución</span>
                    <span className={styles.progressPct} style={{ color: pct >= 95 ? "#f43f5e" : pct >= 80 ? "#f59e0b" : "#10b981" }}>
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className={styles.progressBarBg}>
                    <div
                      className={`${styles.progressBar} ${progressClass}`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </div>

                {/* Alerts */}
                {alertLevel === "warning" && (
                  <div className={`${styles.alertBox} ${styles.alertBox_warning}`}>
                    <AlertTriangle size={16} />
                    <span>Advertencia: Ejecución presupuestaria por encima del 80%.</span>
                  </div>
                )}

                {alertLevel === "critical" && (
                  <div className={`${styles.alertBox} ${styles.alertBox_critical}`}>
                    <AlertCircle size={16} />
                    <span>Crítico: Sobregiro inminente, límite del 95% superado.</span>
                  </div>
                )}

                {oc.descripcion && (
                  <p className="text-secondary" style={{ fontSize: "13px", lineHeight: "1.4", margin: "4px 0" }}>
                    {oc.descripcion}
                  </p>
                )}

                {/* Sección de Proyecciones Presupuestarias */}
                <div className={styles.projectionSection}>
                  <h4>
                    <TrendingUp size={16} />
                    <span>Proyección de Nómina Activa</span>
                  </h4>

                  <div className={styles.amountsList} style={{ gap: "8px" }}>
                    <div className={styles.amountItem} style={{ fontSize: "12.5px" }}>
                      <span className={styles.amountLabel}>Costo Nómina (Mensual)</span>
                      <span className={styles.amountVal}>
                        ${costoMensual.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className={styles.amountItem} style={{ fontSize: "12.5px" }}>
                      <span className={styles.amountLabel}>
                        Meses Restantes {labelMeses ? `(${labelMeses})` : ""}
                      </span>
                      <span className={styles.amountVal} style={{ fontFamily: "monospace" }}>
                        {mesesRestantes}
                      </span>
                    </div>

                    <div className={styles.amountItem} style={{ fontSize: "12.5px" }}>
                      <span className={styles.amountLabel}>Monto Proyectado Restante</span>
                      <span className={styles.amountVal}>
                        ${montoProyectadoRestante.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className={`${styles.amountItem} ${styles.totalRow}`} style={{ fontSize: "13px", marginTop: "4px" }}>
                      <span className={styles.amountLabel}>Total (Real + Proyectado)</span>
                      <span className={styles.amountVal} style={{ color: "var(--accent-blue)" }}>
                        ${totalProyectado.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className={styles.amountItem} style={{ fontSize: "13.0px", fontWeight: "600", marginTop: "4px" }}>
                      <span className={styles.amountLabel}>Resultado Final Proyectado</span>
                      <span className={styles.amountVal} style={{ color: balanceProyectado >= 0 ? "#10b981" : "#f43f5e" }}>
                        {balanceProyectado >= 0 ? "Superávit: " : "Déficit: "}
                        ${Math.abs(balanceProyectado).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  {/* Alertas de Proyección */}
                  {balanceProyectado < 0 && (
                    <div className={`${styles.alertBox} ${styles.alertBox_critical}`} style={{ marginTop: "12px", background: "rgba(244, 63, 94, 0.08)", borderColor: "rgba(244, 63, 94, 0.2)", color: "#fda4af" }}>
                      <AlertCircle size={16} />
                      <span><strong>¡Falta Dinero!</strong> El remanente no cubrirá la nómina proyectada por ${Math.abs(balanceProyectado).toLocaleString("es-AR", { minimumFractionDigits: 2 })}.</span>
                    </div>
                  )}

                  {balanceProyectado >= 0 && mesesRestantes > 0 && (
                    <div className={styles.alertBox_success}>
                      <FileCheck size={16} />
                      <span>Fondos suficientes para completar el semestre.</span>
                    </div>
                  )}
                </div>

                {!currentSemester?.bloqueado && (
                  <div className={styles.cardActions}>
                    <button
                      onClick={() => handleOpenDrawer(concept, oc)}
                      className={styles.editBtn}
                    >
                      Editar Asignación
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        // PROJECTIONS CONSOLE VIEW
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Consolidated Warning Banner */}
          {consolidated.balanceProyectado < 0 && (
            <div className={`${styles.alertBox} ${styles.alertBox_critical}`} style={{ padding: "16px", background: "rgba(244, 63, 94, 0.08)", borderColor: "rgba(244, 63, 94, 0.2)", color: "#fda4af", flexDirection: "column", alignItems: "flex-start", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "700", fontSize: "14px" }}>
                <AlertCircle size={20} style={{ color: "var(--accent-rose)" }} />
                <span>ALERTA PRESUPUESTARIA GLOBAL</span>
              </div>
              <p style={{ fontSize: "13px", lineHeight: "1.5" }}>
                La proyección financiera indica que <strong>el presupuesto semestral consolidado no será suficiente</strong> para cubrir la nómina activa actual durante los meses restantes del semestre. Se estima un déficit global de <strong>${Math.abs(consolidated.balanceProyectado).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</strong>. Se recomienda reasignar partidas presupuestarias o gestionar una ampliación de las Órdenes de Compromiso.
              </p>
            </div>
          )}

          {/* Consolidated KPIs */}
          <div className={styles.consolidatedGrid}>
            <div className={styles.kpiCardGlobal}>
              <span className={styles.kpiLabel}>Presupuesto Semestral Total</span>
              <span className={styles.kpiValue}>
                ${consolidated.totalAsignado.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </span>
              <span className={styles.kpiSubtext}>Asignación sumada de las 4 OCs</span>
            </div>

            <div className={styles.kpiCardGlobal}>
              <span className={styles.kpiLabel}>Ejecutado Real (Acumulado)</span>
              <span className={styles.kpiValue} style={{ color: "var(--accent-blue)" }}>
                ${consolidated.totalEjecutado.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </span>
              <span className={styles.kpiSubtext}>
                {consolidated.totalAsignado > 0
                  ? `${((consolidated.totalEjecutado / consolidated.totalAsignado) * 100).toFixed(1)}% ejecutado`
                  : "0% ejecutado"}
              </span>
            </div>

            <div className={styles.kpiCardGlobal}>
              <span className={styles.kpiLabel}>Costo Nómina Activa (Mensual)</span>
              <span className={styles.kpiValue}>
                ${consolidated.totalCostoMensual.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </span>
              <span className={styles.kpiSubtext}>Becarios y monotributistas activos</span>
            </div>

            <div className={`${styles.kpiCardGlobal} ${consolidated.balanceProyectado >= 0 ? styles.kpiBorderGreen : styles.kpiBorderRed}`}>
              <span className={styles.kpiLabel}>Resultado Semestral Proyectado</span>
              <span className={styles.kpiValue} style={{ color: consolidated.balanceProyectado >= 0 ? "#10b981" : "#f43f5e" }}>
                ${consolidated.balanceProyectado.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </span>
              <span className={styles.kpiSubtext} style={{ color: consolidated.balanceProyectado >= 0 ? "#a7f3d0" : "#fda4af", fontWeight: "600" }}>
                {consolidated.balanceProyectado >= 0 ? "Superávit Proyectado" : "Déficit Proyectado"}
              </span>
            </div>
          </div>

          {/* Breakdown Table */}
          <div className={styles.comparisonTableWrapper}>
            <h3>Desglose Comparativo de Partidas</h3>
            <div className={styles.tableResponsive}>
              <table className={styles.comparisonTable}>
                <thead>
                  <tr>
                    <th>Concepto</th>
                    <th>N° OC</th>
                    <th>Presupuesto Asignado</th>
                    <th>Ejecutado Real</th>
                    <th>Proyectado Restante</th>
                    <th>Total Proyectado</th>
                    <th>Resultado Proyectado</th>
                  </tr>
                </thead>
                <tbody>
                  {CONCEPTS.map((concept) => {
                    const oc = ocs.find((o) => o.tipo === concept.tipo);
                    const proj = projections[concept.tipo] || { costo_mensual: 0, meses_restantes: 0 };
                    const costoMensual = proj.costo_mensual;
                    const mesesRestantes = proj.meses_restantes;
                    const montoProyectadoRestante = costoMensual * mesesRestantes;

                    if (!oc) {
                      return (
                        <tr key={concept.tipo}>
                          <td style={{ fontWeight: 600 }}>{concept.label}</td>
                          <td colSpan={6} style={{ color: "var(--text-muted)", textAlign: "center", padding: "14px" }}>
                            Sin Orden de Compromiso asignada para este semestre.
                          </td>
                        </tr>
                      );
                    }

                    const asignado = Number(oc.monto_asignado);
                    const ejecutado = Number(oc.monto_ejecutado);
                    const totalProyectado = ejecutado + montoProyectadoRestante;
                    const balanceProyectado = asignado - totalProyectado;

                    return (
                      <tr key={concept.tipo}>
                        <td style={{ fontWeight: 600 }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <span>{concept.label}</span>
                            <span style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>{concept.badge}</span>
                          </div>
                        </td>
                        <td style={{ fontFamily: "monospace" }}>{oc.numero_oc}</td>
                        <td style={{ fontFamily: "monospace", fontWeight: 600 }}>
                          ${asignado.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ fontFamily: "monospace", color: "var(--accent-blue)" }}>
                          ${ejecutado.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ fontFamily: "monospace", color: "var(--text-secondary)" }}>
                          ${montoProyectadoRestante.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ fontFamily: "monospace", fontWeight: 600, color: "var(--text-primary)" }}>
                          ${totalProyectado.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ fontFamily: "monospace", fontWeight: 700, color: balanceProyectado >= 0 ? "#10b981" : "#f43f5e" }}>
                          ${balanceProyectado >= 0 ? "+" : ""}
                          {balanceProyectado.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Monthly Cronograma */}
          {consolidated.mesesRestantes > 0 && (
            <div className={styles.timelineWrapper}>
              <h3>Cronograma de Egresos Estimados (Mes a Mes)</h3>
              <p className="text-secondary" style={{ fontSize: "13.5px", marginBottom: "16px" }}>
                Meses pendientes de liquidación y sus erogaciones proyectadas según la nómina activa actual:
              </p>
              <div className={styles.timelineGrid}>
                {consolidated.mesesRestantesList.map((mNum) => {
                  const getFullMonthName = (m: number) => {
                    const months = [
                      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
                      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
                    ];
                    return months[m - 1] || "";
                  };

                  return (
                    <div key={mNum} className={styles.timelineCard}>
                      <div className={styles.timelineHeader}>
                        <Calendar size={18} style={{ color: "#06b6d4" }} />
                        <span className={styles.timelineMonth}>{getFullMonthName(mNum)}</span>
                      </div>
                      <div className={styles.timelineBody}>
                        <div className={styles.timelineDetailRow}>
                          <span className={styles.timelineLabel}>Egresos Estimados</span>
                          <span className={styles.timelineValue}>
                            ${consolidated.totalCostoMensual.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "8px" }}>
                          Basado en el costo run-rate mensual actual de la nómina de becarios y monotributistas.
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Drawer Form to create/edit OC */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={editingOc ? `Editar OC: ${selectedConcept?.label}` : `Cargar OC: ${selectedConcept?.label}`}
        size="md"
      >
        <form onSubmit={handleSubmit(onSubmitOc)} className={styles.drawerForm}>
          <div className={styles.formGroup}>
            <label>Número de Orden de Compromiso (OC) *</label>
            <input
              type="text"
              placeholder="Ej. 1024/2026"
              className="input-field"
              {...register("numero_oc")}
            />
            {errors.numero_oc && <span className={styles.formError}>{errors.numero_oc.message}</span>}
          </div>

          <div className={styles.formGroup}>
            <label>Monto Asignado ($) *</label>
            <input
              type="number"
              step="0.01"
              placeholder="Ej. 15000000.00"
              className="input-field"
              {...register("monto_asignado", { valueAsNumber: true })}
            />
            {errors.monto_asignado && (
              <span className={styles.formError}>{errors.monto_asignado.message}</span>
            )}
          </div>

          <div className={styles.formGroup}>
            <label>Descripción / Observación</label>
            <textarea
              placeholder="Ingrese notas aclaratorias de la partida presupuestaria..."
              className="input-field"
              rows={4}
              style={{ resize: "vertical" }}
              {...register("descripcion")}
            />
            {errors.descripcion && <span className={styles.formError}>{errors.descripcion.message}</span>}
          </div>

          <div className={styles.formActions}>
            <button
              type="button"
              onClick={() => setIsDrawerOpen(false)}
              className="secondaryBtn"
              disabled={saving}
            >
              Cancelar
            </button>
            <button type="submit" className="primaryBtn" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className={styles.spin} size={14} />
                  <span>Guardando...</span>
                </>
              ) : (
                <span>Guardar Partida</span>
              )}
            </button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
