import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = "https://ntglefztorxxdixpmnaj.supabase.co";
const supabaseAnonKey = "sb_publishable_U7Rhm1kbdSWIvAOMeZeJeA_UDSuVsyl";

export const createClient = () =>
  createBrowserClient(supabaseUrl, supabaseAnonKey);
