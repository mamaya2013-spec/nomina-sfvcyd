"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Phone,
  Mail,
  User,
  CreditCard,
  Building2,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Tag,
  Plus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast, Toaster } from "sonner";
import StatusBadge from "@/components/ui/StatusBadge";
import { useSemester } from "@/lib/contexts/SemesterContext";
import Drawer from "@/components/ui/Drawer";
import styles from "./monotributista-detail.module.css";

interface DetailProps {
  id: string;
}

const REQUIRED_DOCS = [
  { code: "antecedentes_penales", label: "Certificado de Antecedentes Penales (Cba)" },
  { code: "delitos_sexuales", label: "Certificado contra Delitos Sexuales (Ley 9680)" },
  { code: "ddjj_prestacion", label: "Declaración Jurada de Prestación de Servicios" },
  { code: "titulo_estudios", label: "Copia de Título de Últimos Estudios" },
  { code: "copia_dni_mono", label: "Copia de DNI" },
  { code: "seguro_vigente", label: "Copia de Seguro Vigente (Monotributo)" },
  { code: "constancia_arca", label: "Copia de Constancia de ARCA" },
];

export default function MonotributistaDetailClient({ id }: DetailProps) {
  const supabase = createClient();
  const router = useRouter();

  // Loading & Data states
  const [person, setPerson] = useState<any | null>(null);
  const [movements, setMovements] = useState<any[]>([]);
  const [amountHistory, setAmountHistory] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Navigation states
  const [activeTab, setActiveTab] = useState<"general" | "historial" | "documentacion">("general");

  const { selectedSemester } = useSemester();

  // Document Upload States
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fechaEmision, setFechaEmision] = useState("");
  const [fechaVencimiento, setFechaVencimiento] = useState("");
  const [esTurno, setEsTurno] = useState(false);
  const [fechaTurno, setFechaTurno] = useState("");
  const [uploading, setUploading] = useState(false);

  // Tags Drawer States
  const [isTagDrawerOpen, setIsTagDrawerOpen] = useState(false);
  const [allTags, setAllTags] = useState<any[]>([]);

  const fetchAllTags = async () => {
    try {
      const { data } = await supabase.from("tags").select("*").order("nombre");
      setAllTags(data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (isTagDrawerOpen) {
      fetchAllTags();
    }
  }, [isTagDrawerOpen]);

  const handleOpenUpload = (docCode: string) => {
    setUploadingType(docCode);
    setSelectedFile(null);
    setFechaEmision("");
    setFechaVencimiento("");
    setEsTurno(false);
    setFechaTurno("");
    setIsUploadOpen(true);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !uploadingType) {
      toast.error("Debe seleccionar un archivo para cargar.");
      return;
    }

    if (uploadingType === "seguro_vigente" && !fechaVencimiento) {
      toast.error("La fecha de vencimiento es obligatoria para el seguro vigente.");
      return;
    }

    if (esTurno && !fechaTurno) {
      toast.error("La fecha del turno es obligatoria.");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("persona_id", id);
      formData.append("tipo_persona", "monotributista");
      formData.append("tipo_documento", uploadingType);
      
      if (esTurno) {
        formData.append("es_turno", "true");
        formData.append("fecha_turno", fechaTurno);
      } else {
        formData.append("fecha_emision", fechaEmision);
        formData.append("fecha_vencimiento", fechaVencimiento);
      }

      const res = await fetch("/api/documentos/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al cargar el documento");

      toast.success("Documento cargado con éxito.");
      setIsUploadOpen(false);
      await fetchDetailData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  const fetchDetailData = async () => {
    if (!selectedSemester) return;
    setLoading(true);
    try {
      if (selectedSemester.bloqueado) {
        // Fetch from snapshot
        const { data: snapshot, error: snapErr } = await supabase
          .from("snapshots_semestre")
          .select("*")
          .eq("semestre_id", selectedSemester.id)
          .maybeSingle();

        if (snapErr) throw snapErr;

        if (snapshot && snapshot.nomina_monos_snapshot) {
          const list = snapshot.nomina_monos_snapshot as any[];
          const p = list.find((m: any) => m.id === id);
          if (p) {
            // Join category from snapshot if missing
            if (!p.categorias_monotributistas && p.categoria_mono_id && snapshot.categorias_monos_snapshot) {
              const cat = (snapshot.categorias_monos_snapshot as any[]).find(
                (c: any) => c.id === p.categoria_mono_id
              );
              if (cat) {
                p.categorias_monotributistas = cat;
              }
            }
            setPerson(p);
          } else {
            toast.error("No se encontró al monotributista en el snapshot de este semestre cerrado.");
          }
        }
      } else {
        // 1. Fetch person data
        const { data: p, error: pErr } = await supabase
          .from("monotributistas")
          .select(`
            *,
            subsecretarias(id, nombre),
            areas(id, nombre),
            responsables(id, nombre_completo, telefono, email, cargo),
            categorias_monotributistas(id, letra, monto, total, porcentaje_activa)
          `)
          .eq("id", id)
          .single();

        if (pErr) throw pErr;
        setPerson(p);
      }

      // 2. Fetch movements (always available globally)
      const { data: movs } = await supabase
        .from("movimientos")
        .select("*")
        .eq("persona_id", id)
        .eq("tipo_persona", "monotributista")
        .order("created_at", { ascending: false });
      setMovements(movs || []);

      // 3. Fetch amount history
      const { data: hist } = await supabase
        .from("historial_montos")
        .select("*")
        .eq("persona_id", id)
        .eq("tipo_persona", "monotributista")
        .order("anio", { ascending: false })
        .order("mes", { ascending: false });
      setAmountHistory(hist || []);

      // 4. Fetch documents
      const { data: docs } = await supabase
        .from("documentos")
        .select("*")
        .eq("persona_id", id)
        .eq("tipo_persona", "monotributista");
      setDocuments(docs || []);

      // 5. Fetch associated tags
      const { data: pt } = await supabase
        .from("persona_tags")
        .select(`
          id,
          tags(id, nombre, color)
        `)
        .eq("persona_id", id)
        .eq("tipo_persona", "monotributista");
      setTags(pt?.map((item: any) => item.tags) || []);

    } catch (err: any) {
      toast.error("Error al cargar la ficha: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSemester) {
      fetchDetailData();
    }
  }, [id, selectedSemester]);

  // Document checklist status resolver
  const documentChecklist = useMemo(() => {
    return REQUIRED_DOCS.map((req) => {
      const doc = documents.find((d) => d.tipo_documento === req.code);
      return {
        ...req,
        uploaded: !!doc,
        status: doc ? doc.estado_revision : "pendiente",
        fileName: doc ? doc.nombre_archivo : null,
        url: doc ? (doc.url_google_drive || doc.url_supabase) : null,
        updatedAt: doc ? doc.created_at : null,
        esTurno: doc ? doc.es_turno : false,
        fechaTurno: doc ? doc.fecha_turno : null,
      };
    });
  }, [documents]);

  if (loading) {
    return (
      <div className={styles.loadingSpinner}>
        <Loader2 className={styles.spin} size={48} />
        <p>Cargando ficha de monotributista...</p>
      </div>
    );
  }

  if (!person) {
    return (
      <div className={`${styles.notFound} glass-panel`}>
        <AlertCircle size={48} className="text-rose" />
        <h2>Ficha no encontrada</h2>
        <p>No se pudo localizar el monotributista solicitado en el sistema.</p>
        <button onClick={() => router.push("/dashboard/monotributistas")} className={styles.backBtn}>
          <ArrowLeft size={16} />
          <span>Volver a la nómina</span>
        </button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Toaster position="top-right" richColors />

      {/* Header and Back navigation */}
      <div className={styles.header}>
        <button onClick={() => router.push("/dashboard/monotributistas")} className={styles.backBtn}>
          <ArrowLeft size={16} />
          <span>Volver a la nómina</span>
        </button>

        <div className={styles.personHeaderGroup}>
          <div className={styles.personTitleInfo}>
            <h1>{person.apellido_nombre}</h1>
            <div className={styles.badgesRow}>
              <StatusBadge status={person.estado} />
              <span className={styles.cuitBadge}>CUIL: {person.cuit}</span>
              <span className={styles.dniBadge}>DNI: {person.dni}</span>
            </div>
          </div>

          {person.estado === "Baja" && (
            <div className={styles.bajaAlert}>
              <AlertCircle size={18} />
              <span>
                Dado de Baja el {new Date(person.fecha_baja).toLocaleDateString("es-AR")} (Motivo: {person.motivo_baja})
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Main Grid: Left Side Navigation and Right Side detail content */}
      <div className={styles.mainGrid}>
        
        {/* Left Side: Summary Card & Tags */}
        <div className={styles.leftColumn}>
          <div className={`${styles.infoCard} glass-panel`}>
            <h2>Resumen Laboral</h2>
            
            <div className={styles.infoRow}>
              <Building2 size={16} />
              <div>
                <span className={styles.infoLabel}>Subsecretaría</span>
                <span className={styles.infoVal}>{person.subsecretarias?.nombre || "-"}</span>
              </div>
            </div>

            <div className={styles.infoRow}>
              <User size={16} />
              <div>
                <span className={styles.infoLabel}>Área de Prestación</span>
                <span className={styles.infoVal}>{person.areas?.nombre || "-"}</span>
              </div>
            </div>

            <div className={styles.infoRow}>
              <Clock size={16} />
              <div>
                <span className={styles.infoLabel}>Fecha de Alta</span>
                <span className={styles.infoVal}>
                  {new Date(person.fecha_alta).toLocaleDateString("es-AR")}
                </span>
              </div>
            </div>

            <div className={styles.infoRow}>
              <CreditCard size={16} />
              <div>
                <span className={styles.infoLabel}>Monto Mensual Base</span>
                <span className={`${styles.infoVal} mono font-semibold text-emerald`}>
                  ${Number(person.importe_mensual_monotributo).toLocaleString("es-AR")}
                </span>
              </div>
            </div>

            <div className={styles.infoRow}>
              <CreditCard size={16} />
              <div>
                <span className={styles.infoLabel}>Tarjeta Activa ({person.categorias_monotributistas?.porcentaje_activa ?? 10}%)</span>
                <span className={`${styles.infoVal} mono`}>
                  + ${Number(person.importe_tarjeta_activa).toLocaleString("es-AR")}
                </span>
              </div>
            </div>

            <div className={`${styles.infoRow} ${styles.infoRowTotal}`}>
              <div style={{ marginLeft: "28px" }}>
                <span className={styles.infoLabel}>Importe Total Liquidado</span>
                <span className={`${styles.infoVal} mono font-bold text-emerald`} style={{ fontSize: "18px" }}>
                  ${Number(person.importe_total).toLocaleString("es-AR")}
                </span>
              </div>
            </div>
          </div>

          {/* Tags Panel */}
          <div className={`${styles.tagsCard} glass-panel`}>
            <div className={styles.tagsHeader}>
              <Tag size={16} />
              <h2>Etiquetas (Tags)</h2>
              {!selectedSemester?.bloqueado && (
                <button
                  className={styles.manageTagsBtn}
                  onClick={() => setIsTagDrawerOpen(true)}
                  title="Administrar etiquetas"
                >
                  <Plus size={14} />
                </button>
              )}
            </div>
            <div className={styles.tagsList}>
              {tags.length === 0 ? (
                <span className={styles.noTags}>Sin etiquetas asignadas</span>
              ) : (
                tags.map((t) => (
                  <span
                    key={t.id}
                    className={styles.tag}
                    style={{ background: `${t.color}20`, borderColor: t.color, color: t.color }}
                  >
                    {t.nombre}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Side Content Pane */}
        <div className={styles.rightColumn}>
          {/* Tab Selector */}
          <div className={`${styles.tabs} glass-panel`}>
            <button
              className={`${styles.tabBtn} ${activeTab === "general" ? styles.activeTab : ""}`}
              onClick={() => setActiveTab("general")}
            >
              Datos Generales
            </button>
            <button
              className={`${styles.tabBtn} ${activeTab === "historial" ? styles.activeTab : ""}`}
              onClick={() => setActiveTab("historial")}
            >
              Historial de Cambios
            </button>
            <button
              className={`${styles.tabBtn} ${activeTab === "documentacion" ? styles.activeTab : ""}`}
              onClick={() => setActiveTab("documentacion")}
            >
              Checklist Documentos
            </button>
          </div>

          {/* Tab Content 1: General Info */}
          {activeTab === "general" && (
            <div className={styles.tabContentGrid}>
              
              {/* Personal Data Card */}
              <div className={`${styles.detailCard} glass-panel`}>
                <h3>Información Personal</h3>
                <div className={styles.detailGrid}>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Nacionalidad</span>
                    <span className={styles.detailVal}>{person.nacionalidad || "-"}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Fecha de Nacimiento</span>
                    <span className={styles.detailVal}>
                      {person.fecha_nacimiento
                        ? new Date(person.fecha_nacimiento).toLocaleDateString("es-AR")
                        : "-"}
                    </span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Teléfono</span>
                    <span className={styles.detailVal}>
                      <Phone size={14} style={{ display: "inline", marginRight: "6px" }} />
                      {person.telefono || "-"}
                    </span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Correo Electrónico</span>
                    <span className={styles.detailVal}>
                      <Mail size={14} style={{ display: "inline", marginRight: "6px" }} />
                      {person.email || "-"}
                    </span>
                  </div>
                </div>

                <h4 className={styles.sectionDivider}>Cuentas y Facturación</h4>
                <div className={styles.detailGrid}>
                  <div className={styles.detailItem} style={{ gridColumn: "span 2" }}>
                    <span className={styles.detailLabel}>CBU Bancario</span>
                    <span className="mono font-semibold" style={{ fontSize: "14px" }}>
                      {person.cbu || "No Registrado"}
                    </span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Nro Tarjeta Activa</span>
                    <span className="mono">{person.tarjeta_activa_nro || "-"}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Categoría ARCA</span>
                    <span className={styles.categoryLabel}>
                      Letra {person.categorias_monotributistas?.letra || "-"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Domicilio Card */}
              <div className={`${styles.detailCard} glass-panel`}>
                <h3>Domicilio Registrado</h3>
                <div className={styles.detailGrid}>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Provincia</span>
                    <span className={styles.detailVal}>{person.provincia || "-"}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Localidad</span>
                    <span className={styles.detailVal}>{person.localidad || "-"}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Barrio</span>
                    <span className={styles.detailVal}>{person.barrio || "-"}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>C.P.</span>
                    <span className="mono">{person.codigo_postal || "-"}</span>
                  </div>
                  <div className={styles.detailItem} style={{ gridColumn: "span 2" }}>
                    <span className={styles.detailLabel}>Dirección (Calle, Nro, Piso, Depto)</span>
                    <span className={styles.detailVal}>
                      {person.calle || "-"} {person.nro || ""} 
                      {person.piso ? `, Piso ${person.piso}` : ""} 
                      {person.depto ? ` Depto ${person.depto}` : ""}
                    </span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Lote</span>
                    <span className="mono">{person.lote || "-"}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Manzana</span>
                    <span className="mono">{person.manzana || "-"}</span>
                  </div>
                </div>
              </div>

              {/* Responsable Card */}
              <div className={`${styles.detailCard} glass-panel`} style={{ gridColumn: "span 2" }}>
                <h3>Responsable a Cargo</h3>
                {person.responsables ? (
                  <div className={styles.respCardGrid}>
                    <div className={styles.respInfo}>
                      <span className={styles.respName}>{person.responsables.nombre_completo}</span>
                      <span className={styles.respCargo}>{person.responsables.cargo || "Responsable de Área"}</span>
                    </div>
                    <div className={styles.respContact}>
                      <div>
                        <Phone size={14} />
                        <span>{person.responsables.telefono || "Sin teléfono"}</span>
                      </div>
                      <div>
                        <Mail size={14} />
                        <span>{person.responsables.email || "Sin correo"}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-secondary" style={{ padding: "10px 0" }}>
                    No hay un responsable asociado a este monotributista.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Tab Content 2: History and Movements */}
          {activeTab === "historial" && (
            <div className={styles.tabContentFlex}>
              
              {/* Movements Timeline */}
              <div className={`${styles.detailCard} glass-panel`}>
                <h3>Línea de Tiempo de Movimientos</h3>
                <div className={styles.timelineContainer}>
                  {movements.length === 0 ? (
                    <p className="text-secondary" style={{ padding: "20px 0" }}>
                      No se registran movimientos para esta persona.
                    </p>
                  ) : (
                    <div className={styles.timeline}>
                      {movements.map((mov) => (
                        <div key={mov.id} className={styles.timelineItem}>
                          <div className={styles.timelineMarker} />
                          <div className={styles.timelineContent}>
                            <span className={styles.timelineDate}>
                              {new Date(mov.created_at).toLocaleDateString("es-AR")} - {mov.mes}/{mov.anio}
                            </span>
                            <span className={styles.timelineTitle}>{mov.tipo_movimiento.toUpperCase()}</span>
                            <p className={styles.timelineDesc}>{mov.descripcion}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Monthly Amount Changes */}
              <div className={`${styles.detailCard} glass-panel`}>
                <h3>Historial de Montos Cobrados</h3>
                <div className={styles.tableResponsive}>
                  <table className={styles.table} style={{ fontSize: "13.5px" }}>
                    <thead>
                      <tr>
                        <th>Período</th>
                        <th>Categoría Anterior</th>
                        <th>Categoría Nueva</th>
                        <th>Monto Anterior</th>
                        <th>Monto Nuevo</th>
                        <th>Variación</th>
                      </tr>
                    </thead>
                    <tbody>
                      {amountHistory.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: "center", padding: "20px" }}>
                            No hay registros de cambios de montos mensuales.
                          </td>
                        </tr>
                      ) : (
                        amountHistory.map((h) => {
                          const diff = Number(h.total_nuevo) - Number(h.total_anterior);
                          return (
                            <tr key={h.id}>
                              <td className="mono font-semibold">
                                {h.mes.toString().padStart(2, "0")}/{h.anio}
                              </td>
                              <td>{h.categoria_anterior || "-"}</td>
                              <td>{h.categoria_nueva || "-"}</td>
                              <td className="mono">${Number(h.total_anterior).toLocaleString("es-AR")}</td>
                              <td className="mono font-bold text-emerald">${Number(h.total_nuevo).toLocaleString("es-AR")}</td>
                              <td className={`mono font-semibold ${diff > 0 ? "text-emerald" : "text-rose"}`}>
                                {diff > 0 ? "+" : ""}${diff.toLocaleString("es-AR")}
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

          {/* Tab Content 3: Document Checklist */}
          {activeTab === "documentacion" && (
            <div className={`${styles.detailCard} glass-panel`}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3>Carpeta de Documentos Obligatorios</h3>
                <span className={styles.docCount}>
                  {documents.length} de {REQUIRED_DOCS.length} presentados
                </span>
              </div>

              <div className={styles.checklist}>
                {documentChecklist.map((doc, idx) => (
                  <div key={idx} className={`${styles.checklistItem} glass-panel`}>
                    <div className={styles.checkIconWrapper}>
                      {doc.uploaded ? (
                        doc.status === "aprobado" ? (
                          <CheckCircle2 size={24} className="text-emerald" />
                        ) : doc.status === "rechazado" ? (
                          <XCircle size={24} className="text-rose" />
                        ) : (
                          <Clock size={24} className="text-amber" />
                        )
                      ) : (
                        <AlertCircle size={24} className="text-muted" />
                      )}
                    </div>

                    <div className={styles.checkContent}>
                      <span className={styles.checkLabel}>{doc.label}</span>
                      {doc.uploaded ? (
                        <div className={styles.checkFileInfo}>
                          <span className={styles.checkFileName}>{doc.fileName}</span>
                          <span className={styles.checkFileDate}>
                            Subido el {new Date(doc.updatedAt).toLocaleDateString("es-AR")}
                          </span>
                          {doc.esTurno && doc.fechaTurno && (
                            <span className="text-amber" style={{ fontSize: "11.5px", fontWeight: "600", display: "block", marginTop: "4px" }}>
                              📅 Comprobante de Turno - Cita: {new Date(doc.fechaTurno + "T00:00:00").toLocaleDateString("es-AR")}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className={styles.checkFileMissing}>Documento no presentado</span>
                      )}
                    </div>

                    <div className={styles.checkActions}>
                      {doc.uploaded ? (
                        <>
                          <span className={`${styles.docStatusBadge} ${styles[doc.status]}`}>
                            {doc.status}
                          </span>
                          {doc.url && (
                            <a
                              href={doc.url}
                              target="_blank"
                              rel="noreferrer"
                              className={styles.viewFileLink}
                            >
                              Ver Archivo
                            </a>
                          )}
                        </>
                      ) : (
                        !selectedSemester?.bloqueado && (
                          <button
                            onClick={() => handleOpenUpload(doc.code)}
                            className={styles.uploadBtn}
                          >
                            Subir Archivo
                          </button>
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Upload Document Drawer */}
      <Drawer
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        title={`Cargar Documento: ${REQUIRED_DOCS.find((d) => d.code === uploadingType)?.label || ""}`}
        size="md"
      >
        <form onSubmit={handleUploadSubmit} className={styles.drawerForm} style={{ display: "flex", flexDirection: "column", gap: "20px", padding: "10px 0" }}>
          <div className={styles.formGroup} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-secondary)" }}>
              Seleccionar Archivo (PDF, PNG, JPG) *
            </label>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              required
              style={{
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "8px",
                padding: "10px",
                color: "var(--text-primary)",
                cursor: "pointer",
              }}
            />
          </div>

          {uploadingType === "antecedentes_penales" && (
            <div className={styles.formGroup} style={{ display: "flex", alignItems: "center", gap: "8px", margin: "4px 0" }}>
              <input
                type="checkbox"
                id="esTurno"
                checked={esTurno}
                onChange={(e) => setEsTurno(e.target.checked)}
                style={{ width: "16px", height: "16px", cursor: "pointer" }}
              />
              <label htmlFor="esTurno" style={{ fontSize: "13.5px", fontWeight: "600", color: "var(--text-primary)", cursor: "pointer" }}>
                Presentar Comprobante de Turno
              </label>
            </div>
          )}

          {esTurno ? (
            <div className={styles.formGroup} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-secondary)" }}>
                Fecha del Turno *
              </label>
              <input
                type="date"
                value={fechaTurno}
                onChange={(e) => setFechaTurno(e.target.value)}
                className="input-field"
                required
              />
            </div>
          ) : (
            <>
              <div className={styles.formGroup} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-secondary)" }}>
                  Fecha de Emisión
                </label>
                <input
                  type="date"
                  value={fechaEmision}
                  onChange={(e) => setFechaEmision(e.target.value)}
                  className="input-field"
                />
              </div>

              <div className={styles.formGroup} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-secondary)" }}>
                  Fecha de Vencimiento {uploadingType === "seguro_vigente" ? "*" : ""}
                </label>
                <input
                  type="date"
                  value={fechaVencimiento}
                  onChange={(e) => setFechaVencimiento(e.target.value)}
                  className="input-field"
                  required={uploadingType === "seguro_vigente"}
                />
              </div>
            </>
          )}

          <div className={styles.formActions} style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "10px", borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: "20px" }}>
            <button
              type="button"
              onClick={() => setIsUploadOpen(false)}
              className="secondaryBtn"
              disabled={uploading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="primaryBtn"
              disabled={uploading}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                fontSize: "14px",
                fontWeight: "600",
                borderRadius: "6px",
                cursor: "pointer",
                background: "#06b6d4",
                color: "#ffffff",
                border: "none",
              }}
            >
              {uploading ? (
                <>
                  <Loader2 className={styles.spin} size={14} />
                  <span>Subiendo...</span>
                </>
              ) : (
                <span>Cargar Archivo</span>
              )}
            </button>
          </div>
        </form>
      </Drawer>

      {/* Drawer: Administrar Etiquetas */}
      <Drawer
        isOpen={isTagDrawerOpen}
        onClose={() => setIsTagDrawerOpen(false)}
        title="Administrar Etiquetas"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "16px 0" }}>
          <p className="text-secondary" style={{ fontSize: "13px" }}>
            Seleccione las etiquetas que desea asignar a <strong>{person.apellido_nombre}</strong>:
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "10px" }}>
            {allTags.length === 0 ? (
              <div className="text-secondary" style={{ fontSize: "13px", fontStyle: "italic" }}>
                No hay etiquetas creadas en el sistema. Vaya a Configuración &gt; Etiquetas para crearlas.
              </div>
            ) : (
              allTags.map((tag) => {
                const isAssigned = tags.some((t) => t.id === tag.id);
                return (
                  <label
                    key={tag.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "10px 12px",
                      borderRadius: "6px",
                      background: "rgba(255, 255, 255, 0.02)",
                      border: "1px solid rgba(255, 255, 255, 0.05)",
                      cursor: "pointer",
                      transition: "background 0.2s"
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.02)"}
                  >
                    <input
                      type="checkbox"
                      checked={isAssigned}
                      onChange={async (e) => {
                        try {
                          if (e.target.checked) {
                            // Assign tag
                            await supabase.from("persona_tags").insert({
                              tipo_persona: "monotributista",
                              persona_id: id,
                              tag_id: tag.id
                            });
                          } else {
                            // Unassign tag
                            await supabase.from("persona_tags").delete()
                              .eq("persona_id", id)
                              .eq("tag_id", tag.id);
                          }
                          // Refresh person tags list
                          const { data: pt } = await supabase
                            .from("persona_tags")
                            .select("id, tags(id, nombre, color)")
                            .eq("persona_id", id)
                            .eq("tipo_persona", "monotributista");
                          setTags(pt?.map((item: any) => item.tags) || []);
                          toast.success("Etiqueta actualizada.");
                        } catch (err: any) {
                          toast.error("Error al actualizar etiqueta: " + err.message);
                        }
                      }}
                      style={{ cursor: "pointer" }}
                    />
                    <span
                      style={{
                        padding: "3px 8px",
                        borderRadius: "12px",
                        fontSize: "12px",
                        fontWeight: "600",
                        backgroundColor: tag.color,
                        color: "#fff",
                        textShadow: "0 1px 2px rgba(0,0,0,0.5)"
                      }}
                    >
                      {tag.nombre}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      </Drawer>
    </div>
  );
}
