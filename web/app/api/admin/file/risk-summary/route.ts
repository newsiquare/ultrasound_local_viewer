import { NextRequest, NextResponse } from "next/server";

import { queryRows } from "@/server/db";
import { ok } from "@/server/response";
import { asErrorResponse } from "@/server/route-error";

export const runtime = "nodejs";

interface RiskRow {
  severity: "P0" | "P1" | "P2";
  status: "OPEN" | "RESOLVED";
  trigger_time: string;
  resolved_time: string | null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const rows = await queryRows<RiskRow>(`
SELECT severity, status, trigger_time, resolved_time
FROM risk_events;
`);

    const now = Date.now();
    const threshold = now - 24 * 60 * 60 * 1000;

    let openP0 = 0;
    let openP1 = 0;
    let openP2 = 0;
    let new24h = 0;
    let resolved24h = 0;

    for (const row of rows) {
      const severity = row.severity;
      if (row.status === "OPEN") {
        if (severity === "P0") {
          openP0 += 1;
        } else if (severity === "P1") {
          openP1 += 1;
        } else {
          openP2 += 1;
        }
      }

      const triggerMs = Date.parse(row.trigger_time);
      if (Number.isFinite(triggerMs) && triggerMs >= threshold) {
        new24h += 1;
      }

      const resolvedMs = row.resolved_time ? Date.parse(row.resolved_time) : NaN;
      if (Number.isFinite(resolvedMs) && resolvedMs >= threshold) {
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
