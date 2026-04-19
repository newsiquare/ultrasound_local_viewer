import { NextRequest, NextResponse } from "next/server";

import { queryRows, sqlString } from "@/server/db";
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

type AuditEventType = "RECONCILE_APPLY" | "CLEANUP_APPLY" | "RISK_EVENT_MANUAL";

const ALLOWED_EVENT_TYPES: AuditEventType[] = [
  "RECONCILE_APPLY",
  "CLEANUP_APPLY",
  "RISK_EVENT_MANUAL"
];

function parseEventType(value: string | null): AuditEventType | null {
  if (!value || value === "ALL") {
    return null;
  }
  if (ALLOWED_EVENT_TYPES.includes(value as AuditEventType)) {
    return value as AuditEventType;
  }
  throw new HttpError(
    400,
    "BAD_REQUEST",
    "eventType must be ALL, RECONCILE_APPLY, CLEANUP_APPLY, or RISK_EVENT_MANUAL."
  );
}

function parseMaybeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function includesVideoId(parsed: unknown, videoId: string): boolean {
  const visited = new Set<unknown>();

  function visit(value: unknown, parentKey?: string): boolean {
    if (value === null || value === undefined) {
      return false;
    }

    if (
      typeof value === "string" &&
      (parentKey === "videoId" ||
        parentKey === "video_id")
    ) {
      return value === videoId;
    }

    if (
      Array.isArray(value) &&
      (parentKey === "videoIds" || parentKey === "candidateIds")
    ) {
      return value.some((entry) => String(entry) === videoId);
    }

    if (typeof value !== "object") {
      return false;
    }
    if (visited.has(value)) {
      return false;
    }
    visited.add(value);

    if (Array.isArray(value)) {
      return value.some((entry) => visit(entry, parentKey));
    }

    const obj = value as Record<string, unknown>;
    if (obj.videoId === videoId || obj.video_id === videoId) {
      return true;
    }

    for (const [key, nested] of Object.entries(obj)) {
      if (visit(nested, key)) {
        return true;
      }
    }
    return false;
  }

  return visit(parsed);
}

export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { videoId } = await context.params;
    if (!videoId) {
      throw new HttpError(400, "BAD_REQUEST", "videoId is required.");
    }
    assertUuidV7(videoId);

    const { searchParams } = new URL(req.url);
    const page = parsePositiveInt(searchParams.get("page"), 1, Number.MAX_SAFE_INTEGER);
    const pageSize = parsePositiveInt(searchParams.get("pageSize"), 20, 200);
    const eventType = parseEventType(searchParams.get("eventType"));
    const offset = (page - 1) * pageSize;
    const whereSql = eventType
      ? `WHERE event_type IN ('RECONCILE_APPLY', 'CLEANUP_APPLY', 'RISK_EVENT_MANUAL') AND event_type = ${sqlString(eventType)}`
      : "WHERE event_type IN ('RECONCILE_APPLY', 'CLEANUP_APPLY', 'RISK_EVENT_MANUAL')";

    const rows = await queryRows<AuditRow>(`
SELECT
  id,
  event_type,
  actor,
  payload_json,
  result_json,
  created_at
FROM audit_log
${whereSql}
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
