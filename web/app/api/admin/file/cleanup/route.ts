import { statfs } from "node:fs/promises";

import { NextRequest, NextResponse } from "next/server";

import { getAdminCredentialFromEnv } from "@/server/auth-basic";
import { executeMany, queryRows, sqlString } from "@/server/db";
import { HttpError } from "@/server/errors";
import { getStoragePaths } from "@/server/paths";
import { ok } from "@/server/response";
import { openRiskEvent, resolveRiskEvent } from "@/server/risk-events";
import { asErrorResponse } from "@/server/route-error";
import { removeVideoAssets } from "@/server/video-files";
import { deleteVideoById } from "@/server/video-repository";
import { assertUuidV7 } from "@/server/validators";
import { uuidv7 } from "@/server/uuidv7";

export const runtime = "nodejs";

interface CleanupRequestBody {
  mode?: unknown;
  retentionDays?: unknown;
  keepLatestPerFilename?: unknown;
  highWatermarkPercent?: unknown;
  confirmationToken?: unknown;
  filename?: unknown;
  videoIds?: unknown;
}

interface VideoRow {
  video_id: string;
  filename: string;
  uploaded_at: string;
  file_size_bytes: number | null;
  ai_status: string;
}

interface CleanupCandidate {
  videoId: string;
  filename: string;
  uploadedAt: string;
  aiStatus: string;
  fileSizeBytes: number | null;
  rankInFilename: number;
  olderThanRetention: boolean;
  lockedByProcessing: boolean;
  candidate: boolean;
  reasons: string[];
}

function parseNumberRange(
  value: unknown,
  fallback: number,
  key: string,
  min: number,
  max: number
): number {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new HttpError(400, "BAD_REQUEST", `${key} must be an integer between ${min} and ${max}.`);
  }
  return parsed;
}

function parsePayload(body: CleanupRequestBody): {
  mode: "dry-run" | "apply";
  retentionDays: number;
  keepLatestPerFilename: number;
  highWatermarkPercent: number;
  confirmationToken: string | null;
  filename: string | null;
  videoIds: string[] | null;
} {
  const mode = body.mode === "apply" ? "apply" : "dry-run";
  const retentionDays = parseNumberRange(body.retentionDays, 30, "retentionDays", 0, 3650);
  const keepLatestPerFilename = parseNumberRange(
    body.keepLatestPerFilename,
    2,
    "keepLatestPerFilename",
    0,
    100
  );
  const highWatermarkPercent = parseNumberRange(
    body.highWatermarkPercent,
    80,
    "highWatermarkPercent",
    1,
    100
  );

  const confirmationToken =
    body.confirmationToken === undefined || body.confirmationToken === null
      ? null
      : String(body.confirmationToken);

  const filenameRaw = body.filename === undefined || body.filename === null ? "" : String(body.filename).trim();
  const filename = filenameRaw ? filenameRaw : null;

  let videoIds: string[] | null = null;
  if (Array.isArray(body.videoIds)) {
    const parsed = body.videoIds.map((value) => String(value).trim()).filter(Boolean);
    for (const videoId of parsed) {
      assertUuidV7(videoId);
    }
    videoIds = parsed.length > 0 ? Array.from(new Set(parsed)) : null;
  } else if (body.videoIds !== undefined && body.videoIds !== null) {
    throw new HttpError(400, "BAD_REQUEST", "videoIds must be an array.");
  }

  return {
    mode,
    retentionDays,
    keepLatestPerFilename,
    highWatermarkPercent,
    confirmationToken,
    filename,
    videoIds
  };
}

function buildWhereSql(filters: { filename: string | null; videoIds: string[] | null }): string {
  const where: string[] = [];
  if (filters.filename) {
    where.push(`v.filename = ${sqlString(filters.filename)}`);
  }
  if (filters.videoIds && filters.videoIds.length > 0) {
    const inList = filters.videoIds.map((videoId) => sqlString(videoId)).join(",");
    where.push(`v.id IN (${inList})`);
  }
  if (where.length === 0) {
    return "";
  }
  return `WHERE ${where.join(" AND ")}`;
}

function buildConfirmationToken(input: {
  retentionDays: number;
  keepLatestPerFilename: number;
  highWatermarkPercent: number;
  filename: string | null;
  videoIds: string[] | null;
  candidateIds: string[];
}): string {
  const payload = JSON.stringify({
    retentionDays: input.retentionDays,
    keepLatestPerFilename: input.keepLatestPerFilename,
    highWatermarkPercent: input.highWatermarkPercent,
    filename: input.filename,
    videoIds: input.videoIds ?? [],
    candidateIds: input.candidateIds
  });
  return Buffer.from(payload, "utf-8").toString("base64url");
}

function analyzeCandidates(rows: VideoRow[], retentionDays: number, keepLatestPerFilename: number): CleanupCandidate[] {
  const nowMs = Date.now();
  const cutoffMs = nowMs - retentionDays * 24 * 60 * 60 * 1000;
  const rankCounter = new Map<string, number>();

  return rows.map((row) => {
    const rank = (rankCounter.get(row.filename) ?? 0) + 1;
    rankCounter.set(row.filename, rank);

    const uploadedAtMs = Date.parse(row.uploaded_at);
    const olderThanRetention = Number.isNaN(uploadedAtMs) ? true : uploadedAtMs <= cutoffMs;
    const lockedByProcessing = row.ai_status === "PROCESSING";

    const reasons: string[] = [];
    if (rank <= keepLatestPerFilename) {
      reasons.push("KEEP_LATEST");
    }
    if (!olderThanRetention) {
      reasons.push("WITHIN_RETENTION");
    }
    if (lockedByProcessing) {
      reasons.push("PROCESSING_LOCKED");
    }

    return {
      videoId: row.video_id,
      filename: row.filename,
      uploadedAt: row.uploaded_at,
      aiStatus: row.ai_status,
      fileSizeBytes: row.file_size_bytes,
      rankInFilename: rank,
      olderThanRetention,
      lockedByProcessing,
      candidate: reasons.length === 0,
      reasons
    };
  });
}

async function getStorageUsagePercent(): Promise<number | null> {
  try {
    const stats = await statfs(getStoragePaths().storageRoot);
    const blocks = Number(stats.blocks ?? 0);
    const free = Number(stats.bfree ?? stats.bavail ?? 0);
    if (!Number.isFinite(blocks) || blocks <= 0) {
      return null;
    }
    const used = Math.max(0, blocks - free);
    return (used / blocks) * 100;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as CleanupRequestBody;
    const payload = parsePayload(body);
    const whereSql = buildWhereSql({
      filename: payload.filename,
      videoIds: payload.videoIds
    });

    const rows = await queryRows<VideoRow>(`
SELECT
  v.id AS video_id,
  v.filename,
  v.uploaded_at,
  v.file_size_bytes,
  COALESCE(aj.status, v.ai_status) AS ai_status
FROM videos v
LEFT JOIN ai_jobs aj ON aj.video_id = v.id
${whereSql}
ORDER BY v.filename ASC, v.uploaded_at DESC;
`);

    const storageUsagePercent = await getStorageUsagePercent();
    const highWatermarkExceeded =
      storageUsagePercent === null || storageUsagePercent >= payload.highWatermarkPercent;
    const isScopedCleanup = Boolean(payload.filename || (payload.videoIds && payload.videoIds.length > 0));

    const candidates = analyzeCandidates(rows, payload.retentionDays, payload.keepLatestPerFilename).map((item) => {
      if (isScopedCleanup || highWatermarkExceeded || !item.candidate) {
        return item;
      }
      return {
        ...item,
        candidate: false,
        reasons: [...item.reasons, "BELOW_HIGH_WATERMARK"]
      };
    });
    const candidateIds = candidates
      .filter((item) => item.candidate)
      .map((item) => item.videoId)
      .sort((a, b) => a.localeCompare(b));

    const confirmationToken = buildConfirmationToken({
      retentionDays: payload.retentionDays,
      keepLatestPerFilename: payload.keepLatestPerFilename,
      highWatermarkPercent: payload.highWatermarkPercent,
      filename: payload.filename,
      videoIds: payload.videoIds,
      candidateIds
    });

    if (payload.mode === "apply") {
      if (!payload.confirmationToken) {
        throw new HttpError(400, "BAD_REQUEST", "confirmationToken is required for apply.");
      }
      if (payload.confirmationToken !== confirmationToken) {
        throw new HttpError(409, "CONFLICT", "cleanup confirmation token mismatch. Run dry-run again.");
      }
    }

    let deleted = 0;
    let reclaimedBytes = 0;
    const eligibleCount = candidates.filter((item) => item.candidate).length;

    if (payload.mode === "apply") {
      for (const candidate of candidates) {
        if (!candidate.candidate) {
          continue;
        }
        if (candidate.lockedByProcessing) {
          throw new HttpError(409, "CONFLICT", "Cannot cleanup while video is PROCESSING.", {
            videoId: candidate.videoId
          });
        }

        await removeVideoAssets(candidate.videoId);
        await deleteVideoById(candidate.videoId);
        await resolveRiskEvent({
          riskCode: "FS_DB_INCONSISTENCY",
          triggerSource: "CLEANUP_APPLY",
          latestNote: "VIDEO_REMOVED_BY_CLEANUP",
          videoId: candidate.videoId
        });
        deleted += 1;
        reclaimedBytes += Number(candidate.fileSizeBytes ?? 0);
      }

      const now = new Date().toISOString();
      const actor = getAdminCredentialFromEnv().user;
      const payloadJson = JSON.stringify({
        mode: payload.mode,
        retentionDays: payload.retentionDays,
        keepLatestPerFilename: payload.keepLatestPerFilename,
        highWatermarkPercent: payload.highWatermarkPercent,
        filename: payload.filename,
        videoIds: payload.videoIds
      });
      const resultJson = JSON.stringify({
        deleted,
        reclaimedBytes,
        candidateIds
      });
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
          'CLEANUP_APPLY',
          ${sqlString(actor)},
          ${sqlString(payloadJson)},
          ${sqlString(resultJson)},
          ${sqlString(now)}
        );`
      ]);
    } else {
      reclaimedBytes = candidates
        .filter((item) => item.candidate)
        .reduce((sum, item) => sum + Number(item.fileSizeBytes ?? 0), 0);
    }

    if (!isScopedCleanup) {
      const remainingEligible = payload.mode === "apply" ? 0 : eligibleCount;
      if (highWatermarkExceeded && remainingEligible > 0) {
        await openRiskEvent({
          riskCode: "STORAGE_GROWTH",
          severity: "P2",
          triggerSource: "CLEANUP_MONITOR",
          latestNote: `usage=${storageUsagePercent?.toFixed(2) ?? "unknown"}%,eligible=${remainingEligible},checked=${candidates.length}`
        });
      } else {
        await resolveRiskEvent({
          riskCode: "STORAGE_GROWTH",
          triggerSource: "CLEANUP_MONITOR",
          latestNote: `usage=${storageUsagePercent?.toFixed(2) ?? "unknown"}%,eligible=${remainingEligible}`
        });
      }
    }

    return ok({
      mode: payload.mode,
      policy: {
        retentionDays: payload.retentionDays,
        keepLatestPerFilename: payload.keepLatestPerFilename,
        highWatermarkPercent: payload.highWatermarkPercent,
        filename: payload.filename
      },
      summary: {
        checked: candidates.length,
        eligible: eligibleCount,
        deleted,
        estimatedReclaimedBytes: reclaimedBytes,
        storageUsagePercent,
        highWatermarkExceeded
      },
      confirmationToken: payload.mode === "dry-run" ? confirmationToken : null,
      candidates
    });
  } catch (err) {
    return asErrorResponse(req, err);
  }
}
