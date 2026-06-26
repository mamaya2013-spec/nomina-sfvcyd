"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Mail, Lock, AlertCircle, User } from "lucide-react";
import styles from "./login.module.css";

export default function LoginPage() {
  const [role, setRole] = useState<"admin" | "responsable">("admin");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (role === "admin") {
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
    } else {
      try {
        const res = await fetch("/api/portal/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: username.trim().toLowerCase(),
            password,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Credenciales de ingreso inválidas");
          setLoading(false);
          return;
        }

        if (data.success) {
          // Refresh session and redirect to portal dashboard
          router.refresh();
          router.push("/portal/dashboard");
        }
      } catch (err: any) {
        setError(err.message || "Error al iniciar sesión");
        setLoading(false);
      }
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

        <h1 className={styles.title}>NOMINA SFVCyD</h1>
        <p className={styles.subtitle}>Gestión de Becarios y Monotributistas</p>

        <div className={styles.roleTabs}>
          <button
            type="button"
            className={`${styles.roleTabBtn} ${role === "admin" ? styles.active : ""}`}
            onClick={() => {
              setRole("admin");
              setError(null);
            }}
          >
            Administrador
          </button>
          <button
            type="button"
            className={`${styles.roleTabBtn} ${role === "responsable" ? styles.active : ""}`}
            onClick={() => {
              setRole("responsable");
              setError(null);
            }}
          >
            Responsable
          </button>
        </div>

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

          {role === "admin" ? (
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
          ) : (
            <div className={styles.fieldGroup}>
              <label className={styles.label}>Nombre de Usuario</label>
              <div className={styles.inputWrapper}>
                <User className={styles.inputIcon} />
                <input
                  type="text"
                  required
                  className={`${styles.input} input-field`}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Ej. j_perez"
                  autoComplete="off"
                />
              </div>
            </div>
          )}

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

