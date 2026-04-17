import { NextRequest, NextResponse } from "next/server";

import { HttpError } from "@/server/errors";
import { normalizeEntityId, normalizeManualBbox } from "@/server/layer-validation";
import { noContent, ok } from "@/server/response";
import { asErrorResponse } from "@/server/route-error";
import {
  categoryExistsForVideo,
  deleteAnnotation,
  getAnnotationById,
  getVideoById,
  updateAnnotation
} from "@/server/video-repository";
import { assertUuidV7 } from "@/server/validators";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string; annotationId: string }>;
}

function mapAnnotation(item: {
  id: string;
  frame_id: string;
  category_id: string;
  bbox_json: string;
  created_at: string;
  updated_at: string;
}) {
  let bbox: unknown = null;
  try {
    bbox = JSON.parse(item.bbox_json);
  } catch {
    bbox = null;
  }

  return {
    id: item.id,
    frameId: item.frame_id,
    categoryId: item.category_id,
    bbox,
    bboxJson: item.bbox_json,
    createdAt: item.created_at,
    updatedAt: item.updated_at
  };
}

export async function PATCH(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { id: videoId, annotationId } = await context.params;
    assertUuidV7(videoId);

    const video = await getVideoById(videoId);
    if (!video) {
      throw new HttpError(404, "NOT_FOUND", "Video not found.", { videoId });
    }

    const existing = await getAnnotationById(videoId, annotationId);
    if (!existing) {
      throw new HttpError(404, "NOT_FOUND", "Annotation not found.", { videoId, annotationId });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const patch: {
      categoryId?: string;
      bboxJson?: string;
    } = {};

    if (body.categoryId !== undefined) {
      const categoryId = normalizeEntityId(body.categoryId, "categoryId");
      const categoryExists = await categoryExistsForVideo(videoId, categoryId);
      if (!categoryExists) {
        throw new HttpError(400, "BAD_REQUEST", "categoryId does not exist in this video.", {
          categoryId,
          videoId
        });
      }
      patch.categoryId = categoryId;
    }

    if (body.bbox !== undefined) {
      const bbox = normalizeManualBbox(body.bbox);
      patch.bboxJson = JSON.stringify(bbox);
    }

    const updated = await updateAnnotation(videoId, annotationId, patch);
    if (!updated) {
      throw new HttpError(404, "NOT_FOUND", "Annotation not found.", { videoId, annotationId });
    }

    return ok(mapAnnotation(updated));
  } catch (err) {
    return asErrorResponse(req, err);
  }
}

export async function DELETE(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { id: videoId, annotationId } = await context.params;
    assertUuidV7(videoId);

    const video = await getVideoById(videoId);
    if (!video) {
      throw new HttpError(404, "NOT_FOUND", "Video not found.", { videoId });
    }

    const existing = await getAnnotationById(videoId, annotationId);
    if (!existing) {
      throw new HttpError(404, "NOT_FOUND", "Annotation not found.", { videoId, annotationId });
    }

    await deleteAnnotation(videoId, annotationId);
    return noContent();
  } catch (err) {
    return asErrorResponse(req, err);
  }
}
