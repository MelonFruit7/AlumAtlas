import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { assertAdminSession } from "@/lib/admin-route";
import { updateGroupAdminSettings } from "@/lib/db";
import { hasSupabaseServerEnv } from "@/lib/env";
import { getErrorMessage, jsonError } from "@/lib/http";
import { adminSettingsSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function PATCH(request: Request, context: Params) {
  if (!hasSupabaseServerEnv()) {
    return jsonError("Missing Supabase configuration.", 500);
  }

  try {
    const { slug } = await context.params;
    const auth = await assertAdminSession(slug);
    if (auth.missingSecret) {
      return jsonError("Missing ADMIN_SESSION_SECRET configuration.", 500);
    }
    if (!auth.ok) {
      return jsonError("Unauthorized admin session.", 401);
    }

    const payload = await request.json();
    const parsed = adminSettingsSchema.parse(payload);
    const group = await updateGroupAdminSettings(slug, parsed);
    return NextResponse.json({ group });
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError("Please provide valid board settings.", 422);
    }
    return jsonError(getErrorMessage(error), 400);
  }
}

