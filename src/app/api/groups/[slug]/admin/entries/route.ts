import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { assertAdminSession } from "@/lib/admin-route";
import { createAdminEntry, fetchEntriesForAdmin, getGroupBySlug } from "@/lib/db";
import { hasSupabaseServerEnv } from "@/lib/env";
import { getErrorMessage, jsonError } from "@/lib/http";
import { adminEntrySchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, context: Params) {
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

    const group = await getGroupBySlug(slug);
    if (!group) {
      return jsonError("Group not found.", 404);
    }

    const entries = await fetchEntriesForAdmin(slug);
    return NextResponse.json({
      group,
      entries,
    });
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}

export async function POST(request: Request, context: Params) {
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
    const parsed = adminEntrySchema.parse(payload);
    const entry = await createAdminEntry(slug, parsed);
    return NextResponse.json({ entry });
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError("Please review entry fields.", 422);
    }
    return jsonError(getErrorMessage(error), 400);
  }
}

