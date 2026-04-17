import { NextRequest, NextResponse } from "next/server";

import { queryRows, sqlString } from "@/server/db";
import { HttpError } from "@/server/errors";
import { isAuthorizedAdmin, unauthorizedBasic } from "@/server/auth-basic";
import { ok } from "@/server/response";
import { asErrorResponse } from "@/server/route-error";
import { parsePositiveInt } from "@/server/validators";

export const runtime = "nodejs";

const AI_STATUS_SET = new Set(["IDLE", "PROCESSING", "DONE", "FAILED", "CANCELED"]);
const CONSISTENCY_STATUS_SET = new Set([
  "HEALTHY",
  "MISSING_FILE",
  "MISSING_METADATA",
  "MISSING_AI_RESULT",
  "ORPHAN_DB",
  "ORPHAN_FS",
  "PROCESSING_LOCKED"
]);

const MAX_PAGE_SIZE = 200;

const CONSISTENCY_STATUS_SQL = `CASE
  WHEN (COALESCE(vc.locked_by_processing, 0) = 1 OR COALESCE(aj.status, v.ai_status) = 'PROCESSING')
    THEN 'PROCESSING_LOCKED'
  ELSE COALESCE(vc.consistency_status, 'HEALTHY')
END`;

type SortBy =
  | "uploaded_at"
  | "filename"
  | "ai_status"
  | "consistency_status"
  | "category_count"
  | "annotation_count"
  | "ai_annotation_count";

const SORT_BY_SQL: Record<SortBy, string> = {
  uploaded_at: "v.uploaded_at",
  filename: "v.filename",
  ai_status: "COALESCE(aj.status, v.ai_status)",
  consistency_status: CONSISTENCY_STATUS_SQL,
  category_count: "COALESCE(cat.category_count, 0)",
  annotation_count: "COALESCE(ann.annotation_count, 0)",
  ai_annotation_count: "v.ai_count"
};

interface TotalRow {
  total: number;
}

interface AdminListRawRow {
  video_id: string;
  filename: string;
  uploaded_at: string;
  category_count: number;
  annotation_count: number;
  ai_status: string;
  ai_category_count: number;
  ai_annotation_count: number;
  video_width: number | null;
  video_height: number | null;
  source_fps: number | null;
  duration_sec: number | null;
  video_codec: string | null;
  pixel_format: string | null;
  storage_path: string;
  file_size_bytes: number | null;
  consistency_status: string;
  last_checked_at: string | null;
  consistency_reason: string | null;
  locked_by_processing: number;
}

function parseDateFilter(rawValue: string | null, key: string, mode: "from" | "to"): { value: string; exclusive: boolean } | null {
  if (!rawValue) {
    return null;
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }

  const onlyDate = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  const parsed = onlyDate ? new Date(`${trimmed}T00:00:00.000Z`) : new Date(trimmed);

  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(400, "BAD_REQUEST", `Invalid date query parameter: ${key}`);
  }

  if (mode === "to" && onlyDate) {
    const nextDay = new Date(parsed.getTime() + 24 * 60 * 60 * 1000);
    return { value: nextDay.toISOString(), exclusive: true };
  }

  return { value: parsed.toISOString(), exclusive: false };
}

function parseAiStatus(rawValue: string | null): string | null {
  if (!rawValue || rawValue === "ALL") {
    return null;
  }
  if (!AI_STATUS_SET.has(rawValue)) {
    throw new HttpError(400, "BAD_REQUEST", "Invalid aiStatus query parameter.");
  }
  return rawValue;
}

function parseConsistencyStatus(rawValue: string | null): string | null {
  if (!rawValue || rawValue === "ALL") {
    return null;
  }
  if (!CONSISTENCY_STATUS_SET.has(rawValue)) {
    throw new HttpError(400, "BAD_REQUEST", "Invalid consistencyStatus query parameter.");
  }
  return rawValue;
}

function parseSortBy(rawValue: string | null): SortBy {
  if (!rawValue) {
    return "uploaded_at";
  }

  const sortBy = rawValue as SortBy;
  if (!Object.hasOwn(SORT_BY_SQL, sortBy)) {
    throw new HttpError(400, "BAD_REQUEST", "Invalid sortBy query parameter.");
  }
  return sortBy;
}

function parseSortDir(rawValue: string | null): "ASC" | "DESC" {
  if (!rawValue) {
    return "DESC";
  }

  if (rawValue.toLowerCase() === "asc") {
    return "ASC";
  }
  if (rawValue.toLowerCase() === "desc") {
    return "DESC";
  }

  throw new HttpError(400, "BAD_REQUEST", "Invalid sortDir query parameter.");
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorizedAdmin(req)) {
    return unauthorizedBasic();
  }

  try {
    const { searchParams } = new URL(req.url);

    const page = parsePositiveInt(searchParams.get("page"), 1, Number.MAX_SAFE_INTEGER);
    const pageSize = parsePositiveInt(searchParams.get("pageSize"), 20, MAX_PAGE_SIZE);
    const offset = (page - 1) * pageSize;

    const q = searchParams.get("q")?.trim() ?? "";
    const aiStatus = parseAiStatus(searchParams.get("aiStatus"));
    const consistencyStatus = parseConsistencyStatus(searchParams.get("consistencyStatus"));
    const dateFrom = parseDateFilter(searchParams.get("dateFrom"), "dateFrom", "from");
    const dateTo = parseDateFilter(searchParams.get("dateTo"), "dateTo", "to");
    const sortBy = parseSortBy(searchParams.get("sortBy"));
    const sortDir = parseSortDir(searchParams.get("sortDir"));

    if (dateFrom && dateTo && dateFrom.value > dateTo.value) {
      throw new HttpError(400, "BAD_REQUEST", "dateFrom must be earlier than dateTo.");
    }

    const whereClauses: string[] = [];
    if (q) {
      const pattern = `%${q.toLowerCase()}%`;
      whereClauses.push(`(
        LOWER(v.filename) LIKE ${sqlString(pattern)}
        OR LOWER(v.id) LIKE ${sqlString(pattern)}
        OR EXISTS (
          SELECT 1
          FROM categories c_search
          WHERE c_search.video_id = v.id
            AND LOWER(c_search.name) LIKE ${sqlString(pattern)}
        )
      )`);
    }

    if (dateFrom) {
      whereClauses.push(`v.uploaded_at >= ${sqlString(dateFrom.value)}`);
    }

    if (dateTo) {
      whereClauses.push(
        `v.uploaded_at ${dateTo.exclusive ? "<" : "<="} ${sqlString(dateTo.value)}`
      );
    }

    if (aiStatus) {
      whereClauses.push(`COALESCE(aj.status, v.ai_status) = ${sqlString(aiStatus)}`);
    }

    if (consistencyStatus) {
      whereClauses.push(`${CONSISTENCY_STATUS_SQL} = ${sqlString(consistencyStatus)}`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const fromSql = `
FROM videos v
LEFT JOIN ai_jobs aj ON aj.video_id = v.id
LEFT JOIN video_consistency vc ON vc.video_id = v.id
LEFT JOIN (
  SELECT video_id, COUNT(*) AS category_count
  FROM categories
  GROUP BY video_id
) cat ON cat.video_id = v.id
LEFT JOIN (
  SELECT video_id, COUNT(*) AS annotation_count
  FROM annotations
  GROUP BY video_id
) ann ON ann.video_id = v.id`;

    const [totalRow] = await queryRows<TotalRow>(`
SELECT COUNT(*) AS total
${fromSql}
${whereSql};
`);

    const rows = await queryRows<AdminListRawRow>(`
SELECT
  v.id AS video_id,
  v.filename,
  v.uploaded_at,
  COALESCE(cat.category_count, 0) AS category_count,
  COALESCE(ann.annotation_count, 0) AS annotation_count,
  COALESCE(aj.status, v.ai_status) AS ai_status,
  v.ai_category_count,
  v.ai_count AS ai_annotation_count,
  v.video_width,
  v.video_height,
  v.source_fps,
  v.duration_sec,
  v.video_codec,
  v.pixel_format,
  v.local_path AS storage_path,
  v.file_size_bytes,
  ${CONSISTENCY_STATUS_SQL} AS consistency_status,
  vc.last_checked_at,
  vc.consistency_reason,
  CASE
    WHEN (COALESCE(vc.locked_by_processing, 0) = 1 OR COALESCE(aj.status, v.ai_status) = 'PROCESSING')
      THEN 1
    ELSE 0
  END AS locked_by_processing
${fromSql}
${whereSql}
ORDER BY ${SORT_BY_SQL[sortBy]} ${sortDir}, v.uploaded_at DESC
LIMIT ${pageSize}
OFFSET ${offset};
`);

    return ok({
      page,
      pageSize,
      total: Number(totalRow?.total ?? 0),
      items: rows.map((row) => ({
        video_id: row.video_id,
        filename: row.filename,
        uploaded_at: row.uploaded_at,
        category_count: Number(row.category_count ?? 0),
        annotation_count: Number(row.annotation_count ?? 0),
        ai_status: row.ai_status,
        ai_category_count: Number(row.ai_category_count ?? 0),
        ai_annotation_count: Number(row.ai_annotation_count ?? 0),
        metadata_preview: {
          video_width: row.video_width,
          video_height: row.video_height,
          source_fps: row.source_fps,
          duration_sec: row.duration_sec,
          video_codec: row.video_codec,
          pixel_format: row.pixel_format,
          storage_path: row.storage_path,
          file_size_bytes: row.file_size_bytes
        },
        consistency_status: row.consistency_status,
        consistency_info: {
          last_checked_at: row.last_checked_at,
          consistency_reason: row.consistency_reason,
          locked_by_processing: Number(row.locked_by_processing ?? 0) === 1
        }
      }))
    });
  } catch (err) {
    return asErrorResponse(req, err);
  }
}
