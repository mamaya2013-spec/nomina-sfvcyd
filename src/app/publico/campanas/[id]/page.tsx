"use client";

import React, { useState, use, DragEvent, ChangeEvent } from "react";
import {
  Search,
  FileText,
  CheckCircle,
  Clock,
  AlertTriangle,
  UploadCloud,
  ArrowLeft,
  Calendar,
  Loader2,
  Check,
  FileCheck
} from "lucide-react";
import { Toaster, toast } from "sonner";
import styles from "./portal.module.css";

const DOC_LABELS: Record<string, string> = {
  antecedentes_penales: "Certificado de Antecedentes Penales (Cba)",
  delitos_sexuales: "Certificado contra Delitos Sexuales (Ley 9680)",
  ddjj_prestacion: "Declaración Jurada de Prestación de Servicios",
  titulo_estudios: "Copia de Título de Últimos Estudios",
  copia_dni_bec: "Copia de DNI",
  copia_dni_mono: "Copia de DNI",
  constancia_cuil: "Constancia de CUIL",
  seguro_vigente: "Copia de Seguro Vigente (Monotributo)",
  constancia_arca: "Copia de Constancia de ARCA",
};

interface Documento {
  id?: string;
  tipo_documento: string;
  nombre_archivo: string;
  estado_revision: "aprobado" | "pendiente" | "rechazado";
  observaciones_revision?: string;
  es_turno?: boolean;
  fecha_turno?: string;
}

interface Agent {
  id: string;
  apellido_nombre: string;
  cuit: string;
  dni: string;
  tipo_persona: "becario" | "monotributista";
  subsecretaria: string;
}

interface Campaign {
  id: string;
  nombre: string;
  descripcion: string;
  fecha_limite: string;
  tipo_documentos_requeridos: string[];
}

export default function PublicCampaignPortalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  // Flow State
  const [dni, setDni] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"dni" | "portal">("dni");
  const [dniError, setDniError] = useState<string | null>(null);

  // Data State
  const [agent, setAgent] = useState<Agent | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [documents, setDocuments] = useState<Documento[]>([]);
  const [delivery, setDelivery] = useState<any | null>(null);

  // UI Interactive States
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [dragActive, setDragActive] = useState<Record<string, boolean>>({});
  const [turnoCheck, setTurnoCheck] = useState<Record<string, boolean>>({});
  const [turnoDate, setTurnoDate] = useState<Record<string, string>>({});

  // 1. Fetch Agent & Documents Data
  const fetchAgentData = async (dniValue: string) => {
    setLoading(true);
    setDniError(null);
    try {
      const res = await fetch(`/api/publico/campanas/${id}?dni=${dniValue.trim()}`);
      const data = await res.json();

      if (!res.ok) {
        setDniError(data.error || "No se pudo validar el DNI.");
        toast.error(data.error || "No se pudo validar el DNI.");
        return false;
      }

      setAgent(data.persona);
      setCampaign(data.campana);
      setDocuments(data.documentos);
      setDelivery(data.entrega);

      // Prepopulate turno status if exists
      const antecedenteDoc = data.documentos.find((d: any) => d.tipo_documento === "antecedentes_penales");
      if (antecedenteDoc) {
        setTurnoCheck((prev) => ({ ...prev, antecedentes_penales: !!antecedenteDoc.es_turno }));
        setTurnoDate((prev) => ({ ...prev, antecedentes_penales: antecedenteDoc.fecha_turno || "" }));
      }

      return true;
    } catch (err: any) {
      console.error(err);
      setDniError("Error de conexión al buscar el DNI.");
      toast.error("Error de conexión al buscar el DNI.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleSearchDNI = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dni.trim()) {
      setDniError("Por favor, ingresá tu DNI.");
      return;
    }
    const success = await fetchAgentData(dni);
    if (success) {
      setStep("portal");
    }
  };

  // 2. Handle File Upload
  const handleUpload = async (docType: string, file: File) => {
    if (!agent) return;

    // Strict PDF check
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      toast.error("Archivo inválido. Sólo se permiten archivos en formato PDF.");
      return;
    }

    const isTurno = !!turnoCheck[docType];
    const dateTurno = turnoDate[docType];

    if (docType === "antecedentes_penales" && isTurno && !dateTurno) {
      toast.error("Por favor, seleccioná la fecha del turno programado.");
      return;
    }

    setUploading((prev) => ({ ...prev, [docType]: true }));

    const formData = new FormData();
    formData.append("file", file);
    formData.append("persona_id", agent.id);
    formData.append("tipo_persona", agent.tipo_persona);
    formData.append("tipo_documento", docType);
    if (docType === "antecedentes_penales" && isTurno) {
      formData.append("es_turno", "true");
      formData.append("fecha_turno", dateTurno);
    }

    try {
      const res = await fetch(`/api/publico/campanas/${id}`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Error al subir el archivo.");
      }

      toast.success(`¡Documento cargado con éxito!`);
      // Refresh to update states in view
      await fetchAgentData(dni);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Ocurrió un error al cargar el archivo.");
    } finally {
      setUploading((prev) => ({ ...prev, [docType]: false }));
    }
  };

  // Drag Events
  const handleDrag = (e: DragEvent, docType: string, active: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive((prev) => ({ ...prev, [docType]: active }));
  };

  const handleDrop = (e: DragEvent, docType: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive((prev) => ({ ...prev, [docType]: false }));

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUpload(docType, e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>, docType: string) => {
    if (e.target.files && e.target.files[0]) {
      handleUpload(docType, e.target.files[0]);
    }
  };

  // Helper translations
  const getDocLabel = (code: string) => {
    return DOC_LABELS[code] || code.replace(/_/g, " ");
  };

  const getDocStatusBadge = (status?: string) => {
    switch (status) {
      case "aprobado":
        return <span className={`${styles.badge} ${styles.badge_aprobado}`}>Aprobado</span>;
      case "pendiente":
        return <span className={`${styles.badge} ${styles.badge_pendiente}`}>Pendiente</span>;
      case "rechazado":
        return <span className={`${styles.badge} ${styles.badge_rechazado}`}>Rechazado</span>;
      default:
        return <span className={`${styles.badge} ${styles.badge_faltante}`}>Faltante</span>;
    }
  };

  // Progress calculations
  const requiredDocs = campaign?.tipo_documentos_requeridos || [];
  const completedDocsCount = requiredDocs.filter((reqType) => {
    const doc = documents.find((d) => d.tipo_documento === reqType);
    return doc && (doc.estado_revision === "aprobado" || doc.estado_revision === "pendiente");
  }).length;
  const progressPercent = requiredDocs.length > 0
    ? Math.round((completedDocsCount / requiredDocs.length) * 100)
    : 0;

  return (
    <div className={styles.portalContainer}>
      <Toaster theme="dark" position="top-right" richColors closeButton />

      {step === "dni" ? (
        <div className={styles.portalCard}>
          <div className={styles.logoWrapper}>
            <img src="/logo_ok.png" alt="Logo Secretaría" className={styles.logo} />
          </div>

          <div className={styles.headerSection}>
            <h1 className={styles.title}>Portal de Actualización Documental</h1>
            <p className={styles.subtitle}>
              Ingresá tu DNI para verificar si tenés solicitudes de documentación pendientes en la campaña activa.
            </p>
          </div>

          <form onSubmit={handleSearchDNI} className={styles.dniForm}>
            <div className={styles.inputGroup}>
              <label htmlFor="dni-input" className={styles.label}>
                Número de DNI
              </label>
              <div className={styles.inputWrapper}>
                <Search size={18} className={styles.inputIcon} />
                <input
                  id="dni-input"
                  type="text"
                  pattern="[0-9]*"
                  inputMode="numeric"
                  placeholder="Ej: 38450123 (Sin puntos ni espacios)"
                  value={dni}
                  onChange={(e) => setDni(e.target.value.replace(/\D/g, ""))}
                  className={styles.input}
                  disabled={loading}
                />
              </div>
              {dniError && <p className={styles.errorText} style={{ fontSize: "13px", marginTop: "4px" }}>{dniError}</p>}
            </div>

            <button type="submit" className={styles.btnSubmit} disabled={loading || !dni.trim()}>
              {loading ? (
                <>
                  <Loader2 size={18} className={styles.spinner} />
                  Verificando identidad...
                </>
              ) : (
                "Ingresar al Portal"
              )}
            </button>
          </form>

          <div className={styles.footerText}>
            © {new Date().getFullYear()} Secretaría de Fortalecimiento Vecinal, Cultura y Deportes.
          </div>
        </div>
      ) : (
        // PORTAL DETAIL VIEW
        <div className={styles.portalCard} style={{ maxWidth: "750px" }}>
          {/* Back button */}
          <button
            onClick={() => {
              setStep("dni");
              setDni("");
              setAgent(null);
              setCampaign(null);
              setDocuments([]);
              setDelivery(null);
            }}
            className={styles.btnBack}
          >
            <ArrowLeft size={16} />
            Volver a identificación
          </button>

          {/* Campaign details */}
          <div className={styles.headerSection} style={{ textAlign: "left" }}>
            <h1 className={styles.title} style={{ fontSize: "22px" }}>
              Campaña: {campaign?.nombre}
            </h1>
            {campaign?.descripcion && <p className={styles.subtitle}>{campaign.descripcion}</p>}
            {campaign?.fecha_limite && (
              <p className={styles.subtitle} style={{ fontSize: "13px", color: "var(--accent-rose)", fontWeight: 600 }}>
                Fecha límite de entrega: {new Date(campaign.fecha_limite).toLocaleDateString("es-AR", { timeZone: "UTC" })}
              </p>
            )}
          </div>

          {/* Agent info */}
          {agent && (
            <div className={styles.agentCard}>
              <div className={styles.agentHeader}>
                <span className={styles.agentName}>{agent.apellido_nombre}</span>
                <span className={styles.agentBadge}>
                  {agent.tipo_persona === "becario" ? "Becario" : "Monotributista"}
                </span>
              </div>
              <div className={styles.agentGrid}>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Subsecretaría / Área</span>
                  <span className={styles.metaValue}>{agent.subsecretaria}</span>
                </div>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>DNI / CUIL</span>
                  <span className={styles.metaValue}>
                    {agent.dni} {agent.cuit !== "-" ? `/ ${agent.cuit}` : ""}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Progress bar */}
          <div className={styles.progressSection}>
            <div className={styles.progressLabelRow}>
              <span>Progreso de Documentación</span>
              <span className={styles.progressLabelValue}>
                {completedDocsCount} de {requiredDocs.length} ({progressPercent}%)
              </span>
            </div>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
            </div>
          </div>

          {/* Documents Required Checklist */}
          <div className={styles.headerSection} style={{ textAlign: "left", gap: "4px" }}>
            <h2 className={styles.title} style={{ fontSize: "18px" }}>
              Documentos Solicitados
            </h2>
            <p className={styles.subtitle} style={{ fontSize: "13px" }}>
              Subí cada archivo individualmente en formato <strong>PDF</strong>. Podés arrastrar y soltar el archivo en la zona punteada.
            </p>
          </div>

          <div className={styles.docGrid}>
            {requiredDocs.map((docType) => {
              const doc = documents.find((d) => d.tipo_documento === docType);
              const status = doc?.estado_revision || "faltante";
              const isUploading = !!uploading[docType];

              return (
                <div
                  key={docType}
                  className={`${styles.docItem} ${styles[`docItem_${status}`]}`}
                >
                  <div className={styles.docHeader}>
                    <div>
                      <h3 className={styles.docTitle}>{getDocLabel(docType)}</h3>
                      {doc?.nombre_archivo && (
                        <p className={styles.subtitle} style={{ fontSize: "12.5px", marginTop: "4px" }}>
                          Archivo cargado: <strong>{doc.nombre_archivo}</strong>
                        </p>
                      )}
                    </div>
                    {getDocStatusBadge(status)}
                  </div>

                  {/* Reject reason details */}
                  {status === "rechazado" && doc?.observaciones_revision && (
                    <div className={styles.rejectedAlert}>
                      <span className={styles.rejectedAlertTitle}>Corrección Solicitada</span>
                      <p>{doc.observaciones_revision}</p>
                    </div>
                  )}

                  {/* Special Antecedentes Penales Voucher handler */}
                  {docType === "antecedentes_penales" && (status === "faltante" || status === "rechazado") && (
                    <div className={styles.turnoBox}>
                      <label className={styles.turnoCheckboxRow}>
                        <input
                          type="checkbox"
                          checked={!!turnoCheck[docType]}
                          onChange={(e) =>
                            setTurnoCheck((prev) => ({ ...prev, [docType]: e.target.checked }))
                          }
                          className={styles.checkbox}
                        />
                        <span className={styles.turnoCheckboxLabel}>
                          ¿No tenés el certificado todavía pero ya tenés comprobante de turno?
                        </span>
                      </label>

                      {turnoCheck[docType] && (
                        <div className={styles.turnoFields}>
                          <label className={styles.label} style={{ fontSize: "11px" }}>
                            Fecha Programada del Turno
                          </label>
                          <input
                            type="date"
                            value={turnoDate[docType] || ""}
                            onChange={(e) =>
                              setTurnoDate((prev) => ({ ...prev, [docType]: e.target.value }))
                            }
                            className={styles.dateInput}
                            min={new Date().toISOString().split("T")[0]}
                          />
                          <p className={styles.dropzoneHelpText} style={{ marginTop: "4px" }}>
                            Subí el comprobante/constancia del turno obtenido en el espacio a continuación.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Drag and Drop Zone / File Info */}
                  {status === "faltante" || status === "rechazado" ? (
                    isUploading ? (
                      <div className={styles.uploadingState}>
                        <Loader2 size={24} className={styles.spinner} />
                        <span className={styles.uploadingText}>Subiendo documento, por favor no cierres el portal...</span>
                      </div>
                    ) : (
                      <div
                        className={`${styles.dropzone} ${
                          dragActive[docType] ? styles.dropzoneActive : ""
                        }`}
                        onDragEnter={(e) => handleDrag(e, docType, true)}
                        onDragOver={(e) => handleDrag(e, docType, true)}
                        onDragLeave={(e) => handleDrag(e, docType, false)}
                        onDrop={(e) => handleDrop(e, docType)}
                        onClick={() => document.getElementById(`file-input-${docType}`)?.click()}
                      >
                        <UploadCloud size={28} className={styles.dropzoneIcon} />
                        <p className={styles.dropzoneText}>
                          {turnoCheck[docType] ? (
                            <>
                              Arrastrá el <span className={styles.dropzoneTextHighlight}>comprobante de turno</span> aquí o hacé click para seleccionarlo
                            </>
                          ) : (
                            <>
                              Arrastrá tu <span className={styles.dropzoneTextHighlight}>PDF</span> aquí o hacé click para buscarlo
                            </>
                          )}
                        </p>
                        <p className={styles.dropzoneHelpText}>Sólo se admiten archivos PDF de hasta 20MB</p>
                        <input
                          id={`file-input-${docType}`}
                          type="file"
                          accept="application/pdf"
                          style={{ display: "none" }}
                          onChange={(e) => handleFileChange(e, docType)}
                        />
                      </div>
                    )
                  ) : status === "pendiente" ? (
                    <div className={styles.successUpload} style={{ background: "rgba(245, 158, 11, 0.05)", borderColor: "rgba(245, 158, 11, 0.15)", color: "#fef3c7" }}>
                      <Clock size={16} style={{ color: "var(--accent-amber)" }} />
                      <span>Listo. Esperando validación del administrador.</span>
                    </div>
                  ) : (
                    <div className={styles.successUpload}>
                      <CheckCircle size={16} style={{ color: "var(--accent-emerald)" }} />
                      <span>Documento verificado y aprobado.</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className={styles.footerText} style={{ marginTop: "32px", borderTop: "1px solid var(--glass-border)", paddingTop: "16px" }}>
            Cualquier inconveniente o duda con la documentación, consultá con tu responsable administrativo.
          </div>
        </div>
      )}
    </div>
  );
}
