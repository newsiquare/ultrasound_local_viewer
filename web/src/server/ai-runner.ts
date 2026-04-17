import { setTimeout as delay } from "node:timers/promises";

import { aiStatusBus, AiJobStatus } from "@/server/ai-status-bus";
import { HttpError } from "@/server/errors";
import { readTimeline, TimelineJson, writeAiResult } from "@/server/video-files";
import {
  getAiJobByVideoId,
  getVideoById,
  setAiCanceled,
  setAiDone,
  setAiFailed,
  setAiProcessing
} from "@/server/video-repository";

interface RunningTask {
  aborted: boolean;
}

const runningByVideoId = new Map<string, RunningTask>();
const progressByVideoId = new Map<string, number>();

function nowIso(): string {
  return new Date().toISOString();
}

function buildMockCoco(timeline: TimelineJson, videoWidth: number, videoHeight: number) {
  const frameStep = Math.max(1, Math.floor(timeline.frames.length / 12));
  const sampledFrames = timeline.frames.filter((_, index) => index % frameStep === 0).slice(0, 20);

  const images = sampledFrames.map((frame, index) => ({
    id: index + 1,
    file_name: `${frame.frameId}.jpg`,
    width: Math.max(videoWidth, 1),
    height: Math.max(videoHeight, 1),
    frame_index: frame.displayIndex,
    pts_us: frame.ptsUs
  }));

  let annotationId = 1;
  const annotations = images.map((image, index) => {
    const w = Math.max(24, Math.floor((videoWidth || 640) * 0.18));
    const h = Math.max(24, Math.floor((videoHeight || 480) * 0.12));
    const x = Math.max(0, Math.floor((index * 37) % Math.max((videoWidth || 640) - w, 1)));
    const y = Math.max(0, Math.floor((index * 19) % Math.max((videoHeight || 480) - h, 1)));

    const annotation = {
      id: annotationId,
      image_id: image.id,
      category_id: 1,
      bbox: [x, y, w, h] as [number, number, number, number],
      score: 0.55 + (index % 5) * 0.08,
      track_id: 100 + (index % 3),
      frame_index: image.frame_index,
      pts_us: image.pts_us,
      source: "AI" as const
    };
    annotationId += 1;
    return annotation;
  });

  return {
    images,
    annotations,
    categories: [
      {
        id: 1,
        name: "MockFinding",
        supercategory: "ultrasound"
      }
    ]
  };
}

async function runMock(videoId: string): Promise<void> {
  const task = runningByVideoId.get(videoId);
  if (!task) {
    return;
  }

  try {
    const totalSteps = 8;

    for (let step = 1; step <= totalSteps; step += 1) {
      await delay(600);

      if (task.aborted) {
        return;
      }

      const progress = Math.min(99, Math.round((step / totalSteps) * 100));
      progressByVideoId.set(videoId, progress);
      aiStatusBus.publish(videoId, "progress", {
        videoId,
        status: "PROCESSING",
        progress,
        updatedAt: nowIso(),
        errorMessage: null
      });
    }

    const video = await getVideoById(videoId);
    if (!video) {
      throw new HttpError(404, "NOT_FOUND", "Video not found.", { videoId });
    }

    const timeline = await readTimeline(videoId);
    const coco = buildMockCoco(timeline, video.video_width ?? 640, video.video_height ?? 480);
    await writeAiResult(videoId, coco);

    const doneAt = await setAiDone(videoId, {
      aiCount: coco.annotations.length,
      aiDetectedFrames: coco.images.length,
      aiCategoryCount: coco.categories.length
    });

    progressByVideoId.set(videoId, 100);
    aiStatusBus.publish(videoId, "done", {
      videoId,
      status: "DONE",
      progress: 100,
      updatedAt: doneAt,
      errorMessage: null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI task failed";
    const failedAt = await setAiFailed(videoId, message);
    aiStatusBus.publish(videoId, "failed", {
      videoId,
      status: "FAILED",
      progress: progressByVideoId.get(videoId) ?? 0,
      updatedAt: failedAt,
      errorMessage: message
    });
  } finally {
    runningByVideoId.delete(videoId);
    progressByVideoId.delete(videoId);
  }
}

async function runWorkerMode(videoId: string): Promise<void> {
  const workerUrl = process.env.AI_WORKER_URL ?? "http://127.0.0.1:8001";

  try {
    const response = await fetch(`${workerUrl}/health`, {
      method: "GET",
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`worker_health_${response.status}`);
    }

    await runMock(videoId);
  } catch {
    const failedAt = await setAiFailed(videoId, "WORKER_UNREACHABLE");
    aiStatusBus.publish(videoId, "failed", {
      videoId,
      status: "FAILED",
      progress: progressByVideoId.get(videoId) ?? 0,
      updatedAt: failedAt,
      errorMessage: "WORKER_UNREACHABLE"
    });
    runningByVideoId.delete(videoId);
    progressByVideoId.delete(videoId);
  }
}

export async function startAiDetectTask(videoId: string): Promise<{ status: AiJobStatus; updatedAt: string }> {
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
  runningByVideoId.set(videoId, { aborted: false });
  progressByVideoId.set(videoId, 0);

  aiStatusBus.publish(videoId, "status", {
    videoId,
    status: "PROCESSING",
    progress: 0,
    updatedAt,
    errorMessage: null
  });

  const mode = (process.env.AI_RUNNER_MODE ?? "mock").toLowerCase();
  if (mode === "worker") {
    void runWorkerMode(videoId);
  } else {
    void runMock(videoId);
  }

  return {
    status: "PROCESSING",
    updatedAt
  };
}

export async function cancelAiDetectTask(videoId: string): Promise<{ status: AiJobStatus; updatedAt: string }> {
  const video = await getVideoById(videoId);
  if (!video) {
    throw new HttpError(404, "NOT_FOUND", "Video not found.", { videoId });
  }

  const job = await getAiJobByVideoId(videoId);
  if (video.ai_status !== "PROCESSING" && job?.status !== "PROCESSING") {
    throw new HttpError(409, "CONFLICT", "AI job is not processing.", { videoId });
  }

  const running = runningByVideoId.get(videoId);
  if (running) {
    running.aborted = true;
  }
  runningByVideoId.delete(videoId);
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
