import { NextRequest, NextResponse } from "next/server";

import { getAdminCredentialFromEnv, isAuthorizedAdmin, unauthorizedBasic } from "@/server/auth-basic";
import { executeMany, queryRows, sqlNullableString, sqlString } from "@/server/db";
import { HttpError } from "@/server/errors";
import { ok } from "@/server/response";
import { asErrorResponse } from "@/server/route-error";
import { getVideoById } from "@/server/video-repository";
import { uuidv7 } from "@/server/uuidv7";
import { assertUuidV7, parsePositiveInt } from "@/server/validators";

export const runtime = "nodejs";

interface CountRow {
  total: number;
}

type RiskStatus = "OPEN" | "RESOLVED";
type RiskSeverity = "P0" | "P1" | "P2";

interface RiskEventRow {
  risk_code: string;
  severity: RiskSeverity;
  status: RiskStatus;
  trigger_time: string;
  resolved_time: string | null;
  trigger_source: string | null;
  owner: string | null;
  latest_note: string | null;
  video_id: string | null;
}

interface RiskEventMutationBody {
  riskCode?: unknown;
  severity?: unknown;
  status?: unknown;
  videoId?: unknown;
  owner?: unknown;
  latestNote?: unknown;
}

interface ParsedOptionalTextField {
  present: boolean;
  value: string | null;
}

function parseRiskCode(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new HttpError(400, "BAD_REQUEST", "riskCode must be a string.");
  }
  const value = raw.trim();
  if (!value) {
    throw new HttpError(400, "BAD_REQUEST", "riskCode is required.");
  }
  if (value.length > 120) {
    throw new HttpError(400, "BAD_REQUEST", "riskCode must be 120 characters or fewer.");
  }
  return value;
}

function parseRiskStatus(raw: unknown, fallback: RiskStatus = "OPEN"): RiskStatus {
  if (raw === undefined) {
    return fallback;
  }
  if (raw === "OPEN" || raw === "RESOLVED") {
    return raw;
  }
  throw new HttpError(400, "BAD_REQUEST", "status must be OPEN or RESOLVED.");
}

function parseRiskSeverity(raw: unknown, fieldName = "severity"): RiskSeverity {
  if (raw === "P0" || raw === "P1" || raw === "P2") {
    return raw;
  }
  throw new HttpError(400, "BAD_REQUEST", `${fieldName} must be P0, P1, or P2.`);
}

function parseOptionalVideoId(raw: unknown): string | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  if (typeof raw !== "string") {
    throw new HttpError(400, "BAD_REQUEST", "videoId must be a string.");
  }
  const value = raw.trim();
  if (!value) {
    return null;
  }
  assertUuidV7(value);
  return value;
}

function parseOptionalText(raw: unknown, fieldName: string, maxLength: number): string | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  if (typeof raw !== "string") {
    throw new HttpError(400, "BAD_REQUEST", `${fieldName} must be a string.`);
  }
  const value = raw.trim();
  if (!value) {
    return null;
  }
  if (value.length > maxLength) {
    throw new HttpError(400, "BAD_REQUEST", `${fieldName} must be ${maxLength} characters or fewer.`);
  }
  return value;
}

function parsePatchOptionalText(
  body: Record<string, unknown>,
  fieldName: "owner" | "latestNote",
  maxLength: number
): ParsedOptionalTextField {
  if (!Object.prototype.hasOwnProperty.call(body, fieldName)) {
    return { present: false, value: null };
  }
  return {
    present: true,
    value: parseOptionalText(body[fieldName], fieldName, maxLength)
  };
}

function scopeKeyOf(videoId: string | null): string {
  return videoId ?? "__GLOBAL__";
}

async function normalizeVideoLink(videoId: string | null): Promise<string | null> {
  if (!videoId) {
    return null;
  }
  const video = await getVideoById(videoId);
  return video ? videoId : null;
}

async function getRiskEventByScope(riskCode: string, scopeKey: string): Promise<RiskEventRow | null> {
  const rows = await queryRows<RiskEventRow>(`
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
WHERE risk_code = ${sqlString(riskCode)}
  AND scope_key = ${sqlString(scopeKey)}
LIMIT 1;
`);
  return rows[0] ?? null;
}

async function writeAuditLog(payload: unknown, result: unknown, eventType: string): Promise<void> {
  const now = new Date().toISOString();
  const actor = getAdminCredentialFromEnv().user;
  await executeMany([
    `INSERT INTO audit_log (
      id,
      event_type,
      actor,
      payload_json,
      result_json,
      created_at
    ) VALUES (
      ${sqlString(uuidv7())},
      ${sqlString(eventType)},
      ${sqlString(actor)},
      ${sqlString(JSON.stringify(payload))},
      ${sqlString(JSON.stringify(result))},
      ${sqlString(now)}
    );`
  ]);
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

    const items = await queryRows<RiskEventRow>(`
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

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorizedAdmin(req)) {
    return unauthorizedBasic();
  }

  try {
    let body: RiskEventMutationBody;
    try {
      body = (await req.json()) as RiskEventMutationBody;
    } catch {
      throw new HttpError(400, "BAD_REQUEST", "Invalid JSON body.");
    }

    const riskCode = parseRiskCode(body.riskCode);
    const severity = parseRiskSeverity(body.severity);
    const status = parseRiskStatus(body.status, "OPEN");
    const videoId = parseOptionalVideoId(body.videoId);
    const linkedVideoId = await normalizeVideoLink(videoId);
    const owner = parseOptionalText(body.owner, "owner", 120);
    const latestNote = parseOptionalText(body.latestNote, "latestNote", 500);
    const scopeKey = scopeKeyOf(videoId);
    const now = new Date().toISOString();
    const resolvedTimeSql = status === "RESOLVED" ? sqlString(now) : "NULL";

    await executeMany([
      `UPDATE risk_events
       SET severity=${sqlString(severity)},
           status=${sqlString(status)},
           trigger_time=${sqlString(now)},
           resolved_time=${resolvedTimeSql},
           trigger_source='MANUAL',
           owner=${sqlNullableString(owner)},
           latest_note=${sqlNullableString(latestNote)},
           video_id=${sqlNullableString(linkedVideoId)},
           updated_at=${sqlString(now)}
       WHERE risk_code=${sqlString(riskCode)}
         AND scope_key=${sqlString(scopeKey)};`,
      `INSERT INTO risk_events (
         id,
         risk_code,
         scope_key,
         severity,
         status,
         trigger_time,
         resolved_time,
         trigger_source,
         owner,
         latest_note,
         video_id,
         created_at,
         updated_at
       )
       SELECT
         ${sqlString(uuidv7())},
         ${sqlString(riskCode)},
         ${sqlString(scopeKey)},
         ${sqlString(severity)},
         ${sqlString(status)},
         ${sqlString(now)},
         ${resolvedTimeSql},
         'MANUAL',
         ${sqlNullableString(owner)},
         ${sqlNullableString(latestNote)},
         ${sqlNullableString(linkedVideoId)},
         ${sqlString(now)},
         ${sqlString(now)}
       WHERE NOT EXISTS (
         SELECT 1
         FROM risk_events
         WHERE risk_code=${sqlString(riskCode)}
           AND scope_key=${sqlString(scopeKey)}
       );`
    ]);

    const item = await getRiskEventByScope(riskCode, scopeKey);
    if (!item) {
      throw new HttpError(500, "INTERNAL_ERROR", "Risk event upsert failed.");
    }

    await writeAuditLog(
      {
        action: "UPSERT",
        riskCode,
        severity,
        status,
        scopeKey,
        videoId
      },
      { item },
      "RISK_EVENT_MANUAL"
    );

    return ok({ item }, 201);
  } catch (err) {
    return asErrorResponse(req, err);
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorizedAdmin(req)) {
    return unauthorizedBasic();
  }

  try {
    let body: RiskEventMutationBody;
    try {
      body = (await req.json()) as RiskEventMutationBody;
    } catch {
      throw new HttpError(400, "BAD_REQUEST", "Invalid JSON body.");
    }

    const bodyRecord = body as Record<string, unknown>;
    const riskCode = parseRiskCode(body.riskCode);
    const videoId = parseOptionalVideoId(body.videoId);
    const scopeKey = scopeKeyOf(videoId);

    const severity = bodyRecord.severity === undefined ? undefined : parseRiskSeverity(bodyRecord.severity);
    const status = bodyRecord.status === undefined ? undefined : parseRiskStatus(bodyRecord.status);
    const ownerField = parsePatchOptionalText(bodyRecord, "owner", 120);
    const latestNoteField = parsePatchOptionalText(bodyRecord, "latestNote", 500);

    if (!severity && !status && !ownerField.present && !latestNoteField.present) {
      throw new HttpError(
        400,
        "BAD_REQUEST",
        "At least one of severity, status, owner, or latestNote must be provided."
      );
    }

    const existing = await getRiskEventByScope(riskCode, scopeKey);
    if (!existing) {
      throw new HttpError(404, "NOT_FOUND", "Risk event not found.", { riskCode, scopeKey });
    }

    const now = new Date().toISOString();
    const updates: string[] = [
      "trigger_source='MANUAL'",
      `updated_at=${sqlString(now)}`
    ];

    if (severity) {
      updates.push(`severity=${sqlString(severity)}`);
    }
    if (status) {
      updates.push(`status=${sqlString(status)}`);
      if (status === "OPEN") {
        updates.push(`trigger_time=${sqlString(now)}`);
        updates.push("resolved_time=NULL");
      } else {
        updates.push(`resolved_time=${sqlString(now)}`);
      }
    }
    if (ownerField.present) {
      updates.push(`owner=${sqlNullableString(ownerField.value)}`);
    }
    if (latestNoteField.present) {
      updates.push(`latest_note=${sqlNullableString(latestNoteField.value)}`);
    }

    await executeMany([
      `UPDATE risk_events
       SET ${updates.join(",\n           ")}
       WHERE risk_code=${sqlString(riskCode)}
         AND scope_key=${sqlString(scopeKey)};`
    ]);

    const item = await getRiskEventByScope(riskCode, scopeKey);
    if (!item) {
      throw new HttpError(500, "INTERNAL_ERROR", "Risk event update failed.");
    }

    await writeAuditLog(
      {
        action: "PATCH",
        riskCode,
        scopeKey,
        patch: {
          severity: severity ?? null,
          status: status ?? null,
          owner: ownerField.present ? ownerField.value : undefined,
          latestNote: latestNoteField.present ? latestNoteField.value : undefined
        }
      },
      { before: existing, after: item },
      "RISK_EVENT_MANUAL"
    );

    return ok({ item });
  } catch (err) {
    return asErrorResponse(req, err);
  }
}
