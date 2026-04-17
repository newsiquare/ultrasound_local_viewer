import { NextRequest, NextResponse } from "next/server";

import { readAiStatusSnapshot } from "@/server/ai-status";
import { ok } from "@/server/response";
import { asErrorResponse } from "@/server/route-error";
import { assertUuidV7 } from "@/server/validators";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    assertUuidV7(id);

    const snapshot = await readAiStatusSnapshot(id);
    return ok(snapshot);
  } catch (err) {
    return asErrorResponse(req, err);
  }
}
