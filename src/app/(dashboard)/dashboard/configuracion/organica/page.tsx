"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Edit2,
  Trash2,
  Building2,
  Layers,
  Loader2,
  Check,
  Search,
  RefreshCw,
  AlertTriangle
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast, Toaster } from "sonner";
import styles from "./organica.module.css";

function normalizeString(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

interface Subsecretaria {
  id: string;
  nombre: string;
  orden: number;
  activa: boolean;
  created_at: string;
}

interface Area {
  id: string;
  subsecretaria_id: string;
  nombre: string;
  orden: number;
  activa: boolean;
  created_at: string;
  subsecretarias?: {
    id: string;
    nombre: string;
  };
}

export default function OrganicaConfigPage() {
  const supabase = createClient();

  // Tab State
  const [activeTab, setActiveTab] = useState<"subsecretarias" | "areas">("subsecretarias");

  // Data States
  const [subsecretarias, setSubsecretarias] = useState<Subsecretaria[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form States - Subsecretarías
  const [subName, setSubName] = useState("");
  const [subOrder, setSubOrder] = useState<number>(0);
  const [editingSubId, setEditingSubId] = useState<string | null>(null);

  // Form States - Áreas
  const [areaName, setAreaName] = useState("");
  const [areaSubId, setAreaSubId] = useState("");
  const [areaOrder, setAreaOrder] = useState<number>(0);
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);

  // Search and Filter States
  const [searchSubQuery, setSearchSubQuery] = useState("");
  const [searchAreaQuery, setSearchAreaQuery] = useState("");
  const [filterAreaSubId, setFilterAreaSubId] = useState("all");

  const loadData = async () => {
    setLoading(true);
    try {
      // Fetch Subsecretarías
      const { data: subsData, error: subsErr } = await supabase
        .from("subsecretarias")
        .select("*")
        .order("orden", { ascending: true })
        .order("nombre", { ascending: true });

      if (subsErr) throw subsErr;
      setSubsecretarias(subsData || []);

      // Fetch Áreas with parent Subsecretaría details
      const { data: areasData, error: areasErr } = await supabase
        .from("areas")
        .select("*, subsecretarias(id, nombre)")
        .order("orden", { ascending: true })
        .order("nombre", { ascending: true });

      if (areasErr) throw areasErr;
      setAreas(areasData || []);

    } catch (err: any) {
      console.error("Error loading organica data:", err);
      toast.error("Error al cargar la estructura orgánica: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // --- SUBSECRETARIAS CRUD ---

  const handleSaveSubsecretaria = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subName.trim()) {
      toast.warning("El nombre de la subsecretaría es obligatorio.");
      return;
    }

    setSaving(true);
    try {
      if (editingSubId) {
        // Update
        const { error } = await supabase
          .from("subsecretarias")
          .update({ nombre: subName.trim(), orden: Number(subOrder) })
          .eq("id", editingSubId);

        if (error) throw error;
        toast.success("Subsecretaría modificada con éxito.");
      } else {
        // Create
        // Check duplicate name
        const duplicate = subsecretarias.some(
          (s) => normalizeString(s.nombre) === normalizeString(subName)
        );
        if (duplicate) {
          toast.warning("Ya existe una subsecretaría con ese nombre.");
          setSaving(false);
          return;
        }

        const { error } = await supabase
          .from("subsecretarias")
          .insert({ nombre: subName.trim(), orden: Number(subOrder), activa: true });

        if (error) throw error;
        toast.success("Subsecretaría creada con éxito.");
      }

      // Reset Form and reload
      setSubName("");
      setSubOrder(0);
      setEditingSubId(null);
      await loadData();
    } catch (err: any) {
      console.error("Error saving subsecretaria:", err);
      toast.error("Error al guardar subsecretaría: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEditSub = (sub: Subsecretaria) => {
    setEditingSubId(sub.id);
    setSubName(sub.nombre);
    setSubOrder(sub.orden);
  };

  const handleToggleSub = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("subsecretarias")
        .update({ activa: !currentStatus })
        .eq("id", id);

      if (error) throw error;
      toast.success(
        currentStatus ? "Subsecretaría desactivada con éxito." : "Subsecretaría activada con éxito."
      );
      await loadData();
    } catch (err: any) {
      toast.error("Error al cambiar estado: " + err.message);
    }
  };

  const handleDeleteSub = async (id: string, nombre: string) => {
    if (
      !confirm(
        `¿Está seguro de eliminar la subsecretaría "${nombre}"? Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }

    try {
      const { error } = await supabase.from("subsecretarias").delete().eq("id", id);
      if (error) throw error;

      toast.success("Subsecretaría eliminada con éxito.");
      if (editingSubId === id) {
        setEditingSubId(null);
        setSubName("");
        setSubOrder(0);
      }
      await loadData();
    } catch (err: any) {
      console.error("Error deleting subsecretaria:", err);
      if (err.code === "23503") {
        toast.error(
          "No se puede eliminar: Esta subsecretaría tiene áreas o personal activo asignado. Recomendamos desactivarla en su lugar.",
          { duration: 6000 }
        );
      } else {
        toast.error("Error al eliminar subsecretaría: " + err.message);
      }
    }
  };

  const handleCancelSubEdit = () => {
    setEditingSubId(null);
    setSubName("");
    setSubOrder(0);
  };

  // --- AREAS CRUD ---

  const handleSaveArea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!areaName.trim()) {
      toast.warning("El nombre del área es obligatorio.");
      return;
    }
    if (!areaSubId) {
      toast.warning("Debe seleccionar una subsecretaría asociada.");
      return;
    }

    setSaving(true);
    try {
      if (editingAreaId) {
        // Update
        const { error } = await supabase
          .from("areas")
          .update({
            nombre: areaName.trim(),
            subsecretaria_id: areaSubId,
            orden: Number(areaOrder)
          })
          .eq("id", editingAreaId);

        if (error) throw error;
        toast.success("Área modificada con éxito.");
      } else {
        // Create
        // Check duplicate name within the same subsecretaria
        const duplicate = areas.some(
          (a) =>
            a.subsecretaria_id === areaSubId &&
            normalizeString(a.nombre) === normalizeString(areaName)
        );
        if (duplicate) {
          toast.warning("Ya existe un área con ese nombre en esta subsecretaría.");
          setSaving(false);
          return;
        }

        const { error } = await supabase.from("areas").insert({
          nombre: areaName.trim(),
          subsecretaria_id: areaSubId,
          orden: Number(areaOrder),
          activa: true
        });

        if (error) throw error;
        toast.success("Área creada con éxito.");
      }

      // Reset Form and reload
      setAreaName("");
      setAreaSubId("");
      setAreaOrder(0);
      setEditingAreaId(null);
      await loadData();
    } catch (err: any) {
      console.error("Error saving area:", err);
      toast.error("Error al guardar área: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEditArea = (area: Area) => {
    setEditingAreaId(area.id);
    setAreaName(area.nombre);
    setAreaSubId(area.subsecretaria_id);
    setAreaOrder(area.orden);
  };

  const handleToggleArea = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("areas")
        .update({ activa: !currentStatus })
        .eq("id", id);

      if (error) throw error;
      toast.success(
        currentStatus ? "Área desactivada con éxito." : "Área activada con éxito."
      );
      await loadData();
    } catch (err: any) {
      toast.error("Error al cambiar estado: " + err.message);
    }
  };

  const handleDeleteArea = async (id: string, nombre: string) => {
    if (
      !confirm(
        `¿Está seguro de eliminar el área "${nombre}"? Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }

    try {
      const { error } = await supabase.from("areas").delete().eq("id", id);
      if (error) throw error;

      toast.success("Área eliminada con éxito.");
      if (editingAreaId === id) {
        setEditingAreaId(null);
        setAreaName("");
        setAreaSubId("");
        setAreaOrder(0);
      }
      await loadData();
    } catch (err: any) {
      console.error("Error deleting area:", err);
      if (err.code === "23503") {
        toast.error(
          "No se puede eliminar: Esta área tiene personal o responsables activos asignados. Recomendamos desactivarla en su lugar.",
          { duration: 6000 }
        );
      } else {
        toast.error("Error al eliminar área: " + err.message);
      }
    }
  };

  const handleCancelAreaEdit = () => {
    setEditingAreaId(null);
    setAreaName("");
    setAreaSubId("");
    setAreaOrder(0);
  };

  // --- FILTERED DATA LISTS ---

  const filteredSubsecretarias = useMemo(() => {
    return subsecretarias.filter((s) => {
      if (searchSubQuery.trim() !== "") {
        return s.nombre.toLowerCase().includes(searchSubQuery.toLowerCase());
      }
      return true;
    });
  }, [subsecretarias, searchSubQuery]);

  const filteredAreas = useMemo(() => {
    return areas.filter((a) => {
      // 1. Filter by Subsecretaría parent
      if (filterAreaSubId !== "all" && a.subsecretaria_id !== filterAreaSubId) {
        return false;
      }

      // 2. Search query (area name or parent subsecretaría name)
      if (searchAreaQuery.trim() !== "") {
        const query = searchAreaQuery.toLowerCase();
        const areaName = a.nombre.toLowerCase();
        const parentName = a.subsecretarias?.nombre?.toLowerCase() || "";
        return areaName.includes(query) || parentName.includes(query);
      }

      return true;
    });
  }, [areas, filterAreaSubId, searchAreaQuery]);

  // Active subsecretarías list to associate new areas with
  const activeSubsecretarias = useMemo(() => {
    return subsecretarias.filter((s) => s.activa || s.id === areaSubId);
  }, [subsecretarias, areaSubId]);

  return (
    <div className={styles.container}>
      <Toaster position="top-right" richColors />

      {/* Header */}
      <div className={styles.header}>
        <Link href="/dashboard/configuracion" className={styles.backLink}>
          <ArrowLeft size={16} />
          <span>Volver a Configuración</span>
        </Link>
        <h1>Estructura Orgánica</h1>
        <p className="text-secondary">
          Administre las subsecretarías y áreas operativas que componen la estructura administrativa de la Secretaría.
        </p>
      </div>

      {/* Tabs */}
      <div className={styles.tabsContainer}>
        <button
          className={`${styles.tabButton} ${activeTab === "subsecretarias" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("subsecretarias")}
        >
          <Building2 size={16} />
          <span>Subsecretarías ({subsecretarias.length})</span>
        </button>
        <button
          className={`${styles.tabButton} ${activeTab === "areas" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("areas")}
        >
          <Layers size={16} />
          <span>Áreas Operativas ({areas.length})</span>
        </button>
      </div>

      {/* TAB CONTENT: SUBSECRETARIAS */}
      {activeTab === "subsecretarias" && (
        <div className={styles.layout}>
          {/* Create/Edit Form */}
          <div className={styles.formCard}>
            <h3 className={styles.cardTitle}>
              {editingSubId ? "Editar Subsecretaría" : "Nueva Subsecretaría"}
            </h3>
            <form onSubmit={handleSaveSubsecretaria} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className={styles.formGroup}>
                <label>Nombre de Subsecretaría *</label>
                <input
                  type="text"
                  value={subName}
                  onChange={(e) => setSubName(e.target.value)}
                  placeholder="Ej: Subsecretaría de Deportes..."
                  className={styles.textInput}
                  maxLength={100}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label>Orden de Prioridad (Visualización)</label>
                <input
                  type="number"
                  value={subOrder}
                  onChange={(e) => setSubOrder(Number(e.target.value))}
                  placeholder="Ej: 1, 2, 3..."
                  className={styles.textInput}
                  min={0}
                />
                <span className={styles.itemSub} style={{ marginTop: "2px" }}>
                  Define en qué lugar se muestra en el organigrama y listas.
                </span>
              </div>

              <div className={styles.buttonGroup}>
                <button type="submit" className={styles.primaryBtn} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="spin" size={16} />
                      <span>Guardando...</span>
                    </>
                  ) : editingSubId ? (
                    <>
                      <Check size={16} />
                      <span>Actualizar</span>
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      <span>Crear</span>
                    </>
                  )}
                </button>

                {editingSubId && (
                  <button type="button" onClick={handleCancelSubEdit} className={styles.cancelBtn}>
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* List Card */}
          <div className={styles.listCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
              <h3 className={styles.cardTitle} style={{ margin: 0 }}>Subsecretarías Registradas</h3>
              <button onClick={loadData} className="secondaryBtn" style={{ padding: "6px 12px", fontSize: "13px" }} disabled={loading}>
                <RefreshCw size={12} className={loading ? "spin" : ""} style={{ marginRight: "6px" }} />
                Actualizar
              </button>
            </div>

            <div className={styles.listFilters}>
              <div className={styles.searchGroup}>
                <Search className={styles.searchIcon} size={16} />
                <input
                  type="text"
                  placeholder="Buscar subsecretaría..."
                  className={styles.searchInput}
                  value={searchSubQuery}
                  onChange={(e) => setSearchSubQuery(e.target.value)}
                />
              </div>
            </div>

            {loading ? (
              <div className={styles.emptyState}>
                <Loader2 className="spin" size={32} />
                <p>Cargando subsecretarías...</p>
              </div>
            ) : filteredSubsecretarias.length === 0 ? (
              <div className={styles.emptyState}>
                <Building2 size={32} style={{ opacity: 0.5 }} />
                <p>
                  {searchSubQuery.trim() !== ""
                    ? "No se encontraron subsecretarías para la búsqueda."
                    : "No hay subsecretarías creadas."}
                </p>
              </div>
            ) : (
              <div className={styles.itemsList}>
                {filteredSubsecretarias.map((sub) => (
                  <div key={sub.id} className={styles.itemCard}>
                    <div className={styles.itemMeta}>
                      <div className={styles.itemOrder} title="Orden de visualización">
                        {sub.orden}
                      </div>
                      <div className={styles.itemDetails}>
                        <span className={`${styles.itemName} ${!sub.activa ? styles.itemNameInactive : ""}`}>
                          {sub.nombre}
                        </span>
                        {!sub.activa && (
                          <span className={styles.itemSub} style={{ color: "var(--accent-rose)" }}>
                            Desactivada (Oculta de selectores)
                          </span>
                        )}
                      </div>
                    </div>

                    <div className={styles.itemActions}>
                      <label className={styles.toggleLabel} title={sub.activa ? "Desactivar" : "Activar"}>
                        <input
                          type="checkbox"
                          className={styles.toggleInput}
                          checked={sub.activa}
                          onChange={() => handleToggleSub(sub.id, sub.activa)}
                        />
                        <div className={styles.toggleTrack}>
                          <div className={styles.toggleThumb} />
                        </div>
                      </label>

                      <button
                        className={styles.actionBtn}
                        onClick={() => handleEditSub(sub)}
                        title="Editar"
                      >
                        <Edit2 size={14} />
                      </button>

                      <button
                        className={`${styles.actionBtn} ${styles.deleteBtn}`}
                        onClick={() => handleDeleteSub(sub.id, sub.nombre)}
                        title="Eliminar"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: AREAS */}
      {activeTab === "areas" && (
        <div className={styles.layout}>
          {/* Create/Edit Form */}
          <div className={styles.formCard}>
            <h3 className={styles.cardTitle}>
              {editingAreaId ? "Editar Área Operativa" : "Nueva Área Operativa"}
            </h3>
            <form onSubmit={handleSaveArea} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className={styles.formGroup}>
                <label>Nombre de Área Operativa *</label>
                <input
                  type="text"
                  value={areaName}
                  onChange={(e) => setAreaName(e.target.value)}
                  placeholder="Ej: Dirección de Deportes Social..."
                  className={styles.textInput}
                  maxLength={100}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label>Subsecretaría Asociada *</label>
                <select
                  value={areaSubId}
                  onChange={(e) => setAreaSubId(e.target.value)}
                  className={styles.selectInput}
                  required
                >
                  <option value="">-- Seleccione Subsecretaría --</option>
                  {activeSubsecretarias.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre} {!s.activa && "(Inactiva)"}
                    </option>
                  ))}
                </select>
                {activeSubsecretarias.length === 0 && (
                  <span className={styles.itemSub} style={{ color: "var(--accent-rose)", display: "flex", gap: "4px", marginTop: "4px" }}>
                    <AlertTriangle size={14} />
                    Debe activar o crear al menos una subsecretaría primero.
                  </span>
                )}
              </div>

              <div className={styles.formGroup}>
                <label>Orden de Prioridad (Visualización)</label>
                <input
                  type="number"
                  value={areaOrder}
                  onChange={(e) => setAreaOrder(Number(e.target.value))}
                  placeholder="Ej: 1, 2, 3..."
                  className={styles.textInput}
                  min={0}
                />
                <span className={styles.itemSub} style={{ marginTop: "2px" }}>
                  Define en qué lugar se muestra dentro de su subsecretaría.
                </span>
              </div>

              <div className={styles.buttonGroup}>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={saving || activeSubsecretarias.length === 0}
                >
                  {saving ? (
                    <>
                      <Loader2 className="spin" size={16} />
                      <span>Guardando...</span>
                    </>
                  ) : editingAreaId ? (
                    <>
                      <Check size={16} />
                      <span>Actualizar</span>
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      <span>Crear</span>
                    </>
                  )}
                </button>

                {editingAreaId && (
                  <button type="button" onClick={handleCancelAreaEdit} className={styles.cancelBtn}>
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* List Card */}
          <div className={styles.listCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
              <h3 className={styles.cardTitle} style={{ margin: 0 }}>Áreas Operativas Registradas</h3>
              <button onClick={loadData} className="secondaryBtn" style={{ padding: "6px 12px", fontSize: "13px" }} disabled={loading}>
                <RefreshCw size={12} className={loading ? "spin" : ""} style={{ marginRight: "6px" }} />
                Actualizar
              </button>
            </div>

            <div className={styles.listFilters}>
              <div className={styles.searchGroup}>
                <Search className={styles.searchIcon} size={16} />
                <input
                  type="text"
                  placeholder="Buscar área por nombre..."
                  className={styles.searchInput}
                  value={searchAreaQuery}
                  onChange={(e) => setSearchAreaQuery(e.target.value)}
                />
              </div>

              <div className={styles.filterGroup}>
                <span className={styles.filterLabel} style={{ fontSize: "13px" }}>Subsecretaría:</span>
                <select
                  value={filterAreaSubId}
                  onChange={(e) => setFilterAreaSubId(e.target.value)}
                  className={styles.selectInput}
                  style={{ padding: "8px 12px", fontSize: "13px", width: "auto" }}
                >
                  <option value="all">Todas</option>
                  {subsecretarias.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {loading ? (
              <div className={styles.emptyState}>
                <Loader2 className="spin" size={32} />
                <p>Cargando áreas...</p>
              </div>
            ) : filteredAreas.length === 0 ? (
              <div className={styles.emptyState}>
                <Layers size={32} style={{ opacity: 0.5 }} />
                <p>
                  {searchAreaQuery.trim() !== "" || filterAreaSubId !== "all"
                    ? "No se encontraron áreas operativas para los filtros seleccionados."
                    : "No hay áreas operativas creadas."}
                </p>
              </div>
            ) : (
              <div className={styles.itemsList}>
                {filteredAreas.map((area) => (
                  <div key={area.id} className={styles.itemCard}>
                    <div className={styles.itemMeta}>
                      <div className={styles.itemOrder} title="Orden de visualización">
                        {area.orden}
                      </div>
                      <div className={styles.itemDetails}>
                        <span className={`${styles.itemName} ${!area.activa ? styles.itemNameInactive : ""}`}>
                          {area.nombre}
                        </span>
                        <span className={styles.itemSub}>
                          Depende de: <strong style={{ color: "var(--text-primary)" }}>{area.subsecretarias?.nombre || "N/A"}</strong>
                        </span>
                        {!area.activa && (
                          <span className={styles.itemSub} style={{ color: "var(--accent-rose)", marginTop: "2px" }}>
                            Desactivada (Oculta de selectores)
                          </span>
                        )}
                      </div>
                    </div>

                    <div className={styles.itemActions}>
                      <label className={styles.toggleLabel} title={area.activa ? "Desactivar" : "Activar"}>
                        <input
                          type="checkbox"
                          className={styles.toggleInput}
                          checked={area.activa}
                          onChange={() => handleToggleArea(area.id, area.activa)}
                        />
                        <div className={styles.toggleTrack}>
                          <div className={styles.toggleThumb} />
                        </div>
                      </label>

                      <button
                        className={styles.actionBtn}
                        onClick={() => handleEditArea(area)}
                        title="Editar"
                      >
                        <Edit2 size={14} />
                      </button>

                      <button
                        className={`${styles.actionBtn} ${styles.deleteBtn}`}
                        onClick={() => handleDeleteArea(area.id, area.nombre)}
                        title="Eliminar"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
