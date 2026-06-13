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
  const { semesters, selectedSemester, loading: semesterLoading } = useSemester();

  // Basic States
  const [loading, setLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<"general" | "cobertura">("general");

  // Temporal Filter States
  const [periodType, setPeriodType] = useState<"semestre" | "mes" | "anio">("semestre");
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedSemesterNum, setSelectedSemesterNum] = useState<number>(1);
  const [selectedMonth, setSelectedMonth] = useState<number>(1);

  // Structure Filter States
  const [selectedSub, setSelectedSub] = useState<string>("");
  const [selectedArea, setSelectedArea] = useState<string>("");
  const [selectedResp, setSelectedResp] = useState<string>("");

  // DB Data States
  const [subsecretarias, setSubsecretarias] = useState<any[]>([]);
  const [areas, setAreas] = useState<any[]>([]);
  const [responsables, setResponsables] = useState<any[]>([]);
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

  const fetchData = async (targetSems: any[]) => {
    if (targetSems.length === 0) return;
    setLoading(true);
    try {
      // 1. Fetch subsecretarías, areas & responsables for lookup
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
      const { data: resps } = await supabase
        .from("responsables")
        .select("*")
        .eq("activo", true)
        .order("nombre_completo");

      setSubsecretarias(subs || []);
      setAreas(ars || []);
      setResponsables(resps || []);

      // 2. Fetch movements (always from movements table for the year of the semester)
      const year = targetSems[0].anio;
      const { data: movs } = await supabase
        .from("movimientos")
        .select("*")
        .eq("anio", year);
      setMovements(movs || []);

      let allBecs: any[] = [];
      let allMonos: any[] = [];
      let allOcs: any[] = [];

      const blockedSems = targetSems.filter((s) => s.bloqueado);
      const activeSems = targetSems.filter((s) => !s.bloqueado);

      // 3. Query active tables if any target semester is active
      if (activeSems.length > 0) {
        const activeSemIds = activeSems.map((s) => s.id);
        const { data: activeOcs } = await supabase
          .from("ordenes_compromiso")
          .select("*")
          .in("semestre_id", activeSemIds);
        if (activeOcs) allOcs.push(...activeOcs);

        const { data: becs } = await supabase
          .from("becarios")
          .select("*, subsecretarias(id, nombre), areas(id, nombre)")
          .eq("estado", "Activo");
        const { data: monos } = await supabase
          .from("monotributistas")
          .select("*, subsecretarias(id, nombre), areas(id, nombre)")
          .eq("estado", "Activo");

        if (becs) allBecs.push(...becs);
        if (monos) allMonos.push(...monos);
      }

      // 4. Query snapshots for blocked target semesters
      if (blockedSems.length > 0) {
        const blockedSemIds = blockedSems.map((s) => s.id);
        const { data: snapshots } = await supabase
          .from("snapshots_semestre")
          .select("*")
          .in("semestre_id", blockedSemIds);

        snapshots?.forEach((snap) => {
          if (snap.nomina_becarios_snapshot) allBecs.push(...snap.nomina_becarios_snapshot);
          if (snap.nomina_monos_snapshot) allMonos.push(...snap.nomina_monos_snapshot);
          if (snap.ordenes_compromiso_snapshot) allOcs.push(...snap.ordenes_compromiso_snapshot);
        });
      }

      // Remove duplicate agents by ID (keeping the latest instance)
      const uniqueBecsMap = new Map<string, any>();
      allBecs.forEach((b) => uniqueBecsMap.set(b.id, b));
      const uniqueMonosMap = new Map<string, any>();
      allMonos.forEach((m) => uniqueMonosMap.set(m.id, m));

      setBecarios(Array.from(uniqueBecsMap.values()));
      setMonotributistas(Array.from(uniqueMonosMap.values()));
      setOcs(allOcs);

      // Fetch alerts using the first semester's ID as reference
      await fetchAlerts(targetSems[0].id);
    } catch (err: any) {
      console.error("Error loading dashboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  // Sync state values when global semester changes
  useEffect(() => {
    if (selectedSemester) {
      setSelectedYear(selectedSemester.anio);
      setSelectedSemesterNum(selectedSemester.numero_semestre);
      setSelectedMonth(selectedSemester.numero_semestre === 1 ? 1 : 7);
    }
  }, [selectedSemester]);

  // Target semester resolver
  const targetSemesterNum = useMemo(() => {
    if (periodType === "mes") {
      return selectedMonth <= 6 ? 1 : 2;
    }
    if (periodType === "semestre") {
      return selectedSemesterNum;
    }
    return 2; // Default for year
  }, [periodType, selectedMonth, selectedSemesterNum]);

  const targetSemester = useMemo(() => {
    if (!selectedYear) return null;
    let found = semesters.find(
      (s) => s.anio === selectedYear && s.numero_semestre === targetSemesterNum
    );
    if (!found) {
      found = semesters.find((s) => s.anio === selectedYear);
    }
    return found || null;
  }, [semesters, selectedYear, targetSemesterNum]);

  const targetSemesters = useMemo(() => {
    if (periodType === "anio") {
      return semesters.filter((s) => s.anio === selectedYear);
    }
    return targetSemester ? [targetSemester] : [];
  }, [periodType, targetSemester, semesters, selectedYear]);

  // Trigger data fetch when target semesters list changes
  useEffect(() => {
    if (targetSemesters && targetSemesters.length > 0) {
      fetchData(targetSemesters);
    }
  }, [targetSemesters]);

  const filteredAreasOptions = useMemo(() => {
    if (!selectedSub) return [];
    return areas.filter((a) => a.subsecretaria_id === selectedSub);
  }, [areas, selectedSub]);

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

  // Calculate the start and end dates of the selected period for filtering in-memory
  const startAndEndDates = useMemo(() => {
    const year = selectedYear;
    if (periodType === "mes") {
      const daysInMonth = new Date(year, selectedMonth, 0).getDate();
      return {
        start: new Date(year, selectedMonth - 1, 1),
        end: new Date(year, selectedMonth - 1, daysInMonth, 23, 59, 59),
      };
    }
    if (periodType === "semestre") {
      if (selectedSemesterNum === 1) {
        return {
          start: new Date(year, 0, 1),
          end: new Date(year, 5, 30, 23, 59, 59),
        };
      } else {
        return {
          start: new Date(year, 6, 1),
          end: new Date(year, 11, 31, 23, 59, 59),
        };
      }
    }
    // Default for "anio":
    return {
      start: new Date(year, 0, 1),
      end: new Date(year, 11, 31, 23, 59, 59),
    };
  }, [periodType, selectedYear, selectedSemesterNum, selectedMonth]);

  // 1. Filter by Period (active agents during that time window)
  const becariosFilteredByPeriod = useMemo(() => {
    return becarios.filter((b) => {
      const alta = new Date(b.fecha_alta + "T00:00:00");
      if (alta > startAndEndDates.end) return false;
      if (b.estado === "Baja" && b.fecha_baja) {
        const baja = new Date(b.fecha_baja + "T00:00:00");
        if (baja < startAndEndDates.start) return false;
      }
      return true;
    });
  }, [becarios, startAndEndDates]);

  const monotributistasFilteredByPeriod = useMemo(() => {
    return monotributistas.filter((m) => {
      const alta = new Date(m.fecha_alta + "T00:00:00");
      if (alta > startAndEndDates.end) return false;
      if (m.estado === "Baja" && m.fecha_baja) {
        const baja = new Date(m.fecha_baja + "T00:00:00");
        if (baja < startAndEndDates.start) return false;
      }
      return true;
    });
  }, [monotributistas, startAndEndDates]);

  // 2. Filter by Structure (Subsecretaría, Área, Responsable)
  const becariosFiltered = useMemo(() => {
    return becariosFilteredByPeriod.filter((b) => {
      if (selectedSub && b.subsecretaria_id !== selectedSub) return false;
      if (selectedArea && b.area_id !== selectedArea) return false;
      if (selectedResp && b.responsable_id !== selectedResp) return false;
      return true;
    });
  }, [becariosFilteredByPeriod, selectedSub, selectedArea, selectedResp]);

  const monosFiltered = useMemo(() => {
    return monotributistasFilteredByPeriod.filter((m) => {
      if (selectedSub && m.subsecretaria_id !== selectedSub) return false;
      if (selectedArea && m.area_id !== selectedArea) return false;
      if (selectedResp && m.responsable_id !== selectedResp) return false;
      return true;
    });
  }, [monotributistasFilteredByPeriod, selectedSub, selectedArea, selectedResp]);

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

    // Detailed OC vs Projected Breakdown
    const getOcDetails = (tipo: string) => {
      const oc = ocs.find((o) => o.tipo === tipo);
      const assigned = Number(oc?.monto_asignado || 0);
      const executed = Number(oc?.monto_ejecutado || 0);
      return {
        assigned,
        executed,
        remaining: assigned - executed,
      };
    };

    const becasBaseOc = getOcDetails("becas");
    const becasActivaOc = getOcDetails("activa_becas");
    const monosBaseOc = getOcDetails("monotributos");
    const monosActivaOc = getOcDetails("activa_monotributos");

    const projBecasBaseSemestral = monthlyBecasBase * 6;
    const projBecasActivaSemestral = monthlyBecasActiva * 6;
    const projMonosBaseSemestral = monthlyMonosBase * 6;
    const projMonosActivaSemestral = monthlyMonosActiva * 6;

    const ocBreakdown = [
      {
        name: "Becarios (Base)",
        type: "becas",
        ocAssigned: becasBaseOc.assigned,
        ocExecuted: becasBaseOc.executed,
        ocRemaining: becasBaseOc.remaining,
        projMonthly: monthlyBecasBase,
        projSemestral: projBecasBaseSemestral,
        dispProj: becasBaseOc.assigned - projBecasBaseSemestral,
      },
      {
        name: "Becarios (Tarjeta Activa)",
        type: "activa_becas",
        ocAssigned: becasActivaOc.assigned,
        ocExecuted: becasActivaOc.executed,
        ocRemaining: becasActivaOc.remaining,
        projMonthly: monthlyBecasActiva,
        projSemestral: projBecasActivaSemestral,
        dispProj: becasActivaOc.assigned - projBecasActivaSemestral,
      },
      {
        name: "Monotributistas (Base)",
        type: "monotributos",
        ocAssigned: monosBaseOc.assigned,
        ocExecuted: monosBaseOc.executed,
        ocRemaining: monosBaseOc.remaining,
        projMonthly: monthlyMonosBase,
        projSemestral: projMonosBaseSemestral,
        dispProj: monosBaseOc.assigned - projMonosBaseSemestral,
      },
      {
        name: "Monotributistas (Tarjeta Activa)",
        type: "activa_monotributos",
        ocAssigned: monosActivaOc.assigned,
        ocExecuted: monosActivaOc.executed,
        ocRemaining: monosActivaOc.remaining,
        projMonthly: monthlyMonosActiva,
        projSemestral: projMonosActivaSemestral,
        dispProj: monosActivaOc.assigned - projMonosActivaSemestral,
      },
    ];

    const totalOcAssigned = ocBreakdown.reduce((sum, item) => sum + item.ocAssigned, 0);
    const totalOcExecuted = ocBreakdown.reduce((sum, item) => sum + item.ocExecuted, 0);
    const totalOcRemaining = ocBreakdown.reduce((sum, item) => sum + item.ocRemaining, 0);
    const totalProjMonthly = ocBreakdown.reduce((sum, item) => sum + item.projMonthly, 0);
    const totalProjSemestral = ocBreakdown.reduce((sum, item) => sum + item.projSemestral, 0);
    const totalDispProj = ocBreakdown.reduce((sum, item) => sum + item.dispProj, 0);

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
      ocBreakdown,
      totals: {
        ocAssigned: totalOcAssigned,
        ocExecuted: totalOcExecuted,
        ocRemaining: totalOcRemaining,
        projMonthly: totalProjMonthly,
        projSemestral: totalProjSemestral,
        dispProj: totalDispProj,
      }
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
        budgetBase: number;
        budgetActiva: number;
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
          budgetBase: 0,
          budgetActiva: 0,
        };
      }
    });

    becariosFiltered.forEach((b) => {
      if (dataMap[b.area_id]) {
        dataMap[b.area_id].becarios += 1;
        dataMap[b.area_id].personal += 1;
        dataMap[b.area_id].budgetBase += Number(b.importe_mensual_beca || 0) * 6;
        dataMap[b.area_id].budgetActiva += Number(b.importe_tarjeta_activa || 0) * 6;
        dataMap[b.area_id].budget += Number(b.importe_total || 0) * 6;
      }
    });

    monosFiltered.forEach((m) => {
      if (dataMap[m.area_id]) {
        dataMap[m.area_id].monos += 1;
        dataMap[m.area_id].personal += 1;
        dataMap[m.area_id].budgetBase += Number(m.importe_mensual_monotributo || 0) * 6;
        dataMap[m.area_id].budgetActiva += Number(m.importe_tarjeta_activa || 0) * 6;
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
      </div>

      {/* FILTROS GLOBAL INTEGRADO */}
      <div className={`${styles.filtersWrapper} glass-panel`}>
        {/* Fila 1: Temporal */}
        <div className={styles.filterRow}>
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Temporalidad:</span>
            <div className={styles.periodTabs}>
              <button
                type="button"
                className={`${styles.periodTab} ${periodType === "semestre" ? styles.periodTabActive : ""}`}
                onClick={() => setPeriodType("semestre")}
              >
                Por Semestre
              </button>
              <button
                type="button"
                className={`${styles.periodTab} ${periodType === "mes" ? styles.periodTabActive : ""}`}
                onClick={() => setPeriodType("mes")}
              >
                Por Mes
              </button>
              <button
                type="button"
                className={`${styles.periodTab} ${periodType === "anio" ? styles.periodTabActive : ""}`}
                onClick={() => setPeriodType("anio")}
              >
                Todo el Año
              </button>
            </div>
          </div>

          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Año:</span>
            <select
              className={styles.filterSelect}
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            >
              {Array.from(new Set(semesters.map((s) => s.anio))).sort((a, b) => b - a).map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>
          </div>

          {periodType === "semestre" && (
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>Semestre:</span>
              <select
                className={styles.filterSelect}
                value={selectedSemesterNum}
                onChange={(e) => setSelectedSemesterNum(parseInt(e.target.value))}
              >
                <option value={1}>1º Semestre (1S)</option>
                <option value={2}>2º Semestre (2S)</option>
              </select>
            </div>
          )}

          {periodType === "mes" && (
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>Mes:</span>
              <select
                className={styles.filterSelect}
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              >
                {["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"].map((m, idx) => (
                  <option key={idx} value={idx + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Fila 2: Orgánico / Responsable */}
        <div className={styles.filterRow} style={{ marginTop: "12px", borderTop: "1px solid rgba(255, 255, 255, 0.05)", paddingTop: "12px" }}>
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Subsecretaría:</span>
            <select
              className={styles.filterSelect}
              value={selectedSub}
              onChange={(e) => {
                setSelectedSub(e.target.value);
                setSelectedArea("");
              }}
            >
              <option value="">Todas las Subsecretarías</option>
              {subsecretarias.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Área:</span>
            <select
              className={styles.filterSelect}
              value={selectedArea}
              onChange={(e) => setSelectedArea(e.target.value)}
              disabled={!selectedSub}
            >
              <option value="">Todas las Áreas</option>
              {filteredAreasOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Responsable:</span>
            <select
              className={styles.filterSelect}
              value={selectedResp}
              onChange={(e) => setSelectedResp(e.target.value)}
            >
              <option value="">Todos los Responsables</option>
              {responsables.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre_completo}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 2. Banner de consulta histórica si está bloqueado */}
      {targetSemester?.bloqueado && (
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
            Modo Historial Activo: Visualizando instantánea congelada del Semestre {targetSemester.nombre_display || `${targetSemester.numero_semestre}S ${targetSemester.anio}`}.
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
            <span className={styles.kpiTitle}>Becas Mensual</span>
            <Users className={styles.kpiIcon} size={16} />
          </div>
          <p className={styles.kpiValue} style={{ fontSize: "20px", marginBottom: "8px" }}>
            {formatCurrency(metrics.monthlyBecasTotal)}
          </p>
          <div className={styles.kpiSubtext} style={{ flexDirection: "column", alignItems: "flex-start", gap: "2px" }}>
            <span style={{ fontWeight: "600", color: "var(--text-secondary)" }}>{metrics.totalBecarios} Becarios Activos</span>
            <span className="mono" style={{ fontSize: "11px" }}>Base: {formatCurrency(metrics.monthlyBecasBase)}</span>
            <span className="mono" style={{ fontSize: "11px" }}>Activa: {formatCurrency(metrics.monthlyBecasActiva)}</span>
          </div>
        </div>

        <div className={`${styles.kpiCard} glass-panel ${styles.kpiCard_purple}`}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiTitle}>Monotributos Mensual</span>
            <Briefcase className={styles.kpiIcon} size={16} />
          </div>
          <p className={styles.kpiValue} style={{ fontSize: "20px", marginBottom: "8px" }}>
            {formatCurrency(metrics.monthlyMonosTotal)}
          </p>
          <div className={styles.kpiSubtext} style={{ flexDirection: "column", alignItems: "flex-start", gap: "2px" }}>
            <span style={{ fontWeight: "600", color: "var(--text-secondary)" }}>{metrics.totalMonos} Monotributistas</span>
            <span className="mono" style={{ fontSize: "11px" }}>Base: {formatCurrency(metrics.monthlyMonosBase)}</span>
            <span className="mono" style={{ fontSize: "11px" }}>Activa: {formatCurrency(metrics.monthlyMonosActiva)}</span>
          </div>
        </div>

        <div className={`${styles.kpiCard} glass-panel ${styles.kpiCard_emerald}`}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiTitle}>Gasto Mensual Total</span>
            <TrendingUp className={styles.kpiIcon} size={16} />
          </div>
          <p className={styles.kpiValue}>{formatCurrency(metrics.monthlyGrandTotal)}</p>
          <div className={styles.kpiSubtext} style={{ flexDirection: "column", alignItems: "flex-start", gap: "2px" }}>
            <span className="mono">Base: {formatCurrency(metrics.monthlyBecasBase + metrics.monthlyMonosBase)}</span>
            <span className="mono">Activa: {formatCurrency(metrics.monthlyBecasActiva + metrics.monthlyMonosActiva)}</span>
          </div>
        </div>

        <div className={`${styles.kpiCard} glass-panel ${styles.kpiCard_cyan}`}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiTitle}>Proyección Semestre</span>
            <Building2 className={styles.kpiIcon} size={16} />
          </div>
          <p className={styles.kpiValue}>{formatCurrency(metrics.semestralGrandTotal)}</p>
          <div className={styles.kpiSubtext} style={{ flexDirection: "column", alignItems: "flex-start", gap: "2px" }}>
            <span className="mono">Base: {formatCurrency((metrics.monthlyBecasBase + metrics.monthlyMonosBase) * 6)}</span>
            <span className="mono">Activa: {formatCurrency((metrics.monthlyBecasActiva + metrics.monthlyMonosActiva) * 6)}</span>
          </div>
        </div>

        {!selectedSub && (
          <div className={`${styles.kpiCard} glass-panel ${styles.kpiCard_amber}`}>
            <div className={styles.kpiHeader}>
              <span className={styles.kpiTitle}>Ejecución OC Global</span>
              <TrendingDown className={styles.kpiIcon} size={16} />
            </div>
            <p className={styles.kpiValue}>{metrics.ocProgress.toFixed(1)}%</p>
            <div className={styles.kpiSubtext} style={{ flexDirection: "column", alignItems: "flex-start", gap: "2px" }}>
              <span>Ejecutado: {formatCurrency(metrics.ocTotalExecuted)}</span>
              <span>Remanente: {formatCurrency(metrics.ocTotalRemaining)}</span>
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
          {/* Card: Análisis de Disponibilidad Proyectada (OC vs Proyectado) */}
          <div className={`${styles.chartCard} ${styles.chartCardLarge} glass-panel`} style={{ minHeight: "auto" }}>
            <div className={styles.chartHeader}>
              <h3 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span>Análisis de Disponibilidad Proyectada (OC vs Gasto Proyectado)</span>
              </h3>
            </div>
            <div className={styles.ocTableResponsive}>
              <table className={styles.ocTable}>
                <thead>
                  <tr>
                    <th>Partida / Tipo</th>
                    <th>Presupuesto OC</th>
                    <th>Ejecutado Real</th>
                    <th>Remanente OC</th>
                    <th>Gasto Proyectado (Mes)</th>
                    <th>Gasto Proyectado (Semestre)</th>
                    <th>Disponible Proyectado</th>
                    <th>Estado Proyectado</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.ocBreakdown.map((row) => {
                    const isDeficit = row.dispProj < 0;
                    return (
                      <tr key={row.type}>
                        <td><strong>{row.name}</strong></td>
                        <td className={styles.monoCell}>{formatCurrency(row.ocAssigned)}</td>
                        <td className={styles.monoCell}>{formatCurrency(row.ocExecuted)}</td>
                        <td className={styles.monoCell}>{formatCurrency(row.ocRemaining)}</td>
                        <td className={styles.monoCell}>{formatCurrency(row.projMonthly)}</td>
                        <td className={styles.monoCell}>{formatCurrency(row.projSemestral)}</td>
                        <td
                          className={styles.monoCell}
                          style={{
                            fontWeight: 600,
                            color: isDeficit ? "var(--accent-rose)" : "var(--accent-emerald)"
                          }}
                        >
                          {formatCurrency(row.dispProj)}
                        </td>
                        <td>
                          <span className={`${styles.badge} ${isDeficit ? styles.badgeNegative : styles.badgePositive}`}>
                            {isDeficit ? "Déficit Proyectado" : "Presupuesto OK"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className={styles.totalRow}>
                    <td>TOTAL GENERAL</td>
                    <td className={styles.monoCell}>{formatCurrency(metrics.totals.ocAssigned)}</td>
                    <td className={styles.monoCell}>{formatCurrency(metrics.totals.ocExecuted)}</td>
                    <td className={styles.monoCell}>{formatCurrency(metrics.totals.ocRemaining)}</td>
                    <td className={styles.monoCell}>{formatCurrency(metrics.totals.projMonthly)}</td>
                    <td className={styles.monoCell}>{formatCurrency(metrics.totals.projSemestral)}</td>
                    <td
                      className={styles.monoCell}
                      style={{
                        color: metrics.totals.dispProj < 0 ? "var(--accent-rose)" : "var(--accent-emerald)"
                      }}
                    >
                      {formatCurrency(metrics.totals.dispProj)}
                    </td>
                    <td>
                      <span className={`${styles.badge} ${metrics.totals.dispProj < 0 ? styles.badgeNegative : styles.badgePositive}`}>
                        {metrics.totals.dispProj < 0 ? "Déficit Total" : "Superávit Total"}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

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

          {/* Chart 3: LineChart Altas vs Bajas */}
          <div className={`${styles.chartCard} glass-panel`}>
            <div className={styles.chartHeader}>
              <h3>Curva Temporal de Movimientos (Altas vs Bajas - {selectedYear})</h3>
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

          {/* Chart 2: Budget Breakdown BarChart */}
          <div className={`${styles.chartCard} ${styles.chartCardLarge} glass-panel`}>
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
                      interval={0}
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
                          <td style={{ textAlign: "right" }}>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                              <span className="mono font-bold text-emerald">{formatCurrency(item.budget)}</span>
                              <span className="text-secondary" style={{ fontSize: "11px" }}>Base: {formatCurrency(item.budgetBase)}</span>
                              <span className="text-secondary" style={{ fontSize: "11px" }}>Activa: {formatCurrency(item.budgetActiva)}</span>
                            </div>
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
