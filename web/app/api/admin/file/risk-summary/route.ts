import { NextRequest, NextResponse } from "next/server";

import { isAuthorizedAdmin, unauthorizedBasic } from "@/server/auth-basic";
import { queryRows } from "@/server/db";
import { ok } from "@/server/response";
import { asErrorResponse } from "@/server/route-error";

export const runtime = "nodejs";

interface ConsistencyRow {
  consistency_status: string;
  last_checked_at: string;
}

function mapSeverity(consistencyStatus: string): "P0" | "P1" | "P2" {
  if (
    consistencyStatus === "MISSING_FILE" ||
    consistencyStatus === "ORPHAN_DB" ||
    consistencyStatus === "ORPHAN_FS"
  ) {
    return "P0";
  }
  if (
    consistencyStatus === "MISSING_METADATA" ||
    consistencyStatus === "MISSING_AI_RESULT" ||
    consistencyStatus === "PROCESSING_LOCKED"
  ) {
    return "P1";
  }
  return "P2";
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorizedAdmin(req)) {
    return unauthorizedBasic();
  }

  try {
    const rows = await queryRows<ConsistencyRow>(`
SELECT consistency_status, last_checked_at
FROM video_consistency;
`);

    const now = Date.now();
    const threshold = now - 24 * 60 * 60 * 1000;

    let openP0 = 0;
    let openP1 = 0;
    let openP2 = 0;
    let new24h = 0;
    let resolved24h = 0;

    for (const row of rows) {
      const status = row.consistency_status;
      const isOpen = status !== "HEALTHY";
      const severity = mapSeverity(status);
      const checkedMs = Date.parse(row.last_checked_at);
      const recent = Number.isFinite(checkedMs) ? checkedMs >= threshold : false;

      if (isOpen) {
        if (severity === "P0") {
          openP0 += 1;
        } else if (severity === "P1") {
          openP1 += 1;
        } else {
          openP2 += 1;
        }
        if (recent) {
          new24h += 1;
        }
      } else if (recent) {
        resolved24h += 1;
      }
    }

    return ok({
      generated_at: new Date().toISOString(),
      open_p0: openP0,
      open_p1: openP1,
      open_p2: openP2,
      new_24h: new24h,
      resolved_24h: resolved24h
    });
  } catch (err) {
    return asErrorResponse(req, err);
  }
}
