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

export default function ResumenGestionPage() {
  const supabase = createClient();
  const { selectedSemester, loading: semesterLoading } = useSemester();

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

  // 1. Process Consolidated Calculations (useMemo)
  const calculations = useMemo(() => {
    // Totals
    let totalBecariosCount = 0;
    let totalBecariosCost = 0;
    let totalMonosCount = 0;
    let totalMonosCost = 0;

    // Subsecretarias calculations
    const subMap: Record<string, SubsecretariaData> = {};
    subsecretarias.forEach((sub) => {
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
    areas.forEach((area) => {
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
    becarios.forEach((b) => {
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
    monotributistas.forEach((m) => {
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

    becarios.forEach((b) => {
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

    monotributistas.forEach((m) => {
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
  }, [becarios, monotributistas, subsecretarias, areas, becaCategories, monoCategories]);

  // Expand/collapse all subsecretarías helper
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
      await import("jspdf-autotable");
      const doc = new jsPDF("p", "mm", "a4");

      const semLabel = `Semestre ${selectedSemester.anio} - ${selectedSemester.activo ? "Activo" : "Bloqueado"}`;

      // --- PAGE 1: COVER & OVERALL KPI SUMMARY ---
      // Primary Title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(10, 22, 40);
      doc.text("SECRETARÍA DE FORTALECIMIENTO VECINAL, CULTURA Y DEPORTES", 15, 20);
      
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text("MUNICIPALIDAD DE SAN FERNANDO DEL VALLE DE CATAMARCA", 15, 25);
      
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text("REPORTE CONSOLIDADO DE GESTIÓN Y COSTOS DE NÓMINA", 15, 34);
      doc.line(15, 38, 195, 38);

      // Metadatos del informe
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Período de Análisis: ${semLabel}`, 15, 45);
      doc.text(`Fecha de Emisión: ${new Date().toLocaleDateString("es-AR")}`, 15, 50);
      doc.text(`Estado de la Nómina: ${selectedSemester.bloqueado ? "CERRADA/AUDITADA (Histórico)" : "ACTIVA (Tiempo real)"}`, 15, 55);

      // KPI boxes (Synthesis)
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

      // KPI boxes (Becarios vs Monos)
      doc.setFillColor(243, 244, 246);
      doc.rect(15, 93, 85, 22, "F");
      doc.rect(110, 93, 85, 22, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(59, 130, 246); // Blue
      doc.text("CONCEPTO BECARIOS", 18, 99);
      doc.setTextColor(16, 185, 129); // Emerald
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
          1: { halign: "center" },
          2: { halign: "right" },
          3: { halign: "center" },
          4: { halign: "right" },
          5: { halign: "center" },
          6: { halign: "right" },
          7: { halign: "right" }
        },
        margin: { left: 15, right: 15 }
      });

      // Page footer (page 1)
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128);
      doc.text("Página 1 de 3", 100, 287, { align: "center" });

      // --- PAGE 2: DETALLE POR ÁREA OPERATIVA ---
      doc.addPage();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(10, 22, 40);
      doc.text("2. Desglose Detallado de Costos por Área Operativa", 15, 20);
      doc.line(15, 24, 195, 24);

      // Compile area rows with subsecretaría dividers
      const areaTableRows: any[] = [];
      calculations.subsecretariasList.forEach((sub) => {
        // Subheader row for the Subsecretaría
        areaTableRows.push([
          { content: sub.nombre.toUpperCase(), colSpan: 6, styles: { fillColor: [243, 244, 246], fontStyle: "bold", textColor: [17, 24, 39] } }
        ]);

        const subAreas = calculations.areasList.filter((a) => a.subsecretaria_id === sub.id);
        if (subAreas.length === 0) {
          areaTableRows.push(["(Sin áreas operativas registradas)", 0, "$0", 0, "$0", "$0"]);
        } else {
          subAreas.forEach((area) => {
            areaTableRows.push([
              `  • ${area.nombre}`,
              area.becariosCount,
              formatCurrency(area.becariosCost),
              area.monosCount,
              formatCurrency(area.monosCost),
              formatCurrency(area.totalCost)
            ]);
          });
        }
      });

      (doc as any).autoTable({
        startY: 28,
        head: [["Área / Subsecretaría", "Becarios", "Costo Becas", "Monotributo", "Costo Monotributo", "Total Consolidado"]],
        body: areaTableRows,
        theme: "grid",
        headStyles: { fillColor: [10, 22, 40], textColor: [255, 255, 255], fontSize: 8.5 },
        bodyStyles: { fontSize: 8, textColor: [55, 65, 81] },
        columnStyles: {
          0: { cellWidth: 70 },
          1: { halign: "center" },
          2: { halign: "right" },
          3: { halign: "center" },
          4: { halign: "right" },
          5: { halign: "right" }
        },
        margin: { left: 15, right: 15 }
      });

      // Page footer (page 2)
      doc.text("Página 2 de 3", 100, 287, { align: "center" });

      // --- PAGE 3: CATEGORY DISTRIBUTION & SIGNATURES ---
      doc.addPage();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(10, 22, 40);
      doc.text("3. Análisis de Distribución por Categorías", 15, 20);
      doc.line(15, 24, 195, 24);

      // We will place two tables side-by-side or stacked. Stacked is usually cleaner in A4.
      // Table A: Becas Categories
      doc.setFontSize(10);
      doc.text("Becas de Capacitación Laboral", 15, 31);

      const becaRows = calculations.becCategoriesList.map((c) => [
        c.label,
        c.count,
        formatCurrency(c.rate),
        formatCurrency(c.totalCost)
      ]);

      (doc as any).autoTable({
        startY: 35,
        head: [["Categoría Beca", "Agentes", "Tarifa Unitaria", "Costo Total Mensual"]],
        body: becaRows,
        theme: "striped",
        headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 50 },
          1: { halign: "center" },
          2: { halign: "right" },
          3: { halign: "right" }
        },
        margin: { left: 15, right: 15 }
      });

      const nextStartY = (doc as any).lastAutoTable.finalY + 10;

      // Table B: Monotributo Categories
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Servicios Generales (Monotributo)", 15, nextStartY);

      const monoRows = calculations.monoCategoriesList.map((c) => [
        c.label,
        c.count,
        formatCurrency(c.rate),
        formatCurrency(c.totalCost)
      ]);

      (doc as any).autoTable({
        startY: nextStartY + 4,
        head: [["Categoría Monotributo", "Agentes", "Honorario Unitario", "Costo Total Mensual"]],
        body: monoRows,
        theme: "striped",
        headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 60 },
          1: { halign: "center" },
          2: { halign: "right" },
          3: { halign: "right" }
        },
        margin: { left: 15, right: 15 }
      });

      // Signature section
      const finalY = (doc as any).lastAutoTable.finalY + 25;
      doc.line(30, finalY, 90, finalY);
      doc.line(120, finalY, 180, finalY);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(31, 41, 55);
      doc.text("AUDITADO POR / CONTRALOR", 38, finalY + 5);
      doc.text("SECRETARIO DE FORTALECIMIENTO VECINAL", 121, finalY + 5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(107, 114, 128);
      doc.text("Documento oficial emitido por el Sistema Integrado de Nóminas SFVCyD.", 15, finalY + 20);

      // Page footer (page 3)
      doc.text("Página 3 de 3", 100, 287, { align: "center" });

      // Save PDF
      doc.save(`Resumen_Costos_Gestion_${selectedSemester.anio}.pdf`);
      toast.success("Resumen de Gestión exportado a PDF correctamente.");
    } catch (err: any) {
      console.error("Error generating PDF:", err);
      toast.error("Error al exportar a PDF: " + err.message);
    } finally {
      setExportingPDF(false);
    }
  };

  return (
    <div className={styles.container}>
      <Toaster position="top-right" richColors />

      {/* Header Panel */}
      <div className={`${styles.header} glass-panel`}>
        <div className={styles.headerTitleGroup}>
          <h1>Resumen de Gestión</h1>
          <p className="text-secondary">
            Consolidado de personal y presupuesto mensual por secretaría, área y rango tarifario.
          </p>
        </div>

        <div className={styles.headerActions}>
          <button
            onClick={handleExportPDF}
            className={styles.primaryBtn}
            disabled={loading || exportingPDF}
            title="Exportar reporte detallado de costos en PDF"
          >
            {exportingPDF ? (
              <>
                <Loader2 className={styles.spin} size={16} />
                <span>Exportando...</span>
              </>
            ) : (
              <>
                <FileText size={16} />
                <span>Exportar PDF Oficial</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className={styles.loadingContainer}>
          <Loader2 className={styles.spin} size={40} />
          <p>Compilando cifras y calculando costos consolidados...</p>
        </div>
      ) : (
        <>
          {/* KPI Dashboard Grid */}
          <div className={styles.kpiGrid}>
            {/* Card 1: Grand Total Budget */}
            <div className={`${styles.kpiCard} glass-panel`}>
              <div className={styles.kpiCardHeader}>
                <span className={styles.kpiTitle}>Presupuesto Mensual Total</span>
                <div className={styles.kpiIconWrapper} style={{ background: "rgba(99, 102, 241, 0.15)" }}>
                  <DollarSign size={18} style={{ color: "#818cf8" }} />
                </div>
              </div>
              <span className={styles.kpiValue}>{formatCurrency(calculations.grandTotalCost)}</span>
              <span className={styles.kpiMeta}>Erogación mensual estimada</span>
            </div>

            {/* Card 2: Grand Total People */}
            <div className={`${styles.kpiCard} glass-panel`}>
              <div className={styles.kpiCardHeader}>
                <span className={styles.kpiTitle}>Total Personal Activo</span>
                <div className={styles.kpiIconWrapper} style={{ background: "rgba(244, 63, 94, 0.15)" }}>
                  <Users size={18} style={{ color: "#fb7185" }} />
                </div>
              </div>
              <span className={styles.kpiValue}>{calculations.grandTotalPeople}</span>
              <span className={styles.kpiMeta}>Agentes en nómina activa</span>
            </div>

            {/* Card 3: Becarios KPI */}
            <div className={`${styles.kpiCard} glass-panel`}>
              <div className={styles.kpiCardHeader}>
                <span className={styles.kpiTitle}>Costo Becarios</span>
                <div className={styles.kpiIconWrapper} style={{ background: "rgba(59, 130, 246, 0.15)" }}>
                  <TrendingUp size={18} style={{ color: "#60a5fa" }} />
                </div>
              </div>
              <span className={styles.kpiValue}>{formatCurrency(calculations.totalBecariosCost)}</span>
              <span className={styles.kpiMeta}>
                <span className={`${styles.badge} ${styles.badgeBecario}`}>
                  {calculations.totalBecariosCount} becarios
                </span>
              </span>
            </div>

            {/* Card 4: Monotributistas KPI */}
            <div className={`${styles.kpiCard} glass-panel`}>
              <div className={styles.kpiCardHeader}>
                <span className={styles.kpiTitle}>Costo Monotributo</span>
                <div className={styles.kpiIconWrapper} style={{ background: "rgba(16, 185, 129, 0.15)" }}>
                  <Briefcase size={18} style={{ color: "#34d399" }} />
                </div>
              </div>
              <span className={styles.kpiValue}>{formatCurrency(calculations.totalMonosCost)}</span>
              <span className={styles.kpiMeta}>
                <span className={`${styles.badge} ${styles.badgeMonotributista}`}>
                  {calculations.totalMonosCount} contratos
                </span>
              </span>
            </div>
          </div>

          {/* Navigation Tabs and Search */}
          <div className={styles.tabsContainer}>
            <div className={styles.tabs}>
              <button
                className={`${styles.tabButton} ${activeTab === "subsecretaria" ? styles.tabButtonActive : ""}`}
                onClick={() => setActiveTab("subsecretaria")}
              >
                Resumen por Secretaría
                {activeTab === "subsecretaria" && (
                  <motion.div layoutId="activeTabIndicator" className={styles.tabIndicator} />
                )}
              </button>
              <button
                className={`${styles.tabButton} ${activeTab === "area" ? styles.tabButtonActive : ""}`}
                onClick={() => setActiveTab("area")}
              >
                Desglose por Área
                {activeTab === "area" && (
                  <motion.div layoutId="activeTabIndicator" className={styles.tabIndicator} />
                )}
              </button>
              <button
                className={`${styles.tabButton} ${activeTab === "categorias" ? styles.tabButtonActive : ""}`}
                onClick={() => setActiveTab("categorias")}
              >
                Análisis de Categorías
                {activeTab === "categorias" && (
                  <motion.div layoutId="activeTabIndicator" className={styles.tabIndicator} />
                )}
              </button>
            </div>

            {activeTab !== "categorias" && (
              <div className={styles.searchWrapper}>
                <Search size={16} className={styles.searchIcon} />
                <input
                  type="text"
                  placeholder={activeTab === "subsecretaria" ? "Buscar secretaría..." : "Buscar área..."}
                  className={styles.searchInput}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Pestañas de Contenido */}
          <div className={styles.viewContainer}>
            <AnimatePresence mode="wait">
              {/* TAB 1: SUBSECRETARIA */}
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
                          <th>Subsecretaría / Área de Gobierno</th>
                          <th className={styles.textCenter}>Bec. Cant</th>
                          <th className={styles.textRight}>Bec. Costo</th>
                          <th className={styles.textCenter}>Mono. Cant</th>
                          <th className={styles.textRight}>Mono. Costo</th>
                          <th className={styles.textCenter}>Total Agentes</th>
                          <th className={styles.textRight}>Costo Consolidado</th>
                          <th className={styles.textRight}>% Presupuesto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSubsecretarias.length > 0 ? (
                          filteredSubsecretarias.map((s) => (
                            <tr key={s.id}>
                              <td style={{ fontWeight: 600 }}>{s.nombre}</td>
                              <td className={styles.textCenter}>{s.becariosCount}</td>
                              <td className={styles.textRight}>{formatCurrency(s.becariosCost)}</td>
                              <td className={styles.textCenter}>{s.monosCount}</td>
                              <td className={styles.textRight}>{formatCurrency(s.monosCost)}</td>
                              <td className={styles.textCenter} style={{ fontWeight: 600 }}>
                                {s.totalPeople}
                              </td>
                              <td className={styles.textRight} style={{ fontWeight: 700, color: "var(--accent-blue)" }}>
                                {formatCurrency(s.totalCost)}
                              </td>
                              <td className={styles.textRight}>
                                <div className={styles.progressCell}>
                                  <div className={styles.progressBarContainer}>
                                    <div
                                      className={styles.progressBarFill}
                                      style={{ width: `${s.percentage}%` }}
                                    />
                                  </div>
                                  <span className={styles.progressPercent}>{s.percentage.toFixed(1)}%</span>
                                </div>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={8} className={styles.textCenter}>
                              <div className={styles.emptyState}>
                                <AlertCircle size={24} />
                                <span>No se encontraron secretarías con el filtro especificado.</span>
                              </div>
                            </td>
                          </tr>
                        )}

                        {/* TOTALS ROW */}
                        {filteredSubsecretarias.length > 0 && (
                          <tr className={styles.totalRow}>
                            <td>TOTAL CONSOLIDADO</td>
                            <td className={styles.textCenter}>{calculations.totalBecariosCount}</td>
                            <td className={styles.textRight}>{formatCurrency(calculations.totalBecariosCost)}</td>
                            <td className={styles.textCenter}>{calculations.totalMonosCount}</td>
                            <td className={styles.textRight}>{formatCurrency(calculations.totalMonosCost)}</td>
                            <td className={styles.textCenter}>{calculations.grandTotalPeople}</td>
                            <td className={styles.textRight} style={{ color: "var(--accent-blue)" }}>
                              {formatCurrency(calculations.grandTotalCost)}
                            </td>
                            <td className={styles.textRight} style={{ fontWeight: 700 }}>
                              100.0%
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}

              {/* TAB 2: DETALLE POR AREA OPERATIVA (ACORDEÓN) */}
              {activeTab === "area" && (
                <motion.div
                  key="area"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.2 }}
                  className={styles.accordion}
                >
                  {subsecretarias.map((sub) => {
                    const subAreas = groupedAreasBySub[sub.id] || [];
                    const isExpanded = !!expandedSubs[sub.id];

                    // Subtotal values
                    const subBecs = subAreas.reduce((sum, a) => sum + a.becariosCount, 0);
                    const subBecsCost = subAreas.reduce((sum, a) => sum + a.becariosCost, 0);
                    const subMonos = subAreas.reduce((sum, a) => sum + a.monosCount, 0);
                    const subMonosCost = subAreas.reduce((sum, a) => sum + a.monosCost, 0);
                    const subTotalCost = subBecsCost + subMonosCost;

                    // If searching and there are no matched areas, don't show the subsecretaria header
                    if (searchTerm && subAreas.length === 0) return null;

                    return (
                      <div key={sub.id} className={styles.accordionItem}>
                        <button
                          className={styles.accordionHeader}
                          onClick={() => toggleSubExpanded(sub.id)}
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
                              <span className={styles.headerStatLabel}>Becarios</span>
                              <span className={styles.headerStatValue}>
                                {subBecs} ({formatCurrency(subBecsCost)})
                              </span>
                            </div>
                            <div className={styles.headerStat}>
                              <span className={styles.headerStatLabel}>Monotributo</span>
                              <span className={styles.headerStatValue}>
                                {subMonos} ({formatCurrency(subMonosCost)})
                              </span>
                            </div>
                            <div className={styles.headerStat}>
                              <span className={styles.headerStatLabel}>Costo Total</span>
                              <span className={styles.headerStatValue} style={{ color: "var(--accent-blue)" }}>
                                {formatCurrency(subTotalCost)}
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
                              transition={{ duration: 0.2, ease: "easeInOut" }}
                              className={styles.accordionContent}
                            >
                              <div className={styles.tableWrapper}>
                                <table className={styles.areaTable}>
                                  <thead>
                                    <tr>
                                      <th>Área Operativa / Unidad Organizativa</th>
                                      <th className={styles.textCenter}>Becarios Cant</th>
                                      <th className={styles.textRight}>Costo Becarios</th>
                                      <th className={styles.textCenter}>Monotributo Cant</th>
                                      <th className={styles.textRight}>Costo Monotributo</th>
                                      <th className={styles.textRight}>Costo Consolidado</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {subAreas.length > 0 ? (
                                      subAreas.map((area) => (
                                        <tr key={area.id}>
                                          <td className={styles.areaName}>{area.nombre}</td>
                                          <td className={styles.textCenter}>{area.becariosCount}</td>
                                          <td className={styles.textRight}>{formatCurrency(area.becariosCost)}</td>
                                          <td className={styles.textCenter}>{area.monosCount}</td>
                                          <td className={styles.textRight}>{formatCurrency(area.monosCost)}</td>
                                          <td className={styles.textRight} style={{ fontWeight: 700 }}>
                                            {formatCurrency(area.totalCost)}
                                          </td>
                                        </tr>
                                      ))
                                    ) : (
                                      <tr>
                                        <td colSpan={6} className="text-muted" style={{ padding: "16px", textAlign: "center" }}>
                                          No hay agentes asignados a las áreas operativas de esta subsecretaría.
                                        </td>
                                      </tr>
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

              {/* TAB 3: CATEGORIAS */}
              {activeTab === "categorias" && (
                <motion.div
                  key="categorias"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.2 }}
                  className={styles.categoryGrid}
                >
                  {/* Becas Categories panel */}
                  <div className="glass-panel" style={{ padding: "24px" }}>
                    <h3 className={styles.categoryTitle} style={{ color: "var(--accent-blue)" }}>
                      <TrendingUp size={20} />
                      Desglose de Categorías de Becarios
                    </h3>
                    <div className={styles.tableWrapper}>
                      <table className={styles.summaryTable}>
                        <thead>
                          <tr>
                            <th>Categoría Beca</th>
                            <th className={styles.textCenter}>Agentes</th>
                            <th className={styles.textRight}>Tarifa Mensual</th>
                            <th className={styles.textRight}>Costo Mensual</th>
                          </tr>
                        </thead>
                        <tbody>
                          {calculations.becCategoriesList.length > 0 ? (
                            calculations.becCategoriesList.map((c) => (
                              <tr key={c.id}>
                                <td style={{ fontWeight: 600 }}>{c.label}</td>
                                <td className={styles.textCenter}>{c.count}</td>
                                <td className={styles.textRight}>{formatCurrency(c.rate)}</td>
                                <td className={styles.textRight} style={{ fontWeight: 700 }}>{formatCurrency(c.totalCost)}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={4} className={styles.textCenter}>
                                <div className={styles.emptyState}>
                                  <AlertCircle size={20} />
                                  <span>No hay información de categorías de becarios.</span>
                                </div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Monotributo Categories panel */}
                  <div className="glass-panel" style={{ padding: "24px" }}>
                    <h3 className={styles.categoryTitle} style={{ color: "var(--accent-emerald)" }}>
                      <Briefcase size={20} />
                      Desglose de Categorías de Monotributo
                    </h3>
                    <div className={styles.tableWrapper}>
                      <table className={styles.summaryTable}>
                        <thead>
                          <tr>
                            <th>Letras Monotributo</th>
                            <th className={styles.textCenter}>Agentes</th>
                            <th className={styles.textRight}>Honorario Mensual</th>
                            <th className={styles.textRight}>Costo Mensual</th>
                          </tr>
                        </thead>
                        <tbody>
                          {calculations.monoCategoriesList.length > 0 ? (
                            calculations.monoCategoriesList.map((c) => (
                              <tr key={c.id}>
                                <td style={{ fontWeight: 600 }}>{c.label}</td>
                                <td className={styles.textCenter}>{c.count}</td>
                                <td className={styles.textRight}>{formatCurrency(c.rate)}</td>
                                <td className={styles.textRight} style={{ fontWeight: 700 }}>{formatCurrency(c.totalCost)}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={4} className={styles.textCenter}>
                                <div className={styles.emptyState}>
                                  <AlertCircle size={20} />
                                  <span>No hay información de categorías de monotributistas.</span>
                                </div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  );
}
