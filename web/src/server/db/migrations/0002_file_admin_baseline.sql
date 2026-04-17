CREATE TABLE IF NOT EXISTS video_consistency (
  video_id TEXT PRIMARY KEY,
  consistency_status TEXT NOT NULL,
  consistency_reason TEXT,
  last_checked_at TEXT NOT NULL,
  check_source TEXT NOT NULL,
  locked_by_processing INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_video_consistency_status ON video_consistency(consistency_status);
