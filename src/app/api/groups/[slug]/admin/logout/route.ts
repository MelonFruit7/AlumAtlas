import { NextResponse } from "next/server";
import { clearAdminSessionCookie } from "@/lib/admin-auth";
import { hasSupabaseServerEnv } from "@/lib/env";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function POST(_request: Request, context: Params) {
  if (!hasSupabaseServerEnv()) {
    return jsonError("Missing Supabase configuration.", 500);
  }

  const { slug } = await context.params;
  const response = NextResponse.json({ ok: true });
  clearAdminSessionCookie(response, slug);
  return response;
}

