import { setTimeout as delay } from "node:timers/promises";

import {
  cancelWorkerJob,
  createWorkerJob,
  getWorkerJob,
  getWorkerJobByVideo,
  getWorkerJobResult,
  WorkerJobSnapshot,
  WorkerJobStatus
} from "@/server/ai-worker-client";
import { aiStatusBus, AiJobStatus } from "@/server/ai-status-bus";
import { HttpError } from "@/server/errors";
import { aiResultPath, sourceVideoPath, timelinePath, writeAiResult } from "@/server/video-files";
import {
  getAiJobByVideoId,
  getVideoById,
  listProcessingAiVideoIds,
  setAiCanceled,
  setAiDone,
  setAiFailed,
  setAiProcessing
} from "@/server/video-repository";

interface RunningTask {
  jobId: string | null;
  stopRequested: boolean;
  pollPromise: Promise<void> | null;
}

interface AiStatsLike {
  aiCount: number;
  aiDetectedFrames: number;
  aiCategoryCount: number;
}

const runningByVideoId = new Map<string, RunningTask>();
const progressByVideoId = new Map<string, number>();

const WORKER_POLL_INTERVAL_MS = 2000;
const WORKER_RESULT_RETRY = 4;
const MAX_WORKER_ERROR_STREAK = 3;

let readyPromise: Promise<void> | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

function clampProgress(input: number): number {
  if (!Number.isFinite(input)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(input)));
}

function toAiStatus(status: WorkerJobStatus): AiJobStatus {
  if (status === "DONE") {
    return "DONE";
  }
  if (status === "FAILED") {
    return "FAILED";
  }
  if (status === "CANCELED") {
    return "CANCELED";
  }
  return "PROCESSING";
}

function currentTask(videoId: string): RunningTask | undefined {
  return runningByVideoId.get(videoId);
}

function isTaskCurrent(videoId: string, jobId: string): boolean {
  const task = currentTask(videoId);
  return Boolean(task && task.jobId === jobId && !task.stopRequested);
}

function publishProcessing(videoId: string, progress: number, updatedAt: string): void {
  aiStatusBus.publish(videoId, "progress", {
    videoId,
    status: "PROCESSING",
    progress,
    updatedAt,
    errorMessage: null
  });
}

function extractStatsFromCoco(coco: {
  annotations?: Array<{ frame_index?: number }>;
  categories?: Array<unknown>;
  images?: Array<unknown>;
}): AiStatsLike {
  const annotations = Array.isArray(coco.annotations) ? coco.annotations : [];
  const categories = Array.isArray(coco.categories) ? coco.categories : [];
  const images = Array.isArray(coco.images) ? coco.images : [];

  const frameSet = new Set<number>();
  for (const item of annotations) {
    if (typeof item?.frame_index === "number" && Number.isFinite(item.frame_index)) {
      frameSet.add(item.frame_index);
    }
  }

  return {
    aiCount: annotations.length,
    aiDetectedFrames: frameSet.size > 0 ? frameSet.size : images.length,
    aiCategoryCount: categories.length
  };
}

function finalizeTask(videoId: string, jobId: string): void {
  const task = currentTask(videoId);
  if (task && task.jobId === jobId) {
    runningByVideoId.delete(videoId);
  }
  progressByVideoId.delete(videoId);
}

async function fetchWorkerResultWithRetry(jobId: string) {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= WORKER_RESULT_RETRY; attempt += 1) {
    try {
      return await getWorkerJobResult(jobId);
    } catch (error) {
      lastError = error;
      if (attempt < WORKER_RESULT_RETRY) {
        await delay(500 * attempt);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("WORKER_RESULT_UNAVAILABLE");
}

async function settleFailed(videoId: string, message: string): Promise<void> {
  const updatedAt = await setAiFailed(videoId, message);
  aiStatusBus.publish(videoId, "failed", {
    videoId,
    status: "FAILED",
    progress: progressByVideoId.get(videoId) ?? 0,
    updatedAt,
    errorMessage: message
  });
}

async function settleCanceled(videoId: string): Promise<void> {
  const updatedAt = await setAiCanceled(videoId);
  aiStatusBus.publish(videoId, "canceled", {
    videoId,
    status: "CANCELED",
    progress: 0,
    updatedAt,
    errorMessage: null
  });
}

async function settleDone(videoId: string, jobId: string): Promise<void> {
  const workerResult = await fetchWorkerResultWithRetry(jobId);
  await writeAiResult(videoId, workerResult.coco);

  const fallback = extractStatsFromCoco(workerResult.coco);
  const doneAt = await setAiDone(videoId, {
    aiCount: Number(workerResult.summary?.ai_count ?? fallback.aiCount),
    aiDetectedFrames: Number(workerResult.summary?.ai_detected_frames ?? fallback.aiDetectedFrames),
    aiCategoryCount: Number(workerResult.summary?.ai_category_count ?? fallback.aiCategoryCount)
  });

  progressByVideoId.set(videoId, 100);
  aiStatusBus.publish(videoId, "done", {
    videoId,
    status: "DONE",
    progress: 100,
    updatedAt: doneAt,
    errorMessage: null
  });
}

async function pollWorkerJob(videoId: string, jobId: string): Promise<void> {
  let workerErrorStreak = 0;

  try {
    while (isTaskCurrent(videoId, jobId)) {
      let snapshot: WorkerJobSnapshot;
      try {
        snapshot = await getWorkerJob(jobId);
        workerErrorStreak = 0;
      } catch {
        workerErrorStreak += 1;
        if (workerErrorStreak >= MAX_WORKER_ERROR_STREAK) {
          if (!isTaskCurrent(videoId, jobId)) {
            return;
          }
          await settleFailed(videoId, "WORKER_UNREACHABLE");
          return;
        }
        await delay(WORKER_POLL_INTERVAL_MS);
        continue;
      }

      if (!isTaskCurrent(videoId, jobId)) {
        return;
      }

      const aiStatus = toAiStatus(snapshot.status);
      if (aiStatus === "PROCESSING") {
        const nextProgress = clampProgress(snapshot.progress);
        progressByVideoId.set(videoId, nextProgress);
        publishProcessing(videoId, nextProgress, snapshot.updated_at ?? nowIso());
        await delay(WORKER_POLL_INTERVAL_MS);
        continue;
      }

      if (aiStatus === "CANCELED") {
        await settleCanceled(videoId);
        return;
      }

      if (aiStatus === "FAILED") {
        await settleFailed(videoId, snapshot.error_message ?? "WORKER_FAILED");
        return;
      }

      await settleDone(videoId, jobId);
      return;
    }
  } finally {
    finalizeTask(videoId, jobId);
  }
}

async function launchWorkerTask(videoId: string): Promise<void> {
  const pending = currentTask(videoId);
  if (!pending || pending.stopRequested) {
    return;
  }

  try {
    const submit = await createWorkerJob({
      videoId,
      videoPath: sourceVideoPath(videoId),
      timelinePath: timelinePath(videoId),
      outputPath: aiResultPath(videoId)
    });

    const running = currentTask(videoId);
    if (!running) {
      return;
    }

    if (running.stopRequested) {
      try {
        await cancelWorkerJob(submit.job_id);
      } catch {
        // Best effort cancel when the user already canceled locally.
      }
      return;
    }

    running.jobId = submit.job_id;
    const initialProgress = clampProgress(submit.progress);
    progressByVideoId.set(videoId, initialProgress);
    publishProcessing(videoId, initialProgress, submit.updated_at ?? nowIso());

    const pollPromise = pollWorkerJob(videoId, submit.job_id);
    running.pollPromise = pollPromise;
    await pollPromise;
  } catch {
    const task = currentTask(videoId);
    if (task && !task.stopRequested) {
      await settleFailed(videoId, "WORKER_UNREACHABLE");
      if (task.jobId) {
        finalizeTask(videoId, task.jobId);
      } else {
        runningByVideoId.delete(videoId);
        progressByVideoId.delete(videoId);
      }
    }
  }
}

async function reconcileProcessingVideo(videoId: string): Promise<void> {
  if (runningByVideoId.has(videoId)) {
    return;
  }

  try {
    const snapshot = await getWorkerJobByVideo(videoId);
    const aiStatus = toAiStatus(snapshot.status);

    if (aiStatus === "PROCESSING") {
      const task: RunningTask = {
        jobId: snapshot.job_id,
        stopRequested: false,
        pollPromise: null
      };
      runningByVideoId.set(videoId, task);
      const nextProgress = clampProgress(snapshot.progress);
      progressByVideoId.set(videoId, nextProgress);
      publishProcessing(videoId, nextProgress, snapshot.updated_at ?? nowIso());

      const pollPromise = pollWorkerJob(videoId, snapshot.job_id);
      task.pollPromise = pollPromise;
      void pollPromise;
      return;
    }

    if (aiStatus === "DONE") {
      await settleDone(videoId, snapshot.job_id);
      return;
    }

    if (aiStatus === "CANCELED") {
      await settleCanceled(videoId);
      return;
    }

    await settleFailed(videoId, snapshot.error_message ?? "WORKER_FAILED");
  } catch {
    await settleFailed(videoId, "WORKER_UNREACHABLE");
  }
}

async function recoverStaleProcessingJobs(): Promise<void> {
  const videoIds = await listProcessingAiVideoIds();
  for (const videoId of videoIds) {
    await reconcileProcessingVideo(videoId);
  }
}

export async function ensureAiRunnerReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = recoverStaleProcessingJobs().catch(() => {
      // Recovery should not block requests forever; allow next request to retry.
      readyPromise = null;
    });
  }
  await readyPromise;
}

export async function startAiDetectTask(videoId: string): Promise<{ status: AiJobStatus; updatedAt: string }> {
  await ensureAiRunnerReady();

  const video = await getVideoById(videoId);
  if (!video) {
    throw new HttpError(404, "NOT_FOUND", "Video not found.", { videoId });
  }

  if (video.timeline_status !== "READY") {
    throw new HttpError(409, "CONFLICT", "Timeline is not ready for AI detection.", {
      videoId,
      timelineStatus: video.timeline_status
    });
  }

  const job = await getAiJobByVideoId(videoId);
  if (video.ai_status === "PROCESSING" || job?.status === "PROCESSING") {
    throw new HttpError(409, "CONFLICT", "AI job is already processing.", { videoId });
  }

  const updatedAt = await setAiProcessing(videoId);
  progressByVideoId.set(videoId, 0);
  runningByVideoId.set(videoId, {
    jobId: null,
    stopRequested: false,
    pollPromise: null
  });

  aiStatusBus.publish(videoId, "status", {
    videoId,
    status: "PROCESSING",
    progress: 0,
    updatedAt,
    errorMessage: null
  });

  void launchWorkerTask(videoId);

  return {
    status: "PROCESSING",
    updatedAt
  };
}

export async function cancelAiDetectTask(videoId: string): Promise<{ status: AiJobStatus; updatedAt: string }> {
  await ensureAiRunnerReady();

  const video = await getVideoById(videoId);
  if (!video) {
    throw new HttpError(404, "NOT_FOUND", "Video not found.", { videoId });
  }

  const job = await getAiJobByVideoId(videoId);
  if (video.ai_status !== "PROCESSING" && job?.status !== "PROCESSING") {
    throw new HttpError(409, "CONFLICT", "AI job is not processing.", { videoId });
  }

  const running = currentTask(videoId);
  if (running) {
    running.stopRequested = true;
    if (running.jobId) {
      try {
        await cancelWorkerJob(running.jobId);
      } catch {
        // Best effort: local state should still converge to CANCELED.
      }
    }
    runningByVideoId.delete(videoId);
  } else {
    try {
      const remote = await getWorkerJobByVideo(videoId);
      if (remote.status === "QUEUED" || remote.status === "PROCESSING") {
        await cancelWorkerJob(remote.job_id);
      }
    } catch {
      // Worker may already be unavailable/finished; still converge locally.
    }
  }

  progressByVideoId.delete(videoId);

  const updatedAt = await setAiCanceled(videoId);
  aiStatusBus.publish(videoId, "canceled", {
    videoId,
    status: "CANCELED",
    progress: 0,
    updatedAt,
    errorMessage: null
  });

  return {
    status: "CANCELED",
    updatedAt
  };
}

export function getAiTaskProgress(videoId: string): number {
  return progressByVideoId.get(videoId) ?? 0;
}
