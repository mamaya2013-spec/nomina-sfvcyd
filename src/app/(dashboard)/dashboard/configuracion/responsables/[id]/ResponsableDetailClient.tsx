"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  ArrowLeft,
  Loader2,
  Mail,
  Phone,
  User,
  Building,
  Briefcase,
  Users,
  DollarSign,
  TrendingUp,
  Award,
  Eye,
  FileText,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast, Toaster } from "sonner";
import Link from "next/link";
import StatusBadge from "@/components/ui/StatusBadge";
import styles from "./responsableDetail.module.css";

interface ResponsableDetailClientProps {
  id: string;
}

export default function ResponsableDetailClient({ id }: ResponsableDetailClientProps) {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [responsable, setResponsable] = useState<any | null>(null);
  const [becarios, setBecarios] = useState<any[]>([]);
  const [monotributistas, setMonotributistas] = useState<any[]>([]);
  const [subsecretarias, setSubsecretarias] = useState<any[]>([]);
  const [areas, setAreas] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"becarios" | "monotributistas">("becarios");

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch everything in parallel
      const [respRes, becsRes, monosRes, subsRes, arsRes] = await Promise.all([
        supabase
          .from("responsables")
          .select(`
            *,
            subsecretarias(id, nombre),
            areas(id, nombre)
          `)
          .eq("id", id)
          .single(),
        supabase
          .from("becarios")
          .select(`
            *,
            areas(id, nombre),
            categorias_becas(id, numero_categoria)
          `)
          .eq("responsable_id", id)
          .order("apellido_nombre", { ascending: true }),
        supabase
          .from("monotributistas")
          .select(`
            *,
            areas(id, nombre),
            categorias_monotributistas(id, letra, descripcion_categoria)
          `)
          .eq("responsable_id", id)
          .order("apellido_nombre", { ascending: true }),
        supabase.from("subsecretarias").select("id, nombre"),
        supabase.from("areas").select("id, nombre")
      ]);

      if (respRes.error) throw respRes.error;

      setResponsable(respRes.data);
      setBecarios(becsRes.data || []);
      setMonotributistas(monosRes.data || []);
      setSubsecretarias(subsRes.data || []);
      setAreas(arsRes.data || []);
    } catch (err: any) {
      toast.error("Error al cargar detalles del responsable: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  // Aggregate Metrics (Only count active people in the budget)
  const stats = useMemo(() => {
    const activeBecs = becarios.filter((b) => b.estado === "Activo");
    const activeMonos = monotributistas.filter((m) => m.estado === "Activo");

    const budgetBecs = activeBecs.reduce((acc, curr) => acc + Number(curr.importe_total || 0), 0);
    const budgetMonos = activeMonos.reduce((acc, curr) => acc + Number(curr.importe_total || 0), 0);

    return {
      totalPeople: activeBecs.length + activeMonos.length,
      activeBecsCount: activeBecs.length,
      inactiveBecsCount: becarios.length - activeBecs.length,
      activeMonosCount: activeMonos.length,
      inactiveMonosCount: monotributistas.length - activeMonos.length,
      budgetBecs,
      budgetMonos,
      totalBudget: budgetBecs + budgetMonos,
    };
  }, [becarios, monotributistas]);

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <Loader2 className={styles.spin} size={48} />
        <p>Cargando información del responsable...</p>
      </div>
    );
  }

  if (!responsable) {
    return (
      <div className={styles.notFoundContainer}>
        <h2>Responsable no encontrado</h2>
        <p>No se pudo hallar el registro en el sistema.</p>
        <Link href="/dashboard/configuracion/responsables" className={styles.backBtn}>
          <ArrowLeft size={16} /> Volver a Responsables
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Toaster position="top-right" richColors />

      {/* Header */}
      <div className={`${styles.header} glass-panel`}>
        <div className={styles.headerTitleGroup}>
          <Link href="/dashboard/configuracion/responsables" className={styles.backLink}>
            <ArrowLeft size={16} /> Volver a Responsables
          </Link>
          <div className={styles.titleWithStatus}>
            <h1>{responsable.nombre_completo}</h1>
            <StatusBadge status={responsable.activo ? "activo" : "inactivo"} />
          </div>
          <p className="text-secondary">Ficha detallada del responsable y personal a cargo.</p>
        </div>
      </div>

      <div className={styles.grid}>
        {/* Profile Card */}
        <div className={`${styles.profileCard} glass-panel`}>
          <div className={styles.cardHeader}>
            <div className={styles.avatarWrapper}>
              <User size={36} className="text-blue" />
            </div>
            <div>
              <h3>Información de Contacto</h3>
              <p className="text-muted">ID: {responsable.dni}</p>
            </div>
          </div>

          <div className={styles.infoList}>
            <div className={styles.infoItem}>
              <Award size={16} className="text-purple" />
              <div>
                <span className={styles.infoLabel}>Cargo / Función</span>
                <span className={styles.infoValue}>{responsable.cargo || "No especificado"}</span>
              </div>
            </div>

            <div className={styles.infoItem}>
              <Building size={16} className="text-blue" />
              <div>
                <span className={styles.infoLabel}>Subsecretarías</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "4px" }}>
                  {(() => {
                    const subIds = responsable.subsecretarias_ids && responsable.subsecretarias_ids.length > 0
                      ? responsable.subsecretarias_ids
                      : (responsable.subsecretaria_id ? [responsable.subsecretaria_id] : []);
                    if (subIds.length === 0) {
                      return <span className={styles.infoValue}>No vinculada</span>;
                    }
                    return subIds.map((subId: string) => {
                      const name = subsecretarias.find((s) => s.id === subId)?.nombre || "Desconocida";
                      return (
                        <span
                          key={subId}
                          style={{
                            display: "inline-block",
                            padding: "4px 8px",
                            borderRadius: "6px",
                            background: "rgba(59, 130, 246, 0.1)",
                            border: "1px solid rgba(59, 130, 246, 0.2)",
                            color: "var(--accent-blue)",
                            fontSize: "12px",
                            fontWeight: 500,
                          }}
                        >
                          {name}
                        </span>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>

            <div className={styles.infoItem}>
              <Briefcase size={16} className="text-emerald" />
              <div>
                <span className={styles.infoLabel}>Áreas Operativas</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "4px" }}>
                  {(() => {
                    const areaIds = responsable.areas_ids && responsable.areas_ids.length > 0
                      ? responsable.areas_ids
                      : (responsable.area_id ? [responsable.area_id] : []);
                    if (areaIds.length === 0) {
                      return <span className={styles.infoValue}>No vinculada</span>;
                    }
                    return areaIds.map((areaId: string) => {
                      const name = areas.find((a) => a.id === areaId)?.nombre || "Desconocida";
                      return (
                        <span
                          key={areaId}
                          style={{
                            display: "inline-block",
                            padding: "4px 8px",
                            borderRadius: "6px",
                            background: "rgba(16, 185, 129, 0.1)",
                            border: "1px solid rgba(16, 185, 129, 0.2)",
                            color: "var(--accent-emerald)",
                            fontSize: "12px",
                            fontWeight: 500,
                          }}
                        >
                          {name}
                        </span>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>

            <div className={styles.infoItem}>
              <Mail size={16} className="text-amber" />
              <div>
                <span className={styles.infoLabel}>Email</span>
                <span className={styles.infoValue}>
                  {responsable.email ? (
                    <a href={`mailto:${responsable.email}`} className={styles.link}>
                      {responsable.email}
                    </a>
                  ) : (
                    "No registrado"
                  )}
                </span>
              </div>
            </div>

            <div className={styles.infoItem}>
              <Phone size={16} className="text-rose" />
              <div>
                <span className={styles.infoLabel}>Teléfono</span>
                <span className={styles.infoValue}>
                  {responsable.telefono ? (
                    <a href={`tel:${responsable.telefono}`} className={styles.link}>
                      {responsable.telefono}
                    </a>
                  ) : (
                    "No registrado"
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Dashboard/KPI Cards */}
        <div className={styles.kpiContainer}>
          <div className={`${styles.kpiCard} glass-panel`}>
            <div className={styles.kpiIconWrapper} style={{ background: "rgba(59, 130, 246, 0.1)" }}>
              <Users className="text-blue" size={24} />
            </div>
            <div className={styles.kpiContent}>
              <span className={styles.kpiLabel}>Personal Activo a Cargo</span>
              <span className={styles.kpiValue}>{stats.totalPeople}</span>
              <span className={styles.kpiSub}>
                {stats.activeBecsCount} becarios | {stats.activeMonosCount} monotributistas
              </span>
            </div>
          </div>

          <div className={`${styles.kpiCard} glass-panel`}>
            <div className={styles.kpiIconWrapper} style={{ background: "rgba(16, 185, 129, 0.1)" }}>
              <DollarSign className="text-emerald" size={24} />
            </div>
            <div className={styles.kpiContent}>
              <span className={styles.kpiLabel}>Presupuesto Supervisado</span>
              <span className={`${styles.kpiValue} text-emerald`}>
                ${stats.totalBudget.toLocaleString("es-AR")}
              </span>
              <span className={styles.kpiSub}>Monto total mensual facturado</span>
            </div>
          </div>

          <div className={`${styles.kpiCard} glass-panel`}>
            <div className={styles.kpiIconWrapper} style={{ background: "rgba(139, 92, 246, 0.1)" }}>
              <TrendingUp className="text-purple" size={24} />
            </div>
            <div className={styles.kpiContent}>
              <span className={styles.kpiLabel}>Distribución de Presupuesto</span>
              <span className={styles.kpiValue}>
                {stats.totalBudget > 0
                  ? `${Math.round((stats.budgetBecs / stats.totalBudget) * 100)}% / ${Math.round(
                      (stats.budgetMonos / stats.totalBudget) * 100
                    )}%`
                  : "0% / 0%"}
              </span>
              <span className={styles.kpiSub}>Beca vs Monotributo (Proporción)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs list of personnel */}
      <div className={`${styles.listSection} glass-panel`}>
        <div className={styles.listHeader}>
          <div className={styles.tabs}>
            <button
              onClick={() => setActiveTab("becarios")}
              className={`${styles.tabBtn} ${activeTab === "becarios" ? styles.activeTab : ""}`}
            >
              Becarios ({becarios.length})
            </button>
            <button
              onClick={() => setActiveTab("monotributistas")}
              className={`${styles.tabBtn} ${activeTab === "monotributistas" ? styles.activeTab : ""}`}
            >
              Monotributistas ({monotributistas.length})
            </button>
          </div>
        </div>

        <div className={styles.tableResponsive}>
          {activeTab === "becarios" ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Apellido y Nombre</th>
                  <th>DNI</th>
                  <th>Área</th>
                  <th>Categoría</th>
                  <th>Monto Base</th>
                  <th>Tarjeta Activa</th>
                  <th>Monto Total</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {becarios.length === 0 ? (
                  <tr>
                    <td colSpan={9} className={styles.noData}>
                      No hay becarios asignados a este responsable.
                    </td>
                  </tr>
                ) : (
                  becarios.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <div className={styles.personNameCell}>
                          <span className={styles.personName}>{b.apellido_nombre}</span>
                          <span className={styles.personCuil}>{b.cuit}</span>
                        </div>
                      </td>
                      <td className="mono">{b.dni}</td>
                      <td>{b.areas?.nombre || "-"}</td>
                      <td>
                        <span className={styles.catBadge}>
                          Cat. {b.categorias_becas?.numero_categoria || "-"}
                        </span>
                      </td>
                      <td className="mono text-secondary">
                        ${Number(b.importe_mensual_beca || 0).toLocaleString("es-AR")}
                      </td>
                      <td className="mono text-secondary">
                        ${Number(b.importe_tarjeta_activa || 0).toLocaleString("es-AR")}
                      </td>
                      <td className="mono font-bold text-emerald">
                        ${Number(b.importe_total || 0).toLocaleString("es-AR")}
                      </td>
                      <td>
                        <StatusBadge status={b.estado} />
                      </td>
                      <td>
                        <Link
                          href={`/dashboard/becarios/${b.id}`}
                          className={styles.viewLink}
                          title="Ver Ficha Completa"
                        >
                          <Eye size={16} /> Ver Ficha
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Apellido y Nombre</th>
                  <th>DNI</th>
                  <th>Área</th>
                  <th>Categoría ARCA (Letra)</th>
                  <th>Monto Base</th>
                  <th>Tarjeta Activa</th>
                  <th>Monto Total</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {monotributistas.length === 0 ? (
                  <tr>
                    <td colSpan={9} className={styles.noData}>
                      No hay monotributistas asignados a este responsable.
                    </td>
                  </tr>
                ) : (
                  monotributistas.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <div className={styles.personNameCell}>
                          <span className={styles.personName}>{m.apellido_nombre}</span>
                          <span className={styles.personCuil}>{m.cuit}</span>
                        </div>
                      </td>
                      <td className="mono">{m.dni}</td>
                      <td>{m.areas?.nombre || "-"}</td>
                      <td>
                        <div className={styles.catMonoWrapper}>
                          <span className={styles.catMonoBadge}>
                            Cat. {m.categorias_monotributistas?.letra || "-"}
                          </span>
                          <span className={styles.catMonoDesc}>
                            {m.categorias_monotributistas?.descripcion_categoria || ""}
                          </span>
                        </div>
                      </td>
                      <td className="mono text-secondary">
                        ${Number(m.importe_mensual_monotributo || 0).toLocaleString("es-AR")}
                      </td>
                      <td className="mono text-secondary">
                        ${Number(m.importe_tarjeta_activa || 0).toLocaleString("es-AR")}
                      </td>
                      <td className="mono font-bold text-emerald">
                        ${Number(m.importe_total || 0).toLocaleString("es-AR")}
                      </td>
                      <td>
                        <StatusBadge status={m.estado} />
                      </td>
                      <td>
                        <Link
                          href={`/dashboard/monotributistas/${m.id}`}
                          className={styles.viewLink}
                          title="Ver Ficha Completa"
                        >
                          <Eye size={16} /> Ver Ficha
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
