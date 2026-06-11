"use client";

import { useState } from "react";
import styles from "./notification-panel.module.css";

interface Notification {
  id: string;
  title: string;
  message: string;
  time: string;
}

export default function NotificationPanel({
  onClose,
}: {
  onClose: () => void;
}) {
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: "1",
      title: "Seguro por Vencer",
      message: "El seguro de Juan Pérez vence en 15 días.",
      time: "Hace 10 min",
    },
    {
      id: "2",
      title: "Orden de Compromiso",
      message: "La OC de Becas ha superado el 80% de ejecución.",
      time: "Hace 1 hora",
    },
  ]);

  const clearAll = () => {
    setNotifications([]);
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Notificaciones</span>
        {notifications.length > 0 && (
          <button className={styles.clearButton} onClick={clearAll}>
            Limpiar todo
          </button>
        )}
      </div>

      <div className={styles.list}>
        {notifications.length === 0 ? (
          <div className={styles.empty}>No tienes nuevas notificaciones</div>
        ) : (
          notifications.map((notif) => (
            <div key={notif.id} className={styles.item}>
              <span className={styles.itemTitle}>{notif.title}</span>
              <span className={styles.itemBody}>{notif.message}</span>
              <span className={styles.itemTime}>{notif.time}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
