"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Bell, BellOff, BellRing, Loader2, Send, Terminal } from "lucide-react";
import { toast, Toaster } from "sonner";
import styles from "./push.module.css";

// VAPID Public Key (Must match server)
const VAPID_PUBLIC_KEY = "BOU_k1heyr4j18PNyL1DHEN0t_UBW-DA3Tx1d0Kc2LVAiJoezw13c96LZQEfHEB1lcv6zkq-SZRiPF7ulgmwRHQ";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function PushConfigPage() {
  const [permission, setPermission] = useState<string>("default");
  const [subscribing, setSubscribing] = useState(false);
  const [hasSubscription, setHasSubscription] = useState(false);
  const [isSupported, setIsSupported] = useState(true);

  // Trigger form states
  const [title, setTitle] = useState("Alerta de Seguridad - Nómina");
  const [body, setBody] = useState("Se ha procesado una nueva liquidación mensual.");
  const [targetUrl, setTargetUrl] = useState("/dashboard/liquidaciones");
  const [triggering, setTriggering] = useState(false);

  // Terminal console logs
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string, type: "info" | "success" | "error" = "info") => {
    const timestamp = new Date().toLocaleTimeString("es-AR");
    setLogs((prev) => [`[${timestamp}] ${msg}`, ...prev]);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkSupport = async () => {
      const pushSupported = "serviceWorker" in navigator && "PushManager" in window;
      setIsSupported(pushSupported);

      if (pushSupported) {
        setPermission(Notification.permission);
        addLog(`Estado de permisos del navegador: ${Notification.permission}`);

        // Check if user is already subscribed
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.getSubscription();
        setHasSubscription(!!sub);
        if (sub) {
          addLog("Suscripción activa encontrada en el service worker.");
        } else {
          addLog("Sin suscripción activa local.");
        }
      } else {
        addLog("Este navegador NO soporta Web Push Notifications o Service Workers.", "error");
      }
    };

    checkSupport();
  }, []);

  // Request permission & subscribe
  const handleSubscribe = async () => {
    if (!isSupported) return;
    setSubscribing(true);
    addLog("Iniciando solicitud de suscripción...");

    try {
      const userPermission = await Notification.requestPermission();
      setPermission(userPermission);
      addLog(`Permiso otorgado por el usuario: ${userPermission}`);

      if (userPermission !== "granted") {
        toast.error("Permiso de notificaciones denegado.");
        addLog("Suscripción abortada: permiso denegado.", "error");
        setSubscribing(false);
        return;
      }

      addLog("Obteniendo registro de Service Worker...");
      const registration = await navigator.serviceWorker.ready;

      // Subscribe to Push
      addLog("Generando suscripción pushManager con llave VAPID...");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      addLog("Suscripción generada con éxito. Guardando en base de datos...");
      
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ subscription }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Error al enviar al servidor.");

      setHasSubscription(true);
      toast.success("Suscripción realizada con éxito.");
      addLog("Suscripción persistida en el perfil del usuario Supabase.", "success");
    } catch (err: any) {
      console.error("Subscription error:", err);
      toast.error("Error al suscribirse: " + err.message);
      addLog("Fallo en la suscripción: " + err.message, "error");
    } finally {
      setSubscribing(false);
    }
  };

  // Broadcast test notification
  const handleTriggerTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !body) {
      toast.warning("Complete título y cuerpo para enviar.");
      return;
    }

    setTriggering(true);
    addLog(`Encolando envío de notificación masiva: "${title}"...`);

    try {
      const response = await fetch("/api/push/trigger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title, body, url: targetUrl }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Error al emitir.");

      const s = data.summary;
      toast.success("Notificación emitida correctamente.");
      addLog(`Transmisión completada. Destinatarios: ${s.total_recipients} | In-App creadas: ${s.in_app_notifications_created} | Push enviadas: ${s.push_notifications_sent} | Push fallidas: ${s.push_notifications_failed}`, "success");
    } catch (err: any) {
      console.error("Trigger error:", err);
      toast.error("Error al enviar test: " + err.message);
      addLog("Error al disparar notificación: " + err.message, "error");
    } finally {
      setTriggering(false);
    }
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
        <h1>Notificaciones Push y Alertas</h1>
        <p className="text-secondary">
          Configure las notificaciones Web Push API del navegador para recibir avisos de vencimientos, auditoría y desvíos presupuestarios en tiempo real.
        </p>
      </div>

      <div className={styles.grid}>
        {/* Left Side: Subscription Settings */}
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Suscripción del Navegador</h3>
          <p className="text-secondary" style={{ fontSize: "13.5px", lineHeight: "1.5" }}>
            Habilite este servicio para que el sistema le envíe notificaciones emergentes, incluso cuando la pestaña de la aplicación esté cerrada en segundo plano.
          </p>

          <div className={styles.statusWrapper}>
            <div
              className={`${styles.statusIndicator} ${
                permission === "granted" ? styles.granted : permission === "denied" ? styles.denied : styles.default
              }`}
            />
            <div>
              <div className={styles.statusText}>
                {permission === "granted"
                  ? "Permiso Otorgado"
                  : permission === "denied"
                  ? "Permiso Bloqueado"
                  : "Permiso Pendiente"}
              </div>
              <div className={styles.statusDesc}>
                {permission === "granted"
                  ? "El navegador permite alertas emergentes."
                  : permission === "denied"
                  ? "Habilite los permisos en el candado de la barra del navegador."
                  : "Haga clic abajo para otorgar permisos de alerta."}
              </div>
            </div>
          </div>

          <button
            onClick={handleSubscribe}
            className={styles.primaryBtn}
            disabled={subscribing || !isSupported || permission === "denied"}
          >
            {subscribing ? (
              <>
                <Loader2 className="spin" size={16} />
                <span>Suscribiendo...</span>
              </>
            ) : hasSubscription ? (
              <>
                <BellRing size={16} />
                <span>Actualizar Suscripción</span>
              </>
            ) : (
              <>
                <Bell size={16} />
                <span>Activar Alertas Push</span>
              </>
            )}
          </button>
        </div>

        {/* Right Side: Push Triggering & Demo */}
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Enviar Notificación de Prueba</h3>
          <p className="text-secondary" style={{ fontSize: "13.5px" }}>
            Dispare una notificación en vivo que se distribuirá a todos los usuarios del sistema que tengan alertas configuradas.
          </p>

          <form onSubmit={handleTriggerTest} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div className={styles.formGroup}>
              <label>Título del Aviso</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={styles.textInput}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label>Cuerpo del Mensaje</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className={styles.textareaInput}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label>URL de Redirección (Al hacer clic)</label>
              <input
                type="text"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                className={styles.textInput}
              />
            </div>

            <button type="submit" className={styles.primaryBtn} disabled={triggering}>
              {triggering ? (
                <>
                  <Loader2 className="spin" size={16} />
                  <span>Enviando Aviso...</span>
                </>
              ) : (
                <>
                  <Send size={16} />
                  <span>Emitir Notificación</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Terminal logs box */}
      <div className={styles.card}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-primary)" }}>
          <Terminal size={18} />
          <h3 className={styles.cardTitle} style={{ fontSize: "16px" }}>
            Consola de Consistencia y Logs
          </h3>
        </div>
        <div className={styles.logBox}>
          {logs.length === 0 ? (
            <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Consola inactiva. Esperando acciones...</span>
          ) : (
            logs.map((log, index) => {
              let logClass = styles.logItem;
              if (log.includes("éxito") || log.includes("activa") || log.includes("otorgado")) logClass = styles.logItemHighlight;
              if (log.includes("Error") || log.includes("Fallo") || log.includes("NO soporta")) logClass = styles.logItemError;
              return (
                <div key={index} className={logClass}>
                  {log}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
