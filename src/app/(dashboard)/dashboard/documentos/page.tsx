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
      const { data, error } = await supabase
        .from("documentos")
        .select(`
          *,
          becarios(id, apellido_nombre, cuit),
          monotributistas(id, apellido_nombre, cuit)
        `)
        .eq("estado_revision", "pendiente")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPendingDocs(data || []);
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
    if (activeTab === "revision") {
      loadPendingDocs();
    } else if (activeTab === "campanas") {
      loadCampaigns();
    } else if (activeTab === "seguros") {
      loadInsurances();
    }
  }, [activeTab]);

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
                        {doc.url_supabase && (
                          <a
                            href={doc.url_supabase}
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

          {/* TAB 2: CAMPAIGNS LIST */}
          {activeTab === "campanas" && (
            <div className={styles.campaignGrid}>
              {campaigns.length === 0 ? (
                <div className={styles.emptyState} style={{ gridColumn: "span 3" }}>
                  <Calendar size={48} className="text-muted" />
                  <h3>Sin campañas activas</h3>
                  <p>No se registran campañas de actualización documental creadas.</p>
                </div>
              ) : (
                campaigns.map((camp) => (
                  <div key={camp.id} className={styles.campaignCard}>
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
                  </div>
                ))
              )}
            </div>
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
              className="secondaryBtn"
              disabled={savingCampaign}
            >
              Cancelar
            </button>
            <button type="submit" className="primaryBtn" disabled={savingCampaign}>
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
              className="secondaryBtn"
              disabled={actionLoading}
            >
              Cancelar
            </button>
            <button type="submit" className="dangerBtn" disabled={actionLoading}>
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
