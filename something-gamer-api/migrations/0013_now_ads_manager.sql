CREATE TABLE IF NOT EXISTS now_campaigns (
 campaign_id TEXT PRIMARY KEY REFERENCES ad_campaigns(id),objective TEXT NOT NULL CHECK(objective IN ('awareness','traffic','engagement','leads','app','sales')),
 allocation TEXT NOT NULL CHECK(allocation IN ('campaign','sets')),daily_cents INTEGER NOT NULL CHECK(daily_cents>=1),client_key TEXT NOT NULL,UNIQUE(client_key)
);
CREATE TABLE IF NOT EXISTS now_audiences (
 id TEXT PRIMARY KEY,owner_uid TEXT NOT NULL,name TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('core','custom','lookalike','list')),source_campaign TEXT,signals TEXT NOT NULL DEFAULT '[]',contact_hashes TEXT NOT NULL DEFAULT '[]',created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS now_ad_sets (
 id TEXT PRIMARY KEY,campaign_id TEXT NOT NULL REFERENCES now_campaigns(campaign_id),name TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','paused')),
 budget_cents INTEGER NOT NULL CHECK(budget_cents>=1),daily_cents INTEGER NOT NULL CHECK(daily_cents>=1),starts_at INTEGER NOT NULL,ends_at INTEGER NOT NULL,
 placements TEXT NOT NULL,region TEXT NOT NULL DEFAULT '',age_filter INTEGER NOT NULL DEFAULT 0 CHECK(age_filter IN (0,1)),age_min INTEGER NOT NULL DEFAULT 18 CHECK(age_min>=18),age_max INTEGER NOT NULL DEFAULT 100 CHECK(age_max<=100 AND age_max>=age_min),gender TEXT NOT NULL DEFAULT 'all',interests TEXT NOT NULL DEFAULT '[]',behaviors TEXT NOT NULL DEFAULT '[]',audience_id TEXT REFERENCES now_audiences(id),hours TEXT NOT NULL DEFAULT '[]',created_at INTEGER NOT NULL,request_hash TEXT NOT NULL,client_key TEXT UNIQUE
);
CREATE TABLE IF NOT EXISTS now_ads (
 id TEXT PRIMARY KEY,set_id TEXT NOT NULL REFERENCES now_ad_sets(id),name TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','paused')),format TEXT NOT NULL CHECK(format IN ('text','image','video','carousel','collection')),headline TEXT NOT NULL,body TEXT NOT NULL,cta TEXT NOT NULL,target_url TEXT NOT NULL,target_type TEXT NOT NULL,target_id TEXT,media_ids TEXT NOT NULL DEFAULT '[]',products TEXT NOT NULL DEFAULT '[]',created_at INTEGER NOT NULL,request_hash TEXT NOT NULL,client_key TEXT UNIQUE
);
CREATE TABLE IF NOT EXISTS now_delivery (
 delivery_id TEXT PRIMARY KEY REFERENCES ad_delivery(id),ad_id TEXT NOT NULL REFERENCES now_ads(id),set_id TEXT NOT NULL REFERENCES now_ad_sets(id)
);
CREATE TABLE IF NOT EXISTS now_profile (
 uid TEXT PRIMARY KEY,age INTEGER CHECK(age BETWEEN 18 AND 100),gender TEXT NOT NULL DEFAULT 'undisclosed',behaviors TEXT NOT NULL DEFAULT '[]',updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS now_events (
 id TEXT PRIMARY KEY,uid TEXT NOT NULL,delivery_id TEXT NOT NULL REFERENCES ad_delivery(id),kind TEXT NOT NULL CHECK(kind IN ('landing_view','video_complete','engagement','add_to_cart','app_visit')),created_at INTEGER NOT NULL,UNIQUE(uid,delivery_id,kind)
);
CREATE TABLE IF NOT EXISTS now_leads (
 id TEXT PRIMARY KEY,uid TEXT NOT NULL,delivery_id TEXT NOT NULL REFERENCES ad_delivery(id),campaign_id TEXT NOT NULL REFERENCES now_campaigns(campaign_id),name TEXT NOT NULL,email TEXT NOT NULL,phone TEXT NOT NULL,consent_version TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,UNIQUE(uid,campaign_id)
);
CREATE TABLE IF NOT EXISTS now_rules (
 id TEXT PRIMARY KEY,campaign_id TEXT NOT NULL REFERENCES ad_campaigns(id),name TEXT NOT NULL,min_spend_cents INTEGER NOT NULL,min_sales INTEGER NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,last_triggered INTEGER,created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS now_rule_log (id TEXT PRIMARY KEY,rule_id TEXT NOT NULL REFERENCES now_rules(id),campaign_id TEXT NOT NULL,spend_cents INTEGER NOT NULL,sales INTEGER NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS now_sets_campaign ON now_ad_sets(campaign_id,state,starts_at,ends_at);
CREATE INDEX IF NOT EXISTS now_ads_set ON now_ads(set_id,state);
CREATE INDEX IF NOT EXISTS now_events_delivery ON now_events(delivery_id,kind);
CREATE TRIGGER IF NOT EXISTS now_budget_guard BEFORE UPDATE OF viewed_at ON ad_delivery WHEN OLD.viewed_at IS NULL AND NEW.viewed_at IS NOT NULL AND EXISTS(SELECT 1 FROM now_delivery WHERE delivery_id=NEW.id) BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM now_delivery d JOIN now_ads a ON a.id=d.ad_id JOIN now_ad_sets s ON s.id=d.set_id JOIN now_campaigns c ON c.campaign_id=NEW.campaign_id WHERE d.delivery_id=NEW.id AND a.state='active' AND s.state='active' AND s.starts_at<=NEW.viewed_at AND s.ends_at>NEW.viewed_at AND (s.hours='[]' OR EXISTS(SELECT 1 FROM json_each(s.hours) h WHERE h.value=CAST(strftime('%H',NEW.viewed_at/1000,'unixepoch') AS INTEGER))) AND (SELECT COUNT(*) FROM now_delivery n JOIN ad_delivery x ON x.id=n.delivery_id WHERE n.set_id=s.id AND x.viewed_at IS NOT NULL)<s.budget_cents AND (SELECT COUNT(*) FROM now_delivery n JOIN ad_delivery x ON x.id=n.delivery_id WHERE n.set_id=s.id AND x.day=NEW.day AND x.viewed_at IS NOT NULL)<s.daily_cents AND (SELECT COUNT(*) FROM ad_delivery x WHERE x.campaign_id=NEW.campaign_id AND x.day=NEW.day AND x.viewed_at IS NOT NULL)<c.daily_cents) THEN RAISE(ABORT,'AD_BUDGET_EXHAUSTED') END;
END;
CREATE TRIGGER IF NOT EXISTS now_purchase_conversion AFTER UPDATE OF state ON market_orders WHEN OLD.state='awaiting_payment' AND NEW.state='paid' BEGIN
 INSERT OR IGNORE INTO ad_conversions(order_id,campaign_id,delivery_id,value_cents,created_at)
 SELECT NEW.id,d.campaign_id,d.id,NEW.subtotal_cents,NEW.updated_at FROM ad_delivery d JOIN now_delivery n ON n.delivery_id=d.id JOIN now_ads a ON a.id=n.ad_id
 WHERE d.viewer_uid=NEW.buyer_uid AND d.clicked_at IS NOT NULL AND d.clicked_at<=NEW.created_at AND d.clicked_at>=NEW.created_at-604800000 AND (a.target_type='market' AND EXISTS(SELECT 1 FROM market_order_items i WHERE i.order_id=NEW.id AND i.product_id=a.target_id) OR EXISTS(SELECT 1 FROM json_each(a.products) p JOIN market_order_items i ON i.product_id=p.value WHERE i.order_id=NEW.id)) ORDER BY d.clicked_at DESC LIMIT 1;
END;
