import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseUrl = "https://ntglefztorxxdixpmnaj.supabase.co";
const supabaseAnonKey = "sb_publishable_U7Rhm1kbdSWIvAOMeZeJeA_UDSuVsyl";

export const createClient = async () => {
  const cookieStore = await cookies();

  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },
      },
    }
  );
};
