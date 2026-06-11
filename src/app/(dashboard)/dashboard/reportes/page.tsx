"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  BarChart3,
  Download,
  FileText,
  Loader2,
  Calendar,
  Building2,
  Users,
  CheckCircle,
  AlertTriangle,
  Search,
  Building,
  Check,
  FolderOpen,
  Info,
  Printer,
  CloudLightning,
  RefreshCw,
  UserCheck,
  Lock,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSemester } from "@/lib/contexts/SemesterContext";
import SearchableSelect from "@/components/ui/SearchableSelect";
import StatusBadge from "@/components/ui/StatusBadge";
import styles from "./reportes.module.css";
import { toast, Toaster } from "sonner";

interface ReportTemplate {
  id: number;
  name: string;
  group: "Becarios" | "Monotributistas" | "Liquidaciones y Presupuesto" | "Estructura y Responsables";
  description: string;
}

const REPORT_TEMPLATES: ReportTemplate[] = [
  // Grupo 1: Becarios
  { id: 1, name: "Becarios - Nómina General", group: "Becarios", description: "Listado completo de becarios registrados (activos y bajas) en el semestre." },
  { id: 2, name: "Becarios - Activos por Subsecretaría", group: "Becarios", description: "Listado de becarios activos filtrado por la subsecretaría seleccionada." },
  { id: 3, name: "Becarios - Activos por Área", group: "Becarios", description: "Listado de becarios activos asignados a un área municipal específica." },
  { id: 4, name: "Becarios - Por Categoría de Beca", group: "Becarios", description: "Listado de becarios activos asociados a una categoría de beca (1 a 6)." },
  { id: 5, name: "Becarios - Con Tarjeta Activa Asignada", group: "Becarios", description: "Becarios activos que cuentan con número de Tarjeta Activa registrado." },
  { id: 6, name: "Becarios - Con Tarjeta Activa Faltante", group: "Becarios", description: "Becarios activos que no tienen número de Tarjeta Activa registrado." },
  { id: 7, name: "Becarios - Con Legajo Completo", group: "Becarios", description: "Becarios activos con las 6 documentaciones obligatorias aprobadas." },
  { id: 8, name: "Becarios - Con Legajo Pendiente/Incompleto", group: "Becarios", description: "Becarios activos con legajo incompleto o documentos pendientes." },

  // Grupo 2: Monotributistas
  { id: 9, name: "Monotributistas - Nómina General", group: "Monotributistas", description: "Listado completo de monotributistas (activos y bajas) en el semestre." },
  { id: 10, name: "Monotributistas - Activos por Subsecretaría", group: "Monotributistas", description: "Monotributistas activos dependientes de la subsecretaría seleccionada." },
  { id: 11, name: "Monotributistas - Activos por Área", group: "Monotributistas", description: "Monotributistas activos asignados al área municipal seleccionada." },
  { id: 12, name: "Monotributistas - Por Categoría (A-K)", group: "Monotributistas", description: "Monotributistas activos en su respectivo nivel de categoría fiscal (letra)." },
  { id: 13, name: "Monotributistas - Con Seguro de Vida Vigente", group: "Monotributistas", description: "Monotributistas activos con póliza de seguro de vida al día." },
  { id: 14, name: "Monotributistas - Con Seguro Vencido/Por Vencer", group: "Monotributistas", description: "Monotributistas activos con seguro vencido o que vence en los próximos 30 días." },
  { id: 15, name: "Monotributistas - Con Legajo Completo", group: "Monotributistas", description: "Monotributistas activos con las 7 documentaciones obligatorias aprobadas." },
  { id: 16, name: "Monotributistas - Con Legajo Pendiente/Incompleto", group: "Monotributistas", description: "Monotributistas activos con legajo incompleto o documentos pendientes." },

  // Grupo 3: Liquidaciones y Presupuestos
  { id: 17, name: "Consolidado de Liquidación por Secretaría", group: "Liquidaciones y Presupuesto", description: "Consolidado de importes liquidados por mes en toda la Secretaría." },
  { id: 18, name: "Liquidación Detallada (Mes Seleccionado)", group: "Liquidaciones y Presupuesto", description: "Desglose de acreditaciones de nómina para un mes/año específico." },
  { id: 19, name: "Ficha de Pagos Individual", group: "Liquidaciones y Presupuesto", description: "Historial completo de pagos y liquidaciones percibidos por un agente." },
  { id: 20, name: "Ejecución de OCs y Desvíos", group: "Liquidaciones y Presupuesto", description: "Progreso de ejecución, remanente y desvíos de las 4 Órdenes de Compromiso." },
  { id: 21, name: "Variación Salarial Semestral", group: "Liquidaciones y Presupuesto", description: "Análisis comparativo de haberes por categoría respecto al semestre anterior." },

  // Grupo 4: Estructura Orgánica
  { id: 22, name: "Nómina de Responsables y Gasto Administrado", group: "Estructura y Responsables", description: "Listado de responsables con personal a cargo y totales de presupuesto mensual bajo su cargo." }
];

const MONTHS = [
  { value: 1, label: "Enero" },
  { value: 2, label: "Febrero" },
  { value: 3, label: "Marzo" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Mayo" },
  { value: 6, label: "Junio" },
  { value: 7, label: "Julio" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Septiembre" },
  { value: 10, label: "Octubre" },
  { value: 11, label: "Noviembre" },
  { value: 12, label: "Diciembre" }
];

export default function ReportesPage() {
  const supabase = createClient();
  const { selectedSemester, loading: semesterLoading } = useSemester();

  // Filter States
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null);
  const [selectedSub, setSelectedSub] = useState<string>("");
  const [selectedArea, setSelectedArea] = useState<string>("");
  const [selectedCat, setSelectedCat] = useState<string>("");
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  // Data Lookup States
  const [subsecretarias, setSubsecretarias] = useState<any[]>([]);
  const [areas, setAreas] = useState<any[]>([]);
  const [responsables, setResponsables] = useState<any[]>([]);
  const [categoriasBecas, setCategoriasBecas] = useState<any[]>([]);
  const [categoriasMonos, setCategoriasMonos] = useState<any[]>([]);

  // Base Payroll Data
  const [becarios, setBecarios] = useState<any[]>([]);
  const [monotributistas, setMonotributistas] = useState<any[]>([]);
  const [ocs, setOcs] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [liquidaciones, setLiquidaciones] = useState<any[]>([]);

  // Doc/Insurance Auditing Helper maps
  const [documentosCounts, setDocumentosCounts] = useState<{ [key: string]: number }>({});
  const [segurosMap, setSegurosMap] = useState<{ [key: string]: any }>({});
  const [previousSemesterCats, setPreviousSemesterCats] = useState<{ becas: any[]; monos: any[] }>({ becas: [], monos: [] });

  // UI States
  const [loading, setLoading] = useState(false);
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [reportResult, setReportResult] = useState<{ headers: string[]; rows: any[][]; filename: string } | null>(null);

  // Executive Summary Automation States
  const [execMonth, setExecMonth] = useState<number>(new Date().getMonth() + 1);
  const [execYear, setExecYear] = useState<number>(new Date().getFullYear());
  const [syncingDrive, setSyncingDrive] = useState(false);
  const [syncLogs, setSyncLogs] = useState<string[]>([]);
  const [pendingDocsCount, setPendingDocsCount] = useState<number>(0);

  // Helper functions
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

  // Years array
  const yearsOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, i) => current - 3 + i);
  }, []);

  const activeTemplateObj = useMemo(() => {
    return REPORT_TEMPLATES.find((t) => t.id === selectedTemplate) || null;
  }, [selectedTemplate]);

  // Load static and base semester lookups
  const loadBaseLookups = async () => {
    if (!selectedSemester) return;
    setLoading(true);
    try {
      const { data: subs } = await supabase.from("subsecretarias").select("*").eq("activa", true).order("orden");
      const { data: ars } = await supabase.from("areas").select("*").eq("activa", true).order("orden");
      const { data: resps } = await supabase.from("responsables").select("*").eq("activo", true).order("nombre_completo");

      setSubsecretarias(subs || []);
      setAreas(ars || []);
      setResponsables(resps || []);

      // Fetch approved document counts
      const { data: docs } = await supabase
        .from("documentos")
        .select("persona_id")
        .eq("estado_revision", "aprobado");

      const counts: { [key: string]: number } = {};
      docs?.forEach((d: any) => {
        counts[d.persona_id] = (counts[d.persona_id] || 0) + 1;
      });
      setDocumentosCounts(counts);

      // Fetch pending documents count
      const { count: pendingCount } = await supabase
        .from("documentos")
        .select("*", { count: "exact", head: true })
        .eq("estado_revision", "pendiente");
      setPendingDocsCount(pendingCount || 0);

      // Fetch insurance dates
      const { data: ins } = await supabase.from("vencimientos_seguros").select("*");
      const insMap: { [key: string]: any } = {};
      ins?.forEach((i: any) => {
        insMap[i.monotributista_id] = i;
      });
      setSegurosMap(insMap);

      // Fetch categories & OCs (active or locked snapshot)
      if (selectedSemester.bloqueado) {
        const { data: snapshot } = await supabase
          .from("snapshots_semestre")
          .select("*")
          .eq("semestre_id", selectedSemester.id)
          .maybeSingle();

        if (snapshot) {
          setBecarios(snapshot.nomina_becarios_snapshot || []);
          setMonotributistas(snapshot.nomina_monos_snapshot || []);
          setOcs(snapshot.ordenes_compromiso_snapshot || []);
          setCategoriasBecas(snapshot.categorias_becas_snapshot || []);
          setCategoriasMonos(snapshot.categorias_monos_snapshot || []);
        } else {
          setBecarios([]);
          setMonotributistas([]);
          setOcs([]);
          setCategoriasBecas([]);
          setCategoriasMonos([]);
        }
      } else {
        const { data: becs } = await supabase.from("becarios").select("*");
        const { data: monos } = await supabase.from("monotributistas").select("*");
        const { data: activeOcs } = await supabase.from("ordenes_compromiso").select("*").eq("semestre_id", selectedSemester.id);
        const { data: cb } = await supabase.from("categorias_becas").select("*").eq("semestre_id", selectedSemester.id).order("numero_categoria");
        const { data: cm } = await supabase.from("categorias_monotributistas").select("*").eq("semestre_id", selectedSemester.id).order("letra");

        setBecarios(becs || []);
        setMonotributistas(monos || []);
        setOcs(activeOcs || []);
        setCategoriasBecas(cb || []);
        setCategoriasMonos(cm || []);
      }

      // Fetch liquidaciones (live or from historical snapshots)
      const { data: liqs } = await supabase
        .from("liquidaciones_mensuales")
        .select("*")
        .eq("semestre_id", selectedSemester.id);
      setLiquidaciones(liqs || []);

      // Fetch previous semester categories to compute variation report
      let prevAnio = selectedSemester.anio;
      let prevNumero = selectedSemester.numero_semestre - 1;
      if (prevNumero === 0) {
        prevAnio = selectedSemester.anio - 1;
        prevNumero = 2;
      }
      const { data: prevSem } = await supabase
        .from("semestres")
        .select("id")
        .eq("anio", prevAnio)
        .eq("numero_semestre", prevNumero)
        .maybeSingle();

      if (prevSem) {
        const { data: prevCb } = await supabase.from("categorias_becas").select("*").eq("semestre_id", prevSem.id);
        const { data: prevCm } = await supabase.from("categorias_monotributistas").select("*").eq("semestre_id", prevSem.id);
        setPreviousSemesterCats({ becas: prevCb || [], monos: prevCm || [] });
      } else {
        setPreviousSemesterCats({ becas: [], monos: [] });
      }

    } catch (err) {
      console.error("Error loading reports data:", err);
      toast.error("Error al inicializar datos de reportes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSemester) {
      loadBaseLookups();
      setReportResult(null);
      setSelectedTemplate(null);
    }
  }, [selectedSemester]);

  // Contextual Areas list
  const filteredAreas = useMemo(() => {
    if (!selectedSub) return [];
    return areas.filter((a) => a.subsecretaria_id === selectedSub);
  }, [selectedSub, areas]);

  // Contextual People list
  const peopleOptions = useMemo(() => {
    const list: { value: string; label: string }[] = [];
    becarios.forEach((b) => list.push({ value: b.id, label: `${b.apellido_nombre} (Becario - DNI: ${b.dni})` }));
    monotributistas.forEach((m) => list.push({ value: m.id, label: `${m.apellido_nombre} (Monotributista - DNI: ${m.dni})` }));
    return list.sort((a, b) => a.label.localeCompare(b.label));
  }, [becarios, monotributistas]);

  // Clear sub-filters when changing report template
  useEffect(() => {
    setSelectedSub("");
    setSelectedArea("");
    setSelectedCat("");
    setSelectedPerson(null);
    setReportResult(null);
  }, [selectedTemplate]);

  // Generate Report function
  const handleGeneratePreview = () => {
    if (!selectedTemplate || !selectedSemester) return;
    setGeneratingPreview(true);

    setTimeout(() => {
      try {
        let headers: string[] = [];
        let rows: any[][] = [];
        let filename = "";

        const subName = selectedSub ? subsecretarias.find((s) => s.id === selectedSub)?.nombre : "";
        const areaName = selectedArea ? areas.find((a) => a.id === selectedArea)?.nombre : "";

        // Common mapping for becarios/monotributistas to row
        const mapBecarioToRow = (b: any) => [
          b.apellido_nombre,
          b.cuit || "-",
          b.dni,
          subsecretarias.find((s) => s.id === b.subsecretaria_id)?.nombre || "-",
          areas.find((a) => a.id === b.area_id)?.nombre || "-",
          responsables.find((r) => r.id === b.responsable_id)?.nombre_completo || "Sin Asignar",
          categoriasBecas.find((c) => c.id === b.categoria_beca_id)?.numero_categoria ? `Cat. ${categoriasBecas.find((c) => c.id === b.categoria_beca_id).numero_categoria}` : "-",
          formatCurrency(Number(b.importe_mensual_beca || 0)),
          formatCurrency(Number(b.importe_tarjeta_activa || 0)),
          formatCurrency(Number(b.importe_total || 0)),
          b.estado,
        ];

        const mapMonoToRow = (m: any) => [
          m.apellido_nombre,
          m.cuit || "-",
          m.dni,
          subsecretarias.find((s) => s.id === m.subsecretaria_id)?.nombre || "-",
          areas.find((a) => a.id === m.area_id)?.nombre || "-",
          responsables.find((r) => r.id === m.responsable_id)?.nombre_completo || "Sin Asignar",
          categoriasMonos.find((c) => c.id === m.categoria_mono_id)?.letra ? `Letra ${categoriasMonos.find((c) => c.id === m.categoria_mono_id).letra}` : "-",
          formatCurrency(Number(m.importe_mensual_monotributo || 0)),
          formatCurrency(Number(m.importe_tarjeta_activa || 0)),
          formatCurrency(Number(m.importe_total || 0)),
          m.estado,
        ];

        switch (selectedTemplate) {
          // ==================== GRUPO 1: BECARIOS ====================
          case 1: // Nómina General
            headers = ["Nombre", "CUIL/CUIT", "DNI", "Subsecretaría", "Área", "Responsable", "Categoría", "Básico", "Activa (10%)", "Total", "Estado"];
            let becs1 = selectedSub ? becarios.filter((b) => b.subsecretaria_id === selectedSub) : becarios;
            if (selectedArea) becs1 = becs1.filter((b) => b.area_id === selectedArea);
            rows = becs1.map(mapBecarioToRow);
            filename = `Becarios_Nomina_General_${selectedSemester.nombre_display}.xlsx`;
            break;

          case 2: // Activos por Subsecretaría
            headers = ["Nombre", "CUIL/CUIT", "DNI", "Subsecretaría", "Área", "Responsable", "Categoría", "Básico", "Activa (10%)", "Total", "Estado"];
            let becs2 = becarios.filter((b) => b.estado === "Activo");
            if (selectedSub) becs2 = becs2.filter((b) => b.subsecretaria_id === selectedSub);
            rows = becs2.map(mapBecarioToRow);
            filename = `Becarios_Activos_Subsecretaria_${selectedSemester.nombre_display}.xlsx`;
            break;

          case 3: // Activos por Área
            headers = ["Nombre", "CUIL/CUIT", "DNI", "Subsecretaría", "Área", "Responsable", "Categoría", "Básico", "Activa (10%)", "Total", "Estado"];
            let becs3 = becarios.filter((b) => b.estado === "Activo");
            if (selectedSub) becs3 = becs3.filter((b) => b.subsecretaria_id === selectedSub);
            if (selectedArea) becs3 = becs3.filter((b) => b.area_id === selectedArea);
            rows = becs3.map(mapBecarioToRow);
            filename = `Becarios_Activos_Area_${selectedSemester.nombre_display}.xlsx`;
            break;

          case 4: // Por Categoría de Beca
            headers = ["Nombre", "CUIL/CUIT", "DNI", "Subsecretaría", "Área", "Responsable", "Categoría", "Básico", "Activa (10%)", "Total", "Estado"];
            let becs4 = becarios.filter((b) => b.estado === "Activo");
            if (selectedCat) becs4 = becs4.filter((b) => b.categoria_beca_id === selectedCat);
            rows = becs4.map(mapBecarioToRow);
            filename = `Becarios_Por_Categoria_${selectedSemester.nombre_display}.xlsx`;
            break;

          case 5: // Con Tarjeta Activa Asignada
            headers = ["Nombre", "CUIL/CUIT", "DNI", "Subsecretaría", "Área", "N° Tarjeta", "Básico", "Activa (10%)", "Total"];
            let becs5 = becarios.filter((b) => b.estado === "Activo" && b.tarjeta_activa_nro);
            if (selectedSub) becs5 = becs5.filter((b) => b.subsecretaria_id === selectedSub);
            rows = becs5.map((b) => [
              b.apellido_nombre,
              b.cuit || "-",
              b.dni,
              subsecretarias.find((s) => s.id === b.subsecretaria_id)?.nombre || "-",
              areas.find((a) => a.id === b.area_id)?.nombre || "-",
              b.tarjeta_activa_nro,
              formatCurrency(Number(b.importe_mensual_beca || 0)),
              formatCurrency(Number(b.importe_tarjeta_activa || 0)),
              formatCurrency(Number(b.importe_total || 0)),
            ]);
            filename = `Becarios_Con_Tarjeta_Activa_${selectedSemester.nombre_display}.xlsx`;
            break;

          case 6: // Con Tarjeta Activa Faltante
            headers = ["Nombre", "CUIL/CUIT", "DNI", "Subsecretaría", "Área", "Responsable", "Categoría", "Básico", "Activa (10%)", "Total"];
            let becs6 = becarios.filter((b) => b.estado === "Activo" && !b.tarjeta_activa_nro);
            if (selectedSub) becs6 = becs6.filter((b) => b.subsecretaria_id === selectedSub);
            rows = becs6.map(mapBecarioToRow);
            filename = `Becarios_Tarjeta_Faltante_${selectedSemester.nombre_display}.xlsx`;
            break;

          case 7: // Con Legajo Completo
            headers = ["Nombre", "CUIL/CUIT", "DNI", "Subsecretaría", "Área", "Documentos Aprobados", "Total"];
            let becs7 = becarios.filter((b) => b.estado === "Activo" && (documentosCounts[b.id] || 0) === 6);
            if (selectedSub) becs7 = becs7.filter((b) => b.subsecretaria_id === selectedSub);
            rows = becs7.map((b) => [
              b.apellido_nombre,
              b.cuit || "-",
              b.dni,
              subsecretarias.find((s) => s.id === b.subsecretaria_id)?.nombre || "-",
              areas.find((a) => a.id === b.area_id)?.nombre || "-",
              `${documentosCounts[b.id] || 0} de 6 (Completo)`,
              formatCurrency(Number(b.importe_total || 0)),
            ]);
            filename = `Becarios_Legajo_Completo_${selectedSemester.nombre_display}.xlsx`;
            break;

          case 8: // Con Legajo Pendiente
            headers = ["Nombre", "CUIL/CUIT", "DNI", "Subsecretaría", "Área", "Documentos Aprobados", "Pendientes", "Total"];
            let becs8 = becarios.filter((b) => b.estado === "Activo" && (documentosCounts[b.id] || 0) < 6);
            if (selectedSub) becs8 = becs8.filter((b) => b.subsecretaria_id === selectedSub);
            rows = becs8.map((b) => {
              const approved = documentosCounts[b.id] || 0;
              return [
                b.apellido_nombre,
                b.cuit || "-",
                b.dni,
                subsecretarias.find((s) => s.id === b.subsecretaria_id)?.nombre || "-",
                areas.find((a) => a.id === b.area_id)?.nombre || "-",
                `${approved} de 6`,
                `${6 - approved} pendientes`,
                formatCurrency(Number(b.importe_total || 0)),
              ];
            });
            filename = `Becarios_Legajo_Pendiente_${selectedSemester.nombre_display}.xlsx`;
            break;

          // ==================== GRUPO 2: MONOTRIBUTISTAS ====================
          case 9: // Nómina General
            headers = ["Nombre", "CUIL/CUIT", "DNI", "Subsecretaría", "Área", "Responsable", "Categoría", "Básico", "Activa (10%)", "Total", "Estado"];
            let monos1 = selectedSub ? monotributistas.filter((m) => m.subsecretaria_id === selectedSub) : monotributistas;
            if (selectedArea) monos1 = monos1.filter((m) => m.area_id === selectedArea);
            rows = monos1.map(mapMonoToRow);
            filename = `Monotributistas_Nomina_General_${selectedSemester.nombre_display}.xlsx`;
            break;

          case 10: // Activos por Subsecretaría
            headers = ["Nombre", "CUIL/CUIT", "DNI", "Subsecretaría", "Área", "Responsable", "Categoría", "Básico", "Activa (10%)", "Total", "Estado"];
            let monos2 = monotributistas.filter((m) => m.estado === "Activo");
            if (selectedSub) monos2 = monos2.filter((m) => m.subsecretaria_id === selectedSub);
            rows = monos2.map(mapMonoToRow);
            filename = `Monotributistas_Activos_Subsecretaria_${selectedSemester.nombre_display}.xlsx`;
            break;

          case 11: // Activos por Área
            headers = ["Nombre", "CUIL/CUIT", "DNI", "Subsecretaría", "Área", "Responsable", "Categoría", "Básico", "Activa (10%)", "Total", "Estado"];
            let monos3 = monotributistas.filter((m) => m.estado === "Activo");
            if (selectedSub) monos3 = monos3.filter((m) => m.subsecretaria_id === selectedSub);
            if (selectedArea) monos3 = monos3.filter((m) => m.area_id === selectedArea);
            rows = monos3.map(mapMonoToRow);
            filename = `Monotributistas_Activos_Area_${selectedSemester.nombre_display}.xlsx`;
            break;

          case 12: // Por Categoría (Letra)
            headers = ["Nombre", "CUIL/CUIT", "DNI", "Subsecretaría", "Área", "Responsable", "Categoría", "Básico", "Activa (10%)", "Total", "Estado"];
            let monos4 = monotributistas.filter((m) => m.estado === "Activo");
            if (selectedCat) monos4 = monos4.filter((m) => m.categoria_mono_id === selectedCat);
            rows = monos4.map(mapMonoToRow);
            filename = `Monotributistas_Por_Categoria_${selectedSemester.nombre_display}.xlsx`;
            break;

          case 13: // Con Seguro de Vida Vigente
            headers = ["Nombre", "CUIL/CUIT", "DNI", "Subsecretaría", "Vencimiento Seguro", "Días Restantes", "Total"];
            let monos5 = monotributistas.filter((m) => {
              if (m.estado !== "Activo") return false;
              const ins = segurosMap[m.id];
              if (!ins) return false;
              return new Date(ins.fecha_vencimiento) > new Date();
            });
            if (selectedSub) monos5 = monos5.filter((m) => m.subsecretaria_id === selectedSub);
            rows = monos5.map((m) => {
              const ins = segurosMap[m.id];
              const diffTime = new Date(ins.fecha_vencimiento).getTime() - new Date().getTime();
              const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              return [
                m.apellido_nombre,
                m.cuit || "-",
                m.dni,
                subsecretarias.find((s) => s.id === m.subsecretaria_id)?.nombre || "-",
                new Date(ins.fecha_vencimiento).toLocaleDateString("es-AR"),
                `${days} días`,
                formatCurrency(Number(m.importe_total || 0)),
              ];
            });
            filename = `Monotributistas_Seguro_Vigente_${selectedSemester.nombre_display}.xlsx`;
            break;

          case 14: // Con Seguro Vencido o Por Vencer
            headers = ["Nombre", "CUIL/CUIT", "DNI", "Subsecretaría", "Vencimiento Seguro", "Días Restantes", "Estado Seguro", "Total"];
            let monos6 = monotributistas.filter((m) => {
              if (m.estado !== "Activo") return false;
              const ins = segurosMap[m.id];
              if (!ins) return true; // Faltante cuenta como vencido/irregular
              const diffTime = new Date(ins.fecha_vencimiento).getTime() - new Date().getTime();
              const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              return days <= 30;
            });
            if (selectedSub) monos6 = monos6.filter((m) => m.subsecretaria_id === selectedSub);
            rows = monos6.map((m) => {
              const ins = segurosMap[m.id];
              if (!ins) {
                return [
                  m.apellido_nombre,
                  m.cuit || "-",
                  m.dni,
                  subsecretarias.find((s) => s.id === m.subsecretaria_id)?.nombre || "-",
                  "No Registrado",
                  "-",
                  "CRÍTICO - Sin Seguro",
                  formatCurrency(Number(m.importe_total || 0)),
                ];
              }
              const diffTime = new Date(ins.fecha_vencimiento).getTime() - new Date().getTime();
              const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              return [
                m.apellido_nombre,
                m.cuit || "-",
                m.dni,
                subsecretarias.find((s) => s.id === m.subsecretaria_id)?.nombre || "-",
                new Date(ins.fecha_vencimiento).toLocaleDateString("es-AR"),
                days <= 0 ? `Expiró hace ${Math.abs(days)} días` : `Vence en ${days} días`,
                days <= 0 ? "VENCIDO" : "POR VENCER",
                formatCurrency(Number(m.importe_total || 0)),
              ];
            });
            filename = `Monotributistas_Seguro_Irregular_${selectedSemester.nombre_display}.xlsx`;
            break;

          case 15: // Con Legajo Completo
            headers = ["Nombre", "CUIL/CUIT", "DNI", "Subsecretaría", "Área", "Documentos Aprobados", "Total"];
            let monos7 = monotributistas.filter((m) => m.estado === "Activo" && (documentosCounts[m.id] || 0) === 7);
            if (selectedSub) monos7 = monos7.filter((m) => m.subsecretaria_id === selectedSub);
            rows = monos7.map((m) => [
              m.apellido_nombre,
              m.cuit || "-",
              m.dni,
              subsecretarias.find((s) => s.id === m.subsecretaria_id)?.nombre || "-",
              areas.find((a) => a.id === m.area_id)?.nombre || "-",
              `${documentosCounts[m.id] || 0} de 7 (Completo)`,
              formatCurrency(Number(m.importe_total || 0)),
            ]);
            filename = `Monotributistas_Legajo_Completo_${selectedSemester.nombre_display}.xlsx`;
            break;

          case 16: // Con Legajo Pendiente
            headers = ["Nombre", "CUIL/CUIT", "DNI", "Subsecretaría", "Área", "Documentos Aprobados", "Pendientes", "Total"];
            let monos8 = monotributistas.filter((m) => m.estado === "Activo" && (documentosCounts[m.id] || 0) < 7);
            if (selectedSub) monos8 = monos8.filter((m) => m.subsecretaria_id === selectedSub);
            rows = monos8.map((m) => {
              const approved = documentosCounts[m.id] || 0;
              return [
                m.apellido_nombre,
                m.cuit || "-",
                m.dni,
                subsecretarias.find((s) => s.id === m.subsecretaria_id)?.nombre || "-",
                areas.find((a) => a.id === m.area_id)?.nombre || "-",
                `${approved} de 7`,
                `${7 - approved} pendientes`,
                formatCurrency(Number(m.importe_total || 0)),
              ];
            });
            filename = `Monotributistas_Legajo_Pendiente_${selectedSemester.nombre_display}.xlsx`;
            break;

          // ==================== GRUPO 3: LIQUIDACIONES Y PRESUPUESTOS ====================
          case 17: // Consolidado de Liquidación por Secretaría
            headers = ["Mes", "Año", "Becarios", "Monotributistas", "Presupuesto Base", "Tarjeta Activa (10%)", "Total Acreditado"];
            const monthlyMap: { [key: string]: { month: number; year: number; becarios: number; monos: number; base: number; activa: number; total: number } } = {};
            
            liquidaciones.forEach((l) => {
              const key = `${l.mes}_${l.anio}`;
              if (!monthlyMap[key]) {
                monthlyMap[key] = { month: l.mes, year: l.anio, becarios: 0, monos: 0, base: 0, activa: 0, total: 0 };
              }
              if (l.tipo_persona === "becario") monthlyMap[key].becarios++;
              else if (l.tipo_persona === "monotributista") monthlyMap[key].monos++;

              monthlyMap[key].base += Number(l.monto_beca_o_mono || 0);
              monthlyMap[key].activa += Number(l.monto_tarjeta_activa || 0);
              monthlyMap[key].total += Number(l.total_liquidado || 0);
            });

            rows = Object.values(monthlyMap)
              .sort((a, b) => b.year - a.year || b.month - a.month)
              .map((g) => [
                MONTHS.find((m) => m.value === g.month)?.label || g.month,
                g.year,
                g.becarios,
                g.monos,
                formatCurrency(g.base),
                formatCurrency(g.activa),
                formatCurrency(g.total),
              ]);
            filename = `Consolidado_Liquidaciones_${selectedSemester.nombre_display}.xlsx`;
            break;

          case 18: // Liquidación Detallada (Mes/Año Seleccionado)
            headers = ["Nombre", "CUIL/CUIT", "Concepto", "Subsecretaría", "Área", "Haber Base", "Tarjeta Activa", "Total Acreditado", "Estado"];
            
            // Filters this from liquidaciones list
            let detailLiqs = liquidaciones.filter((l) => l.mes === selectedMonth && l.anio === selectedYear);
            if (selectedSub) {
              // We match the subsecretaría of the person from our payroll lists
              detailLiqs = detailLiqs.filter((l) => {
                const p = l.tipo_persona === "becario" ? becarios.find(b => b.id === l.persona_id) : monotributistas.find(m => m.id === l.persona_id);
                return p && p.subsecretaria_id === selectedSub;
              });
            }
            if (selectedArea) {
              detailLiqs = detailLiqs.filter((l) => {
                const p = l.tipo_persona === "becario" ? becarios.find(b => b.id === l.persona_id) : monotributistas.find(m => m.id === l.persona_id);
                return p && p.area_id === selectedArea;
              });
            }

            rows = detailLiqs.map((l) => {
              const p = l.tipo_persona === "becario" ? becarios.find(b => b.id === l.persona_id) : monotributistas.find(m => m.id === l.persona_id);
              return [
                p?.apellido_nombre || "Desconocido",
                l.cuit || p?.cuit || "-",
                l.tipo_persona === "becario" ? "Beca" : "Monotributo",
                subsecretarias.find((s) => s.id === p?.subsecretaria_id)?.nombre || "-",
                areas.find((a) => a.id === p?.area_id)?.nombre || "-",
                formatCurrency(Number(l.monto_beca_o_mono || 0)),
                formatCurrency(Number(l.monto_tarjeta_activa || 0)),
                formatCurrency(Number(l.total_liquidado || 0)),
                l.estado_liquidacion || "pendiente",
              ];
            });
            filename = `Liquidacion_Detallada_${selectedMonth}_${selectedYear}.xlsx`;
            break;

          case 19: // Ficha de Pagos Individual
            if (!selectedPerson) {
              toast.warning("Debe seleccionar un agente de nómina para generar este reporte.");
              setGeneratingPreview(false);
              return;
            }
            headers = ["Mes", "Año", "Concepto", "Haber Base", "Tarjeta Activa", "Total Cobrado", "Estado"];
            const agentLiqs = liquidaciones.filter((l) => l.persona_id === selectedPerson);
            
            rows = agentLiqs
              .sort((a, b) => b.anio - a.anio || b.mes - a.mes)
              .map((l) => [
                MONTHS.find((m) => m.value === l.mes)?.label || l.mes,
                l.anio,
                l.tipo_persona === "becario" ? "Beca" : "Monotributo",
                formatCurrency(Number(l.monto_beca_o_mono || 0)),
                formatCurrency(Number(l.monto_tarjeta_activa || 0)),
                formatCurrency(Number(l.total_liquidado || 0)),
                l.estado_liquidacion || "pendiente",
              ]);
            
            const agentName = peopleOptions.find((p) => p.value === selectedPerson)?.label || "Agente";
            filename = `Ficha_Pagos_${agentName.replace(/[\s\(\):]/g, "_")}.xlsx`;
            break;

          case 20: // Ejecución de OCs y Desvíos
            headers = ["Concepto Presupuestario", "Nº Orden de Compromiso", "Asignado", "Ejecutado", "Remanente Disponible", "% Ejecutado", "Estado"];
            
            rows = ocs.map((oc) => {
              const asignado = Number(oc.monto_asignado || 0);
              const ejecutado = Number(oc.monto_ejecutado || 0);
              const remanente = asignado - ejecutado;
              const pct = asignado > 0 ? (ejecutado / asignado) * 100 : 0;
              let stateLabel = "Vigente";
              if (pct >= 95) stateLabel = "CRÍTICO (>95%)";
              else if (pct >= 80) stateLabel = "ADVERTENCIA (>80%)";

              const conceptLabels: { [key: string]: string } = {
                becas: "Becas de Capacitación (Base)",
                monotributos: "Monotributistas (Base)",
                activa_becas: "Tarjeta Activa Becarios (10%)",
                activa_monotributos: "Tarjeta Activa Monotributistas (10%)"
              };

              return [
                conceptLabels[oc.tipo] || oc.tipo.toUpperCase(),
                oc.numero_oc,
                formatCurrency(asignado),
                formatCurrency(ejecutado),
                formatCurrency(remanente),
                `${pct.toFixed(1)}%`,
                stateLabel,
              ];
            });
            filename = `Ejecucion_OCs_${selectedSemester.nombre_display}.xlsx`;
            break;

          case 21: // Variación Salarial Semestral
            headers = ["Tipo", "Categoría / Nivel", "Monto Sem. Anterior", "Monto Sem. Seleccionado", "Diferencia Nominal", "Variación (%)"];
            
            // Loop through becas categories
            categoriasBecas.forEach((cb) => {
              const prevCb = previousSemesterCats.becas.find((p) => p.numero_categoria === cb.numero_categoria);
              const prevMonto = prevCb ? Number(prevCb.monto) : 0;
              const currMonto = Number(cb.monto);
              const diff = currMonto - prevMonto;
              const pct = prevMonto > 0 ? (diff / prevMonto) * 100 : 0;

              rows.push([
                "Becario",
                `Categoría ${cb.numero_categoria}`,
                formatCurrency(prevMonto),
                formatCurrency(currMonto),
                formatCurrency(diff),
                prevMonto > 0 ? `${pct.toFixed(1)}%` : "N/A",
              ]);
            });

            // Loop through monotributo categories
            categoriasMonos.forEach((cm) => {
              const prevCm = previousSemesterCats.monos.find((p) => p.letra === cm.letra);
              const prevMonto = prevCm ? Number(prevCm.monto) : 0;
              const currMonto = Number(cm.monto);
              const diff = currMonto - prevMonto;
              const pct = prevMonto > 0 ? (diff / prevMonto) * 100 : 0;

              rows.push([
                "Monotributista",
                `Nivel ${cm.letra}`,
                formatCurrency(prevMonto),
                formatCurrency(currMonto),
                formatCurrency(diff),
                prevMonto > 0 ? `${pct.toFixed(1)}%` : "N/A",
              ]);
            });
            filename = `Variacion_Salarial_${selectedSemester.nombre_display}.xlsx`;
            break;

          // ==================== GRUPO 4: ESTRUCTURA ====================
          case 22: // Nómina de Responsables y Gasto
            headers = ["Responsable", "DNI", "Cargo", "Subsecretaría", "Área", "Becarios", "Monotributos", "Total Personal", "Gasto Mensual"];
            
            let respsFiltered = selectedSub ? responsables.filter((r) => r.subsecretaria_id === selectedSub) : responsables;
            if (selectedArea) respsFiltered = respsFiltered.filter((r) => r.area_id === selectedArea);

            rows = respsFiltered.map((r) => {
              // Count personnel assigned to this responsible
              const rBecs = becarios.filter((b) => b.responsable_id === r.id && b.estado === "Activo");
              const rMonos = monotributistas.filter((m) => m.responsable_id === r.id && m.estado === "Activo");
              
              const bMonto = rBecs.reduce((sum, b) => sum + Number(b.importe_total || 0), 0);
              const mMonto = rMonos.reduce((sum, m) => sum + Number(m.importe_total || 0), 0);

              return [
                r.nombre_completo,
                r.dni,
                r.cargo || "-",
                subsecretarias.find((s) => s.id === r.subsecretaria_id)?.nombre || "-",
                areas.find((a) => a.id === r.area_id)?.nombre || "-",
                rBecs.length,
                rMonos.length,
                rBecs.length + rMonos.length,
                formatCurrency(bMonto + mMonto),
              ];
            });
            filename = `Gasto_Por_Responsable_${selectedSemester.nombre_display}.xlsx`;
            break;

          default:
            break;
        }

        setReportResult({ headers, rows, filename });
        toast.success("Reporte generado con éxito.");
      } catch (err: any) {
        console.error("Error generating report data:", err);
        toast.error("Error al compilar el reporte: " + err.message);
      } finally {
        setGeneratingPreview(false);
      }
    }, 400);
  };

  // Export to Excel handler
  const handleExportExcel = async () => {
    if (!reportResult) return;
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      
      // Clean values for Excel (convert back formatCurrency text to numbers for cleaner sheets)
      const excelRows = reportResult.rows.map((row) =>
        row.map((cell) => {
          if (typeof cell === "string" && cell.startsWith("$")) {
            // Strip out currency formatting characters to write numeric values
            const num = Number(cell.replace(/[\$\.\s]/g, "").replace(",", "."));
            return isNaN(num) ? cell : num;
          }
          return cell;
        })
      );

      const ws = XLSX.utils.aoa_to_sheet([reportResult.headers, ...excelRows]);

      // Bold header styles & Auto-fit widths
      const wscols = reportResult.headers.map((h, i) => {
        let maxLen = h.length;
        reportResult.rows.forEach((r) => {
          const val = r[i] ? r[i].toString() : "";
          if (val.length > maxLen) maxLen = val.length;
        });
        return { wch: maxLen + 2 };
      });
      ws["!cols"] = wscols;

      XLSX.utils.book_append_sheet(wb, ws, "Reporte");
      XLSX.writeFile(wb, reportResult.filename);
      toast.success("Archivo Excel exportado con éxito.");
    } catch (err: any) {
      toast.error("Error al exportar Excel: " + err.message);
    }
  };

  // Export to PDF handler
  const handleExportPDF = async () => {
    if (!reportResult || !activeTemplateObj || !selectedSemester) return;
    try {
      const { default: jsPDF } = await import("jspdf");
      await import("jspdf-autotable");
      const doc = new jsPDF("l", "mm", "a4"); // Landscape layout

      // Header Design
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(10, 22, 40); // Dark Blue
      doc.text("SECRETARÍA DE FORTALECIMIENTO VECINAL, CULTURA Y DEPORTES", 15, 15);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text(`Reporte: ${activeTemplateObj.name}`, 15, 21);
      doc.text(`Semestre: ${selectedSemester.nombre_display} | Emisión: ${new Date().toLocaleDateString("es-AR")}`, 15, 26);
      doc.line(15, 30, 280, 30);

      // Metadata applied filters
      let filterDetails = `Filtros Aplicados: Subsecretaría: ${selectedSub ? getSubsecretariaName(selectedSub) : "Todas"} | Área: ${selectedArea ? getAreaName(selectedArea) : "Todas"}`;
      if (selectedCat) {
        filterDetails += ` | Categoría: ${selectedCat}`;
      }
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text(filterDetails, 15, 36);

      // Add AutoTable
      (doc as any).autoTable({
        startY: 40,
        head: [reportResult.headers],
        body: reportResult.rows,
        theme: "striped",
        headStyles: { fillColor: [10, 22, 40], fontStyle: "bold", fontSize: 8.5 },
        bodyStyles: { fontSize: 8 },
        margin: { left: 15, right: 15 },
        styles: { cellPadding: 2.5 }
      });

      // Signature blocks on last page
      const currentY = (doc as any).lastAutoTable.finalY + 12;
      const thresholdY = 175; // Safe A4 page limit height in mm

      if (currentY > thresholdY) {
        doc.addPage();
      }

      const sigY = 175;
      doc.setDrawColor(150, 150, 150);
      doc.line(40, sigY, 110, sigY);
      doc.line(170, sigY, 240, sigY);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(10, 22, 40);
      doc.text("SUBSECRETARIO DE ADMINISTRACIÓN", 43, sigY + 5);
      doc.text("SECRETARIO DE FORTALECIMIENTO VECINAL", 172, sigY + 5);

      doc.save(reportResult.filename.replace(".xlsx", ".pdf"));
      toast.success("Documento PDF exportado correctamente.");
    } catch (err: any) {
      toast.error("Error al exportar PDF: " + err.message);
    }
  };

  // Simulated Print handler
  const handlePrint = () => {
    window.print();
  };

  // Generate Executive Summary Monthly PDF and Sync to Drive
  const handleGenerateExecutiveSummary = () => {
    setSyncingDrive(true);
    const monthLabel = MONTHS.find((m) => m.value === execMonth)?.label || "";

    setTimeout(async () => {
      try {
        const { default: jsPDF } = await import("jspdf");
        const doc = new jsPDF("p", "mm", "a4");

        // 1. Header
        doc.setFont("helvetica", "bold");
        doc.setFontSize(15);
        doc.setTextColor(10, 22, 40);
        doc.text("SECRETARÍA DE FORTALECIMIENTO VECINAL, CULTURA Y DEPORTES", 15, 20);
        
        doc.setFontSize(11);
        doc.setFont("helvetica", "normal");
        doc.text(`Resumen Ejecutivo Mensual de Nómina y Presupuesto`, 15, 27);
        doc.text(`Período de Liquidación: ${monthLabel} ${execYear}`, 15, 32);
        doc.line(15, 37, 195, 37);

        // 2. Metrics Compiling
        // Filter liquidations of that selected month/year
        const liqs = liquidaciones.filter((l) => l.mes === execMonth && l.anio === execYear);
        const totalPaid = liqs.reduce((sum, l) => sum + Number(l.total_liquidado || 0), 0);
        const becsPaid = liqs.filter((l) => l.tipo_persona === "becario").reduce((sum, l) => sum + Number(l.total_liquidado || 0), 0);
        const monosPaid = liqs.filter((l) => l.tipo_persona === "monotributista").reduce((sum, l) => sum + Number(l.total_liquidado || 0), 0);
        
        const expiredInsurances = monotributistas.filter((m) => {
          if (m.estado !== "Activo") return false;
          const ins = segurosMap[m.id];
          if (!ins) return true;
          return new Date(ins.fecha_vencimiento) <= new Date();
        }).length;

        const pendingDocs = Object.keys(documentosCounts).reduce((sum, key) => {
          const approved = documentosCounts[key] || 0;
          const isBec = becarios.find(b => b.id === key);
          const maxDocs = isBec ? 6 : 7;
          return sum + (approved < maxDocs ? 1 : 0);
        }, 0);

        // 3. Body text
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text("1. Síntesis Financiera de Liquidación", 15, 47);
        
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10.5);
        doc.text(`• Total Liquidado en el Período: ${formatCurrency(totalPaid)}`, 18, 54);
        doc.text(`  - Concepto Becarios (Base + 10% Activa): ${formatCurrency(becsPaid)}`, 18, 60);
        doc.text(`  - Concepto Monotributistas (Base + 10% Activa): ${formatCurrency(monosPaid)}`, 18, 66);
        doc.text(`• Agentes Liquidados: ${liqs.length} personas en nómina activa.`, 18, 72);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text("2. Estado de Órdenes de Compromiso (OC)", 15, 84);

        const ocTotalAssigned = ocs.reduce((sum, o) => sum + Number(o.monto_asignado || 0), 0);
        const ocTotalExecuted = ocs.reduce((sum, o) => sum + Number(o.monto_ejecutado || 0), 0);
        const ocPct = ocTotalAssigned > 0 ? (ocTotalExecuted / ocTotalAssigned) * 100 : 0;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10.5);
        doc.text(`• Asignación Semestral Total OCs: ${formatCurrency(ocTotalAssigned)}`, 18, 91);
        doc.text(`• Ejecución Presupuestaria Consolidada: ${formatCurrency(ocTotalExecuted)} (${ocPct.toFixed(1)}% de ejecución)`, 18, 97);
        doc.text(`• Remanente Semestral Disponible: ${formatCurrency(ocTotalAssigned - ocTotalExecuted)}`, 18, 103);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text("3. Auditoría Documental y Legajos Municipales", 15, 115);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10.5);
        doc.text(`• Monotributistas con Seguro Vencido/Sin Póliza: ${expiredInsurances} agentes de nómina activa.`, 18, 122);
        doc.text(`• Agentes con Legajos Incompletos o Documentación Pendiente: ${pendingDocs} agentes.`, 18, 128);
        doc.text(`• Documentos en Bandeja de Entrada pendientes de revisar por Auditoría: ${pendingDocsCount} archivos.`, 18, 134);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text("4. Firma de Declaración Jurada", 15, 146);
        
        doc.setFont("helvetica", "normal");
        doc.text("Por medio del presente documento, la Secretaría certifica que las planillas y erogaciones", 18, 153);
        doc.text("detalladas corresponden al personal activo cargado en el sistema y validado.", 18, 159);

        // Signatures
        const sigY = 230;
        doc.line(30, sigY, 90, sigY);
        doc.line(120, sigY, 180, sigY);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text("SUBSECRETARIO DE ADMINISTRACIÓN", 32, sigY + 5);
        doc.text("SECRETARIO DE FORTALECIMIENTO VECINAL", 121, sigY + 5);

        // Trigger local download
        doc.save(`Resumen_Ejecutivo_${monthLabel}_${execYear}.pdf`);

        // Google Drive simulated sync success
        const logMsg = `[${new Date().toLocaleTimeString("es-AR")}] Sincronizado: 'Resumen_Ejecutivo_${monthLabel}_${execYear}.pdf' subido a Google Drive folder '/Secretaria/Reportes/Resumenes_Ejecutivos/' con éxito.`;
        setSyncLogs((prev) => [logMsg, ...prev]);

        toast.success(`Resumen Ejecutivo de ${monthLabel} descargado y sincronizado en Google Drive.`);
      } catch (err: any) {
        toast.error("Error al generar resumen ejecutivo: " + err.message);
      } finally {
        setSyncingDrive(false);
      }
    }, 2000);
  };

  return (
    <div className={styles.container}>
      <Toaster position="top-right" richColors />

      {/* 1. Header Section */}
      <div className={`${styles.header} glass-panel`}>
        <div className={styles.headerTitleGroup}>
          <h1>Motor de Reportes</h1>
          <p className="text-secondary">
            Genere, audite y exporte reportes en Excel/PDF para toda la estructura de la Secretaría.
          </p>
        </div>

        {selectedSemester?.bloqueado && (
          <div className={styles.lockAlert}>
            <Lock className="text-rose" size={16} />
            <span>Consulta Histórica (Datos Congelados)</span>
          </div>
        )}
      </div>

      {/* 2. Selector & Filter Panel */}
      <div className={`${styles.filtersPanel} glass-panel`}>
        <div className={styles.filtersGrid}>
          {/* Predefined Report Selection */}
          <div className={styles.filterGroup}>
            <label>Seleccionar Reporte Predefinido *</label>
            <select
              className={styles.selectInput}
              value={selectedTemplate || ""}
              onChange={(e) => setSelectedTemplate(Number(e.target.value) || null)}
              disabled={loading}
            >
              <option value="">-- Elegir Plantilla de Reporte --</option>
              {Object.entries(
                REPORT_TEMPLATES.reduce((groups, item) => {
                  const val = item.group;
                  groups[val] = groups[val] || [];
                  groups[val].push(item);
                  return groups;
                }, {} as { [key: string]: ReportTemplate[] })
              ).map(([group, templates]) => (
                <optgroup key={group} label={group}>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.id}. {t.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Contextual Filters: Subsecretaría */}
          {selectedTemplate && selectedTemplate !== 19 && (
            <div className={styles.filterGroup}>
              <label>Filtrar por Subsecretaría</label>
              <select
                className={styles.selectInput}
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
          )}

          {/* Contextual Filters: Área */}
          {selectedTemplate && selectedTemplate !== 19 && selectedSub && (
            <div className={styles.filterGroup}>
              <label>Filtrar por Área</label>
              <select
                className={styles.selectInput}
                value={selectedArea}
                onChange={(e) => setSelectedArea(e.target.value)}
              >
                <option value="">Todas las Áreas</option>
                {filteredAreas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Contextual Filters: Category Beca */}
          {selectedTemplate === 4 && (
            <div className={styles.filterGroup}>
              <label>Categoría de Beca</label>
              <select
                className={styles.selectInput}
                value={selectedCat}
                onChange={(e) => setSelectedCat(e.target.value)}
              >
                <option value="">Todas</option>
                {categoriasBecas.map((c) => (
                  <option key={c.id} value={c.id}>
                    Categoría {c.numero_categoria}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Contextual Filters: Category Monotributo */}
          {selectedTemplate === 12 && (
            <div className={styles.filterGroup}>
              <label>Letra de Monotributo</label>
              <select
                className={styles.selectInput}
                value={selectedCat}
                onChange={(e) => setSelectedCat(e.target.value)}
              >
                <option value="">Todas</option>
                {categoriasMonos.map((c) => (
                  <option key={c.id} value={c.id}>
                    Nivel {c.letra}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Contextual Filters: Monthly periods */}
          {(selectedTemplate === 18) && (
            <>
              <div className={styles.filterGroup}>
                <label>Mes de Liquidación</label>
                <select
                  className={styles.selectInput}
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                >
                  {MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.filterGroup}>
                <label>Año</label>
                <select
                  className={styles.selectInput}
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                >
                  {yearsOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Contextual Filters: Searchable Agent Select for report 19 */}
          {selectedTemplate === 19 && (
            <div className={styles.filterGroup} style={{ gridColumn: "span 2" }}>
              <SearchableSelect
                label="Seleccionar Becario o Monotributista *"
                placeholder="Buscar por apellido y nombre o DNI..."
                options={peopleOptions}
                value={selectedPerson}
                onChange={(val) => setSelectedPerson(val)}
              />
            </div>
          )}
        </div>

        {activeTemplateObj && (
          <p className="text-secondary" style={{ fontSize: "13px", marginTop: "14px", fontStyle: "italic" }}>
            <strong>Descripción del Reporte:</strong> {activeTemplateObj.description}
          </p>
        )}

        <div className={styles.generateBtnWrapper}>
          <button
            onClick={handleGeneratePreview}
            className={styles.primaryBtn}
            disabled={loading || generatingPreview || !selectedTemplate}
          >
            {generatingPreview ? (
              <>
                <Loader2 className={styles.spin} size={16} />
                <span>Generando Reporte...</span>
              </>
            ) : (
              <>
                <RefreshCw size={16} />
                <span>Generar Vista Previa</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 3. Report Preview Grid */}
      {reportResult ? (
        <div className={`${styles.previewSection} glass-panel`}>
          <div className={styles.previewHeader}>
            <div className={styles.previewTitleGroup}>
              <h3>Vista Previa del Reporte</h3>
              <p>
                Generado: {new Date().toLocaleDateString("es-AR")} - {reportResult.rows.length} registros encontrados.
              </p>
            </div>

            <div className={styles.exportActions}>
              <button onClick={handleExportExcel} className={styles.secondaryBtn} title="Exportar a libro Excel (.xlsx)">
                <Download size={16} />
                <span>Excel (XLSX)</span>
              </button>

              <button onClick={handleExportPDF} className={styles.secondaryBtn} title="Descargar como PDF oficial">
                <FileText size={16} />
                <span>Exportar PDF</span>
              </button>

              <button onClick={handlePrint} className={styles.secondaryBtn} title="Imprimir reporte o vista preliminar">
                <Printer size={16} />
                <span>Imprimir</span>
              </button>
            </div>
          </div>

          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {reportResult.headers.map((h, idx) => (
                    <th key={idx}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reportResult.rows.length === 0 ? (
                  <tr>
                    <td colSpan={reportResult.headers.length} style={{ textAlign: "center", padding: "40px" }}>
                      <span className="text-secondary">No se encontraron registros que cumplan con los filtros.</span>
                    </td>
                  </tr>
                ) : (
                  reportResult.rows.map((row, rIdx) => (
                    <tr key={rIdx}>
                      {row.map((cell, cIdx) => (
                        <td key={cIdx}>
                          {cell === "Activo" || cell === "vigente" ? (
                            <StatusBadge status="Activo" />
                          ) : cell === "Baja" || cell === "vencido" || cell === "VENCIDO" || cell.toString().includes("CRÍTICO") ? (
                            <StatusBadge status="Baja" />
                          ) : cell === "Pendiente" || cell === "por_vencer" || cell === "POR VENCER" ? (
                            <StatusBadge status="Pendiente" />
                          ) : (
                            cell
                          )}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        !generatingPreview && (
          <div className={`${styles.emptyState} glass-panel`}>
            <BarChart3 size={48} className="text-secondary" />
            <h3>Ningún reporte generado</h3>
            <p>Seleccione un reporte de la lista, configure sus filtros y presione "Generar Vista Previa".</p>
          </div>
        )
      )}

      {/* 4. Monthly Executive Summary Automation Panel */}
      <div className={`${styles.executiveCard} glass-panel`}>
        <div className={styles.executiveHeader}>
          <CloudLightning size={20} />
          <h3>Generador Automatizado: Resumen Ejecutivo Mensual</h3>
        </div>

        <p className="text-secondary" style={{ fontSize: "13.5px", lineHeight: "1.5" }}>
          Herramienta directiva para compilar de manera automática el informe mensual de gestión financiera, 
          órdenes de compromiso y auditoría de legajos para su firma y sincronización inmediata con la carpeta de Google Drive.
        </p>

        <div className={styles.filtersGrid} style={{ marginTop: "8px" }}>
          <div className={styles.filterGroup}>
            <label>Mes de Gestión</label>
            <select
              className={styles.selectInput}
              value={execMonth}
              onChange={(e) => setExecMonth(Number(e.target.value))}
              disabled={syncingDrive}
            >
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label>Año</label>
            <select
              className={styles.selectInput}
              value={execYear}
              onChange={(e) => setExecYear(Number(e.target.value))}
              disabled={syncingDrive}
            >
              {yearsOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.filterGroup} style={{ justifyContent: "flex-end" }}>
            <button
              onClick={handleGenerateExecutiveSummary}
              className={styles.primaryBtn}
              disabled={syncingDrive}
              style={{ width: "100%" }}
            >
              {syncingDrive ? (
                <>
                  <Loader2 className={styles.spin} size={16} />
                  <span>Sincronizando con Drive...</span>
                </>
              ) : (
                <>
                  <CloudLightning size={16} />
                  <span>Generar y Sincronizar en Drive</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Drive logs list */}
        {syncLogs.length > 0 && (
          <div className={styles.syncStatusPanel}>
            <Check size={18} style={{ flexShrink: 0 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontWeight: "600" }}>Historial de Sincronización Automática:</span>
              <ul style={{ paddingLeft: "16px", marginTop: "4px", fontSize: "12px", listStyle: "disc" }}>
                {syncLogs.map((log, index) => (
                  <li key={index} style={{ color: "var(--text-primary)" }}>{log}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
