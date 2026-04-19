import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

import { NextRequest, NextResponse } from "next/server";

import { HttpError } from "@/server/errors";
import { extractThumb } from "@/server/ffprobe";
import { asErrorResponse } from "@/server/route-error";
import { sourceVideoPath, thumbPath } from "@/server/video-files";
import { getVideoById } from "@/server/video-repository";
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

    const outPath = thumbPath(id);

    if (!existsSync(outPath)) {
      const srcPath = sourceVideoPath(id);
      if (!existsSync(srcPath)) {
        throw new HttpError(404, "NOT_FOUND", "Source video file not found.", { videoId: id });
      }
      await extractThumb(id, srcPath);
    }

    const buf = await readFile(outPath);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400, immutable"
      }
    });
  } catch (err) {
    return asErrorResponse(req, err);
  }
}
