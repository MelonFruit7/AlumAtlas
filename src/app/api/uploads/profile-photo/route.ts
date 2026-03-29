import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSupabaseServerEnv, hasSupabaseServerEnv } from "@/lib/env";
import { getErrorMessage, jsonError } from "@/lib/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { photoUploadRequestSchema } from "@/lib/validation";

const BUCKET = "profile-photos";
const MIME_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!hasSupabaseServerEnv()) {
    return jsonError("Missing Supabase configuration.", 500);
  }

  try {
    const payload = await request.json();
    const parsed = photoUploadRequestSchema.parse(payload);
    const extension = MIME_TO_EXTENSION[parsed.fileType] ?? "jpg";
    const path = `uploads/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${extension}`;

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);

    if (error || !data) {
      throw new Error("Could not create upload URL.");
    }

    const { supabaseUrl } = getSupabaseServerEnv();
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}`;

    return NextResponse.json({
      bucket: BUCKET,
      path: data.path,
      token: data.token,
      signedUrl: data.signedUrl,
      publicUrl,
    });
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}

