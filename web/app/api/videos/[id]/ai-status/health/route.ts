import { NextRequest, NextResponse } from "next/server";

import { HttpError } from "@/server/errors";
import { ok } from "@/server/response";
import { openRiskEvent, resolveRiskEvent } from "@/server/risk-events";
import { asErrorResponse } from "@/server/route-error";
import { getVideoById } from "@/server/video-repository";
import { assertUuidV7 } from "@/server/validators";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface HealthBody {
  state?: unknown;
  reason?: unknown;
}

const RISK_CODE = "SSE_UNSTABLE_OR_BUFFERED";

type HealthState = "HEALTHY" | "DEGRADED";

function parseState(raw: unknown): HealthState {
  if (raw === "HEALTHY" || raw === "DEGRADED") {
    return raw;
  }
  throw new HttpError(400, "BAD_REQUEST", "state must be HEALTHY or DEGRADED.");
}

function parseReason(raw: unknown): string | null {
  if (raw === undefined || raw === null) {
    return null;
  }

  const text = String(raw).trim();
  if (!text) {
    return null;
  }

  return text.slice(0, 200);
}

export async function POST(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { id: videoId } = await context.params;
    assertUuidV7(videoId);

    const video = await getVideoById(videoId);
    if (!video) {
      throw new HttpError(404, "NOT_FOUND", "Video not found.", { videoId });
    }

    let rawBody: HealthBody;
    try {
      rawBody = (await req.json()) as HealthBody;
    } catch {
      throw new HttpError(400, "BAD_REQUEST", "Invalid JSON body.");
    }
    const state = parseState(rawBody.state);
    const reason = parseReason(rawBody.reason);

    if (state === "DEGRADED") {
      await openRiskEvent({
        riskCode: RISK_CODE,
        severity: "P1",
        triggerSource: "SSE_HEALTH",
        latestNote: reason ?? "SSE_DEGRADED",
        videoId
      });
    } else {
      await resolveRiskEvent({
        riskCode: RISK_CODE,
        triggerSource: "SSE_HEALTH",
        latestNote: reason ?? "SSE_RECOVERED",
        videoId
      });
    }

    return ok({
      videoId,
      state,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    return asErrorResponse(req, err);
  }
}
