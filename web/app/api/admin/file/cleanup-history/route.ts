import { NextRequest, NextResponse } from "next/server";

import { isAuthorizedAdmin, unauthorizedBasic } from "@/server/auth-basic";
import { queryRows } from "@/server/db";
import { ok } from "@/server/response";
import { asErrorResponse } from "@/server/route-error";
import { parsePositiveInt } from "@/server/validators";

export const runtime = "nodejs";

interface CountRow {
  total: number;
}

interface AuditRow {
  id: string;
  event_type: string;
  actor: string;
  payload_json: string;
  result_json: string;
  created_at: string;
}

function parseMaybeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorizedAdmin(req)) {
    return unauthorizedBasic();
  }

  try {
    const { searchParams } = new URL(req.url);
    const page = parsePositiveInt(searchParams.get("page"), 1, Number.MAX_SAFE_INTEGER);
    const pageSize = parsePositiveInt(searchParams.get("pageSize"), 20, 200);
    const offset = (page - 1) * pageSize;

    const [countRow] = await queryRows<CountRow>(`
SELECT COUNT(*) AS total
FROM audit_log
WHERE event_type IN ('RECONCILE_APPLY', 'CLEANUP_APPLY');
`);

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
ORDER BY created_at DESC
LIMIT ${pageSize}
OFFSET ${offset};
`);

    return ok({
      page,
      pageSize,
      total: Number(countRow?.total ?? 0),
      items: rows.map((row) => ({
        id: row.id,
        event_type: row.event_type,
        actor: row.actor,
        payload: parseMaybeJson(row.payload_json),
        result: parseMaybeJson(row.result_json),
        created_at: row.created_at
      }))
    });
  } catch (err) {
    return asErrorResponse(req, err);
  }
}
