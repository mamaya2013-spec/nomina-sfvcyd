"use client";

import React from "react";
import styles from "./status-badge.module.css";

interface StatusBadgeProps {
  status: string;
  type?: "person" | "document" | "campaign" | "generic";
}

export default function StatusBadge({ status, type = "generic" }: StatusBadgeProps) {
  const normalizedStatus = status.toLowerCase().trim();

  let statusClass = styles.badge;
  let text = status;

  if (normalizedStatus === "activo" || normalizedStatus === "aprobado" || normalizedStatus === "vigente") {
    statusClass += ` ${styles.active}`;
    text = normalizedStatus === "activo" ? "Activo" : normalizedStatus === "aprobado" ? "Aprobado" : "Vigente";
  } else if (normalizedStatus === "baja" || normalizedStatus === "rechazado" || normalizedStatus === "vencido" || normalizedStatus === "inactivo") {
    statusClass += ` ${styles.inactive}`;
    text = normalizedStatus === "baja" ? "Baja" : normalizedStatus === "inactivo" ? "Inactivo" : normalizedStatus === "rechazado" ? "Rechazado" : "Vencido";
  } else if (normalizedStatus === "pendiente" || normalizedStatus === "por_vencer" || normalizedStatus === "por vencer") {
    statusClass += ` ${styles.pending}`;
    text = normalizedStatus === "pendiente" ? "Pendiente" : "Por Vencer";
  } else {
    statusClass += ` ${styles.info}`;
  }

  return (
    <span className={statusClass}>
      <span className={styles.dot} />
      {text}
    </span>
  );
}
