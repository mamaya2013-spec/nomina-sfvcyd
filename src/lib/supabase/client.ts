import { createBrowserClient } from "@supabase/ssr";

export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ntglefztorxxdixpmnaj.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_U7Rhm1kbdSWIvAOMeZeJeA_UDSuVsyl"
  );
