import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import webpush from "web-push";

// Auto-generate VAPID keys for demo/fallback if not set in environment
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "BOU_k1heyr4j18PNyL1DHEN0t_UBW-DA3Tx1d0Kc2LVAiJoezw13c96LZQEfHEB1lcv6zkq-SZRiPF7ulgmwRHQ";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "Tp61EHe4RFRFS5Sfs7EVzdpDQAzcB_p3LLGFRJYt3PA";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@sfvcyd.gov.ar";

try {
  webpush.setVapidDetails(
    VAPID_SUBJECT,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
} catch (err) {
  console.warn("VAPID keys configuration warning:", err);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  try {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }

    const { title, body, url } = await req.json();
    if (!title || !body) {
      return NextResponse.json({ error: "Título y cuerpo son requeridos." }, { status: 400 });
    }

    // Fetch all active users
    const { data: dbUsers, error: usersErr } = await supabase
      .from("users")
      .select("id, push_subscription, rol")
      .eq("activo", true);

    if (usersErr) throw usersErr;

    const usersList = dbUsers || [];
    let pushSentCount = 0;
    let pushFailedCount = 0;
    let inAppSentCount = 0;

    // Broadcast notifications
    const broadcastPromises = usersList.map(async (user) => {
      // 1. Create In-App Notification (always succeeds)
      const { error: notifyErr } = await supabase
        .from("notificaciones")
        .insert({
          usuario_id: user.id,
          titulo: title,
          mensaje: body,
          tipo: "alerta",
          link: url || "/dashboard",
          leida: false
        });

      if (!notifyErr) {
        inAppSentCount++;
      }

      // 2. Dispatch Web Push if subscription exists
      if (user.push_subscription) {
        try {
          const payload = JSON.stringify({
            title,
            body,
            url: url || "/dashboard"
          });

          await webpush.sendNotification(user.push_subscription as any, payload);
          pushSentCount++;
        } catch (pushErr: any) {
          console.error(`Failed to send push to user ${user.id}:`, pushErr);
          pushFailedCount++;

          // If subscription has expired/invalid, clear it from database
          if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
            await supabase
              .from("users")
              .update({ push_subscription: null })
              .eq("id", user.id);
          }
        }
      }
    });

    await Promise.all(broadcastPromises);

    return NextResponse.json({
      success: true,
      summary: {
        total_recipients: usersList.length,
        in_app_notifications_created: inAppSentCount,
        push_notifications_sent: pushSentCount,
        push_notifications_failed: pushFailedCount
      }
    });
  } catch (err: any) {
    console.error("Error in POST /api/push/trigger:", err);
    return NextResponse.json(
      { error: err.message || "Error al emitir notificaciones." },
      { status: 500 }
    );
  }
}
