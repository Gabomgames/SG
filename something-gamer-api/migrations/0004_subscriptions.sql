CREATE TABLE IF NOT EXISTS subscriptions (
 id TEXT PRIMARY KEY,uid TEXT NOT NULL,plan TEXT NOT NULL,client_key TEXT NOT NULL,reference TEXT NOT NULL UNIQUE,
 provider_id TEXT UNIQUE,checkout_url TEXT,status TEXT NOT NULL DEFAULT 'pending',price_cents INTEGER NOT NULL,
 consent_version TEXT NOT NULL,consented_at INTEGER NOT NULL,expires_at INTEGER,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,
 UNIQUE(uid,client_key),CHECK(plan IN ('creator_plus','seller_pro','community_pro')),CHECK(status IN ('pending','authorized','paused','cancelled'))
);
CREATE TABLE IF NOT EXISTS subscription_charges (
 payment_id TEXT PRIMARY KEY,subscription_id TEXT NOT NULL REFERENCES subscriptions(id),status TEXT NOT NULL,
 amount_cents INTEGER NOT NULL,paid_at INTEGER,expires_at INTEGER,updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS subscriptions_user ON subscriptions(uid,plan);

CREATE UNIQUE INDEX IF NOT EXISTS subscription_one_pending ON subscriptions(uid,plan) WHERE status IN ('pending','authorized');
