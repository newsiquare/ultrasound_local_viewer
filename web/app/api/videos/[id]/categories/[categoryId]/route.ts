import { NextRequest, NextResponse } from "next/server";

import { HttpError } from "@/server/errors";
import { normalizeCategoryName, normalizeHexColor } from "@/server/layer-validation";
import { noContent, ok } from "@/server/response";
import { asErrorResponse } from "@/server/route-error";
import {
  deleteCategory,
  getCategoryById,
  getCategoryByNameIgnoreCase,
  getVideoById,
  updateCategory
} from "@/server/video-repository";
import { assertUuidV7 } from "@/server/validators";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string; categoryId: string }>;
}

export async function PATCH(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { id: videoId, categoryId } = await context.params;
    assertUuidV7(videoId);

    const video = await getVideoById(videoId);
    if (!video) {
      throw new HttpError(404, "NOT_FOUND", "Video not found.", { videoId });
    }

    const target = await getCategoryById(videoId, categoryId);
    if (!target) {
      throw new HttpError(404, "NOT_FOUND", "Category not found.", { videoId, categoryId });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const patch: {
      name?: string;
      color?: string;
      isVisible?: boolean;
    } = {};

    if (body.name !== undefined) {
      const nextName = normalizeCategoryName(body.name);
      const duplicated = await getCategoryByNameIgnoreCase(videoId, nextName);
      if (duplicated && duplicated.id !== categoryId) {
        throw new HttpError(409, "CONFLICT", "Category name already exists.", {
          categoryId: duplicated.id,
          name: duplicated.name
        });
      }
      patch.name = nextName;
    }

    if (body.color !== undefined) {
      patch.color = normalizeHexColor(body.color);
    }

    if (body.isVisible !== undefined) {
      if (typeof body.isVisible !== "boolean") {
        throw new HttpError(400, "BAD_REQUEST", "isVisible must be a boolean.");
      }
      patch.isVisible = body.isVisible;
    }

    const updated = await updateCategory(videoId, categoryId, patch);
    if (!updated) {
      throw new HttpError(404, "NOT_FOUND", "Category not found.", { videoId, categoryId });
    }

    return ok(updated);
  } catch (err) {
    return asErrorResponse(req, err);
  }
}

export async function DELETE(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { id: videoId, categoryId } = await context.params;
    assertUuidV7(videoId);

    const video = await getVideoById(videoId);
    if (!video) {
      throw new HttpError(404, "NOT_FOUND", "Video not found.", { videoId });
    }

    const target = await getCategoryById(videoId, categoryId);
    if (!target) {
      throw new HttpError(404, "NOT_FOUND", "Category not found.", { videoId, categoryId });
    }

    if (target.source === "AI") {
      throw new HttpError(409, "CONFLICT", "AI categories cannot be deleted.", {
        categoryId,
        source: target.source
      });
    }

    if (Number(target.annotation_count ?? 0) > 0) {
      throw new HttpError(409, "CONFLICT", "Category is referenced by annotations.", {
        categoryId,
        annotationCount: target.annotation_count
      });
    }

    await deleteCategory(videoId, categoryId);
    return noContent();
  } catch (err) {
    return asErrorResponse(req, err);
  }
}
