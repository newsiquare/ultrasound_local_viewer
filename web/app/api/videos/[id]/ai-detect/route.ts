import { NextRequest, NextResponse } from "next/server";

import { startAiDetectTask } from "@/server/ai-runner";
import { ok } from "@/server/response";
import { asErrorResponse } from "@/server/route-error";
import { assertUuidV7 } from "@/server/validators";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    assertUuidV7(id);

    const result = await startAiDetectTask(id);
    return ok({
      videoId: id,
      status: result.status,
      updatedAt: result.updatedAt
    });
  } catch (err) {
    return asErrorResponse(req, err);
  }
}
