export type UploadStatus =
  | "IDLE"
  | "PICKED"
  | "UPLOADING"
  | "PARSING_METADATA"
  | "READY"
  | "FAILED"
  | "CANCELED";

export interface ApiErrorPayload {
  ok: false;
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
  requestId?: string;
}

export interface ApiOkPayload<T> {
  ok: true;
  data: T;
}

export interface VideoListItem {
  id: string;
  filename: string;
  uploaded_at: string;
  ai_status: string;
  timeline_status: string;
}

export interface VideosListData {
  page: number;
  pageSize: number;
  total: number;
  items: VideoListItem[];
}

export interface TimelineFrame {
  frameId: string;
  displayIndex: number;
  ptsUs: number;
  isKeyframe: boolean;
}

export interface TimelinePageData {
  videoId: string;
  total: number;
  nextCursor: number | null;
  items: TimelineFrame[];
}

export interface BootstrapData {
  videoId: string;
  meta: {
    filename: string;
    uploadedAt: string;
    video_width: number | null;
    video_height: number | null;
    source_fps: number | null;
    duration_sec: number | null;
    file_size_bytes: number;
    video_codec: string | null;
    pixel_format: string | null;
  };
  timelineSummary: {
    totalFrames: number;
    firstPtsUs: number | null;
    lastPtsUs: number | null;
    currentDisplayIndex: number;
    timelineStatus: string;
    window: {
      startDisplayIndex: number;
      endDisplayIndex: number;
    };
  };
  categories: Array<{
    id: string;
    name: string;
    color: string;
    source: string;
    is_visible: number;
    annotation_count: number;
  }>;
  annotationsCurrentWindow: Array<{
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
  }>;
  aiStatus: string;
  aiSummary: {
    aiCount: number;
    aiDetectedFrames: number;
    aiCategoryCount: number;
    aiStatsUpdatedAt: string | null;
    errorMessage: string | null;
  };
}

export interface UploadResponseData {
  videoId: string;
  status: string;
  metadata: {
    videoWidth: number | null;
    videoHeight: number | null;
    sourceFps: number | null;
    durationSec: number | null;
    videoCodec: string | null;
  };
}

export interface UploadNotification {
  kind: "success" | "error" | "info";
  message: string;
}

export type AiStatus = "IDLE" | "PROCESSING" | "DONE" | "FAILED" | "CANCELED";

export interface AiStatusData {
  videoId: string;
  status: AiStatus;
  errorMessage: string | null;
  updatedAt: string;
  progress: number;
}

export interface AiResultImage {
  id: number;
  file_name: string;
  width: number;
  height: number;
  frame_index: number;
  pts_us: number;
}

export interface AiResultAnnotation {
  id: number;
  image_id: number;
  category_id: number;
  bbox: [number, number, number, number];
  score: number;
  track_id: number;
  frame_index: number;
  pts_us: number;
  source: "AI";
}

export interface AiResultCategory {
  id: number;
  name: string;
  supercategory: string;
}

export interface AiResultData {
  videoId: string;
  status: string;
  summary: {
    aiCount: number;
    aiDetectedFrames: number;
    aiCategoryCount: number;
    aiStatsUpdatedAt: string | null;
  };
  coco: {
    images: AiResultImage[];
    annotations: AiResultAnnotation[];
    categories: AiResultCategory[];
  };
}

export interface CategoryItem {
  id: string;
  name: string;
  color: string;
  source: string;
  is_visible: number;
  annotation_count: number;
}

export type AnnotationType = "BBOX" | "POLYGON" | "TEXT";

export interface BboxGeometry {
  type: "bbox";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PolygonGeometry {
  type: "polygon";
  points: Array<{ x: number; y: number }>;
}

export interface TextGeometry {
  type: "text";
  x: number;
  y: number;
}

export type AnnotationGeometry = BboxGeometry | PolygonGeometry | TextGeometry;

export interface AnnotationItem {
  id: string;
  frameId: string;
  categoryId: string;
  annotationType: AnnotationType;
  geometry: AnnotationGeometry | null;
  geometryJson: string;
  textContent: string | null;
  isVisible: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminFileMetadataPreview {
  video_width: number | null;
  video_height: number | null;
  source_fps: number | null;
  duration_sec: number | null;
  video_codec: string | null;
  pixel_format: string | null;
  storage_path: string;
  file_size_bytes: number | null;
}

export interface AdminFileConsistencyInfo {
  last_checked_at: string | null;
  consistency_reason: string | null;
  locked_by_processing: boolean;
}

export interface AdminFileListItem {
  video_id: string;
  filename: string;
  uploaded_at: string;
  category_count: number;
  annotation_count: number;
  ai_status: string;
  ai_category_count: number;
  ai_annotation_count: number;
  metadata_preview: AdminFileMetadataPreview;
  consistency_status: string;
  consistency_info: AdminFileConsistencyInfo;
}

export interface AdminFileListData {
  page: number;
  pageSize: number;
  total: number;
  items: AdminFileListItem[];
}

export interface AdminFileConsistencyProblem {
  code: string;
  message: string;
  severity: "P0" | "P1" | "P2";
  path?: string;
}

export interface AdminFileConsistencyAction {
  code: string;
  title: string;
  mode: "dry-run" | "apply";
}

export interface AdminFileConsistencyData {
  videoId: string;
  consistencyStatus: string;
  checkedAt: string;
  lockedByProcessing: boolean;
  problems: AdminFileConsistencyProblem[];
  suggestedActions: AdminFileConsistencyAction[];
}

export interface AdminFileReconcileItem {
  videoId: string;
  changed: boolean;
  appliedActions: string[];
  skippedActions: Array<{
    action: string;
    reason: string;
  }>;
  problems: string[];
}

export interface AdminFileReconcileData {
  mode: "dry-run" | "apply";
  summary: {
    checked: number;
    changed: number;
    skipped: number;
  };
  items: AdminFileReconcileItem[];
}

export interface AdminFileCleanupCandidate {
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

export interface AdminFileCleanupData {
  mode: "dry-run" | "apply";
  policy: {
    retentionDays: number;
    keepLatestPerFilename: number;
    highWatermarkPercent: number;
    filename: string | null;
  };
  summary: {
    checked: number;
    eligible: number;
    deleted: number;
    estimatedReclaimedBytes: number;
  };
  confirmationToken: string | null;
  candidates: AdminFileCleanupCandidate[];
}

export interface AdminFileRiskSummaryData {
  generated_at: string;
  open_p0: number;
  open_p1: number;
  open_p2: number;
  new_24h: number;
  resolved_24h: number;
}

export interface AdminFileRiskEventItem {
  risk_code: string;
  severity: "P0" | "P1" | "P2";
  status: "OPEN" | "RESOLVED";
  trigger_time: string;
  resolved_time: string | null;
  trigger_source: string | null;
  owner: string | null;
  latest_note: string | null;
  video_id: string | null;
}

export interface AdminFileRiskEventsData {
  page: number;
  pageSize: number;
  total: number;
  items: AdminFileRiskEventItem[];
}

export interface AdminFileRiskEventMutationData {
  item: AdminFileRiskEventItem;
}

export type AdminFileAuditEventType = "RECONCILE_APPLY" | "CLEANUP_APPLY" | "RISK_EVENT_MANUAL";

export interface AdminFileAuditHistoryItem {
  id: string;
  event_type: AdminFileAuditEventType | string;
  actor: string;
  payload: unknown;
  result: unknown;
  created_at: string;
}

export interface AdminFileAuditHistoryData {
  page: number;
  pageSize: number;
  total: number;
  items: AdminFileAuditHistoryItem[];
}
