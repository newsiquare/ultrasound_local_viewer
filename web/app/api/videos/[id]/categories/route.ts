import { NextRequest, NextResponse } from "next/server";

import { HttpError } from "@/server/errors";
import { normalizeCategoryName, normalizeHexColor } from "@/server/layer-validation";
import { ok } from "@/server/response";
import { asErrorResponse } from "@/server/route-error";
import {
  createManualCategory,
  getCategoriesByVideoId,
  getCategoryByNameIgnoreCase,
  getVideoById
} from "@/server/video-repository";
import { assertUuidV7 } from "@/server/validators";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { id: videoId } = await context.params;
    assertUuidV7(videoId);

    const video = await getVideoById(videoId);
    if (!video) {
      throw new HttpError(404, "NOT_FOUND", "Video not found.", { videoId });
    }

    const categories = await getCategoriesByVideoId(videoId);
    return ok(categories);
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
    const name = normalizeCategoryName(body.name);
    const color = normalizeHexColor(body.color);

    const duplicated = await getCategoryByNameIgnoreCase(videoId, name);
    if (duplicated) {
      throw new HttpError(409, "CONFLICT", "Category name already exists.", {
        categoryId: duplicated.id,
        name: duplicated.name
      });
    }

    const created = await createManualCategory(videoId, name, color);
    return ok(created, 201);
  } catch (err) {
    return asErrorResponse(req, err);
  }
}
