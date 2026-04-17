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
}

export function isTerminalStatus(status: AiJobStatus): boolean {
  return status === "DONE" || status === "FAILED" || status === "CANCELED";
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

  return {
    videoId,
    status,
    errorMessage: job?.error_message ?? null,
    updatedAt: job?.updated_at ?? video.updated_at,
    progress
  };
}
