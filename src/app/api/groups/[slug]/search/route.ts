import { NextResponse } from "next/server";
import { getGroupBySlug, searchEntriesForGroup } from "@/lib/db";
import { hasSupabaseServerEnv } from "@/lib/env";
import { getErrorMessage, jsonError } from "@/lib/http";
import { searchLocations } from "@/lib/location";
import type { SearchResult } from "@/types/domain";

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
    const q = url.searchParams.get("q") ?? "";
    const [people, locations] = await Promise.all([
      searchEntriesForGroup(slug, q, 6),
      searchLocations(q),
    ]);
    const locationResults = locations.slice(0, 6).map((result) => ({
      kind: "location" as const,
      ...result,
    }));
    const results: SearchResult[] = [...people, ...locationResults];
    return NextResponse.json({ results });
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}
