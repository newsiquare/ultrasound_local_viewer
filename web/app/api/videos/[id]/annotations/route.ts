import { NextRequest, NextResponse } from "next/server";

import { HttpError } from "@/server/errors";
import {
  normalizeAnnotationFrameId,
  normalizeAnnotationType,
  normalizeEntityId,
  normalizeGeometry,
  normalizeManualBbox,
  normalizeTextContent,
  parseCursor,
  parseLimit
} from "@/server/layer-validation";
import { ok } from "@/server/response";
import { asErrorResponse } from "@/server/route-error";
import {
  categoryExistsForVideo,
  createManualAnnotation,
  getVideoById,
  listAnnotations
} from "@/server/video-repository";
import { assertUuidV7 } from "@/server/validators";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function parseSource(value: string | null): "MANUAL" | "AI" | null {
  if (!value) {
    return null;
  }
  if (value === "MANUAL" || value === "AI") {
    return value;
  }
  throw new HttpError(400, "BAD_REQUEST", "source must be MANUAL or AI.");
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
      // Fallback: parse legacy bbox_json
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

export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { id: videoId } = await context.params;
    assertUuidV7(videoId);

    const video = await getVideoById(videoId);
    if (!video) {
      throw new HttpError(404, "NOT_FOUND", "Video not found.", { videoId });
    }

    const { searchParams } = new URL(req.url);
    const frameId = searchParams.get("frameId");
    const source = parseSource(searchParams.get("source"));
    const cursor = parseCursor(searchParams.get("cursor"));
    const limit = parseLimit(searchParams.get("limit"), 200, 1000);

    const result = await listAnnotations(videoId, {
      frameId,
      source,
      cursor,
      limit
    });

    return ok({
      videoId,
      total: result.total,
      nextCursor: result.nextCursor,
      items: result.items.map(mapAnnotation)
    });
  } catch (err) {
    return asErrorResponse(req, err);
  }
}

export async function POST(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { id: videoId } = await context.params;
    assertUuidV7(videoId);

    const video = await getVideoById(videoId);
    if (!video) {
      throw new HttpError(404, "NOT_FOUND", "Video not found.", { videoId });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const frameId = normalizeAnnotationFrameId(body.frameId);
    const categoryId = normalizeEntityId(body.categoryId, "categoryId");
    const annotationType = normalizeAnnotationType(body.annotationType);
    const geometry = normalizeGeometry(body.geometry, annotationType);
    const textContent = normalizeTextContent(body.textContent, annotationType);

    const categoryExists = await categoryExistsForVideo(videoId, categoryId);
    if (!categoryExists) {
      throw new HttpError(400, "BAD_REQUEST", "categoryId does not exist in this video.", {
        categoryId,
        videoId
      });
    }

    // For BBOX, keep bbox_json populated for legacy compatibility
    const bboxJson =
      annotationType === "BBOX" && geometry.type === "bbox"
        ? JSON.stringify({ x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height })
        : "{}";

    const created = await createManualAnnotation({
      videoId,
      frameId,
      categoryId,
      annotationType,
      geometryJson: JSON.stringify(geometry),
      textContent,
      bboxJson
    });

    return ok(mapAnnotation(created), 201);
  } catch (err) {
    return asErrorResponse(req, err);
  }
}
