CREATE TABLE IF NOT EXISTS now_call_sessions (room TEXT NOT NULL,uid TEXT NOT NULL,session TEXT NOT NULL,server_id TEXT NOT NULL,expires_at INTEGER NOT NULL,PRIMARY KEY(room,uid));
CREATE INDEX IF NOT EXISTS now_call_expiry ON now_call_sessions(expires_at);
