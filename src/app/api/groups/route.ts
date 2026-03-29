import { NextResponse } from "next/server";
import { createGroup } from "@/lib/db";
import { getRuntimeConfig, hasSupabaseServerEnv } from "@/lib/env";
import { getErrorMessage, jsonError } from "@/lib/http";
import { createGroupSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!hasSupabaseServerEnv()) {
    return jsonError("Missing Supabase configuration.", 500);
  }

  try {
    const payload = await request.json();
    const parsed = createGroupSchema.parse(payload);
    const group = await createGroup(parsed);
    const { appBaseUrl } = getRuntimeConfig();
    const origin = appBaseUrl || new URL(request.url).origin;

    return NextResponse.json({
      group,
      shareUrl: `${origin}/g/${group.slug}`,
      adminUrl: `${origin}/g/${group.slug}/admin`,
    });
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}
