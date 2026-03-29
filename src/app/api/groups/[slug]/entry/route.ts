import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { GROUP_SUBMISSIONS_LOCKED_ERROR, upsertGroupEntry } from "@/lib/db";
import { hasSupabaseServerEnv } from "@/lib/env";
import { getErrorMessage, jsonError } from "@/lib/http";
import { LocationLookupError } from "@/lib/location";
import { createEntrySchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function POST(request: Request, context: Params) {
  if (!hasSupabaseServerEnv()) {
    return jsonError("Missing Supabase configuration.", 500);
  }

  try {
    const { slug } = await context.params;
    const payload = await request.json();
    const parsed = createEntrySchema.parse(payload);
    const entry = await upsertGroupEntry(slug, parsed);
    return NextResponse.json({ entry });
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError("Please review your entry fields and try again.", 422);
    }

    if (error instanceof LocationLookupError) {
      return jsonError(error.message, error.status);
    }

    const message = getErrorMessage(error);
    if (message === "Group was not found.") {
      return jsonError(message, 404);
    }

    if (message === GROUP_SUBMISSIONS_LOCKED_ERROR) {
      return jsonError(message, 423);
    }

    if (
      message.includes("LinkedIn URL") ||
      message.includes("company domain") ||
      message.includes("Please provide")
    ) {
      return jsonError(message, 422);
    }

    return jsonError("Could not save this submission right now.", 500);
  }
}
