import {
  executeMany,
  queryRows,
  sqlNullableNumber,
  sqlNullableString,
  sqlString
} from "@/server/db";
import { assertUuidV7 } from "@/server/validators";

interface CountRow {
  total: number;
}

export interface VideoRow {
  id: string;
  filename: string;
  local_path: string;
  uploaded_at: string;
  duration_sec: number | null;
  source_fps: number | null;
  video_width: number | null;
  video_height: number | null;
  file_size_bytes: number | null;
  video_codec: string | null;
  pixel_format: string | null;
  ai_status: string;
  ai_count: number;
  ai_detected_frames: number;
  ai_category_count: number;
  ai_stats_updated_at: string | null;
  timeline_status: string;
  timeline_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiJobRow {
  status: string;
  updated_at: string;
  error_message: string | null;
}

export interface CategoryRow {
  id: string;
  name: string;
  color: string;
  source: string;
  is_visible: number;
  annotation_count: number;
}

export interface AnnotationRow {
  id: string;
  frame_id: string;
  category_id: string;
  bbox_json: string;
  created_at: string;
  updated_at: string;
}

export interface CreateVideoRecordInput {
  id: string;
  filename: string;
  localPath: string;
  uploadedAt: string;
  durationSec: number | null;
  sourceFps: number | null;
  videoWidth: number | null;
  videoHeight: number | null;
  fileSizeBytes: number;
  videoCodec: string | null;
  pixelFormat: string | null;
  timelineStatus: "READY" | "FAILED" | "PENDING";
  timelineError: string | null;
}

export interface VideoListResult {
  page: number;
  pageSize: number;
  total: number;
  items: VideoRow[];
}

export async function createVideoRecordWithAiIdle(input: CreateVideoRecordInput): Promise<void> {
  assertUuidV7(input.id);

  const now = new Date().toISOString();
  await executeMany([
    `INSERT INTO videos (
      id,
      filename,
      local_path,
      uploaded_at,
      duration_sec,
      source_fps,
      video_width,
      video_height,
      file_size_bytes,
      video_codec,
      pixel_format,
      ai_status,
      timeline_status,
      timeline_error,
      created_at,
      updated_at
    ) VALUES (
      ${sqlString(input.id)},
      ${sqlString(input.filename)},
      ${sqlString(input.localPath)},
      ${sqlString(input.uploadedAt)},
      ${sqlNullableNumber(input.durationSec)},
      ${sqlNullableNumber(input.sourceFps)},
      ${sqlNullableNumber(input.videoWidth)},
      ${sqlNullableNumber(input.videoHeight)},
      ${sqlNullableNumber(input.fileSizeBytes)},
      ${sqlNullableString(input.videoCodec)},
      ${sqlNullableString(input.pixelFormat)},
      'IDLE',
      ${sqlString(input.timelineStatus)},
      ${sqlNullableString(input.timelineError)},
      ${sqlString(now)},
      ${sqlString(now)}
    );`,
    `INSERT INTO ai_jobs (
      video_id,
      status,
      updated_at
    ) VALUES (
      ${sqlString(input.id)},
      'IDLE',
      ${sqlString(now)}
    )
    ON CONFLICT(video_id) DO UPDATE SET
      status='IDLE',
      error_message=NULL,
      started_at=NULL,
      finished_at=NULL,
      canceled_at=NULL,
      updated_at=excluded.updated_at;`
  ]);
}

export async function listVideos(page: number, pageSize: number): Promise<VideoListResult> {
  const offset = (page - 1) * pageSize;

  const [countRow] = await queryRows<CountRow>("SELECT COUNT(*) AS total FROM videos;");
  const items = await queryRows<VideoRow>(`
SELECT
  id,
  filename,
  local_path,
  uploaded_at,
  duration_sec,
  source_fps,
  video_width,
  video_height,
  file_size_bytes,
  video_codec,
  pixel_format,
  ai_status,
  ai_count,
  ai_detected_frames,
  ai_category_count,
  ai_stats_updated_at,
  timeline_status,
  timeline_error,
  created_at,
  updated_at
FROM videos
ORDER BY uploaded_at DESC
LIMIT ${pageSize}
OFFSET ${offset};
`);

  return {
    page,
    pageSize,
    total: Number(countRow?.total ?? 0),
    items
  };
}

export async function getVideoById(videoId: string): Promise<VideoRow | null> {
  assertUuidV7(videoId);
  const rows = await queryRows<VideoRow>(`
SELECT
  id,
  filename,
  local_path,
  uploaded_at,
  duration_sec,
  source_fps,
  video_width,
  video_height,
  file_size_bytes,
  video_codec,
  pixel_format,
  ai_status,
  ai_count,
  ai_detected_frames,
  ai_category_count,
  ai_stats_updated_at,
  timeline_status,
  timeline_error,
  created_at,
  updated_at
FROM videos
WHERE id = ${sqlString(videoId)}
LIMIT 1;
`);

  return rows[0] ?? null;
}

export async function getAiJobByVideoId(videoId: string): Promise<AiJobRow | null> {
  assertUuidV7(videoId);
  const rows = await queryRows<AiJobRow>(`
SELECT status, updated_at, error_message
FROM ai_jobs
WHERE video_id = ${sqlString(videoId)}
LIMIT 1;
`);
  return rows[0] ?? null;
}

export async function deleteVideoById(videoId: string): Promise<void> {
  assertUuidV7(videoId);
  await executeMany([
    `DELETE FROM ai_jobs WHERE video_id = ${sqlString(videoId)};`,
    `DELETE FROM videos WHERE id = ${sqlString(videoId)};`
  ]);
}

export async function getCategoriesByVideoId(videoId: string): Promise<CategoryRow[]> {
  assertUuidV7(videoId);
  return queryRows<CategoryRow>(`
SELECT
  c.id,
  c.name,
  c.color,
  c.source,
  c.is_visible,
  COALESCE(a.cnt, 0) AS annotation_count
FROM categories c
LEFT JOIN (
  SELECT category_id, COUNT(*) AS cnt
  FROM annotations
  WHERE video_id = ${sqlString(videoId)}
  GROUP BY category_id
) a ON a.category_id = c.id
WHERE c.video_id = ${sqlString(videoId)}
ORDER BY c.created_at ASC;
`);
}

export async function getAnnotationsByVideoAndFrameIds(
  videoId: string,
  frameIds: string[]
): Promise<AnnotationRow[]> {
  assertUuidV7(videoId);
  if (frameIds.length === 0) {
    return [];
  }

  const inExpr = frameIds.map((frameId) => sqlString(frameId)).join(",");

  return queryRows<AnnotationRow>(`
SELECT id, frame_id, category_id, bbox_json, created_at, updated_at
FROM annotations
WHERE video_id = ${sqlString(videoId)}
  AND frame_id IN (${inExpr})
ORDER BY created_at ASC;
`);
}

export async function setAiProcessing(videoId: string): Promise<string> {
  assertUuidV7(videoId);
  const now = new Date().toISOString();
  await executeMany([
    `INSERT INTO ai_jobs (
      video_id,
      status,
      error_message,
      started_at,
      finished_at,
      canceled_at,
      updated_at
    ) VALUES (
      ${sqlString(videoId)},
      'PROCESSING',
      NULL,
      ${sqlString(now)},
      NULL,
      NULL,
      ${sqlString(now)}
    )
    ON CONFLICT(video_id) DO UPDATE SET
      status='PROCESSING',
      error_message=NULL,
      started_at=${sqlString(now)},
      finished_at=NULL,
      canceled_at=NULL,
      updated_at=${sqlString(now)};`,
    `UPDATE videos
     SET ai_status='PROCESSING',
         updated_at=${sqlString(now)}
     WHERE id=${sqlString(videoId)};`
  ]);
  return now;
}

export async function setAiCanceled(videoId: string): Promise<string> {
  assertUuidV7(videoId);
  const now = new Date().toISOString();
  await executeMany([
    `INSERT INTO ai_jobs (
      video_id,
      status,
      error_message,
      started_at,
      finished_at,
      canceled_at,
      updated_at
    ) VALUES (
      ${sqlString(videoId)},
      'CANCELED',
      NULL,
      NULL,
      NULL,
      ${sqlString(now)},
      ${sqlString(now)}
    )
    ON CONFLICT(video_id) DO UPDATE SET
      status='CANCELED',
      error_message=NULL,
      canceled_at=${sqlString(now)},
      finished_at=NULL,
      updated_at=${sqlString(now)};`,
    `UPDATE videos
     SET ai_status='CANCELED',
         updated_at=${sqlString(now)}
     WHERE id=${sqlString(videoId)};`
  ]);
  return now;
}

export async function setAiFailed(videoId: string, errorMessage: string): Promise<string> {
  assertUuidV7(videoId);
  const now = new Date().toISOString();
  await executeMany([
    `INSERT INTO ai_jobs (
      video_id,
      status,
      error_message,
      started_at,
      finished_at,
      canceled_at,
      updated_at
    ) VALUES (
      ${sqlString(videoId)},
      'FAILED',
      ${sqlString(errorMessage)},
      NULL,
      ${sqlString(now)},
      NULL,
      ${sqlString(now)}
    )
    ON CONFLICT(video_id) DO UPDATE SET
      status='FAILED',
      error_message=${sqlString(errorMessage)},
      finished_at=${sqlString(now)},
      updated_at=${sqlString(now)};`,
    `UPDATE videos
     SET ai_status='FAILED',
         updated_at=${sqlString(now)}
     WHERE id=${sqlString(videoId)};`
  ]);
  return now;
}

export interface AiDoneStats {
  aiCount: number;
  aiDetectedFrames: number;
  aiCategoryCount: number;
}

export async function setAiDone(videoId: string, stats: AiDoneStats): Promise<string> {
  assertUuidV7(videoId);
  const now = new Date().toISOString();
  await executeMany([
    `INSERT INTO ai_jobs (
      video_id,
      status,
      error_message,
      started_at,
      finished_at,
      canceled_at,
      updated_at
    ) VALUES (
      ${sqlString(videoId)},
      'DONE',
      NULL,
      NULL,
      ${sqlString(now)},
      NULL,
      ${sqlString(now)}
    )
    ON CONFLICT(video_id) DO UPDATE SET
      status='DONE',
      error_message=NULL,
      finished_at=${sqlString(now)},
      canceled_at=NULL,
      updated_at=${sqlString(now)};`,
    `UPDATE videos
     SET ai_status='DONE',
         ai_count=${sqlNullableNumber(stats.aiCount)},
         ai_detected_frames=${sqlNullableNumber(stats.aiDetectedFrames)},
         ai_category_count=${sqlNullableNumber(stats.aiCategoryCount)},
         ai_stats_updated_at=${sqlString(now)},
         updated_at=${sqlString(now)}
     WHERE id=${sqlString(videoId)};`
  ]);
  return now;
}

export async function resetAiToIdle(videoId: string): Promise<string> {
  assertUuidV7(videoId);
  const now = new Date().toISOString();
  await executeMany([
    `INSERT INTO ai_jobs (
      video_id,
      status,
      error_message,
      started_at,
      finished_at,
      canceled_at,
      updated_at
    ) VALUES (
      ${sqlString(videoId)},
      'IDLE',
      NULL,
      NULL,
      NULL,
      NULL,
      ${sqlString(now)}
    )
    ON CONFLICT(video_id) DO UPDATE SET
      status='IDLE',
      error_message=NULL,
      started_at=NULL,
      finished_at=NULL,
      canceled_at=NULL,
      updated_at=${sqlString(now)};`,
    `UPDATE videos
     SET ai_status='IDLE',
         ai_count=0,
         ai_detected_frames=0,
         ai_category_count=0,
         ai_stats_updated_at=NULL,
         updated_at=${sqlString(now)}
     WHERE id=${sqlString(videoId)};`
  ]);
  return now;
}
