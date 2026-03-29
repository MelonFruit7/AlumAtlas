import { getRuntimeConfig } from "@/lib/env";
import { isAdminSessionValid } from "@/lib/admin-auth";

export async function assertAdminSession(slug: string): Promise<{
  ok: boolean;
  missingSecret: boolean;
}> {
  const { adminSessionSecret } = getRuntimeConfig();
  if (!adminSessionSecret) {
    return {
      ok: false,
      missingSecret: true,
    };
  }

  const ok = await isAdminSessionValid(slug, adminSessionSecret);
  return {
    ok,
    missingSecret: false,
  };
}

