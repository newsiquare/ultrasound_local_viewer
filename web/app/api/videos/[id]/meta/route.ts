import { NextRequest, NextResponse } from "next/server";

import { HttpError } from "@/server/errors";
import { ok } from "@/server/response";
import { asErrorResponse } from "@/server/route-error";
import { readMetadata } from "@/server/video-files";
import { getAiJobByVideoId, getVideoById } from "@/server/video-repository";
import { assertUuidV7 } from "@/server/validators";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    assertUuidV7(id);

    const video = await getVideoById(id);
    if (!video) {
      throw new HttpError(404, "NOT_FOUND", "Video not found.", { videoId: id });
    }

    const metadata = await readMetadata(id);
    const aiJob = await getAiJobByVideoId(id);

    return ok({
      videoId: id,
      filename: video.filename,
      uploadedAt: video.uploaded_at,
      metadata,
      ai: {
        status: video.ai_status,
        jobStatus: aiJob?.status ?? video.ai_status,
        errorMessage: aiJob?.error_message ?? null,
        updatedAt: aiJob?.updated_at ?? video.updated_at,
        count: video.ai_count,
        detectedFrames: video.ai_detected_frames,
        categoryCount: video.ai_category_count,
        statsUpdatedAt: video.ai_stats_updated_at
      },
      timeline: {
        status: video.timeline_status,
        error: video.timeline_error
      }
    });
  } catch (err) {
    return asErrorResponse(req, err);
  }
}
