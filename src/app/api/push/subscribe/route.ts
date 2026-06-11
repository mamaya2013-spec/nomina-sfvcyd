import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }

    const { subscription } = await req.json();
    if (!subscription) {
      return NextResponse.json({ error: "Suscripción requerida." }, { status: 400 });
    }

    // Save to database
    const { error } = await supabase
      .from("users")
      .update({ push_subscription: subscription })
      .eq("id", user.id);

    if (error) throw error;

    return NextResponse.json({ success: true, message: "Suscripción guardada con éxito." });
  } catch (err: any) {
    console.error("Error in /api/push/subscribe:", err);
    return NextResponse.json(
      { error: err.message || "Error al procesar la suscripción." },
      { status: 500 }
    );
  }
}
