"use client";

import React, { useState, useEffect } from "react";
import {
  Users,
  Briefcase,
  GraduationCap,
  DollarSign,
  FileCheck,
  AlertTriangle,
  Activity,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Clock,
} from "lucide-react";
import { usePortalAuth } from "@/lib/contexts/PortalAuthContext";
import { usePortalFilter } from "@/lib/contexts/PortalFilterContext";
import { useSemester } from "@/lib/contexts/SemesterContext";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { motion } from "framer-motion";
import styles from "./dashboard.module.css";

// Eased Counter Component
function AnimatedCounter({
  value,
  duration = 1200,
  isCurrency = false,
  suffix = "",
}: {
  value: number;
  duration?: number;
  isCurrency?: boolean;
  suffix?: string;
}) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTime: number | null = null;
    const startValue = 0;
    const endValue = value;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = timestamp - startTime;
      const rate = Math.min(progress / duration, 1);
      
      // Easing function (easeOutQuad)
      const easeRate = rate * (2 - rate);
      const currentVal = Math.round(startValue + (endValue - startValue) * easeRate);
      
      setCount(currentVal);

      if (rate < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [value, duration]);

  if (isCurrency) {
    return (
      <span>
        {count.toLocaleString("es-AR", {
          style: "currency",
          currency: "ARS",
          maximumFractionDigits: 0,
        })}
      </span>
    );
  }

  return <span>{count.toLocaleString("es-AR")}{suffix}</span>;
}

export default function PortalDashboardPage() {
  const { user } = usePortalAuth();
  const { selectedSemester } = useSemester();
  const { selectedSubsecretariaId, selectedAreaId, selectedResponsableId } = usePortalFilter();

  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<any>(null);

  useEffect(() => {
    if (!selectedSemester) return;
    const semestreId = selectedSemester.id;

    async function loadDashboard() {
      setLoading(true);
      try {
        const url = `/api/portal/dashboard?semestre_id=${semestreId}&subsecretaria_id=${selectedSubsecretariaId}&area_id=${selectedAreaId}&responsable_id=${selectedResponsableId}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setDashboardData(data);
        }
      } catch (err) {
        console.error("Error loading dashboard data:", err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, [selectedSemester, selectedSubsecretariaId, selectedAreaId, selectedResponsableId]);

  if (loading || !dashboardData) {
    return (
      <div className={styles.loadingState}>
        <div className={styles.spinner} />
        <span>Cargando datos del panel...</span>
      </div>
    );
  }

  const { metrics, charts, recentActivity, alertsList } = dashboardData;

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
      },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1 },
  };

  const formatMonthName = (m: number) => {
    const months = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];
    return months[m - 1] || "";
  };

  return (
    <div className={styles.container}>
      {/* Saludo y Encabezado */}
      <div className={styles.welcomeBanner}>
        <div className={styles.welcomeLeft}>
          <h2>¡Hola, {user?.nombre_completo}!</h2>
          <p>
            Aquí tienes el resumen ejecutivo para el período{" "}
            <strong>{selectedSemester?.nombre_display}</strong>.
          </p>
        </div>
        <div className={styles.welcomeRight}>
          <span className={`${styles.statusBadge} ${selectedSemester?.bloqueado ? styles.badgeLocked : styles.badgeActive}`}>
            {selectedSemester?.bloqueado ? "🔒 Historial Bloqueado" : "🟢 Semestre Activo"}
          </span>
          <span className={styles.readOnlyBadge}>👁️ Modo Solo Lectura</span>
        </div>
      </div>

      {/* Sección Financiera (Secretario only) */}
      {user?.es_secretario && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className={styles.financeSection}
        >
          {(() => {
            const ocsList = dashboardData?.ocs || [];
            const totalAssigned = ocsList.reduce((sum: number, o: any) => sum + Number(o.monto_asignado || 0), 0);
            const totalExecuted = ocsList.reduce((sum: number, o: any) => sum + Number(o.monto_ejecutado || 0), 0);
            const totalRemaining = totalAssigned - totalExecuted;
            const progress = totalAssigned > 0 ? (totalExecuted / totalAssigned) * 100 : 0;

            // Determine health status
            let statusText = "Presupuesto Saludable";
            let statusClass = styles.financeStatusOk;
            if (progress >= 95 || totalRemaining < 0) {
              statusText = "Excedido / Límite Crítico";
              statusClass = styles.financeStatusDanger;
            } else if (progress >= 80) {
              statusText = "Alerta de Partida Límite";
              statusClass = styles.financeStatusWarning;
            }

            const getOcColor = (p: number) => {
              if (p >= 95) return styles.bgRose;
              if (p >= 80) return styles.bgAmber;
              return styles.bgEmerald;
            };

            const getOcName = (tipo: string) => {
              switch (tipo) {
                case "becas": return "Becarios (Base)";
                case "activa_becas": return "Becarios (Tarjeta Activa)";
                case "monotributos": return "Monotributistas (Base)";
                case "activa_monotributos": return "Monotributistas (Tarjeta Activa)";
                default: return tipo;
              }
            };

            return (
              <>
                <div className={styles.financeHeader}>
                  <div className={styles.financeTitle}>
                    <DollarSign size={20} className="text-emerald" />
                    <span>Control Presupuestario de Partidas</span>
                  </div>
                  <span className={statusClass}>
                    {statusText} ({progress.toFixed(1)}%)
                  </span>
                </div>

                <div className={styles.financeGrid}>
                  {/* Global card */}
                  <div className={styles.globalBudgetCard}>
                    <div>
                      <span className={styles.budgetLabel}>Presupuesto Semestral Consolidado</span>
                      <h4 className={styles.budgetValue}>
                        {totalAssigned.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })}
                      </h4>
                    </div>

                    <div className={styles.budgetProgressBar}>
                      <div
                        className={`${styles.budgetProgressBarFill} ${getOcColor(progress)}`}
                        style={{ width: `${Math.min(progress, 100)}%` }}
                      />
                    </div>

                    <div className={styles.budgetSummaryStats}>
                      <span className="text-secondary">
                        Ejecutado: <strong>{totalExecuted.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })}</strong>
                      </span>
                      <span className={totalRemaining >= 0 ? "text-emerald" : "text-rose"}>
                        {totalRemaining >= 0 ? "Disponible: " : "Sobregiro: "}
                        <strong>{Math.abs(totalRemaining).toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })}</strong>
                      </span>
                    </div>
                  </div>

                  {/* Detailed grid */}
                  <div className={styles.budgetDetailsGrid}>
                    {["becas", "activa_becas", "monotributos", "activa_monotributos"].map((tipo) => {
                      const oc = ocsList.find((o: any) => o.tipo === tipo) || {
                        monto_asignado: 0,
                        monto_ejecutado: 0,
                        numero_oc: "N/A"
                      };
                      const assigned = Number(oc.monto_asignado);
                      const executed = Number(oc.monto_ejecutado);
                      const remaining = assigned - executed;
                      const pct = assigned > 0 ? (executed / assigned) * 100 : 0;

                      return (
                        <div key={tipo} className={styles.financeDetailItem}>
                          <div className={styles.financeDetailHeader}>
                            <span>{getOcName(tipo)}</span>
                            <span className="text-muted">OC #{oc.numero_oc}</span>
                          </div>
                          <h5 className={styles.financeDetailValue}>
                            {assigned.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })}
                          </h5>
                          
                          <div className={styles.budgetProgressBar} style={{ height: "4px" }}>
                            <div
                              className={`${styles.budgetProgressBarFill} ${getOcColor(pct)}`}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>

                          <div className={styles.financeDetailSub}>
                            <span>Ejec: {pct.toFixed(0)}%</span>
                            <span className={remaining >= 0 ? "text-emerald" : "text-rose"}>
                              Disp: {remaining.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            );
          })()}
        </motion.div>
      )}

      {/* KPI Cards Grid */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className={styles.kpiGrid}
      >
        {/* KPI 1: Total Personal */}
        <motion.div variants={itemVariants} className={`${styles.kpiCard} glass-panel`}>
          <div className={`${styles.kpiIconWrapper} ${styles.cyan}`}>
            <Users size={24} />
          </div>
          <div className={styles.kpiContent}>
            <span className={styles.kpiLabel}>Total Personal Activo</span>
            <h3 className={styles.kpiValue}>
              <AnimatedCounter value={metrics.totalPersonal} />
            </h3>
          </div>
        </motion.div>

        {/* KPI 2: Becarios */}
        <motion.div variants={itemVariants} className={`${styles.kpiCard} glass-panel`}>
          <div className={`${styles.kpiIconWrapper} ${styles.blue}`}>
            <GraduationCap size={24} />
          </div>
          <div className={styles.kpiContent}>
            <span className={styles.kpiLabel}>Becarios Activos</span>
            <h3 className={styles.kpiValue}>
              <AnimatedCounter value={metrics.becariosCount} />
            </h3>
          </div>
        </motion.div>

        {/* KPI 3: Monotributistas */}
        <motion.div variants={itemVariants} className={`${styles.kpiCard} glass-panel`}>
          <div className={`${styles.kpiIconWrapper} ${styles.emerald}`}>
            <Briefcase size={24} />
          </div>
          <div className={styles.kpiContent}>
            <span className={styles.kpiLabel}>Monotributistas Activos</span>
            <h3 className={styles.kpiValue}>
              <AnimatedCounter value={metrics.monotributistasCount} />
            </h3>
          </div>
        </motion.div>

        {/* KPI 4: Costo Mensual Total */}
        <motion.div variants={itemVariants} className={`${styles.kpiCard} glass-panel`}>
          <div className={`${styles.kpiIconWrapper} ${styles.purple}`}>
            <DollarSign size={24} />
          </div>
          <div className={styles.kpiContent}>
            <span className={styles.kpiLabel}>Costo Mensual Consolidado</span>
            <h3 className={styles.kpiValue}>
              <AnimatedCounter value={metrics.costoMensualTotal} isCurrency={true} />
            </h3>
          </div>
        </motion.div>

        {/* KPI 5: Documentacion Completa */}
        <motion.div variants={itemVariants} className={`${styles.kpiCard} glass-panel`}>
          <div className={`${styles.kpiIconWrapper} ${styles.green}`}>
            <FileCheck size={24} />
          </div>
          <div className={styles.kpiContent}>
            <span className={styles.kpiLabel}>Legajos Completados</span>
            <h3 className={styles.kpiValue}>
              <AnimatedCounter value={metrics.docsCompletosPct} suffix="%" />
            </h3>
          </div>
        </motion.div>

        {/* KPI 6: Alertas Pendientes */}
        <motion.div variants={itemVariants} className={`${styles.kpiCard} glass-panel`}>
          <div className={`${styles.kpiIconWrapper} ${metrics.alertasCount > 0 ? styles.amber : styles.muted}`}>
            <AlertTriangle size={24} />
          </div>
          <div className={styles.kpiContent}>
            <span className={styles.kpiLabel}>Alertas de Gestión</span>
            <h3 className={styles.kpiValue}>
              <AnimatedCounter value={metrics.alertasCount} />
            </h3>
          </div>
        </motion.div>
      </motion.div>

      {/* Grid de Gráficos */}
      <div className={styles.chartsGrid}>
        {/* Gráfico 1: Distribución */}
        <div className={`${styles.chartCard} glass-panel`}>
          <h4 className={styles.chartTitle}>Distribución de Personal</h4>
          <div className={styles.chartWrapper}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={charts.distribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {charts.distribution.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                    color: "#fff",
                  }}
                />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico 2: Costo por Area */}
        <div className={`${styles.chartCard} glass-panel`}>
          <h4 className={styles.chartTitle}>Presupuesto Mensual por Área</h4>
          <div className={styles.chartWrapper}>
            {charts.costByArea.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={charts.costByArea}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    type="number"
                    stroke="#64748b"
                    fontSize={11}
                    tickFormatter={(v) => `$${(v / 1000).toLocaleString()}k`}
                  />
                  <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={11} width={80} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "8px",
                      color: "#fff",
                    }}
                    formatter={(value: any) => [`$${value.toLocaleString()}`, "Importe Mensual"]}
                  />
                  <Bar dataKey="total" fill="url(#barGradient)" radius={[0, 4, 4, 0]}>
                    {charts.costByArea.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={index % 2 === 0 ? "#8b5cf6" : "#3b82f6"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className={styles.emptyChart}>No hay costos registrados en las áreas asociadas.</div>
            )}
          </div>
        </div>

        {/* Gráfico 3: Evolución de Altas y Bajas */}
        <div className={`${styles.chartCard} glass-panel`}>
          <h4 className={styles.chartTitle}>Tendencia de Altas y Bajas (Últimos 6 meses)</h4>
          <div className={styles.chartWrapper}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={charts.evolution}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="monthName" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                    color: "#fff",
                  }}
                />
                <Legend />
                <Line type="monotone" dataKey="altas" stroke="#10b981" strokeWidth={2.5} name="Altas" />
                <Line type="monotone" dataKey="bajas" stroke="#ef4444" strokeWidth={2.5} name="Bajas" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico 4: Estado de Legajos */}
        <div className={`${styles.chartCard} glass-panel`}>
          <h4 className={styles.chartTitle}>Auditoría Legajos y Cobertura</h4>
          <div className={styles.chartWrapper}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={charts.docsStatus}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {charts.docsStatus.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                    color: "#fff",
                  }}
                />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Grid de Actividad y Alertas */}
      <div className={styles.activityAlertsSection}>
        {/* Columna Alertas de Gestión */}
        <div className={`${styles.alertsCard} glass-panel`}>
          <div className={styles.sectionHeader}>
            <AlertTriangle size={18} className="text-amber" />
            <h4>Alertas de Gestión</h4>
          </div>
          <div className={styles.alertsList}>
            {alertsList.length > 0 ? (
              alertsList.map((alert: any) => (
                <div
                  key={alert.id}
                  className={`${styles.alertItem} ${alert.severity === "danger" ? styles.dangerAlert : styles.warningAlert}`}
                >
                  <AlertTriangle size={16} className={alert.severity === "danger" ? styles.iconDanger : styles.iconWarning} />
                  <div className={styles.alertContent}>
                    <p className={styles.alertMessage}>{alert.message}</p>
                    <span className={styles.alertMeta}>Agente: {alert.nombre}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className={styles.emptyState}>
                <p>✅ Todo al día. No hay alertas críticas registradas en tus áreas.</p>
              </div>
            )}
          </div>
        </div>

        {/* Columna Actividad Reciente */}
        <div className={`${styles.activityCard} glass-panel`}>
          <div className={styles.sectionHeader}>
            <Activity size={18} className="text-purple" />
            <h4>Actividad y Movimientos Recientes</h4>
          </div>
          <div className={styles.activityTimeline}>
            {recentActivity.length > 0 ? (
              recentActivity.map((act: any) => (
                <div key={act.id} className={styles.timelineItem}>
                  <div className={`${styles.timelineBadge} ${styles[act.tipo_movimiento]}`}>
                    <Clock size={12} />
                  </div>
                  <div className={styles.timelineContent}>
                    <div className={styles.timelineMeta}>
                      <span className={styles.activityTime}>
                        {new Date(act.fecha).toLocaleDateString("es-AR")} - {formatMonthName(act.mes)}
                      </span>
                    </div>
                    <p className={styles.activityDesc}>{act.descripcion}</p>
                    <span className={styles.agentTag}>
                      {act.tipo_persona === "becario" ? "🎓 Becario" : "💼 Monotributista"}: {act.nombre_persona}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className={styles.emptyState}>
                <p>No se registran movimientos en el período seleccionado.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
