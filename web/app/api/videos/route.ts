import { NextRequest, NextResponse } from "next/server";

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/server/constants";
import { ok } from "@/server/response";
import { asErrorResponse } from "@/server/route-error";
import { listVideos } from "@/server/video-repository";
import { parsePositiveInt } from "@/server/validators";

export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const page = parsePositiveInt(searchParams.get("page"), 1, Number.MAX_SAFE_INTEGER);
    const pageSize = parsePositiveInt(searchParams.get("pageSize"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    const result = await listVideos(page, pageSize);
    return ok(result);
  } catch (err) {
    return asErrorResponse(req, err);
  }
}
