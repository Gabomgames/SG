CREATE TABLE IF NOT EXISTS media_quota (
 uid TEXT NOT NULL, day TEXT NOT NULL, bytes INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(uid,day), CHECK(bytes >= 0)
);
CREATE TABLE IF NOT EXISTS private_media (
 id TEXT PRIMARY KEY, owner_uid TEXT NOT NULL, conversation TEXT NOT NULL,
 content_type TEXT NOT NULL, size INTEGER NOT NULL, created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL, CHECK(size > 0)
);
CREATE INDEX IF NOT EXISTS media_expiration ON private_media(expires_at);
