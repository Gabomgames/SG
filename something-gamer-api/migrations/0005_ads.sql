CREATE TABLE IF NOT EXISTS ad_campaigns (
 id TEXT PRIMARY KEY,owner_uid TEXT NOT NULL,name TEXT NOT NULL,headline TEXT NOT NULL,body TEXT NOT NULL,target_url TEXT NOT NULL,
 budget_cents INTEGER NOT NULL CHECK(budget_cents BETWEEN 1000 AND 100000),spent_cents INTEGER NOT NULL DEFAULT 0 CHECK(spent_cents >= 0 AND spent_cents <= budget_cents),
 duration_days INTEGER NOT NULL CHECK(duration_days BETWEEN 1 AND 90),state TEXT NOT NULL DEFAULT 'draft',
 provider_id TEXT UNIQUE,reference TEXT NOT NULL UNIQUE,checkout_url TEXT,payment_state TEXT NOT NULL DEFAULT 'pending',
 reviewed_by TEXT,review_reason TEXT,starts_at INTEGER,ends_at INTEGER,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,
 CHECK(state IN ('draft','awaiting_payment','pending_review','active','paused','rejected','finished','revoked'))
);
CREATE TABLE IF NOT EXISTS ad_delivery (
 id TEXT PRIMARY KEY,campaign_id TEXT NOT NULL REFERENCES ad_campaigns(id),viewer_uid TEXT NOT NULL,expires_at INTEGER NOT NULL,
 viewed_at INTEGER,clicked_at INTEGER,day TEXT NOT NULL,UNIQUE(campaign_id,viewer_uid,day)
);
CREATE INDEX IF NOT EXISTS ad_eligible ON ad_campaigns(state,ends_at,spent_cents);
CREATE TRIGGER IF NOT EXISTS ads_charge AFTER UPDATE OF viewed_at ON ad_delivery
 WHEN OLD.viewed_at IS NULL AND NEW.viewed_at IS NOT NULL BEGIN
 UPDATE ad_campaigns SET spent_cents=spent_cents+1 WHERE id=NEW.campaign_id AND state='active' AND spent_cents<budget_cents AND ends_at>NEW.viewed_at;
 SELECT CASE WHEN changes()<>1 THEN RAISE(ABORT,'AD_BUDGET_EXHAUSTED') END;
END;
