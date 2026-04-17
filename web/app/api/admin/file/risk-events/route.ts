import { NextRequest, NextResponse } from "next/server";

import { isAuthorizedAdmin, unauthorizedBasic } from "@/server/auth-basic";
import { queryRows } from "@/server/db";
import { HttpError } from "@/server/errors";
import { ok } from "@/server/response";
import { asErrorResponse } from "@/server/route-error";
import { parsePositiveInt } from "@/server/validators";

export const runtime = "nodejs";

interface ConsistencyRow {
  video_id: string;
  consistency_status: string;
  consistency_reason: string | null;
  last_checked_at: string;
  check_source: string;
}

type RiskStatus = "OPEN" | "RESOLVED";
type RiskSeverity = "P0" | "P1" | "P2";

function mapSeverity(consistencyStatus: string): RiskSeverity {
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

function mapStatus(consistencyStatus: string): RiskStatus {
  return consistencyStatus === "HEALTHY" ? "RESOLVED" : "OPEN";
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorizedAdmin(req)) {
    return unauthorizedBasic();
  }

  try {
    const { searchParams } = new URL(req.url);
    const page = parsePositiveInt(searchParams.get("page"), 1, Number.MAX_SAFE_INTEGER);
    const pageSize = parsePositiveInt(searchParams.get("pageSize"), 20, 200);

    const statusRaw = searchParams.get("status");
    const severityRaw = searchParams.get("severity");
    const riskCodeRaw = searchParams.get("riskCode")?.trim() ?? "";

    const status: RiskStatus | null =
      !statusRaw || statusRaw === "ALL"
        ? null
        : statusRaw === "OPEN" || statusRaw === "RESOLVED"
          ? statusRaw
          : null;
    if (statusRaw && statusRaw !== "ALL" && !status) {
      throw new HttpError(400, "BAD_REQUEST", "status must be OPEN or RESOLVED.");
    }

    const severity: RiskSeverity | null =
      !severityRaw || severityRaw === "ALL"
        ? null
        : severityRaw === "P0" || severityRaw === "P1" || severityRaw === "P2"
          ? severityRaw
          : null;
    if (severityRaw && severityRaw !== "ALL" && !severity) {
      throw new HttpError(400, "BAD_REQUEST", "severity must be P0, P1, or P2.");
    }

    const rows = await queryRows<ConsistencyRow>(`
SELECT
  video_id,
  consistency_status,
  consistency_reason,
  last_checked_at,
  check_source
FROM video_consistency
ORDER BY last_checked_at DESC;
`);

    const mapped = rows.map((row) => {
      const mappedStatus = mapStatus(row.consistency_status);
      const mappedSeverity = mapSeverity(row.consistency_status);
      return {
        risk_code: row.consistency_status,
        severity: mappedSeverity,
        status: mappedStatus,
        trigger_time: row.last_checked_at,
        resolved_time: mappedStatus === "RESOLVED" ? row.last_checked_at : null,
        trigger_source: row.check_source ?? null,
        owner: null as string | null,
        latest_note: row.consistency_reason,
        video_id: row.video_id
      };
    });

    const filtered = mapped.filter((item) => {
      if (status && item.status !== status) {
        return false;
      }
      if (severity && item.severity !== severity) {
        return false;
      }
      if (riskCodeRaw && item.risk_code !== riskCodeRaw) {
        return false;
      }
      return true;
    });

    const total = filtered.length;
    const offset = (page - 1) * pageSize;
    const items = filtered.slice(offset, offset + pageSize);

    return ok({
      page,
      pageSize,
      total,
      items
    });
  } catch (err) {
    return asErrorResponse(req, err);
  }
}
