import { NextRequest, NextResponse } from "next/server";

import { HttpError } from "@/server/errors";
import { noContent } from "@/server/response";
import { asErrorResponse } from "@/server/route-error";
import { removeVideoAssets } from "@/server/video-files";
import { deleteVideoById, getVideoById } from "@/server/video-repository";
import { assertUuidV7 } from "@/server/validators";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    assertUuidV7(id);

    const video = await getVideoById(id);
    if (!video) {
      throw new HttpError(404, "NOT_FOUND", "Video not found.", { videoId: id });
    }

    if (video.ai_status === "PROCESSING") {
      throw new HttpError(409, "CONFLICT", "Cannot delete a video while AI is processing.");
    }

    await removeVideoAssets(id);
    await deleteVideoById(id);

    return noContent();
  } catch (err) {
    return asErrorResponse(req, err);
  }
}
