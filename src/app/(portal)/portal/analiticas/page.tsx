"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Search,
  Filter,
  BarChart3,
  Download,
  Loader2,
  Calendar as CalendarIcon,
  Users,
  Briefcase,
  DollarSign,
  FileCheck,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import { useSemester } from "@/lib/contexts/SemesterContext";
import { usePortalFilter } from "@/lib/contexts/PortalFilterContext";
import { usePortalAuth } from "@/lib/contexts/PortalAuthContext";
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
import styles from "./analiticas.module.css";

type TabType = "personal" | "financiero" | "documentos" | "calendar";

interface CalendarEvent {
  id: string;
  date: string;
  title: string;
  type: string; // 'seguro' | 'campaña' | 'vencimiento_documento'
  severity: "info" | "warning" | "danger" | "success";
  agentName?: string;
}

export default function PortalAnaliticasPage() {
  const { user } = usePortalAuth();
  const { selectedSemester } = useSemester();
  const { selectedSubsecretariaId, selectedAreaId } = usePortalFilter();

  const [activeTab, setActiveTab] = useState<TabType>("personal");
  const [loading, setLoading] = useState(true);
  const [analyticsData, setAnalyticsData] = useState<any>(null);

  // Calendar State
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    if (!selectedSemester) return;
    const semestreId = selectedSemester.id;

    async function loadAnalytics() {
      setLoading(true);
      try {
        const url = `/api/portal/analiticas?semestre_id=${semestreId}&subsecretaria_id=${selectedSubsecretariaId}&area_id=${selectedAreaId}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setAnalyticsData(data);
        }
      } catch (err) {
        console.error("Error loading analytics data:", err);
      } finally {
        setLoading(false);
      }
    }

    loadAnalytics();
  }, [selectedSemester, selectedSubsecretariaId, selectedAreaId]);

  // Calendar calculations
  const calendarMonthData = useMemo(() => {
    if (!analyticsData || !analyticsData.calendarEvents) return [];
    
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // First day of the month
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 (Sun) to 6 (Sat)
    // Days in current month
    const totalDays = new Date(year, month + 1, 0).getDate();
    // Days in previous month
    const prevMonthTotalDays = new Date(year, month, 0).getDate();

    const days: { day: number; dateString: string; isCurrentMonth: boolean; events: CalendarEvent[] }[] = [];

    // Prepend previous month days to align grid
    const startOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1; // Align to Mon
    for (let i = startOffset; i > 0; i--) {
      const d = prevMonthTotalDays - i + 1;
      const prevMonthString = `${month === 0 ? year - 1 : year}-${String(month === 0 ? 12 : month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({
        day: d,
        dateString: prevMonthString,
        isCurrentMonth: false,
        events: [],
      });
    }

    // Populate current month days
    for (let d = 1; d <= totalDays; d++) {
      const dateString = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      
      // Filter events matching this date
      const matches = (analyticsData.calendarEvents as CalendarEvent[]).filter((e) => {
        const eventDateStr = new Date(e.date).toISOString().split("T")[0];
        return eventDateStr === dateString;
      });

      days.push({
        day: d,
        dateString,
        isCurrentMonth: true,
        events: matches,
      });
    }

    // Append next month days to complete grid rows
    const totalSlots = 42; // 6 rows of 7 days
    const nextMonthDaysCount = totalSlots - days.length;
    for (let d = 1; d <= nextMonthDaysCount; d++) {
      const nextMonthString = `${month === 11 ? year + 1 : year}-${String(month === 11 ? 1 : month + 2).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({
        day: d,
        dateString: nextMonthString,
        isCurrentMonth: false,
        events: [],
      });
    }

    return days;
  }, [analyticsData, currentDate]);

  const monthYearLabel = useMemo(() => {
    const months = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];
    return `${months[currentDate.getMonth()]} de ${currentDate.getFullYear()}`;
  }, [currentDate]);

  // jsPDF Executive Report generator
  const exportExecutivePDF = async () => {
    if (!analyticsData) return;
    const { default: jsPDF } = await import("jspdf");
    const { applyPlugin } = await import("jspdf-autotable");
    applyPlugin(jsPDF);
    const doc = new jsPDF();
    const activeSemName = selectedSemester?.nombre_display || "Historial";

    // Membrete page 1
    doc.setFillColor(10, 22, 40);
    doc.rect(0, 0, 210, 45, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("SECRETARÍA DE FORTALECIMIENTO VECINAL, CULTURA Y DEPORTES", 15, 18);
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text("INFORME EJECUTIVO DE GESTIÓN Y AUDITORÍA DE NÓMINA", 15, 26);
    doc.setFontSize(9);
    doc.text(`Período Semestral: ${activeSemName} | Generado por: ${user?.nombre_completo || "Responsable"}`, 15, 34);

    // Section 1: KPIs
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("1. Resumen Ejecutivo (KPIs)", 15, 55);

    const kpiHeaders = [["Métrica", "Valor Actual"]];
    const kpiRows = [
      ["Total Personal Activo", analyticsData.personalStats.total.toString()],
      ["Total Becarios", analyticsData.personalStats.becarios.toString()],
      ["Total Monotributistas", analyticsData.personalStats.monotributistas.toString()],
      ["Costo Mensual Consolidado", `$${analyticsData.financialStats.totalBudget.toLocaleString("es-AR")}`],
      ["Legajos Completados (%)", `${analyticsData.docStats.completionByArea?.[0]?.percentage || 0}%`],
    ];

    (doc as any).autoTable({
      head: kpiHeaders,
      body: kpiRows,
      startY: 60,
      theme: "striped",
      styles: { fontSize: 9.5 },
      headStyles: { fillColor: [10, 22, 40] },
    });

    // Section 2: Distribution Table
    const lastY = (doc as any).lastAutoTable.finalY + 12;
    doc.text("2. Distribución de Personal y Presupuesto por Área", 15, lastY);

    const areaHeaders = [["Área Operativa", "Becarios", "Monotributistas", "Personal Total", "Presupuesto Mensual"]];
    const areaRows = analyticsData.personalStats.byArea.map((a: any) => {
      const costData = analyticsData.financialStats.byArea.find((f: any) => f.name === a.name);
      return [
        a.name,
        a.becs,
        a.monos,
        a.total,
        `$${(costData?.total || 0).toLocaleString("es-AR")}`
      ];
    });

    (doc as any).autoTable({
      head: areaHeaders,
      body: areaRows,
      startY: lastY + 5,
      theme: "striped",
      styles: { fontSize: 8.5 },
      headStyles: { fillColor: [10, 22, 40] },
    });

    // Page 2: Documentation Audit
    doc.addPage();
    doc.setFillColor(10, 22, 40);
    doc.rect(0, 0, 210, 20, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("INFORME EJECUTIVO — AUDITORÍA DE LEGAJOS Y COBERTURA", 15, 12);

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(14);
    doc.text("3. Auditoría de Documentos de Legajo", 15, 30);

    const docHeaders = [["Documento Requerido", "Aprobados", "Pendientes", "Rechazados", "Faltantes"]];
    const docRows = (analyticsData.docStats.docTypesChecklist || []).map((d: any) => [
      DOCUMENT_LABELS_REPORT[d.name] || d.name,
      d.approved,
      d.pending,
      d.rejected,
      d.missing
    ]);

    (doc as any).autoTable({
      head: docHeaders,
      body: docRows,
      startY: 35,
      theme: "striped",
      styles: { fontSize: 8.5 },
      headStyles: { fillColor: [10, 22, 40] },
    });

    doc.save(`Informe_Ejecutivo_SFVCyD_${activeSemName}.pdf`);
  };

  const DOCUMENT_LABELS_REPORT: Record<string, string> = {
    copia_dni_bec: "Copia de DNI",
    constancia_cuil: "Constancia de CUIL",
    antecedentes_penales: "Certificado Antecedentes Penales",
    delitos_sexuales: "Certificado Delitos Sexuales",
    ddjj_prestacion: "Declaración Jurada",
    titulo_estudios: "Título de Estudios",
    constancia_arca: "Constancia ARCA",
    seguro_vida: "Seguro de Vida",
  };

  if (loading || !analyticsData) {
    return (
      <div className={styles.loadingState}>
        <Loader2 size={36} className={styles.spinner} />
        <span>Cargando análisis avanzado...</span>
      </div>
    );
  }

  const { personalStats, financialStats, docStats } = analyticsData;

  return (
    <div className={styles.container}>
      {/* Header Actions */}
      <div className={styles.headerActions}>
        <div className={styles.titleGroup}>
          <h2>Análisis y Reportes Avanzados</h2>
          <p>Consulta métricas organizacionales, evolución presupuestaria, cobertura de legajos y calendario de vencimientos.</p>
        </div>
        <button onClick={exportExecutivePDF} className={styles.primaryBtn}>
          <Download size={16} />
          <span>Exportar Informe Ejecutivo (PDF)</span>
        </button>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          onClick={() => setActiveTab("personal")}
          className={`${styles.tabBtn} ${activeTab === "personal" ? styles.activeTab : ""}`}
        >
          📊 Estructura de Personal
        </button>
        <button
          onClick={() => setActiveTab("financiero")}
          className={`${styles.tabBtn} ${activeTab === "financiero" ? styles.activeTab : ""}`}
        >
          💰 Evolución Financiera
        </button>
        <button
          onClick={() => setActiveTab("documentos")}
          className={`${styles.tabBtn} ${activeTab === "documentos" ? styles.activeTab : ""}`}
        >
          📄 Auditoría de Legajos
        </button>
        <button
          onClick={() => setActiveTab("calendar")}
          className={`${styles.tabBtn} ${activeTab === "calendar" ? styles.activeTab : ""}`}
        >
          🗓️ Calendario de Expiraciones
        </button>
      </div>

      {/* TAB 1: Estructura de Personal */}
      {activeTab === "personal" && (
        <div className={styles.container}>
          {/* Top Cards */}
          <div className={styles.metricsGrid}>
            <div className={`${styles.metricCard} glass-panel`}>
              <span className={styles.metricLabel}>Total Agentes Asignados</span>
              <span className={styles.metricValue}>{personalStats.total}</span>
            </div>
            <div className={`${styles.metricCard} glass-panel`}>
              <span className={styles.metricLabel}>Becarios Activos</span>
              <span className={styles.metricValue}>{personalStats.becarios}</span>
            </div>
            <div className={`${styles.metricCard} glass-panel`}>
              <span className={styles.metricLabel}>Monotributistas Activos</span>
              <span className={styles.metricValue}>{personalStats.monotributistas}</span>
            </div>
            <div className={`${styles.metricCard} glass-panel`}>
              <span className={styles.metricLabel}>Proporción Beca/Monotributo</span>
              <span className={styles.metricValue}>
                {personalStats.total > 0 
                  ? `${Math.round((personalStats.becarios / personalStats.total) * 100)}% / ${Math.round((personalStats.monotributistas / personalStats.total) * 100)}%`
                  : "0% / 0%"
                }
              </span>
            </div>
          </div>

          {/* Charts */}
          <div className={styles.chartsGrid}>
            <div className={`${styles.chartCard} glass-panel`}>
              <span className={styles.chartTitle}>Personal por Área Operativa</span>
              <div className={styles.chartWrapper}>
                {personalStats.byArea.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={personalStats.byArea}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                      <YAxis stroke="#64748b" fontSize={11} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#0f172a",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: "8px",
                          color: "#fff",
                        }}
                      />
                      <Legend />
                      <Bar dataKey="becs" name="Becarios" fill="#3b82f6" stackId="a" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="monos" name="Monotributistas" fill="#10b981" stackId="a" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <span className={styles.emptyChart}>No hay agentes cargados.</span>
                )}
              </div>
            </div>

            <div className={`${styles.chartCard} glass-panel`}>
              <span className={styles.chartTitle}>Distribución por Categorías / Escala</span>
              <div className={styles.chartWrapper}>
                {personalStats.byCategory.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={personalStats.byCategory} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis type="number" stroke="#64748b" fontSize={11} />
                      <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={10} width={130} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#0f172a",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: "8px",
                          color: "#fff",
                        }}
                      />
                      <Bar dataKey="value" name="Agentes" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <span className={styles.emptyChart}>No hay escalas de categorías asignadas.</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Evolución Financiera */}
      {activeTab === "financiero" && (
        <div className={styles.container}>
          {/* Top Cards */}
          <div className={styles.metricsGrid}>
            <div className={`${styles.metricCard} glass-panel`}>
              <span className={styles.metricLabel}>Presupuesto Consolidado Mensual</span>
              <span className={`${styles.metricValue} text-emerald`}>
                {financialStats.totalBudget.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className={`${styles.metricCard} glass-panel`}>
              <span className={styles.metricLabel}>Presupuesto Becarios</span>
              <span className={styles.metricValue}>
                {financialStats.becariosBudget.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className={`${styles.metricCard} glass-panel`}>
              <span className={styles.metricLabel}>Presupuesto Monotributistas</span>
              <span className={styles.metricValue}>
                {financialStats.monosBudget.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className={`${styles.metricCard} glass-panel`}>
              <span className={styles.metricLabel}>Monto Promedio por Agente</span>
              <span className={styles.metricValue}>
                {(personalStats.total > 0 ? financialStats.totalBudget / personalStats.total : 0).toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>

          {/* Charts */}
          <div className={styles.chartsGrid}>
            <div className={`${styles.chartCard} glass-panel`}>
              <span className={styles.chartTitle}>Costo Mensual por Área Operativa</span>
              <div className={styles.chartWrapper}>
                {financialStats.byArea.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={financialStats.byArea}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                      <YAxis stroke="#64748b" fontSize={11} tickFormatter={(v) => `$${(v / 1000).toLocaleString()}k`} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#0f172a",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: "8px",
                          color: "#fff",
                        }}
                      />
                      <Legend />
                      <Bar dataKey="becs" name="Becas" fill="#3b82f6" stackId="a" />
                      <Bar dataKey="monos" name="Monotributo" fill="#10b981" stackId="a" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <span className={styles.emptyChart}>No hay costos registrados.</span>
                )}
              </div>
            </div>

            <div className={`${styles.chartCard} glass-panel`}>
              <span className={styles.chartTitle}>Movimientos y Rotación de Altas / Bajas (Últimos 6 meses)</span>
              <div className={styles.chartWrapper}>
                {financialStats.evolution.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={financialStats.evolution}>
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
                      <Line type="monotone" dataKey="cambios" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="3 3" name="Modificaciones" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <span className={styles.emptyChart}>No hay historial de movimientos en el período.</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Auditoría de Legajos */}
      {activeTab === "documentos" && (
        <div className={styles.container}>
          {/* Top Cards */}
          <div className={styles.metricsGrid}>
            <div className={`${styles.metricCard} glass-panel`}>
              <span className={styles.metricLabel}>Cobertura General de Legajos</span>
              <span className={`${styles.metricValue} text-blue`}>
                {docStats.completionByArea?.[0]?.percentage || 0}%
              </span>
            </div>
            <div className={`${styles.metricCard} glass-panel`}>
              <span className={styles.metricLabel}>Legajos Completos</span>
              <span className={styles.metricValue}>
                {docStats.completionByArea?.reduce((sum: number, a: any) => sum + a.complete, 0) || 0}
              </span>
            </div>
            <div className={`${styles.metricCard} glass-panel`}>
              <span className={styles.metricLabel}>Legajos Incompletos</span>
              <span className={styles.metricValue}>
                {personalStats.total - (docStats.completionByArea?.reduce((sum: number, a: any) => sum + a.complete, 0) || 0)}
              </span>
            </div>
            <div className={`${styles.metricCard} glass-panel`}>
              <span className={styles.metricLabel}>Tasa de Incumplimiento</span>
              <span className={styles.metricValue}>
                {personalStats.total > 0 
                  ? `${Math.round(((personalStats.total - (docStats.completionByArea?.reduce((sum: number, a: any) => sum + a.complete, 0) || 0)) / personalStats.total) * 100)}%`
                  : "0%"
                }
              </span>
            </div>
          </div>

          {/* Charts */}
          <div className={styles.chartsGrid}>
            <div className={`${styles.chartCard} glass-panel`}>
              <span className={styles.chartTitle}>Porcentaje de Cobertura Documental por Área</span>
              <div className={styles.chartWrapper}>
                {docStats.completionByArea?.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={docStats.completionByArea}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                      <YAxis stroke="#64748b" fontSize={11} unit="%" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#0f172a",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: "8px",
                          color: "#fff",
                        }}
                      />
                      <Bar dataKey="percentage" name="Legajos Completos (%)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <span className={styles.emptyChart}>No hay datos documentales registrados.</span>
                )}
              </div>
            </div>

            <div className={`${styles.chartCard} glass-panel`}>
              <span className={styles.chartTitle}>Documentos Faltantes por Tipo</span>
              <div className={styles.chartWrapper}>
                {docStats.docTypesMissing?.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={docStats.docTypesMissing} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis type="number" stroke="#64748b" fontSize={11} />
                      <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={10} width={120} tickFormatter={(v) => DOCUMENT_LABELS_REPORT[v] || v} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#0f172a",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: "8px",
                          color: "#fff",
                        }}
                      />
                      <Bar dataKey="value" name="Agentes Faltantes" fill="#f43f5e" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <span className={styles.emptyChart}>✅ ¡Todos los legajos están al día!</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Calendario de Expiraciones */}
      {activeTab === "calendar" && (
        <div className={`${styles.calendarCard} glass-panel`}>
          {/* Header */}
          <div className={styles.calendarHeader}>
            <h3>{monthYearLabel}</h3>
            <div className={styles.calendarNav}>
              <button
                onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))}
                className={styles.navBtn}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setCurrentDate(new Date())}
                className={styles.navBtn}
                style={{ width: "auto", padding: "0 10px", fontSize: "11px", fontWeight: "600" }}
              >
                Hoy
              </button>
              <button
                onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))}
                className={styles.navBtn}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Grid */}
          <div className={styles.calendarGrid}>
            {/* Weekdays */}
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
              <div key={d} className={styles.weekdayHeader}>
                {d}
              </div>
            ))}

            {/* Days */}
            {calendarMonthData.map((dayData, idx) => {
              const isToday = dayData.isCurrentMonth && 
                dayData.day === new Date().getDate() && 
                currentDate.getMonth() === new Date().getMonth() &&
                currentDate.getFullYear() === new Date().getFullYear();

              return (
                <div
                  key={idx}
                  className={`${styles.calendarDay} ${dayData.isCurrentMonth ? "" : styles.otherMonth} ${isToday ? styles.todayDay : ""}`}
                >
                  <span className={styles.dayNumber}>{dayData.day}</span>
                  <div className={styles.eventList}>
                    {dayData.events.map((e) => {
                      const badgeClass = {
                        info: styles.eventInfo,
                        warning: styles.eventWarning,
                        danger: styles.eventDanger,
                        success: styles.eventSuccess,
                      }[e.severity] || styles.eventInfo;

                      return (
                        <div
                          key={e.id}
                          className={`${styles.eventBadge} ${badgeClass}`}
                          title={`${e.title} (${e.type})`}
                        >
                          {e.title}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
