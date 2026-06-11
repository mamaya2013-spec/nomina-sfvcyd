"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Mail, Lock, AlertCircle } from "lucide-react";
import styles from "./login.module.css";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    // Refresh session and redirect to dashboard
    router.refresh();
    router.push("/dashboard");
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

        <h1 className={styles.title}>NOMINA SFVCyD</h1>
        <p className={styles.subtitle}>Gestión de Becarios y Monotributistas</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          {error && (
            <div className={styles.generalError}>
              <AlertCircle size={16} />
              <span>
                {error === "Invalid login credentials"
                  ? "Credenciales de ingreso inválidas"
                  : error}
              </span>
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
              <span>Ingresar al Sistema</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
