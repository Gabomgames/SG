CREATE TABLE IF NOT EXISTS social_media (
 id TEXT PRIMARY KEY,owner_uid TEXT NOT NULL,type TEXT NOT NULL,bytes INTEGER NOT NULL CHECK(bytes BETWEEN 1 AND 8388608),created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS social_media_expiry ON social_media(expires_at);
CREATE TABLE IF NOT EXISTS social_content (
 id TEXT PRIMARY KEY,owner_uid TEXT NOT NULL,client_key TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('post','story','reel')),
 caption TEXT NOT NULL,media_id TEXT REFERENCES social_media(id),state TEXT NOT NULL DEFAULT 'pending_review' CHECK(state IN ('pending_review','published','rejected','deleted')),
 created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,review_reason TEXT,reviewed_by TEXT,UNIQUE(owner_uid,client_key)
);
CREATE INDEX IF NOT EXISTS social_content_feed ON social_content(kind,state,created_at);
CREATE TABLE IF NOT EXISTS social_likes (content_id TEXT NOT NULL REFERENCES social_content(id),uid TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(content_id,uid));
CREATE TABLE IF NOT EXISTS social_views (content_id TEXT NOT NULL REFERENCES social_content(id),uid TEXT NOT NULL,day TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(content_id,uid,day));
CREATE TABLE IF NOT EXISTS social_comments (id TEXT PRIMARY KEY,content_id TEXT NOT NULL REFERENCES social_content(id),uid TEXT NOT NULL,text TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS social_reports (id TEXT PRIMARY KEY,content_id TEXT NOT NULL REFERENCES social_content(id),uid TEXT NOT NULL,reason TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',created_at INTEGER NOT NULL,UNIQUE(content_id,uid));
