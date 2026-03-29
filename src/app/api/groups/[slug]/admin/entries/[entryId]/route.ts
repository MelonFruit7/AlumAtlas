import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { assertAdminSession } from "@/lib/admin-route";
import { deleteAdminEntry, updateAdminEntry } from "@/lib/db";
import { hasSupabaseServerEnv } from "@/lib/env";
import { getErrorMessage, jsonError } from "@/lib/http";
import { adminEntrySchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    slug: string;
    entryId: string;
  }>;
};

export async function PATCH(request: Request, context: Params) {
  if (!hasSupabaseServerEnv()) {
    return jsonError("Missing Supabase configuration.", 500);
  }

  try {
    const { slug, entryId } = await context.params;
    const auth = await assertAdminSession(slug);
    if (auth.missingSecret) {
      return jsonError("Missing ADMIN_SESSION_SECRET configuration.", 500);
    }
    if (!auth.ok) {
      return jsonError("Unauthorized admin session.", 401);
    }

    const payload = await request.json();
    const parsed = adminEntrySchema.parse(payload);
    const entry = await updateAdminEntry(slug, entryId, parsed);
    return NextResponse.json({ entry });
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError("Please review entry fields.", 422);
    }
    return jsonError(getErrorMessage(error), 400);
  }
}

export async function DELETE(_request: Request, context: Params) {
  if (!hasSupabaseServerEnv()) {
    return jsonError("Missing Supabase configuration.", 500);
  }

  try {
    const { slug, entryId } = await context.params;
    const auth = await assertAdminSession(slug);
    if (auth.missingSecret) {
      return jsonError("Missing ADMIN_SESSION_SECRET configuration.", 500);
    }
    if (!auth.ok) {
      return jsonError("Unauthorized admin session.", 401);
    }

    await deleteAdminEntry(slug, entryId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}

