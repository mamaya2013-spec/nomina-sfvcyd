"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Calendar,
  Lock,
  Unlock,
  AlertTriangle,
  FileCheck,
  TrendingUp,
  AlertCircle,
  TrendingDown,
  Loader2,
  Plus,
  Edit2,
  Settings,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSemester } from "@/lib/contexts/SemesterContext";
import Drawer from "@/components/ui/Drawer";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast, Toaster } from "sonner";
import styles from "./ordenes.module.css";

const CONCEPTS = [
  { tipo: "becas", label: "Becas (Sueldo Básico)", badge: "Becarios Base" },
  { tipo: "monotributos", label: "Honorarios Monotributo", badge: "Monotributistas Base" },
  { tipo: "activa_becas", label: "Tarjeta Activa Becas (10%)", badge: "Activa Becarios" },
  { tipo: "activa_monotributos", label: "Tarjeta Activa Monotributo (10%)", badge: "Activa Monotributistas" },
];

const ocFormSchema = z.object({
  id: z.string().optional(),
  tipo: z.string().min(1, "Tipo de concepto requerido"),
  numero_oc: z.string().min(1, "El número de Orden de Compromiso es obligatorio"),
  monto_asignado: z.number().positive("El monto asignado debe ser mayor a 0"),
  descripcion: z.string().optional(),
});

type OcFormValues = z.infer<typeof ocFormSchema>;

export default function OrdenesCompromisoPage() {
  const supabase = createClient();
  const { selectedSemester } = useSemester();

  // Data States
  const [ocs, setOcs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Drawer States
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingOc, setEditingOc] = useState<any | null>(null);
  const [selectedConcept, setSelectedConcept] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  // Form Setup
  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<OcFormValues>({
    resolver: zodResolver(ocFormSchema),
    defaultValues: {
      tipo: "",
      numero_oc: "",
      monto_asignado: 0,
      descripcion: "",
    },
  });

  const loadOcsData = async () => {
    if (!selectedSemester) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/ordenes?semestre_id=${selectedSemester.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al cargar órdenes de compromiso");

      setOcs(data.ordenes || []);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSemester) {
      loadOcsData();
    }
  }, [selectedSemester]);

  // Open Drawer to Create/Edit OC
  const handleOpenDrawer = (concept: any, existingOc: any = null) => {
    if (selectedSemester?.bloqueado) return;

    setSelectedConcept(concept);
    setEditingOc(existingOc);

    if (existingOc) {
      reset({
        id: existingOc.id,
        tipo: existingOc.tipo,
        numero_oc: existingOc.numero_oc,
        monto_asignado: Number(existingOc.monto_asignado),
        descripcion: existingOc.descripcion || "",
      });
    } else {
      reset({
        tipo: concept.tipo,
        numero_oc: "",
        monto_asignado: 0,
        descripcion: "",
      });
    }

    setIsDrawerOpen(true);
  };

  // Submit Drawer Form
  const onSubmitOc = async (values: OcFormValues) => {
    if (!selectedSemester) return;
    setSaving(true);
    try {
      const payload = {
        ...values,
        semestre_id: selectedSemester.id,
      };

      const res = await fetch("/api/ordenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar asignación presupuestaria");

      toast.success(editingOc ? "Orden de Compromiso modificada." : "Orden de Compromiso guardada.");
      setIsDrawerOpen(false);
      await loadOcsData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.container}>
      <Toaster position="top-right" richColors />

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTitleGroup}>
          <h1>Órdenes de Compromiso</h1>
          <p className="text-secondary">
            Administre las partidas de presupuesto semestrales asignadas a la Secretaría.
          </p>
        </div>

        {selectedSemester?.bloqueado && (
          <div className={styles.lockAlert}>
            <Lock size={16} />
            <span>Semestre Cerrado (Solo Lectura)</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className={styles.loadingSpinner}>
          <Loader2 className={styles.spin} size={48} />
          <p>Sincronizando ejecución presupuestaria...</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {CONCEPTS.map((concept) => {
            const oc = ocs.find((o) => o.tipo === concept.tipo);

            if (!oc) {
              return (
                <div key={concept.tipo} className={styles.emptyCard}>
                  <div className={styles.emptyIconWrapper}>
                    <Plus size={24} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <h4>{concept.label}</h4>
                    <span className={`${styles.conceptBadge} ${styles[`conceptBadge_${concept.tipo}`]}`} style={{ alignSelf: "center", marginTop: "6px" }}>
                      {concept.badge}
                    </span>
                  </div>
                  <p>Sin Orden de Compromiso presupuestaria registrada para este semestre.</p>
                  
                  {!selectedSemester?.bloqueado && (
                    <button
                      onClick={() => handleOpenDrawer(concept)}
                      className={styles.createBtn}
                    >
                      <Plus size={14} />
                      <span>Cargar OC</span>
                    </button>
                  )}
                </div>
              );
            }

            // Calculations
            const asignado = Number(oc.monto_asignado);
            const ejecutado = Number(oc.monto_ejecutado);
            const remanente = asignado - ejecutado;
            const pct = asignado > 0 ? (ejecutado / asignado) * 100 : 0;

            // Semaphoric styles
            let progressClass = styles.progressGreen;
            let alertLevel: "none" | "warning" | "critical" = "none";

            if (pct >= 95) {
              progressClass = styles.progressRed;
              alertLevel = "critical";
            } else if (pct >= 80) {
              progressClass = styles.progressYellow;
              alertLevel = "warning";
            }

            return (
              <div key={concept.tipo} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardTitleGroup}>
                    <h3>{concept.label}</h3>
                    <span>OC N° {oc.numero_oc}</span>
                  </div>
                  <span className={`${styles.conceptBadge} ${styles[`conceptBadge_${concept.tipo}`]}`}>
                    {concept.badge}
                  </span>
                </div>

                <div className={styles.amountsList}>
                  <div className={styles.amountItem}>
                    <span className={styles.amountLabel}>Asignado</span>
                    <span className={styles.amountVal}>
                      ${asignado.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className={styles.amountItem}>
                    <span className={styles.amountLabel}>Ejecutado</span>
                    <span className={styles.amountVal}>
                      ${ejecutado.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className={`${styles.amountItem} ${styles.totalRow}`}>
                    <span className={styles.amountLabel}>Remanente Disponible</span>
                    <span className={styles.amountVal} style={{ color: remanente >= 0 ? "#10b981" : "#f43f5e" }}>
                      ${remanente.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className={styles.progressContainer}>
                  <div className={styles.progressLabelGroup}>
                    <span className={styles.amountLabel}>Progreso de Ejecución</span>
                    <span className={styles.progressPct} style={{ color: pct >= 95 ? "#f43f5e" : pct >= 80 ? "#f59e0b" : "#10b981" }}>
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className={styles.progressBarBg}>
                    <div
                      className={`${styles.progressBar} ${progressClass}`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </div>

                {/* Alerts */}
                {alertLevel === "warning" && (
                  <div className={`${styles.alertBox} ${styles.alertBox_warning}`}>
                    <AlertTriangle size={16} />
                    <span>Advertencia: Ejecución presupuestaria por encima del 80%.</span>
                  </div>
                )}

                {alertLevel === "critical" && (
                  <div className={`${styles.alertBox} ${styles.alertBox_critical}`}>
                    <AlertCircle size={16} />
                    <span>Crítico: Sobregiro inminente, límite del 95% superado.</span>
                  </div>
                )}

                {oc.descripcion && (
                  <p className="text-secondary" style={{ fontSize: "13px", lineHeight: "1.4", margin: "4px 0" }}>
                    {oc.descripcion}
                  </p>
                )}

                {!selectedSemester?.bloqueado && (
                  <div className={styles.cardActions}>
                    <button
                      onClick={() => handleOpenDrawer(concept, oc)}
                      className={styles.editBtn}
                    >
                      Editar Asignación
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Drawer Form to create/edit OC */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={editingOc ? `Editar OC: ${selectedConcept?.label}` : `Cargar OC: ${selectedConcept?.label}`}
        size="md"
      >
        <form onSubmit={handleSubmit(onSubmitOc)} className={styles.drawerForm}>
          <div className={styles.formGroup}>
            <label>Número de Orden de Compromiso (OC) *</label>
            <input
              type="text"
              placeholder="Ej. 1024/2026"
              className="input-field"
              {...register("numero_oc")}
            />
            {errors.numero_oc && <span className={styles.formError}>{errors.numero_oc.message}</span>}
          </div>

          <div className={styles.formGroup}>
            <label>Monto Asignado ($) *</label>
            <input
              type="number"
              step="0.01"
              placeholder="Ej. 15000000.00"
              className="input-field"
              {...register("monto_asignado", { valueAsNumber: true })}
            />
            {errors.monto_asignado && (
              <span className={styles.formError}>{errors.monto_asignado.message}</span>
            )}
          </div>

          <div className={styles.formGroup}>
            <label>Descripción / Observación</label>
            <textarea
              placeholder="Ingrese notas aclaratorias de la partida presupuestaria..."
              className="input-field"
              rows={4}
              style={{ resize: "vertical" }}
              {...register("descripcion")}
            />
            {errors.descripcion && <span className={styles.formError}>{errors.descripcion.message}</span>}
          </div>

          <div className={styles.formActions}>
            <button
              type="button"
              onClick={() => setIsDrawerOpen(false)}
              className="secondaryBtn"
              disabled={saving}
            >
              Cancelar
            </button>
            <button type="submit" className="primaryBtn" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className={styles.spin} size={14} />
                  <span>Guardando...</span>
                </>
              ) : (
                <span>Guardar Partida</span>
              )}
            </button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
