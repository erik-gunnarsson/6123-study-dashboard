CREATE TABLE IF NOT EXISTS analytics_events (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id
  ON analytics_events(user_id);

CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at
  ON analytics_events(created_at);

CREATE INDEX IF NOT EXISTS idx_analytics_events_type_created_at
  ON analytics_events(event_type, created_at);

CREATE INDEX IF NOT EXISTS idx_analytics_events_user_created_at
  ON analytics_events(user_id, created_at);
