import { NextRequest, NextResponse } from "next/server";

import { DEFAULT_BOOTSTRAP_WINDOW, MAX_BOOTSTRAP_WINDOW } from "@/server/constants";
import { HttpError } from "@/server/errors";
import { ok } from "@/server/response";
import { asErrorResponse } from "@/server/route-error";
import { readMetadata, readTimeline } from "@/server/video-files";
import {
  getAiJobByVideoId,
  getAnnotationsByVideoAndFrameIds,
  getCategoriesByVideoId,
  getVideoById
} from "@/server/video-repository";
import { assertUuidV7 } from "@/server/validators";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function parseWindow(
  rawValue: string | null,
  fallback: number,
  max: number,
  key: string
): number {
  if (!rawValue) {
    return fallback;
  }
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new HttpError(400, "BAD_REQUEST", `Invalid query parameter: ${key}`);
  }
  return Math.min(parsed, max);
}

export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    assertUuidV7(id);

    const video = await getVideoById(id);
    if (!video) {
      throw new HttpError(404, "NOT_FOUND", "Video not found.", { videoId: id });
    }

    const { searchParams } = new URL(req.url);
    const windowBefore = parseWindow(
      searchParams.get("windowBefore"),
      DEFAULT_BOOTSTRAP_WINDOW,
      MAX_BOOTSTRAP_WINDOW,
      "windowBefore"
    );
    const windowAfter = parseWindow(
      searchParams.get("windowAfter"),
      DEFAULT_BOOTSTRAP_WINDOW,
      MAX_BOOTSTRAP_WINDOW,
      "windowAfter"
    );
    const currentFrame = parseWindow(searchParams.get("currentFrame"), 1, Number.MAX_SAFE_INTEGER, "currentFrame");

    const [metadata, timeline, categories, aiJob] = await Promise.all([
      readMetadata(id),
      readTimeline(id),
      getCategoriesByVideoId(id),
      getAiJobByVideoId(id)
    ]);

    const totalFrames = timeline.frames.length;
    const currentDisplayIndex = Math.max(1, Math.min(totalFrames, currentFrame));
    const startDisplayIndex = Math.max(1, currentDisplayIndex - windowBefore);
    const endDisplayIndex = Math.min(totalFrames, currentDisplayIndex + windowAfter);

    const frameWindow = timeline.frames.slice(startDisplayIndex - 1, endDisplayIndex);
    const frameIds = frameWindow.map((frame) => frame.frameId);
    const annotations = await getAnnotationsByVideoAndFrameIds(id, frameIds);

    return ok({
      videoId: id,
      meta: {
        filename: video.filename,
        uploadedAt: video.uploaded_at,
        ...metadata
      },
      timelineSummary: {
        totalFrames,
        firstPtsUs: timeline.frames[0]?.ptsUs ?? null,
        lastPtsUs: timeline.frames[totalFrames - 1]?.ptsUs ?? null,
        currentDisplayIndex,
        timelineStatus: video.timeline_status,
        window: {
          startDisplayIndex,
          endDisplayIndex
        }
      },
      categories,
      annotationsCurrentWindow: annotations,
      aiStatus: aiJob?.status ?? video.ai_status,
      aiSummary: {
        aiCount: video.ai_count,
        aiDetectedFrames: video.ai_detected_frames,
        aiCategoryCount: video.ai_category_count,
        aiStatsUpdatedAt: video.ai_stats_updated_at,
        errorMessage: aiJob?.error_message ?? null
      }
    });
  } catch (err) {
    return asErrorResponse(req, err);
  }
}
