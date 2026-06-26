"use client";

import { useState } from "react";
import Image from "next/image";
import { User, Lock, AlertCircle } from "lucide-react";
import { usePortalAuth } from "@/lib/contexts/PortalAuthContext";
import styles from "./login.module.css";

export default function PortalLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { login } = usePortalAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await login(username, password);
    } catch (err: any) {
      setError(err.message || "Error al iniciar sesión");
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.backgroundDecorations}>
        <div className={styles.glowCircle1} />
        <div className={styles.glowCircle2} />
      </div>

      <div className={`${styles.card} glass-panel glass-panel-hover`}>
        <div className={styles.logoWrapper}>
          <Image
            src="/logo_ok.png"
            alt="Logo Secretaría"
            width={300}
            height={80}
            className={styles.logo}
            priority
          />
        </div>

        <h1 className={styles.title}>PORTAL RESPONSABLES</h1>
        <p className={styles.subtitle}>Panel de Consulta y Gestión de Personal</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          {error && (
            <div className={styles.generalError}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className={styles.fieldGroup}>
            <label className={styles.label}>Usuario</label>
            <div className={styles.inputWrapper}>
              <User className={styles.inputIcon} />
              <input
                type="text"
                required
                className={`${styles.input} input-field`}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Nombre de usuario"
                autoCapitalize="none"
                autoComplete="username"
              />
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label}>Contraseña</label>
            <div className={styles.inputWrapper}>
              <Lock className={styles.inputIcon} />
              <input
                type="password"
                required
                className={`${styles.input} input-field`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
          </div>

          <button type="submit" disabled={loading} className={styles.button}>
            {loading ? (
              <>
                <div className={styles.spinner} />
                <span>Iniciando sesión...</span>
              </>
            ) : (
              <span>Ingresar al Portal</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
