import { CocoResultJson } from "@/server/video-files";

export type WorkerJobStatus = "QUEUED" | "PROCESSING" | "DONE" | "FAILED" | "CANCELED";

export interface WorkerJobSnapshot {
  job_id: string;
  video_id: string;
  status: WorkerJobStatus;
  progress: number;
  error_message: string | null;
  updated_at: string;
}

export interface WorkerJobResult {
  job_id: string;
  video_id: string;
  status: "DONE";
  summary: {
    ai_count: number;
    ai_detected_frames: number;
    ai_category_count: number;
    processed_frames: number;
  };
  coco: CocoResultJson;
}

export interface CreateWorkerJobInput {
  videoId: string;
  videoPath: string;
  timelinePath: string;
  outputPath: string;
}

const DEFAULT_WORKER_URL = "http://127.0.0.1:8001";

function workerBaseUrl(): string {
  return (process.env.AI_WORKER_URL ?? DEFAULT_WORKER_URL).replace(/\/$/, "");
}

function timeoutMs(): number {
  const parsed = Number.parseInt(process.env.AI_WORKER_TIMEOUT_MS ?? "10000", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 10000;
  }
  return parsed;
}

async function workerJson<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());

  try {
    const response = await fetch(`${workerBaseUrl()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {})
      },
      cache: "no-store"
    });

    if (!response.ok) {
      let reason = `worker_${response.status}`;
      try {
        const payload = (await response.json()) as { detail?: string };
        if (payload?.detail) {
          reason = String(payload.detail);
        }
      } catch {
        // Ignore parse errors and use fallback reason.
      }
      throw new Error(reason);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkWorkerHealth(): Promise<void> {
  await workerJson<{ ok: boolean }>("/health", {
    method: "GET"
  });
}

export async function createWorkerJob(input: CreateWorkerJobInput): Promise<WorkerJobSnapshot> {
  const model = process.env.AI_WORKER_MODEL ?? "yolov8n.pt";
  const frameStrideRaw = Number.parseInt(process.env.AI_WORKER_FRAME_STRIDE ?? "1", 10);
  const frameStride = Number.isFinite(frameStrideRaw) && frameStrideRaw >= 1 && frameStrideRaw <= 30 ? frameStrideRaw : 1;
  const confThresholdRaw = Number.parseFloat(process.env.AI_WORKER_CONF_THRESHOLD ?? "0.25");
  const iouThresholdRaw = Number.parseFloat(process.env.AI_WORKER_IOU_THRESHOLD ?? "0.45");

  const confThreshold = Number.isFinite(confThresholdRaw) ? Math.min(1, Math.max(0, confThresholdRaw)) : 0.25;
  const iouThreshold = Number.isFinite(iouThresholdRaw) ? Math.min(1, Math.max(0, iouThresholdRaw)) : 0.45;

  return workerJson<WorkerJobSnapshot>("/v1/jobs", {
    method: "POST",
    body: JSON.stringify({
      video_id: input.videoId,
      video_path: input.videoPath,
      timeline_path: input.timelinePath,
      output_path: input.outputPath,
      model,
      frame_stride: frameStride,
      conf_threshold: confThreshold,
      iou_threshold: iouThreshold
    })
  });
}

export async function getWorkerJob(jobId: string): Promise<WorkerJobSnapshot> {
  return workerJson<WorkerJobSnapshot>(`/v1/jobs/${encodeURIComponent(jobId)}`, {
    method: "GET"
  });
}

export async function getWorkerJobByVideo(videoId: string): Promise<WorkerJobSnapshot> {
  return workerJson<WorkerJobSnapshot>(`/v1/jobs/by-video/${encodeURIComponent(videoId)}`, {
    method: "GET"
  });
}

export async function cancelWorkerJob(jobId: string): Promise<WorkerJobSnapshot> {
  return workerJson<WorkerJobSnapshot>(`/v1/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export async function getWorkerJobResult(jobId: string): Promise<WorkerJobResult> {
  return workerJson<WorkerJobResult>(`/v1/jobs/${encodeURIComponent(jobId)}/result`, {
    method: "GET"
  });
}
