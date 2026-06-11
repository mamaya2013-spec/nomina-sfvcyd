"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  AlertCircle,
  Calendar,
  Download,
  ChevronRight,
  Info,
  Lock,
  Building2,
  PieChartIcon,
  BarChart3,
  LineChart as LineIcon,
  Grid,
  Table,
  CheckCircle,
  Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
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
  Treemap,
} from "recharts";
import styles from "./dashboard.module.css";
import Link from "next/link";

export default function DashboardPage() {
  const supabase = createClient();
  const { selectedSemester, loading: semesterLoading } = useSemester();

  // Basic States
  const [loading, setLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<"general" | "cobertura">("general");

  // Filter States
  const [selectedSub, setSelectedSub] = useState<string>("");

  // DB Data States
  const [subsecretarias, setSubsecretarias] = useState<any[]>([]);
  const [areas, setAreas] = useState<any[]>([]);
  const [becarios, setBecarios] = useState<any[]>([]);
  const [monotributistas, setMonotributistas] = useState<any[]>([]);
  const [ocs, setOcs] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);

  // Alert States
  const [alerts, setAlerts] = useState<{
    pendingDocsCount: number;
    insuranceAlerts: any[];
    ocAlerts: any[];
  }>({
    pendingDocsCount: 0,
    insuranceAlerts: [],
    ocAlerts: [],
  });

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const fetchAlerts = async (semId: string) => {
    try {
      const res = await fetch(`/api/dashboard/alertas?semestre_id=${semId}`);
      if (res.ok) {
        const data = await res.json();
        setAlerts({
          pendingDocsCount: data.pendingDocsCount || 0,
          insuranceAlerts: data.insuranceAlerts || [],
          ocAlerts: data.ocAlerts || [],
        });
      }
    } catch (err) {
      console.error("Error fetching alerts:", err);
    }
  };

  const fetchData = async () => {
    if (!selectedSemester) return;
    setLoading(true);
    try {
      // 1. Fetch subsecretarías & areas for lookup
      const { data: subs } = await supabase
        .from("subsecretarias")
        .select("*")
        .eq("activa", true)
        .order("orden");
      const { data: ars } = await supabase
        .from("areas")
        .select("*")
        .eq("activa", true)
        .order("orden");

      setSubsecretarias(subs || []);
      setAreas(ars || []);

      // 2. Fetch movements (always from movements table for the year of the semester)
      const { data: movs } = await supabase
        .from("movimientos")
        .select("*")
        .eq("anio", selectedSemester.anio);
      setMovements(movs || []);

      // 3. Fetch semester data (live or snapshot)
      if (selectedSemester.bloqueado) {
        const { data: snapshot, error: snapErr } = await supabase
          .from("snapshots_semestre")
          .select("*")
          .eq("semestre_id", selectedSemester.id)
          .maybeSingle();

        if (snapErr) throw snapErr;

        if (snapshot) {
          setBecarios(snapshot.nomina_becarios_snapshot || []);
          setMonotributistas(snapshot.nomina_monos_snapshot || []);
          setOcs(snapshot.ordenes_compromiso_snapshot || []);
        } else {
          setBecarios([]);
          setMonotributistas([]);
          setOcs([]);
        }
      } else {
        // Query live active tables
        const { data: becs, error: becsErr } = await supabase
          .from("becarios")
          .select("*, subsecretarias(id, nombre), areas(id, nombre)")
          .eq("estado", "Activo");
        if (becsErr) throw becsErr;

        const { data: monos, error: monosErr } = await supabase
          .from("monotributistas")
          .select("*, subsecretarias(id, nombre), areas(id, nombre)")
          .eq("estado", "Activo");
        if (monosErr) throw monosErr;

        const { data: activeOcs, error: ocsErr } = await supabase
          .from("ordenes_compromiso")
          .select("*")
          .eq("semestre_id", selectedSemester.id);
        if (ocsErr) throw ocsErr;

        setBecarios(becs || []);
        setMonotributistas(monos || []);
        setOcs(activeOcs || []);
      }

      // 4. Fetch alerts
      await fetchAlerts(selectedSemester.id);
    } catch (err: any) {
      console.error("Error loading dashboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSemester) {
      fetchData();
    }
  }, [selectedSemester]);

  // Helpers
  const getSubsecretariaName = (subId: string) => {
    return subsecretarias.find((s) => s.id === subId)?.nombre || "-";
  };

  const getAreaName = (areaId: string) => {
    return areas.find((a) => a.id === areaId)?.nombre || "-";
  };

  const formatCurrency = (val: number) => {
    return val.toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };

  // 1. Filtering lists based on client dropdown selector
  const becariosFiltered = useMemo(() => {
    if (!selectedSub) return becarios;
    return becarios.filter((b) => b.subsecretaria_id === selectedSub);
  }, [becarios, selectedSub]);

  const monosFiltered = useMemo(() => {
    if (!selectedSub) return monotributistas;
    return monotributistas.filter((m) => m.subsecretaria_id === selectedSub);
  }, [monotributistas, selectedSub]);

  // Sets of filtered person IDs to filter LineChart movements
  const filteredPersonIds = useMemo(() => {
    const ids = new Set<string>();
    becariosFiltered.forEach((b) => ids.add(b.id));
    monosFiltered.forEach((m) => ids.add(m.id));
    return ids;
  }, [becariosFiltered, monosFiltered]);

  // 2. Aggregate KPI Metrics
  const metrics = useMemo(() => {
    const totalBecarios = becariosFiltered.length;
    const totalMonos = monosFiltered.length;
    const totalPersonal = totalBecarios + totalMonos;

    const monthlyBecasBase = becariosFiltered.reduce((sum, b) => sum + Number(b.importe_mensual_beca || 0), 0);
    const monthlyBecasActiva = becariosFiltered.reduce((sum, b) => sum + Number(b.importe_tarjeta_activa || 0), 0);
    const monthlyBecasTotal = becariosFiltered.reduce((sum, b) => sum + Number(b.importe_total || 0), 0);

    const monthlyMonosBase = monosFiltered.reduce((sum, m) => sum + Number(m.importe_mensual_monotributo || 0), 0);
    const monthlyMonosActiva = monosFiltered.reduce((sum, m) => sum + Number(m.importe_tarjeta_activa || 0), 0);
    const monthlyMonosTotal = monosFiltered.reduce((sum, m) => sum + Number(m.importe_total || 0), 0);

    const monthlyGrandTotal = monthlyBecasTotal + monthlyMonosTotal;
    const semestralGrandTotal = monthlyGrandTotal * 6;

    // Total OCs assigned & executed (Global)
    const ocTotalAssigned = ocs.reduce((sum, o) => sum + Number(o.monto_asignado || 0), 0);
    const ocTotalExecuted = ocs.reduce((sum, o) => sum + Number(o.monto_ejecutado || 0), 0);
    const ocTotalRemaining = ocTotalAssigned - ocTotalExecuted;
    const ocProgress = ocTotalAssigned > 0 ? (ocTotalExecuted / ocTotalAssigned) * 100 : 0;

    return {
      totalBecarios,
      totalMonos,
      totalPersonal,
      monthlyBecasBase,
      monthlyBecasActiva,
      monthlyBecasTotal,
      monthlyMonosBase,
      monthlyMonosActiva,
      monthlyMonosTotal,
      monthlyGrandTotal,
      semestralGrandTotal,
      ocTotalAssigned,
      ocTotalExecuted,
      ocTotalRemaining,
      ocProgress,
    };
  }, [becariosFiltered, monosFiltered, ocs]);

  // 3. Recharts: PieChart Data
  const pieData = useMemo(() => {
    const becasSemestral = metrics.monthlyBecasTotal * 6;
    const monosSemestral = metrics.monthlyMonosTotal * 6;

    if (becasSemestral === 0 && monosSemestral === 0) return [];

    return [
      { name: "Becas (Base + Activa)", value: becasSemestral, color: "var(--accent-blue)" },
      { name: "Monotributos (Base + Activa)", value: monosSemestral, color: "var(--accent-purple)" },
    ];
  }, [metrics]);

  // 4. Recharts: BarChart Data (Budget per Subsecretaría or per Area)
  const barData = useMemo(() => {
    if (!selectedSub) {
      // Group by Subsecretaría
      const groups: { [key: string]: number } = {};
      subsecretarias.forEach((s) => {
        groups[s.id] = 0;
      });

      becarios.forEach((b) => {
        if (groups[b.subsecretaria_id] !== undefined) {
          groups[b.subsecretaria_id] += Number(b.importe_total || 0) * 6;
        }
      });

      monotributistas.forEach((m) => {
        if (groups[m.subsecretaria_id] !== undefined) {
          groups[m.subsecretaria_id] += Number(m.importe_total || 0) * 6;
        }
      });

      return subsecretarias
        .map((s) => ({
          name: s.nombre,
          presupuesto: groups[s.id] || 0,
        }))
        .filter((item) => item.presupuesto > 0);
    } else {
      // Group by Areas under the selected Subsecretaría
      const subAreas = areas.filter((a) => a.subsecretaria_id === selectedSub);
      const groups: { [key: string]: number } = {};
      subAreas.forEach((a) => {
        groups[a.id] = 0;
      });

      becariosFiltered.forEach((b) => {
        if (groups[b.area_id] !== undefined) {
          groups[b.area_id] += Number(b.importe_total || 0) * 6;
        }
      });

      monosFiltered.forEach((m) => {
        if (groups[m.area_id] !== undefined) {
          groups[m.area_id] += Number(m.importe_total || 0) * 6;
        }
      });

      return subAreas
        .map((a) => ({
          name: a.nombre,
          presupuesto: groups[a.id] || 0,
        }))
        .filter((item) => item.presupuesto > 0);
    }
  }, [becarios, monotributistas, becariosFiltered, monosFiltered, subsecretarias, areas, selectedSub]);

  // 5. Recharts: LineChart Data (Altas vs Bajas Monthly Trend)
  const lineData = useMemo(() => {
    const monthly = Array.from({ length: 12 }, (_, i) => ({
      name: ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"][i],
      altas: 0,
      bajas: 0,
    }));

    movements.forEach((m) => {
      // If subfilter active, movement person must belong to filtered Set
      if (selectedSub && !filteredPersonIds.has(m.persona_id)) {
        return;
      }

      const monthIdx = m.mes - 1;
      if (monthIdx >= 0 && monthIdx < 12) {
        if (m.tipo_movimiento === "alta") {
          monthly[monthIdx].altas += 1;
        } else if (m.tipo_movimiento === "baja") {
          monthly[monthIdx].bajas += 1;
        }
      }
    });

    return monthly;
  }, [movements, selectedSub, filteredPersonIds]);

  // 6. Recharts: Treemap Data
  const treemapData = useMemo(() => {
    const dataMap: { [key: string]: number } = {};
    becariosFiltered.forEach((b) => {
      const areaName = getAreaName(b.area_id);
      dataMap[areaName] = (dataMap[areaName] || 0) + Number(b.importe_total || 0) * 6;
    });
    monosFiltered.forEach((m) => {
      const areaName = getAreaName(m.area_id);
      dataMap[areaName] = (dataMap[areaName] || 0) + Number(m.importe_total || 0) * 6;
    });

    return Object.entries(dataMap)
      .map(([name, size]) => ({ name, size }))
      .filter((item) => item.size > 0)
      .sort((a, b) => b.size - a.size);
  }, [becariosFiltered, monosFiltered, areas]);

  // 7. Heatmap Grid Data
  const heatmapData = useMemo(() => {
    const dataMap: { [key: string]: { name: string; budget: number; personal: number; subId: string } } = {};

    areas.forEach((a) => {
      if (!selectedSub || a.subsecretaria_id === selectedSub) {
        dataMap[a.id] = {
          name: a.nombre,
          budget: 0,
          personal: 0,
          subId: a.subsecretaria_id,
        };
      }
    });

    becariosFiltered.forEach((b) => {
      if (dataMap[b.area_id]) {
        dataMap[b.area_id].budget += Number(b.importe_total || 0) * 6;
        dataMap[b.area_id].personal += 1;
      }
    });

    monosFiltered.forEach((m) => {
      if (dataMap[m.area_id]) {
        dataMap[m.area_id].budget += Number(m.importe_total || 0) * 6;
        dataMap[m.area_id].personal += 1;
      }
    });

    return Object.values(dataMap)
      .filter((item) => item.personal > 0 || item.budget > 0)
      .sort((a, b) => b.budget - a.budget);
  }, [becariosFiltered, monosFiltered, areas, selectedSub]);

  const maxBudget = useMemo(() => {
    if (heatmapData.length === 0) return 0;
    return Math.max(...heatmapData.map((d) => d.budget));
  }, [heatmapData]);

  // 8. Detailed Coverage Table Data
  const tableData = useMemo(() => {
    const dataMap: {
      [key: string]: {
        name: string;
        subName: string;
        becarios: number;
        monos: number;
        personal: number;
        budget: number;
      };
    } = {};

    areas.forEach((a) => {
      if (!selectedSub || a.subsecretaria_id === selectedSub) {
        dataMap[a.id] = {
          name: a.nombre,
          subName: getSubsecretariaName(a.subsecretaria_id),
          becarios: 0,
          monos: 0,
          personal: 0,
          budget: 0,
        };
      }
    });

    becariosFiltered.forEach((b) => {
      if (dataMap[b.area_id]) {
        dataMap[b.area_id].becarios += 1;
        dataMap[b.area_id].personal += 1;
        dataMap[b.area_id].budget += Number(b.importe_total || 0) * 6;
      }
    });

    monosFiltered.forEach((m) => {
      if (dataMap[m.area_id]) {
        dataMap[m.area_id].monos += 1;
        dataMap[m.area_id].personal += 1;
        dataMap[m.area_id].budget += Number(m.importe_total || 0) * 6;
      }
    });

    const list = Object.values(dataMap)
      .filter((item) => item.personal > 0)
      .sort((a, b) => b.budget - a.budget);

    const totalVisibleBudget = list.reduce((sum, item) => sum + item.budget, 0);

    return {
      list,
      totalVisibleBudget,
    };
  }, [becariosFiltered, monosFiltered, areas, selectedSub, subsecretarias]);

  // Custom Chart Tooltips
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className={styles.customTooltip}>
          <p className={styles.tooltipLabel}>{label}</p>
          {payload.map((pld: any) => (
            <p
              key={pld.name}
              style={{ color: pld.fill || pld.color || "var(--text-primary)" }}
              className={styles.tooltipValue}
            >
              {pld.name === "presupuesto" ? "Presupuesto" : pld.name === "value" ? "Total" : pld.name}:{" "}
              {formatCurrency(pld.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const CustomTreemapTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className={styles.customTooltip}>
          <p className={styles.tooltipLabel}>{data.name}</p>
          <p className={styles.tooltipValue}>
            Presupuesto: {formatCurrency(data.value || data.size)}
          </p>
        </div>
      );
    }
    return null;
  };

  // Convert SVG chart to PNG and trigger download
  const downloadChart = (containerId: string, filename: string) => {
    const container = document.getElementById(containerId);
    if (!container) return;

    const svgElement = container.querySelector("svg");
    if (!svgElement) return;

    try {
      const svgString = new XMLSerializer().serializeToString(svgElement);
      const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const URL = window.URL || window.webkitURL || window;
      const blobURL = URL.createObjectURL(svgBlob);

      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = svgElement.clientWidth || 500;
        canvas.height = svgElement.clientHeight || 300;
        const context = canvas.getContext("2d");

        if (context) {
          // Fill background with dark theme color
          context.fillStyle = "#111d33"; // --bg-secondary
          context.fillRect(0, 0, canvas.width, canvas.height);

          // Draw the SVG image
          context.drawImage(image, 0, 0);

          // Export as PNG
          const png = canvas.toDataURL("image/png");
          const downloadLink = document.createElement("a");
          downloadLink.href = png;
          downloadLink.download = filename;
          document.body.appendChild(downloadLink);
          downloadLink.click();
          document.body.removeChild(downloadLink);
        }
        URL.revokeObjectURL(blobURL);
      };
      image.src = blobURL;
    } catch (err) {
      console.error("Error exporting chart:", err);
    }
  };

  if (!selectedSemester) {
    return (
      <div className={styles.noData}>
        <Info size={48} className="text-secondary" />
        <h3>Sin Semestre Seleccionado</h3>
        <p>Por favor seleccione o cree un semestre para visualizar el dashboard.</p>
      </div>
    );
  }

  if (loading || semesterLoading) {
    return (
      <div className={styles.loadingSpinner}>
        <Loader2 className={styles.spin} size={48} />
        <p>Cargando información gerencial...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* 1. Header Toolbar */}
      <div className={`${styles.header} glass-panel`}>
        <div className={styles.headerTitleGroup}>
          <h1>Dashboard Gerencial</h1>
          <p className="text-secondary">
            Panel de control ejecutivo de asignaciones y cobertura institucional.
          </p>
        </div>

        <div className={styles.headerActions}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span className={styles.filterLabel}>Filtrar Subsecretaría:</span>
            <select
              className={styles.subselect}
              value={selectedSub}
              onChange={(e) => setSelectedSub(e.target.value)}
            >
              <option value="">Todas las Subsecretarías</option>
              {subsecretarias.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 2. Banner de consulta histórica si está bloqueado */}
      {selectedSemester.bloqueado && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "14px 20px",
            background: "rgba(244, 63, 94, 0.08)",
            border: "1px solid rgba(244, 63, 94, 0.2)",
            borderRadius: "var(--border-radius-md)",
            color: "var(--accent-rose)",
            fontSize: "13.5px",
            fontWeight: "500",
          }}
        >
          <Lock size={16} style={{ flexShrink: 0 }} />
          <span>
            Modo Historial Activo: Visualizando instantánea congelada del Semestre {selectedSemester.nombre_display}.
          </span>
        </div>
      )}

      {/* 3. Alertas Inteligentes (Top Header Alert Hub) */}
      {(alerts.pendingDocsCount > 0 || alerts.insuranceAlerts.length > 0 || alerts.ocAlerts.length > 0) && (
        <div className={styles.alertsSection}>
          {alerts.ocAlerts.map((oc: any) => (
            <div key={oc.id} className={`${styles.alertCard} ${styles[`alertCard_${oc.severity}`]}`}>
              <AlertCircle className={styles.alertIcon} size={20} />
              <div className={styles.alertContent}>
                <p className={styles.alertMessage}>{oc.message}</p>
                <p className={styles.alertSubtext}>Módulo de Órdenes de Compromiso</p>
              </div>
              <Link href="/dashboard/ordenes" className={styles.alertActionBtn}>
                Ver OC
              </Link>
            </div>
          ))}

          {alerts.insuranceAlerts.slice(0, 3).map((ins: any) => (
            <div key={ins.id} className={`${styles.alertCard} ${styles[`alertCard_${ins.severity}`]}`}>
              <AlertTriangle className={styles.alertIcon} size={20} />
              <div className={styles.alertContent}>
                <p className={styles.alertMessage}>{ins.message}</p>
                <p className={styles.alertSubtext}>Vencimiento de Seguro — Monotributistas</p>
              </div>
              <Link href="/dashboard/documentos" className={styles.alertActionBtn}>
                Ver Seguros
              </Link>
            </div>
          ))}

          {alerts.pendingDocsCount > 0 && (
            <div className={`${styles.alertCard} ${styles.alertCard_warning}`}>
              <Info className={styles.alertIcon} size={20} />
              <div className={styles.alertContent}>
                <p className={styles.alertMessage}>
                  Existen {alerts.pendingDocsCount} documentos pendientes de revisión en la bandeja de entrada.
                </p>
                <p className={styles.alertSubtext}>Control de Documentos Obligatorios</p>
              </div>
              <Link href="/dashboard/documentos" className={styles.alertActionBtn}>
                Revisar Bandeja
              </Link>
            </div>
          )}
        </div>
      )}

      {/* 4. KPI Summary Widgets */}
      <div className={styles.kpiGrid}>
        <div className={`${styles.kpiCard} glass-panel ${styles.kpiCard_blue}`}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiTitle}>Becarios Activos</span>
            <Users className={styles.kpiIcon} size={16} />
          </div>
          <p className={styles.kpiValue}>{metrics.totalBecarios}</p>
          <div className={styles.kpiSubtext}>
            <span>Beca Base + Tarjeta Activa (10%)</span>
          </div>
        </div>

        <div className={`${styles.kpiCard} glass-panel ${styles.kpiCard_purple}`}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiTitle}>Monotributistas</span>
            <Briefcase className={styles.kpiIcon} size={16} />
          </div>
          <p className={styles.kpiValue}>{metrics.totalMonos}</p>
          <div className={styles.kpiSubtext}>
            <span>Niveles de Categoría vigentes</span>
          </div>
        </div>

        <div className={`${styles.kpiCard} glass-panel ${styles.kpiCard_emerald}`}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiTitle}>Gasto Mensual Total</span>
            <TrendingUp className={styles.kpiIcon} size={16} />
          </div>
          <p className={styles.kpiValue}>{formatCurrency(metrics.monthlyGrandTotal)}</p>
          <div className={styles.kpiSubtext}>
            <span>Base: {formatCurrency(metrics.monthlyBecasBase + metrics.monthlyMonosBase)}</span>
          </div>
        </div>

        <div className={`${styles.kpiCard} glass-panel ${styles.kpiCard_cyan}`}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiTitle}>Proyección Semestre</span>
            <Building2 className={styles.kpiIcon} size={16} />
          </div>
          <p className={styles.kpiValue}>{formatCurrency(metrics.semestralGrandTotal)}</p>
          <div className={styles.kpiSubtext}>
            <span>Proyección para 6 meses de nómina</span>
          </div>
        </div>

        {!selectedSub && (
          <div className={`${styles.kpiCard} glass-panel ${styles.kpiCard_amber}`}>
            <div className={styles.kpiHeader}>
              <span className={styles.kpiTitle}>Ejecución OC Global</span>
              <TrendingDown className={styles.kpiIcon} size={16} />
            </div>
            <p className={styles.kpiValue}>{metrics.ocProgress.toFixed(1)}%</p>
            <div className={styles.kpiSubtext}>
              <span>Ejecutado: {formatCurrency(metrics.ocTotalExecuted)}</span>
            </div>
          </div>
        )}
      </div>

      {/* 5. Navigation Tabs */}
      <div className={styles.tabContainer}>
        <button
          onClick={() => setActiveTab("general")}
          className={`${styles.tabBtn} ${activeTab === "general" ? styles.activeTab : ""}`}
        >
          <PieChartIcon size={16} />
          <span>Analíticas Generales</span>
        </button>
        <button
          onClick={() => setActiveTab("cobertura")}
          className={`${styles.tabBtn} ${activeTab === "cobertura" ? styles.activeTab : ""}`}
        >
          <Grid size={16} />
          <span>Asignación y Cobertura por Área</span>
        </button>
      </div>

      {/* 6. Tabs Content */}
      {activeTab === "general" && (
        <div className={styles.chartsGrid}>
          {/* Chart 1: Partidas PieChart */}
          <div className={`${styles.chartCard} glass-panel`}>
            <div className={styles.chartHeader}>
              <h3>Distribución de Partidas (Presupuesto Proyectado)</h3>
              <button
                className={styles.downloadBtn}
                onClick={() => downloadChart("pie-chart-container", "distribucion_partidas.png")}
              >
                <Download size={12} />
                <span>PNG</span>
              </button>
            </div>
            <div id="pie-chart-container" className={styles.chartWrapper}>
              {isMounted && pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="48%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      iconType="circle"
                      iconSize={10}
                      wrapperStyle={{ fontSize: "12.5px" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className={styles.loadingSpinner}>Sin datos de nómina</div>
              )}
            </div>
          </div>

          {/* Chart 2: Budget Breakdown BarChart */}
          <div className={`${styles.chartCard} glass-panel`}>
            <div className={styles.chartHeader}>
              <h3>
                {selectedSub
                  ? "Asignación Presupuestaria por Área"
                  : "Presupuesto Asignado por Subsecretaría"}
              </h3>
              <button
                className={styles.downloadBtn}
                onClick={() => downloadChart("bar-chart-container", "gasto_subsecretarias.png")}
              >
                <Download size={12} />
                <span>PNG</span>
              </button>
            </div>
            <div id="bar-chart-container" className={styles.chartWrapper}>
              {isMounted && barData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis
                      dataKey="name"
                      stroke="var(--text-secondary)"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="var(--text-secondary)"
                      fontSize={10}
                      tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="presupuesto" fill="var(--accent-blue)" radius={[4, 4, 0, 0]}>
                      {barData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={selectedSub ? "var(--accent-cyan)" : "var(--accent-blue)"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className={styles.loadingSpinner}>Sin registros presupuestarios</div>
              )}
            </div>
          </div>

          {/* Chart 3: LineChart Altas vs Bajas */}
          <div className={`${styles.chartCard} ${styles.chartCardLarge} glass-panel`}>
            <div className={styles.chartHeader}>
              <h3>Curva Temporal de Movimientos (Altas vs Bajas - {selectedSemester.anio})</h3>
              <button
                className={styles.downloadBtn}
                onClick={() => downloadChart("line-chart-container", "curva_altas_bajas.png")}
              >
                <Download size={12} />
                <span>PNG</span>
              </button>
            </div>
            <div id="line-chart-container" className={styles.chartWrapper}>
              {isMounted ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={lineData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" stroke="var(--text-secondary)" fontSize={11} tickLine={false} />
                    <YAxis stroke="var(--text-secondary)" fontSize={11} allowDecimals={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        background: "rgba(15,23,42,0.95)",
                        border: "1px solid var(--glass-border)",
                        borderRadius: "8px",
                      }}
                    />
                    <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: "12.5px" }} />
                    <Line
                      type="monotone"
                      dataKey="altas"
                      name="Altas"
                      stroke="var(--accent-emerald)"
                      strokeWidth={3}
                      activeDot={{ r: 6 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="bajas"
                      name="Bajas"
                      stroke="var(--accent-rose)"
                      strokeWidth={3}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className={styles.loadingSpinner}>Cargando historial de movimientos...</div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "cobertura" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* TreeMap allocation */}
          <div className="glass-panel styles.treemapSection">
            <div className={styles.treemapSection}>
              <div className={styles.chartHeader}>
                <h3>Treemap de Distribución Presupuestaria por Área</h3>
                <button
                  className={styles.downloadBtn}
                  onClick={() => downloadChart("treemap-container", "treemap_areas.png")}
                >
                  <Download size={12} />
                  <span>PNG</span>
                </button>
              </div>
              <div id="treemap-container" className={styles.chartWrapper} style={{ height: "360px" }}>
                {isMounted && treemapData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <Treemap
                      data={treemapData}
                      dataKey="size"
                      stroke="var(--bg-secondary)"
                      fill="var(--accent-blue)"
                    >
                      <Tooltip content={<CustomTreemapTooltip />} />
                    </Treemap>
                  </ResponsiveContainer>
                ) : (
                  <div className={styles.loadingSpinner}>Sin datos de áreas</div>
                )}
              </div>
            </div>
          </div>

          {/* Heatmap Grid */}
          <div className={`${styles.heatmapCard} glass-panel`}>
            <div className={styles.heatmapHeader}>
              <div>
                <h3>Mapa Térmico de Densidad de Gasto</h3>
                <p className="text-secondary" style={{ fontSize: "13px", marginTop: "4px" }}>
                  Intensidad del presupuesto asignado semestralmente por área municipal.
                </p>
              </div>

              <div className={styles.legend}>
                <span>Gasto Relativo:</span>
                <div className={styles.legendScale}>
                  <div className={styles.legendBox} style={{ background: "rgba(30, 41, 59, 0.4)", border: "1px solid rgba(255,255,255,0.04)" }} title="Sin Gasto" />
                  <div className={styles.legendBox} style={{ background: "rgba(59, 130, 246, 0.15)" }} title="Bajo" />
                  <div className={styles.legendBox} style={{ background: "rgba(59, 130, 246, 0.3)" }} title="Medio-Bajo" />
                  <div className={styles.legendBox} style={{ background: "rgba(59, 130, 246, 0.5)" }} title="Medio-Alto" />
                  <div className={styles.legendBox} style={{ background: "rgba(59, 130, 246, 0.75)" }} title="Máximo Gasto" />
                </div>
              </div>
            </div>

            <div className={styles.heatmapGrid}>
              {heatmapData.length === 0 ? (
                <div className="text-secondary" style={{ padding: "20px", gridColumn: "span 12" }}>
                  No se registran gastos de personal para las áreas.
                </div>
              ) : (
                heatmapData.map((item) => {
                  const ratio = maxBudget > 0 ? item.budget / maxBudget : 0;
                  let intensityClass = styles.intensity_0;
                  if (ratio >= 0.8) intensityClass = styles.intensity_4;
                  else if (ratio >= 0.5) intensityClass = styles.intensity_3;
                  else if (ratio >= 0.25) intensityClass = styles.intensity_2;
                  else if (ratio > 0) intensityClass = styles.intensity_1;

                  return (
                    <div key={item.name} className={`${styles.heatmapCell} ${intensityClass}`}>
                      <span className={styles.cellTitle} title={item.name}>
                        {item.name}
                      </span>
                      <div className={styles.cellMeta}>
                        <span className={styles.cellValue}>{formatCurrency(item.budget)}</span>
                        <span className={styles.cellCount}>{item.personal} pers.</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Detailed Coverage Table */}
          <div className={`${styles.tableSection} glass-panel`}>
            <h3>Tabla de Cobertura y Participación Presupuestaria</h3>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Área</th>
                    <th>Subsecretaría</th>
                    <th style={{ textAlign: "center" }}>Becarios</th>
                    <th style={{ textAlign: "center" }}>Monotributistas</th>
                    <th style={{ textAlign: "center" }}>Personal Total</th>
                    <th style={{ textAlign: "right" }}>Gasto Semestral</th>
                    <th style={{ paddingLeft: "30px" }}>Participación Presupuesto</th>
                  </tr>
                </thead>
                <tbody>
                  {tableData.list.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", padding: "40px" }}>
                        <span className="text-secondary">No se registran datos para mostrar en la tabla.</span>
                      </td>
                    </tr>
                  ) : (
                    tableData.list.map((item) => {
                      const pct =
                        tableData.totalVisibleBudget > 0
                          ? (item.budget / tableData.totalVisibleBudget) * 100
                          : 0;

                      return (
                        <tr key={item.name}>
                          <td className="font-semibold">{item.name}</td>
                          <td className="text-secondary">{item.subName}</td>
                          <td style={{ textAlign: "center" }} className="mono">
                            {item.becarios}
                          </td>
                          <td style={{ textAlign: "center" }} className="mono">
                            {item.monos}
                          </td>
                          <td style={{ textAlign: "center" }} className="mono font-semibold">
                            {item.personal}
                          </td>
                          <td style={{ textAlign: "right" }} className="mono font-bold text-emerald">
                            {formatCurrency(item.budget)}
                          </td>
                          <td>
                            <div className={styles.participationContainer}>
                              <span className={styles.participationText}>{pct.toFixed(1)}%</span>
                              <div className={styles.participationBarBg}>
                                <div
                                  className={styles.participationBar}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
