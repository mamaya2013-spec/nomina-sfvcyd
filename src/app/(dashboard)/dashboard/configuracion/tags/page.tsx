"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Edit2, Trash2, Tag, Loader2, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast, Toaster } from "sonner";
import styles from "./tags.module.css";

interface TagItem {
  id: string;
  nombre: string;
  color: string;
  count?: number;
}

const PRESET_COLORS = [
  "#3b82f6", // Blue
  "#10b981", // Emerald
  "#8b5cf6", // Violet
  "#f59e0b", // Amber
  "#ef4444", // Red
  "#ec4899", // Pink
  "#14b8a6", // Teal
  "#f97316", // Orange
  "#6b7280", // Gray
  "#06b6d4", // Cyan
];

export default function TagsConfigPage() {
  const supabase = createClient();

  const [tags, setTags] = useState<TagItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Form States
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Load tags and their counts
  const loadTags = async () => {
    setLoading(true);
    try {
      const { data: tagsData, error: tagsErr } = await supabase
        .from("tags")
        .select("*")
        .order("nombre");
      
      if (tagsErr) throw tagsErr;

      // Fetch persona tags association to count personnel
      const { data: associations, error: assocErr } = await supabase
        .from("persona_tags")
        .select("tag_id");

      if (assocErr) throw assocErr;

      // Compute counts
      const countsMap: { [key: string]: number } = {};
      associations?.forEach((a: any) => {
        countsMap[a.tag_id] = (countsMap[a.tag_id] || 0) + 1;
      });

      const items: TagItem[] = (tagsData || []).map((t: any) => ({
        id: t.id,
        nombre: t.nombre,
        color: t.color || "#3b82f6",
        count: countsMap[t.id] || 0,
      }));

      setTags(items);
    } catch (err: any) {
      console.error("Error loading tags:", err);
      toast.error("Error al cargar etiquetas: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTags();
  }, []);

  // Save tag (Create / Update)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.warning("El nombre de la etiqueta no puede estar vacío.");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        // Update
        const { error } = await supabase
          .from("tags")
          .update({ nombre: name.trim(), color })
          .eq("id", editingId);

        if (error) throw error;
        toast.success("Etiqueta actualizada con éxito.");
      } else {
        // Create
        // Check duplication
        const duplicate = tags.some((t) => t.nombre.toLowerCase() === name.trim().toLowerCase());
        if (duplicate) {
          toast.warning("Ya existe una etiqueta con ese nombre.");
          setSaving(false);
          return;
        }

        const { error } = await supabase
          .from("tags")
          .insert({ nombre: name.trim(), color });

        if (error) throw error;
        toast.success("Etiqueta creada con éxito.");
      }

      // Reset Form and reload
      setName("");
      setColor("#3b82f6");
      setEditingId(null);
      await loadTags();
    } catch (err: any) {
      console.error("Error saving tag:", err);
      toast.error("Error al guardar la etiqueta: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Set tag for editing
  const handleEdit = (tag: TagItem) => {
    setEditingId(tag.id);
    setName(tag.nombre);
    setColor(tag.color);
  };

  // Delete tag
  const handleDelete = async (id: string) => {
    if (!confirm("¿Está seguro de eliminar esta etiqueta? Se quitará de todos los agentes asociados automáticamente.")) {
      return;
    }

    try {
      const { error } = await supabase.from("tags").delete().eq("id", id);
      if (error) throw error;

      toast.success("Etiqueta eliminada con éxito.");
      if (editingId === id) {
        setEditingId(null);
        setName("");
        setColor("#3b82f6");
      }
      await loadTags();
    } catch (err: any) {
      console.error("Error deleting tag:", err);
      toast.error("Error al eliminar la etiqueta: " + err.message);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setName("");
    setColor("#3b82f6");
  };

  return (
    <div className={styles.container}>
      <Toaster position="top-right" richColors />

      {/* Header */}
      <div className={styles.header}>
        <Link href="/dashboard/configuracion" className={styles.backLink}>
          <ArrowLeft size={16} />
          <span>Volver a Configuración</span>
        </Link>
        <h1>Administrar Etiquetas (Tags)</h1>
        <p className="text-secondary">
          Cree y edite etiquetas con colores personalizados para clasificar libremente a los agentes de la Secretaría.
        </p>
      </div>

      <div className={styles.layout}>
        {/* Form Card */}
        <div className={styles.formCard}>
          <h3 className={styles.cardTitle}>
            {editingId ? "Editar Etiqueta" : "Nueva Etiqueta"}
          </h3>
          <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div className={styles.formGroup}>
              <label>Nombre de Etiqueta *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Crítico, Eventos, Operativo..."
                className={styles.textInput}
                maxLength={30}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label>Seleccionar Color</label>
              <div className={styles.colorPickerWrapper}>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className={styles.colorInput}
                />
                
                {/* Presets */}
                <div className={styles.presetColors}>
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`${styles.presetColorBtn} ${color === c ? styles.presetColorActive : ""}`}
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className={styles.buttonGroup}>
              <button type="submit" className={styles.primaryBtn} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="spin" size={16} />
                    <span>Guardando...</span>
                  </>
                ) : editingId ? (
                  <>
                    <Check size={16} />
                    <span>Actualizar</span>
                  </>
                ) : (
                  <>
                    <Plus size={16} />
                    <span>Crear Etiqueta</span>
                  </>
                )}
              </button>

              {editingId && (
                <button type="button" onClick={cancelEdit} className={styles.cancelBtn}>
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </div>

        {/* List Card */}
        <div className={styles.listCard}>
          <h3 className={styles.cardTitle}>Etiquetas Existentes</h3>
          
          {loading ? (
            <div style={{ textAlign: "center", padding: "20px", color: "var(--text-secondary)" }}>
              Cargando etiquetas...
            </div>
          ) : tags.length === 0 ? (
            <div className={styles.emptyState}>
              <Tag size={32} style={{ marginBottom: "8px", opacity: 0.5 }} />
              <p>No se encontraron etiquetas creadas en el sistema.</p>
            </div>
          ) : (
            <div className={styles.tagsList}>
              {tags.map((tag) => (
                <div key={tag.id} className={styles.tagItem}>
                  <div className={styles.tagMeta}>
                    <div
                      className={styles.tagColorDot}
                      style={{ color: tag.color, backgroundColor: tag.color }}
                    />
                    <span
                      className={styles.tagBadge}
                      style={{ backgroundColor: tag.color }}
                    >
                      {tag.nombre}
                    </span>
                    <span className={styles.tagCount}>
                      ({tag.count} {tag.count === 1 ? "agente" : "agentes"})
                    </span>
                  </div>

                  <div className={styles.tagActions}>
                    <button
                      className={styles.actionBtn}
                      onClick={() => handleEdit(tag)}
                      title="Editar etiqueta"
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      className={`${styles.actionBtn} ${styles.deleteBtn}`}
                      onClick={() => handleDelete(tag.id)}
                      title="Eliminar etiqueta"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
