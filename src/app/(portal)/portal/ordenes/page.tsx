"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Calendar,
  Lock,
  AlertTriangle,
  FileCheck,
  TrendingUp,
  AlertCircle,
  TrendingDown,
  Loader2,
  DollarSign,
  Briefcase,
  Layers,
  ArrowRight,
  FileText,
} from "lucide-react";
import { useSemester } from "@/lib/contexts/SemesterContext";
import { toast, Toaster } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import styles from "./ordenes.module.css";

const CONCEPTS = [
  { tipo: "becas", label: "Becas (Sueldo Básico)", badge: "Becarios Base" },
  { tipo: "monotributos", label: "Honorarios Monotributo", badge: "Monotributistas Base" },
  { tipo: "activa_becas", label: "Tarjeta Activa Becas (10%)", badge: "Activa Becarios" },
  { tipo: "activa_monotributos", label: "Tarjeta Activa Monotributo (10%)", badge: "Activa Monotributistas" },
];

export default function PortalOrdenesCompromisoPage() {
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
  const [porcentajeActiva, setPorcentajeActiva] = useState(10);

  const concepts = useMemo(() => [
    { tipo: "becas", label: "Becas (Sueldo Básico)", badge: "Becarios Base" },
    { tipo: "monotributos", label: "Honorarios Monotributo", badge: "Monotributistas Base" },
    { tipo: "activa_becas", label: `Tarjeta Activa Becas (${porcentajeActiva}%)`, badge: "Activa Becarios" },
    { tipo: "activa_monotributos", label: `Tarjeta Activa Monotributo (${porcentajeActiva}%)`, badge: "Activa Monotributistas" },
  ], [porcentajeActiva]);

  // Consolidated Calculations
  const consolidated = useMemo(() => {
    let totalAsignado = 0;
    let totalEjecutado = 0;
    let totalCostoMensual = 0;
    let totalProyectadoRestante = 0;
    let mesesRestantes = 0;
    let mesesRestantesList: number[] = [];

    concepts.forEach((concept) => {
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
  }, [ocs, projections, concepts]);

  const loadOcsData = async () => {
    if (!currentSemester) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/ordenes?semestre_id=${currentSemester.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al cargar órdenes de compromiso");

      setOcs(data.ordenes || []);
      setProjections(data.proyecciones || {});

      // Use a fixed or parsed active percentage from the loaded OCs or active categories if needed
      setPorcentajeActiva(10);
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

  // Helpers
  const formatCurrency = (val: number) => {
    return val.toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };

  const getProgressColor = (pct: number) => {
    if (pct >= 95) return styles.progressRed;
    if (pct >= 80) return styles.progressYellow;
    return styles.progressGreen;
  };

  const formatMonthName = (m: number) => {
    const months = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];
    return months[m - 1] || "";
  };

  if (semesterLoading || (loading && ocs.length === 0)) {
    return (
      <div className={styles.loadingSpinner}>
        <Loader2 className={styles.spin} size={48} />
        <span>Sincronizando ejecución presupuestaria...</span>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Toaster position="top-right" richColors />

      {/* Header Panel */}
      <div className={`${styles.header} glass-panel`}>
        <div className={styles.headerTitleGroup}>
          <h1>Órdenes de Compromiso</h1>
          <p className="text-secondary">
            Administre y visualice las partidas de presupuesto semestrales asignadas a la Secretaría.
          </p>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.headerActions}>
            <Calendar size={16} className="text-secondary" />
            <select
              value={selectedYear}
              onChange={(e) => {
                const year = Number(e.target.value);
                const sems = semesters.filter((s) => s.anio === year);
                if (sems.length > 0) {
                  setLocalSemesterId(sems[0].id);
                }
              }}
              className="input-field"
              style={{ width: "90px", padding: "6px 8px" }}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>

            <select
              value={localSemesterId}
              onChange={(e) => setLocalSemesterId(e.target.value)}
              className="input-field"
              style={{ width: "150px", padding: "6px 8px" }}
            >
              {availableSemestersForYear.map((s) => (
                <option key={s.id} value={s.id}>
                  Semestre {s.numero_semestre} {s.bloqueado ? "🔒" : "🟢"}
                </option>
              ))}
            </select>
          </div>

          {currentSemester?.bloqueado && (
            <div className={styles.lockAlert}>
              <Lock size={16} />
              <span>Semestre Cerrado (Solo Lectura)</span>
            </div>
          )}
        </div>
      </div>

      {/* Consolidated Summary Panel */}
      <div className={`${styles.summaryPanel} glass-panel`}>
        <h3 className={styles.summaryTitle}>Resumen Ejecutivo Presupuestario</h3>
        <div className={styles.summaryGrid}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Total Asignado (OCs)</span>
            <span className="font-bold text-lg text-primary">
              {formatCurrency(consolidated.totalAsignado)}
            </span>
            <span className={styles.summarySub}>Suma de las 4 partidas</span>
          </div>

          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Gasto Real Ejecutado</span>
            <span className="font-bold text-lg text-amber">
              {formatCurrency(consolidated.totalEjecutado)}
            </span>
            <span className={styles.summarySub}>
              {consolidated.totalAsignado > 0
                ? `${((consolidated.totalEjecutado / consolidated.totalAsignado) * 100).toFixed(1)}% de ejecución`
                : "0%"}
            </span>
          </div>

          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Proyección de Gasto Semestre</span>
            <span className="font-bold text-lg text-purple">
              {formatCurrency(consolidated.totalProyectado)}
            </span>
            <span className={styles.summarySub}>
              Ejecutado + Costo proyectado restante
            </span>
          </div>

          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Balance Proyectado</span>
            <span
              className={`font-bold text-lg ${consolidated.balanceProyectado >= 0 ? "text-emerald" : "text-rose"}`}
            >
              {formatCurrency(consolidated.balanceProyectado)}
            </span>
            <span className={styles.summarySub}>
              {consolidated.balanceProyectado >= 0 ? "🟢 Dentro del presupuesto" : "🔴 Riesgo de sobregiro"}
            </span>
          </div>
        </div>
      </div>

      {/* View Selection Tabs */}
      <div className={styles.tabsContainer}>
        <button
          onClick={() => setActiveView("partidas")}
          className={`${styles.tabButton} ${activeView === "partidas" ? styles.tabButtonActive : ""}`}
        >
          <span>Partidas Presupuestarias</span>
          {activeView === "partidas" && <motion.div layoutId="oc-tab-underline" className={styles.tabIndicator} />}
        </button>
        <button
          onClick={() => setActiveView("proyecciones")}
          className={`${styles.tabButton} ${activeView === "proyecciones" ? styles.tabButtonActive : ""}`}
        >
          <span>Proyección del Semestre</span>
          {activeView === "proyecciones" && <motion.div layoutId="oc-tab-underline" className={styles.tabIndicator} />}
        </button>
      </div>

      {/* Views Container */}
      <div className={styles.viewContainer}>
        <AnimatePresence mode="wait">
          {activeView === "partidas" && (
            <motion.div
              key="partidas"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className={styles.grid}
            >
              {concepts.map((concept) => {
                const oc = ocs.find((o) => o.tipo === concept.tipo);
                const assigned = Number(oc?.monto_asignado || 0);
                const executed = Number(oc?.monto_ejecutado || 0);
                const remaining = assigned - executed;
                const progressPct = assigned > 0 ? (executed / assigned) * 100 : 0;

                if (!oc) {
                  return (
                    <div key={concept.tipo} className={styles.emptyCard}>
                      <div className={styles.emptyIconWrapper}>
                        <FileText size={24} />
                      </div>
                      <h4>Sin Orden de Compromiso</h4>
                      <p>No se ha registrado ninguna Orden de Compromiso para {concept.label}.</p>
                    </div>
                  );
                }

                return (
                  <div key={oc.id} className={`${styles.card} glass-panel`}>
                    <div className={styles.cardHeader}>
                      <div className={styles.cardTitleGroup}>
                        <h3>OC #{oc.numero_oc}</h3>
                        <span>{concept.label}</span>
                      </div>
                      <span className={`${styles.conceptBadge} ${styles[`conceptBadge_${concept.tipo}`]}`}>
                        {concept.badge}
                      </span>
                    </div>

                    <div className={styles.amountsList}>
                      <div className={styles.amountItem}>
                        <span className={styles.amountLabel}>Monto Asignado:</span>
                        <span className={styles.amountVal}>{formatCurrency(assigned)}</span>
                      </div>
                      <div className={styles.amountItem}>
                        <span className={styles.amountLabel}>Monto Ejecutado:</span>
                        <span className={styles.amountVal} style={{ color: "var(--accent-amber)" }}>
                          {formatCurrency(executed)}
                        </span>
                      </div>
                      <div className={`${styles.amountItem} ${styles.totalRow}`}>
                        <span className={styles.amountLabel}>Monto Disponible:</span>
                        <span
                          className={styles.amountVal}
                          style={{ color: remaining >= 0 ? "var(--accent-emerald)" : "var(--accent-rose)" }}
                        >
                          {formatCurrency(remaining)}
                        </span>
                      </div>
                    </div>

                    <div className={styles.progressContainer}>
                      <div className={styles.progressLabelGroup}>
                        <span>Ejecución Presupuestaria</span>
                        <span className={styles.progressPct}>{progressPct.toFixed(1)}%</span>
                      </div>
                      <div className={styles.progressBarBg}>
                        <div
                          className={`${styles.progressBar} ${getProgressColor(progressPct)}`}
                          style={{ width: `${Math.min(progressPct, 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Warning Alerts */}
                    {progressPct >= 95 ? (
                      <div className={styles.alertBox_critical}>
                        <AlertTriangle size={16} />
                        <span>Presupuesto Límite Crítico (&gt;95%)</span>
                      </div>
                    ) : progressPct >= 80 ? (
                      <div className={styles.alertBox_warning}>
                        <AlertTriangle size={16} />
                        <span>Alerta de Consumo Elevado (&gt;80%)</span>
                      </div>
                    ) : (
                      assigned > 0 && (
                        <div className={styles.alertBox_success}>
                          <FileCheck size={16} />
                          <span>Partida en estado normal</span>
                        </div>
                      )
                    )}

                    {oc.descripcion && (
                      <p className="text-secondary text-xs mt-2 italic" style={{ fontSize: "12px" }}>
                        Nota: {oc.descripcion}
                      </p>
                    )}
                  </div>
                );
              })}
            </motion.div>
          )}

          {activeView === "proyecciones" && (
            <motion.div
              key="proyecciones"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className={styles.grid}
            >
              {concepts.map((concept) => {
                const oc = ocs.find((o) => o.tipo === concept.tipo);
                const proj = projections[concept.tipo] || { costo_mensual: 0, meses_restantes: 0, meses_restantes_list: [] };
                const assigned = Number(oc?.monto_asignado || 0);
                const executed = Number(oc?.monto_ejecutado || 0);
                const monthly = Number(proj.costo_mensual || 0);
                const remainingMonths = Number(proj.meses_restantes || 0);
                const projectedCostRemaining = monthly * remainingMonths;
                const totalProjected = executed + projectedCostRemaining;
                const balance = assigned - totalProjected;

                return (
                  <div key={concept.tipo} className={`${styles.card} glass-panel`}>
                    <div className={styles.cardHeader}>
                      <div className={styles.cardTitleGroup}>
                        <h3>Proyección {concept.badge}</h3>
                        <span>{concept.label}</span>
                      </div>
                    </div>

                    <div className={styles.amountsList}>
                      <div className={styles.amountItem}>
                        <span className={styles.amountLabel}>Gasto Mensual Actual:</span>
                        <span className={styles.amountVal}>{formatCurrency(monthly)}</span>
                      </div>
                      <div className={styles.amountItem}>
                        <span className={styles.amountLabel}>Meses Restantes a Liquidar:</span>
                        <span className={styles.amountVal}>{remainingMonths} meses</span>
                      </div>
                      <div className={styles.amountItem}>
                        <span className={styles.amountLabel}>Gasto Proyectado Restante:</span>
                        <span className={styles.amountVal} style={{ color: "var(--text-secondary)" }}>
                          {formatCurrency(projectedCostRemaining)}
                        </span>
                      </div>
                      <div className={`${styles.amountItem} ${styles.totalRow}`}>
                        <span className={styles.amountLabel}>Proyección Semestre Total:</span>
                        <span className={styles.amountVal}>{formatCurrency(totalProjected)}</span>
                      </div>
                      <div className={styles.amountItem}>
                        <span className={styles.amountLabel}>Balance Proyectado:</span>
                        <span
                          className={styles.amountVal}
                          style={{ color: balance >= 0 ? "var(--accent-emerald)" : "var(--accent-rose)" }}
                        >
                          {balance >= 0 ? "+" : ""}{formatCurrency(balance)}
                        </span>
                      </div>
                    </div>

                    {remainingMonths > 0 && proj.meses_restantes_list?.length > 0 && (
                      <div className="text-secondary text-xs mt-2" style={{ fontSize: "11px" }}>
                        Meses pendientes:{" "}
                        <strong className="text-primary">
                          {proj.meses_restantes_list.map((m: number) => formatMonthName(m)).join(", ")}
                        </strong>
                      </div>
                    )}

                    {balance < 0 ? (
                      <div className={styles.alertBox_critical}>
                        <AlertTriangle size={16} />
                        <span>Riesgo Crítico de Insuficiencia Financiera</span>
                      </div>
                    ) : (
                      assigned > 0 && (
                        <div className={styles.alertBox_success}>
                          <FileCheck size={16} />
                          <span>Partida Cubierta y Segura</span>
                        </div>
                      )
                    )}
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
