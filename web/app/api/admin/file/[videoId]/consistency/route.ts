import { access, constants } from "node:fs/promises";

import { NextRequest, NextResponse } from "next/server";

import { isAuthorizedAdmin, unauthorizedBasic } from "@/server/auth-basic";
import { executeMany, sqlBoolean, sqlString } from "@/server/db";
import { HttpError } from "@/server/errors";
import { ok } from "@/server/response";
import { asErrorResponse } from "@/server/route-error";
import { aiResultPath, metadataPath } from "@/server/video-files";
import { getAiJobByVideoId, getVideoById } from "@/server/video-repository";
import { assertUuidV7 } from "@/server/validators";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ videoId: string }>;
}

type Severity = "P0" | "P1" | "P2";

interface ConsistencyProblem {
  code: string;
  message: string;
  severity: Severity;
  path?: string;
}

interface SuggestedAction {
  code: string;
  title: string;
  mode: "dry-run" | "apply";
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function dedupeActions(actions: SuggestedAction[]): SuggestedAction[] {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = `${action.code}:${action.mode}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  if (!isAuthorizedAdmin(req)) {
    return unauthorizedBasic();
  }

  try {
    const { videoId } = await context.params;
    assertUuidV7(videoId);

    const video = await getVideoById(videoId);
    if (!video) {
      throw new HttpError(404, "NOT_FOUND", "Video not found.", { videoId });
    }

    const aiJob = await getAiJobByVideoId(videoId);
    const effectiveAiStatus = aiJob?.status ?? video.ai_status;
    const lockedByProcessing = effectiveAiStatus === "PROCESSING";

    const [sourceExists, metadataExists, aiResultExists] = await Promise.all([
      pathExists(video.local_path),
      pathExists(metadataPath(videoId)),
      pathExists(aiResultPath(videoId))
    ]);

    const problems: ConsistencyProblem[] = [];
    const suggestedActions: SuggestedAction[] = [];

    if (lockedByProcessing) {
      problems.push({
        code: "PROCESSING_LOCKED",
        message: "AI job is processing; destructive actions must be blocked.",
        severity: "P1"
      });
      suggestedActions.push({
        code: "WAIT_PROCESSING_FINISH",
        title: "等待 PROCESSING 結束後再執行修復",
        mode: "dry-run"
      });
    }

    if (!sourceExists) {
      problems.push({
        code: "MISSING_FILE",
        message: "DB has this video but source.mp4 is missing.",
        severity: "P0",
        path: video.local_path
      });
      suggestedActions.push({
        code: "RECONCILE_REMOVE_ORPHAN_DB",
        title: "預覽刪除失效 DB 記錄（orphan_db）",
        mode: "dry-run"
      });
      suggestedActions.push({
        code: "RECONCILE_REMOVE_ORPHAN_DB",
        title: "套用刪除失效 DB 記錄（orphan_db）",
        mode: "apply"
      });
    }

    if (!metadataExists) {
      problems.push({
        code: "MISSING_METADATA",
        message: "metadata.json is missing for this video.",
        severity: "P1",
        path: metadataPath(videoId)
      });
      suggestedActions.push({
        code: "REBUILD_METADATA",
        title: "重建 metadata（先 dry-run）",
        mode: "dry-run"
      });
    }

    if (effectiveAiStatus === "DONE" && !aiResultExists) {
      problems.push({
        code: "MISSING_AI_RESULT",
        message: "ai_status is DONE but latest.coco.json is missing.",
        severity: "P1",
        path: aiResultPath(videoId)
      });
      suggestedActions.push({
        code: "RESET_AI_TO_IDLE",
        title: "重設 AI 狀態為 IDLE（先 dry-run）",
        mode: "dry-run"
      });
      suggestedActions.push({
        code: "RERUN_AI_DETECT",
        title: "重新執行 AI 辨識",
        mode: "apply"
      });
    }

    let consistencyStatus = "HEALTHY";
    if (lockedByProcessing) {
      consistencyStatus = "PROCESSING_LOCKED";
    } else if (problems.some((problem) => problem.code === "MISSING_FILE")) {
      consistencyStatus = "MISSING_FILE";
    } else if (problems.some((problem) => problem.code === "MISSING_METADATA")) {
      consistencyStatus = "MISSING_METADATA";
    } else if (problems.some((problem) => problem.code === "MISSING_AI_RESULT")) {
      consistencyStatus = "MISSING_AI_RESULT";
    }

    const checkedAt = new Date().toISOString();
    const reason = problems.length > 0 ? problems.map((problem) => problem.code).join(",") : null;

    await executeMany([
      `INSERT INTO video_consistency (
        video_id,
        consistency_status,
        consistency_reason,
        last_checked_at,
        check_source,
        locked_by_processing,
        updated_at
      ) VALUES (
        ${sqlString(videoId)},
        ${sqlString(consistencyStatus)},
        ${reason === null ? "NULL" : sqlString(reason)},
        ${sqlString(checkedAt)},
        'MANUAL_CHECK',
        ${sqlBoolean(lockedByProcessing)},
        ${sqlString(checkedAt)}
      )
      ON CONFLICT(video_id) DO UPDATE SET
        consistency_status=excluded.consistency_status,
        consistency_reason=excluded.consistency_reason,
        last_checked_at=excluded.last_checked_at,
        check_source=excluded.check_source,
        locked_by_processing=excluded.locked_by_processing,
        updated_at=excluded.updated_at;`
    ]);

    return ok({
      videoId,
      consistencyStatus,
      checkedAt,
      lockedByProcessing,
      problems,
      suggestedActions: dedupeActions(suggestedActions)
    });
  } catch (err) {
    return asErrorResponse(req, err);
  }
}
