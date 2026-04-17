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

export interface CategoryItem {
  id: string;
  name: string;
  color: string;
  source: string;
  is_visible: number;
  annotation_count: number;
}

export interface AnnotationItem {
  id: string;
  frameId: string;
  categoryId: string;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  bboxJson: string;
  createdAt: string;
  updatedAt: string;
}
