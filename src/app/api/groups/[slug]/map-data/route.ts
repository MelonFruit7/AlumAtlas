import { NextResponse } from "next/server";
import { fetchEntriesForGroup } from "@/lib/db";
import { hasSupabaseServerEnv } from "@/lib/env";
import { getErrorMessage, jsonError } from "@/lib/http";
import {
  buildStateDotMapNodes,
  resolveSemanticLevel,
} from "@/lib/state-dot-pipeline";

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
    const debugStateDots = url.searchParams.get("debugStateDots") === "1";
    const semanticLevel = resolveSemanticLevel(safeZoom);

    const entries = await fetchEntriesForGroup(slug, null);
    const result = buildStateDotMapNodes(entries, semanticLevel, {
      debugStateDots,
    });

    return NextResponse.json({
      zoom: safeZoom,
      semanticLevel,
      totalEntries: entries.length,
      nodes: result.nodes,
    });
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}
