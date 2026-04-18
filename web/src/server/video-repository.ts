import {
  executeMany,
  queryRows,
  sqlBoolean,
  sqlNullableNumber,
  sqlNullableString,
  sqlString
} from "@/server/db";
import { uuidv7 } from "@/server/uuidv7";
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
  stroke_width: number;
  stroke_color: string | null;
}

export interface AnnotationRow {
  id: string;
  frame_id: string;
  category_id: string;
  annotation_type: string;
  geometry_json: string | null;
  text_content: string | null;
  is_visible: number;
  bbox_json: string;
  created_at: string;
  updated_at: string;
}

interface IdRow {
  id: string;
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
  COALESCE(a.cnt, 0) AS annotation_count,
  c.stroke_width,
  c.stroke_color
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

export async function getCategoryById(videoId: string, categoryId: string): Promise<CategoryRow | null> {
  assertUuidV7(videoId);
  const rows = await queryRows<CategoryRow>(`
SELECT
  c.id,
  c.name,
  c.color,
  c.source,
  c.is_visible,
  COALESCE(a.cnt, 0) AS annotation_count,
  c.stroke_width,
  c.stroke_color
FROM categories c
LEFT JOIN (
  SELECT category_id, COUNT(*) AS cnt
  FROM annotations
  WHERE video_id = ${sqlString(videoId)}
  GROUP BY category_id
) a ON a.category_id = c.id
WHERE c.video_id = ${sqlString(videoId)}
  AND c.id = ${sqlString(categoryId)}
LIMIT 1;
`);
  return rows[0] ?? null;
}

export async function getCategoryByNameIgnoreCase(
  videoId: string,
  name: string
): Promise<Pick<CategoryRow, "id" | "name"> | null> {
  assertUuidV7(videoId);
  const rows = await queryRows<Pick<CategoryRow, "id" | "name">>(`
SELECT id, name
FROM categories
WHERE video_id = ${sqlString(videoId)}
  AND LOWER(name) = LOWER(${sqlString(name)})
LIMIT 1;
`);
  return rows[0] ?? null;
}

export async function createManualCategory(
  videoId: string,
  name: string,
  color: string
): Promise<CategoryRow> {
  assertUuidV7(videoId);
  const now = new Date().toISOString();
  const categoryId = uuidv7();

  await executeMany([
    `INSERT INTO categories (
      id,
      video_id,
      name,
      color,
      source,
      is_visible,
      created_at,
      updated_at
    ) VALUES (
      ${sqlString(categoryId)},
      ${sqlString(videoId)},
      ${sqlString(name)},
      ${sqlString(color)},
      'MANUAL',
      1,
      ${sqlString(now)},
      ${sqlString(now)}
    );`
  ]);

  const created = await getCategoryById(videoId, categoryId);
  if (!created) {
    throw new Error("Failed to create category.");
  }
  return created;
}

export async function updateCategory(
  videoId: string,
  categoryId: string,
  patch: {
    name?: string;
    color?: string;
    isVisible?: boolean;
    strokeWidth?: number;
    strokeColor?: string | null;
  }
): Promise<CategoryRow | null> {
  assertUuidV7(videoId);

  const sets: string[] = [];
  if (patch.name !== undefined) {
    sets.push(`name = ${sqlString(patch.name)}`);
  }
  if (patch.color !== undefined) {
    sets.push(`color = ${sqlString(patch.color)}`);
  }
  if (patch.isVisible !== undefined) {
    sets.push(`is_visible = ${sqlBoolean(patch.isVisible)}`);
  }
  if (patch.strokeWidth !== undefined) {
    sets.push(`stroke_width = ${patch.strokeWidth}`);
  }
  if (patch.strokeColor !== undefined) {
    sets.push(`stroke_color = ${patch.strokeColor === null ? "NULL" : sqlString(patch.strokeColor)}`);
  }

  if (sets.length === 0) {
    return getCategoryById(videoId, categoryId);
  }

  sets.push(`updated_at = ${sqlString(new Date().toISOString())}`);

  await executeMany([
    `UPDATE categories
     SET ${sets.join(",\n         ")}
     WHERE video_id = ${sqlString(videoId)}
       AND id = ${sqlString(categoryId)};`
  ]);

  return getCategoryById(videoId, categoryId);
}

export async function deleteCategory(videoId: string, categoryId: string): Promise<void> {
  assertUuidV7(videoId);
  await executeMany([
    `DELETE FROM categories
     WHERE video_id = ${sqlString(videoId)}
       AND id = ${sqlString(categoryId)};`
  ]);
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
SELECT id, frame_id, category_id, annotation_type, geometry_json, text_content, is_visible, bbox_json, created_at, updated_at
FROM annotations
WHERE video_id = ${sqlString(videoId)}
  AND frame_id IN (${inExpr})
ORDER BY created_at ASC;
`);
}

export async function listAnnotations(
  videoId: string,
  options: {
    frameId?: string | null;
    source?: "MANUAL" | "AI" | null;
    cursor: number;
    limit: number;
  }
): Promise<{ items: AnnotationRow[]; nextCursor: number | null; total: number }> {
  assertUuidV7(videoId);

  const where: string[] = [`a.video_id = ${sqlString(videoId)}`];
  if (options.frameId) {
    where.push(`a.frame_id = ${sqlString(options.frameId)}`);
  }
  if (options.source) {
    where.push(`c.source = ${sqlString(options.source)}`);
  }

  const whereExpr = where.join("\n  AND ");
  const countRows = await queryRows<CountRow>(`
SELECT COUNT(*) AS total
FROM annotations a
LEFT JOIN categories c ON c.id = a.category_id
WHERE ${whereExpr};
`);
  const total = Number(countRows[0]?.total ?? 0);

  const items = await queryRows<AnnotationRow>(`
SELECT a.id, a.frame_id, a.category_id, a.annotation_type, a.geometry_json, a.text_content, a.is_visible, a.bbox_json, a.created_at, a.updated_at
FROM annotations a
LEFT JOIN categories c ON c.id = a.category_id
WHERE ${whereExpr}
ORDER BY a.created_at ASC
LIMIT ${options.limit}
OFFSET ${options.cursor};
`);

  const nextCursor = options.cursor + items.length >= total ? null : options.cursor + items.length;
  return { items, nextCursor, total };
}

export async function getAnnotationById(videoId: string, annotationId: string): Promise<AnnotationRow | null> {
  assertUuidV7(videoId);
  const rows = await queryRows<AnnotationRow>(`
SELECT id, frame_id, category_id, annotation_type, geometry_json, text_content, is_visible, bbox_json, created_at, updated_at
FROM annotations
WHERE video_id = ${sqlString(videoId)}
  AND id = ${sqlString(annotationId)}
LIMIT 1;
`);
  return rows[0] ?? null;
}

export async function createManualAnnotation(input: {
  videoId: string;
  frameId: string;
  categoryId: string;
  annotationType: string;
  geometryJson: string;
  textContent: string | null;
  bboxJson: string;
}): Promise<AnnotationRow> {
  assertUuidV7(input.videoId);
  const annotationId = uuidv7();
  const now = new Date().toISOString();

  await executeMany([
    `INSERT INTO annotations (
      id,
      video_id,
      frame_id,
      category_id,
      annotation_type,
      geometry_json,
      text_content,
      is_visible,
      bbox_json,
      created_at,
      updated_at
    ) VALUES (
      ${sqlString(annotationId)},
      ${sqlString(input.videoId)},
      ${sqlString(input.frameId)},
      ${sqlString(input.categoryId)},
      ${sqlString(input.annotationType)},
      ${sqlString(input.geometryJson)},
      ${sqlNullableString(input.textContent)},
      1,
      ${sqlString(input.bboxJson)},
      ${sqlString(now)},
      ${sqlString(now)}
    );`
  ]);

  const created = await getAnnotationById(input.videoId, annotationId);
  if (!created) {
    throw new Error("Failed to create annotation.");
  }
  return created;
}

export async function updateAnnotation(
  videoId: string,
  annotationId: string,
  patch: {
    categoryId?: string;
    isVisible?: boolean;
    geometryJson?: string;
  }
): Promise<AnnotationRow | null> {
  assertUuidV7(videoId);
  const sets: string[] = [];
  if (patch.categoryId !== undefined) {
    sets.push(`category_id = ${sqlString(patch.categoryId)}`);
  }
  if (patch.isVisible !== undefined) {
    sets.push(`is_visible = ${sqlBoolean(patch.isVisible)}`);
  }
  if (patch.geometryJson !== undefined) {
    sets.push(`geometry_json = ${sqlString(patch.geometryJson)}`);
  }
  if (sets.length === 0) {
    return getAnnotationById(videoId, annotationId);
  }

  sets.push(`updated_at = ${sqlString(new Date().toISOString())}`);

  await executeMany([
    `UPDATE annotations
     SET ${sets.join(",\n         ")}
     WHERE video_id = ${sqlString(videoId)}
       AND id = ${sqlString(annotationId)};`
  ]);

  return getAnnotationById(videoId, annotationId);
}

export async function deleteAnnotation(videoId: string, annotationId: string): Promise<void> {
  assertUuidV7(videoId);
  await executeMany([
    `DELETE FROM annotations
     WHERE video_id = ${sqlString(videoId)}
       AND id = ${sqlString(annotationId)};`
  ]);
}

export async function categoryExistsForVideo(videoId: string, categoryId: string): Promise<boolean> {
  assertUuidV7(videoId);
  const rows = await queryRows<IdRow>(`
SELECT id
FROM categories
WHERE video_id = ${sqlString(videoId)}
  AND id = ${sqlString(categoryId)}
LIMIT 1;
`);
  return Boolean(rows[0]?.id);
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

export async function listProcessingAiVideoIds(): Promise<string[]> {
  const rows = await queryRows<IdRow>(`
SELECT v.id
FROM videos v
LEFT JOIN ai_jobs aj ON aj.video_id = v.id
WHERE COALESCE(aj.status, v.ai_status) = 'PROCESSING';
`);
  return rows.map((row) => row.id);
}
