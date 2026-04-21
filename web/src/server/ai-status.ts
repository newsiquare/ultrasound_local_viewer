import { ensureAiRunnerReady, getAiTaskProgress } from "@/server/ai-runner";
import { AiJobStatus } from "@/server/ai-status-bus";
import { HttpError } from "@/server/errors";
import { getAiJobByVideoId, getVideoById } from "@/server/video-repository";

export interface AiStatusSnapshot {
  videoId: string;
  status: AiJobStatus;
  errorMessage: string | null;
  updatedAt: string;
  progress: number;
  durationMs: number | null;
}

export function isTerminalStatus(status: AiJobStatus): boolean {
  return status === "DONE" || status === "FAILED" || status === "CANCELED";
}

function parseIsoMs(input: string | null | undefined): number | null {
  if (!input) {
    return null;
  }
  const parsed = Date.parse(input);
  return Number.isFinite(parsed) ? parsed : null;
}

function computeDurationMs(startedAt: string | null | undefined, endedAt: string | null | undefined): number | null {
  const startMs = parseIsoMs(startedAt);
  const endMs = parseIsoMs(endedAt);
  if (startMs === null || endMs === null) {
    return null;
  }
  return Math.max(0, endMs - startMs);
}

export async function readAiStatusSnapshot(videoId: string): Promise<AiStatusSnapshot> {
  await ensureAiRunnerReady();

  const video = await getVideoById(videoId);
  if (!video) {
    throw new HttpError(404, "NOT_FOUND", "Video not found.", { videoId });
  }

  const job = await getAiJobByVideoId(videoId);
  const status = (job?.status ?? video.ai_status ?? "IDLE") as AiJobStatus;
  const progress = status === "DONE" ? 100 : status === "PROCESSING" ? getAiTaskProgress(videoId) : 0;
  const terminalAt = job?.finished_at ?? job?.canceled_at ?? job?.updated_at ?? video.updated_at;
  const durationMs =
    status === "PROCESSING"
      ? computeDurationMs(job?.started_at, new Date().toISOString())
      : isTerminalStatus(status)
        ? computeDurationMs(job?.started_at, terminalAt)
        : null;

  return {
    videoId,
    status,
    errorMessage: job?.error_message ?? null,
    updatedAt: job?.updated_at ?? video.updated_at,
    progress,
    durationMs
  };
}
