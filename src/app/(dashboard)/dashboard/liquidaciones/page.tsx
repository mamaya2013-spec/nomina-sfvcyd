"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Calendar,
  DollarSign,
  CheckCircle,
  Clock,
  AlertTriangle,
  Lock,
  Unlock,
  Download,
  Trash2,
  Search,
  FileText,
  Loader2,
  Coins,
  CreditCard,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSemester } from "@/lib/contexts/SemesterContext";
import StatusBadge from "@/components/ui/StatusBadge";
import styles from "./liquidaciones.module.css";
import { toast, Toaster } from "sonner";


export default function LiquidacionesPage() {
  const supabase = createClient();
  const { activeSemester } = useSemester();

  // Filter States
  const [anio, setAnio] = useState<number>(new Date().getFullYear());
  const [mes, setMes] = useState<number>(new Date().getMonth() + 1);
  const [searchQuery, setSearchQuery] = useState("");

  // Data States
  const [liquidations, setLiquidations] = useState<any[]>([]);
  const [status, setStatus] = useState<string>("preview");
  const [semester, setSemester] = useState<any | null>(null);
  const [exists, setExists] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  
  // Selection State for Preview Devengamiento
  const [selectedPeopleIds, setSelectedPeopleIds] = useState<string[]>([]);

  // Available Years
  const years = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 7 }, (_, i) => current - 3 + i);
  }, []);

  // Months list
  const months = [
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
    { value: 12, label: "Diciembre" },
  ];

  // Fetch data
  const loadLiquidations = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/liquidaciones?mes=${mes}&anio=${anio}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al cargar devengamientos");

      const list = data.liquidations || [];
      setLiquidations(list);
      setExists(data.exists);
      setStatus(data.status);
      setSemester(data.semester);

      // Auto-select everyone if it's preview mode (not saved yet)
      if (!data.exists && list.length > 0) {
        setSelectedPeopleIds(list.map((l: any) => l.persona_id));
      } else {
        setSelectedPeopleIds([]);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLiquidations();
  }, [mes, anio]);

  // Generate / Save Liquidations
  const handleGenerate = async () => {
    if (selectedPeopleIds.length === 0) {
      toast.warning("Debe seleccionar al menos una persona para devengar.");
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch("/api/liquidaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mes,
          anio,
          persona_ids: selectedPeopleIds
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al generar devengamiento");

      toast.success(`Devengamiento generado con éxito. Registros creados: ${data.count}`);
      await loadLiquidations();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Update Status
  const handleUpdateStatus = async (newStatus: string) => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/liquidaciones/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mes, anio, nuevo_estado: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al actualizar estado");

      toast.success(`Estado actualizado a: ${newStatus.toUpperCase()}`);
      await loadLiquidations();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Delete Liquidations
  const handleDelete = async () => {
    if (!window.confirm("¿Está seguro de que desea eliminar el devengamiento de este mes? Se borrarán permanentemente los cálculos guardados.")) {
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(`/api/liquidaciones?mes=${mes}&anio=${anio}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al eliminar devengamiento");

      toast.success("Devengamiento eliminado de la base de datos.");
      await loadLiquidations();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Calculate totals and counts
  const summary = useMemo(() => {
    let becariosCount = 0;
    let becariosBase = 0;
    let becariosActiva = 0;
    let becariosTotal = 0;

    let monosCount = 0;
    let monosBase = 0;
    let monosActiva = 0;
    let monosTotal = 0;

    for (const l of liquidations) {
      // In preview mode, only sum up selected individuals
      if (status === "preview" && !semester?.bloqueado && !selectedPeopleIds.includes(l.persona_id)) {
        continue;
      }
      if (l.tipo_persona === "becario") {
        becariosCount++;
        becariosBase += l.monto_base;
        becariosActiva += l.monto_tarjeta_activa;
        becariosTotal += l.total_liquidado;
      } else if (l.tipo_persona === "monotributista") {
        monosCount++;
        monosBase += l.monto_base;
        monosActiva += l.monto_tarjeta_activa;
        monosTotal += l.total_liquidado;
      }
    }

    return {
      becariosCount,
      becariosBase,
      becariosActiva,
      becariosTotal,
      monosCount,
      monosBase,
      monosActiva,
      monosTotal,
      totalCount: becariosCount + monosCount,
      totalBase: becariosBase + monosBase,
      totalActiva: becariosActiva + monosActiva,
      totalGrand: becariosTotal + monosTotal,
    };
  }, [liquidations, selectedPeopleIds, status, semester]);

  // Filter list by searchQuery
  const filteredLiquidations = useMemo(() => {
    return liquidations.filter(
      (l) =>
        l.apellido_nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.cuit.includes(searchQuery)
    );
  }, [liquidations, searchQuery]);

  // Export to Excel multichapa
  const exportExcel = async () => {
    const XLSX = await import('xlsx');

    const wb = XLSX.utils.book_new();

    // 1. Sheet: Becarios
    const becariosData = liquidations
      .filter((l) => l.tipo_persona === "becario")
      .map((l) => ({
        "Apellido y Nombre": l.apellido_nombre,
        "CUIL / CUIT": l.cuit,
        "CBU": l.cbu,
        "Categoría": l.categoria,
        "Haber Básico ($)": l.monto_base,
        "Total Acreditado ($)": l.total_liquidado,
      }));
    const wsBecarios = XLSX.utils.json_to_sheet(becariosData);
    XLSX.utils.book_append_sheet(wb, wsBecarios, "Becarios");

    // 2. Sheet: Monotributistas
    const monosData = liquidations
      .filter((l) => l.tipo_persona === "monotributista")
      .map((l) => ({
        "Apellido y Nombre": l.apellido_nombre,
        "CUIL / CUIT": l.cuit,
        "CBU": l.cbu,
        "Nivel/Letra": l.categoria,
        "Honorarios ($)": l.monto_base,
        "Total Acreditado ($)": l.total_liquidado,
      }));
    const wsMonos = XLSX.utils.json_to_sheet(monosData);
    XLSX.utils.book_append_sheet(wb, wsMonos, "Monotributistas");

    // 3. Sheet: Activa Becarios
    const activaBecariosData = liquidations
      .filter((l) => l.tipo_persona === "becario")
      .map((l) => ({
        "Apellido y Nombre": l.apellido_nombre,
        "CUIL / CUIT": l.cuit,
        "Concepto": "Tarjeta Activa (10%)",
        "Acreditación Tarjeta ($)": l.monto_tarjeta_activa,
      }));
    const wsActivaBecarios = XLSX.utils.json_to_sheet(activaBecariosData);
    XLSX.utils.book_append_sheet(wb, wsActivaBecarios, "Activa Becarios");

    // 4. Sheet: Activa Monotributistas
    const activaMonosData = liquidations
      .filter((l) => l.tipo_persona === "monotributista")
      .map((l) => ({
        "Apellido y Nombre": l.apellido_nombre,
        "CUIL / CUIT": l.cuit,
        "Concepto": "Tarjeta Activa (10%)",
        "Acreditación Tarjeta ($)": l.monto_tarjeta_activa,
      }));
    const wsActivaMonos = XLSX.utils.json_to_sheet(activaMonosData);
    XLSX.utils.book_append_sheet(wb, wsActivaMonos, "Activa Monotributistas");

    XLSX.writeFile(wb, `Devengamiento_Tesoria_${mes.toString().padStart(2, "0")}_${anio}.xlsx`);
    toast.success("Excel multichapa descargado correctamente.");
  };

  // Export to PDF
  const exportPDF = async () => {
    const { default: jsPDF } = await import('jspdf');
    await import('jspdf-autotable');

    const doc = new jsPDF();
    const monthLabel = months.find((m) => m.value === mes)?.label || "";

    // Header Design
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(10, 22, 40); // Dark Blue
    doc.text("SECRETARÍA DE FORTALECIMIENTO VECINAL, CULTURA Y DEPORTES", 10, 20);
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(`Reporte Oficial de Devengamiento de Haberes - Período: ${monthLabel} ${anio}`, 10, 27);
    doc.line(10, 32, 200, 32);

    // Consolidated Summary Table
    doc.setFont("helvetica", "bold");
    doc.text("Resumen Consolidado de Conceptos", 10, 42);

    const summaryRows = [
      ["Concepto", "Personas", "Importe Base", "Tarjeta Activa (10%)", "Total Devengado"],
      ["Becas de Capacitación", summary.becariosCount, `$${summary.becariosBase.toLocaleString("es-AR")}`, `$${summary.becariosActiva.toLocaleString("es-AR")}`, `$${summary.becariosTotal.toLocaleString("es-AR")}`],
      ["Honorarios Monotributo", summary.monosCount, `$${summary.monosBase.toLocaleString("es-AR")}`, `$${summary.monosActiva.toLocaleString("es-AR")}`, `$${summary.monosTotal.toLocaleString("es-AR")}`],
      ["Totales Generales", summary.totalCount, `$${summary.totalBase.toLocaleString("es-AR")}`, `$${summary.totalActiva.toLocaleString("es-AR")}`, `$${summary.totalGrand.toLocaleString("es-AR")}`]
    ];

    (doc as any).autoTable({
      startY: 47,
      head: [summaryRows[0]],
      body: summaryRows.slice(1),
      theme: "striped",
      headStyles: { fillColor: [10, 22, 40], fontStyle: "bold" },
      columnStyles: {
        0: { fontStyle: "bold" },
        1: { halign: "center" },
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right", fontStyle: "bold" }
      }
    });

    const currentY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Certifico que el devengamiento adjunto se condice con el personal registrado y en funciones.", 10, currentY);

    // Signature Block at the bottom
    const sigY = 245;
    doc.line(25, sigY, 85, sigY);
    doc.line(125, sigY, 185, sigY);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("SUBSECRETARIO DE ADMINISTRACIÓN", 26, sigY + 5);
    doc.text("SECRETARIO DE FORTALECIMIENTO VECINAL", 126, sigY + 5);

    // Anexo detailing list
    doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Anexo Detallado de Acreditaciones Bancarias", 10, 20);
    doc.line(10, 24, 200, 24);

    const detailRows = liquidations.map((l, idx) => [
      idx + 1,
      l.apellido_nombre,
      l.tipo_persona === "becario" ? "Beca" : "Monotributo",
      l.cuit,
      l.categoria,
      `$${l.total_liquidado.toLocaleString("es-AR")}`
    ]);

    (doc as any).autoTable({
      startY: 28,
      head: [["Nº", "Apellido y Nombre", "Concepto", "CUIL / CUIT", "Categoría", "Acreditación"]],
      body: detailRows,
      theme: "grid",
      headStyles: { fillColor: [10, 22, 40] },
      columnStyles: {
        0: { halign: "center" },
        2: { halign: "center" },
        4: { halign: "center" },
        5: { halign: "right", fontStyle: "bold" }
      }
    });

    doc.save(`Devengamiento_Oficial_${monthLabel}_${anio}.pdf`);
    toast.success("PDF oficial descargado correctamente.");
  };

  return (
    <div className={styles.container}>
      <Toaster position="top-right" richColors />

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTitleGroup}>
          <h1>Devengamiento Mensual</h1>
          <p className="text-secondary">
            Consolide, procese y exporte el devengamiento de haberes del personal de la Secretaría.
          </p>
        </div>

        {semester?.bloqueado && (
          <div className={styles.lockAlert}>
            <Lock size={16} />
            <span>Semestre Histórico Cerrado (Lectura)</span>
          </div>
        )}
      </div>

      {/* Filters Panel */}
      <div className={styles.filtersPanel}>
        <div className={styles.filterGroup}>
          <label>Año</label>
          <select
            className="input-field"
            value={anio}
            onChange={(e) => setAnio(Number(e.target.value))}
            disabled={actionLoading}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label>Mes</label>
          <select
            className="input-field"
            value={mes}
            onChange={(e) => setMes(Number(e.target.value))}
            disabled={actionLoading}
          >
            {months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div className={`${styles.filterGroup} ${styles.searchGroup}`}>
          <label>Buscar Persona</label>
          <div style={{ position: "relative" }}>
            <input
              type="text"
              placeholder="Buscar por nombre o CUIL..."
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
        </div>
      </div>

      {loading ? (
        <div className={styles.loadingSpinner}>
          <Loader2 className={styles.spin} size={48} />
          <p>Cargando información del período...</p>
        </div>
      ) : (
        <>
          {/* KPI Cards Row */}
          <div className={styles.kpiGrid}>
            <div className={styles.kpiCard}>
              <div className={styles.kpiIconWrapper} style={{ background: "rgba(6, 182, 212, 0.1)", color: "#06b6d4" }}>
                <Users size={20} />
              </div>
              <div className={styles.kpiInfo}>
                <span className={styles.kpiVal}>{summary.totalCount}</span>
                <span className={styles.kpiLabel}>Total Devengados</span>
              </div>
            </div>

            <div className={styles.kpiCard}>
              <div className={styles.kpiIconWrapper} style={{ background: "rgba(16, 185, 129, 0.1)", color: "#10b981" }}>
                <Coins size={20} />
              </div>
              <div className={styles.kpiInfo}>
                <span className={styles.kpiVal}>
                  ${summary.totalBase.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                </span>
                <span className={styles.kpiLabel}>Importes Base</span>
              </div>
            </div>

            <div className={styles.kpiCard}>
              <div className={styles.kpiIconWrapper} style={{ background: "rgba(245, 158, 11, 0.1)", color: "#f59e0b" }}>
                <CreditCard size={20} />
              </div>
              <div className={styles.kpiInfo}>
                <span className={styles.kpiVal}>
                  ${summary.totalActiva.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                </span>
                <span className={styles.kpiLabel}>Tarjeta Activa (10%)</span>
              </div>
            </div>

            <div className={styles.kpiCard} style={{ borderColor: "rgba(16, 185, 129, 0.3)" }}>
              <div className={styles.kpiIconWrapper} style={{ background: "rgba(16, 185, 129, 0.2)", color: "#10b981" }}>
                <DollarSign size={20} />
              </div>
              <div className={styles.kpiInfo}>
                <span className={styles.kpiVal} style={{ color: "#10b981" }}>
                  ${summary.totalGrand.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                </span>
                <span className={styles.kpiLabel}>Presupuesto Total</span>
              </div>
            </div>
          </div>

          {/* Action and Status Banner */}
          <div className={styles.actionBanner}>
            <div className={styles.statusWrapper}>
              <span className={styles.statusText}>
                Estado Administrativo:
              </span>
              <StatusBadge status={status === "preview" ? "Pendiente" : status} />
              {status === "preview" && (
                <span className="text-secondary" style={{ fontSize: "13px" }}>
                  (Cálculos proyectados en memoria)
                </span>
              )}
            </div>

            <div className={styles.actionsGroup}>
              {actionLoading ? (
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Loader2 className={styles.spin} size={20} />
                  <span className="text-secondary" style={{ fontSize: "14px" }}>Procesando...</span>
                </div>
              ) : (
                <>
                  {/* Buttons for Preview mode */}
                  {status === "preview" && !semester?.bloqueado && (
                    <button
                      onClick={handleGenerate}
                      className={styles.primaryBtn}
                      disabled={selectedPeopleIds.length === 0}
                    >
                      <CheckCircle size={16} />
                      <span>Generar Devengamiento ({selectedPeopleIds.length})</span>
                    </button>
                  )}

                  {/* Buttons for Pendiente mode */}
                  {status === "pendiente" && !semester?.bloqueado && (
                    <>
                      <button
                        onClick={() => handleUpdateStatus("procesada")}
                        className={styles.successBtn}
                      >
                        <CheckCircle size={16} />
                        <span>Procesar Devengamiento</span>
                      </button>
                      <button
                        onClick={handleDelete}
                        className={styles.dangerBtn}
                      >
                        <Trash2 size={16} />
                        <span>Eliminar</span>
                      </button>
                    </>
                  )}

                  {/* Buttons for Procesada mode */}
                  {status === "procesada" && !semester?.bloqueado && (
                    <>
                      <button
                        onClick={() => handleUpdateStatus("pagada")}
                        className={styles.primaryBtn}
                      >
                        <DollarSign size={16} />
                        <span>Marcar como Pagada</span>
                      </button>
                      <button
                        onClick={() => handleUpdateStatus("pendiente")}
                        className={styles.secondaryBtn}
                      >
                        <span>Volver a Pendiente</span>
                      </button>
                    </>
                  )}

                  {/* Lock Indicator for Pagada mode */}
                  {status === "pagada" && (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#10b981", fontWeight: "600", fontSize: "14px" }}>
                      <Lock size={16} />
                      <span>Devengamiento Pagado y Cerrado</span>
                    </div>
                  )}

                  {/* Downloads if generated */}
                  {exists && (
                    <>
                      <button onClick={exportExcel} className={styles.secondaryBtn} title="Descargar Excel Multichapa">
                        <Download size={16} />
                        <span>Excel Tesorería</span>
                      </button>
                      <button onClick={exportPDF} className={styles.secondaryBtn} title="Descargar PDF Oficial">
                        <FileText size={16} />
                        <span>Imprimir PDF</span>
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Warning notice if in Preview Mode */}
          {status === "preview" && !semester?.bloqueado && (
            <div className={styles.warningBox}>
              <AlertTriangle size={20} style={{ flexShrink: 0 }} />
              <div>
                <strong>Vista Previa de Devengamiento:</strong> Los datos visualizados abajo corresponden a una
                proyección automática de haberes para el personal activo. Debe presionar <strong>"Generar Devengamiento"</strong>
                para guardar formalmente estos registros y habilitar los reportes de exportación oficiales.
              </div>
            </div>
          )}

          {/* Table list */}
          <div className={styles.tableWrapper}>
            <div className={styles.tableHeader}>
              <h3>Desglose de Haberes Devengados</h3>
              <span className="text-secondary" style={{ fontSize: "13px" }}>
                Mostrando {filteredLiquidations.length} de {liquidations.length} registros
              </span>
            </div>

            <div className={styles.tableResponsive}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    {status === "preview" && !semester?.bloqueado && (
                      <th style={{ width: "40px", textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={
                            filteredLiquidations.length > 0 &&
                            filteredLiquidations.every((l) => selectedPeopleIds.includes(l.persona_id))
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              const newSelected = Array.from(
                                new Set([...selectedPeopleIds, ...filteredLiquidations.map((l) => l.persona_id)])
                              );
                              setSelectedPeopleIds(newSelected);
                            } else {
                              const filteredIds = filteredLiquidations.map((l) => l.persona_id);
                              setSelectedPeopleIds(selectedPeopleIds.filter((id) => !filteredIds.includes(id)));
                            }
                          }}
                        />
                      </th>
                    )}
                    <th>Apellido y Nombre</th>
                    <th>Concepto</th>
                    <th>CUIL / CUIT</th>
                    <th>Categoría</th>
                    <th style={{ textAlign: "right" }}>Importe Base</th>
                    <th style={{ textAlign: "right" }}>Tarjeta Activa (10%)</th>
                    <th style={{ textAlign: "right" }}>Total Acreditado</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLiquidations.length === 0 ? (
                    <tr>
                      <td
                        colSpan={status === "preview" && !semester?.bloqueado ? 8 : 7}
                        style={{ textAlign: "center", padding: "40px" }}
                      >
                        <span className="text-secondary">No se encontraron registros de devengamiento.</span>
                      </td>
                    </tr>
                  ) : (
                    filteredLiquidations.map((l) => (
                      <tr key={l.persona_id}>
                        {status === "preview" && !semester?.bloqueado && (
                          <td style={{ textAlign: "center" }}>
                            <input
                              type="checkbox"
                              checked={selectedPeopleIds.includes(l.persona_id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedPeopleIds([...selectedPeopleIds, l.persona_id]);
                                } else {
                                  setSelectedPeopleIds(selectedPeopleIds.filter((id) => id !== l.persona_id));
                                }
                              }}
                            />
                          </td>
                        )}
                        <td className="font-semibold">{l.apellido_nombre}</td>
                        <td>
                          <span
                            className={
                              l.tipo_persona === "becario"
                                ? "text-cyan font-semibold"
                                : "text-emerald font-semibold"
                            }
                            style={{ fontSize: "12px" }}
                          >
                            {l.tipo_persona === "becario" ? "Beca" : "Monotributo"}
                          </span>
                        </td>
                        <td className="mono">{l.cuit}</td>
                        <td>{l.categoria}</td>
                        <td className="mono" style={{ textAlign: "right" }}>
                          ${l.monto_base.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="mono text-secondary" style={{ textAlign: "right" }}>
                          ${l.monto_tarjeta_activa.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="mono font-bold text-emerald" style={{ textAlign: "right" }}>
                          ${l.total_liquidado.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
