"use client";

import React, { useState, useEffect } from "react";
import {
  Users,
  Briefcase,
  AlertTriangle,
  Layers,
  HelpCircle,
} from "lucide-react";
import { useSemester } from "@/lib/contexts/SemesterContext";
import styles from "./montos.module.css";

interface BecaCategory {
  id: string;
  numero_categoria: number;
  monto: number;
  porcentaje_activa?: number;
  monto_activa?: number;
  total?: number;
}

interface MonoCategory {
  id: string;
  letra: string;
  descripcion_categoria?: string;
  monto: number;
  porcentaje_activa?: number;
  monto_activa?: number;
  total?: number;
}

export default function PortalMontosPage() {
  const { selectedSemester } = useSemester();
  
  const [becas, setBecas] = useState<BecaCategory[]>([]);
  const [monotributistas, setMonotributistas] = useState<MonoCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedSemester) return;
    const semesterId = selectedSemester.id;
    
    async function fetchMontos() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/portal/montos?semestre_id=${semesterId}`);
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || "Error al obtener las categorías");
        }
        const data = await res.json();
        setBecas(data.becas || []);
        setMonotributistas(data.monotributistas || []);
      } catch (err: any) {
        console.error("Error loading categories:", err);
        setError(err.message || "Error al cargar la información de montos.");
      } finally {
        setLoading(false);
      }
    }

    fetchMontos();
  }, [selectedSemester]);

  // Format currency helper
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Get active percentage (usually matches across categories)
  const activePercentage = 
    becas[0]?.porcentaje_activa ?? 
    monotributistas[0]?.porcentaje_activa ?? 
    10;

  if (loading) {
    return (
      <div className={styles.loadingState}>
        <div className={styles.spinner} />
        <p>Cargando categorías y montos vigentes...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${styles.emptyState} glass-panel`}>
        <AlertTriangle className={styles.emptyIcon} size={48} style={{ color: "var(--accent-rose)" }} />
        <h3>Error al Cargar Información</h3>
        <p className="text-secondary">{error}</p>
      </div>
    );
  }

  const hasData = becas.length > 0 || monotributistas.length > 0;

  if (!hasData) {
    return (
      <div className={styles.container}>
        <div className={`${styles.headerCard} glass-panel`}>
          <div className={styles.headerInfo}>
            <h1>Categorías y Montos</h1>
            <p className="text-secondary">
              Tablas de importes para el período seleccionado.
            </p>
          </div>
        </div>
        
        <div className={`${styles.emptyState} glass-panel`}>
          <HelpCircle className={styles.emptyIcon} size={48} />
          <h3>Sin Configuración</h3>
          <p className="text-secondary">
            No se han configurado categorías de importes para el semestre {selectedSemester?.nombre_display || ""}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header Info */}
      <div className={`${styles.headerCard} glass-panel`}>
        <div className={styles.headerInfo}>
          <h1>Categorías y Montos</h1>
          <p className="text-secondary">
            Tablas oficiales de importes y adicionales vigentes para el semestre{" "}
            <span className="font-bold text-white">
              {selectedSemester?.nombre_display}
            </span>.
          </p>
        </div>
        <div className={styles.badgeActiveCard}>
          <div className="w-2 h-2 rounded-full bg-emerald" />
          <span>Tarjeta Activa: {activePercentage}%</span>
        </div>
      </div>

      {/* Grid of tables */}
      <div className={styles.grid}>
        
        {/* Becas Card */}
        {becas.length > 0 && (
          <div className={`${styles.tableCard} glass-panel`}>
            <div className={styles.tableCardHeader}>
              <Users className={styles.iconBeca} size={20} />
              <h2>Categorías de Becarios</h2>
            </div>
            
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Nivel</th>
                    <th>Importe Base</th>
                    <th>Tarjeta Activa</th>
                    <th>Total Mensual</th>
                  </tr>
                </thead>
                <tbody>
                  {becas.map((c) => {
                    const base = Number(c.monto);
                    const pct = c.porcentaje_activa ?? activePercentage;
                    const activa = c.monto_activa ?? (base * pct) / 100;
                    const total = c.total ?? base + activa;

                    return (
                      <tr key={c.id || c.numero_categoria}>
                        <td className={`${styles.catCol} ${styles.becaCat}`}>
                          Categoría {c.numero_categoria}
                        </td>
                        <td className={styles.monoText}>
                          {formatCurrency(base)}
                        </td>
                        <td className={`${styles.monoText} ${styles.amountMuted}`}>
                          {formatCurrency(activa)}
                        </td>
                        <td className={`${styles.monoText} ${styles.amountTotal}`}>
                          {formatCurrency(total)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Monotributo Card */}
        {monotributistas.length > 0 && (
          <div className={`${styles.tableCard} glass-panel`}>
            <div className={styles.tableCardHeader}>
              <Briefcase className={styles.iconMono} size={20} />
              <h2>Categorías de Monotributistas</h2>
            </div>
            
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Nivel</th>
                    <th>Función / Cargo</th>
                    <th>Importe Base</th>
                    <th>Tarjeta Activa</th>
                    <th>Total Mensual</th>
                  </tr>
                </thead>
                <tbody>
                  {monotributistas.map((c) => {
                    const base = Number(c.monto);
                    const pct = c.porcentaje_activa ?? activePercentage;
                    const activa = c.monto_activa ?? (base * pct) / 100;
                    const total = c.total ?? base + activa;

                    return (
                      <tr key={c.id || c.letra}>
                        <td className={`${styles.catCol} ${styles.monoCat}`}>
                          Nivel {c.letra}
                        </td>
                        <td className={styles.descText}>
                          {c.descripcion_categoria || "Tareas Generales"}
                        </td>
                        <td className={styles.monoText}>
                          {formatCurrency(base)}
                        </td>
                        <td className={`${styles.monoText} ${styles.amountMuted}`}>
                          {formatCurrency(activa)}
                        </td>
                        <td className={`${styles.monoText} ${styles.amountTotal}`}>
                          {formatCurrency(total)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
