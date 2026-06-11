import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = 'edge';

export async function GET() {
  try {
    const supabase = await createClient();
    
    // Run a lightweight query to keep the DB connection alive
    const { data, error } = await supabase
      .from("semestres")
      .select("id, nombre_display")
      .limit(1);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      database: "connected",
      semester: data?.[0] || null,
    });
  } catch (err: any) {
    console.error("Keep-Alive database ping failed:", err);
    return NextResponse.json(
      {
        success: false,
        timestamp: new Date().toISOString(),
        error: err.message || "Conexión a la base de datos fallida.",
      },
      { status: 500 }
    );
  }
}
