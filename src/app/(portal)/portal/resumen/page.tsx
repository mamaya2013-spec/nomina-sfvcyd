"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  TrendingUp,
  Users,
  Briefcase,
  DollarSign,
  Search,
  ChevronDown,
  FileText,
  Loader2,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSemester } from "@/lib/contexts/SemesterContext";
import { usePortalFilter } from "@/lib/contexts/PortalFilterContext";
import { toast, Toaster } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import styles from "./resumen.module.css";

interface SubsecretariaData {
  id: string;
  nombre: string;
  becariosCount: number;
  becariosCost: number;
  monosCount: number;
  monosCost: number;
  totalPeople: number;
  totalCost: number;
  percentage: number;
}

interface AreaData {
  id: string;
  nombre: string;
  subsecretaria_id: string;
  becariosCount: number;
  becariosCost: number;
  monosCount: number;
  monosCost: number;
  totalPeople: number;
  totalCost: number;
}

interface CategoryBreakdown {
  id: string;
  label: string;
  count: number;
  rate: number;
  totalCost: number;
}

export default function PortalResumenPage() {
  const supabase = createClient();
  const { selectedSemester, loading: semesterLoading } = useSemester();
  const { selectedSubsecretariaId, selectedAreaId, selectedResponsableId } = usePortalFilter();

  // Component states
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"subsecretaria" | "area" | "categorias">("subsecretaria");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedSubs, setExpandedSubs] = useState<Record<string, boolean>>({});
  const [exportingPDF, setExportingPDF] = useState(false);

  // Raw data from DB/Snapshot
  const [becarios, setBecarios] = useState<any[]>([]);
  const [monotributistas, setMonotributistas] = useState<any[]>([]);
  const [subsecretarias, setSubsecretarias] = useState<any[]>([]);
  const [areas, setAreas] = useState<any[]>([]);
  const [becaCategories, setBecaCategories] = useState<any[]>([]);
  const [monoCategories, setMonoCategories] = useState<any[]>([]);

  // Fetch core data
  const fetchData = async () => {
    if (!selectedSemester) return;
    setLoading(true);
    try {
      // 1. Fetch subsecretarías and areas (active)
      const { data: subsData, error: subsErr } = await supabase
        .from("subsecretarias")
        .select("*")
        .eq("activa", true)
        .order("nombre", { ascending: true });

      const { data: areasData, error: areasErr } = await supabase
        .from("areas")
        .select("*")
        .eq("activa", true)
        .order("nombre", { ascending: true });

      if (subsErr) throw subsErr;
      if (areasErr) throw areasErr;

      setSubsecretarias(subsData || []);
      setAreas(areasData || []);

      if (selectedSemester.bloqueado) {
        // 2a. Fetch from snapshot if locked
        const { data: snapshot, error: snapErr } = await supabase
          .from("snapshots_semestre")
          .select("*")
          .eq("semestre_id", selectedSemester.id)
          .maybeSingle();

        if (snapErr) throw snapErr;

        if (snapshot) {
          setBecarios(snapshot.nomina_becarios_snapshot || []);
          setMonotributistas(snapshot.nomina_monos_snapshot || []);
          setBecaCategories(snapshot.categorias_becas_snapshot || []);
          setMonoCategories(snapshot.categorias_monos_snapshot || []);
        } else {
          setBecarios([]);
          setMonotributistas([]);
          setBecaCategories([]);
          setMonoCategories([]);
        }
      } else {
        // 2b. Fetch live data if active
        const { data: becs, error: becsErr } = await supabase
          .from("becarios")
          .select("*, subsecretarias(id, nombre), areas(id, nombre), categorias_becas(*)")
          .eq("estado", "Activo");

        const { data: monos, error: monosErr } = await supabase
          .from("monotributistas")
          .select("*, subsecretarias(id, nombre), areas(id, nombre), categorias_monotributistas(*)")
          .eq("estado", "Activo");

        const { data: catsBeca, error: catsBecaErr } = await supabase
          .from("categorias_becas")
          .select("*")
          .eq("semestre_id", selectedSemester.id);

        const { data: catsMono, error: catsMonoErr } = await supabase
          .from("categorias_monotributistas")
          .select("*")
          .eq("semestre_id", selectedSemester.id);

        if (becsErr) throw becsErr;
        if (monosErr) throw monosErr;
        if (catsBecaErr) throw catsBecaErr;
        if (catsMonoErr) throw catsMonoErr;

        setBecarios(becs || []);
        setMonotributistas(monos || []);
        setBecaCategories(catsBeca || []);
        setMonoCategories(catsMono || []);
      }
    } catch (err: any) {
      console.error("Error loading summary metrics:", err);
      toast.error("Error al cargar los datos del resumen: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedSemester]);

  // Helper formatting functions
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val);
  };

  // Filter in-memory raw lists based on selected layout filters
  const filteredBecariosRaw = useMemo(() => {
    return becarios.filter((b) => {
      if (selectedSubsecretariaId !== "all" && b.subsecretaria_id !== selectedSubsecretariaId) return false;
      if (selectedAreaId !== "all" && b.area_id !== selectedAreaId) return false;
      if (selectedResponsableId !== "all" && b.responsable_id !== selectedResponsableId) return false;
      return true;
    });
  }, [becarios, selectedSubsecretariaId, selectedAreaId, selectedResponsableId]);

  const filteredMonotributistasRaw = useMemo(() => {
    return monotributistas.filter((m) => {
      if (selectedSubsecretariaId !== "all" && m.subsecretaria_id !== selectedSubsecretariaId) return false;
      if (selectedAreaId !== "all" && m.area_id !== selectedAreaId) return false;
      if (selectedResponsableId !== "all" && m.responsable_id !== selectedResponsableId) return false;
      return true;
    });
  }, [monotributistas, selectedSubsecretariaId, selectedAreaId, selectedResponsableId]);

  const filteredSubsecretaríasRaw = useMemo(() => {
    return subsecretarias.filter((s) => {
      if (selectedSubsecretariaId !== "all" && s.id !== selectedSubsecretariaId) return false;
      return true;
    });
  }, [subsecretarias, selectedSubsecretariaId]);

  const filteredAreasRaw = useMemo(() => {
    return areas.filter((a) => {
      if (selectedSubsecretariaId !== "all" && a.subsecretaria_id !== selectedSubsecretariaId) return false;
      if (selectedAreaId !== "all" && a.id !== selectedAreaId) return false;
      return true;
    });
  }, [areas, selectedSubsecretariaId, selectedAreaId]);

  // 1. Process Consolidated Calculations (useMemo)
  const calculations = useMemo(() => {
    // Totals
    let totalBecariosCount = 0;
    let totalBecariosCost = 0;
    let totalMonosCount = 0;
    let totalMonosCost = 0;

    // Subsecretarias calculations
    const subMap: Record<string, SubsecretariaData> = {};
    filteredSubsecretaríasRaw.forEach((sub) => {
      subMap[sub.id] = {
        id: sub.id,
        nombre: sub.nombre,
        becariosCount: 0,
        becariosCost: 0,
        monosCount: 0,
        monosCost: 0,
        totalPeople: 0,
        totalCost: 0,
        percentage: 0,
      };
    });

    // Areas calculations
    const areaMap: Record<string, AreaData> = {};
    filteredAreasRaw.forEach((area) => {
      areaMap[area.id] = {
        id: area.id,
        nombre: area.nombre,
        subsecretaria_id: area.subsecretaria_id,
        becariosCount: 0,
        becariosCost: 0,
        monosCount: 0,
        monosCost: 0,
        totalPeople: 0,
        totalCost: 0,
      };
    });

    // Process Becarios
    filteredBecariosRaw.forEach((b) => {
      const cost = Number(b.importe_total || 0);
      totalBecariosCount++;
      totalBecariosCost += cost;

      if (b.subsecretaria_id && subMap[b.subsecretaria_id]) {
        subMap[b.subsecretaria_id].becariosCount++;
        subMap[b.subsecretaria_id].becariosCost += cost;
      }
      if (b.area_id && areaMap[b.area_id]) {
        areaMap[b.area_id].becariosCount++;
        areaMap[b.area_id].becariosCost += cost;
      }
    });

    // Process Monotributistas
    filteredMonotributistasRaw.forEach((m) => {
      const cost = Number(m.importe_total || 0);
      totalMonosCount++;
      totalMonosCost += cost;

      if (m.subsecretaria_id && subMap[m.subsecretaria_id]) {
        subMap[m.subsecretaria_id].monosCount++;
        subMap[m.subsecretaria_id].monosCost += cost;
      }
      if (m.area_id && areaMap[m.area_id]) {
        areaMap[m.area_id].monosCount++;
        areaMap[m.area_id].monosCost += cost;
      }
    });

    // Consolidate Subsecretarias
    const grandTotalCost = totalBecariosCost + totalMonosCost;
    const subList = Object.values(subMap).map((sub) => {
      const totalCost = sub.becariosCost + sub.monosCost;
      return {
        ...sub,
        totalPeople: sub.becariosCount + sub.monosCount,
        totalCost,
        percentage: grandTotalCost > 0 ? (totalCost / grandTotalCost) * 100 : 0,
      };
    });

    // Consolidate Areas
    const areaList = Object.values(areaMap).map((area) => ({
      ...area,
      totalPeople: area.becariosCount + area.monosCount,
      totalCost: area.becariosCost + area.monosCost,
    }));

    // Process Categories Breakdown (Becarios)
    const becCatsBreakdown: Record<string, CategoryBreakdown> = {};
    becaCategories.forEach((c) => {
      becCatsBreakdown[c.id] = {
        id: c.id,
        label: `Categoría ${c.numero_categoria}`,
        count: 0,
        rate: Number(c.total || 0),
        totalCost: 0,
      };
    });

    filteredBecariosRaw.forEach((b) => {
      const catId = b.categoria_beca_id;
      if (catId && becCatsBreakdown[catId]) {
        becCatsBreakdown[catId].count++;
        becCatsBreakdown[catId].totalCost += Number(b.importe_total || 0);
      }
    });

    // Process Categories Breakdown (Monotributistas)
    const monoCatsBreakdown: Record<string, CategoryBreakdown> = {};
    monoCategories.forEach((c) => {
      monoCatsBreakdown[c.id] = {
        id: c.id,
        label: `Letra ${c.letra} (${c.descripcion_categoria || "Sin desc."})`,
        count: 0,
        rate: Number(c.total || 0),
        totalCost: 0,
      };
    });

    filteredMonotributistasRaw.forEach((m) => {
      const catId = m.categoria_mono_id;
      if (catId && monoCatsBreakdown[catId]) {
        monoCatsBreakdown[catId].count++;
        monoCatsBreakdown[catId].totalCost += Number(m.importe_total || 0);
      }
    });

    return {
      totalBecariosCount,
      totalBecariosCost,
      totalMonosCount,
      totalMonosCost,
      grandTotalCost,
      grandTotalPeople: totalBecariosCount + totalMonosCount,
      subsecretariasList: subList.sort((a, b) => b.totalCost - a.totalCost),
      areasList: areaList.sort((a, b) => b.totalCost - a.totalCost),
      becCategoriesList: Object.values(becCatsBreakdown).sort((a, b) => a.rate - b.rate),
      monoCategoriesList: Object.values(monoCatsBreakdown).sort((a, b) => a.rate - b.rate),
    };
  }, [
    filteredBecariosRaw,
    filteredMonotributistasRaw,
    filteredSubsecretaríasRaw,
    filteredAreasRaw,
    becaCategories,
    monoCategories,
  ]);

  // Expand/collapse subsecretarías helper
  const toggleSubExpanded = (id: string) => {
    setExpandedSubs((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Filter lists based on search term
  const filteredSubsecretarias = useMemo(() => {
    return calculations.subsecretariasList.filter((s) =>
      s.nombre.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [calculations.subsecretariasList, searchTerm]);

  // Group filtered areas by subsecretaria
  const groupedAreasBySub = useMemo(() => {
    const group: Record<string, AreaData[]> = {};
    calculations.areasList.forEach((area) => {
      if (area.nombre.toLowerCase().includes(searchTerm.toLowerCase())) {
        if (!group[area.subsecretaria_id]) {
          group[area.subsecretaria_id] = [];
        }
        group[area.subsecretaria_id].push(area);
      }
    });
    return group;
  }, [calculations.areasList, searchTerm]);

  // Export summary to PDF (Executive Report format)
  const handleExportPDF = async () => {
    if (!selectedSemester) return;
    setExportingPDF(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const { applyPlugin } = await import("jspdf-autotable");
      applyPlugin(jsPDF);
      const doc = new jsPDF("p", "mm", "a4");

      const semLabel = `Semestre ${selectedSemester.anio} - ${selectedSemester.activo ? "Activo" : "Bloqueado"}`;

      // --- PAGE 1: COVER & OVERALL KPI SUMMARY ---
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(10, 22, 40);
      doc.text("SECRETARÍA DE FORTALECIMIENTO VECINAL, CULTURA Y DEPORTES", 15, 20);

      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text("MUNICIPALIDAD DE SAN FERNANDO DEL VALLE DE CATAMARCA", 15, 25);

      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text("REPORTE CONSOLIDADO DE GESTIÓN Y COSTOS DE NÓMINA - PORTAL SECRETARIO", 15, 34);
      doc.line(15, 38, 195, 38);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Período de Análisis: ${semLabel}`, 15, 45);
      doc.text(`Fecha de Emisión: ${new Date().toLocaleDateString("es-AR")}`, 15, 50);
      doc.text(`Filtros Aplicados: Subsecretaría: ${selectedSubsecretariaId === "all" ? "Todas" : "Filtrado"}, Área: ${selectedAreaId === "all" ? "Todas" : "Filtrado"}`, 15, 55);

      doc.setFillColor(243, 244, 246);
      doc.rect(15, 62, 85, 26, "F");
      doc.rect(110, 62, 85, 26, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(75, 85, 99);
      doc.text("COSTO MENSUAL CONSOLIDADO DE NÓMINA", 18, 68);
      doc.text("TOTAL AGENTES EN NÓMINA ACTIVA", 113, 68);

      doc.setFontSize(18);
      doc.setTextColor(17, 24, 39);
      doc.text(formatCurrency(calculations.grandTotalCost), 18, 79);
      doc.text(`${calculations.grandTotalPeople} Agentes`, 113, 79);

      doc.setFillColor(243, 244, 246);
      doc.rect(15, 93, 85, 22, "F");
      doc.rect(110, 93, 85, 22, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(59, 130, 246);
      doc.text("CONCEPTO BECARIOS", 18, 99);
      doc.setTextColor(16, 185, 129);
      doc.text("CONCEPTO MONOTRIBUTISTAS", 113, 99);

      doc.setFontSize(12);
      doc.setTextColor(17, 24, 39);
      doc.text(`${calculations.totalBecariosCount} Agentes | ${formatCurrency(calculations.totalBecariosCost)}/mes`, 18, 108);
      doc.text(`${calculations.totalMonosCount} Agentes | ${formatCurrency(calculations.totalMonosCost)}/mes`, 113, 108);

      // Section 1: Subsecretarías Table
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(10, 22, 40);
      doc.text("1. Resumen Consolidado por Subsecretaría", 15, 126);

      const subTableRows = calculations.subsecretariasList.map((s) => [
        s.nombre,
        s.becariosCount,
        formatCurrency(s.becariosCost),
        s.monosCount,
        formatCurrency(s.monosCost),
        s.totalPeople,
        formatCurrency(s.totalCost),
        `${s.percentage.toFixed(1)}%`
      ]);

      (doc as any).autoTable({
        startY: 132,
        head: [["Subsecretaría", "Bec. Cant", "Bec. Costo", "Mono. Cant", "Mono. Costo", "Total Agentes", "Costo Consolidado", "Partic. %"]],
        body: subTableRows,
        foot: [[
          "TOTAL GENERAL",
          calculations.totalBecariosCount,
          formatCurrency(calculations.totalBecariosCost),
          calculations.totalMonosCount,
          formatCurrency(calculations.totalMonosCost),
          calculations.grandTotalPeople,
          formatCurrency(calculations.grandTotalCost),
          "100.0%"
        ]],
        theme: "striped",
        headStyles: { fillStyle: "F", fillColor: [10, 22, 40], textColor: [255, 255, 255], fontSize: 8.5 },
        footStyles: { fillColor: [243, 244, 246], textColor: [17, 24, 39], fontSize: 8.5, fontStyle: "bold" },
        bodyStyles: { fontSize: 8.5, textColor: [31, 41, 55] },
        columnStyles: {
          0: { cellWidth: 50 },
        }
      });

      // Section 2: Categories Breakdown
      doc.addPage();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(10, 22, 40);
      doc.text("2. Desglose Presupuestario por Categorías de Becarios", 15, 20);

      const becCatRows = calculations.becCategoriesList.map((c) => [
        c.label,
        c.count,
        formatCurrency(c.rate),
        formatCurrency(c.totalCost)
      ]);

      (doc as any).autoTable({
        startY: 25,
        head: [["Categoría de Beca", "Cantidad Becarios", "Valor Unitario", "Inversión Mensual"]],
        body: becCatRows,
        theme: "striped",
        headStyles: { fillColor: [59, 130, 246] },
        bodyStyles: { fontSize: 9 }
      });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("3. Desglose Presupuestario por Categorías de Monotributistas", 15, (doc as any).lastAutoTable.finalY + 15);

      const monoCatRows = calculations.monoCategoriesList.map((c) => [
        c.label,
        c.count,
        formatCurrency(c.rate),
        formatCurrency(c.totalCost)
      ]);

      (doc as any).autoTable({
        startY: (doc as any).lastAutoTable.finalY + 20,
        head: [["Categoría Fiscal Monotributo", "Cantidad Contratos", "Valor Unitario", "Inversión Mensual"]],
        body: monoCatRows,
        theme: "striped",
        headStyles: { fillColor: [16, 185, 129] },
        bodyStyles: { fontSize: 9 }
      });

      doc.save(`resumen_gestion_portal_${selectedSemester.anio}_S${selectedSemester.numero_semestre}.pdf`);
      toast.success("Resumen exportado exitosamente a PDF.");
    } catch (err: any) {
      console.error("PDF generation failed:", err);
      toast.error("Error al exportar a PDF: " + err.message);
    } finally {
      setExportingPDF(false);
    }
  };

  if (semesterLoading || (loading && !calculations.grandTotalPeople)) {
    return (
      <div className={styles.loadingSpinner}>
        <Loader2 className={styles.spin} size={48} />
        <span>Cargando resumen de gestión...</span>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Toaster position="top-right" richColors />

      {/* Header and PDF Download */}
      <div className={`${styles.header} glass-panel`}>
        <div className={styles.headerTitleGroup}>
          <h1>Resumen de Gestión Ejecutiva</h1>
          <p className="text-secondary">
            Consolidado gerencial de personal activo y presupuesto asignado.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            onClick={handleExportPDF}
            className={styles.primaryBtn}
            disabled={exportingPDF || calculations.grandTotalPeople === 0}
          >
            {exportingPDF ? (
              <>
                <Loader2 className="animate-spin" size={16} />
                <span>Generando...</span>
              </>
            ) : (
              <>
                <FileText size={16} />
                <span>Exportar Informe PDF</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className={styles.kpiGrid}>
        {/* KPI 1: Costo Consolidado */}
        <div className={`${styles.kpiCard} glass-panel`}>
          <div className={styles.kpiCardHeader}>
            <span className={styles.kpiTitle}>Gasto Mensual Consolidado</span>
            <div className={styles.kpiIconWrapper} style={{ background: "rgba(139, 92, 246, 0.1)", color: "#a78bfa" }}>
              <DollarSign size={18} />
            </div>
          </div>
          <span className={`${styles.kpiValue} text-purple`}>
            {formatCurrency(calculations.grandTotalCost)}
          </span>
          <span className={styles.kpiMeta}>
            Inversión mensual total del semestre
          </span>
        </div>

        {/* KPI 2: Total Agentes */}
        <div className={`${styles.kpiCard} glass-panel`}>
          <div className={styles.kpiCardHeader}>
            <span className={styles.kpiTitle}>Total Agentes Activos</span>
            <div className={styles.kpiIconWrapper} style={{ background: "rgba(6, 182, 212, 0.1)", color: "#22d3ee" }}>
              <Users size={18} />
            </div>
          </div>
          <span className={styles.kpiValue}>
            {calculations.grandTotalPeople}
          </span>
          <span className={styles.kpiMeta}>
            {calculations.totalBecariosCount} becarios | {calculations.totalMonosCount} monotributistas
          </span>
        </div>

        {/* KPI 3: Gasto Becarios */}
        <div className={`${styles.kpiCard} glass-panel`}>
          <div className={styles.kpiCardHeader}>
            <span className={styles.kpiTitle}>Partida Mensual Becas</span>
            <div className={styles.kpiIconWrapper} style={{ background: "rgba(59, 130, 246, 0.1)", color: "#60a5fa" }}>
              <Briefcase size={18} />
            </div>
          </div>
          <span className={`${styles.kpiValue} text-blue`}>
            {formatCurrency(calculations.totalBecariosCost)}
          </span>
          <span className={styles.kpiMeta}>
            Proporción: {calculations.grandTotalCost > 0 ? ((calculations.totalBecariosCost / calculations.grandTotalCost) * 100).toFixed(0) : 0}% del gasto
          </span>
        </div>

        {/* KPI 4: Gasto Monotributo */}
        <div className={`${styles.kpiCard} glass-panel`}>
          <div className={styles.kpiCardHeader}>
            <span className={styles.kpiTitle}>Partida Mensual Contratos</span>
            <div className={styles.kpiIconWrapper} style={{ background: "rgba(16, 185, 129, 0.1)", color: "#34d399" }}>
              <TrendingUp size={18} />
            </div>
          </div>
          <span className={`${styles.kpiValue} text-emerald`}>
            {formatCurrency(calculations.totalMonosCost)}
          </span>
          <span className={styles.kpiMeta}>
            Proporción: {calculations.grandTotalCost > 0 ? ((calculations.totalMonosCost / calculations.grandTotalCost) * 100).toFixed(0) : 0}% del gasto
          </span>
        </div>
      </div>

      {/* Tabs Layout */}
      <div className={styles.tabsContainer}>
        <div className={styles.tabs}>
          <button
            onClick={() => setActiveTab("subsecretaria")}
            className={`${styles.tabButton} ${activeTab === "subsecretaria" ? styles.tabButtonActive : ""}`}
          >
            <span>Subsecretarías</span>
            {activeTab === "subsecretaria" && <motion.div layoutId="tab-underline" className={styles.tabIndicator} />}
          </button>
          <button
            onClick={() => setActiveTab("area")}
            className={`${styles.tabButton} ${activeTab === "area" ? styles.tabButtonActive : ""}`}
          >
            <span>Áreas Operativas</span>
            {activeTab === "area" && <motion.div layoutId="tab-underline" className={styles.tabIndicator} />}
          </button>
          <button
            onClick={() => setActiveTab("categorias")}
            className={`${styles.tabButton} ${activeTab === "categorias" ? styles.tabButtonActive : ""}`}
          >
            <span>Categorías y Escalas</span>
            {activeTab === "categorias" && <motion.div layoutId="tab-underline" className={styles.tabIndicator} />}
          </button>
        </div>

        <div className={styles.searchWrapper}>
          <Search className={styles.searchIcon} size={16} />
          <input
            type="text"
            placeholder="Buscar..."
            className={styles.searchInput}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Views Container */}
      <div className={styles.viewContainer}>
        <AnimatePresence mode="wait">
          {activeTab === "subsecretaria" && (
            <motion.div
              key="subsecretaria"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className={`${styles.panel} glass-panel`}
            >
              <div className={styles.tableWrapper}>
                <table className={styles.summaryTable}>
                  <thead>
                    <tr>
                      <th>Subsecretaría</th>
                      <th>Becarios</th>
                      <th>Costo Becas</th>
                      <th>Monotributistas</th>
                      <th>Costo Contratos</th>
                      <th>Total Agentes</th>
                      <th>Inversión Mensual</th>
                      <th>Participación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSubsecretarias.length === 0 ? (
                      <tr>
                        <td colSpan={8} className={styles.noData}>
                          No hay subsecretarías que coincidan con la búsqueda.
                        </td>
                      </tr>
                    ) : (
                      filteredSubsecretarias.map((s) => (
                        <tr key={s.id}>
                          <td className="font-semibold">{s.nombre}</td>
                          <td>{s.becariosCount}</td>
                          <td>{formatCurrency(s.becariosCost)}</td>
                          <td>{s.monosCount}</td>
                          <td>{formatCurrency(s.monosCost)}</td>
                          <td className="font-medium">{s.totalPeople}</td>
                          <td className="font-bold text-emerald">{formatCurrency(s.totalCost)}</td>
                          <td>
                            <div className={styles.progressCell}>
                              <span className={styles.progressPercent}>{s.percentage.toFixed(1)}%</span>
                              <div className={styles.progressBarContainer}>
                                <div
                                  className={styles.progressBarFill}
                                  style={{ width: `${s.percentage}%` }}
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                    {filteredSubsecretarias.length > 0 && (
                      <tr className={styles.totalRow}>
                        <td>TOTAL CONSOLIDADO</td>
                        <td>{calculations.totalBecariosCount}</td>
                        <td>{formatCurrency(calculations.totalBecariosCost)}</td>
                        <td>{calculations.totalMonosCount}</td>
                        <td>{formatCurrency(calculations.totalMonosCost)}</td>
                        <td>{calculations.grandTotalPeople}</td>
                        <td className="text-emerald">{formatCurrency(calculations.grandTotalCost)}</td>
                        <td>100.0%</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeTab === "area" && (
            <motion.div
              key="area"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className={styles.accordion}
            >
              {filteredSubsecretarias.map((sub) => {
                const subAreas = groupedAreasBySub[sub.id] || [];
                const isExpanded = expandedSubs[sub.id] || false;

                if (subAreas.length === 0 && searchTerm !== "") return null;

                return (
                  <div key={sub.id} className={styles.accordionItem}>
                    <button
                      onClick={() => toggleSubExpanded(sub.id)}
                      className={styles.accordionHeader}
                    >
                      <div className={styles.accordionHeaderLeft}>
                        <ChevronDown
                          size={18}
                          className={`${styles.chevron} ${isExpanded ? styles.chevronRotated : ""}`}
                        />
                        <span className={styles.subsecretariaName}>{sub.nombre}</span>
                      </div>
                      <div className={styles.accordionHeaderRight}>
                        <div className={styles.headerStat}>
                          <span className={styles.headerStatLabel}>Agentes</span>
                          <span className={styles.headerStatValue}>{sub.totalPeople}</span>
                        </div>
                        <div className={styles.headerStat}>
                          <span className={styles.headerStatLabel}>Gasto Mensual</span>
                          <span className={`${styles.headerStatValue} text-emerald`}>
                            {formatCurrency(sub.totalCost)}
                          </span>
                        </div>
                      </div>
                    </button>

                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: "auto" }}
                          exit={{ height: 0 }}
                          transition={{ duration: 0.2 }}
                          className={styles.accordionContent}
                        >
                          <div className={styles.tableWrapper}>
                            <table className={styles.areaTable}>
                              <thead>
                                <tr>
                                  <th>Área Operativa</th>
                                  <th>Becarios</th>
                                  <th>Gasto Becas</th>
                                  <th>Monotributistas</th>
                                  <th>Gasto Contratos</th>
                                  <th>Total Agentes</th>
                                  <th>Gasto Mensual</th>
                                </tr>
                              </thead>
                              <tbody>
                                {subAreas.length === 0 ? (
                                  <tr>
                                    <td colSpan={7} className={styles.noData}>
                                      No hay áreas activas registradas o vinculadas.
                                    </td>
                                  </tr>
                                ) : (
                                  subAreas.map((area) => (
                                    <tr key={area.id}>
                                      <td className="font-semibold">{area.nombre}</td>
                                      <td>{area.becariosCount}</td>
                                      <td>{formatCurrency(area.becariosCost)}</td>
                                      <td>{area.monosCount}</td>
                                      <td>{formatCurrency(area.monosCost)}</td>
                                      <td className="font-medium">{area.totalPeople}</td>
                                      <td className="font-bold text-emerald">{formatCurrency(area.totalCost)}</td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </motion.div>
          )}

          {activeTab === "categorias" && (
            <motion.div
              key="categorias"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className={`${styles.panel} glass-panel`}
            >
              <div className={styles.tableWrapper}>
                <table className={styles.summaryTable}>
                  <thead>
                    <tr>
                      <th>Escala y Categoría</th>
                      <th>Cantidad Agentes</th>
                      <th>Valor Unitario (Monto/mes)</th>
                      <th>Total Inversión Mensual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Becarios Category Group */}
                    <tr>
                      <td colSpan={4} className={styles.categoryGroupTitle}>
                        Becarios (Escala Municipal)
                      </td>
                    </tr>
                    {calculations.becCategoriesList.map((c) => (
                      <tr key={c.id}>
                        <td className="font-semibold">{c.label}</td>
                        <td>{c.count}</td>
                        <td className="mono">{formatCurrency(c.rate)}</td>
                        <td className="mono font-bold text-blue">{formatCurrency(c.totalCost)}</td>
                      </tr>
                    ))}

                    {/* Monotributistas Category Group */}
                    <tr>
                      <td colSpan={4} className={styles.categoryGroupTitle}>
                        Monotributistas (Escala Fiscal ARCA)
                      </td>
                    </tr>
                    {calculations.monoCategoriesList.map((c) => (
                      <tr key={c.id}>
                        <td className="font-semibold">{c.label}</td>
                        <td>{c.count}</td>
                        <td className="mono">{formatCurrency(c.rate)}</td>
                        <td className="mono font-bold text-emerald">{formatCurrency(c.totalCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
