"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Search,
  Filter,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Activity,
  ArrowRightLeft,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Info,
} from "lucide-react";
import { useSemester } from "@/lib/contexts/SemesterContext";
import { usePortalFilter } from "@/lib/contexts/PortalFilterContext";
import styles from "./movimientos.module.css";

interface Movimiento {
  id: string;
  tipo_persona: "becario" | "monotributista";
  persona_id: string;
  tipo_movimiento: "alta" | "baja" | "cambio_monto" | "cambio_categoria";
  anio: number;
  mes: number;
  descripcion: string;
  created_at: string;
  nombre_persona: string;
  subsecretaria_nombre: string;
  area_nombre: string;
  solicitado_por?: string;
}

export default function PortalMovimientosPage() {
  const { selectedSemester } = useSemester();
  const { selectedSubsecretariaId, selectedAreaId } = usePortalFilter();

  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTipoPersona, setFilterTipoPersona] = useState("all");
  const [filterTipoMovimiento, setFilterTipoMovimiento] = useState("all");
  const [filterMes, setFilterMes] = useState("all");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // Determine months belonging to the current semester
  const monthsOfSemester = useMemo(() => {
    if (!selectedSemester) return [1, 2, 3, 4, 5, 6];
    return selectedSemester.numero_semestre === 1 ? [1, 2, 3, 4, 5, 6] : [7, 8, 9, 10, 11, 12];
  }, [selectedSemester]);

  useEffect(() => {
    if (!selectedSemester) return;
    const semestreId = selectedSemester.id;

    async function loadMovimientos() {
      setLoading(true);
      try {
        const url = `/api/portal/movimientos?semestre_id=${semestreId}&subsecretaria_id=${selectedSubsecretariaId}&area_id=${selectedAreaId}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setMovimientos(data.movimientos || []);
        }
      } catch (err) {
        console.error("Error loading movements:", err);
      } finally {
        setLoading(false);
      }
    }

    loadMovimientos();
  }, [selectedSemester, selectedSubsecretariaId, selectedAreaId]);

  // Derived filtered movements
  const filteredList = useMemo(() => {
    return movimientos.filter((m) => {
      // Type of persona
      if (filterTipoPersona !== "all") {
        if (m.tipo_persona !== filterTipoPersona) return false;
      }

      // Type of movement
      if (filterTipoMovimiento !== "all") {
        if (m.tipo_movimiento !== filterTipoMovimiento) return false;
      }

      // Month
      if (filterMes !== "all") {
        if (m.mes !== Number(filterMes)) return false;
      }

      // Search term
      if (searchTerm.trim() !== "") {
        const q = searchTerm.toLowerCase().trim();
        return (
          m.nombre_persona.toLowerCase().includes(q) ||
          m.descripcion.toLowerCase().includes(q) ||
          (m.solicitado_por && m.solicitado_por.toLowerCase().includes(q))
        );
      }

      return true;
    });
  }, [movimientos, filterTipoPersona, filterTipoMovimiento, filterMes, searchTerm]);

  // Pagination
  const paginatedList = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredList.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredList, currentPage]);

  const totalPages = Math.ceil(filteredList.length / itemsPerPage);

  // Top Metrics (calculated based on current semester's movements)
  const metrics = useMemo(() => {
    const total = movimientos.length;
    const altas = movimientos.filter((m) => m.tipo_movimiento === "alta").length;
    const bajas = movimientos.filter((m) => m.tipo_movimiento === "baja").length;
    const cambios = movimientos.filter((m) => m.tipo_movimiento === "cambio_monto" || m.tipo_movimiento === "cambio_categoria").length;

    return {
      total,
      altas,
      bajas,
      cambios,
    };
  }, [movimientos]);

  const getMovementBadgeDetails = (type: string) => {
    switch (type) {
      case "alta":
        return { text: "Alta", class: styles.badgeAlta };
      case "baja":
        return { text: "Baja", class: styles.badgeBaja };
      case "cambio_monto":
        return { text: "Cambio Monto", class: styles.badgeCambioMonto };
      case "cambio_categoria":
        return { text: "Cambio Cat.", class: styles.badgeCambioCat };
      default:
        return { text: type, class: "" };
    }
  };

  const getMonthName = (m: number) => {
    const months = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];
    return months[m - 1] || "";
  };

  return (
    <div className={styles.container}>
      {/* Top Metrics Grid */}
      <div className={styles.metricsGrid}>
        <div className={`${styles.metricCard} glass-panel`}>
          <span className={styles.metricLabel}>Total Movimientos</span>
          <h4 className={styles.metricValue}>{metrics.total}</h4>
        </div>
        <div className={`${styles.metricCard} glass-panel`}>
          <span className={styles.metricLabel}>Nuevas Altas</span>
          <h4 className={`${styles.metricValue} text-emerald`}>{metrics.altas}</h4>
        </div>
        <div className={`${styles.metricCard} glass-panel`}>
          <span className={styles.metricLabel}>Bajas Registradas</span>
          <h4 className={`${styles.metricValue} text-rose`}>{metrics.bajas}</h4>
        </div>
        <div className={`${styles.metricCard} glass-panel`}>
          <span className={styles.metricLabel}>Modificaciones</span>
          <h4 className={`${styles.metricValue} text-amber`}>{metrics.cambios}</h4>
        </div>
      </div>

      {/* Filters Bar */}
      <div className={`${styles.filterBar} glass-panel`}>
        <div className={styles.searchWrapper}>
          <Search size={16} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Buscar por Agente o descripción..."
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
              value={filterTipoPersona}
              onChange={(e) => {
                setFilterTipoPersona(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="all">Todos los Tipos</option>
              <option value="becario">Becarios</option>
              <option value="monotributista">Monotributistas</option>
            </select>
          </div>

          <div className={styles.filterItem}>
            <select
              className={styles.filterSelect}
              value={filterTipoMovimiento}
              onChange={(e) => {
                setFilterTipoMovimiento(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="all">Todos los Movimientos</option>
              <option value="alta">Altas</option>
              <option value="baja">Bajas</option>
              <option value="cambio_monto">Cambio de Monto</option>
              <option value="cambio_categoria">Cambio de Categoría</option>
            </select>
          </div>

          <div className={styles.filterItem}>
            <Calendar size={14} className={styles.filterIcon} />
            <select
              className={styles.filterSelect}
              value={filterMes}
              onChange={(e) => {
                setFilterMes(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="all">Todos los Meses</option>
              {monthsOfSemester.map((m) => (
                <option key={m} value={m.toString()}>
                  {getMonthName(m)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Movements Table */}
      {loading ? (
        <div className={styles.loadingState}>
          <Loader2 size={32} className={styles.spinner} />
          <span>Cargando registro de movimientos...</span>
        </div>
      ) : filteredList.length > 0 ? (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
               <tr>
                 <th>Fecha</th>
                 <th>Agente</th>
                 <th>Tipo Persona</th>
                 <th>Movimiento</th>
                 <th>Descripción</th>
                 <th>Solicitado por</th>
                 <th>Período Contable</th>
                 <th>Subsecretaría / Área</th>
               </tr>
             </thead>
             <tbody>
               {paginatedList.map((m) => {
                 const badge = getMovementBadgeDetails(m.tipo_movimiento);
                 return (
                   <tr key={m.id}>
                     <td>
                       <span className={styles.dateTime}>
                         {new Date(m.created_at).toLocaleDateString("es-AR")}
                       </span>
                     </td>
                     <td>
                       <span className={styles.agentName}>{m.nombre_persona}</span>
                     </td>
                     <td>
                       <span className={`${styles.agentTypeBadge} ${m.tipo_persona === "becario" ? styles.becarioBadge : styles.monoBadge}`}>
                         {m.tipo_persona === "becario" ? "🎓 Becario" : "💼 Monotributista"}
                       </span>
                     </td>
                     <td>
                       <span className={`${styles.movBadge} ${badge.class}`}>
                         {badge.text}
                       </span>
                     </td>
                     <td>
                       <span className={styles.movementDesc}>{m.descripcion}</span>
                     </td>
                     <td>
                       <span className={styles.solicitadoPor}>{m.solicitado_por || "-"}</span>
                     </td>
                     <td>
                       <span className={styles.periodName}>
                         {getMonthName(m.mes)} {m.anio}
                       </span>
                     </td>
                     <td>
                       <div className={styles.organicaGroup}>
                         <span className={styles.subText}>{m.subsecretaria_nombre}</span>
                         <span className={styles.areaText}>{m.area_nombre}</span>
                       </div>
                     </td>
                  </tr>
                );
              })}
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
          <h4>No se registraron movimientos</h4>
          <p>Prueba ajustando los filtros de búsqueda o el período seleccionado.</p>
        </div>
      )}
    </div>
  );
}
