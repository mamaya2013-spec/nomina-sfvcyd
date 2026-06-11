"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Mail, AlertCircle, CheckCircle } from "lucide-react";
import styles from "../login/login.module.css";

export default function RecoveryPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      {
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard/perfil`,
      }
    );

    if (resetError) {
      setError(resetError.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
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

        <h1 className={styles.title}>Recuperar Contraseña</h1>
        <p className={styles.subtitle}>
          Ingresa tu correo para recibir un enlace de recuperación
        </p>

        {success ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px", alignItems: "center" }}>
            <div
              style={{
                background: "rgba(16, 185, 129, 0.1)",
                border: "1px solid rgba(16, 185, 129, 0.2)",
                borderRadius: "var(--border-radius-sm)",
                color: "var(--accent-emerald)",
                padding: "16px",
                fontSize: "14px",
                textAlign: "center",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <CheckCircle size={20} />
              <span>Correo enviado con éxito. Revisa tu bandeja de entrada.</span>
            </div>
            <Link href="/login" className={styles.button} style={{ textDecoration: "none", width: "100%" }}>
              Volver al Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className={styles.form}>
            {error && (
              <div className={styles.generalError}>
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className={styles.fieldGroup}>
              <label className={styles.label}>Correo Electrónico</label>
              <div className={styles.inputWrapper}>
                <Mail className={styles.inputIcon} />
                <input
                  type="email"
                  required
                  className={`${styles.input} input-field`}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@municipio.gob.ar"
                />
              </div>
            </div>

            <button type="submit" disabled={loading} className={styles.button}>
              {loading ? (
                <>
                  <div className={styles.spinner} />
                  <span>Enviando...</span>
                </>
              ) : (
                <span>Enviar Enlace</span>
              )}
            </button>

            <div style={{ textAlign: "center", marginTop: "16px" }}>
              <Link href="/login" style={{ color: "var(--text-secondary)", fontSize: "14px", textDecoration: "none" }}>
                ¿Ya tienes una cuenta? Iniciar Sesión
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
