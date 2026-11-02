CREATE TABLE IF NOT EXISTS meta_drafts (
 id TEXT PRIMARY KEY,uid TEXT NOT NULL,client_key TEXT NOT NULL,request_hash TEXT NOT NULL,account_id TEXT NOT NULL,
 campaign_id TEXT,adset_id TEXT,creative_id TEXT,ad_id TEXT,busy_until INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,UNIQUE(uid,client_key)
);
