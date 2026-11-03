CREATE TABLE IF NOT EXISTS quarantined_media (
 id TEXT PRIMARY KEY, owner_uid TEXT NOT NULL, purpose TEXT NOT NULL,
 content_type TEXT NOT NULL, size INTEGER NOT NULL, sha256 TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending_review', created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL, bound_post TEXT, context_id TEXT, reason TEXT NOT NULL DEFAULT '',
 CHECK(size > 0), CHECK(state IN ('pending_review','approved','rejected','deleted'))
);
CREATE INDEX IF NOT EXISTS quarantine_expiry ON quarantined_media(expires_at);
CREATE TABLE IF NOT EXISTS post_submissions (
 id TEXT PRIMARY KEY, owner_uid TEXT NOT NULL, draft_hash TEXT NOT NULL,
 payload TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'processing', reason TEXT NOT NULL DEFAULT '',
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 CHECK(state IN ('processing','reviewing','pending_review','authorized','published','rejected'))
);
