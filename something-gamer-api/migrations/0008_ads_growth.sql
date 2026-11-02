CREATE TABLE IF NOT EXISTS ad_preferences (
 uid TEXT PRIMARY KEY,consent INTEGER NOT NULL CHECK(consent IN (0,1)),region TEXT NOT NULL DEFAULT '',interests TEXT NOT NULL DEFAULT '[]',updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ad_creatives (
 campaign_id TEXT PRIMARY KEY REFERENCES ad_campaigns(id),media_id TEXT REFERENCES social_media(id),placement TEXT NOT NULL DEFAULT 'feed' CHECK(placement IN ('feed','story','reel')),
 audience TEXT NOT NULL DEFAULT 'broad' CHECK(audience IN ('broad','consented')),region TEXT NOT NULL DEFAULT '',interests TEXT NOT NULL DEFAULT '[]',target_product TEXT
);
CREATE TABLE IF NOT EXISTS ad_conversions (
 order_id TEXT PRIMARY KEY REFERENCES market_orders(id),campaign_id TEXT NOT NULL REFERENCES ad_campaigns(id),delivery_id TEXT NOT NULL REFERENCES ad_delivery(id),value_cents INTEGER NOT NULL,created_at INTEGER NOT NULL
);
CREATE TRIGGER IF NOT EXISTS ad_paid_conversion AFTER UPDATE OF state ON market_orders WHEN OLD.state='awaiting_payment' AND NEW.state='paid' BEGIN
 INSERT OR IGNORE INTO ad_conversions(order_id,campaign_id,delivery_id,value_cents,created_at)
 SELECT NEW.id,d.campaign_id,d.id,NEW.subtotal_cents,NEW.updated_at FROM ad_delivery d JOIN ad_creatives c ON c.campaign_id=d.campaign_id
 WHERE d.viewer_uid=NEW.buyer_uid AND d.clicked_at IS NOT NULL AND d.clicked_at<=NEW.created_at AND d.clicked_at>=NEW.created_at-604800000
 AND EXISTS(SELECT 1 FROM market_order_items i WHERE i.order_id=NEW.id AND i.product_id=c.target_product)
 ORDER BY d.clicked_at DESC LIMIT 1;
END;
