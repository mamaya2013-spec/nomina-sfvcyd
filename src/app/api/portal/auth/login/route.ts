import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  comparePassword,
  createPortalToken,
  PORTAL_COOKIE_NAME,
  isAccountLocked,
  shouldLockAccount,
  getLockoutUntil,
  MAX_FAILED_ATTEMPTS,
} from "@/lib/portal/auth";

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: "Usuario y contraseña son requeridos" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // 1. Get credentials and join with responsable details
    const { data: cred, error: credError } = await supabase
      .from("portal_credenciales")
      .select(`
        id,
        responsable_id,
        password_hash,
        activo,
        intentos_fallidos,
        bloqueado_hasta,
        responsables (
          nombre_completo,
          subsecretarias_ids,
          areas_ids,
          cargo
        )
      `)
      .eq("username", username.trim().toLowerCase())
      .single();

    if (credError || !cred) {
      return NextResponse.json(
        { error: "Credenciales inválidas" },
        { status: 401 }
      );
    }

    // 2. Check if active
    if (!cred.activo) {
      return NextResponse.json(
        { error: "Su cuenta está desactivada. Contacte al administrador." },
        { status: 403 }
      );
    }

    // 3. Check lockout
    if (isAccountLocked(cred.bloqueado_hasta)) {
      const minutesLeft = Math.ceil(
        (new Date(cred.bloqueado_hasta).getTime() - new Date().getTime()) / 60000
      );
      return NextResponse.json(
        { error: `Cuenta bloqueada temporalmente. Intente nuevamente en ${minutesLeft} minutos.` },
        { status: 423 }
      );
    }

    // Get client request info for logs
    const ipAddress = req.headers.get("x-forwarded-for") || (req as any).ip || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    // 4. Verify password
    const isPasswordValid = await comparePassword(password, cred.password_hash);

    if (!isPasswordValid) {
      const newAttempts = (cred.intentos_fallidos || 0) + 1;
      const willLock = shouldLockAccount(newAttempts);
      const lockoutUntil = willLock ? getLockoutUntil() : null;

      // Update failed attempts and lockout if needed
      await supabase
        .from("portal_credenciales")
        .update({
          intentos_fallidos: newAttempts,
          bloqueado_hasta: lockoutUntil,
        })
        .eq("id", cred.id);

      // Log failed access
      await supabase.from("portal_sesiones_log").insert({
        responsable_id: cred.responsable_id,
        accion: "login_fallido",
        ip_address: ipAddress,
        user_agent: userAgent,
      });

      if (willLock) {
        return NextResponse.json(
          { error: `Demasiados intentos fallidos. Su cuenta ha sido bloqueada por 15 minutos.` },
          { status: 423 }
        );
      }

      return NextResponse.json(
        {
          error: "Credenciales inválidas",
          intentos_restantes: Math.max(0, MAX_FAILED_ATTEMPTS - newAttempts),
        },
        { status: 401 }
      );
    }

    // 5. Login successful: Reset lock state and update access time
    await supabase
      .from("portal_credenciales")
      .update({
        intentos_fallidos: 0,
        bloqueado_hasta: null,
        ultimo_acceso: new Date().toISOString(),
      })
      .eq("id", cred.id);

    // Log successful access
    await supabase.from("portal_sesiones_log").insert({
      responsable_id: cred.responsable_id,
      accion: "login",
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    const responsable = Array.isArray(cred.responsables)
      ? cred.responsables[0]
      : cred.responsables;

    if (!responsable) {
      return NextResponse.json(
        { error: "No se encontraron datos del responsable asociado" },
        { status: 500 }
      );
    }

    const esSecretario =
      responsable.cargo?.toLowerCase() === "secretario" ||
      username.trim().toLowerCase() === "secretario";

    // 6. Create session JWT
    const tokenPayload = {
      responsable_id: cred.responsable_id,
      username: username.trim().toLowerCase(),
      nombre_completo: responsable.nombre_completo,
      subsecretarias_ids: responsable.subsecretarias_ids || [],
      areas_ids: responsable.areas_ids || [],
      es_secretario: esSecretario,
    };

    const token = await createPortalToken(tokenPayload);

    // 7. Create response and set cookie
    const response = NextResponse.json({
      success: true,
      user: {
        responsable_id: tokenPayload.responsable_id,
        username: tokenPayload.username,
        nombre_completo: tokenPayload.nombre_completo,
        es_secretario: esSecretario,
      },
    });

    response.cookies.set(PORTAL_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 8 * 60 * 60, // 8 hours
    });

    return response;
  } catch (error: any) {
    console.error("Login API Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
