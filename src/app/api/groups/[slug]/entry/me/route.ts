import { NextResponse } from "next/server";
import { getEntryForDevice, getGroupBySlug } from "@/lib/db";
import { hasSupabaseServerEnv } from "@/lib/env";
import { getErrorMessage, jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function GET(request: Request, context: Params) {
  if (!hasSupabaseServerEnv()) {
    return jsonError("Missing Supabase configuration.", 500);
  }

  try {
    const { slug } = await context.params;
    const group = await getGroupBySlug(slug);
    if (!group) {
      return jsonError("Group not found.", 404);
    }

    const url = new URL(request.url);
    const deviceToken = (url.searchParams.get("deviceToken") ?? "").trim();
    if (deviceToken.length < 8) {
      return jsonError("Missing valid device token.", 422);
    }

    const entry = await getEntryForDevice(slug, deviceToken);
    return NextResponse.json({ entry });
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}

