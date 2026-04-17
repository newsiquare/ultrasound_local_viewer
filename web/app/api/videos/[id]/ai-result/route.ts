import { NextRequest, NextResponse } from "next/server";

import { HttpError } from "@/server/errors";
import { readAiResult, removeAiAssets } from "@/server/video-files";
import { getAiJobByVideoId, getVideoById, resetAiToIdle } from "@/server/video-repository";
import { noContent, ok } from "@/server/response";
import { asErrorResponse } from "@/server/route-error";
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

    const coco = await readAiResult(id);
    return ok({
      videoId: id,
      status: video.ai_status,
      summary: {
        aiCount: video.ai_count,
        aiDetectedFrames: video.ai_detected_frames,
        aiCategoryCount: video.ai_category_count,
        aiStatsUpdatedAt: video.ai_stats_updated_at
      },
      coco
    });
  } catch (err) {
    return asErrorResponse(req, err);
  }
}

export async function DELETE(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    assertUuidV7(id);

    const video = await getVideoById(id);
    if (!video) {
      throw new HttpError(404, "NOT_FOUND", "Video not found.", { videoId: id });
    }

    const job = await getAiJobByVideoId(id);
    if (video.ai_status === "PROCESSING" || job?.status === "PROCESSING") {
      throw new HttpError(409, "CONFLICT", "Cannot clear AI result while processing.", { videoId: id });
    }

    await removeAiAssets(id);
    await resetAiToIdle(id);
    return noContent();
  } catch (err) {
    return asErrorResponse(req, err);
  }
}
