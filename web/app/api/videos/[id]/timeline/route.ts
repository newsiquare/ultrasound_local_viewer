import { NextRequest, NextResponse } from "next/server";

import { HttpError } from "@/server/errors";
import { ok } from "@/server/response";
import { asErrorResponse } from "@/server/route-error";
import { readTimeline } from "@/server/video-files";
import { assertUuidV7 } from "@/server/validators";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    assertUuidV7(id);

    const { searchParams } = new URL(req.url);
    const cursorRaw = searchParams.get("cursor");
    const limitRaw = searchParams.get("limit");

    const cursor = cursorRaw ? Number.parseInt(cursorRaw, 10) : 0;
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 500;

    if (!Number.isFinite(cursor) || cursor < 0 || !Number.isFinite(limit) || limit <= 0) {
      throw new HttpError(400, "BAD_REQUEST", "Invalid cursor/limit query params.");
    }

    const timeline = await readTimeline(id);
    const start = Math.min(cursor, timeline.frames.length);
    const end = Math.min(start + limit, timeline.frames.length);

    return ok({
      videoId: id,
      total: timeline.frames.length,
      nextCursor: end >= timeline.frames.length ? null : end,
      items: timeline.frames.slice(start, end)
    });
  } catch (err) {
    return asErrorResponse(req, err);
  }
}
