import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hashPassword } from "@/lib/portal/auth";

// Middleware checks if admin is logged in before processing
async function isAdminAuthorized() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user;
}

export async function GET(req: NextRequest) {
  try {
    if (!(await isAdminAuthorized())) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const responsableId = searchParams.get("responsable_id");

    const supabase = await createClient();

    if (!responsableId) {
      const { data, error } = await supabase
        .from("portal_credenciales")
        .select("id, responsable_id, username, activo");
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ credenciales: data });
    }

    const { data, error } = await supabase
      .from("portal_credenciales")
      .select("id, username, activo, ultimo_acceso, intentos_fallidos, bloqueado_hasta")
      .eq("responsable_id", responsableId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ credenciales: data });
  } catch (error: any) {
    console.error("Credenciales GET Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!(await isAdminAuthorized())) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { responsable_id, username, password, activo } = await req.json();

    if (!responsable_id || !username) {
      return NextResponse.json(
        { error: "responsable_id y username son requeridos" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // If password is provided, we hash it. If not, it means we might be updating active status only.
    const updateData: any = {
      responsable_id,
      username: username.trim().toLowerCase(),
    };

    if (activo !== undefined) {
      updateData.activo = activo;
    }

    if (password && password.trim() !== "") {
      if (password.length < 6) {
        return NextResponse.json(
          { error: "La contraseña debe tener al menos 6 caracteres" },
          { status: 400 }
        );
      }
      updateData.password_hash = await hashPassword(password);
      // Reset lockout status on password change
      updateData.intentos_fallidos = 0;
      updateData.bloqueado_hasta = null;
    }

    // Check if username is already taken by another responsable
    const { data: existingUser } = await supabase
      .from("portal_credenciales")
      .select("id, responsable_id")
      .eq("username", username.trim().toLowerCase())
      .maybeSingle();

    if (existingUser && existingUser.responsable_id !== responsable_id) {
      return NextResponse.json(
        { error: "El nombre de usuario ya está en uso" },
        { status: 409 }
      );
    }

    // Perform upsert (using responsable_id as the conflict target since it is UNIQUE)
    const { data, error } = await supabase
      .from("portal_credenciales")
      .upsert(updateData, { onConflict: "responsable_id" })
      .select("id, username, activo, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Credenciales guardadas correctamente",
      credenciales: data,
    });
  } catch (error: any) {
    console.error("Credenciales POST Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (!(await isAdminAuthorized())) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const responsableId = searchParams.get("responsable_id");

    if (!responsableId) {
      return NextResponse.json(
        { error: "responsable_id es requerido" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("portal_credenciales")
      .delete()
      .eq("responsable_id", responsableId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Credenciales eliminadas correctamente",
    });
  } catch (error: any) {
    console.error("Credenciales DELETE Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
