const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  geoapifyApiKey: process.env.GEOAPIFY_API_KEY,
  adminSessionSecret: process.env.ADMIN_SESSION_SECRET,
  appBaseUrl: process.env.NEXT_PUBLIC_APP_BASE_URL,
  mapStyleUrl:
    process.env.NEXT_PUBLIC_MAP_STYLE_URL ??
    "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  deviceSalt: process.env.DEVICE_HASH_SALT ?? "wgeu-default-salt",
};

export function hasSupabaseServerEnv(): boolean {
  return Boolean(
    env.supabaseUrl && env.supabaseAnonKey && env.supabaseServiceRoleKey,
  );
}

export function hasSupabasePublicEnv(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}

export function getSupabaseServerEnv() {
  if (!hasSupabaseServerEnv()) {
    throw new Error(
      "Missing Supabase server env vars. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return {
    supabaseUrl: env.supabaseUrl!,
    supabaseAnonKey: env.supabaseAnonKey!,
    supabaseServiceRoleKey: env.supabaseServiceRoleKey!,
  };
}

export function getSupabasePublicEnv() {
  if (!hasSupabasePublicEnv()) {
    throw new Error(
      "Missing Supabase public env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  return {
    supabaseUrl: env.supabaseUrl!,
    supabaseAnonKey: env.supabaseAnonKey!,
  };
}

export function getRuntimeConfig() {
  return {
    appBaseUrl: env.appBaseUrl,
    mapStyleUrl: env.mapStyleUrl,
    deviceSalt: env.deviceSalt,
    geoapifyApiKey: env.geoapifyApiKey,
    adminSessionSecret: env.adminSessionSecret,
  };
}
