import { createClient } from "@supabase/supabase-js";

// Supabase schema types are not generated in this MVP; keep the admin client loose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let client: any = null;

export function getStorageMode(): "supabase" | "local" {
  return hasSupabaseConfig() ? "supabase" : "local";
}

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

export function hasSupabaseConfig(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function assertPersistentStorageConfigured(): void {
  if (isProductionRuntime() && !hasSupabaseConfig()) {
    throw new Error("Persistent storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in production.");
  }
}

export function getSupabaseAdmin() {
  if (!hasSupabaseConfig()) {
    throw new Error("supabase not configured");
  }

  if (!client) {
    client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return client;
}
