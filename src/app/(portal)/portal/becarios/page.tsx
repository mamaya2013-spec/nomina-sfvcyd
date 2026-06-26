"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Search,
  Filter,
  Eye,
  FileSpreadsheet,
  Download,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Info,
  Calendar,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  Building,
  GraduationCap,
  X,
  CheckCircle2,
  Clock,
  AlertTriangle,
  MinusCircle,
} from "lucide-react";
import { useSemester } from "@/lib/contexts/SemesterContext";
import { usePortalFilter } from "@/lib/contexts/PortalFilterContext";
import { usePortalAuth } from "@/lib/contexts/PortalAuthContext";
import Drawer from "@/components/ui/Drawer";
import styles from "./becarios.module.css";

// XLSX and jsPDF dynamic imports or direct imports
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import "jspdf-autotable";

interface Becario {
  id: string;
  apellido_nombre: string;
  dni: string;
  cuit: string;
  cbu?: string;
  tarjeta_activa_nro?: string;
  telefono?: string;
  email?: string;
  nacionalidad?: string;
  codigo_postal?: string;
  provincia?: string;
  departamento?: string;
  localidad?: string;
  barrio?: string;
  calle?: string;
  nro?: string;
  piso?: string;
  depto?: string;
  lote?: string;
  manzana?: string;
  importe_mensual_beca: number;
  importe_tarjeta_activa: number;
  importe_total: number;
  estado: string;
  fecha_alta: string;
  fecha_baja?: string;
  motivo_baja?: string;
  subsecretaria_nombre: string;
  area_nombre: string;
  documentos_aprobados: number;
  documentos: any[];
}

const BECARIO_REQUIRED_DOCS = [
  { code: "copia_dni_bec", label: "Copia de DNI" },
  { code: "constancia_cuil", label: "Constancia de CUIL" },
  { code: "antecedentes_penales", label: "Certificado de Antecedentes Penales" },
  { code: "delitos_sexuales", label: "Certificado contra Delitos Sexuales" },
  { code: "ddjj_prestacion", label: "Declaración Jurada de Prestación" },
  { code: "titulo_estudios", label: "Copia de Título de Últimos Estudios" },
];

export default function PortalBecariosPage() {
  const { user } = usePortalAuth();
  const { selectedSemester } = useSemester();
  const { selectedSubsecretariaId, selectedAreaId } = usePortalFilter();

  const [becarios, setBecarios] = useState<Becario[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPerson, setSelectedPerson] = useState<Becario | null>(null);

  // Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [filterEstado, setFilterEstado] = useState("Activo");
  const [filterCategory, setFilterCategory] = useState("all");

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  useEffect(() => {
    if (!selectedSemester) return;
    const semestreId = selectedSemester.id;

    async function loadBecarios() {
      setLoading(true);
      try {
        const url = `/api/portal/becarios?semestre_id=${semestreId}&subsecretaria_id=${selectedSubsecretariaId}&area_id=${selectedAreaId}&status=${filterEstado}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setBecarios(data.becarios || []);
        }
      } catch (err) {
        console.error("Error loading becarios:", err);
      } finally {
        setLoading(false);
      }
    }

    loadBecarios();
  }, [selectedSemester, selectedSubsecretariaId, selectedAreaId, filterEstado]);

  // Open drawer if agent id is passed in URL query parameter
  useEffect(() => {
    if (becarios.length === 0 || loading) return;
    const params = new URLSearchParams(window.location.search);
    const agentId = params.get("id");
    if (agentId) {
      const match = becarios.find((b) => b.id === agentId);
      if (match) {
        setSelectedPerson(match);
      }
    }
  }, [becarios, loading]);

  // Derived filter categories
  const categories = useMemo(() => {
    const cats = new Set<string>();
    becarios.forEach((b) => {
      const basic = Number(b.importe_mensual_beca || 0);
      if (basic > 0) cats.add(basic.toString());
    });
    return Array.from(cats).sort((a, b) => Number(a) - Number(b));
  }, [becarios]);

  // Filter list
  const filteredList = useMemo(() => {
    return becarios.filter((b) => {
      // Category filter
      if (filterCategory !== "all") {
        if (Number(b.importe_mensual_beca) !== Number(filterCategory)) {
          return false;
        }
      }

      // Search filter
      if (searchTerm.trim() !== "") {
        const q = searchTerm.toLowerCase().trim();
        return (
          b.apellido_nombre.toLowerCase().includes(q) ||
          b.dni.includes(q) ||
          b.cuit.includes(q)
        );
      }

      return true;
    });
  }, [becarios, searchTerm, filterCategory]);

  // Pagination
  const paginatedList = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredList.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredList, currentPage]);

  const totalPages = Math.ceil(filteredList.length / itemsPerPage);

  // Top Metrics
  const metrics = useMemo(() => {
    const active = becarios.filter((b) => b.estado === "Activo");
    const count = active.length;
    const totalCost = active.reduce((sum, b) => sum + Number(b.importe_total || 0), 0);
    const avgBeca = count > 0 ? totalCost / count : 0;
    
    let completeCount = 0;
    active.forEach((b) => {
      if (b.documentos_aprobados >= 6) completeCount++;
    });
    const completeness = count > 0 ? Math.round((completeCount / count) * 100) : 0;

    return {
      count,
      totalCost,
      avgBeca,
      completeness,
    };
  }, [becarios]);

  // Drawer Legajo State mapping
  const legajoStatus = useMemo(() => {
    if (!selectedPerson) return [];

    return BECARIO_REQUIRED_DOCS.map((req) => {
      const doc = selectedPerson.documentos?.find((d) => d.tipo_documento === req.code);
      let status: "aprobado" | "pendiente" | "rechazado" | "faltante" = "faltante";
      if (doc) {
        status = doc.estado_revision;
      }
      return {
        ...req,
        status,
        docId: doc?.id || null,
        url: doc?.url_google_drive || doc?.url_supabase || null,
        observaciones: doc?.observaciones_revision || "",
      };
    });
  }, [selectedPerson]);

  // WhatsApp Link Generator
  const whatsappLink = useMemo(() => {
    if (!selectedPerson) return "";
    const phone = selectedPerson.telefono || "";
    if (!phone) return "";

    // Get list of missing/rejected docs
    const missing = legajoStatus
      .filter((s) => s.status === "faltante" || s.status === "rechazado")
      .map((s) => s.label);

    if (missing.length === 0) return "";

    const message = `Hola ${selectedPerson.apellido_nombre}! Te contactamos del Portal de la Secretaría. Queremos recordarte que te falta presentar/corregir la siguiente documentación para completar tu legajo: \n\n${missing.map((m) => `• ${m}`).join("\n")}\n\nPor favor, envíala a la brevedad. ¡Muchas gracias!`;
    
    // Format phone: remove non-digits, ensure country code 549
    let cleanPhone = phone.replace(/\D/g, "");
    if (!cleanPhone.startsWith("54")) {
      cleanPhone = "549" + cleanPhone;
    }

    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  }, [selectedPerson, legajoStatus]);

  // Excel Export
  const exportToExcel = () => {
    const headers = [
      "Apellido y Nombre", "DNI", "CUIL/CUIT", "Subsecretaría", "Área",
      "Categoría (Básico)", "Importe Tarjeta Activa", "Importe Total", "CBU", "N° Tarjeta", "Estado", "Fecha Alta"
    ];
    
    const rows = filteredList.map((b) => [
      b.apellido_nombre,
      b.dni,
      b.cuit,
      b.subsecretaria_nombre,
      b.area_nombre,
      b.importe_mensual_beca,
      b.importe_tarjeta_activa,
      b.importe_total,
      b.cbu || "-",
      b.tarjeta_activa_nro || "-",
      b.estado,
      b.fecha_alta ? new Date(b.fecha_alta).toLocaleDateString("es-AR") : "-"
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Becarios");
    
    // Auto-fit column widths
    const max_len = headers.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i] || "").length)));
    worksheet["!cols"] = max_len.map(l => ({ wch: l + 3 }));

    XLSX.writeFile(workbook, `Becarios_${selectedSemester?.nombre_display || "listado"}.xlsx`);
  };

  // PDF Export
  const exportToPDF = () => {
    const doc = new jsPDF();
    const activeSemName = selectedSemester?.nombre_display || "Historial";
    
    // Membrete
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 35, "F");
    
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("SECRETARÍA DE FORTALECIMIENTO VECINAL, CULTURA Y DEPORTES", 10, 15);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Nómina Oficial de Becarios — Período: ${activeSemName}`, 10, 22);
    doc.text(`Responsable: ${user?.nombre_completo || "Área"}`, 10, 28);
    
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.text(`Generado: ${new Date().toLocaleDateString("es-AR")} ${new Date().toLocaleTimeString("es-AR")}`, 155, 28);

    const tableHeaders = [["Nombre", "DNI", "CUIL/CUIT", "Área", "Básico", "Activa", "Total"]];
    const tableRows = filteredList.map((b) => [
      b.apellido_nombre,
      b.dni,
      b.cuit,
      b.area_nombre,
      b.importe_mensual_beca.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }),
      b.importe_tarjeta_activa.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }),
      b.importe_total.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })
    ]);

    (doc as any).autoTable({
      head: tableHeaders,
      body: tableRows,
      startY: 45,
      styles: { fontSize: 8.5, cellPadding: 2.5 },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });

    doc.save(`Nómina_Becarios_${activeSemName}.pdf`);
  };

  return (
    <div className={styles.container}>
      {/* Mini KPIs */}
      <div className={styles.metricsGrid}>
        <div className={`${styles.metricCard} glass-panel`}>
          <span className={styles.metricLabel}>Total Becarios Activos</span>
          <h4 className={styles.metricValue}>{metrics.count}</h4>
        </div>
        <div className={`${styles.metricCard} glass-panel`}>
          <span className={styles.metricLabel}>Costo Mensual Total</span>
          <h4 className={styles.metricValue}>
            {metrics.totalCost.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })}
          </h4>
        </div>
        <div className={`${styles.metricCard} glass-panel`}>
          <span className={styles.metricLabel}>Promedio de Beca</span>
          <h4 className={styles.metricValue}>
            {metrics.avgBeca.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })}
          </h4>
        </div>
        <div className={`${styles.metricCard} glass-panel`}>
          <span className={styles.metricLabel}>Cobertura Legajos</span>
          <h4 className={styles.metricValue}>{metrics.completeness}%</h4>
        </div>
      </div>

      {/* Filter Bar */}
      <div className={`${styles.filterBar} glass-panel`}>
        <div className={styles.searchWrapper}>
          <Search size={16} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Buscar por Nombre, DNI o CUIT..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>

        <div className={styles.filtersGroup}>
          <div className={styles.filterItem}>
            <Filter size={14} className={styles.filterIcon} />
            <select
              className={styles.filterSelect}
              value={filterEstado}
              onChange={(e) => {
                setFilterEstado(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="Activo">Solo Activos</option>
              <option value="Baja">Historial Bajas</option>
            </select>
          </div>

          <div className={styles.filterItem}>
            <select
              className={styles.filterSelect}
              value={filterCategory}
              onChange={(e) => {
                setFilterCategory(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="all">Todas las Categorías</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  Básico: ${Number(c).toLocaleString("es-AR")}
                </option>
              ))}
            </select>
          </div>

          <button onClick={exportToExcel} className={styles.actionBtn} title="Exportar a Excel">
            <FileSpreadsheet size={16} />
            <span>Excel</span>
          </button>

          <button onClick={exportToPDF} className={styles.actionBtn} title="Exportar PDF">
            <Download size={16} />
            <span>PDF</span>
          </button>
        </div>
      </div>

      {/* Table Container */}
      {loading ? (
        <div className={styles.loadingState}>
          <Loader2 size={32} className={styles.spinner} />
          <span>Cargando nómina de becarios...</span>
        </div>
      ) : filteredList.length > 0 ? (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>DNI / CUIT</th>
                <th>Subsecretaría / Área</th>
                <th className="text-right">Básico</th>
                <th className="text-right">Activa</th>
                <th className="text-right">Total</th>
                <th>Legajo</th>
                <th>Estado</th>
                <th style={{ width: "80px" }}>Ficha</th>
              </tr>
            </thead>
            <tbody>
              {paginatedList.map((b) => (
                <tr key={b.id}>
                  <td>
                    <span className={styles.agentName}>{b.apellido_nombre}</span>
                  </td>
                  <td>
                    <div className={styles.docNumbers}>
                      <span>DNI: {b.dni}</span>
                      <span className={styles.cuitText}>CUIT: {b.cuit}</span>
                    </div>
                  </td>
                  <td>
                    <div className={styles.organicaGroup}>
                      <span className={styles.subText}>{b.subsecretaria_nombre}</span>
                      <span className={styles.areaText}>{b.area_nombre}</span>
                    </div>
                  </td>
                  <td className="text-right">${b.importe_mensual_beca.toLocaleString("es-AR")}</td>
                  <td className="text-right">${b.importe_tarjeta_activa.toLocaleString("es-AR")}</td>
                  <td className="text-right text-emerald font-semibold">${b.importe_total.toLocaleString("es-AR")}</td>
                  <td>
                    <span className={`${styles.legajoBadge} ${b.documentos_aprobados >= 6 ? styles.legajoOk : styles.legajoPending}`}>
                      {b.documentos_aprobados} de 6
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.statusLabel} ${b.estado === "Activo" ? styles.statusActive : styles.statusInactive}`}>
                      {b.estado}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => setSelectedPerson(b)}
                      className={styles.viewDetailsBtn}
                      title="Ver Detalles"
                    >
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(currentPage - 1)}
                className={styles.pageBtn}
              >
                <ChevronLeft size={16} />
              </button>
              <span className={styles.pageIndicator}>
                Página {currentPage} de {totalPages}
              </span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(currentPage + 1)}
                className={styles.pageBtn}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className={`${styles.emptyState} glass-panel`}>
          <Info size={32} className={styles.emptyIcon} />
          <h4>No se encontraron becarios</h4>
          <p>Prueba ajustando los filtros de búsqueda o el período seleccionado.</p>
        </div>
      )}

      {/* Detail Drawer */}
      <Drawer
        isOpen={!!selectedPerson}
        onClose={() => setSelectedPerson(null)}
        title={selectedPerson?.apellido_nombre || "Detalles del Becario"}
        size="lg"
      >
        {selectedPerson && (
          <div className={styles.drawerContainer}>
            <div className={styles.drawerBody}>
              {/* Seccion 1: Datos Personales */}
              <div className={styles.drawerSection}>
                <h4 className={styles.sectionTitle}>Ficha de Datos de Asignación</h4>
                <div className={styles.infoGrid}>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>CUIT / CUIL</span>
                    <span className={styles.infoValue}>{selectedPerson.cuit}</span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Documento DNI</span>
                    <span className={styles.infoValue}>{selectedPerson.dni}</span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Subsecretaría</span>
                    <span className={styles.infoValue}>{selectedPerson.subsecretaria_nombre}</span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Área Operativa</span>
                    <span className={styles.infoValue}>{selectedPerson.area_nombre}</span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Básico</span>
                    <span className={styles.infoValue}>${selectedPerson.importe_mensual_beca.toLocaleString("es-AR")}</span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Adicional Activa</span>
                    <span className={styles.infoValue}>${selectedPerson.importe_tarjeta_activa.toLocaleString("es-AR")}</span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Importe Consolidado</span>
                    <span className={`${styles.infoValue} text-emerald`}>${selectedPerson.importe_total.toLocaleString("es-AR")}</span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Fecha de Alta</span>
                    <span className={styles.infoValue}>
                      {selectedPerson.fecha_alta ? new Date(selectedPerson.fecha_alta).toLocaleDateString("es-AR") : "-"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Seccion 2: Datos de Pago y Contacto */}
              <div className={styles.drawerSection}>
                <h4 className={styles.sectionTitle}>Datos Bancarios y de Contacto</h4>
                <div className={styles.infoGrid}>
                  <div className={styles.infoItem} style={{ gridColumn: "span 2" }}>
                    <span className={styles.infoLabel}>CBU Bancario</span>
                    <div className={styles.bankDetails}>
                      <CreditCard size={14} className="text-secondary" />
                      <span className={styles.infoValue}>{selectedPerson.cbu || "No Registrado"}</span>
                    </div>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Tarjeta Activa N°</span>
                    <span className={styles.infoValue}>{selectedPerson.tarjeta_activa_nro || "Sin Asignar"}</span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Teléfono</span>
                    <span className={styles.infoValue}>{selectedPerson.telefono || "No Registrado"}</span>
                  </div>
                  <div className={styles.infoItem} style={{ gridColumn: "span 2" }}>
                    <span className={styles.infoLabel}>Correo Electrónico</span>
                    <span className={styles.infoValue}>{selectedPerson.email || "No Registrado"}</span>
                  </div>
                </div>
              </div>

              {/* Seccion 3: Domicilio */}
              <div className={styles.drawerSection}>
                <h4 className={styles.sectionTitle}>Dirección Declarada</h4>
                <div className={styles.infoGrid}>
                  <div className={styles.infoItem} style={{ gridColumn: "span 2" }}>
                    <span className={styles.infoLabel}>Calle y Altura</span>
                    <span className={styles.infoValue}>
                      {selectedPerson.calle || "Sin calle"} {selectedPerson.nro || ""}
                      {selectedPerson.piso ? `, Piso ${selectedPerson.piso}` : ""}
                      {selectedPerson.depto ? `, Depto ${selectedPerson.depto}` : ""}
                    </span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Barrio</span>
                    <span className={styles.infoValue}>{selectedPerson.barrio || "-"}</span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Localidad</span>
                    <span className={styles.infoValue}>{selectedPerson.localidad || "-"}</span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Lote / Manzana</span>
                    <span className={styles.infoValue}>
                      {selectedPerson.lote ? `Lote ${selectedPerson.lote}` : "-"}
                      {selectedPerson.manzana ? ` / Mz ${selectedPerson.manzana}` : ""}
                    </span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Código Postal</span>
                    <span className={styles.infoValue}>{selectedPerson.codigo_postal || "-"}</span>
                  </div>
                </div>
              </div>

              {/* Seccion 4: Auditoría de Legajo (Checklist) */}
              <div className={styles.drawerSection}>
                <div className={styles.legajoHeader}>
                  <h4 className={styles.sectionTitle}>Auditoría de Legajo Municipal</h4>
                  {whatsappLink && (
                    <a
                      href={whatsappLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.whatsappBtn}
                    >
                      <Phone size={14} />
                      <span>Reclamar por WhatsApp</span>
                    </a>
                  )}
                </div>

                <div className={styles.documentChecklist}>
                  {legajoStatus.map((doc) => {
                    const Icon = {
                      aprobado: CheckCircle2,
                      pendiente: Clock,
                      rechazado: AlertTriangle,
                      faltante: MinusCircle,
                    }[doc.status];

                    const statusClass = {
                      aprobado: styles.docOk,
                      pendiente: styles.docPending,
                      rechazado: styles.docAlert,
                      faltante: styles.docMissing,
                    }[doc.status];

                    return (
                      <div key={doc.code} className={`${styles.docRow} ${statusClass}`}>
                        <div className={styles.docRowLeft}>
                          <Icon size={16} className={styles.docRowIcon} />
                          <div className={styles.docRowDetails}>
                            <span className={styles.docRowLabel}>{doc.label}</span>
                            {doc.observaciones && (
                              <span className={styles.docObservaciones}>Obs: {doc.observaciones}</span>
                            )}
                          </div>
                        </div>
                        <div className={styles.docRowRight}>
                          {doc.url ? (
                            <a
                              href={doc.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.downloadDocLink}
                            >
                              Descargar
                            </a>
                          ) : (
                            <span className={styles.noDocLabel}>No entregado</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
