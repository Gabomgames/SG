CREATE TABLE IF NOT EXISTS market_details (
 product_id TEXT PRIMARY KEY REFERENCES market_products(id),lat REAL,lng REAL,precision TEXT NOT NULL DEFAULT 'approximate' CHECK(precision IN ('approximate','exact')),tags TEXT NOT NULL DEFAULT '[]',delivery_mode TEXT NOT NULL DEFAULT 'combined' CHECK(delivery_mode IN ('pickup','shipping','combined')),review_state TEXT NOT NULL DEFAULT 'approved' CHECK(review_state IN ('pending','approved','rejected')),review_reason TEXT NOT NULL DEFAULT '',listing_hash TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS market_photos (product_id TEXT NOT NULL REFERENCES market_products(id),media_id TEXT NOT NULL REFERENCES social_media(id),position INTEGER NOT NULL CHECK(position BETWEEN 0 AND 9),PRIMARY KEY(product_id,position),UNIQUE(product_id,media_id));
CREATE TABLE IF NOT EXISTS market_activity (product_id TEXT NOT NULL REFERENCES market_products(id),uid TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('view','share')),day TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(product_id,uid,kind,day));
CREATE TABLE IF NOT EXISTS market_favorites (product_id TEXT NOT NULL REFERENCES market_products(id),uid TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(product_id,uid));
CREATE TABLE IF NOT EXISTS market_reports (id TEXT PRIMARY KEY,product_id TEXT NOT NULL REFERENCES market_products(id),uid TEXT NOT NULL,reason TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'open',created_at INTEGER NOT NULL,UNIQUE(product_id,uid));
CREATE INDEX IF NOT EXISTS market_geo ON market_details(lat,lng);
