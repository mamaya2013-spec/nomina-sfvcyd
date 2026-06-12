"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Search,
  Filter,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Activity,
  User,
  Users,
  CheckCircle2,
  Trash2,
  TrendingUp,
  RefreshCw,
  Info
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSemester } from "@/lib/contexts/SemesterContext";
import { toast, Toaster } from "sonner";
import styles from "./movimientos.module.css";

export default function MovimientosPage() {
  const supabase = createClient();
  const { selectedSemester } = useSemester();

  // Data States
  const [movements, setMovements] = useState<any[]>([]);
  const [peopleMap, setPeopleMap] = useState<Record<string, { nombre: string; dni?: string }>>({});
  const [usersMap, setUsersMap] = useState<Record<string, { nombre: string; email: string }>>({});
  const [loading, setLoading] = useState(true);

  // Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPersona, setFilterPersona] = useState<string>("all");
  const [filterMovimiento, setFilterMovimiento] = useState<string>("all");

  // Available Years
  const years = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 7 }, (_, i) => current - 3 + i);
  }, []);

  // Period Filter States
  const [periodType, setPeriodType] = useState<"todos" | "semestre" | "mes">("todos");
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedSemesterNum, setSelectedSemesterNum] = useState<number>(1);
  const [selectedMonth, setSelectedMonth] = useState<number>(1);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const fetchMovementsData = async () => {
    if (!selectedYear) return;
    setLoading(true);
    try {
      // 1. Fetch movements for selected year
      const { data: movs, error: movsErr } = await supabase
        .from("movimientos")
        .select("*")
        .eq("anio", selectedYear)
        .order("created_at", { ascending: false });

      if (movsErr) throw movsErr;
      const fetchedMovs = movs || [];
      setMovements(fetchedMovs);

      // 2. Resolve persona names and DNIs
      const becarioIds = fetchedMovs
        .filter((m) => m.tipo_persona === "becario")
        .map((m) => m.persona_id);
      const monotributistaIds = fetchedMovs
        .filter((m) => m.tipo_persona === "monotributista")
        .map((m) => m.persona_id);

      const resolvedPeople: Record<string, { nombre: string; dni?: string }> = {};

      if (becarioIds.length > 0) {
        const { data: becariosData } = await supabase
          .from("becarios")
          .select("id, apellido_nombre, dni")
          .in("id", becarioIds);
        becariosData?.forEach((b) => {
          resolvedPeople[b.id] = { nombre: b.apellido_nombre, dni: b.dni };
        });
      }

      if (monotributistaIds.length > 0) {
        const { data: monosData } = await supabase
          .from("monotributistas")
          .select("id, apellido_nombre, dni")
          .in("id", monotributistaIds);
        monosData?.forEach((m) => {
          resolvedPeople[m.id] = { nombre: m.apellido_nombre, dni: m.dni };
        });
      }

      setPeopleMap(resolvedPeople);

      // 3. Resolve user details
      const userIds = Array.from(
        new Set(fetchedMovs.filter((m) => m.usuario_id).map((m) => m.usuario_id))
      );

      const resolvedUsers: Record<string, { nombre: string; email: string }> = {};
      if (userIds.length > 0) {
        const { data: usersData } = await supabase
          .from("users")
          .select("id, email, nombre_completo")
          .in("id", userIds);
        usersData?.forEach((u) => {
          resolvedUsers[u.id] = {
            nombre: u.nombre_completo || u.email.split("@")[0],
            email: u.email
          };
        });
      }
      setUsersMap(resolvedUsers);

    } catch (err: any) {
      toast.error("Error al cargar movimientos: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSemester) {
      setSelectedYear(selectedSemester.anio);
      setSelectedSemesterNum(selectedSemester.numero_semestre);
      setSelectedMonth(selectedSemester.numero_semestre === 1 ? 1 : 7);
    }
  }, [selectedSemester]);

  useEffect(() => {
    if (selectedYear) {
      fetchMovementsData();
      setCurrentPage(1);
    }
  }, [selectedYear]);

  // 1. Filter by period (Todos, Semester, or Month)
  const periodFilteredMovements = useMemo(() => {
    return movements.filter((m) => {
      if (periodType === "todos") {
        return true;
      }
      if (periodType === "semestre") {
        if (selectedSemesterNum === 1) {
          return m.mes >= 1 && m.mes <= 6;
        } else {
          return m.mes >= 7 && m.mes <= 12;
        }
      }
      if (periodType === "mes") {
        return m.mes === selectedMonth;
      }
      return true;
    });
  }, [movements, periodType, selectedSemesterNum, selectedMonth]);

  // Statistics Calculations
  const stats = useMemo(() => {
    const total = periodFilteredMovements.length;
    const altas = periodFilteredMovements.filter((m) => m.tipo_movimiento === "alta").length;
    const bajas = periodFilteredMovements.filter((m) => m.tipo_movimiento === "baja").length;
    const cambios = periodFilteredMovements.filter(
      (m) => m.tipo_movimiento === "cambio_monto" || m.tipo_movimiento === "cambio_categoria"
    ).length;

    return { total, altas, bajas, cambios };
  }, [periodFilteredMovements]);

  // Filtering Logic (search and badge filters)
  const filteredMovements = useMemo(() => {
    return periodFilteredMovements.filter((m) => {
      // 1. Filter by person type
      if (filterPersona !== "all" && m.tipo_persona !== filterPersona) {
        return false;
      }

      // 2. Filter by movement type
      if (filterMovimiento !== "all" && m.tipo_movimiento !== filterMovimiento) {
        return false;
      }

      // 3. Search term (person name, DNI, or description)
      if (searchTerm.trim() !== "") {
        const term = searchTerm.toLowerCase();
        const person = peopleMap[m.persona_id];
        const personName = person?.nombre?.toLowerCase() || "";
        const personDni = person?.dni || "";
        const description = m.descripcion?.toLowerCase() || "";

        return (
          personName.includes(term) ||
          personDni.includes(term) ||
          description.includes(term)
        );
      }

      return true;
    });
  }, [periodFilteredMovements, filterPersona, filterMovimiento, searchTerm, peopleMap]);

  // Pagination Logic
  const totalItems = filteredMovements.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  
  const paginatedMovements = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredMovements.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredMovements, currentPage]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  // Date Formatting Helper
  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return dateStr;
    }
  };

  const getMonthName = (monthNum: number) => {
    const months = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];
    return months[monthNum - 1] || monthNum;
  };

  // Badge Style Helpers
  const getPersonaBadgeClass = (tipo: string) => {
    return tipo === "becario" ? styles.badge_becario : styles.badge_monotributista;
  };

  const getMovimientoBadgeClass = (tipo: string) => {
    switch (tipo) {
      case "alta":
        return styles.badge_alta;
      case "baja":
        return styles.badge_baja;
      case "cambio_monto":
        return styles.badge_cambio_monto;
      case "cambio_categoria":
        return styles.badge_cambio_categoria;
      default:
        return "";
    }
  };

  const getMovimientoLabel = (tipo: string) => {
    switch (tipo) {
      case "alta":
        return "Alta";
      case "baja":
        return "Baja";
      case "cambio_monto":
        return "Monto";
      case "cambio_categoria":
        return "Categoría";
      default:
        return tipo;
    }
  };

  // Visual diff renderer for changes
  const renderChanges = (mov: any) => {
    if (!mov.datos_anteriores || !mov.datos_nuevos) return null;

    const changes = [];
    const oldData = mov.datos_anteriores;
    const newData = mov.datos_nuevos;

    if (mov.tipo_movimiento === "cambio_monto") {
      const oldM = Number(oldData.monto || oldData.importe_mensual_beca || 0);
      const newM = Number(newData.monto || newData.importe_mensual_beca || 0);
      changes.push({
        label: "Monto",
        oldVal: `$${oldM.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`,
        newVal: `$${newM.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
      });
    } else if (mov.tipo_movimiento === "cambio_categoria") {
      if (oldData.monto !== undefined && newData.monto !== undefined) {
        changes.push({
          label: "Básico",
          oldVal: `$${Number(oldData.monto).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`,
          newVal: `$${Number(newData.monto).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
        });
      }
      if (oldData.total !== undefined && newData.total !== undefined) {
        changes.push({
          label: "Total",
          oldVal: `$${Number(oldData.total).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`,
          newVal: `$${Number(newData.total).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
        });
      }
    } else if (mov.tipo_movimiento === "baja") {
      if (newData.motivo_baja) {
        changes.push({
          label: "Motivo",
          newVal: newData.motivo_baja
        });
      }
      if (newData.fecha_baja) {
        changes.push({
          label: "Fecha",
          newVal: formatDate(newData.fecha_baja).split(" ")[0]
        });
      }
    }

    // Generic fallback for any other fields that changed
    if (changes.length === 0) {
      Object.keys(newData).forEach((key) => {
        if (JSON.stringify(oldData[key]) !== JSON.stringify(newData[key])) {
          changes.push({
            label: key.replace(/_/g, " "),
            oldVal: typeof oldData[key] === "object" ? JSON.stringify(oldData[key]) : String(oldData[key]),
            newVal: typeof newData[key] === "object" ? JSON.stringify(newData[key]) : String(newData[key])
          });
        }
      });
    }

    if (changes.length === 0) return null;

    return (
      <div className={styles.detailGrid}>
        {changes.map((c, idx) => (
          <div key={idx} className={styles.detailRow}>
            <span className={styles.detailLabel}>{c.label}:</span>
            {c.oldVal !== undefined && (
              <>
                <span className={styles.oldValue}>{c.oldVal}</span>
                <span className={styles.detailArrow}>→</span>
              </>
            )}
            <span className={styles.newValue}>{c.newVal}</span>
          </div>
        ))}
      </div>
    );
  };

  if (!selectedSemester) {
    return (
      <div className={styles.emptyCard}>
        <div className={styles.emptyIconWrapper}>
          <Info size={48} />
        </div>
        <h4>Sin Semestre Seleccionado</h4>
        <p>Por favor, seleccione un semestre en el menú superior para ver los movimientos de nómina.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Toaster position="top-right" richColors />

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTitleGroup}>
          <h1>Movimientos</h1>
          <p>
            Historial de auditoría de altas, bajas y cambios realizados durante el año {selectedYear}.
          </p>
        </div>
        <button
          onClick={fetchMovementsData}
          className="secondaryBtn"
          style={{ display: "flex", alignItems: "center", gap: "8px" }}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? styles.spin : ""} />
          <span>Actualizar</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className={styles.statsGrid}>
        <div className={`${styles.statCard} ${styles.statCard_total}`}>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Total Movimientos</span>
            <span className={styles.statValue}>{stats.total}</span>
          </div>
          <div className={styles.statIconWrapper}>
            <Activity size={24} />
          </div>
        </div>

        <div className={`${styles.statCard} ${styles.statCard_alta}`}>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Altas</span>
            <span className={styles.statValue}>{stats.altas}</span>
          </div>
          <div className={styles.statIconWrapper}>
            <CheckCircle2 size={24} />
          </div>
        </div>

        <div className={`${styles.statCard} ${styles.statCard_baja}`}>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Bajas</span>
            <span className={styles.statValue}>{stats.bajas}</span>
          </div>
          <div className={styles.statIconWrapper}>
            <Trash2 size={24} />
          </div>
        </div>

        <div className={`${styles.statCard} ${styles.statCard_cambio}`}>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Modificaciones</span>
            <span className={styles.statValue}>{stats.cambios}</span>
          </div>
          <div className={styles.statIconWrapper}>
            <TrendingUp size={24} />
          </div>
        </div>
      </div>

      {/* Filters Wrapper */}
      <div className={styles.filtersWrapper}>
        {/* Row 1: Period Filters */}
        <div className={styles.periodRow}>
          {/* Year Selector */}
          <div className={styles.periodSelector}>
            <span className={styles.filterLabel}>Año:</span>
            <select
              className={styles.filterSelect}
              value={selectedYear}
              onChange={(e) => {
                setSelectedYear(Number(e.target.value));
              }}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Período:</span>
            <div className={styles.periodTabs}>
              <button
                className={`${styles.periodTab} ${periodType === "todos" ? styles.periodTabActive : ""}`}
                onClick={() => {
                  setPeriodType("todos");
                  setCurrentPage(1);
                }}
              >
                Todo el Año
              </button>
              <button
                className={`${styles.periodTab} ${periodType === "semestre" ? styles.periodTabActive : ""}`}
                onClick={() => {
                  setPeriodType("semestre");
                  setCurrentPage(1);
                }}
              >
                Por Semestre
              </button>
              <button
                className={`${styles.periodTab} ${periodType === "mes" ? styles.periodTabActive : ""}`}
                onClick={() => {
                  setPeriodType("mes");
                  setCurrentPage(1);
                }}
              >
                Por Mes
              </button>
            </div>
          </div>

          {periodType === "semestre" && (
            <div className={styles.periodSelector}>
              <span className={styles.filterLabel}>Semestre:</span>
              <select
                className={styles.filterSelect}
                value={selectedSemesterNum}
                onChange={(e) => {
                  setSelectedSemesterNum(Number(e.target.value));
                  setCurrentPage(1);
                }}
              >
                <option value={1}>1º Semestre (Enero - Junio)</option>
                <option value={2}>2º Semestre (Julio - Diciembre)</option>
              </select>
            </div>
          )}

          {periodType === "mes" && (
            <div className={styles.periodSelector}>
              <span className={styles.filterLabel}>Mes:</span>
              <select
                className={styles.filterSelect}
                value={selectedMonth}
                onChange={(e) => {
                  setSelectedMonth(Number(e.target.value));
                  setCurrentPage(1);
                }}
              >
                <option value={1}>Enero</option>
                <option value={2}>Febrero</option>
                <option value={3}>Marzo</option>
                <option value={4}>Abril</option>
                <option value={5}>Mayo</option>
                <option value={6}>Junio</option>
                <option value={7}>Julio</option>
                <option value={8}>Agosto</option>
                <option value={9}>Septiembre</option>
                <option value={10}>Octubre</option>
                <option value={11}>Noviembre</option>
                <option value={12}>Diciembre</option>
              </select>
            </div>
          )}
        </div>

        {/* Row 2: Search & Traditional Filters */}
        <div className={styles.filtersBar}>
          <div className={styles.searchGroup}>
            <Search className={styles.searchIcon} size={18} />
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Buscar por persona, DNI o descripción..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Persona:</span>
            <select
              className={styles.filterSelect}
              value={filterPersona}
              onChange={(e) => {
                setFilterPersona(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="all">Todos</option>
              <option value="becario">Becarios</option>
              <option value="monotributista">Monotributistas</option>
            </select>
          </div>

          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Movimiento:</span>
            <select
              className={styles.filterSelect}
              value={filterMovimiento}
              onChange={(e) => {
                setFilterMovimiento(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="all">Todos</option>
              <option value="alta">Alta</option>
              <option value="baja">Baja</option>
              <option value="cambio_monto">Cambio Monto</option>
              <option value="cambio_categoria">Cambio Categoría</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table Data */}
      {loading ? (
        <div className={styles.loadingSpinner}>
          <Loader2 className={styles.spin} size={48} />
          <p>Cargando auditoría de movimientos...</p>
        </div>
      ) : totalItems === 0 ? (
        <div className={styles.emptyCard}>
          <div className={styles.emptyIconWrapper}>
            <Activity size={32} />
          </div>
          <h4>No se encontraron movimientos</h4>
          <p>
            {searchTerm.trim() !== "" || filterPersona !== "all" || filterMovimiento !== "all"
              ? "Pruebe ajustando los filtros de búsqueda."
              : `Aún no se registran movimientos para el año ${selectedYear}.`}
          </p>
        </div>
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Persona</th>
                <th>Tipo Persona</th>
                <th>Tipo Movimiento</th>
                <th>Descripción</th>
                <th>Período</th>
                <th>Usuario</th>
              </tr>
            </thead>
            <tbody>
              {paginatedMovements.map((mov) => {
                const person = peopleMap[mov.persona_id];
                const userObj = usersMap[mov.usuario_id];
                const initials = userObj?.nombre
                  ? userObj.nombre
                      .split(" ")
                      .map((n: string) => n[0])
                      .join("")
                      .substring(0, 2)
                  : "U";

                return (
                  <tr key={mov.id}>
                    <td className={styles.dateCell}>{formatDate(mov.created_at)}</td>
                    <td>
                      <div className={styles.personCell}>
                        <span className={styles.personName}>
                          {person?.nombre || "Persona Desconocida"}
                        </span>
                        <span className={styles.personDni}>
                          {person?.dni ? `DNI: ${person.dni}` : `ID: ${mov.persona_id.substring(0, 8)}...`}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`${styles.badge} ${getPersonaBadgeClass(mov.tipo_persona)}`}>
                        {mov.tipo_persona === "becario" ? "Becario" : "Monotributista"}
                      </span>
                    </td>
                    <td>
                      <span className={`${styles.badge} ${getMovimientoBadgeClass(mov.tipo_movimiento)}`}>
                        {getMovimientoLabel(mov.tipo_movimiento)}
                      </span>
                    </td>
                    <td>
                      <div className={styles.descriptionCell}>
                        <span>{mov.descripcion || "Sin descripción"}</span>
                        {renderChanges(mov)}
                      </div>
                    </td>
                    <td className={styles.dateCell}>
                      {getMonthName(mov.mes)} / {mov.anio}
                    </td>
                    <td>
                      {userObj ? (
                        <div className={styles.userCell}>
                          <div className={styles.userAvatar}>{initials}</div>
                          <div className={styles.userInfo}>
                            <span className={styles.userName}>{userObj.nombre}</span>
                            <span className={styles.userEmail}>{userObj.email}</span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-secondary">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className={styles.pagination}>
              <span className={styles.paginationInfo}>
                Mostrando {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, totalItems)} de {totalItems} movimientos
              </span>
              <div className={styles.paginationButtons}>
                <button
                  className={styles.paginationBtn}
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
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
                  {currentPage} / {totalPages}
                </button>
                <button
                  className={styles.paginationBtn}
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
