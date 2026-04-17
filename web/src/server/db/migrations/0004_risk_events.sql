CREATE TABLE IF NOT EXISTS risk_events (
  id TEXT PRIMARY KEY,
  risk_code TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('OPEN', 'RESOLVED')),
  trigger_time TEXT NOT NULL,
  resolved_time TEXT,
  trigger_source TEXT,
  owner TEXT,
  latest_note TEXT,
  video_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(risk_code, scope_key),
  FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_risk_events_status_severity
ON risk_events(status, severity);

CREATE INDEX IF NOT EXISTS idx_risk_events_trigger_time
ON risk_events(trigger_time DESC);

CREATE INDEX IF NOT EXISTS idx_risk_events_resolved_time
ON risk_events(resolved_time DESC);

CREATE INDEX IF NOT EXISTS idx_risk_events_video_id
ON risk_events(video_id);
