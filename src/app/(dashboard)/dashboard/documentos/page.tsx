"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  FolderOpen,
  FileCheck,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Search,
  Loader2,
  Plus,
  Check,
  X,
  Eye,
  ShieldCheck,
  User,
  Phone,
  Mail,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Link,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Drawer from "@/components/ui/Drawer";
import StatusBadge from "@/components/ui/StatusBadge";
import { toast, Toaster } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import styles from "./documentos.module.css";

const REQUIRED_DOCS = [
  { code: "antecedentes_penales", label: "Certificado de Antecedentes Penales (Cba)" },
  { code: "delitos_sexuales", label: "Certificado contra Delitos Sexuales (Ley 9680)" },
  { code: "ddjj_prestacion", label: "Declaración Jurada de Prestación de Servicios" },
  { code: "titulo_estudios", label: "Copia de Título de Últimos Estudios" },
  { code: "copia_dni_bec", label: "Copia de DNI (Becarios)" },
  { code: "copia_dni_mono", label: "Copia de DNI (Monotributistas)" },
  { code: "constancia_cuil", label: "Copia de Constancia de CUIL" },
  { code: "seguro_vigente", label: "Copia de Seguro Vigente (Monotributo)" },
  { code: "constancia_arca", label: "Copia de Constancia de ARCA" },
];

const campaignSchema = z.object({
  nombre: z.string().min(1, "El nombre de la campaña es obligatorio"),
  descripcion: z.string().optional(),
  aplica_a: z.string().min(1, "El alcance de la campaña es obligatorio"),
  fecha_inicio: z.string().min(1, "Fecha de inicio obligatoria"),
  fecha_limite: z.string().min(1, "Fecha límite obligatoria"),
  documentos_requeridos: z.array(z.string()).min(1, "Debe seleccionar al menos un documento requerido"),
});

type CampaignFormValues = z.infer<typeof campaignSchema>;

export default function DocumentosDashboardPage() {
  const supabase = createClient();

  // Navigation tabs
  const [activeTab, setActiveTab] = useState<"revision" | "campanas" | "seguros">("revision");

  // Loading States
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Data States
  const [pendingDocs, setPendingDocs] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [insurances, setInsurances] = useState<any[]>([]);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState("");

  // Campaign Analytics States
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<any | null>(null);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [subsecretarias, setSubsecretarias] = useState<any[]>([]);
  const [areas, setAreas] = useState<any[]>([]);
  const [responsables, setResponsables] = useState<any[]>([]);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // Analytics Filters
  const [analyticsSearch, setAnalyticsSearch] = useState("");
  const [analyticsSub, setAnalyticsSub] = useState("all");
  const [analyticsArea, setAnalyticsArea] = useState("all");
  const [analyticsResp, setAnalyticsResp] = useState("all");
  const [analyticsStatus, setAnalyticsStatus] = useState("all");
  
  // Analytics Pagination
  const [analyticsPage, setAnalyticsPage] = useState(1);
  const analyticsItemsPerPage = 10;

  // Rejection Dialog/Drawer
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [rejectingDocId, setRejectingDocId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  // Create Campaign Drawer
  const [isCampOpen, setIsCampOpen] = useState(false);
  const [savingCampaign, setSavingCampaign] = useState(false);

  // Form setup for campaigns
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset: resetCampForm,
    formState: { errors },
  } = useForm<CampaignFormValues>({
    resolver: zodResolver(campaignSchema),
    defaultValues: {
      nombre: "",
      descripcion: "",
      aplica_a: "ambos",
      fecha_inicio: new Date().toISOString().split("T")[0],
      fecha_limite: "",
      documentos_requeridos: [],
    },
  });

  const watchAplicaA = watch("aplica_a");
  const watchRequiredDocs = watch("documentos_requeridos") || [];

  // Filter required docs options depending on aplica_a
  const availableDocs = useMemo(() => {
    if (watchAplicaA === "becarios") {
      return REQUIRED_DOCS.filter((d) => d.code !== "copia_dni_mono" && d.code !== "seguro_vigente" && d.code !== "constancia_arca");
    } else if (watchAplicaA === "monotributistas") {
      return REQUIRED_DOCS.filter((d) => d.code !== "copia_dni_bec" && d.code !== "constancia_cuil");
    }
    return REQUIRED_DOCS;
  }, [watchAplicaA]);

  // Load approvals list
  const loadPendingDocs = async () => {
    setLoading(true);
    try {
      // 1. Fetch pending documents
      const { data: docs, error: docsErr } = await supabase
        .from("documentos")
        .select("*")
        .eq("estado_revision", "pendiente")
        .order("created_at", { ascending: false });

      if (docsErr) throw docsErr;
      const fetchedDocs = docs || [];

      // 2. Extract persona IDs
      const becarioIds = fetchedDocs
        .filter((d) => d.tipo_persona === "becario")
        .map((d) => d.persona_id);
      const monotributistaIds = fetchedDocs
        .filter((d) => d.tipo_persona === "monotributista")
        .map((d) => d.persona_id);

      const resolvedBecarios: Record<string, { id: string; apellido_nombre: string; cuit: string }> = {};
      const resolvedMonotributistas: Record<string, { id: string; apellido_nombre: string; cuit: string }> = {};

      // 3. Query becarios in batch
      if (becarioIds.length > 0) {
        const { data: becariosData, error: bErr } = await supabase
          .from("becarios")
          .select("id, apellido_nombre, cuit")
          .in("id", becarioIds);
        if (bErr) throw bErr;
        becariosData?.forEach((b) => {
          resolvedBecarios[b.id] = b;
        });
      }

      // 4. Query monotributistas in batch
      if (monotributistaIds.length > 0) {
        const { data: monosData, error: mErr } = await supabase
          .from("monotributistas")
          .select("id, apellido_nombre, cuit")
          .in("id", monotributistaIds);
        if (mErr) throw mErr;
        monosData?.forEach((m) => {
          resolvedMonotributistas[m.id] = m;
        });
      }

      // 5. Map persons to documents
      const docsWithPerson = fetchedDocs.map((doc) => {
        return {
          ...doc,
          becarios: doc.tipo_persona === "becario" ? resolvedBecarios[doc.persona_id] || null : null,
          monotributistas: doc.tipo_persona === "monotributista" ? resolvedMonotributistas[doc.persona_id] || null : null,
        };
      });

      setPendingDocs(docsWithPerson);
    } catch (err: any) {
      toast.error("Error al cargar bandeja: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Load campaigns list
  const loadCampaigns = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/campanas");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al cargar campañas");

      setCampaigns(data.campaigns || []);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Load insurance list
  const loadInsurances = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("vencimientos_seguros")
        .select(`
          *,
          monotributistas(id, apellido_nombre, cuit, telefono, email)
        `)
        .order("fecha_vencimiento", { ascending: true });

      if (error) throw error;
      setInsurances(data || []);
    } catch (err: any) {
      toast.error("Error al cargar seguros: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle Tab Switch
  useEffect(() => {
    setSearchQuery("");
    setSelectedCampaignId(null);
    setSelectedCampaign(null);
    if (activeTab === "revision") {
      loadPendingDocs();
    } else if (activeTab === "campanas") {
      loadCampaigns();
    } else if (activeTab === "seguros") {
      loadInsurances();
    }
  }, [activeTab]);

  const loadCampaignDetailData = async (campaignId: string) => {
    setLoadingAnalytics(true);
    try {
      // Find campaign info from campaigns list or fetch it
      const campInfo = campaigns.find((c) => c.id === campaignId);
      setSelectedCampaign(campInfo || null);

      // 1. Fetch deliveries for this campaign
      const { data: dels, error: delsErr } = await supabase
        .from("campana_entregas")
        .select("*")
        .eq("campana_id", campaignId);

      if (delsErr) throw delsErr;
      const fetchedDels = dels || [];

      // 2. Fetch subsecretarias, areas, and responsables
      const { data: subsData } = await supabase.from("subsecretarias").select("id, nombre").eq("activa", true);
      const { data: areasData } = await supabase.from("areas").select("id, nombre, subsecretaria_id").eq("activa", true);
      const { data: respsData } = await supabase.from("responsables").select("id, nombre_completo").eq("activo", true);

      setSubsecretarias(subsData || []);
      setAreas(areasData || []);
      setResponsables(respsData || []);

      const becarioIds = fetchedDels.filter((d) => d.tipo_persona === "becario").map((d) => d.persona_id);
      const monotributistaIds = fetchedDels.filter((d) => d.tipo_persona === "monotributista").map((d) => d.persona_id);

      const resolvedBecarios: Record<string, any> = {};
      const resolvedMonotributistas: Record<string, any> = {};

      if (becarioIds.length > 0) {
        const { data: bData } = await supabase
          .from("becarios")
          .select("id, apellido_nombre, cuit, dni, subsecretaria_id, area_id, responsable_id")
          .in("id", becarioIds);
        bData?.forEach((b) => {
          resolvedBecarios[b.id] = b;
        });
      }

      if (monotributistaIds.length > 0) {
        const { data: mData } = await supabase
          .from("monotributistas")
          .select("id, apellido_nombre, cuit, dni, subsecretaria_id, area_id, responsable_id")
          .in("id", monotributistaIds);
        mData?.forEach((m) => {
          resolvedMonotributistas[m.id] = m;
        });
      }

      // 3. Fetch related documents to check for "es_turno"
      const allPersonaIds = [...becarioIds, ...monotributistaIds];
      const resolvedDocs: Record<string, any[]> = {};
      
      if (allPersonaIds.length > 0) {
        const { data: docsData } = await supabase
          .from("documentos")
          .select("id, persona_id, tipo_documento, es_turno, fecha_turno, estado_revision")
          .in("persona_id", allPersonaIds);
        
        docsData?.forEach((doc) => {
          if (!resolvedDocs[doc.persona_id]) {
            resolvedDocs[doc.persona_id] = [];
          }
          resolvedDocs[doc.persona_id].push(doc);
        });
      }

      // 4. Map everything together
      const mappedDeliveries = fetchedDels.map((del) => {
        const person = del.tipo_persona === "becario" ? resolvedBecarios[del.persona_id] : resolvedMonotributistas[del.persona_id];
        const personDocs = resolvedDocs[del.persona_id] || [];

        // Check if they uploaded appointment voucher for criminal record
        const antecedentesDoc = personDocs.find((d) => d.tipo_documento === "antecedentes_penales");
        const hasTurn = antecedentesDoc?.es_turno || false;
        const turnDate = antecedentesDoc?.fecha_turno || null;

        // Compute dynamic delivery status
        let status = del.estado_entrega;
        if (hasTurn && turnDate) {
          const tDate = new Date(turnDate + "T00:00:00");
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (tDate >= today) {
            status = "turno_activo";
          } else {
            status = "turno_vencido";
          }
        }

        return {
          ...del,
          personName: person?.apellido_nombre || "Persona Desconocida",
          cuit: person?.cuit || person?.dni || "-",
          subsecretariaId: person?.subsecretaria_id || null,
          areaId: person?.area_id || null,
          responsableId: person?.responsable_id || null,
          hasTurn,
          turnDate,
          computedStatus: status,
        };
      });

      setDeliveries(mappedDeliveries);
    } catch (err: any) {
      toast.error("Error al cargar detalles de la campaña: " + err.message);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const filteredAreasOptions = useMemo(() => {
    if (analyticsSub === "all") return areas;
    return areas.filter((a) => a.subsecretaria_id === analyticsSub);
  }, [areas, analyticsSub]);

  // Group deliveries by subsecretaria
  const subsecretariaStats = useMemo(() => {
    if (deliveries.length === 0) return [];
    
    const groups: Record<string, { total: number; approved: number; turns: number }> = {};
    
    deliveries.forEach((del) => {
      const subId = del.subsecretariaId || "other";
      if (!groups[subId]) {
        groups[subId] = { total: 0, approved: 0, turns: 0 };
      }
      groups[subId].total += 1;
      if (del.estado_entrega === "entregado") {
        groups[subId].approved += 1;
      }
      if (del.hasTurn) {
        groups[subId].turns += 1;
      }
    });

    return Object.entries(groups).map(([subId, stat]) => {
      const subName = subsecretarias.find((s) => s.id === subId)?.nombre || "Sin Subsecretaría";
      return {
        id: subId,
        nombre: subName,
        total: stat.total,
        approved: stat.approved,
        turns: stat.turns,
        percentage: stat.total > 0 ? (stat.approved / stat.total) * 100 : 0,
      };
    }).sort((a, b) => b.percentage - a.percentage);
  }, [deliveries, subsecretarias]);

  // Group deliveries by responsable
  const responsableStats = useMemo(() => {
    if (deliveries.length === 0) return [];

    const groups: Record<string, { total: number; approved: number; turns: number }> = {};
    
    deliveries.forEach((del) => {
      const respId = del.responsableId || "other";
      if (!groups[respId]) {
        groups[respId] = { total: 0, approved: 0, turns: 0 };
      }
      groups[respId].total += 1;
      if (del.estado_entrega === "entregado") {
        groups[respId].approved += 1;
      }
      if (del.hasTurn) {
        groups[respId].turns += 1;
      }
    });

    return Object.entries(groups).map(([respId, stat]) => {
      const respName = responsables.find((r) => r.id === respId)?.nombre_completo || "Sin Responsable";
      return {
        id: respId,
        nombre: respName,
        total: stat.total,
        approved: stat.approved,
        turns: stat.turns,
        percentage: stat.total > 0 ? (stat.approved / stat.total) * 100 : 0,
      };
    }).sort((a, b) => b.percentage - a.percentage);
  }, [deliveries, responsables]);

  // Analytics KPI Metrics
  const analyticsKpis = useMemo(() => {
    const total = deliveries.length;
    const approved = deliveries.filter((d) => d.estado_entrega === "entregado").length;
    const pending = deliveries.filter((d) => d.estado_entrega === "pendiente").length;
    const rejected = deliveries.filter((d) => d.estado_entrega === "rechazado").length;
    
    // Turnos
    const totalTurns = deliveries.filter((d) => d.hasTurn).length;
    const activeTurns = deliveries.filter((d) => d.computedStatus === "turno_activo").length;
    const expiredTurns = deliveries.filter((d) => d.computedStatus === "turno_vencido").length;

    return {
      total,
      approved,
      approvedPct: total > 0 ? (approved / total) * 100 : 0,
      pending,
      pendingPct: total > 0 ? (pending / total) * 100 : 0,
      rejected,
      rejectedPct: total > 0 ? (rejected / total) * 100 : 0,
      totalTurns,
      activeTurns,
      expiredTurns,
    };
  }, [deliveries]);

  // Analytics Filtering
  const filteredAnalyticsDeliveries = useMemo(() => {
    return deliveries.filter((d) => {
      // 1. Text Search (name/cuit)
      if (analyticsSearch.trim() !== "") {
        const query = analyticsSearch.toLowerCase();
        if (!d.personName.toLowerCase().includes(query) && !d.cuit.includes(query)) {
          return false;
        }
      }

      // 2. Subsecretaría
      if (analyticsSub !== "all" && d.subsecretariaId !== analyticsSub) {
        return false;
      }

      // 3. Área
      if (analyticsArea !== "all" && d.areaId !== analyticsArea) {
        return false;
      }

      // 4. Responsable
      if (analyticsResp !== "all" && d.responsableId !== analyticsResp) {
        return false;
      }

      // 5. Status
      if (analyticsStatus !== "all") {
        if (analyticsStatus === "entregado" && d.estado_entrega !== "entregado") return false;
        if (analyticsStatus === "pendiente" && d.estado_entrega !== "pendiente") return false;
        if (analyticsStatus === "rechazado" && d.estado_entrega !== "rechazado") return false;
        if (analyticsStatus === "turno_activo" && d.computedStatus !== "turno_activo") return false;
        if (analyticsStatus === "turno_vencido" && d.computedStatus !== "turno_vencido") return false;
        if (analyticsStatus === "con_turno" && !d.hasTurn) return false;
      }

      return true;
    });
  }, [deliveries, analyticsSearch, analyticsSub, analyticsArea, analyticsResp, analyticsStatus]);

  // Render Campaign Analytics View
  const renderAnalyticsDashboard = () => {
    if (loadingAnalytics) {
      return (
        <div className={styles.loadingSpinner}>
          <Loader2 className={styles.spin} size={48} />
          <p>Cargando analíticas de la campaña...</p>
        </div>
      );
    }

    if (!selectedCampaign) return null;

    // Pagination
    const totalItems = filteredAnalyticsDeliveries.length;
    const totalPages = Math.ceil(totalItems / analyticsItemsPerPage) || 1;
    const startIndex = (analyticsPage - 1) * analyticsItemsPerPage;
    const paginatedDeliveries = filteredAnalyticsDeliveries.slice(startIndex, startIndex + analyticsItemsPerPage);

    const handlePageChange = (newPage: number) => {
      if (newPage >= 1 && newPage <= totalPages) {
        setAnalyticsPage(newPage);
      }
    };

    return (
      <div className={styles.analyticsWrapper}>
        {/* Detail Header */}
        <div className={styles.analyticsHeaderGroup}>
          <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
            <button
              onClick={() => setSelectedCampaignId(null)}
              className={styles.backBtn}
            >
              <ArrowLeft size={16} />
              <span>Volver a Campañas</span>
            </button>

            <button
              onClick={() => {
                const url = `${window.location.origin}/publico/campanas/${selectedCampaign.id}`;
                navigator.clipboard.writeText(url);
                toast.success("¡Enlace del portal copiado al portapapeles!");
              }}
              className={styles.backBtn}
              style={{
                borderColor: "rgba(6, 182, 212, 0.3)",
                color: "#06b6d4",
                background: "rgba(6, 182, 212, 0.05)",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px"
              }}
            >
              <Link size={14} />
              <span>Copiar Enlace Portal</span>
            </button>
          </div>
          
          <div className={styles.analyticsHeaderTitle}>
            <h2>{selectedCampaign.nombre}</h2>
            <p>{selectedCampaign.descripcion || "Sin descripción"}</p>
          </div>
        </div>

        {/* KPIs Cards */}
        <div className={styles.kpiGrid}>
          <div className={`${styles.kpiCard} ${styles.kpiCard_total}`}>
            <div className={styles.kpiInfo}>
              <span className={styles.kpiLabel}>Total Cobertura</span>
              <span className={styles.kpiValue}>{analyticsKpis.total}</span>
            </div>
            <div className={styles.kpiIcon}>
              <User size={20} />
            </div>
          </div>

          <div className={`${styles.kpiCard} ${styles.kpiCard_approved}`}>
            <div className={styles.kpiInfo}>
              <span className={styles.kpiLabel}>Entregados (Aprobados)</span>
              <span className={styles.kpiValue}>{analyticsKpis.approved}</span>
              <span className={styles.kpiSubtext}>{analyticsKpis.approvedPct.toFixed(1)}% del total</span>
            </div>
            <div className={styles.kpiIcon}>
              <CheckCircle size={20} />
            </div>
          </div>

          <div className={`${styles.kpiCard} ${styles.kpiCard_pending}`}>
            <div className={styles.kpiInfo}>
              <span className={styles.kpiLabel}>Pendientes</span>
              <span className={styles.kpiValue}>{analyticsKpis.pending}</span>
              <span className={styles.kpiSubtext}>{analyticsKpis.pendingPct.toFixed(1)}% del total</span>
            </div>
            <div className={styles.kpiIcon}>
              <Clock size={20} />
            </div>
          </div>

          <div className={`${styles.kpiCard} ${styles.kpiCard_turno}`}>
            <div className={styles.kpiInfo}>
              <span className={styles.kpiLabel}>Turnos Presentados</span>
              <span className={styles.kpiValue}>{analyticsKpis.totalTurns}</span>
              <span className={styles.kpiSubtext}>
                {analyticsKpis.activeTurns} activos / {analyticsKpis.expiredTurns} vencidos
              </span>
            </div>
            <div className={styles.kpiIcon}>
              <Calendar size={20} />
            </div>
          </div>
        </div>

        {/* Compliance Charts */}
        <div className={styles.chartsRow}>
          {/* Subsecretarías Chart */}
          <div className={`${styles.chartCard} glass-panel`}>
            <div className={styles.chartHeader}>
              <BarChart3 size={18} />
              <h3>Cumplimiento por Subsecretaría</h3>
            </div>
            <div className={styles.barList}>
              {subsecretariaStats.slice(0, 5).map((stat) => {
                let colorClass = styles.barFill_red;
                if (stat.percentage >= 80) colorClass = styles.barFill_green;
                else if (stat.percentage >= 40) colorClass = styles.barFill_yellow;

                return (
                  <div
                    key={stat.id}
                    className={styles.barRow}
                    onClick={() => {
                      setAnalyticsSub(stat.id);
                      setAnalyticsPage(1);
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <div className={styles.barLabelGroup}>
                      <span className={styles.barName}>{stat.nombre}</span>
                      <span className={styles.barValue}>
                        {stat.approved}/{stat.total} ({stat.percentage.toFixed(0)}%)
                      </span>
                    </div>
                    <div className={styles.barTrack}>
                      <div
                        className={`${styles.barFill} ${colorClass}`}
                        style={{ width: `${stat.percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {subsecretariaStats.length === 0 && (
                <p className="text-secondary text-center">Sin datos de subsecretarías</p>
              )}
            </div>
          </div>

          {/* Responsables Chart */}
          <div className={`${styles.chartCard} glass-panel`}>
            <div className={styles.chartHeader}>
              <BarChart3 size={18} />
              <h3>Cumplimiento por Responsable (Top 5)</h3>
            </div>
            <div className={styles.barList}>
              {responsableStats.slice(0, 5).map((stat) => {
                let colorClass = styles.barFill_red;
                if (stat.percentage >= 80) colorClass = styles.barFill_green;
                else if (stat.percentage >= 40) colorClass = styles.barFill_yellow;

                return (
                  <div
                    key={stat.id}
                    className={styles.barRow}
                    onClick={() => {
                      setAnalyticsResp(stat.id);
                      setAnalyticsPage(1);
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <div className={styles.barLabelGroup}>
                      <span className={styles.barName}>{stat.nombre}</span>
                      <span className={styles.barValue}>
                        {stat.approved}/{stat.total} ({stat.percentage.toFixed(0)}%)
                      </span>
                    </div>
                    <div className={styles.barTrack}>
                      <div
                        className={`${styles.barFill} ${colorClass}`}
                        style={{ width: `${stat.percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {responsableStats.length === 0 && (
                <p className="text-secondary text-center">Sin datos de responsables</p>
              )}
            </div>
          </div>
        </div>

        {/* Filters and Table */}
        <div className={`${styles.tableWrapper} glass-panel`}>
          <div className={styles.tableHeaderGroup}>
            <h3>Desglose de Agentes y Entregas</h3>
            <p className="text-secondary">Audite el estado del legajo individual para cada agente afectado.</p>
          </div>

          {/* Filters Bar */}
          <div className={styles.analyticsFiltersBar}>
            <div className={styles.searchGroup}>
              <Search className={styles.searchIcon} size={16} />
              <input
                type="text"
                placeholder="Buscar por agente o CUIL..."
                value={analyticsSearch}
                onChange={(e) => {
                  setAnalyticsSearch(e.target.value);
                  setAnalyticsPage(1);
                }}
                className={styles.searchInput}
              />
            </div>

            <select
              value={analyticsSub}
              onChange={(e) => {
                setAnalyticsSub(e.target.value);
                setAnalyticsArea("all");
                setAnalyticsPage(1);
              }}
              className={styles.filterSelect}
            >
              <option value="all">Subsecretarías: Todas</option>
              {subsecretarias.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>

            <select
              value={analyticsArea}
              onChange={(e) => {
                setAnalyticsArea(e.target.value);
                setAnalyticsPage(1);
              }}
              className={styles.filterSelect}
              disabled={analyticsSub === "all"}
            >
              <option value="all">Áreas: Todas</option>
              {filteredAreasOptions.map((a) => (
                <option key={a.id} value={a.id}>{a.nombre}</option>
              ))}
            </select>

            <select
              value={analyticsResp}
              onChange={(e) => {
                setAnalyticsResp(e.target.value);
                setAnalyticsPage(1);
              }}
              className={styles.filterSelect}
            >
              <option value="all">Responsables: Todos</option>
              {responsables.map((r) => (
                <option key={r.id} value={r.id}>{r.nombre_completo}</option>
              ))}
            </select>

            <select
              value={analyticsStatus}
              onChange={(e) => {
                setAnalyticsStatus(e.target.value);
                setAnalyticsPage(1);
              }}
              className={styles.filterSelect}
            >
              <option value="all">Estado: Todos</option>
              <option value="entregado">Entregado (Aprobado)</option>
              <option value="pendiente">Pendiente sin Turno</option>
              <option value="con_turno">Con Turno Creado</option>
              <option value="turno_activo">Turno Activo (Vigente)</option>
              <option value="turno_vencido">Turno Vencido (Reclamar)</option>
              <option value="rechazado">Rechazado</option>
            </select>
          </div>

          {/* Table */}
          <div className={styles.tableResponsive}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Agente</th>
                  <th>Tipo</th>
                  <th>Subsecretaría / Área</th>
                  <th>Responsable</th>
                  <th>Estado Entrega</th>
                  <th>Detalle / Turno</th>
                </tr>
              </thead>
              <tbody>
                {paginatedDeliveries.map((del) => {
                  let statusBadge = <StatusBadge status="pendiente" />;
                  if (del.estado_entrega === "entregado") {
                    statusBadge = <StatusBadge status="Activo" />;
                  } else if (del.estado_entrega === "rechazado") {
                    statusBadge = <StatusBadge status="Baja" />;
                  } else if (del.computedStatus === "turno_activo") {
                    statusBadge = <span className={`${styles.badge} ${styles.badge_turno_activo}`}>Turno Activo</span>;
                  } else if (del.computedStatus === "turno_vencido") {
                    statusBadge = <span className={`${styles.badge} ${styles.badge_turno_vencido}`}>Turno Vencido</span>;
                  }

                  const subName = subsecretarias.find((s) => s.id === del.subsecretariaId)?.nombre || "-";
                  const areaName = areas.find((a) => a.id === del.areaId)?.nombre || "-";
                  const respName = responsables.find((r) => r.id === del.responsableId)?.nombre_completo || "-";

                  return (
                    <tr key={del.id}>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span className="font-semibold">{del.personName}</span>
                          <span className="text-secondary mono" style={{ fontSize: "12px" }}>CUIL: {del.cuit}</span>
                        </div>
                      </td>
                      <td style={{ textTransform: "capitalize" }}>{del.tipo_persona}</td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "13px" }}>
                          <span>{subName}</span>
                          <span className="text-secondary">{areaName}</span>
                        </div>
                      </td>
                      <td>{respName}</td>
                      <td>{statusBadge}</td>
                      <td>
                        {del.hasTurn && del.turnDate ? (
                          <div style={{ display: "flex", flexDirection: "column", fontSize: "12px", gap: "2px" }}>
                            <span className="font-semibold text-amber">Turno: {new Date(del.turnDate + "T00:00:00").toLocaleDateString("es-AR")}</span>
                            {del.computedStatus === "turno_vencido" && (
                              <span className="text-rose font-bold" style={{ textTransform: "uppercase", fontSize: "10.5px" }}>⚠️ Reclamar Legajo</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-secondary">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {totalItems === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "40px" }}>
                      <span className="text-secondary">No se encontraron registros coincidentes.</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className={styles.pagination}>
              <span className={styles.paginationInfo}>
                Mostrando {startIndex + 1} a {Math.min(startIndex + analyticsItemsPerPage, totalItems)} de {totalItems} registros
              </span>
              <div className={styles.paginationButtons}>
                <button
                  className={styles.paginationBtn}
                  onClick={() => handlePageChange(analyticsPage - 1)}
                  disabled={analyticsPage === 1}
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  className={styles.paginationBtn}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "14px",
                    fontWeight: "600",
                    pointerEvents: "none",
                    border: "none",
                    background: "none"
                  }}
                >
                  {analyticsPage} / {totalPages}
                </button>
                <button
                  className={styles.paginationBtn}
                  onClick={() => handlePageChange(analyticsPage + 1)}
                  disabled={analyticsPage === totalPages}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };


  // Approve Document
  const handleApprove = async (docId: string) => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/campanas/revision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documento_id: docId,
          estado_revision: "aprobado",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al aprobar documento");

      toast.success("Documento aprobado correctamente.");
      await loadPendingDocs();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Open Rejection Dialog
  const handleOpenReject = (docId: string) => {
    setRejectingDocId(docId);
    setRejectionReason("");
    setIsRejectOpen(true);
  };

  // Submit Rejection
  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingDocId || !rejectionReason.trim()) {
      toast.error("El motivo de rechazo es obligatorio.");
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch("/api/campanas/revision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documento_id: rejectingDocId,
          estado_revision: "rechazado",
          observaciones_revision: rejectionReason,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al rechazar documento");

      toast.success("Documento rechazado con observaciones.");
      setIsRejectOpen(false);
      await loadPendingDocs();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Create Campaign Submit
  const onSubmitCampaign = async (values: CampaignFormValues) => {
    setSavingCampaign(true);
    try {
      const payload = {
        nombre: values.nombre,
        descripcion: values.descripcion,
        aplica_a: values.aplica_a,
        fecha_inicio: values.fecha_inicio,
        fecha_limite: values.fecha_limite,
        tipo_documentos_requeridos: values.documentos_requeridos,
      };

      const res = await fetch("/api/campanas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al crear campaña");

      toast.success(`Campaña creada. Hojas de control generadas para ${data.count} personas.`);
      setIsCampOpen(false);
      resetCampForm();
      await loadCampaigns();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingCampaign(false);
    }
  };

  // Handle document required checkboxes toggling
  const handleDocCheckboxChange = (code: string, checked: boolean) => {
    const current = [...watchRequiredDocs];
    if (checked) {
      current.push(code);
    } else {
      const idx = current.indexOf(code);
      if (idx > -1) current.splice(idx, 1);
    }
    setValue("documentos_requeridos", current, { shouldValidate: true });
  };

  // Get label for document type code
  const getDocLabel = (code: string) => {
    return REQUIRED_DOCS.find((d) => d.code === code)?.label || code;
  };

  // Search filter for lists
  const filteredPendingDocs = useMemo(() => {
    return pendingDocs.filter((d) => {
      const name = d.becarios?.apellido_nombre || d.monotributistas?.apellido_nombre || "";
      const cuit = d.becarios?.cuit || d.monotributistas?.cuit || "";
      return (
        name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cuit.includes(searchQuery)
      );
    });
  }, [pendingDocs, searchQuery]);

  const filteredInsurances = useMemo(() => {
    return insurances.filter((v) => {
      const name = v.monotributistas?.apellido_nombre || "";
      const cuit = v.monotributistas?.cuit || "";
      return (
        name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cuit.includes(searchQuery)
      );
    });
  }, [insurances, searchQuery]);

  return (
    <div className={styles.container}>
      <Toaster position="top-right" richColors />

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTitleGroup}>
          <h1>Gestión Documental</h1>
          <p className="text-secondary">
            Administre las carpetas obligatorias del personal, apruebe archivos y configure campañas de actualización.
          </p>
        </div>

        {activeTab === "campanas" && (
          <button onClick={() => setIsCampOpen(true)} className={styles.primaryBtn}>
            <Plus size={16} />
            <span>Crear Campaña</span>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className={styles.tabContainer}>
        <button
          onClick={() => setActiveTab("revision")}
          className={`${styles.tabBtn} ${activeTab === "revision" ? styles.activeTab : ""}`}
        >
          <FileCheck size={16} />
          <span>Bandeja de Aprobaciones ({pendingDocs.length})</span>
        </button>
        <button
          onClick={() => setActiveTab("campanas")}
          className={`${styles.tabBtn} ${activeTab === "campanas" ? styles.activeTab : ""}`}
        >
          <FolderOpen size={16} />
          <span>Campañas de Documentos ({campaigns.length})</span>
        </button>
        <button
          onClick={() => setActiveTab("seguros")}
          className={`${styles.tabBtn} ${activeTab === "seguros" ? styles.activeTab : ""}`}
        >
          <ShieldCheck size={16} />
          <span>Vencimiento de Seguros ({insurances.length})</span>
        </button>
      </div>

      {/* Search Filter for revision and insurance tables */}
      {(activeTab === "revision" || activeTab === "seguros") && (
        <div className={styles.searchBar} style={{ position: "relative", maxWidth: "400px" }}>
          <input
            type="text"
            placeholder="Buscar por persona o CUIL..."
            className="input-field"
            style={{ paddingLeft: "36px", width: "100%" }}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Search
            size={16}
            className="text-muted"
            style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)" }}
          />
        </div>
      )}

      {loading ? (
        <div className={styles.loadingSpinner}>
          <Loader2 className={styles.spin} size={48} />
          <p>Cargando información documental...</p>
        </div>
      ) : (
        <>
          {/* TAB 1: REVISION INBOX */}
          {activeTab === "revision" && (
            <div className={styles.inboxList}>
              {filteredPendingDocs.length === 0 ? (
                <div className={styles.emptyState}>
                  <CheckCircle size={48} className="text-emerald" />
                  <h3>Bandeja de aprobación vacía</h3>
                  <p>No hay documentos pendientes de revisión en este momento.</p>
                </div>
              ) : (
                filteredPendingDocs.map((doc) => {
                  const person = doc.becarios || doc.monotributistas;
                  const name = person?.apellido_nombre || "Desconocido";
                  const cuit = person?.cuit || "-";
                  const typeLabel = doc.tipo_persona === "becario" ? "Becario" : "Monotributista";

                  return (
                    <div key={doc.id} className={styles.inboxCard}>
                      <div className={styles.docMeta}>
                        <div className={styles.docIconWrapper}>
                          <FolderOpen size={20} />
                        </div>
                        <div className={styles.docInfo}>
                          <span className={styles.docName}>{getDocLabel(doc.tipo_documento)}</span>
                          <span className={styles.personSubtext}>
                            Presentado por <strong>{name}</strong> ({typeLabel} - CUIL: {cuit})
                          </span>
                          {doc.fecha_vencimiento && (
                            <span className="mono text-rose" style={{ fontSize: "11.5px", fontWeight: "600" }}>
                              Vence: {new Date(doc.fecha_vencimiento).toLocaleDateString("es-AR")}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className={styles.docActions}>
                        {(doc.url_google_drive || doc.url_supabase) && (
                          <a
                            href={doc.url_google_drive || doc.url_supabase}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.viewLink}
                            style={{ marginRight: "16px" }}
                          >
                            <Eye size={16} style={{ display: "inline", marginRight: "4px", verticalAlign: "middle" }} />
                            <span>Ver Archivo</span>
                          </a>
                        )}

                        <button
                          onClick={() => handleApprove(doc.id)}
                          className={styles.successBtn}
                          disabled={actionLoading}
                        >
                          <Check size={14} />
                          <span>Aprobar</span>
                        </button>

                        <button
                          onClick={() => handleOpenReject(doc.id)}
                          className={styles.dangerBtn}
                          disabled={actionLoading}
                        >
                          <X size={14} />
                          <span>Rechazar</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 2: CAMPAIGNS LIST / ANALYTICS */}
          {activeTab === "campanas" && (
            selectedCampaignId ? (
              renderAnalyticsDashboard()
            ) : (
              <div className={styles.campaignGrid}>
                {campaigns.length === 0 ? (
                  <div className={styles.emptyState} style={{ gridColumn: "span 3" }}>
                    <Calendar size={48} className="text-muted" />
                    <h3>Sin campañas activas</h3>
                    <p>No se registran campañas de actualización documental creadas.</p>
                  </div>
                ) : (
                  campaigns.map((camp) => (
                    <div
                      key={camp.id}
                      className={styles.campaignCard}
                      onClick={() => {
                        setSelectedCampaignId(camp.id);
                        loadCampaignDetailData(camp.id);
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      <div className={styles.campHeader}>
                        <div className={styles.campTitleGroup}>
                          <h3>{camp.nombre}</h3>
                          <p>{camp.descripcion || "Sin descripción proporcionada."}</p>
                        </div>
                        <span className={`${styles.statusBadge} ${styles[`statusBadge_${camp.estado}`]}`}>
                          {camp.estado}
                        </span>
                      </div>

                      <div className={styles.campStats}>
                        <div>
                          <span className={styles.statVal}>{camp.stats.total}</span>
                          <span className={styles.statLabel}>Alcance</span>
                        </div>
                        <div>
                          <span className={styles.statVal} style={{ color: "#10b981" }}>{camp.stats.approved}</span>
                          <span className={styles.statLabel}>Completos</span>
                        </div>
                        <div>
                          <span className={styles.statVal} style={{ color: "#f59e0b" }}>{camp.stats.pending}</span>
                          <span className={styles.statLabel}>Pendientes</span>
                        </div>
                      </div>

                      <div className={styles.progressWrapper}>
                        <div className={styles.progressLabelGroup}>
                          <span className={styles.amountLabel}>Avance de Presentaciones</span>
                          <span className={styles.progressPct}>{camp.stats.progress.toFixed(0)}%</span>
                        </div>
                        <div className={styles.progressBarBg}>
                          <div
                            className={styles.progressBar}
                            style={{ width: `${camp.stats.progress}%` }}
                          />
                        </div>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12.5px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span className={styles.amountLabel}>Lanzamiento</span>
                          <span className="mono">{new Date(camp.fecha_inicio).toLocaleDateString("es-AR")}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span className={styles.amountLabel}>Fecha Límite</span>
                          <span className="mono font-semibold text-rose">
                            {new Date(camp.fecha_limite).toLocaleDateString("es-AR")}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const url = `${window.location.origin}/publico/campanas/${camp.id}`;
                          navigator.clipboard.writeText(url);
                          toast.success("¡Enlace del portal copiado al portapapeles!");
                        }}
                        style={{
                          width: "100%",
                          padding: "10px",
                          marginTop: "12px",
                          background: "rgba(6, 182, 212, 0.08)",
                          border: "1px solid rgba(6, 182, 212, 0.2)",
                          borderRadius: "8px",
                          color: "#06b6d4",
                          fontWeight: "600",
                          fontSize: "13px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "8px",
                          cursor: "pointer",
                          transition: "all 0.2s ease"
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgba(6, 182, 212, 0.15)";
                          e.currentTarget.style.borderColor = "rgba(6, 182, 212, 0.4)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "rgba(6, 182, 212, 0.08)";
                          e.currentTarget.style.borderColor = "rgba(6, 182, 212, 0.2)";
                        }}
                      >
                        <Link size={14} />
                        <span>Copiar Enlace Portal</span>
                      </button>
                    </div>
                  ))
                )}
              </div>
            )
          )}

          {/* TAB 3: INSURANCE TABLE */}
          {activeTab === "seguros" && (
            <div className={styles.insuranceTableWrapper}>
              <div className={styles.tableResponsive}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Monotributista</th>
                      <th>CUIL / CUIT</th>
                      <th>Contacto</th>
                      <th>Vencimiento de Seguro</th>
                      <th>Días Restantes</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInsurances.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: "center", padding: "40px" }}>
                          <span className="text-secondary">No se registran seguros cargados.</span>
                        </td>
                      </tr>
                    ) : (
                      filteredInsurances.map((v) => {
                        const m = v.monotributistas;
                        const name = m?.apellido_nombre || "Desconocido";
                        const cuit = m?.cuit || "-";
                        
                        const diffTime = new Date(v.fecha_vencimiento).getTime() - new Date().getTime();
                        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                        // Semaphoric Badge
                        let statusText = "Vigente";
                        let badgeClass = "activo";

                        if (days <= 0) {
                          statusText = "Vencido";
                          badgeClass = "baja";
                        } else if (days <= 30) {
                          statusText = "Por Vencer";
                          badgeClass = "pendiente";
                        }

                        return (
                          <tr key={v.id}>
                            <td className="font-semibold">{name}</td>
                            <td className="mono">{cuit}</td>
                            <td>
                              <div style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "12.5px" }}>
                                {m?.telefono && (
                                  <span>
                                    <Phone size={12} style={{ display: "inline", marginRight: "4px" }} />
                                    {m.telefono}
                                  </span>
                                )}
                                {m?.email && (
                                  <span className="text-secondary">
                                    <Mail size={12} style={{ display: "inline", marginRight: "4px" }} />
                                    {m.email}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="mono font-semibold">
                              {new Date(v.fecha_vencimiento).toLocaleDateString("es-AR")}
                            </td>
                            <td className="mono font-bold">
                              {days <= 0 ? (
                                <span className="text-rose">Expiró hace {-days} días</span>
                              ) : (
                                <span>{days} días</span>
                              )}
                            </td>
                            <td>
                              <StatusBadge status={statusText} />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Drawer: Create Campaign */}
      <Drawer isOpen={isCampOpen} onClose={() => setIsCampOpen(false)} title="Crear Campaña de Documentos" size="lg">
        <form onSubmit={handleSubmit(onSubmitCampaign)} className={styles.drawerForm}>
          <div className={styles.formGroup}>
            <label>Nombre de la Campaña *</label>
            <input
              type="text"
              placeholder="Ej. Actualización Legajo Primer Semestre 2026"
              className="input-field"
              {...register("nombre")}
            />
            {errors.nombre && <span className={styles.formError}>{errors.nombre.message}</span>}
          </div>

          <div className={styles.formGroup}>
            <label>Descripción / Objetivo</label>
            <textarea
              placeholder="Describa el alcance u objetivo de la campaña..."
              className="input-field"
              rows={3}
              style={{ resize: "vertical" }}
              {...register("descripcion")}
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Alcance del Personal *</label>
              <select className="input-field" {...register("aplica_a")}>
                <option value="ambos">Ambos (Becarios y Monotributistas)</option>
                <option value="becarios">Sólo Becarios</option>
                <option value="monotributistas">Sólo Monotributistas</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label>Fecha Límite de Presentación *</label>
              <input type="date" className="input-field" {...register("fecha_limite")} />
              {errors.fecha_limite && <span className={styles.formError}>{errors.fecha_limite.message}</span>}
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Seleccionar Documentos Obligatorios a Solicitar *</label>
            <div className={styles.checkboxList}>
              {availableDocs.map((doc) => {
                const checked = watchRequiredDocs.includes(doc.code);
                return (
                  <label key={doc.code} className={styles.checkboxItem}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => handleDocCheckboxChange(doc.code, e.target.checked)}
                    />
                    <span>{doc.label}</span>
                  </label>
                );
              })}
            </div>
            {errors.documentos_requeridos && (
              <span className={styles.formError}>{errors.documentos_requeridos.message}</span>
            )}
          </div>

          <div className={styles.formActions}>
            <button
              type="button"
              onClick={() => setIsCampOpen(false)}
              className={styles.secondaryBtn}
              disabled={savingCampaign}
            >
              Cancelar
            </button>
            <button type="submit" className={styles.primaryBtn} disabled={savingCampaign}>
              {savingCampaign ? (
                <>
                  <Loader2 className={styles.spin} size={14} />
                  <span>Creando Campaña...</span>
                </>
              ) : (
                <span>Lanzar Campaña</span>
              )}
            </button>
          </div>
        </form>
      </Drawer>

      {/* Modal/Drawer: Rejection Reason */}
      <Drawer isOpen={isRejectOpen} onClose={() => setIsRejectOpen(false)} title="Rechazar Documentación" size="md">
        <form onSubmit={handleRejectSubmit} className={styles.rejectionForm}>
          <div className={styles.formGroup}>
            <label>Indique el motivo del rechazo u observación *</label>
            <textarea
              placeholder="Ej. El archivo se encuentra borroso o el certificado de antecedentes penales no corresponde a la provincia de Córdoba..."
              className="input-field"
              rows={6}
              style={{ resize: "vertical" }}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
            />
          </div>

          <div className={styles.formActions}>
            <button
              type="button"
              onClick={() => setIsRejectOpen(false)}
              className={styles.secondaryBtn}
              disabled={actionLoading}
            >
              Cancelar
            </button>
            <button type="submit" className={styles.dangerBtn} disabled={actionLoading}>
              {actionLoading ? (
                <>
                  <Loader2 className={styles.spin} size={14} />
                  <span>Rechazando...</span>
                </>
              ) : (
                <span>Confirmar Rechazo</span>
              )}
            </button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
