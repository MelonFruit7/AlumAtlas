import { NextResponse } from "next/server";
import { getGroupBySlug } from "@/lib/db";
import { hasSupabaseServerEnv } from "@/lib/env";
import { getErrorMessage, jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, context: Params) {
  if (!hasSupabaseServerEnv()) {
    return jsonError("Missing Supabase configuration.", 500);
  }

  try {
    const { slug } = await context.params;
    const group = await getGroupBySlug(slug);

    if (!group) {
      return jsonError("Group not found.", 404);
    }

    return NextResponse.json({ group });
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}

