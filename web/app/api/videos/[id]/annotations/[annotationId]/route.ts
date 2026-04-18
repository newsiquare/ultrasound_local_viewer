import { NextRequest, NextResponse } from "next/server";

import { HttpError } from "@/server/errors";
import { normalizeEntityId } from "@/server/layer-validation";
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
  annotation_type: string;
  geometry_json: string | null;
  text_content: string | null;
  is_visible: number;
  bbox_json: string;
  created_at: string;
  updated_at: string;
}) {
  let geometry: unknown = null;
  try {
    if (item.geometry_json) {
      geometry = JSON.parse(item.geometry_json);
    } else {
      const b = JSON.parse(item.bbox_json) as { x: number; y: number; width: number; height: number };
      geometry = { type: "bbox", x: b.x, y: b.y, width: b.width, height: b.height };
    }
  } catch {
    geometry = null;
  }

  return {
    id: item.id,
    frameId: item.frame_id,
    categoryId: item.category_id,
    annotationType: item.annotation_type,
    geometry,
    geometryJson: item.geometry_json ?? item.bbox_json,
    textContent: item.text_content,
    isVisible: item.is_visible !== 0,
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
      isVisible?: boolean;
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

    if (body.isVisible !== undefined) {
      if (typeof body.isVisible !== "boolean") {
        throw new HttpError(400, "BAD_REQUEST", "isVisible must be a boolean.");
      }
      patch.isVisible = body.isVisible;
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
