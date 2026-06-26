"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Search,
  Filter,
  Eye,
  FileSpreadsheet,
  Download,
  Loader2,
  Calendar,
  FolderOpen,
  ArrowLeft,
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  Phone,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react";
import { useSemester } from "@/lib/contexts/SemesterContext";
import { usePortalFilter } from "@/lib/contexts/PortalFilterContext";
import { usePortalAuth } from "@/lib/contexts/PortalAuthContext";
import { motion, AnimatePresence } from "framer-motion";
import styles from "./campanas.module.css";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import "jspdf-autotable";

interface Campaign {
  id: string;
  nombre: string;
  descripcion?: string;
  fecha_inicio: string;
  fecha_fin: string;
  tipo_documentos_requeridos: string[];
  activa: boolean;
  stats: {
    total: number;
    approved: number;
    incomplete: number;
    pending: number;
    progress: number;
  };
}

interface Delivery {
  id: string;
  persona_id: string;
  nombre_persona: string;
  tipo_persona: string;
  subsecretaria_nombre: string;
  area_nombre: string;
  estado_entrega: "entregado" | "incompleto" | "pendiente";
  docChecklist: {
    code: string;
    status: "aprobado" | "pendiente" | "rechazado" | "faltante";
    url: string | null;
  }[];
}

interface GeneralDocument {
  id: string;
  persona_id: string;
  tipo_persona: string;
  nombre_persona: string;
  subsecretaria_nombre: string;
  area_nombre: string;
  nombre_archivo: string;
  tipo_documento: string;
  url_supabase: string | null;
  url_google_drive: string | null;
  estado_revision: "pendiente" | "aprobado" | "rechazado";
  created_at: string;
}

const DOCUMENT_LABELS: Record<string, string> = {
  copia_dni_bec: "Copia de DNI",
  constancia_cuil: "Constancia de CUIL",
  antecedentes_penales: "Certificado Antecedentes",
  delitos_sexuales: "Certificado Delitos Sexuales",
  ddjj_prestacion: "Declaración Jurada",
  titulo_estudios: "Título de Estudios",
  constancia_arca: "Constancia ARCA",
  seguro_vida: "Seguro de Vida",
};

export default function PortalCampanasPage() {
  const { user } = usePortalAuth();
  const { selectedSemester } = useSemester();
  const { selectedSubsecretariaId, selectedAreaId } = usePortalFilter();

  const [activeTab, setActiveTab] = useState<"campanas" | "legajos">("campanas");
  
  // Tab 1: Campaigns States
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [campaignDetail, setCampaignDetail] = useState<Campaign | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [expandedDeliveryId, setExpandedDeliveryId] = useState<string | null>(null);
  
  // Tab 2: Legajo General States
  const [generalDocs, setGeneralDocs] = useState<GeneralDocument[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filterEstado, setFilterEstado] = useState("all");
  const [filterTipoPersona, setFilterTipoPersona] = useState("all");

  // Load Campaigns or Legajo Docs
  useEffect(() => {
    if (!selectedSemester) return;
    
    if (activeTab === "campanas" && !selectedCampaignId) {
      loadCampaigns();
    } else if (activeTab === "campanas" && selectedCampaignId) {
      loadCampaignDetail(selectedCampaignId);
    } else if (activeTab === "legajos") {
      loadLegajos();
    }
  }, [selectedSemester, selectedSubsecretariaId, selectedAreaId, activeTab, selectedCampaignId]);

  async function loadCampaigns() {
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/campanas`);
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function loadCampaignDetail(id: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/campanas?campana_id=${id}`);
      if (res.ok) {
        const data = await res.json();
        setCampaignDetail(data.campaign);
        setDeliveries(data.deliveries || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function loadLegajos() {
    setLoading(true);
    try {
      const url = `/api/portal/documentos?subsecretaria_id=${selectedSubsecretariaId}&area_id=${selectedAreaId}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setGeneralDocs(data.documentos || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // Back from Campaign Detail
  const handleBackToCampaigns = () => {
    setSelectedCampaignId(null);
    setCampaignDetail(null);
    setDeliveries([]);
    setExpandedDeliveryId(null);
    setSearchTerm("");
    setFilterEstado("all");
  };

  // Group General Docs by Person for Legajo tab
  const legajoGeneralList = useMemo(() => {
    if (activeTab !== "legajos") return [];

    const personMap = new Map<string, {
      id: string;
      nombre: string;
      tipo_persona: string;
      area: string;
      subsecretaria: string;
      docs: Record<string, string>;
      totalApproved: number;
    }>();

    generalDocs.forEach((d) => {
      if (!personMap.has(d.persona_id)) {
        personMap.set(d.persona_id, {
          id: d.persona_id,
          nombre: d.nombre_persona,
          tipo_persona: d.tipo_persona,
          area: d.area_nombre,
          subsecretaria: d.subsecretaria_nombre,
          docs: {},
          totalApproved: 0,
        });
      }
      const p = personMap.get(d.persona_id)!;
      p.docs[d.tipo_documento] = d.estado_revision;
      if (d.estado_revision === "aprobado") {
        p.totalApproved++;
      }
    });

    return Array.from(personMap.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [generalDocs, activeTab]);

  // Filter Deliveries (Campaign Detail)
  const filteredDeliveries = useMemo(() => {
    return deliveries.filter((d) => {
      // Search filter
      if (searchTerm.trim() !== "") {
        const q = searchTerm.toLowerCase().trim();
        if (!d.nombre_persona.toLowerCase().includes(q)) return false;
      }
      // Status filter
      if (filterEstado !== "all" && d.estado_entrega !== filterEstado) return false;
      // Tipo persona filter
      if (filterTipoPersona !== "all" && d.tipo_persona !== filterTipoPersona) return false;
      
      return true;
    });
  }, [deliveries, searchTerm, filterEstado, filterTipoPersona]);

  // Filter Legajo General List
  const filteredLegajos = useMemo(() => {
    return legajoGeneralList.filter((l) => {
      if (searchTerm.trim() !== "") {
        const q = searchTerm.toLowerCase().trim();
        if (!l.nombre.toLowerCase().includes(q)) return false;
      }
      if (filterTipoPersona !== "all" && l.tipo_persona !== filterTipoPersona) return false;
      
      const isComplete = l.tipo_persona === "becario" ? l.totalApproved >= 6 : l.totalApproved >= 7;
      if (filterEstado === "complete" && !isComplete) return false;
      if (filterEstado === "incomplete" && isComplete) return false;

      return true;
    });
  }, [legajoGeneralList, searchTerm, filterTipoPersona, filterEstado]);

  // WhatsApp reminder message builder
  const handleWhatsAppReminder = (name: string, type: string, requiredCodes: string[], docsChecklist: any[]) => {
    // Determine missing docs
    const missing: string[] = [];
    requiredCodes.forEach((code) => {
      const match = docsChecklist.find((d) => d.code === code || d.tipo_documento === code);
      const isOk = match && (match.status === "aprobado" || match.estado_revision === "aprobado");
      if (!isOk) {
        missing.push(DOCUMENT_LABELS[code] || code);
      }
    });

    if (missing.length === 0) return;

    const message = `Hola ${name}! Te recordamos que adeudas la documentación obligatoria de legajo para la Secretaría de Fortalecimiento Vecinal, Cultura y Deportes:\n\n${missing.map((m) => `• ${m}`).join("\n")}\n\nPor favor, preséntala a la brevedad en las oficinas correspondientes. ¡Muchas gracias!`;
    
    // Fallback prompt for phone if not linked directly
    const userPhone = ""; // Direct whatsapp link generator will open it in dynamic UI
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
  };

  // WhatsApp reminder for campaign specifically
  const handleCampaignReminder = (delivery: Delivery) => {
    const missing = delivery.docChecklist
      .filter((d) => d.status === "faltante" || d.status === "rechazado")
      .map((d) => DOCUMENT_LABELS[d.code] || d.code);

    const message = `Hola ${delivery.nombre_persona}! Te contactamos para recordarte que adeudas documentos obligatorios para la campaña '${campaignDetail?.nombre}':\n\n${missing.map((m) => `• ${m}`).join("\n")}\n\nPor favor, presentalos a la brevedad. ¡Muchas gracias!`;
    
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
  };

  // Excel Export Campaign Details
  const exportCampaignExcel = () => {
    if (!campaignDetail) return;
    const headers = ["Nombre", "Tipo", "Subsecretaría", "Área", "Estado Entrega", "Documentos Pendientes"];
    const rows = filteredDeliveries.map((d) => {
      const missing = d.docChecklist
        .filter((c) => c.status === "faltante" || c.status === "rechazado")
        .map((c) => DOCUMENT_LABELS[c.code] || c.code)
        .join(", ");
      return [
        d.nombre_persona,
        d.tipo_persona === "becario" ? "Becario" : "Monotributista",
        d.subsecretaria_nombre,
        d.area_nombre,
        d.estado_entrega.toUpperCase(),
        missing || "NINGUNO (Completo)"
      ];
    });

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Cumplimiento Campaña");
    XLSX.writeFile(workbook, `Campana_${campaignDetail.nombre}_Cumplimiento.xlsx`);
  };

  // PDF Export Campaign Details
  const exportCampaignPDF = () => {
    if (!campaignDetail) return;
    const doc = new jsPDF();

    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 35, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("SECRETARÍA DE FORTALECIMIENTO VECINAL, CULTURA Y DEPORTES", 10, 15);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Campaña: ${campaignDetail.nombre} — Cumplimiento Documental`, 10, 22);
    doc.text(`Área de Auditoría — Responsable: ${user?.nombre_completo || "Ejecutivo"}`, 10, 28);

    const tableHeaders = [["Agente", "Tipo", "Área", "Estado", "Pendientes"]];
    const tableRows = filteredDeliveries.map((d) => {
      const missing = d.docChecklist
        .filter((c) => c.status === "faltante" || c.status === "rechazado")
        .map((c) => DOCUMENT_LABELS[c.code] || c.code)
        .join(", ");
      return [
        d.nombre_persona,
        d.tipo_persona === "becario" ? "Becario" : "Monotributista",
        d.area_nombre,
        d.estado_entrega.toUpperCase(),
        missing || "Ninguno"
      ];
    });

    (doc as any).autoTable({
      head: tableHeaders,
      body: tableRows,
      startY: 45,
      styles: { fontSize: 8.5 },
      headStyles: { fillColor: [15, 23, 42] },
    });

    doc.save(`Campana_${campaignDetail.nombre}_Auditoria.pdf`);
  };

  return (
    <div className={styles.container}>
      {/* Tab Switcher */}
      {!selectedCampaignId && (
        <div className={styles.tabs}>
          <button
            onClick={() => { setActiveTab("campanas"); setSearchTerm(""); }}
            className={`${styles.tabBtn} ${activeTab === "campanas" ? styles.activeTab : ""}`}
          >
            Campañas Activas
          </button>
          <button
            onClick={() => { setActiveTab("legajos"); setSearchTerm(""); }}
            className={`${styles.tabBtn} ${activeTab === "legajos" ? styles.activeTab : ""}`}
          >
            Legajo General de Personal
          </button>
        </div>
      )}

      {/* VIEW 1: Campaigns List */}
      {activeTab === "campanas" && !selectedCampaignId && (
        <>
          {loading ? (
            <div className={styles.loadingState}>
              <Loader2 size={36} className={styles.spinner} />
              <span>Cargando campañas de documentación...</span>
            </div>
          ) : campaigns.length > 0 ? (
            <div className={styles.campaignGrid}>
              {campaigns.map((c) => {
                const isExpired = new Date(c.fecha_fin) < new Date();
                return (
                  <div
                    key={c.id}
                    onClick={() => {
                      setSelectedCampaignId(c.id);
                      loadCampaignDetail(c.id);
                    }}
                    className={`${styles.campaignCard} glass-panel glass-panel-hover`}
                  >
                    <div className={styles.campaignCardHeader}>
                      <div className={styles.campaignMetaGroup}>
                        <h3 className={styles.campaignTitle}>{c.nombre}</h3>
                        <span className={styles.campaignDate}>
                          <Calendar size={12} />
                          Finaliza: {new Date(c.fecha_fin).toLocaleDateString("es-AR")}
                        </span>
                      </div>
                      <span className={`${styles.statusBadge} ${isExpired ? styles.badgeExpired : styles.badgeActive}`}>
                        {isExpired ? "Vencida" : "Activa"}
                      </span>
                    </div>

                    <p className={styles.campaignDesc}>{c.descripcion || "Sin descripción proporcionada."}</p>

                    <div className={styles.progressBarContainer}>
                      <div className={styles.progressBarLabel}>
                        <span>Cumplimiento Nómina</span>
                        <span>{c.stats.progress}%</span>
                      </div>
                      <div className={styles.progressBar}>
                        <div
                          className={styles.progressFill}
                          style={{ width: `${c.stats.progress}%` }}
                        />
                      </div>
                    </div>

                    <div className={styles.campaignFooter}>
                      <span className={styles.campaignFooterItem}>
                        <Users size={14} className="text-secondary" />
                        Nómina: {c.stats.total}
                      </span>
                      <span>
                        Al día: {c.stats.approved} | Pendientes: {c.stats.incomplete + c.stats.pending}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={`${styles.emptyState} glass-panel`}>
              <FolderOpen size={48} className={styles.emptyIcon} />
              <h4>No hay campañas asociadas</h4>
              <p>No se registran campañas de entrega de documentación asignadas a tu personal en este momento.</p>
            </div>
          )}
        </>
      )}

      {/* VIEW 2: Campaign Detail View */}
      {activeTab === "campanas" && selectedCampaignId && campaignDetail && (
        <div className={styles.container}>
          {/* Header */}
          <div className={styles.detailHeader}>
            <button onClick={handleBackToCampaigns} className={styles.backBtn}>
              <ArrowLeft size={16} />
              <span>Volver a Campañas</span>
            </button>
            <div className={styles.detailTitleGroup}>
              <div>
                <h2>{campaignDetail.nombre}</h2>
                <span className={styles.detailSubtitle}>
                  Período Límite: {new Date(campaignDetail.fecha_fin).toLocaleDateString("es-AR")}
                </span>
              </div>
              <span className={`${styles.statusBadge} ${new Date(campaignDetail.fecha_fin) < new Date() ? styles.badgeExpired : styles.badgeActive}`}>
                {new Date(campaignDetail.fecha_fin) < new Date() ? "Vencida" : "Activa"}
              </span>
            </div>
          </div>

          {/* KPIs */}
          <div className={styles.kpiGrid}>
            <div className={`${styles.kpiCard} glass-panel`}>
              <div className={`${styles.kpiIconWrapper} ${styles.blue}`}>
                <Users size={20} />
              </div>
              <div className={styles.kpiInfo}>
                <span className={styles.kpiLabel}>Personas Evaluadas</span>
                <span className={styles.kpiValue}>{campaignDetail.stats.total}</span>
              </div>
            </div>
            <div className={`${styles.kpiCard} glass-panel`}>
              <div className={`${styles.kpiIconWrapper} ${styles.green}`}>
                <CheckCircle2 size={20} />
              </div>
              <div className={styles.kpiInfo}>
                <span className={styles.kpiLabel}>Entregas Completas</span>
                <span className={styles.kpiValue}>{campaignDetail.stats.approved}</span>
              </div>
            </div>
            <div className={`${styles.kpiCard} glass-panel`}>
              <div className={`${styles.kpiIconWrapper} ${styles.yellow}`}>
                <Clock size={20} />
              </div>
              <div className={styles.kpiInfo}>
                <span className={styles.kpiLabel}>Entregas Incompletas</span>
                <span className={styles.kpiValue}>{campaignDetail.stats.incomplete}</span>
              </div>
            </div>
            <div className={`${styles.kpiCard} glass-panel`}>
              <div className={`${styles.kpiIconWrapper} ${styles.red}`}>
                <AlertTriangle size={20} />
              </div>
              <div className={styles.kpiInfo}>
                <span className={styles.kpiLabel}>Sin Entrega (Pendientes)</span>
                <span className={styles.kpiValue}>{campaignDetail.stats.pending}</span>
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className={`${styles.filterBar} glass-panel`}>
            <div className={styles.searchWrapper}>
              <Search size={16} className={styles.searchIcon} />
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Buscar agente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className={styles.filtersGroup}>
              <div className={styles.filterItem}>
                <Filter size={14} className={styles.filterIcon} />
                <select
                  className={styles.filterSelect}
                  value={filterEstado}
                  onChange={(e) => setFilterEstado(e.target.value)}
                >
                  <option value="all">Todos los Estados</option>
                  <option value="entregado">Completados</option>
                  <option value="incompleto">Incompletos</option>
                  <option value="pendiente">Sin Entrega</option>
                </select>
              </div>

              <div className={styles.filterItem}>
                <select
                  className={styles.filterSelect}
                  value={filterTipoPersona}
                  onChange={(e) => setFilterTipoPersona(e.target.value)}
                >
                  <option value="all">Todos los Tipos</option>
                  <option value="becario">Becarios</option>
                  <option value="monotributista">Monotributistas</option>
                </select>
              </div>

              <button onClick={exportCampaignExcel} className={styles.actionBtn} title="Excel">
                <FileSpreadsheet size={16} />
                <span>Excel</span>
              </button>
              <button onClick={exportCampaignPDF} className={styles.actionBtn} title="PDF">
                <Download size={16} />
                <span>PDF</span>
              </button>
            </div>
          </div>

          {/* Deliveries Table */}
          {loading ? (
            <div className={styles.loadingState}>
              <Loader2 size={24} className={styles.spinner} />
              <span>Actualizando lista de entregas...</span>
            </div>
          ) : filteredDeliveries.length > 0 ? (
            <div className={`${styles.tableWrapper} glass-panel`}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Agente</th>
                    <th>Área / Subsecretaría</th>
                    <th>Progreso Documental</th>
                    <th>Estado Entrega</th>
                    <th style={{ width: "100px", textAlign: "center" }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDeliveries.map((delivery) => {
                    const isExpanded = expandedDeliveryId === delivery.id;
                    const requiredDocsCount = campaignDetail.tipo_documentos_requeridos.length;
                    const approvedDocs = delivery.docChecklist.filter((c) => c.status === "aprobado").length;
                    
                    return (
                      <React.Fragment key={delivery.id}>
                        <tr>
                          <td>
                            <span className={styles.agentName}>{delivery.nombre_persona}</span>
                            <span className={styles.agentType}>
                              {delivery.tipo_persona === "becario" ? "🎓 Becario" : "💼 Monotributista"}
                            </span>
                          </td>
                          <td>
                            <div className={styles.areaGroup}>
                              <span className={styles.areaName}>{delivery.area_nombre}</span>
                              <span className={styles.subName}>{delivery.subsecretaria_nombre}</span>
                            </div>
                          </td>
                          <td>
                            <div className={styles.checklistCol}>
                              {campaignDetail.tipo_documentos_requeridos.map((code) => {
                                const doc = delivery.docChecklist.find((d) => d.code === code);
                                const status = doc ? doc.status : "faltante";
                                const statusDotClass = {
                                  aprobado: styles.dotOk,
                                  pendiente: styles.dotPending,
                                  rechazado: styles.dotAlert,
                                  faltante: styles.dotMissing,
                                }[status];

                                return (
                                  <div
                                    key={code}
                                    className={`${styles.checklistDot} ${statusDotClass}`}
                                    title={`${DOCUMENT_LABELS[code] || code}: ${status.toUpperCase()}`}
                                  >
                                    {DOCUMENT_LABELS[code]?.charAt(0) || "D"}
                                  </div>
                                );
                              })}
                              <span style={{ fontSize: "12px", marginLeft: "8px", fontWeight: "600" }}>
                                {approvedDocs} de {requiredDocsCount}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className={`${styles.deliveryBadge} ${
                              delivery.estado_entrega === "entregado" 
                                ? styles.deliveryOk 
                                : delivery.estado_entrega === "incompleto" 
                                  ? styles.deliveryIncomplete 
                                  : styles.deliveryPending
                            }`}>
                              {delivery.estado_entrega === "entregado" 
                                ? "Completado" 
                                : delivery.estado_entrega === "incompleto" 
                                  ? "Incompleto" 
                                  : "Sin Entrega"}
                            </span>
                          </td>
                          <td>
                            <div className={styles.actionsCell}>
                              {delivery.estado_entrega !== "entregado" && (
                                <button
                                  className={styles.whatsappLinkBtn}
                                  title="Enviar recordatorio por WhatsApp"
                                  onClick={() => handleCampaignReminder(delivery)}
                                >
                                  <Phone size={14} />
                                </button>
                              )}
                              <button
                                className={styles.expandBtn}
                                onClick={() => setExpandedDeliveryId(isExpanded ? null : delivery.id)}
                                title={isExpanded ? "Colapsar" : "Expandir Detalles"}
                              >
                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Collapsible Document Checklist Details */}
                        {isExpanded && (
                          <tr className={styles.expandedRow}>
                            <td colSpan={5}>
                              <div className={styles.expandedContent}>
                                <div className={styles.checklistGrid}>
                                  {campaignDetail.tipo_documentos_requeridos.map((code) => {
                                    const doc = delivery.docChecklist.find((d) => d.code === code);
                                    const status = doc ? doc.status : "faltante";
                                    const statusLabel = {
                                      aprobado: "✅ Aprobado",
                                      pendiente: "⏳ Pendiente de revisión",
                                      rechazado: "❌ Rechazado",
                                      faltante: "⚠️ Faltante",
                                    }[status];

                                    return (
                                      <div key={code} className={styles.checklistCard}>
                                        <div className={styles.checklistInfo}>
                                          <div>
                                            <span className={styles.checkTitle}>{DOCUMENT_LABELS[code] || code}</span>
                                            <span className={styles.checkStatus}>{statusLabel}</span>
                                          </div>
                                        </div>
                                        {doc?.url ? (
                                          <a
                                            href={doc.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={styles.downloadLink}
                                          >
                                            Ver Documento
                                          </a>
                                        ) : (
                                          <span className={styles.noLinkText}>No disponible</span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={`${styles.emptyState} glass-panel`}>
              <Info size={32} className={styles.emptyIcon} />
              <h4>No se encontraron entregas</h4>
              <p>Ningún agente cumple con los filtros activos.</p>
            </div>
          )}
        </div>
      )}

      {/* VIEW 3: Legajo General (All Agents consolidated docs) */}
      {activeTab === "legajos" && (
        <div className={styles.container}>
          {/* Filters */}
          <div className={`${styles.filterBar} glass-panel`}>
            <div className={styles.searchWrapper}>
              <Search size={16} className={styles.searchIcon} />
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Buscar por Nombre..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className={styles.filtersGroup}>
              <div className={styles.filterItem}>
                <Filter size={14} className={styles.filterIcon} />
                <select
                  className={styles.filterSelect}
                  value={filterEstado}
                  onChange={(e) => setFilterEstado(e.target.value)}
                >
                  <option value="all">Todos los Legajos</option>
                  <option value="complete">Legajo Completo</option>
                  <option value="incomplete">Legajo Incompleto</option>
                </select>
              </div>

              <div className={styles.filterItem}>
                <select
                  className={styles.filterSelect}
                  value={filterTipoPersona}
                  onChange={(e) => setFilterTipoPersona(e.target.value)}
                >
                  <option value="all">Becas y Monotributo</option>
                  <option value="becario">Becarios</option>
                  <option value="monotributista">Monotributistas</option>
                </select>
              </div>
            </div>
          </div>

          {/* Legajos Grid Table */}
          {loading ? (
            <div className={styles.loadingState}>
              <Loader2 size={32} className={styles.spinner} />
              <span>Auditando legajos de la nómina...</span>
            </div>
          ) : filteredLegajos.length > 0 ? (
            <div className={`${styles.tableWrapper} glass-panel`}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Agente</th>
                    <th>Tipo</th>
                    <th>Subsecretaría / Área</th>
                    <th>Documentos Aprobados</th>
                    <th>Estado Legajo</th>
                    <th style={{ width: "80px", textAlign: "center" }}>Reclamar</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLegajos.map((l) => {
                    const requiredCount = l.tipo_persona === "becario" ? 6 : 8; // Becarios need 6, Monos need 8 typically (or 7)
                    const isComplete = l.totalApproved >= requiredCount;
                    
                    // Build full checklist array
                    const requiredCodes = l.tipo_persona === "becario"
                      ? ["copia_dni_bec", "constancia_cuil", "antecedentes_penales", "delitos_sexuales", "ddjj_prestacion", "titulo_estudios"]
                      : ["copia_dni_bec", "constancia_cuil", "antecedentes_penales", "delitos_sexuales", "ddjj_prestacion", "titulo_estudios", "constancia_arca", "seguro_vida"];

                    const docsChecklist = requiredCodes.map((code) => ({
                      code,
                      status: l.docs[code] || "faltante",
                    }));

                    return (
                      <tr key={l.id}>
                        <td>
                          <span className={styles.agentName}>{l.nombre}</span>
                        </td>
                        <td>
                          <span className={styles.agentType}>
                            {l.tipo_persona === "becario" ? "🎓 Becario" : "💼 Monotributista"}
                          </span>
                        </td>
                        <td>
                          <div className={styles.areaGroup}>
                            <span className={styles.areaName}>{l.area}</span>
                            <span className={styles.subName}>{l.subsecretaria}</span>
                          </div>
                        </td>
                        <td>
                          <div className={styles.checklistCol}>
                            {requiredCodes.map((code) => {
                              const status = l.docs[code] || "faltante";
                              const statusDotClass = {
                                aprobado: styles.dotOk,
                                pendiente: styles.dotPending,
                                rechazado: styles.dotAlert,
                                faltante: styles.dotMissing,
                              }[status];

                              return (
                                <div
                                  key={code}
                                  className={`${styles.checklistDot} ${statusDotClass}`}
                                  title={`${DOCUMENT_LABELS[code] || code}: ${status.toUpperCase()}`}
                                >
                                  {DOCUMENT_LABELS[code]?.charAt(0) || "D"}
                                </div>
                              );
                            })}
                            <span style={{ fontSize: "12.5px", marginLeft: "8px", fontWeight: "600" }}>
                              {l.totalApproved} de {requiredCount}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className={`${styles.deliveryBadge} ${isComplete ? styles.deliveryOk : styles.deliveryIncomplete}`}>
                            {isComplete ? "Legajo Completo" : "Incompleto"}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: "flex", justifyContent: "center" }}>
                            {!isComplete && (
                              <button
                                className={styles.whatsappLinkBtn}
                                title="Reclamar documentación faltante"
                                onClick={() => handleWhatsAppReminder(l.nombre, l.tipo_persona, requiredCodes, docsChecklist)}
                              >
                                <Phone size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={`${styles.emptyState} glass-panel`}>
              <Info size={32} className={styles.emptyIcon} />
              <h4>No se encontraron legajos</h4>
              <p>No existen registros que coincidan con la búsqueda.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
