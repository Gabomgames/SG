CREATE TABLE IF NOT EXISTS market_response_samples (offer_id TEXT PRIMARY KEY REFERENCES market_offers(id),seller_uid TEXT NOT NULL,response_ms INTEGER NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS market_response_seller ON market_response_samples(seller_uid,created_at);
CREATE TRIGGER IF NOT EXISTS market_first_response AFTER UPDATE OF state ON market_offers WHEN NEW.last_actor=NEW.seller_uid AND OLD.last_actor=OLD.buyer_uid AND NEW.state IN ('countered','accepted','rejected') BEGIN
 INSERT OR IGNORE INTO market_response_samples VALUES (NEW.id,NEW.seller_uid,MAX(0,NEW.updated_at-NEW.created_at),NEW.updated_at);
END;
