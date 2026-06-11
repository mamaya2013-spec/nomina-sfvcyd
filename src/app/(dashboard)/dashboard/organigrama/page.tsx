"use client";

import dynamic from "next/dynamic";
import styles from "./organigrama.module.css";

const OrganigramaClient = dynamic(
  () => import("./OrganigramaClient"),
  {
    ssr: false,
    loading: () => (
      <div className={styles.container} style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <span style={{ color: "var(--text-secondary)" }}>Cargando Organigrama...</span>
      </div>
    ),
  }
);

export default function OrganigramaPage() {
  return <OrganigramaClient />;
}
