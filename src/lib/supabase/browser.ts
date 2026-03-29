import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv } from "@/lib/env";

let client: ReturnType<typeof createClient> | null = null;

export function getSupabaseBrowserClient() {
  if (client === null) {
    const { supabaseUrl, supabaseAnonKey } = getSupabasePublicEnv();
    client = createClient(supabaseUrl, supabaseAnonKey);
  }

  return client;
}
