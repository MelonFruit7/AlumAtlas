import { NextResponse } from "next/server";
import { fetchEntriesForGroup } from "@/lib/db";
import { hasSupabaseServerEnv } from "@/lib/env";
import { getErrorMessage, jsonError } from "@/lib/http";
import { aggregateMapNodes, resolveSemanticLevel } from "@/lib/map-aggregation";
import { parseBBox } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function GET(request: Request, context: Params) {
  if (!hasSupabaseServerEnv()) {
    return jsonError("Missing Supabase configuration.", 500);
  }

  try {
    const { slug } = await context.params;
    const url = new URL(request.url);
    const zoom = Number.parseFloat(url.searchParams.get("zoom") ?? "2");
    const safeZoom = Number.isFinite(zoom) ? zoom : 2;
    const semanticLevel = resolveSemanticLevel(safeZoom);
    const bbox = parseBBox(url.searchParams.get("bbox"));

    const entries = await fetchEntriesForGroup(slug, bbox);
    const nodes = aggregateMapNodes(entries, semanticLevel);

    return NextResponse.json({
      zoom: safeZoom,
      semanticLevel,
      totalEntries: entries.length,
      nodes,
    });
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}

