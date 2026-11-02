CREATE TABLE IF NOT EXISTS external_oauth_states (provider TEXT NOT NULL,state_hash TEXT PRIMARY KEY,uid TEXT NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS meta_connections (uid TEXT PRIMARY KEY,credentials TEXT NOT NULL,expires_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
