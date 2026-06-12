"use client";

import React from "react";
import Link from "next/link";
import { UserCheck, Building2, Layers, Key, ShieldCheck, Tag, BellRing } from "lucide-react";
import styles from "./configuracion.module.css";

export default function ConfiguracionPage() {
  return (
    <div className={styles.container}>
      <div className={`${styles.header} glass-panel`}>
        <h1>Configuración del Sistema</h1>
        <p className="text-secondary">
          Administre los parámetros globales, estructura orgánica, y seguridad del sistema.
        </p>
      </div>

      <div className={styles.grid}>
        <Link href="/dashboard/configuracion/responsables" className={`${styles.card} glass-panel glass-panel-hover`}>
          <div className={styles.iconWrapper}>
            <UserCheck size={28} className="text-blue" />
          </div>
          <div className={styles.cardContent}>
            <h3>Responsables</h3>
            <p>Administre los responsables de quienes depende el personal y sus asignaciones.</p>
          </div>
        </Link>

        <Link href="/dashboard/configuracion/organica" className={`${styles.card} glass-panel glass-panel-hover`}>
          <div className={styles.iconWrapper}>
            <Building2 size={28} className="text-pink" />
          </div>
          <div className={styles.cardContent}>
            <h3>Estructura Orgánica</h3>
            <p>Administre las subsecretarías, áreas operativas y prioridades de visualización.</p>
          </div>
        </Link>

        <Link href="/dashboard/configuracion/tags" className={`${styles.card} glass-panel glass-panel-hover`}>
          <div className={styles.iconWrapper}>
            <Tag size={28} className="text-purple" />
          </div>
          <div className={styles.cardContent}>
            <h3>Etiquetas (Tags)</h3>
            <p>Gestión y paletas de colores para las etiquetas de categorización libre de agentes.</p>
          </div>
        </Link>

        <Link href="/dashboard/configuracion/validador" className={`${styles.card} glass-panel glass-panel-hover`}>
          <div className={styles.iconWrapper}>
            <ShieldCheck size={28} className="text-emerald" />
          </div>
          <div className={styles.cardContent}>
            <h3>Validador de Datos</h3>
            <p>Motor de auditoría para detectar inconsistencias en CUILs, CBU o seguros de vida.</p>
          </div>
        </Link>

        <Link href="/dashboard/configuracion/push" className={`${styles.card} glass-panel glass-panel-hover`}>
          <div className={styles.iconWrapper}>
            <BellRing size={28} className="text-amber" />
          </div>
          <div className={styles.cardContent}>
            <h3>Notificaciones Push</h3>
            <p>Configuración del servicio Web Push, permisos de alerta y envíos de prueba.</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
