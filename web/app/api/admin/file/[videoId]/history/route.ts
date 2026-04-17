import { NextRequest, NextResponse } from "next/server";

import { isAuthorizedAdmin, unauthorizedBasic } from "@/server/auth-basic";
import { queryRows } from "@/server/db";
import { HttpError } from "@/server/errors";
import { ok } from "@/server/response";
import { asErrorResponse } from "@/server/route-error";
import { assertUuidV7, parsePositiveInt } from "@/server/validators";

export const runtime = "nodejs";

interface AuditRow {
  id: string;
  event_type: string;
  actor: string;
  payload_json: string;
  result_json: string;
  created_at: string;
}

interface RouteContext {
  params: Promise<{ videoId: string }>;
}

function parseMaybeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function includesVideoId(parsed: unknown, videoId: string): boolean {
  if (!parsed || typeof parsed !== "object") {
    return false;
  }

  const obj = parsed as Record<string, unknown>;
  if (obj.videoId === videoId || obj.video_id === videoId) {
    return true;
  }

  const videoIds = obj.videoIds;
  if (Array.isArray(videoIds) && videoIds.some((value) => String(value) === videoId)) {
    return true;
  }

  const candidateIds = obj.candidateIds;
  if (Array.isArray(candidateIds) && candidateIds.some((value) => String(value) === videoId)) {
    return true;
  }

  const items = obj.items;
  if (Array.isArray(items)) {
    for (const item of items) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const parsedItem = item as Record<string, unknown>;
      if (parsedItem.videoId === videoId || parsedItem.video_id === videoId) {
        return true;
      }
    }
  }

  const candidates = obj.candidates;
  if (Array.isArray(candidates)) {
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== "object") {
        continue;
      }
      const parsedCandidate = candidate as Record<string, unknown>;
      if (parsedCandidate.videoId === videoId || parsedCandidate.video_id === videoId) {
        return true;
      }
    }
  }

  return false;
}

export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  if (!isAuthorizedAdmin(req)) {
    return unauthorizedBasic();
  }

  try {
    const { videoId } = await context.params;
    if (!videoId) {
      throw new HttpError(400, "BAD_REQUEST", "videoId is required.");
    }
    assertUuidV7(videoId);

    const { searchParams } = new URL(req.url);
    const page = parsePositiveInt(searchParams.get("page"), 1, Number.MAX_SAFE_INTEGER);
    const pageSize = parsePositiveInt(searchParams.get("pageSize"), 20, 200);
    const offset = (page - 1) * pageSize;

    const rows = await queryRows<AuditRow>(`
SELECT
  id,
  event_type,
  actor,
  payload_json,
  result_json,
  created_at
FROM audit_log
WHERE event_type IN ('RECONCILE_APPLY', 'CLEANUP_APPLY')
ORDER BY created_at DESC;
`);

    const mapped = rows
      .map((row) => {
        const payload = parseMaybeJson(row.payload_json);
        const result = parseMaybeJson(row.result_json);
        return {
          id: row.id,
          event_type: row.event_type,
          actor: row.actor,
          payload,
          result,
          created_at: row.created_at
        };
      })
      .filter((row) => includesVideoId(row.payload, videoId) || includesVideoId(row.result, videoId));

    return ok({
      page,
      pageSize,
      total: mapped.length,
      items: mapped.slice(offset, offset + pageSize)
    });
  } catch (err) {
    return asErrorResponse(req, err);
  }
}
