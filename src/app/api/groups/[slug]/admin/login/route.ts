import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  createAdminSessionToken,
  setAdminSessionCookie,
  verifyAdminPassword,
} from "@/lib/admin-auth";
import { getGroupAdminAuthBySlug } from "@/lib/db";
import { getRuntimeConfig, hasSupabaseServerEnv } from "@/lib/env";
import { getErrorMessage, jsonError } from "@/lib/http";
import { adminLoginSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function POST(request: Request, context: Params) {
  if (!hasSupabaseServerEnv()) {
    return jsonError("Missing Supabase configuration.", 500);
  }

  const { adminSessionSecret } = getRuntimeConfig();
  if (!adminSessionSecret) {
    return jsonError("Missing ADMIN_SESSION_SECRET configuration.", 500);
  }

  try {
    const { slug } = await context.params;
    const payload = await request.json();
    const parsed = adminLoginSchema.parse(payload);
    const group = await getGroupAdminAuthBySlug(slug);

    if (!group) {
      return jsonError("Group not found.", 404);
    }

    const isValid = verifyAdminPassword(parsed.password, group.admin_password_hash);
    if (!isValid) {
      return jsonError("Invalid admin password.", 401);
    }

    const token = createAdminSessionToken(slug, adminSessionSecret);
    const response = NextResponse.json({
      ok: true,
    });
    setAdminSessionCookie(response, slug, token);
    return response;
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError("Please provide your admin password.", 422);
    }
    return jsonError(getErrorMessage(error), 400);
  }
}

