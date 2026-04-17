CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  local_path TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  duration_sec REAL,
  source_fps REAL,
  video_width INTEGER,
  video_height INTEGER,
  file_size_bytes INTEGER,
  video_codec TEXT,
  pixel_format TEXT,
  ai_status TEXT NOT NULL DEFAULT 'IDLE',
  ai_count INTEGER NOT NULL DEFAULT 0,
  ai_detected_frames INTEGER NOT NULL DEFAULT 0,
  ai_category_count INTEGER NOT NULL DEFAULT 0,
  ai_stats_updated_at TEXT,
  timeline_status TEXT NOT NULL DEFAULT 'PENDING',
  timeline_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_jobs (
  video_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  error_message TEXT,
  started_at TEXT,
  finished_at TEXT,
  canceled_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  source TEXT NOT NULL,
  is_visible INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(video_id, name COLLATE NOCASE),
  FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL,
  frame_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  bbox_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE,
  FOREIGN KEY(category_id) REFERENCES categories(id)
);

CREATE INDEX IF NOT EXISTS idx_videos_uploaded_at ON videos(uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_categories_video_id ON categories(video_id);
CREATE INDEX IF NOT EXISTS idx_annotations_video_id ON annotations(video_id);
CREATE INDEX IF NOT EXISTS idx_annotations_frame_id ON annotations(frame_id);
