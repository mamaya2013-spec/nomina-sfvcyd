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
  Briefcase,
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
import styles from "./monotributistas.module.css";

// XLSX dynamic imports or direct imports
import * as XLSX from "xlsx";

interface Monotributista {
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
  importe_mensual_monotributo: number;
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
  seguro?: {
    id: string;
    fecha_vencimiento: string;
    compania?: string;
    poliza?: string;
    estado: string;
  } | null;
}

const MONO_REQUIRED_DOCS = [
  { code: "copia_dni_mono", label: "Copia de DNI" },
  { code: "constancia_arca", label: "Constancia de ARCA" },
  { code: "seguro_vigente", label: "Copia de Seguro Vigente" },
  { code: "antecedentes_penales", label: "Certificado de Antecedentes Penales" },
  { code: "delitos_sexuales", label: "Certificado contra Delitos Sexuales" },
  { code: "ddjj_prestacion", label: "Declaración Jurada de Prestación" },
  { code: "titulo_estudios", label: "Copia de Título de Últimos Estudios" },
];

export default function PortalMonotributistasPage() {
  const { user } = usePortalAuth();
  const { selectedSemester } = useSemester();
  const { selectedSubsecretariaId, selectedAreaId } = usePortalFilter();

  const [monotributistas, setMonotributistas] = useState<Monotributista[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPerson, setSelectedPerson] = useState<Monotributista | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filterEstado, setFilterEstado] = useState("Activo");
  const [filterCategory, setFilterCategory] = useState("all");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  useEffect(() => {
    if (!selectedSemester) return;
    const semestreId = selectedSemester.id;

    async function loadMonotributistas() {
      setLoading(true);
      try {
        const url = `/api/portal/monotributistas?semestre_id=${semestreId}&subsecretaria_id=${selectedSubsecretariaId}&area_id=${selectedAreaId}&status=${filterEstado}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setMonotributistas(data.monotributistas || []);
        }
      } catch (err) {
        console.error("Error loading monotributistas:", err);
      } finally {
        setLoading(false);
      }
    }

    loadMonotributistas();
  }, [selectedSemester, selectedSubsecretariaId, selectedAreaId, filterEstado]);

  // Open drawer if agent id is passed in URL query parameter
  useEffect(() => {
    if (monotributistas.length === 0 || loading) return;
    const params = new URLSearchParams(window.location.search);
    const agentId = params.get("id");
    if (agentId) {
      const match = monotributistas.find((m) => m.id === agentId);
      if (match) {
        setSelectedPerson(match);
      }
    }
  }, [monotributistas, loading]);

  // Derived category lists
  const categories = useMemo(() => {
    const cats = new Set<string>();
    monotributistas.forEach((m) => {
      const basic = Number(m.importe_mensual_monotributo || 0);
      if (basic > 0) cats.add(basic.toString());
    });
    return Array.from(cats).sort((a, b) => Number(a) - Number(b));
  }, [monotributistas]);

  // Filters
  const filteredList = useMemo(() => {
    return monotributistas.filter((m) => {
      // Category filter
      if (filterCategory !== "all") {
        if (Number(m.importe_mensual_monotributo) !== Number(filterCategory)) {
          return false;
        }
      }

      // Search filter
      if (searchTerm.trim() !== "") {
        const q = searchTerm.toLowerCase().trim();
        return (
          m.apellido_nombre.toLowerCase().includes(q) ||
          m.dni.includes(q) ||
          m.cuit.includes(q)
        );
      }

      return true;
    });
  }, [monotributistas, searchTerm, filterCategory]);

  // Pagination
  const paginatedList = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredList.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredList, currentPage]);

  const totalPages = Math.ceil(filteredList.length / itemsPerPage);

  // Top Metrics
  const metrics = useMemo(() => {
    const active = monotributistas.filter((m) => m.estado === "Activo");
    const count = active.length;
    const totalCost = active.reduce((sum, m) => sum + Number(m.importe_total || 0), 0);
    const avgMono = count > 0 ? totalCost / count : 0;
    
    let completeCount = 0;
    active.forEach((m) => {
      if (m.documentos_aprobados >= 7) completeCount++;
    });
    const completeness = count > 0 ? Math.round((completeCount / count) * 100) : 0;

    return {
      count,
      totalCost,
      avgMono,
      completeness,
    };
  }, [monotributistas]);

  // Drawer Legajo mapping
  const legajoStatus = useMemo(() => {
    if (!selectedPerson) return [];

    return MONO_REQUIRED_DOCS.map((req) => {
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

  // Get insurance status label & class
  const getInsuranceStatus = (mono: Monotributista) => {
    if (!mono.seguro || !mono.seguro.fecha_vencimiento) {
      return { text: "Sin Registrar", class: styles.insMissing };
    }
    const today = new Date();
    const vDate = new Date(mono.seguro.fecha_vencimiento);
    const diff = vDate.getTime() - today.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (days <= 0) {
      return { text: "Vencido", class: styles.insExpired };
    } else if (days <= 30) {
      return { text: `Vence en ${days}d`, class: styles.insWarning };
    } else {
      return { text: "Al día", class: styles.insOk };
    }
  };

  // WhatsApp Link Builder
  const whatsappLink = useMemo(() => {
    if (!selectedPerson) return "";
    const phone = selectedPerson.telefono || "";
    if (!phone) return "";

    const missing = legajoStatus
      .filter((s) => s.status === "faltante" || s.status === "rechazado")
      .map((s) => s.label);

    // Also check insurance
    const ins = selectedPerson.seguro;
    let insMessage = "";
    if (ins && ins.fecha_vencimiento) {
      const today = new Date();
      const vDate = new Date(ins.fecha_vencimiento);
      if (vDate <= today) {
        insMessage = `\n• Tu seguro de monotributo se encuentra VENCIDO (${vDate.toLocaleDateString("es-AR")}). Por favor, presenta la póliza vigente.`;
      }
    } else if (!ins) {
      missing.push("Seguro vigente de monotributo");
    }

    if (missing.length === 0 && !insMessage) return "";

    let message = `Hola ${selectedPerson.apellido_nombre}! Te contactamos del Portal de la Secretaría. Queremos recordarte que te falta presentar/corregir la siguiente documentación para completar tu legajo: \n\n${missing.map((m) => `• ${m}`).join("\n")}${insMessage}\n\nPor favor, envíala a la brevedad. ¡Muchas gracias!`;
    
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
      "Categoría (Básico)", "Importe Tarjeta Activa", "Importe Total", "CBU", "N° Tarjeta", "Seguro Vence", "Estado", "Fecha Alta"
    ];
    
    const rows = filteredList.map((m) => [
      m.apellido_nombre,
      m.dni,
      m.cuit,
      m.subsecretaria_nombre,
      m.area_nombre,
      m.importe_mensual_monotributo,
      m.importe_tarjeta_activa,
      m.importe_total,
      m.cbu || "-",
      m.tarjeta_activa_nro || "-",
      m.seguro?.fecha_vencimiento ? new Date(m.seguro.fecha_vencimiento).toLocaleDateString("es-AR") : "-",
      m.estado,
      m.fecha_alta ? new Date(m.fecha_alta).toLocaleDateString("es-AR") : "-"
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Monotributistas");
    
    const max_len = headers.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i] || "").length)));
    worksheet["!cols"] = max_len.map(l => ({ wch: l + 3 }));

    XLSX.writeFile(workbook, `Monotributistas_${selectedSemester?.nombre_display || "listado"}.xlsx`);
  };

  // PDF Export
  const exportToPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const { applyPlugin } = await import("jspdf-autotable");
    applyPlugin(jsPDF);
    const doc = new jsPDF();
    const activeSemName = selectedSemester?.nombre_display || "Historial";
    
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 35, "F");
    
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("SECRETARÍA DE FORTALECIMIENTO VECINAL, CULTURA Y DEPORTES", 10, 15);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Nómina Oficial de Monotributistas — Período: ${activeSemName}`, 10, 22);
    doc.text(`Responsable: ${user?.nombre_completo || "Área"}`, 10, 28);
    
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.text(`Generado: ${new Date().toLocaleDateString("es-AR")} ${new Date().toLocaleTimeString("es-AR")}`, 155, 28);

    const tableHeaders = [["Nombre", "DNI", "CUIL/CUIT", "Área", "Básico", "Activa", "Total", "Seguro"]];
    const tableRows = filteredList.map((m) => [
      m.apellido_nombre,
      m.dni,
      m.cuit,
      m.area_nombre,
      m.importe_mensual_monotributo.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }),
      m.importe_tarjeta_activa.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }),
      m.importe_total.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }),
      m.seguro?.fecha_vencimiento ? new Date(m.seguro.fecha_vencimiento).toLocaleDateString("es-AR") : "-"
    ]);

    (doc as any).autoTable({
      head: tableHeaders,
      body: tableRows,
      startY: 45,
      styles: { fontSize: 8.5, cellPadding: 2.5 },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });

    doc.save(`Nómina_Monotributistas_${activeSemName}.pdf`);
  };

  return (
    <div className={styles.container}>
      {/* Mini KPIs */}
      <div className={styles.metricsGrid}>
        <div className={`${styles.metricCard} glass-panel`}>
          <span className={styles.metricLabel}>Total Monotributistas Activos</span>
          <h4 className={styles.metricValue}>{metrics.count}</h4>
        </div>
        <div className={`${styles.metricCard} glass-panel`}>
          <span className={styles.metricLabel}>Costo Mensual Total</span>
          <h4 className={styles.metricValue}>
            {metrics.totalCost.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })}
          </h4>
        </div>
        <div className={`${styles.metricCard} glass-panel`}>
          <span className={styles.metricLabel}>Promedio de Categoría</span>
          <h4 className={styles.metricValue}>
            {metrics.avgMono.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })}
          </h4>
        </div>
        <div className={`${styles.metricCard} glass-panel`}>
          <span className={styles.metricLabel}>Legajos Completos</span>
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
          <span>Cargando nómina de monotributistas...</span>
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
                <th>Seguro Venc.</th>
                <th>Estado</th>
                <th style={{ width: "80px" }}>Ficha</th>
              </tr>
            </thead>
            <tbody>
              {paginatedList.map((m) => {
                const insInfo = getInsuranceStatus(m);
                return (
                  <tr key={m.id}>
                    <td>
                      <span className={styles.agentName}>{m.apellido_nombre}</span>
                    </td>
                    <td>
                      <div className={styles.docNumbers}>
                        <span>DNI: {m.dni}</span>
                        <span className={styles.cuitText}>CUIT: {m.cuit}</span>
                      </div>
                    </td>
                    <td>
                      <div className={styles.organicaGroup}>
                        <span className={styles.subText}>{m.subsecretaria_nombre}</span>
                        <span className={styles.areaText}>{m.area_nombre}</span>
                      </div>
                    </td>
                    <td className="text-right">${m.importe_mensual_monotributo.toLocaleString("es-AR")}</td>
                    <td className="text-right">${m.importe_tarjeta_activa.toLocaleString("es-AR")}</td>
                    <td className="text-right text-emerald font-semibold">${m.importe_total.toLocaleString("es-AR")}</td>
                    <td>
                      <span className={`${styles.legajoBadge} ${m.documentos_aprobados >= 7 ? styles.legajoOk : styles.legajoPending}`}>
                        {m.documentos_aprobados} de 7
                      </span>
                    </td>
                    <td>
                      <span className={`${styles.insuranceLabel} ${insInfo.class}`}>
                        {insInfo.text}
                      </span>
                    </td>
                    <td>
                      <span className={`${styles.statusLabel} ${m.estado === "Activo" ? styles.statusActive : styles.statusInactive}`}>
                        {m.estado}
                      </span>
                    </td>
                    <td>
                      <button
                        onClick={() => setSelectedPerson(m)}
                        className={styles.viewDetailsBtn}
                        title="Ver Detalles"
                      >
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination */}
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
          <h4>No se encontraron monotributistas</h4>
          <p>Prueba ajustando los filtros de búsqueda o el período seleccionado.</p>
        </div>
      )}

      {/* Drawer */}
      <Drawer
        isOpen={!!selectedPerson}
        onClose={() => setSelectedPerson(null)}
        title={selectedPerson?.apellido_nombre || "Detalles del Monotributista"}
        size="lg"
      >
        {selectedPerson && (
          <div className={styles.drawerContainer}>
            <div className={styles.drawerBody}>
              {/* Seccion 1: Datos de Asignación */}
              <div className={styles.drawerSection}>
                <h4 className={styles.sectionTitle}>Ficha de Datos de Asignación</h4>
                <div className={styles.infoGrid}>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>CUIT / CUIL</span>
                    <span className={styles.infoValue}>{selectedPerson.cuit}</span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>DNI</span>
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
                    <span className={styles.infoLabel}>Honorario Básico</span>
                    <span className={styles.infoValue}>${selectedPerson.importe_mensual_monotributo.toLocaleString("es-AR")}</span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Adicional Activa</span>
                    <span className={styles.infoValue}>${selectedPerson.importe_tarjeta_activa.toLocaleString("es-AR")}</span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Importe Total</span>
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

              {/* Seccion 2: Datos de Contacto y Pago */}
              <div className={styles.drawerSection}>
                <h4 className={styles.sectionTitle}>Datos de Contacto y Cuentas</h4>
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

              {/* Seccion 3: Seguro de Monotributista */}
              <div className={styles.drawerSection}>
                <h4 className={styles.sectionTitle}>Seguro de Responsabilidad Civil / Accidentes Personales</h4>
                <div className={styles.infoGrid}>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Compañía Aseguradora</span>
                    <span className={styles.infoValue}>{selectedPerson.seguro?.compania || "No Informada"}</span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Número de Póliza</span>
                    <span className={styles.infoValue}>{selectedPerson.seguro?.poliza || "No Informado"}</span>
                  </div>
                  <div className={styles.infoItem} style={{ gridColumn: "span 2" }}>
                    <span className={styles.infoLabel}>Fecha de Vencimiento de Cobertura</span>
                    <div className={styles.bankDetails}>
                      <Calendar size={14} className="text-secondary" />
                      <span className={`${styles.infoValue} ${
                        selectedPerson.seguro?.fecha_vencimiento && new Date(selectedPerson.seguro.fecha_vencimiento) <= new Date()
                          ? "text-rose"
                          : ""
                      }`}>
                        {selectedPerson.seguro?.fecha_vencimiento
                          ? new Date(selectedPerson.seguro.fecha_vencimiento).toLocaleDateString("es-AR")
                          : "No Registrado / Pendiente"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Seccion 4: Domicilio */}
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
                    <span className={styles.infoLabel}>Código Postal</span>
                    <span className={styles.infoValue}>{selectedPerson.codigo_postal || "-"}</span>
                  </div>
                </div>
              </div>

              {/* Seccion 5: Auditoría de Legajo (Checklist) */}
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
