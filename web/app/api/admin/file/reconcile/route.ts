import { access } from "node:fs/promises";

import { NextRequest, NextResponse } from "next/server";

import { getAdminCredentialFromEnv, isAuthorizedAdmin, unauthorizedBasic } from "@/server/auth-basic";
import { executeMany, sqlString } from "@/server/db";
import { HttpError } from "@/server/errors";
import { ok } from "@/server/response";
import { asErrorResponse } from "@/server/route-error";
import { aiResultPath, metadataPath, removeVideoAssets, videoDir } from "@/server/video-files";
import { deleteVideoById, getAiJobByVideoId, getVideoById, resetAiToIdle } from "@/server/video-repository";
import { assertUuidV7 } from "@/server/validators";
import { uuidv7 } from "@/server/uuidv7";

export const runtime = "nodejs";

const SUPPORTED_ACTIONS = new Set(["remove_orphan_fs", "remove_orphan_db", "rebuild_ai_status"]);

interface ReconcileRequestBody {
  videoIds?: unknown;
  mode?: unknown;
  actions?: unknown;
}

interface ReconcileResultItem {
  videoId: string;
  changed: boolean;
  appliedActions: string[];
  skippedActions: Array<{
    action: string;
    reason: string;
  }>;
  problems: string[];
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parsePayload(body: ReconcileRequestBody): {
  videoIds: string[];
  mode: "dry-run" | "apply";
  actions: string[];
} {
  if (!Array.isArray(body.videoIds) || body.videoIds.length === 0) {
    throw new HttpError(400, "BAD_REQUEST", "videoIds must be a non-empty array.");
  }
  const videoIds = body.videoIds.map((value) => String(value).trim()).filter(Boolean);
  if (videoIds.length === 0) {
    throw new HttpError(400, "BAD_REQUEST", "videoIds must contain valid ids.");
  }
  for (const videoId of videoIds) {
    assertUuidV7(videoId);
  }

  const mode = body.mode === "apply" ? "apply" : body.mode === "dry-run" ? "dry-run" : null;
  if (!mode) {
    throw new HttpError(400, "BAD_REQUEST", "mode must be dry-run or apply.");
  }

  if (!Array.isArray(body.actions) || body.actions.length === 0) {
    throw new HttpError(400, "BAD_REQUEST", "actions must be a non-empty array.");
  }
  const actions = body.actions.map((value) => String(value).trim()).filter(Boolean);
  if (actions.length === 0) {
    throw new HttpError(400, "BAD_REQUEST", "actions must contain valid action names.");
  }
  for (const action of actions) {
    if (!SUPPORTED_ACTIONS.has(action)) {
      throw new HttpError(400, "BAD_REQUEST", `Unsupported reconcile action: ${action}`);
    }
  }

  return {
    videoIds: Array.from(new Set(videoIds)),
    mode,
    actions: Array.from(new Set(actions))
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorizedAdmin(req)) {
    return unauthorizedBasic();
  }

  try {
    const body = (await req.json()) as ReconcileRequestBody;
    const { videoIds, mode, actions } = parsePayload(body);

    const results: ReconcileResultItem[] = [];

    for (const videoId of videoIds) {
      const video = await getVideoById(videoId);
      if (!video) {
        const orphanFsPath = videoDir(videoId);
        const orphanFsExists = await pathExists(orphanFsPath);
        const appliedActions: string[] = [];
        const skippedActions: Array<{ action: string; reason: string }> = [];

        for (const action of actions) {
          if (action === "remove_orphan_fs") {
            if (!orphanFsExists) {
              skippedActions.push({ action, reason: "ORPHAN_FS_NOT_FOUND" });
              continue;
            }
            if (mode === "apply") {
              await removeVideoAssets(videoId);
            }
            appliedActions.push(action);
            continue;
          }

          skippedActions.push({ action, reason: "VIDEO_NOT_FOUND" });
        }

        results.push({
          videoId,
          changed: appliedActions.length > 0,
          appliedActions,
          skippedActions,
          problems: orphanFsExists ? ["ORPHAN_FS"] : ["VIDEO_NOT_FOUND"]
        });
        continue;
      }

      const aiJob = await getAiJobByVideoId(videoId);
      const effectiveAiStatus = aiJob?.status ?? video.ai_status;
      const sourceExists = await pathExists(video.local_path);
      const aiResultExists = await pathExists(aiResultPath(videoId));
      const metadataExists = await pathExists(metadataPath(videoId));

      const problems: string[] = [];
      if (!sourceExists) {
        problems.push("MISSING_FILE");
      }
      if (!metadataExists) {
        problems.push("MISSING_METADATA");
      }
      if (effectiveAiStatus === "DONE" && !aiResultExists) {
        problems.push("MISSING_AI_RESULT");
      }
      if (effectiveAiStatus === "PROCESSING") {
        problems.push("PROCESSING_LOCKED");
      }

      if (mode === "apply" && problems.includes("PROCESSING_LOCKED")) {
        throw new HttpError(409, "CONFLICT", "Cannot apply reconcile while PROCESSING.", { videoId });
      }

      let changed = false;
      const appliedActions: string[] = [];
      const skippedActions: Array<{ action: string; reason: string }> = [];

      for (const action of actions) {
        if (action === "remove_orphan_db") {
          if (!problems.includes("MISSING_FILE")) {
            skippedActions.push({ action, reason: "SOURCE_FILE_EXISTS" });
            continue;
          }

          if (mode === "apply") {
            await deleteVideoById(videoId);
            await removeVideoAssets(videoId);
          }

          changed = true;
          appliedActions.push(action);
          continue;
        }

        if (action === "rebuild_ai_status") {
          if (!problems.includes("MISSING_AI_RESULT")) {
            skippedActions.push({ action, reason: "AI_RESULT_EXISTS_OR_STATUS_NOT_DONE" });
            continue;
          }

          if (mode === "apply") {
            await resetAiToIdle(videoId);
          }

          changed = true;
          appliedActions.push(action);
          continue;
        }
      }

      results.push({
        videoId,
        changed,
        appliedActions,
        skippedActions,
        problems
      });
    }

    if (mode === "apply") {
      const now = new Date().toISOString();
      const actor = getAdminCredentialFromEnv().user;
      const payloadJson = JSON.stringify({
        videoIds,
        mode,
        actions
      });
      const resultJson = JSON.stringify({
        summary: {
          checked: results.length,
          changed: results.filter((item) => item.changed).length,
          skipped: results.filter((item) => !item.changed).length
        },
        items: results
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
          'RECONCILE_APPLY',
          ${sqlString(actor)},
          ${sqlString(payloadJson)},
          ${sqlString(resultJson)},
          ${sqlString(now)}
        );`
      ]);
    }

    return ok({
      mode,
      summary: {
        checked: results.length,
        changed: results.filter((item) => item.changed).length,
        skipped: results.filter((item) => !item.changed).length
      },
      items: results
    });
  } catch (err) {
    return asErrorResponse(req, err);
  }
}
