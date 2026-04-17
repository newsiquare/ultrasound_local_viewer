import { NextRequest, NextResponse } from "next/server";

import { isAuthorizedAdmin, unauthorizedBasic } from "@/server/auth-basic";
import { queryRows, sqlString } from "@/server/db";
import { HttpError } from "@/server/errors";
import { ok } from "@/server/response";
import { asErrorResponse } from "@/server/route-error";
import { parsePositiveInt } from "@/server/validators";

export const runtime = "nodejs";

interface CountRow {
  total: number;
}

type RiskStatus = "OPEN" | "RESOLVED";
type RiskSeverity = "P0" | "P1" | "P2";

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

    const where: string[] = [];
    if (status) {
      where.push(`status = ${sqlString(status)}`);
    }
    if (severity) {
      where.push(`severity = ${sqlString(severity)}`);
    }
    if (riskCodeRaw) {
      where.push(`risk_code = ${sqlString(riskCodeRaw)}`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const offset = (page - 1) * pageSize;

    const [countRow] = await queryRows<CountRow>(`
SELECT COUNT(*) AS total
FROM risk_events
${whereSql};
`);

    const items = await queryRows<{
      risk_code: string;
      severity: RiskSeverity;
      status: RiskStatus;
      trigger_time: string;
      resolved_time: string | null;
      trigger_source: string | null;
      owner: string | null;
      latest_note: string | null;
      video_id: string | null;
    }>(`
SELECT
  risk_code,
  severity,
  status,
  trigger_time,
  resolved_time,
  trigger_source,
  owner,
  latest_note,
  video_id
FROM risk_events
${whereSql}
ORDER BY
  CASE status WHEN 'OPEN' THEN 0 ELSE 1 END ASC,
  trigger_time DESC
LIMIT ${pageSize}
OFFSET ${offset};
`);

    return ok({
      page,
      pageSize,
      total: Number(countRow?.total ?? 0),
      items
    });
  } catch (err) {
    return asErrorResponse(req, err);
  }
}
